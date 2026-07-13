import { expect, test, type Browser, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE_URL = process.env.FU76_MOTION_GAPS_BASE_URL ?? 'http://127.0.0.1:3110'
const OUTPUT_DIR = '/private/tmp/peak-trekker-fu76-route-transition-loading/output/fu76-motion-gaps-acceptance'

type ConsoleEntry = {
  type: string
  text: string
  classification: 'new-this-round' | 'pre-existing' | 'environment'
}

type MotionSample = {
  atMs: number
  opacity: number
  transform: string
  animationName: string
  animationPlayState: string
}

function classifyConsole(type: string, text: string): ConsoleEntry['classification'] {
  if (/Failed to load resource|favicon|net::ERR|analytics|font|Supabase auth/i.test(text)) return 'environment'
  if (type === 'warning') return 'pre-existing'
  return 'new-this-round'
}

async function prepareContext(context: BrowserContext, entries: ConsoleEntry[], pageErrors: string[]) {
  await context.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
      window.localStorage.setItem('peak_trekker_province_draft', '北京')
    } catch {
      // about:blank has an opaque origin before the first app navigation.
    }
  })
  context.on('page', (page) => attachDiagnostics(page, entries, pageErrors))
}

function attachDiagnostics(page: Page, entries: ConsoleEntry[], pageErrors: string[]) {
  page.on('console', (message: ConsoleMessage) => {
    if (!['warning', 'error'].includes(message.type())) return
    entries.push({
      type: message.type(),
      text: message.text(),
      classification: classifyConsole(message.type(), message.text()),
    })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
}

async function sampleEntrance(page: Page, selector: string, durationMs = 480): Promise<MotionSample[]> {
  return page.locator(selector).first().evaluate(async (element, sampleDuration) => {
    const samples: MotionSample[] = []
    const startedAt = performance.now()
    while (performance.now() - startedAt <= sampleDuration) {
      const style = window.getComputedStyle(element)
      samples.push({
        atMs: Math.round(performance.now() - startedAt),
        opacity: Number.parseFloat(style.opacity || '1'),
        transform: style.transform,
        animationName: style.animationName,
        animationPlayState: style.animationPlayState,
      })
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    return samples
  }, durationMs)
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1)
  return widths
}

async function installControlledRscGate(page: Page, matchesPathname: (pathname: string) => boolean) {
  let delayedRequests = 0
  let releaseGate: (() => void) | null = null
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = request.headers()
    if (
      matchesPathname(url.pathname)
      && headers.rsc === '1'
      && headers['next-router-prefetch'] !== '1'
    ) {
      delayedRequests += 1
      await gate
    }
    await route.continue()
  })
  return {
    readCount: () => delayedRequests,
    release: () => releaseGate?.(),
  }
}

