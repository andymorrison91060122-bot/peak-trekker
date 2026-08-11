import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const OUTPUT_DIR = resolve('output/fu75-brand-acceptance')
mkdirSync(OUTPUT_DIR, { recursive: true })

async function prepareAnonymousPage(context: BrowserContext) {
  const page = await context.newPage()
  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  return page
}

async function prepareSettledMainPage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.localStorage.setItem('peak_trekker_province_draft', '云南')
  })
  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
}

async function mockScreenshotRecognition(page: Page) {
  await page.route('**/api/screenshot/recognize', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          quota: {
            monthKey: '2026-07',
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
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ocrSource: 'mimo_v25',
        ocrResult: {
          rawText: ['Keep', '户外路线', '10.32 公里', '02:16:08', '632 米'].join('\n'),
          textBlocks: [],
        },
        parsedFields: {
          location: { value: '户外路线', raw: 'Keep 户外路线' },
          distance: { value: 10.32, unit: 'km', raw: '10.32 公里' },
          duration: { value: 8168, raw: '02:16:08' },
          elevationGain: { value: 632, raw: '632 米' },
          date: { value: '2026-07-19', raw: '2026-07-19' },
        },
      }),
    })
  })
  await page.route('**/api/mountains/search**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ mountains: [] }),
  }))
}

test('FU-75 real anonymous onboarding keeps the colour lockup through all three slides', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 375, height: 812 } },
  })
  const page = await prepareAnonymousPage(context)
  const video = page.video()
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.goto(`${root}/explore`)
  const intro = page.getByTestId('onboarding-intro')
  await expect(intro).toBeVisible()
  await expect(intro.getByText('Peak Trekker', { exact: true })).toBeVisible()
  await expect(intro.getByText('真实记录与分享', { exact: true })).toBeVisible()
  await expect(intro.locator('header img[src*="derived-icon-96.png"]')).toHaveAttribute('width', '32')
  await page.screenshot({ path: join(OUTPUT_DIR, 'onboarding-slide-1-375.png') })

  await page.getByTestId('onboarding-intro-primary').click()
  await expect(page.getByTestId('onboarding-intro-screen-2')).toHaveAttribute('data-active', 'true')
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(OUTPUT_DIR, 'onboarding-slide-2-375.png') })

  await page.getByTestId('onboarding-intro-primary').click()
  await expect(page.getByTestId('onboarding-intro-screen-3')).toHaveAttribute('data-active', 'true')
  await expect(page.getByTestId('onboarding-intro-share-stack')).toBeVisible()
  await expect(page.getByText('分享图', { exact: true })).toBeVisible()
  await page.waitForTimeout(450)
  await page.screenshot({ path: join(OUTPUT_DIR, 'onboarding-slide-3-375.png') })

  await page.getByTestId('onboarding-intro-primary').click()
  await expect(intro).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('peak_trekker_intro_seen'))).toBe('2026-v2')

  await context.close()
  await video?.saveAs(join(OUTPUT_DIR, 'onboarding-three-slide-anonymous-375.webm'))
})

test('FU-75 anonymous onboarding skip remains a real first-visit action', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await prepareAnonymousPage(context)
  await page.goto(`${baseURL ?? 'http://127.0.0.1:3100'}/explore`)
  await expect(page.getByTestId('onboarding-intro')).toBeVisible()
  await page.getByRole('button', { name: '跳过' }).click()
  await expect(page.getByTestId('onboarding-intro')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('peak_trekker_intro_seen'))).toBe('2026-v2')
  await context.close()
})

test('FU-75 reduced-motion onboarding is terminal and keeps the colour lockup', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
  const page = await prepareAnonymousPage(context)
  await page.goto(`${baseURL ?? 'http://127.0.0.1:3100'}/explore`)
  const intro = page.getByTestId('onboarding-intro')
  await expect(intro).toBeVisible()
  await expect(intro).toHaveClass(/pt-intro-motion-off/)
  const motionState = await intro.evaluate((root) => {
    const activeVisual = root.querySelector<HTMLElement>('.pt-intro-visual.pt-is-active')
    const style = activeVisual ? getComputedStyle(activeVisual) : null
    return { animationName: style?.animationName, opacity: style?.opacity, transform: style?.transform }
  })
  expect(motionState).toEqual({ animationName: 'none', opacity: '1', transform: 'none' })
  await page.screenshot({ path: join(OUTPUT_DIR, 'onboarding-reduced-motion-375.png') })
  await context.close()
})

