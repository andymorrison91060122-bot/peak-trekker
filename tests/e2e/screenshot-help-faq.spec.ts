import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

const OUTPUT_DIR = join(process.cwd(), 'output/p2-screenshot-help')
const SHEET_TOP_PATH = join(OUTPUT_DIR, 'screenshot-help-sheet-top-375.png')
const SHEET_BOTTOM_PATH = join(OUTPUT_DIR, 'screenshot-help-sheet-bottom-375.png')
const FAQ_FULL_PATH = join(OUTPUT_DIR, 'faq-screenshot-how-to-375.png')
const EVIDENCE_JSON = join(OUTPUT_DIR, 'screenshot-help-evidence.json')

type Box = { x: number; y: number; width: number; height: number }

type Evidence = {
  viewport: {
    windowInner: { width: number; height: number }
    documentClient: { width: number; height: number }
    png: { width: number; height: number }
    horizontalOverflow: boolean
  }
  requests: {
    auth: number
    recognize: number
    upload: number
    mutations: number
  }
  files: {
    helpSheetTop: { path: string; bytes: number; sha256: string }
    helpSheetBottom: { path: string; bytes: number; sha256: string }
    faq: { path: string; bytes: number; sha256: string }
  }
  helpSheet: {
    top: {
      sheet: Box | null
      content: Box | null
      image: Box | null
      footer: Box | null
      title: Box | null
    }
    bottom: {
      sheet: Box | null
      content: Box | null
      image: Box | null
      footer: Box | null
      title: Box | null
      imageComplete: boolean
      naturalWidth: number
      naturalHeight: number
      imageCenterDelta: number | null
      imageMarginDelta: number | null
      imageFooterGap: number | null
    }
  }
  faq: {
    sheet: Box | null
    question: Box | null
    image: Box | null
    png: { width: number; height: number }
    horizontalOverflow: boolean
  }
}

function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function boxOrNull(box: { x: number; y: number; width: number; height: number } | null): Box | null {
  return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null
}

function centerDelta(outer: Box, inner: Box) {
  return Math.abs(outer.x + outer.width / 2 - (inner.x + inner.width / 2))
}

function marginDelta(outer: Box, inner: Box) {
  const left = inner.x - outer.x
  const right = outer.x + outer.width - (inner.x + inner.width)
  return Math.abs(left - right)
}

async function installReadOnlyNetworkGuard(page: Page) {
  const counts = {
    auth: 0,
    recognize: 0,
    upload: 0,
    mutations: 0,
  }

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    const method = request.method()

    if (/\/api\/analytics\/event(?:\?|$)/.test(url)) {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    if (/\/api\/weather\//.test(url)) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weather unavailable in screenshot-help harness' }),
      })
      return
    }

    if (method === 'POST' && /\/auth\/v1\//.test(url)) {
      counts.auth += 1
      await route.abort()
      return
    }

    if (method === 'POST' && /\/api\/screenshot\/recognize(?:\?|$)/.test(url)) {
      counts.recognize += 1
      await route.abort()
      return
    }

    if (method === 'POST' && /\/api\/screenshot\/upload(?:\?|$)/.test(url)) {
      counts.upload += 1
      await route.abort()
      return
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      counts.mutations += 1
      await route.abort()
      return
    }

    await route.continue()
  })

  return counts
}

async function readPngSize(path: string) {
  const meta = await sharp(path).metadata()
  return { width: meta.width ?? 0, height: meta.height ?? 0 }
}

async function waitForImageReady(page: Page) {
  await expect.poll(async () =>
    page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('[data-testid="help-sheet"] img, main img[src="/images/screenshot-record-example.webp"]')
      return img
        ? {
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          }
        : null
    })
  ).toEqual({
    complete: true,
    naturalWidth: 447,
    naturalHeight: 737,
  })
}

