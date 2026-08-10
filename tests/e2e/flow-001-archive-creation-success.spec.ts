import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env.FLOW_001_BASE_URL ?? 'http://127.0.0.1:3100'
const OUTPUT_DIR = resolve('output/flow-001')
const SCREENSHOT_CHECKIN_ID = '11111111-1111-4111-8111-111111111111'
const IMPORT_CHECKIN_ID = '22222222-2222-4222-8222-222222222222'
const screenshotFixture = resolve('public/images/screenshot-record-example.webp')
const importFixture = resolve('tests/fixtures/import-dedupe/duplicate-track.gpx')

type SuccessEvidence = {
  flow: 'screenshot' | 'import'
  screenshot: string
  finalUrl: string
  geometry: {
    viewport: { width: number; height: number }
    documentWidth: number
    ctaGap: number
    bottomInset: number
    contentOverlapsCta: boolean
    root: { top: number; bottom: number; left: number; right: number }
    content: { top: number; bottom: number; left: number; right: number }
    cta: { top: number; bottom: number; left: number; right: number }
    share: { top: number; bottom: number; left: number; right: number }
    view: { top: number; bottom: number; left: number; right: number }
    routeSource: string | null
    routePathCount: number
  }
  unexpectedMutations: string[]
  analyticsIntercepts: number
  developmentOverlayCount: number
}

const evidence: SuccessEvidence[] = []

function quotaPayload() {
  return {
    monthKey: '2026-08',
    isFirstMonth: false,
    subscriptionTier: 'free',
    freeLimit: 2,
    freeUsed: 0,
    paidLimit: 0,
    paidUsed: 0,
    freeRemaining: 2,
    paidRemaining: 0,
    remaining: 2,
    totalLimit: 2,
  }
}

async function installControlledRoutes(page: Page) {
  const unexpectedMutations: string[] = []
  let analyticsIntercepts = 0
  const expectedMutations = new Set([
    'POST /api/screenshot/recognize',
    'POST /api/import/parse',
    'POST /api/import/confirm',
    'POST /api/analytics/event',
  ])

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== new URL(BASE_URL).origin) return
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return
    const key = `${request.method()} ${url.pathname}`
    if (!expectedMutations.has(key)) unexpectedMutations.push(key)
  })

  await page.route('**/api/analytics/**', async (route) => {
    analyticsIntercepts += 1
    await route.fulfill({ status: 204 })
  })
  await page.route('**/api/analytics', async (route) => {
    analyticsIntercepts += 1
    await route.fulfill({ status: 204 })
  })

  await page.route('**/api/screenshot/recognize**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, quota: quotaPayload() }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ocrSource: 'mimo_v25',
        quota: quotaPayload(),
        ocrResult: { rawText: '10.32 km\\n02:16:08\\n632m', textBlocks: [] },
        parsedFields: {
          distance: { value: 10.32, unit: 'km', raw: '10.32 km' },
          duration: { value: 8168, raw: '02:16:08' },
          elevationGain: { value: 632, raw: '632m' },
        },
      }),
    })
  })

  await page.route('**/api/import/parse', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        parsedData: {
          format: 'gpx',
          fileName: 'duplicate-track.gpx',
          name: '本地代表性 GPX',
          durationSeconds: 5400,
          distanceMeters: 12340,
          elevationGainMeters: 860,
          trackContentHash: 'a'.repeat(64),
          trackPoints: [
            { latitude: 30.2, longitude: 120.1, timestamp: '2026-08-01T00:00:00.000Z', elevation: 100 },
            { latitude: 30.207, longitude: 120.109, timestamp: '2026-08-01T00:20:00.000Z', elevation: 320 },
            { latitude: 30.213, longitude: 120.103, timestamp: '2026-08-01T00:45:00.000Z', elevation: 560 },
            { latitude: 30.219, longitude: 120.114, timestamp: '2026-08-01T01:10:00.000Z', elevation: 760 },
            { latitude: 30.224, longitude: 120.109, timestamp: '2026-08-01T01:30:00.000Z', elevation: 960 },
          ],
          suggestedMountain: null,
          suggestedCandidates: [],
        },
      }),
    })
  })

  await page.route('**/api/import/confirm', async (route) => {
    const body = route.request().postDataJSON() as { source?: string }
    const checkinId = body.source === 'screenshot_recognition' ? SCREENSHOT_CHECKIN_ID : IMPORT_CHECKIN_ID
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, checkinId, quota: quotaPayload() }),
    })
  })

  return {
    analyticsIntercepts: () => analyticsIntercepts,
    unexpectedMutations,
  }
}

async function removeNextDevelopmentOverlay(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay], [data-nextjs-dialog], [data-nextjs-dev-tools-button]').forEach((element) => {
      element.remove()
    })
  })
}

