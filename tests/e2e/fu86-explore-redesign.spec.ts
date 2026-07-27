import { expect, test, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTestEmail, registerFreshUser } from './community.helpers'

const OUTPUT_DIR = join(process.cwd(), 'output/fu86-explore-acceptance')
const VIDEO_DIR = join(OUTPUT_DIR, 'videos')
const STORAGE_STATE = join(OUTPUT_DIR, 'fu86-storage-state.json')
const ROUND1_DIR = join(OUTPUT_DIR, 'acceptance-round-1')
const ROUND1_VIDEO_DIR = join(ROUND1_DIR, 'videos')
const ROUND1_STORAGE_STATE = join(ROUND1_DIR, 'fu86-round1-storage-state.json')
const ROUND3_DIR = join(OUTPUT_DIR, 'acceptance-round-3')
const ROUND3_VIDEO_DIR = join(ROUND3_DIR, 'videos')

type ReplayReasonLog = {
  queuedReasons: Array<'geo' | 'tag' | 'advancedFilter' | 'search'>
  firedReplayReasons: Array<'geo' | 'tag' | 'advancedFilter' | 'search'>
}

type ConsoleEntry = {
  type: string
  text: string
  location: ReturnType<ConsoleMessage['location']>
}

async function prepareContext(context: BrowserContext) {
  await context.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await context.addInitScript(() => {
    localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    localStorage.setItem('peak_trekker_province_draft', '青海')

    const state = window as Window & {
      __fu86Cls?: number
      __fu86MountTrace?: Array<{
        atMs: number
        opacity: number
        transform: string
        iconDashOffset: string | null
      }>
    }
    state.__fu86Cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }
        if (!shift.hadRecentInput) state.__fu86Cls = (state.__fu86Cls ?? 0) + (shift.value ?? 0)
      }
    }).observe({ type: 'layout-shift', buffered: true })

    let tracing = false
    const startTrace = () => {
      if (tracing) return
      const panel = document.querySelector<HTMLElement>('[data-explore-motion="pathways"]')
      if (!panel) return
      tracing = true
      const startedAt = performance.now()
      state.__fu86MountTrace = []
      const sample = () => {
        const style = getComputedStyle(panel)
        const iconPath = document.querySelector<SVGPathElement>('[data-explore-pathway-icon-path]')
        state.__fu86MountTrace?.push({
          atMs: Math.round(performance.now() - startedAt),
          opacity: Number.parseFloat(style.opacity || '1'),
          transform: style.transform,
          iconDashOffset: iconPath ? getComputedStyle(iconPath).strokeDashoffset : null,
        })
        if (performance.now() - startedAt < 950) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }
    const observeForPanel = () => {
      const root = document.documentElement
      if (!root) return
      new MutationObserver(startTrace).observe(root, { childList: true, subtree: true })
      startTrace()
    }
    if (document.documentElement) observeForPanel()
    else window.addEventListener('DOMContentLoaded', observeForPanel, { once: true })
  })
}

function attachRuntimeCapture(page: Page, consoleEntries: ConsoleEntry[], pageErrors: string[]) {
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleEntries.push({ type: message.type(), text: message.text(), location: message.location() })
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
}

function analyzeOpacityTrace(trace: Array<{ opacity: number }>) {
  let rises = 0
  let wasHigh = false
  let dipAfterHigh = false
  let previousHigh = false
  for (const sample of trace) {
    const high = sample.opacity >= 0.85
    if (high && !previousHigh) rises += 1
    if (wasHigh && sample.opacity <= 0.2) dipAfterHigh = true
    if (high) wasHigh = true
    previousHigh = high
  }
  return { rises, dipAfterHigh }
}

async function readPressState(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const target = element as HTMLElement
    const style = getComputedStyle(target)
    const matrix = style.transform === 'none' ? null : new DOMMatrix(style.transform)
    const prompt = target.querySelector<HTMLElement>('.explore-scene-panel__prompt')
    return {
      active: target.dataset.ptPressActive === 'true',
      transform: style.transform,
      scaleX: matrix?.a ?? 1,
      filter: style.filter,
      promptOpacity: prompt ? getComputedStyle(prompt).opacity : null,
    }
  })
}

async function collectCards(page: Page) {
  return page.locator('[data-testid="explore-mountain-card"]').evaluateAll((cards) => cards.map((card) => ({
    href: card.getAttribute('href'),
    difficulty: card.getAttribute('data-difficulty'),
    altitude: Number(card.getAttribute('data-altitude')),
    filterLengthKm: card.getAttribute('data-length-km') === null
      ? null
      : Number(card.getAttribute('data-length-km')),
    metricsVisible: Boolean(card.querySelector('[data-testid="explore-mountain-card-metrics"]')),
    heroBackground: getComputedStyle(card.querySelector<HTMLElement>('[data-testid="explore-mountain-card-cover"]')!).backgroundImage,
  })))
}

async function waitForExploreListTerminal(page: Page) {
  await expect(page.locator('.explore-scene-panel')).toHaveAttribute(
    'data-explore-mount-state',
    'settled',
    { timeout: 20_000 },
  )
  await expect.poll(async () => {
    const cards = await page.locator('[data-testid="explore-mountain-card"]').count()
    const emptyVisible = await page.locator('[data-explore-list-empty]:visible').count()
    return cards > 0 || emptyVisible > 0
  }).toBe(true)
}