async function collectViewportEvidence(page: Page) {
  return page.evaluate(() => ({
    windowInner: { width: window.innerWidth, height: window.innerHeight },
    documentClient: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
}

async function captureHelpSheetState(page: Page, screenshotPath: string, scrollToBottom = false) {
  const sheet = page.getByTestId('help-sheet')
  const content = page.getByTestId('help-sheet-content')
  const footer = page.getByTestId('help-sheet-footer')
  const title = sheet.locator('h2')
  const image = sheet.locator('img[alt="两步路活动记录详情页示例，包含轨迹、距离、用时、爬升和最高海拔"]')

  if (scrollToBottom) {
    await content.evaluate((node) => {
      const el = node as HTMLElement
      el.scrollTop = el.scrollHeight
    })
    await expect.poll(async () => content.evaluate((node) => {
      const el = node as HTMLElement
      return Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop)
    })).toBeLessThanOrEqual(1)
  }

  const [sheetBox, contentBox, imageBox, footerBox, titleBox] = await Promise.all([
    sheet.boundingBox(),
    content.boundingBox(),
    image.boundingBox(),
    footer.boundingBox(),
    title.boundingBox(),
  ])

  const imageMeta = imageBox
    ? await image.evaluate((node) => {
        const img = node as HTMLImageElement
        return {
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        }
      })
    : { complete: false, naturalWidth: 0, naturalHeight: 0 }

  await page.screenshot({ path: screenshotPath, fullPage: false })
  const png = await readPngSize(screenshotPath)

  return {
    sheet: boxOrNull(sheetBox),
    content: boxOrNull(contentBox),
    image: boxOrNull(imageBox),
    footer: boxOrNull(footerBox),
    title: boxOrNull(titleBox),
    imageComplete: imageMeta.complete,
    naturalWidth: imageMeta.naturalWidth,
    naturalHeight: imageMeta.naturalHeight,
    imageCenterDelta:
      contentBox && imageBox ? Number(centerDelta(contentBox, imageBox).toFixed(3)) : null,
    imageMarginDelta:
      contentBox && imageBox ? Number(marginDelta(contentBox, imageBox).toFixed(3)) : null,
    imageFooterGap:
      imageBox && footerBox ? Number(Math.max(0, footerBox.y - (imageBox.y + imageBox.height)).toFixed(3)) : null,
    png,
    file: {
      path: screenshotPath,
      bytes: statSync(screenshotPath).size,
      sha256: sha256(screenshotPath),
    },
  }
}

test('screenshot help sheet shares the example asset with FAQ and remains viewport-true', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000)
  ensureOutputDir()
  const counts = await installReadOnlyNetworkGuard(page)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${root}/screenshot`)
  const baselineBodyStyleOverflow = await page.evaluate(() => document.body.style.overflow)
  const baselineBodyComputedOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow)
  await expect(page.getByRole('button', { name: '如何获取截图？' })).toBeVisible()
  await page.getByRole('button', { name: '如何获取截图？' }).click()
  await expect(page.getByTestId('help-sheet-root')).toBeVisible()
  await expect(page.getByTestId('help-sheet')).toBeVisible()
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')

  await waitForImageReady(page)

  const top = await captureHelpSheetState(page, SHEET_TOP_PATH, false)

  await expect(page.getByTestId('help-sheet-content')).toBeVisible()
  await expect(page.getByTestId('help-sheet-footer')).toBeVisible()

  const bottom = await captureHelpSheetState(page, SHEET_BOTTOM_PATH, true)

  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await expect(page.getByTestId('help-sheet-scrim')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('help-sheet-root')).toBeHidden({ timeout: 20_000 })
  await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe(baselineBodyStyleOverflow)
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.body).overflow)).toBe(baselineBodyComputedOverflow)

  const viewport = await collectViewportEvidence(page)

  await page.goto(`${root}/faq?anchor=start.screenshot-how-to`)
  const faqQuestion = page.getByRole('button', { name: '如何获取可识别的截图？', exact: true })
  const faqImage = page.locator('img[alt="两步路活动记录详情页示例，包含轨迹、距离、用时、爬升和最高海拔"]')
  await expect(faqQuestion).toBeVisible()
  await expect(faqImage).toBeVisible()
  await waitForImageReady(page)
  await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe(baselineBodyStyleOverflow)
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.body).overflow)).toBe(baselineBodyComputedOverflow)
  const faqQuestionBox = await faqQuestion.boundingBox()
  const faqImageBox = await faqImage.boundingBox()
  const faqSheetBox = await page.locator('main').boundingBox()
  await page.screenshot({ path: FAQ_FULL_PATH, fullPage: true })
  const faqPng = await readPngSize(FAQ_FULL_PATH)

  const evidence: Evidence = {
    viewport: {
      windowInner: viewport.windowInner,
      documentClient: viewport.documentClient,
      png: top.png,
      horizontalOverflow: viewport.horizontalOverflow,
    },
    requests: counts,
    files: {
      helpSheetTop: top.file,
      helpSheetBottom: bottom.file,
      faq: {
        path: FAQ_FULL_PATH,
        bytes: statSync(FAQ_FULL_PATH).size,
        sha256: sha256(FAQ_FULL_PATH),
      },
    },
    helpSheet: {
      top,
      bottom,
    },
    faq: {
      sheet: boxOrNull(faqSheetBox),
      question: boxOrNull(faqQuestionBox),
      image: boxOrNull(faqImageBox),
      png: faqPng,
      horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    },
  }

  writeFileSync(EVIDENCE_JSON, `${JSON.stringify(evidence, null, 2)}\n`)

  expect(evidence.viewport.windowInner).toEqual({ width: 375, height: 812 })
  expect(evidence.viewport.documentClient).toEqual({ width: 375, height: 812 })
  expect(evidence.viewport.horizontalOverflow).toBe(false)
  expect(evidence.helpSheet.top.sheet).not.toBeNull()
  expect(evidence.helpSheet.bottom.sheet).not.toBeNull()
  expect(evidence.helpSheet.bottom.footer).not.toBeNull()
  expect(evidence.helpSheet.bottom.image).not.toBeNull()
  expect(evidence.helpSheet.bottom.imageComplete).toBe(true)
  expect(evidence.helpSheet.bottom.naturalWidth).toBe(447)
  expect(evidence.helpSheet.bottom.naturalHeight).toBe(737)
  expect(evidence.helpSheet.bottom.imageCenterDelta ?? 999).toBeLessThanOrEqual(1)
  expect(evidence.helpSheet.bottom.imageMarginDelta ?? 999).toBeLessThanOrEqual(1)
  expect(evidence.helpSheet.bottom.imageFooterGap ?? -1).toBeGreaterThanOrEqual(0)
  expect(evidence.helpSheet.bottom.sheet!.width).toBeLessThanOrEqual(375)
  expect(evidence.helpSheet.bottom.sheet!.height).toBeLessThanOrEqual(812)
  expect(evidence.faq.png.width).toBe(375)
  expect(evidence.faq.png.height).toBeGreaterThan(812)
  expect(evidence.faq.horizontalOverflow).toBe(false)
  expect(evidence.requests.auth).toBe(0)
  expect(evidence.requests.recognize).toBe(0)
  expect(evidence.requests.upload).toBe(0)
  expect(evidence.requests.mutations).toBe(0)
  expect(top.png).toEqual({ width: 375, height: 812 })
  expect(bottom.png).toEqual({ width: 375, height: 812 })
})