async function collectSuccessEvidence(page: Page, screenshotName: string, unexpectedMutations: string[]) {
  await expect(page.getByTestId('archive-creation-success')).toBeVisible()
  await page.waitForTimeout(1_500)
  await removeNextDevelopmentOverlay(page)
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="archive-creation-success"]')
    const content = document.querySelector('[data-archive-creation-content]')
    const cta = document.querySelector('[data-archive-creation-cta]')
    const share = document.querySelector('[data-archive-creation-action="share"]')
    const view = document.querySelector('[data-archive-creation-action="view"]')
    const medallion = document.querySelector('[data-archive-creation-medallion]')
    if (!root || !content || !cta || !share || !view || !medallion) throw new Error('archive success geometry targets are missing')

    const rectOf = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
    }
    const contentRect = content.getBoundingClientRect()
    const ctaRect = cta.getBoundingClientRect()
    const shareRect = share.getBoundingClientRect()
    const viewRect = view.getBoundingClientRect()
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      ctaGap: viewRect.top - shareRect.bottom,
      bottomInset: window.innerHeight - viewRect.bottom,
      contentOverlapsCta: contentRect.bottom > ctaRect.top,
      developmentOverlayCount: document.querySelectorAll('nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay], [data-nextjs-dialog], [data-nextjs-dev-tools-button]').length,
      root: rectOf(root),
      content: rectOf(content),
      cta: rectOf(cta),
      share: rectOf(share),
      view: rectOf(view),
      routeSource: medallion.getAttribute('data-archive-creation-route-source'),
      routePathCount: medallion.querySelectorAll('path[d]').length,
    }
  })

  expect(geometry.viewport.width).toBe(375)
  expect(geometry.documentWidth).toBe(375)
  expect(geometry.ctaGap).toBeGreaterThanOrEqual(12)
  expect(geometry.bottomInset).toBeGreaterThanOrEqual(24)
  expect(geometry.contentOverlapsCta).toBe(false)
  expect(geometry.developmentOverlayCount).toBe(0)

  const screenshot = resolve(OUTPUT_DIR, screenshotName)
  await page.screenshot({ path: screenshot, fullPage: false })
  return { geometry, screenshot, unexpectedMutations: [...new Set(unexpectedMutations)] }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test.afterAll(async () => {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(resolve(OUTPUT_DIR, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
})

test('screenshot recognition renders the shared success surface and shares the current archive', async ({ page }) => {
  test.setTimeout(45_000)
  const controlledRoutes = await installControlledRoutes(page)

  await page.goto(`${BASE_URL}/screenshot`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '选择照片' })).toBeVisible()
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles(screenshotFixture)
  await expect(page.getByRole('button', { name: '确认并生成活动' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '确认并生成活动' }).click()

  const captured = await collectSuccessEvidence(page, 'screenshot-success-375.png', controlledRoutes.unexpectedMutations)
  await page.getByRole('button', { name: '去分享' }).click()
  await expect(page).toHaveURL(new RegExp(`/share\\?checkinId=${SCREENSHOT_CHECKIN_ID}`))
  expect(captured.unexpectedMutations).toEqual([])
  evidence.push({
    flow: 'screenshot',
    screenshot: captured.screenshot,
    finalUrl: page.url(),
    geometry: captured.geometry,
    unexpectedMutations: captured.unexpectedMutations,
    analyticsIntercepts: controlledRoutes.analyticsIntercepts(),
    developmentOverlayCount: captured.geometry.developmentOverlayCount,
  })
})

test('track import renders the shared success surface and views the current archive', async ({ page }) => {
  test.setTimeout(45_000)
  const controlledRoutes = await installControlledRoutes(page)

  await page.goto(`${BASE_URL}/import`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '上传轨迹文件' }).click()
  await page.locator('input[aria-label="轨迹文件"]').setInputFiles(importFixture)
  await expect(page.getByRole('button', { name: '开始解析' })).toBeVisible()
  await page.getByRole('button', { name: '开始解析' }).click()
  await expect(page.getByText('解析完成')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '继续' }).click()
  await page.getByRole('button', { name: '保存为未关联山行' }).click()

  const captured = await collectSuccessEvidence(page, 'import-success-375.png', controlledRoutes.unexpectedMutations)
  expect(captured.geometry.routeSource).toBe('import')
  expect(captured.geometry.routePathCount).toBeGreaterThan(0)
  await page.getByRole('button', { name: '查看档案' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${IMPORT_CHECKIN_ID}`))
  expect(captured.unexpectedMutations).toEqual([])
  evidence.push({
    flow: 'import',
    screenshot: captured.screenshot,
    finalUrl: page.url(),
    geometry: captured.geometry,
    unexpectedMutations: captured.unexpectedMutations,
    analyticsIntercepts: controlledRoutes.analyticsIntercepts(),
    developmentOverlayCount: captured.geometry.developmentOverlayCount,
  })
})