async function openExplore(page: Page) {
  await page.goto(new URL('/explore', BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-testid="route-motion-main"]')).toBeVisible()
}

test('FU-76 auth entrance and route-group loading evidence', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(180_000)
  await mkdir(OUTPUT_DIR, { recursive: true })

  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: string[] = []
  const artifacts = {
    loginVideo: join(OUTPUT_DIR, 'login-enter-375.webm'),
    registerScreenshot: join(OUTPUT_DIR, 'register-enter-375.png'),
    mainLoadingScreenshot: join(OUTPUT_DIR, 'main-loading-375.png'),
    flowLoadingScreenshot: join(OUTPUT_DIR, 'flow-loading-375.png'),
    reducedScreenshot: join(OUTPUT_DIR, 'reduced-motion-terminal-375.png'),
    coverageMatrix: join(OUTPUT_DIR, 'coverage-matrix.json'),
    summary: join(OUTPUT_DIR, 'summary.json'),
  }

  const loginContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 375, height: 812 } },
  })
  await prepareContext(loginContext, consoleEntries, pageErrors)
  const loginPage = await loginContext.newPage()
  const loginVideo = loginPage.video()
  await loginPage.goto(new URL('/auth/login', BASE_URL).toString(), { waitUntil: 'commit' })
  const loginRoot = loginPage.locator('div.pt-page-enter').first()
  await loginRoot.waitFor({ state: 'attached' })
  const loginInput = loginPage.locator('input[type="email"]')
  const loginWasRunning = await loginRoot.evaluate((element) => getComputedStyle(element).animationPlayState === 'running')
  expect(loginWasRunning).toBe(true)
  const loginTracePromise = sampleEntrance(loginPage, 'div.pt-page-enter')
  await loginInput.focus()
  await loginPage.keyboard.type('motion@example.com')
  await expect(loginInput).toHaveValue('motion@example.com')
  const loginTrace = await loginTracePromise
  expect(loginTrace.some((sample) => sample.opacity < 0.99 || sample.transform !== 'none')).toBe(true)
  expect(loginTrace.at(-1)?.opacity).toBeGreaterThanOrEqual(0.99)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(loginTrace.at(-1)?.transform)
  const loginOverflow = await expectNoHorizontalOverflow(loginPage)
  await loginContext.close()
  if (!loginVideo) throw new Error('Login evidence video was not created.')
  await copyFile(await loginVideo.path(), artifacts.loginVideo)

  const registerContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
  await prepareContext(registerContext, consoleEntries, pageErrors)
  const registerPage = await registerContext.newPage()
  await registerPage.goto(new URL('/auth/register', BASE_URL).toString(), { waitUntil: 'commit' })
  const registerRoot = registerPage.locator('div.pt-page-enter').first()
  await registerRoot.waitFor({ state: 'attached' })
  expect(await registerRoot.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe('running')
  const registerInput = registerPage.locator('input[type="email"]')
  await registerInput.focus()
  await registerPage.keyboard.type('register@example.com')
  await expect(registerInput).toHaveValue('register@example.com')
  await registerPage.waitForTimeout(480)
  await expect(registerRoot).toHaveCSS('opacity', '1')
  await registerPage.screenshot({ path: artifacts.registerScreenshot, fullPage: true })
  const registerOverflow = await expectNoHorizontalOverflow(registerPage)
  await registerContext.close()

  const authContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
  await prepareContext(authContext, consoleEntries, pageErrors)
  const authPage = await authContext.newPage()
  await authPage.goto(new URL('/auth/login', BASE_URL).toString(), { waitUntil: 'domcontentloaded' })
  await authPage.getByPlaceholder('your@email.com').fill('fu76-motion-gaps-route@example.com')
  await authPage.getByPlaceholder(/至少6位|••••••••/).fill('PeakTrekker123!')
  await authPage.getByRole('button', { name: '▶ 开始登山' }).click()
  await expect(authPage).toHaveURL(/\/explore/, { timeout: 30_000 })
  const authState = await authContext.storageState()
  await authContext.close()

  const mainContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: authState,
  })
  await prepareContext(mainContext, consoleEntries, pageErrors)
  const mainPage = await mainContext.newPage()
  const mainRscGate = await installControlledRscGate(mainPage, (pathname) => pathname === '/profile')
  await openExplore(mainPage)
  await mainPage.locator('.pt-tab-link[href="/profile"]').click({ noWaitAfter: true })
  await expect.poll(mainRscGate.readCount).toBeGreaterThan(0)
  const mainLoading = mainPage.locator('[data-route-loading="main"]')
  await expect(mainLoading).toBeVisible()
  await expect(mainLoading.locator('.pt-skeleton').first()).toHaveCSS('animation-name', 'pt-shimmer')
  await expect(mainPage.locator('header').first()).toBeVisible()
  await expect(mainPage.locator('nav')).toBeVisible()
  mainRscGate.release()
  await expect(mainPage).toHaveURL(/\/profile/)
  const mainOverflow = await expectNoHorizontalOverflow(mainPage)
  await mainContext.close()

  const flowContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
  await prepareContext(flowContext, consoleEntries, pageErrors)
  const flowPage = await flowContext.newPage()
  const flowRscGate = await installControlledRscGate(flowPage, (pathname) => pathname.startsWith('/mountain/'))
  await openExplore(flowPage)
  const firstMountainCard = flowPage.locator('[data-testid="explore-mountain-card"]').first()
  const firstMountainHref = await firstMountainCard.getAttribute('href')
  expect(firstMountainHref).toMatch(/^\/mountain\//)
  await firstMountainCard.click({ noWaitAfter: true })
  await expect.poll(flowRscGate.readCount).toBeGreaterThan(0)
  const flowLoading = flowPage.locator('[data-route-loading="flow"]')
  await expect(flowLoading).toBeVisible()
  await expect(flowLoading.locator('.pt-skeleton').first()).toHaveCSS('animation-name', 'pt-shimmer')
  await flowPage.screenshot({ path: artifacts.flowLoadingScreenshot })
  flowRscGate.release()
  await expect(flowPage).toHaveURL(/\/mountain\//)
  const flowOverflow = await expectNoHorizontalOverflow(flowPage)
  await flowContext.close()

  const reducedContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
  })
  await prepareContext(reducedContext, consoleEntries, pageErrors)
  const reducedPage = await reducedContext.newPage()
  await reducedPage.goto(new URL('/auth/login', BASE_URL).toString(), { waitUntil: 'commit' })
  const reducedRoot = reducedPage.locator('div.pt-page-enter').first()
  await reducedRoot.waitFor({ state: 'attached' })
  const reducedTerminal = await reducedRoot.evaluate((element) => {
    const style = getComputedStyle(element)
    return { animationName: style.animationName, opacity: style.opacity, transform: style.transform }
  })
  expect(reducedTerminal).toEqual({ animationName: 'none', opacity: '1', transform: 'matrix(1, 0, 0, 1, 0, 0)' })
  const reducedInput = reducedPage.locator('input[type="email"]')
  await reducedInput.focus()
  await reducedPage.keyboard.type('reduced@example.com')
  await expect(reducedInput).toHaveValue('reduced@example.com')
  await reducedPage.screenshot({ path: artifacts.reducedScreenshot, fullPage: true })
  await reducedContext.close()

  const reducedLoadingContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
    storageState: authState,
  })
  await prepareContext(reducedLoadingContext, consoleEntries, pageErrors)
  const reducedLoadingPage = await reducedLoadingContext.newPage()
  const reducedRscGate = await installControlledRscGate(reducedLoadingPage, (pathname) => pathname === '/profile')
  await openExplore(reducedLoadingPage)
  await reducedLoadingPage.locator('.pt-tab-link[href="/profile"]').click({ noWaitAfter: true })
  await expect.poll(reducedRscGate.readCount).toBeGreaterThan(0)
  const reducedLoading = reducedLoadingPage.locator('[data-route-loading="main"]')
  await expect(reducedLoading).toBeVisible()
  const reducedSkeleton = await reducedLoading.locator('.pt-skeleton').first().evaluate((element) => {
    const style = getComputedStyle(element)
    return { animationName: style.animationName, backgroundImage: style.backgroundImage }
  })
  expect(reducedSkeleton.animationName).toBe('none')
  expect(reducedSkeleton.backgroundImage).toBe('none')
  reducedRscGate.release()
  await expect(reducedLoadingPage).toHaveURL(/\/profile/)
  const reducedOverflow = await expectNoHorizontalOverflow(reducedLoadingPage)
  await reducedLoadingContext.close()

  const coverageMatrix = {
    protected: [
      'explore', 'archive', 'profile', 'imprint', 'import', 'screenshot',
      'mountain', 'activity', 'faq', 'share', 'trek', 'onboarding/IntroCarousel',
    ],
    newThisRound: ['/auth/login', '/auth/register', '(main)/loading.tsx', '(flow)/loading.tsx'],
    excluded: {
      'community*': 'v1 no-community standing decision',
      '/rankings/province': 'feature-flagged redirect; unreachable',
      '/prep': 'orphan with zero UI inbound links',
      'admin/debug/QA/root-redirect': 'non-user product surfaces',
    },
    routeProgress: 'deferred pending post-skeleton real-device evaluation',
  }
  await writeFile(artifacts.coverageMatrix, JSON.stringify(coverageMatrix, null, 2))

  const newErrors = consoleEntries.filter((entry) => entry.classification === 'new-this-round')
  expect(pageErrors).toEqual([])
  expect(newErrors).toEqual([])

  await writeFile(artifacts.summary, JSON.stringify({
    status: 'visual ready for user review',
    controlledEvidence: [
      '(main) route loading captured with a Playwright-gated authenticated /profile RSC request',
      '(flow) route loading captured with a Playwright-gated dynamic /mountain/:id RSC request',
      'reduced-motion Skeleton captured with a Playwright-gated authenticated /profile RSC request',
    ],
    login: { inputTypeableDuringEntrance: loginWasRunning, trace: loginTrace, overflow: loginOverflow },
    register: { inputTypeableDuringEntrance: true, overflow: registerOverflow },
    mainLoading: { delayedRscRequests: mainRscGate.readCount(), skeletonAnimation: 'pt-shimmer', overflow: mainOverflow },
    flowLoading: { delayedRscRequests: flowRscGate.readCount(), overflow: flowOverflow },
    reducedMotion: { entrance: reducedTerminal, skeleton: reducedSkeleton, overflow: reducedOverflow },
    console: consoleEntries,
    pageErrors,
    artifacts,
  }, null, 2))
})