test('IA-001 shows the four product tabs in the configured order and keeps the active tab visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepareSettledMainPage(page)
  await page.goto('/explore')
  const expectedTabs = [
    { label: '探索', href: '/explore' },
    { label: '档案', href: '/archive' },
    { label: '海报', href: '/imprint' },
    { label: '我的', href: '/profile' },
  ]
  const tabLinks = page.locator('.pt-tab-link')

  await expect(tabLinks).toHaveCount(4)
  const initialTabs = await tabLinks.evaluateAll((links) => links.map((link) => ({
    label: link.textContent?.trim(),
    href: link.getAttribute('href'),
    hasIcon: Boolean(link.querySelector('.pt-tab-icon')),
  })))
  expect(initialTabs).toEqual(expectedTabs.map((tab) => ({ ...tab, hasIcon: true })))

  for (const [index, tab] of expectedTabs.entries()) {
    if (index > 0) await tabLinks.nth(index).click()
    await expect(page).toHaveURL(new RegExp(`${tab.href}(?:\\?.*)?$`))

    const activeState = await tabLinks.evaluateAll((links) => links.map((link) => {
      const label = link.querySelector<HTMLElement>(':scope > span:last-child')
      const icon = link.querySelector<HTMLElement>('.pt-tab-icon')
      return {
        href: link.getAttribute('href'),
        fontWeight: label ? getComputedStyle(label).fontWeight : '',
        iconWidth: icon?.getBoundingClientRect().width ?? 0,
        iconHeight: icon?.getBoundingClientRect().height ?? 0,
      }
    }))
    expect(activeState.map((item) => item.fontWeight === '700')).toEqual(expectedTabs.map((_, itemIndex) => itemIndex === index))
    expect(activeState[index]).toMatchObject({ href: tab.href, iconWidth: 30, iconHeight: 30 })
  }

  const geometry = await tabLinks.evaluateAll((links) => {
    const nav = links[0]?.closest('nav')
    const navBox = nav?.getBoundingClientRect()
    const linkBoxes = links.map((link) => {
      const box = link.getBoundingClientRect()
      const label = link.querySelector<HTMLElement>(':scope > span:last-child')?.getBoundingClientRect()
      return {
        left: box.left,
        right: box.right,
        textFits: link.scrollWidth <= link.clientWidth,
        labelBottom: label?.bottom ?? 0,
      }
    })
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      navBottom: navBox?.bottom ?? 0,
      minLabelBottomInset: Math.min(...linkBoxes.map((box) => (navBox?.bottom ?? 0) - box.labelBottom)),
      linkBoxes,
    }
  })
  expect(geometry.documentWidth).toBe(geometry.viewportWidth)
  expect(geometry.linkBoxes.every((box) => box.left >= 0 && box.right <= geometry.viewportWidth && box.textFits)).toBe(true)
  expect(geometry.minLabelBottomInset).toBeGreaterThanOrEqual(12)

  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((portal) => portal.remove()))
  const outputDir = resolve('output/ia-001')
  mkdirSync(outputDir, { recursive: true })
  await page.screenshot({ path: join(outputDir, 'bottom-nav-375.png'), fullPage: false })
})

test('FU-75 DB-free direct previews keep imprint and share fallback semantics', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))

  await page.goto('/imprint')
  const activeImprintCard = page.locator('[data-imprint-card][data-index="0"]')
  await expect(activeImprintCard).toBeVisible()
  await expect(activeImprintCard).toContainText('慕士塔格峰 · 新疆 · 2026.06.30')
  await expect(activeImprintCard.getByText('7546', { exact: true })).toBeVisible()
  await page.waitForTimeout(1400)
  await page.screenshot({ path: join(OUTPUT_DIR, 'imprint-muztagh-sample-375.png') })

  await page.goto('/share')
  const poster = page.getByTestId('share-main-poster-preview').first()
  await expect(poster).toBeVisible()
  await expect(poster).toContainText('玉山主峰 · 台湾 · 2026.04.28')
  await expect(poster).toContainText('3952m')
  await expect(poster).toContainText('1350m')
  await expect(poster.getByText('GPS VERIFIED', { exact: true })).toBeVisible()
  await page.waitForTimeout(1400)
  await page.screenshot({ path: join(OUTPUT_DIR, 'share-yushan-dom-preview-375.png') })
  await poster.screenshot({ path: join(OUTPUT_DIR, 'share-base-classic-dom-current.png') })

  await page.locator('[data-template-thumb="premium-vertical-story"]').click()
  await expect(poster).toHaveAttribute('data-current-template', 'premium-vertical-story')
  await expect(poster.getByText('Peak Trekker', { exact: true }).first()).toBeVisible()
  await expect(poster.getByText('GPS VERIFIED', { exact: true })).toBeVisible()
  await page.waitForTimeout(1400)
  await poster.screenshot({ path: join(OUTPUT_DIR, 'share-vertical-story-dom-current.png') })
})