async function clickChipAndCollect(page: Page, label: '附近' | '入门线' | '进阶线' | '5000m+') {
  const button = page.getByRole('button', { name: label, exact: true })
  await button.click()
  const immediate = await page.locator('[data-testid="explore-mountain-card"]').first().evaluate((card) => {
    const style = getComputedStyle(card)
    return { opacity: Number(style.opacity), transform: style.transform }
  }).catch(() => null)
  await page.waitForTimeout(120)
  const mid = await page.locator('[data-testid="explore-mountain-card"]').first().evaluate((card) => {
    const style = getComputedStyle(card)
    return { opacity: Number(style.opacity), transform: style.transform }
  }).catch(() => null)
  await page.waitForTimeout(600)
  const final = await page.locator('[data-testid="explore-mountain-card"]').first().evaluate((card) => {
    const style = getComputedStyle(card)
    return { opacity: Number(style.opacity), transform: style.transform }
  }).catch(() => null)
  return { label, immediate, mid, final, cards: await collectCards(page) }
}

test('FU-86 Explore V2 Scene Panel focused production evidence', async ({ browser, page, baseURL }) => {
  test.setTimeout(300_000)
  if (!baseURL) throw new Error('FU-86 requires Playwright baseURL.')
  await mkdir(OUTPUT_DIR, { recursive: true })
  await mkdir(VIDEO_DIR, { recursive: true })

  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await registerFreshUser(page, baseURL, {
    returnTo: '/explore',
    email: createTestEmail('fu86'),
    username: `fu86-${Date.now()}`,
    province: '青海',
  })
  await page.context().storageState({ path: STORAGE_STATE })

  const normalContext = await browser.newContext({
    baseURL,
    storageState: STORAGE_STATE,
    viewport: { width: 375, height: 812 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 375, height: 812 } },
    reducedMotion: 'no-preference',
    geolocation: { latitude: 29.645, longitude: 91.117 },
    permissions: ['geolocation'],
  })
  await prepareContext(normalContext)
  const normalPage = await normalContext.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: string[] = []
  attachRuntimeCapture(normalPage, consoleEntries, pageErrors)

  await normalPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  const panel = normalPage.locator('.explore-scene-panel')
  const importButton = normalPage.locator('[data-explore-pathway-button="导入记录"]')
  const screenshotButton = normalPage.locator('[data-explore-pathway-button="识别截图"]')
  await expect(panel).toBeVisible()
  await expect(importButton).toHaveAttribute('aria-label', '导入记录')
  await expect(screenshotButton).toHaveAttribute('aria-label', '识别截图')
  await expect(normalPage.locator('h1')).toHaveCount(0)
  await expect(normalPage.getByRole('button', { name: '附近', exact: true })).toBeVisible()
  await normalPage.waitForTimeout(1_050)
  const initialStreamCls = await normalPage.evaluate(() => {
    const state = window as Window & { __fu86Cls?: number }
    const value = state.__fu86Cls ?? 0
    state.__fu86Cls = 0
    return value
  })
  await normalPage.waitForTimeout(500)

  const normalLayout = await normalPage.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.explore-scene-panel')
    const actions = [...document.querySelectorAll<HTMLElement>('.explore-scene-panel__action')]
    const video = document.querySelector<HTMLVideoElement>('.explore-scene-panel__video')
    const state = window as Window & { __fu86Cls?: number; __fu86MountTrace?: unknown[] }
    return {
      panelBox: panel?.getBoundingClientRect().toJSON() ?? null,
      actionHeights: actions.map((action) => action.getBoundingClientRect().height),
      videoState: video?.dataset.exploreVideoState ?? null,
      videoPaused: video?.paused ?? null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stableWindowCls: state.__fu86Cls ?? 0,
      mountTrace: state.__fu86MountTrace ?? [],
    }
  })
  expect(normalLayout.panelBox?.height).toBeCloseTo(172, 0)
  expect(normalLayout.actionHeights).toEqual([48, 48])
  expect(normalLayout.horizontalOverflow).toBeLessThanOrEqual(1)
  expect(normalLayout.stableWindowCls).toBeLessThan(0.1)
  expect(normalLayout.videoState).toBe('playing')
  const mountOpacities = (normalLayout.mountTrace as Array<{ opacity: number }>).map((sample) => sample.opacity)
  const firstSettledMountSample = mountOpacities.findIndex((opacity) => opacity >= 0.85)
  expect(mountOpacities[0]).toBeLessThanOrEqual(0.05)
  expect(firstSettledMountSample).toBeGreaterThanOrEqual(0)
  expect(mountOpacities.slice(firstSettledMountSample).every((opacity) => opacity >= 0.85)).toBe(true)

  await normalPage.setViewportSize({ width: 375, height: 770 })
  const implementation770 = join(OUTPUT_DIR, 'explore-v2-implementation-375x770.png')
  const moduleScreenshot = join(OUTPUT_DIR, 'explore-v2-module-375.png')
  const cardScreenshot = join(OUTPUT_DIR, 'explore-v2-mountain-card-375.png')
  await normalPage.screenshot({ path: implementation770 })
  await panel.screenshot({ path: moduleScreenshot })
  await normalPage.locator('[data-testid="explore-mountain-card"]').first().screenshot({ path: cardScreenshot })
  await normalPage.setViewportSize({ width: 375, height: 812 })
  const implementation812 = join(OUTPUT_DIR, 'explore-v2-implementation-375x812.png')
  await normalPage.screenshot({ path: implementation812 })

  const productionCards = await collectCards(normalPage)
  expect(productionCards.length).toBeGreaterThan(0)
  expect(productionCards.every((card) => card.metricsVisible === false)).toBe(true)
  await expect.poll(() => normalPage.locator('[data-testid="explore-mountain-card-cover"]').evaluateAll((covers) => (
    covers.every((cover) => (
      !cover.querySelector('img')
      && getComputedStyle(cover).backgroundImage.includes('default-mountain-cover.png')
    ))
  ))).toBe(true)

  const chipEvidence = []
  for (const label of ['入门线', '进阶线', '5000m+', '附近'] as const) {
    const evidence = await clickChipAndCollect(normalPage, label)
    expect(evidence.cards.length).toBeGreaterThan(0)
    if (label === '入门线') expect(evidence.cards.every((card) => card.difficulty === 'beginner')).toBe(true)
    if (label === '进阶线') expect(evidence.cards.every((card) => card.difficulty !== 'beginner')).toBe(true)
    if (label === '5000m+') expect(evidence.cards.every((card) => card.altitude >= 5000)).toBe(true)
    chipEvidence.push(evidence)
  }

  const reasonLogBeforeProvince = await normalPage.evaluate(() => {
    const win = window as Window & { __fu110ExploreReplayReasons?: ReplayReasonLog }
    return structuredClone(win.__fu110ExploreReplayReasons ?? { queuedReasons: [], firedReplayReasons: [] })
  })
  const provinceOpacityTrace = await normalPage.evaluate(async () => {
    localStorage.setItem('peak_trekker_province_draft', '四川')
    window.dispatchEvent(new StorageEvent('storage', { key: 'peak_trekker_province_draft', newValue: '四川' }))
    window.dispatchEvent(new CustomEvent('peak-trekker:onboarding-update'))
    const trace: number[] = []
    const startedAt = performance.now()
    while (performance.now() - startedAt < 700) {
      const card = document.querySelector<HTMLElement>('[data-testid="explore-mountain-card"]')
      if (card) trace.push(Number.parseFloat(getComputedStyle(card).opacity || '1'))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    return trace
  })
  const reasonLogAfterProvince = await normalPage.evaluate(() => {
    const win = window as Window & { __fu110ExploreReplayReasons?: ReplayReasonLog }
    return structuredClone(win.__fu110ExploreReplayReasons ?? { queuedReasons: [], firedReplayReasons: [] })
  })
  expect(reasonLogAfterProvince).toEqual(reasonLogBeforeProvince)
  expect(provinceOpacityTrace.every((opacity) => opacity >= 0.99)).toBe(true)

  await importButton.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await normalPage.waitForTimeout(220)
  const pointerPressed = await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')
  const pointerScreenshot = join(OUTPUT_DIR, 'explore-v2-import-pointer-pressed-375.png')
  await normalPage.screenshot({ path: pointerScreenshot })
  await importButton.dispatchEvent('pointerup', { pointerType: 'touch', bubbles: true })
  await expect.poll(async () => (await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')).scaleX).toBeCloseTo(1, 2)
  const pointerReleased = await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')
  expect(pointerPressed.active).toBe(true)
  expect(pointerPressed.scaleX).toBeCloseTo(0.975, 2)
  expect(pointerPressed.promptOpacity).toBe('1')
  expect(pointerReleased.active).toBe(false)

  await screenshotButton.focus()
  await screenshotButton.dispatchEvent('keydown', { key: ' ', code: 'Space', bubbles: true })
  await normalPage.waitForTimeout(220)
  const keyboardPressed = await readPressState(normalPage, '[data-explore-pathway-button="识别截图"]')
  const keyboardScreenshot = join(OUTPUT_DIR, 'explore-v2-screenshot-keyboard-pressed-375.png')
  await normalPage.screenshot({ path: keyboardScreenshot })
  await screenshotButton.dispatchEvent('keyup', { key: ' ', code: 'Space', bubbles: true })
  await expect.poll(async () => (await readPressState(normalPage, '[data-explore-pathway-button="识别截图"]')).scaleX).toBeCloseTo(1, 2)
  const keyboardReleased = await readPressState(normalPage, '[data-explore-pathway-button="识别截图"]')
  expect(keyboardPressed.active).toBe(true)
  expect(keyboardPressed.scaleX).toBeCloseTo(0.975, 2)
  expect(keyboardPressed.promptOpacity).toBe('1')
  expect(keyboardReleased.active).toBe(false)

  await importButton.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await importButton.dispatchEvent('pointercancel', { pointerType: 'touch', bubbles: true })
  expect((await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')).active).toBe(false)
  await expect.poll(async () => (await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')).scaleX).toBeCloseTo(1, 2)
  const leaveBox = await importButton.boundingBox()
  if (!leaveBox) throw new Error('Import button has no bounding box for slide-out evidence.')
  await normalPage.mouse.move(leaveBox.x + leaveBox.width / 2, leaveBox.y + leaveBox.height / 2)
  await normalPage.mouse.down()
  await normalPage.mouse.move(leaveBox.x + leaveBox.width + 24, leaveBox.y + leaveBox.height + 24)
  expect((await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')).active).toBe(false)
  await expect.poll(async () => (await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')).scaleX).toBeCloseTo(1, 2)
  await normalPage.mouse.up()
  await importButton.focus()
  await importButton.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await importButton.evaluate((element) => (element as HTMLElement).blur())
  expect((await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')).active).toBe(false)
  await expect.poll(async () => (await readPressState(normalPage, '[data-explore-pathway-button="导入记录"]')).scaleX).toBeCloseTo(1, 2)

  await importButton.click()
  await expect(normalPage).toHaveURL(/\/import/)
  await normalPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await normalPage.locator('[data-explore-pathway-button="识别截图"]').click()
  await expect(normalPage).toHaveURL(/\/screenshot/)
  const realNavigation = { import: true, screenshot: true }

  const normalVideo = normalPage.video()
  await normalContext.close()
  const normalVideoPath = join(OUTPUT_DIR, 'explore-v2-interactions-375.webm')
  if (!normalVideo) throw new Error('FU-86 normal context did not record video.')
  await copyFile(await normalVideo.path(), normalVideoPath)

  const reducedContext = await browser.newContext({
    baseURL,
    storageState: STORAGE_STATE,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
  })
  await prepareContext(reducedContext)
  await reducedContext.addInitScript(() => {
    const win = window as Window & { __fu86PlayCalls?: number }
    win.__fu86PlayCalls = 0
    const originalPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) {
      win.__fu86PlayCalls = (win.__fu86PlayCalls ?? 0) + 1
      return originalPlay.apply(this, args as [])
    }
  })
  const reducedPage = await reducedContext.newPage()
  await reducedPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await reducedPage.locator('.explore-scene-panel').waitFor({ state: 'visible' })
  await waitForExploreListTerminal(reducedPage)
  const reducedContentState = await reducedPage.evaluate(() => {
    const target = document.querySelector<HTMLElement>('[data-testid="explore-mountain-card"], [data-explore-list-empty]')
    if (!target) return null
    const style = getComputedStyle(target)
    return { opacity: style.opacity, visibility: style.visibility, transform: style.transform }
  })
  const reducedButton = reducedPage.locator('[data-explore-pathway-button="导入记录"]')
  await reducedButton.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  const reducedPressed = await readPressState(reducedPage, '[data-explore-pathway-button="导入记录"]')
  const reducedState = await reducedPage.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>('.explore-scene-panel__video')
    const win = window as Window & { __fu86PlayCalls?: number }
    return {
      videoState: video?.dataset.exploreVideoState ?? null,
      videoPaused: video?.paused ?? null,
      playCalls: win.__fu86PlayCalls ?? 0,
    }
  })
  const reducedScreenshot = join(OUTPUT_DIR, 'explore-v2-reduced-motion-pressed-375.png')
  await reducedPage.screenshot({ path: reducedScreenshot })
  expect(reducedPressed.transform).toBe('none')
  expect(reducedContentState).toEqual({ opacity: '1', visibility: 'visible', transform: 'none' })
  expect(reducedState.videoState).toBe('poster')
  expect(reducedState.videoPaused).toBe(true)
  expect(reducedState.playCalls).toBe(0)
  await reducedContext.close()

  const rejectedContext = await browser.newContext({
    baseURL,
    storageState: STORAGE_STATE,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'no-preference',
  })
  await prepareContext(rejectedContext)
  await rejectedContext.addInitScript(() => {
    const win = window as Window & { __fu86PlayCalls?: number }
    win.__fu86PlayCalls = 0
    HTMLMediaElement.prototype.play = function () {
      win.__fu86PlayCalls = (win.__fu86PlayCalls ?? 0) + 1
      return Promise.reject(new DOMException('Controlled autoplay rejection', 'NotAllowedError'))
    }
  })
  const rejectedPage = await rejectedContext.newPage()
  const rejectedErrors: string[] = []
  rejectedPage.on('pageerror', (error) => rejectedErrors.push(error.message))
  await rejectedPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await rejectedPage.locator('.explore-scene-panel').waitFor({ state: 'visible' })
  await rejectedPage.waitForFunction(() => (window as Window & { __fu86PlayCalls?: number }).__fu86PlayCalls === 1)
  await rejectedPage.mouse.click(8, 8)
  await rejectedPage.waitForFunction(() => (window as Window & { __fu86PlayCalls?: number }).__fu86PlayCalls === 2)
  await rejectedPage.keyboard.press('Tab')
  await rejectedPage.mouse.click(9, 9)
  await rejectedPage.waitForTimeout(200)
  const rejectedState = await rejectedPage.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>('.explore-scene-panel__video')
    const win = window as Window & { __fu86PlayCalls?: number }
    return {
      playCalls: win.__fu86PlayCalls ?? 0,
      videoState: video?.dataset.exploreVideoState ?? null,
      paused: video?.paused ?? null,
    }
  })
  const rejectedScreenshot = join(OUTPUT_DIR, 'explore-v2-controlled-autoplay-rejection-375.png')
  await rejectedPage.screenshot({ path: rejectedScreenshot })
  expect(rejectedState.playCalls).toBe(2)
  expect(rejectedState.videoState).toBe('poster')
  expect(rejectedState.paused).toBe(true)
  expect(rejectedErrors).toEqual([])
  await rejectedContext.close()

  expect(consoleEntries.filter((entry) => entry.type === 'error')).toEqual([])
  expect(pageErrors).toEqual([])
  const summary = {
    evidenceBoundary: {
      designSource: 'real Claude Design MCP render_preview screenshots saved before implementation',
      navigation: 'real authenticated client navigation to /import and /screenshot',
      mountainData: 'real local production server data; no mountain response interception',
      geolocation: 'controlled Playwright coordinate',
      autoplayRejection: 'controlled by overriding HTMLMediaElement.play in an isolated browser context',
    },
    approvedTechnicalDeviation: 'The video omits SSR autoPlay and calls play() only after a client-side no-preference check so reduced-motion starts on the poster.',
    normalLayout: {
      ...normalLayout,
      initialStreamCls,
      clsInterpretation: 'initialStreamCls records the streamed first-card insertion; stableWindowCls is the post-attachment interaction/layout gate',
    },
    productionCards,
    chipEvidence,
    provinceOnly: { reasonLogBeforeProvince, reasonLogAfterProvince, opacityTrace: provinceOpacityTrace },
    press: { pointerPressed, pointerReleased, keyboardPressed, keyboardReleased },
    realNavigation,
    reducedState,
    rejectedState,
    console: consoleEntries,
    pageErrors,
    artifacts: {
      implementation770,
      implementation812,
      moduleScreenshot,
      cardScreenshot,
      pointerScreenshot,
      keyboardScreenshot,
      reducedScreenshot,
      rejectedScreenshot,
      normalVideoPath,
    },
  }
  await writeFile(join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  await writeFile(join(OUTPUT_DIR, 'interaction-steps.json'), JSON.stringify([
    { step: 'open explore scene panel', result: 'pass' },
    { step: 'switch all four chips and validate predicates', result: 'pass' },
    { step: 'pointer and keyboard held press', result: 'pass' },
    { step: 'navigate to import', result: 'pass' },
    { step: 'navigate to screenshot', result: 'pass' },
    { step: 'reduced-motion poster', result: 'pass' },
    { step: 'controlled autoplay rejection and one retry', result: 'pass' },
  ], null, 2))
})

test('FU-86 acceptance round 1 search recovery and environment diagnosis', async ({ browser, page, baseURL }) => {
  test.setTimeout(300_000)
  if (!baseURL) throw new Error('FU-86 acceptance round 1 requires Playwright baseURL.')
  await mkdir(ROUND1_DIR, { recursive: true })
  await mkdir(ROUND1_VIDEO_DIR, { recursive: true })

  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await registerFreshUser(page, baseURL, {
    returnTo: '/explore',
    email: createTestEmail('fu86-r1'),
    username: `fu86-r1-${Date.now()}`,
    province: '青海',
  })
  await page.context().storageState({ path: ROUND1_STORAGE_STATE })

  const context = await browser.newContext({
    baseURL,
    storageState: ROUND1_STORAGE_STATE,
    viewport: { width: 375, height: 812 },
    recordVideo: { dir: ROUND1_VIDEO_DIR, size: { width: 375, height: 812 } },
    reducedMotion: 'no-preference',
  })
  await prepareContext(context)
  const explorePage = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: string[] = []
  attachRuntimeCapture(explorePage, consoleEntries, pageErrors)

  await explorePage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(explorePage)
  const defaultCardCount = await explorePage.locator('[data-testid="explore-mountain-card"]').count()
  expect(defaultCardCount).toBeGreaterThan(0)
  const typography = await explorePage.evaluate(() => {
    const sceneTitle = document.querySelector<HTMLElement>('.explore-scene-panel__eyebrow')
    const sceneBody = document.querySelector<HTMLElement>('.explore-scene-panel__subtitle')
    const listCopy = document.querySelector<HTMLElement>('#mountain-list-heading')
    const listTitle = listCopy?.querySelector<HTMLElement>('span:first-child')
    const listBody = listCopy?.querySelector<HTMLElement>('span:last-child')
    const read = (target: HTMLElement | null | undefined) => target ? {
      fontSize: getComputedStyle(target).fontSize,
      lineHeight: getComputedStyle(target).lineHeight,
      fontWeight: getComputedStyle(target).fontWeight,
      color: getComputedStyle(target).color,
    } : null
    return { sceneTitle: read(sceneTitle), sceneBody: read(sceneBody), listTitle: read(listTitle), listBody: read(listBody) }
  })
  expect(typography.sceneTitle?.fontSize).toBe(typography.listTitle?.fontSize)
  expect(typography.sceneTitle?.lineHeight).toBe(typography.listTitle?.lineHeight)
  expect(typography.sceneTitle?.fontWeight).toBe('600')
  expect(typography.sceneBody).toEqual(typography.listBody)

  const defaultScreenshot = join(ROUND1_DIR, 'default-list-375.png')
  await explorePage.screenshot({ path: defaultScreenshot })

  const searchInput = explorePage.locator('.explore-search-input')
  await searchInput.fill('尕朵觉沃-不存在')
  const searchEmpty = explorePage.locator('[data-explore-empty-kind="search"]')
  await expect(searchEmpty).toBeVisible()
  await expect(searchEmpty.getByText('没找到这座山', { exact: true })).toBeVisible()
  await expect(searchEmpty.getByRole('button', { name: '导入轨迹记录', exact: true })).toBeVisible()
  await expect(searchEmpty.getByRole('button', { name: '识别成绩截图', exact: true })).toBeVisible()
  await expect(searchEmpty.getByRole('button', { name: '继续搜索', exact: true })).toHaveCount(0)
  const richEmptyScreenshot = join(ROUND1_DIR, 'search-empty-rich-375.png')
  await explorePage.screenshot({ path: richEmptyScreenshot })

  await searchInput.fill('')
  await expect(searchInput).toHaveValue('')
  await waitForExploreListTerminal(explorePage)

  await searchInput.fill('尕朵觉沃-不存在')
  await searchEmpty.getByRole('button', { name: '导入轨迹记录', exact: true }).click()
  await expect(explorePage).toHaveURL(/\/import(?:\?|$)/)
  const importNavigationUrl = explorePage.url()

  await explorePage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(explorePage)
  await explorePage.locator('.explore-search-input').fill('尕朵觉沃-不存在')
  await explorePage.locator('[data-explore-empty-kind="search"]').getByRole('button', { name: '识别成绩截图', exact: true }).click()
  await expect(explorePage).toHaveURL(/\/screenshot(?:\?|$)/)
  const screenshotNavigationUrl = explorePage.url()

  await explorePage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(explorePage)
  await explorePage.locator('.explore-search-input').fill('尕朵觉沃-不存在')
  await expect(explorePage.getByRole('button', { name: '提交一座山的资料', exact: true })).toBeVisible()
  const submitEntryScreenshot = join(ROUND1_DIR, 'search-empty-submit-entry-375.png')
  await explorePage.screenshot({ path: submitEntryScreenshot })

  await explorePage.locator('.explore-search-input').fill('')
  await explorePage.getByRole('button', { name: '5000m+', exact: true }).click()
  await explorePage.getByRole('button', { name: '展开高级筛选' }).click()
  await explorePage.getByRole('button', { name: '入门线', exact: true }).last().click()
  const filterEmpty = explorePage.locator('[data-explore-empty-kind="filter"]')
  await expect(filterEmpty).toBeVisible()
  await expect(filterEmpty.getByText('没有找到匹配的山峰', { exact: true })).toBeVisible()
  await expect(explorePage.getByText('没找到这座山', { exact: true })).toHaveCount(0)
  const filterEmptyScreenshot = join(ROUND1_DIR, 'filter-empty-simple-375.png')
  await explorePage.screenshot({ path: filterEmptyScreenshot })

  await explorePage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(explorePage)
  const firstCard = explorePage.locator('[data-testid="explore-mountain-card"]').first()
  const firstMountainHref = await firstCard.getAttribute('href')
  if (!firstMountainHref) throw new Error('Default Explore list has no first mountain href.')
  const navigationStartedAt = Date.now()
  await firstCard.click()
  await expect(explorePage).toHaveURL(/\/mountain\/[^/?#]+/)
  await expect(explorePage.locator('[data-testid="mountain-detail-page"]')).toBeVisible({ timeout: 30_000 })
  const mountainNavigationMs = Date.now() - navigationStartedAt
  const mountainFinalUrl = explorePage.url()

  await explorePage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(explorePage)
  const cards = explorePage.locator('[data-testid="explore-mountain-card"]')
  await cards.last().scrollIntoViewIfNeeded()
  await explorePage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await explorePage.waitForTimeout(200)
  const bottomLayout = await explorePage.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]')]
    const lastCard = cards.at(-1)
    const tabBar = document.querySelector<HTMLElement>('nav.fixed.bottom-0')
    const lastBox = lastCard?.getBoundingClientRect()
    const tabBox = tabBar?.getBoundingClientRect()
    return {
      lastCardBottom: lastBox?.bottom ?? null,
      tabBarTop: tabBox?.top ?? null,
      visibleGap: lastBox && tabBox ? tabBox.top - lastBox.bottom : null,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  expect(bottomLayout.horizontalOverflow).toBeLessThanOrEqual(1)
  expect(bottomLayout.visibleGap).not.toBeNull()
  expect(Math.abs(bottomLayout.visibleGap ?? 0)).toBeLessThan(120)
  const bottomScreenshot = join(ROUND1_DIR, 'default-list-bottom-375.png')
  await explorePage.screenshot({ path: bottomScreenshot })

  const video = explorePage.video()
  await context.close()
  const videoPath = join(ROUND1_DIR, 'acceptance-round-1-375.webm')
  if (!video) throw new Error('FU-86 acceptance round 1 did not record video.')
  await copyFile(await video.path(), videoPath)

  expect(consoleEntries.filter((entry) => entry.type === 'error')).toEqual([])
  expect(pageErrors).toEqual([])
  await writeFile(join(ROUND1_DIR, 'summary.json'), JSON.stringify({
    evidenceBoundary: {
      designSource: 'user-provided Claude Design handoff ZIP rendered locally',
      mountainData: 'real local production server data; no mountain response interception',
      recoveryActions: 'real authenticated client navigation and real HelpSheet interaction',
      environment: 'fresh next start process created after current production build',
    },
    defaultCardCount,
    typography,
    recovery: { importNavigationUrl, screenshotNavigationUrl, directSearchEditRecovered: true, submitEntryVisible: true },
    mountainNavigation: { firstMountainHref, finalUrl: mountainFinalUrl, durationMs: mountainNavigationMs },
    bottomLayout,
    console: consoleEntries,
    pageErrors,
    artifacts: { defaultScreenshot, richEmptyScreenshot, filterEmptyScreenshot, submitEntryScreenshot, bottomScreenshot, videoPath },
  }, null, 2))
})

test('FU-86 acceptance round 3 rich-empty media, search classification, and non-destructive recovery', async ({ browser, baseURL }) => {
  test.setTimeout(300_000)
  if (!baseURL) throw new Error('FU-86 acceptance round 3 requires Playwright baseURL.')
  await mkdir(ROUND3_DIR, { recursive: true })
  await mkdir(ROUND3_VIDEO_DIR, { recursive: true })

  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    recordVideo: { dir: ROUND3_VIDEO_DIR, size: { width: 375, height: 812 } },
    reducedMotion: 'no-preference',
    permissions: [],
  })
  await prepareContext(context)
  const page = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: string[] = []
  const mountainRequestUrls: string[] = []
  attachRuntimeCapture(page, consoleEntries, pageErrors)
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/mountain-requests') mountainRequestUrls.push(request.url())
  })

  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(page)
  const input = page.getByPlaceholder('搜山名、地区、海拔')

  await input.fill('尕朵觉沃-不存在')
  const richEmpty = page.locator('[data-explore-empty-kind="search"]')
  await expect(richEmpty).toBeVisible()
  await expect(richEmpty.getByRole('button', { name: '继续搜索', exact: true })).toHaveCount(0)
  await expect(richEmpty.locator('video')).toHaveCount(2)
  await expect(richEmpty.locator('video').nth(0)).toHaveAttribute('src', '/explore/explore-empty-import.mp4')
  await expect(richEmpty.locator('video').nth(1)).toHaveAttribute('src', '/explore/explore-empty-shot.mp4')
  const sceneHeroVideo = page.locator('.explore-scene-panel video')
  await expect.poll(() => sceneHeroVideo.evaluate((video) => (video as HTMLVideoElement).paused)).toBe(true)
  await expect.poll(() => richEmpty.locator('video').evaluateAll((videos) => (
    videos.every((video) => !(video as HTMLVideoElement).paused)
  ))).toBe(true)
  const richEmptyMediaState = await page.evaluate(() => {
    const hero = document.querySelector<HTMLVideoElement>('.explore-scene-panel video')
    const actions = [...document.querySelectorAll<HTMLVideoElement>('[data-explore-empty-kind="search"] video')]
    return {
      hero: hero ? { paused: hero.paused, state: hero.dataset.exploreVideoState } : null,
      actions: actions.map((video) => ({ paused: video.paused, state: video.dataset.exploreEmptyVideoState })),
    }
  })
  expect(richEmptyMediaState.hero).toEqual({ paused: true, state: 'hidden' })
  expect(richEmptyMediaState.actions.every((state) => !state.paused && state.state === 'playing')).toBe(true)
  const richEmptyScreenshot = join(ROUND3_DIR, 'search-empty-video-actions-375.png')
  const importActionScreenshot = join(ROUND3_DIR, 'search-empty-import-video-card-375.png')
  const screenshotActionScreenshot = join(ROUND3_DIR, 'search-empty-shot-video-card-375.png')
  const toastPlaceholderScreenshot = join(ROUND3_DIR, 'search-empty-toast-placeholder-375.png')
  await page.screenshot({ path: richEmptyScreenshot })
  await richEmpty.getByRole('button', { name: '导入轨迹记录', exact: true }).screenshot({ path: importActionScreenshot })
  await richEmpty.getByRole('button', { name: '识别成绩截图', exact: true }).screenshot({ path: screenshotActionScreenshot })
  await richEmpty.getByRole('button', { name: '提交一座山的资料', exact: true }).click()
  await expect(page.getByText('已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放')).toBeVisible()
  await page.screenshot({ path: toastPlaceholderScreenshot })
  expect(mountainRequestUrls).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)

  const startCardTrace = async () => {
    await page.evaluate(() => {
      const state = window as Window & { __fu86SearchRecoveryTrace?: Array<{ atMs: number; opacity: number; transform: string }> }
      state.__fu86SearchRecoveryTrace = []
      const startedAt = performance.now()
      const sample = () => {
        const card = document.querySelector<HTMLElement>('[data-testid="explore-mountain-card"]')
        if (card) {
          const style = getComputedStyle(card)
          state.__fu86SearchRecoveryTrace?.push({
            atMs: Math.round(performance.now() - startedAt),
            opacity: Number.parseFloat(style.opacity || '1'),
            transform: style.transform,
          })
        }
        if (performance.now() - startedAt < 1_200) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
  }

  await page.evaluate(() => {
    const win = window as Window & { __fu110ExploreReplayReasons?: ReplayReasonLog }
    win.__fu110ExploreReplayReasons = { queuedReasons: [], firedReplayReasons: [] }
  })
  await startCardTrace()
  await input.fill('')
  await expect(page.locator('[data-testid="explore-mountain-card"]').first()).toBeVisible()
  await expect.poll(() => sceneHeroVideo.evaluate((video) => (video as HTMLVideoElement).paused)).toBe(false)
  const heroResumedState = await sceneHeroVideo.evaluate((video) => {
    const media = video as HTMLVideoElement
    return { paused: media.paused, state: media.dataset.exploreVideoState }
  })
  expect(heroResumedState).toEqual({ paused: false, state: 'playing' })
  await page.waitForTimeout(1_250)
  const clearRecovery = await page.evaluate(() => {
    const win = window as Window & {
      __fu86SearchRecoveryTrace?: Array<{ atMs: number; opacity: number; transform: string }>
      __fu110ExploreReplayReasons?: ReplayReasonLog
    }
    return {
      trace: win.__fu86SearchRecoveryTrace ?? [],
      reasons: win.__fu110ExploreReplayReasons ?? { queuedReasons: [], firedReplayReasons: [] },
    }
  })
  expect(clearRecovery.reasons.queuedReasons.filter((reason) => reason === 'search')).toHaveLength(1)
  expect(clearRecovery.reasons.firedReplayReasons.filter((reason) => reason === 'search')).toHaveLength(1)
  expect(clearRecovery.trace.at(-1)?.opacity).toBeGreaterThanOrEqual(0.99)
  expect(analyzeOpacityTrace(clearRecovery.trace)).toEqual({ rises: 1, dipAfterHigh: false })

  await input.fill('尕朵觉沃-不存在')
  await expect(richEmpty).toBeVisible()
  await startCardTrace()
  await input.fill('华山')
  await expect(page.locator('[data-testid="explore-mountain-card"]').first()).toBeVisible()
  await page.waitForTimeout(1_250)
  const validNameRecoveryTrace = await page.evaluate(() => (
    (window as Window & { __fu86SearchRecoveryTrace?: unknown[] }).__fu86SearchRecoveryTrace ?? []
  ))
  expect(analyzeOpacityTrace(validNameRecoveryTrace as Array<{ opacity: number }>)).toEqual({ rises: 1, dipAfterHigh: false })

  await page.evaluate(() => {
    const win = window as Window & { __fu110ExploreReplayReasons?: ReplayReasonLog }
    win.__fu110ExploreReplayReasons = { queuedReasons: [], firedReplayReasons: [] }
  })
  await startCardTrace()
  await input.fill('华')
  await input.fill('华山')
  await page.waitForTimeout(1_250)
  const resultsToResults = await page.evaluate(() => {
    const win = window as Window & {
      __fu86SearchRecoveryTrace?: Array<{ opacity: number }>
      __fu110ExploreReplayReasons?: ReplayReasonLog
    }
    return {
      trace: win.__fu86SearchRecoveryTrace ?? [],
      reasons: win.__fu110ExploreReplayReasons ?? { queuedReasons: [], firedReplayReasons: [] },
    }
  })
  expect(resultsToResults.reasons.queuedReasons.includes('search')).toBe(false)
  expect(resultsToResults.reasons.firedReplayReasons.includes('search')).toBe(false)
  expect(resultsToResults.trace.every((sample) => sample.opacity >= 0.85)).toBe(true)

  await input.fill('2154')
  await expect(page.getByTestId('explore-mountain-card').filter({ hasText: '华山' })).toBeVisible()
  await expect(page.getByText('没找到这座山', { exact: true })).toHaveCount(0)

  await input.fill('华山')
  await page.getByRole('button', { name: '5000m+', exact: true }).click()
  const filterEmpty = page.locator('[data-explore-empty-kind="filter"]')
  await expect(filterEmpty).toBeVisible()
  await expect(page.locator('[data-explore-empty-kind="search"]')).toHaveCount(0)
  const filterCombinationScreenshot = join(ROUND3_DIR, 'search-hit-filter-excluded-375.png')
  await page.screenshot({ path: filterCombinationScreenshot })

  const video = page.video()
  await context.close()
  if (!video) throw new Error('FU-86 acceptance round 3 did not record video.')
  const videoPath = join(ROUND3_DIR, 'acceptance-round-3-375.webm')
  await copyFile(await video.path(), videoPath)

  const reducedContext = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
    permissions: [],
  })
  await prepareContext(reducedContext)
  const reducedPage = await reducedContext.newPage()
  await reducedPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(reducedPage)
  await reducedPage.getByPlaceholder('搜山名、地区、海拔').fill('reduced-motion-不存在')
  const reducedEmpty = reducedPage.locator('[data-explore-empty-kind="search"]')
  await expect(reducedEmpty).toBeVisible()
  const reducedVideoState = await reducedPage.locator('.explore-scene-panel video, [data-explore-empty-kind="search"] video').evaluateAll((videos) => videos.map((video) => {
    const media = video as HTMLVideoElement
    return {
      paused: media.paused,
      currentTime: media.currentTime,
      state: media.dataset.exploreVideoState ?? media.dataset.exploreEmptyVideoState,
    }
  }))
  expect(reducedVideoState).toHaveLength(3)
  expect(reducedVideoState.every((state) => state.paused && state.currentTime === 0 && state.state === 'poster')).toBe(true)
  const reducedScreenshot = join(ROUND3_DIR, 'search-empty-reduced-poster-375.png')
  await reducedPage.screenshot({ path: reducedScreenshot })
  await reducedContext.close()

  const rejectedContext = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'no-preference',
    permissions: [],
  })
  await rejectedContext.addInitScript(() => {
    const win = window as Window & { __fu86RejectedPlayCount?: number }
    HTMLMediaElement.prototype.play = function play() {
      win.__fu86RejectedPlayCount = (win.__fu86RejectedPlayCount ?? 0) + 1
      return Promise.reject(new DOMException('controlled autoplay rejection', 'NotAllowedError'))
    }
  })
  await prepareContext(rejectedContext)
  const rejectedPage = await rejectedContext.newPage()
  await rejectedPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await waitForExploreListTerminal(rejectedPage)
  await rejectedPage.getByPlaceholder('搜山名、地区、海拔').fill('autoplay-rejection-不存在')
  const rejectedEmpty = rejectedPage.locator('[data-explore-empty-kind="search"]')
  await expect(rejectedEmpty).toBeVisible()
  await rejectedPage.mouse.click(10, 10)
  await rejectedPage.waitForTimeout(100)
  await rejectedPage.mouse.click(12, 12)
  await rejectedPage.waitForTimeout(100)
  const rejectedVideoState = await rejectedEmpty.locator('video').evaluateAll((videos) => videos.map((video) => {
    const media = video as HTMLVideoElement
    return { paused: media.paused, state: media.dataset.exploreEmptyVideoState }
  }))
  expect(rejectedVideoState.every((state) => state.paused && state.state === 'poster')).toBe(true)
  const rejectedPlayCount = await rejectedPage.evaluate(() => (
    (window as Window & { __fu86RejectedPlayCount?: number }).__fu86RejectedPlayCount ?? 0
  ))
  const rejectedScreenshot = join(ROUND3_DIR, 'search-empty-autoplay-rejected-375.png')
  await rejectedPage.screenshot({ path: rejectedScreenshot })
  await rejectedContext.close()

  const unexpectedConsoleErrors = consoleEntries.filter((entry) => entry.type === 'error')
  expect(unexpectedConsoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
  await writeFile(join(ROUND3_DIR, 'summary.json'), JSON.stringify({
    evidenceBoundary: {
      mountainData: 'real local production data; no mountain list interception',
      mountainRequest: 'toast-only placeholder; no database write or real request workflow',
      geolocation: 'explicitly omitted',
      autoplayRejection: 'controlled by overriding HTMLMediaElement.play; no real browser policy failure claimed',
    },
    richEmptyMediaState,
    heroResumedState,
    clearRecovery,
    validNameRecoveryTrace,
    resultsToResults,
    reducedVideoState,
    rejectedVideoState,
    rejectedPlayCount,
    mountainRequestUrls,
    console: {
      unexpectedErrors: unexpectedConsoleErrors,
      allEntries: consoleEntries,
    },
    pageErrors,
    artifacts: {
      richEmptyScreenshot,
      importActionScreenshot,
      screenshotActionScreenshot,
      toastPlaceholderScreenshot,
      filterCombinationScreenshot,
      reducedScreenshot,
      rejectedScreenshot,
      videoPath,
    },
  }, null, 2))
})