test('FU-75 controlled Screenshot component keeps the no-line and drawn-line copy states separate', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await mockScreenshotRecognition(page)

  const fixture = await sharp({
    create: {
      width: 750,
      height: 1334,
      channels: 4,
      background: '#15191b',
    },
  })
    .composite([{
      input: Buffer.from('<svg width="750" height="1334" xmlns="http://www.w3.org/2000/svg"><path d="M130 1130 C 210 910 420 760 610 220" fill="none" stroke="#6ee7a1" stroke-width="18" stroke-linecap="round"/><text x="60" y="100" font-family="Arial" font-size="42" fill="#f5f7f6">10.32 km · 02:16:08 · 632 m</text></svg>'),
      left: 0,
      top: 0,
    }])
    .png()
    .toBuffer()

  await page.goto('/screenshot')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'fu75-controlled-route.png',
    mimeType: 'image/png',
    buffer: fixture,
  })

  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('为这条记录补上轨迹')).toBeVisible()
  await expect(page.getByText('沿截图中的路线点出关键位置，系统会辅助贴合线条。')).toBeVisible()
  await expect(page.getByRole('button', { name: '开始描绘', exact: true })).toBeVisible()
  await expect(page.getByText('点开截图，开始描绘轨迹')).toBeVisible()
  await expect(page.getByText('不描绘也可以生成活动，但这条记录不会包含轨迹。')).toBeVisible()
  await page.screenshot({ path: join(OUTPUT_DIR, 'screenshot-no-line-controlled-375.png') })

  await page.getByRole('button', { name: '开始描绘', exact: true }).click()
  const editor = page.locator('[data-route-calibration-editor="true"]')
  const canvas = page.locator('[data-route-editor-canvas="true"]')
  await expect(editor).toBeVisible()
  await expect(page.getByRole('dialog', { name: '描绘轨迹' })).toBeVisible()
  await expect(page.getByText('在截图中的路线起点点一下，再点终点。系统会辅助贴合线条，路线由你确认。')).toBeVisible()
  await expect(page.getByText('轻点起点与终点，系统会辅助贴合线条')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUTPUT_DIR, 'screenshot-editor-controlled-375.png') })

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width * 0.26, box!.y + box!.height * 0.78)
  await expect(canvas.locator('[data-route-control-point-index="0"]')).toBeVisible()
  await page.mouse.click(box!.x + box!.width * 0.72, box!.y + box!.height * 0.24)
  await expect(canvas.locator('[data-route-control-point-index="1"]')).toBeVisible()
  await expect(canvas.locator('[data-route-line="true"]').first()).toBeVisible()

  await page.getByRole('button', { name: '确认轨迹' }).click()
  await expect(editor).toHaveCount(0, { timeout: 5000 })
  await expect(page.getByText('轨迹已补上')).toBeVisible()
  await expect(page.getByText('检查线路，需要时继续补点或调整。')).toBeVisible()
  await expect(page.getByRole('button', { name: '继续调整', exact: true })).toBeVisible()
  await expect(page.getByText('查看并调整已描绘轨迹')).toBeVisible()
  await page.screenshot({ path: join(OUTPUT_DIR, 'screenshot-drawn-line-controlled-375.png') })
})

test('FU-75 focused production surfaces have classified console output and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepareSettledMainPage(page)
  const consoleEntries: Array<{ type: string; text: string; url: string }> = []
  const pageErrors: string[] = []
  const layouts: Array<{ path: string; scrollWidth: number; clientWidth: number; overflow: boolean }> = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleEntries.push({ type: message.type(), text: message.text(), url: message.location().url })
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  for (const path of ['/auth/login', '/auth/register', '/explore', '/imprint', '/share']) {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    layouts.push({ path, ...layout, overflow: layout.scrollWidth > layout.clientWidth })
  }

  writeFileSync(join(OUTPUT_DIR, 'browser-console-current.json'), JSON.stringify({
    evidenceType: 'focused production browser classification',
    consoleEntries,
    pageErrors,
  }, null, 2))
  writeFileSync(join(OUTPUT_DIR, 'layout-overflow-current.json'), JSON.stringify(layouts, null, 2))
  expect(pageErrors).toEqual([])
  expect(consoleEntries.filter((entry) => entry.type === 'error')).toEqual([])
  expect(layouts.filter((entry) => entry.overflow)).toEqual([])
})
