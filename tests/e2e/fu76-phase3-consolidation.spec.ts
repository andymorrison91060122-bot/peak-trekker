import { expect, test, type Browser, type BrowserContextOptions, type ConsoleMessage, type Page, type Route } from '@playwright/test'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestEmail,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu76-phase3-acceptance'
const STORAGE_STATE = join(OUTPUT_DIR, 'fu76-phase3-auth-state.json')

type ConsoleEntry = {
  type: string
  text: string
  location: ReturnType<ConsoleMessage['location']>
  classification: 'new-this-round' | 'pre-existing' | 'environment'
}

function classifyConsole(type: string, text: string): ConsoleEntry['classification'] {
  if (/Failed to load resource|favicon|net::ERR|WebGL|maplibre|Supabase auth/i.test(text)) return 'environment'
  if (/recognitionFailureResponse|requestSource|TrackPoint|feedbackTimersRef|ButtonPrimitive/i.test(text)) return 'pre-existing'
  return type === 'warning' ? 'pre-existing' : 'new-this-round'
}

async function newEvidencePage(
  browser: Browser,
  baseURL: string,
  options: Pick<BrowserContextOptions, 'reducedMotion' | 'storageState'> = {},
) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    ...options,
  })
  await context.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.localStorage.setItem('peak_trekker_province_draft', '四川')
  })

  const page = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: Array<{ message: string; classification: ConsoleEntry['classification'] }> = []
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
      classification: classifyConsole(message.type(), message.text()),
    })
  })
  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      classification: classifyConsole('error', error.message),
    })
  })

  return { context, page, consoleEntries, pageErrors }
}

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function capturePage(page: Page, name: string) {
  const path = join(OUTPUT_DIR, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

async function captureLocator(page: Page, selector: string, name: string) {
  const path = join(OUTPUT_DIR, name)
  const locator = page.locator(selector).first()
  await expect(locator).toBeVisible()
  await locator.screenshot({ path })
  return path
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  return overflow
}

async function openExploreEmpty(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  await page.getByLabel('搜索山名、地区、海拔').fill(`没有这座山-${Date.now()}`)
  await expect(page.locator('[data-explore-list-empty]')).toBeVisible()
}

async function openFaqEmpty(page: Page) {
  await page.goto('/faq', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('faq-search-input').fill(`没有这个问题-${Date.now()}`)
  await expect(page.getByTestId('faq-search-empty')).toBeVisible()
}

async function injectControlledMountainRouteUnavailable(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  await page.evaluate(() => {
    document.querySelector('#fu76-phase3-controlled-route-unavailable')?.remove()
    const root = document.createElement('section')
    root.id = 'fu76-phase3-controlled-route-unavailable'
    root.style.cssText = [
      'position:fixed',
      'left:16px',
      'right:16px',
      'top:96px',
      'z-index:3000',
    ].join(';')
    root.innerHTML = `
      <div data-mountain-route-card class="pt-empty-state pt-empty-state--sm pt-empty-state--surface">
        <div class="pt-empty-state__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6zM9 4v14M15 6v14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </div>
        <div class="pt-empty-state__title">路线参考图暂时不可用</div>
        <div class="pt-empty-state__copy">地图服务没有响应，你仍可以查看关键点位与海拔信息。</div>
      </div>
    `
    document.body.appendChild(root)
  })
  await expect(page.locator('#fu76-phase3-controlled-route-unavailable [data-mountain-route-card]')).toBeVisible()
}

async function fulfillWeather(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      mountainId: 'mock-mountain',
      tier: 'A',
      provider: 'qweather',
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
      current: {
        temperature: 18,
        feelsLike: 15,
        humidity: 66,
        windSpeed: 18,
        windDirection: '西北风',
        description: '多云间晴',
        icon: '101',
        pressure: 1007,
      },
      forecast: [
        {
          date: '2026-05-19',
          tempMax: 22,
          tempMin: 11,
          description: '多云',
          icon: '101',
          precipitation: 0,
        },
        {
          date: '2026-05-20',
          tempMax: 19,
          tempMin: 10,
          description: '小雨',
          icon: '305',
          precipitation: 4.2,
        },
      ],
    }),
  })
}

async function openWeatherLoading(page: Page) {
  await page.route('**/api/weather/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 12_000))
    await fulfillWeather(route)
  })
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  const href = await page.locator('[data-testid="explore-mountain-card"]').first().getAttribute('href')
  if (!href) throw new Error('Expected mountain link for weather loading evidence.')
  await page.goto(href, { waitUntil: 'domcontentloaded' })
  const section = page.getByTestId('mountain-weather-section')
  await expect(section).toHaveAttribute('data-weather-state', 'loading')
  await expect(section.getByText('加载中')).toBeVisible()
}

async function injectControlledLoadingHarness(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  await page.evaluate(() => {
    const old = document.querySelector('#fu76-phase3-controlled-loading')
    old?.remove()
    const root = document.createElement('section')
    root.id = 'fu76-phase3-controlled-loading'
    root.setAttribute('aria-label', 'FU-76 Phase 3 controlled loading states')
    root.style.cssText = [
      'position:fixed',
      'left:16px',
      'right:16px',
      'top:84px',
      'z-index:3000',
      'display:grid',
      'gap:12px',
      'padding:16px',
      'border-radius:16px',
      'border:1px solid var(--color-outline)',
      'background:var(--color-surface-variant)',
      'box-shadow:0 18px 42px rgba(0,0,0,.34)',
    ].join(';')
    root.innerHTML = `
      <div style="font-size:13px;line-height:18px;color:var(--color-on-surface-variant);font-weight:600">controlled-state captures · not full business-flow loops</div>
      <div data-controlled-loading="import-spinner" style="display:flex;align-items:center;gap:12px;color:var(--color-on-surface)"><span class="pt-spinner" style="--pt-spinner-size:32px;--pt-spinner-color:var(--color-primary)"></span><span>Import spinner primitive</span></div>
      <div data-controlled-loading="screenshot-spinner" style="display:flex;align-items:center;gap:12px;color:var(--color-on-surface)"><span class="pt-spinner" style="--pt-spinner-size:28px;--pt-spinner-color:var(--color-primary)"></span><span>Screenshot spinner primitive</span></div>
      <div data-controlled-loading="trek-skeleton" style="display:grid;gap:8px"><div class="pt-skeleton" style="width:100%;height:60px;border-radius:10px"></div><div class="pt-skeleton" style="width:72%;height:14px;border-radius:999px"></div></div>
      <div data-controlled-loading="weather-skeleton" style="display:grid;grid-template-columns:44px 1fr 58px;gap:12px;align-items:center"><div class="pt-skeleton" style="width:44px;height:44px;border-radius:12px"></div><div style="display:grid;gap:8px"><div class="pt-skeleton" style="width:142px;height:24px;border-radius:999px"></div><div class="pt-skeleton" style="width:190px;height:14px;border-radius:999px"></div></div><div class="pt-skeleton" style="width:58px;height:30px;border-radius:999px"></div></div>
    `
    document.body.appendChild(root)
  })
  await expect(page.locator('#fu76-phase3-controlled-loading')).toBeVisible()
}

async function readLoadingAnimationState(page: Page) {
  return page.locator('#fu76-phase3-controlled-loading').evaluate((root) => {
    const spinner = root.querySelector<HTMLElement>('.pt-spinner')
    const skeleton = root.querySelector<HTMLElement>('.pt-skeleton')
    const spinnerStyle = spinner ? getComputedStyle(spinner) : null
    const skeletonStyle = skeleton ? getComputedStyle(skeleton) : null
    return {
      spinnerAnimationName: spinnerStyle?.animationName ?? null,
      skeletonAnimationName: skeletonStyle?.animationName ?? null,
      spinnerTransform: spinnerStyle?.transform ?? null,
      skeletonBackground: skeletonStyle?.backgroundImage || skeletonStyle?.backgroundColor || null,
    }
  })
}

async function verifyNicknameSaveBehavior(page: Page) {
  await page.goto('/profile', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('profile-nickname-edit-trigger')).toBeVisible()

  const successName = `阶段三${Date.now().toString().slice(-4)}`
  await page.route('**/api/profile/nickname', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, username: successName }),
    })
  })
  await page.getByTestId('profile-nickname-edit-trigger').click()
  await page.getByTestId('profile-nickname-input').fill(successName)
  const save = page.getByTestId('profile-nickname-save')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(save).toBeDisabled()
  await expect(save).toContainText('保存中')
  const savingScreenshot = await captureLocator(page, '[data-testid="profile-nickname-sheet"]', 'profile-nickname-saving-disabled-375.png')
  await expect(page.getByTestId('profile-nickname-sheet')).toHaveCount(0)
  await expect(page.getByTestId('profile-nickname-value')).toHaveText(successName)
  await page.unroute('**/api/profile/nickname')

  const errorName = `重试名${Date.now().toString().slice(-4)}`
  await page.route('**/api/profile/nickname', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700))
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '昵称保存失败，请稍后重试。' }),
    })
  })
  await page.getByTestId('profile-nickname-edit-trigger').click()
  await page.getByTestId('profile-nickname-input').fill(errorName)
  const retrySave = page.getByTestId('profile-nickname-save')
  await expect(retrySave).toBeEnabled()
  await retrySave.click()
  await expect(retrySave).toBeDisabled()
  await expect(retrySave).toContainText('保存中')
  await expect(retrySave).toContainText('重试')
  await expect(retrySave).toBeEnabled()
  const retryScreenshot = await captureLocator(page, '[data-testid="profile-nickname-sheet"]', 'profile-nickname-retry-enabled-375.png')
  await page.unroute('**/api/profile/nickname')

  return {
    successName,
    savingScreenshot,
    retryScreenshot,
    savingStateVerified: true,
    retryStateVerified: true,
  }
}

test('FU-76 Phase 3 consolidation evidence captures empty/loading primitives and nickname loading behavior', async ({ browser, baseURL }) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await mkdir(OUTPUT_DIR, { recursive: true })

  const hasStorageState = await fileExists(STORAGE_STATE)
  const normal = await newEvidencePage(browser, root, hasStorageState ? { storageState: STORAGE_STATE } : {})
  if (hasStorageState) {
    await normal.page.goto('/archive', { waitUntil: 'domcontentloaded' })
  } else {
    await registerFreshUser(normal.page, root, {
      returnTo: '/archive',
      email: createTestEmail('fu76-phase3'),
      username: `fu76-phase3-${Date.now()}`,
      province: '四川',
    })
    await normal.context.storageState({ path: STORAGE_STATE })
  }

  const screenshots: Record<string, string> = {}
  const metrics: Record<string, unknown> = {}

  await expect(normal.page.locator('[data-archive-motion="empty-state"]')).toBeVisible()
  await expect(normal.page.getByText('0 / 0')).toBeVisible()
  await expect(normal.page.getByText('档案还没有一次山行')).toBeVisible()
  await expect(normal.page.getByText('去找一座山')).toBeVisible()
  await expect(normal.page.getByText('把以前的山行带回来')).toBeVisible()
  await expect(normal.page.locator('[data-archive-motion="empty-copy"]')).toBeVisible()
  screenshots.archiveNormalFull = await capturePage(normal.page, 'archive-empty-normal-full-375.png')
  screenshots.archiveNormalEmptyState = await captureLocator(normal.page, '[data-archive-motion="empty-state"]', 'archive-empty-state-normal-375.png')

  await normal.page.goto('/profile', { waitUntil: 'domcontentloaded' })
  await expect(normal.page.getByTestId('profile-archive-preview').locator('.pt-empty-state')).toBeVisible()
  screenshots.profileEmptyNormal = await captureLocator(normal.page, '[data-testid="profile-archive-preview"] .pt-empty-state', 'profile-archive-empty-normal-375.png')

  await openFaqEmpty(normal.page)
  screenshots.faqEmptyNormal = await captureLocator(normal.page, '[data-testid="faq-search-empty"]', 'faq-search-empty-normal-375.png')

  await openExploreEmpty(normal.page)
  screenshots.exploreEmptyNormal = await captureLocator(normal.page, '[data-explore-list-empty]', 'explore-filter-empty-normal-375.png')

  await injectControlledMountainRouteUnavailable(normal.page)
  screenshots.mountainRouteUnavailableNormal = await captureLocator(normal.page, '#fu76-phase3-controlled-route-unavailable [data-mountain-route-card]', 'mountain-route-unavailable-normal-controlled-375.png')

  await injectControlledLoadingHarness(normal.page)
  const normalLoadingState = await readLoadingAnimationState(normal.page)
  expect(normalLoadingState.spinnerAnimationName).toContain('pt-spin')
  expect(normalLoadingState.skeletonAnimationName).toContain('pt-shimmer')
  screenshots.loadingControlledNormal = await captureLocator(normal.page, '#fu76-phase3-controlled-loading', 'controlled-loading-primitives-normal-375.png')

  await openWeatherLoading(normal.page)
  screenshots.weatherSkeletonNormal = await captureLocator(normal.page, '[data-testid="mountain-weather-section"][data-weather-state="loading"]', 'weather-skeleton-normal-controlled-delay-375.png')

  const nickname = await verifyNicknameSaveBehavior(normal.page)
  metrics.nickname = nickname

  metrics.normalOverflow = await expectNoHorizontalOverflow(normal.page)

  const reduced = await newEvidencePage(browser, root, {
    reducedMotion: 'reduce',
    storageState: STORAGE_STATE,
  })
  await reduced.page.goto('/archive', { waitUntil: 'domcontentloaded' })
  await expect(reduced.page.locator('[data-archive-motion="empty-state"]')).toBeVisible()
  screenshots.archiveReducedFull = await capturePage(reduced.page, 'archive-empty-reduced-full-375.png')
  screenshots.archiveReducedEmptyState = await captureLocator(reduced.page, '[data-archive-motion="empty-state"]', 'archive-empty-state-reduced-375.png')

  await reduced.page.goto('/profile', { waitUntil: 'domcontentloaded' })
  await expect(reduced.page.getByTestId('profile-archive-preview').locator('.pt-empty-state')).toBeVisible()
  screenshots.profileEmptyReduced = await captureLocator(reduced.page, '[data-testid="profile-archive-preview"] .pt-empty-state', 'profile-archive-empty-reduced-375.png')

  await openFaqEmpty(reduced.page)
  screenshots.faqEmptyReduced = await captureLocator(reduced.page, '[data-testid="faq-search-empty"]', 'faq-search-empty-reduced-375.png')

  await openExploreEmpty(reduced.page)
  screenshots.exploreEmptyReduced = await captureLocator(reduced.page, '[data-explore-list-empty]', 'explore-filter-empty-reduced-375.png')

  await injectControlledMountainRouteUnavailable(reduced.page)
  screenshots.mountainRouteUnavailableReduced = await captureLocator(reduced.page, '#fu76-phase3-controlled-route-unavailable [data-mountain-route-card]', 'mountain-route-unavailable-reduced-controlled-375.png')

  await injectControlledLoadingHarness(reduced.page)
  const reducedLoadingState = await readLoadingAnimationState(reduced.page)
  expect(reducedLoadingState.spinnerAnimationName).toBe('none')
  expect(reducedLoadingState.skeletonAnimationName).toBe('none')
  screenshots.loadingControlledReduced = await captureLocator(reduced.page, '#fu76-phase3-controlled-loading', 'controlled-loading-primitives-reduced-375.png')

  await openWeatherLoading(reduced.page)
  screenshots.weatherSkeletonReduced = await captureLocator(reduced.page, '[data-testid="mountain-weather-section"][data-weather-state="loading"]', 'weather-skeleton-reduced-controlled-delay-375.png')

  metrics.reducedOverflow = await expectNoHorizontalOverflow(reduced.page)
  metrics.loadingAnimation = {
    normal: normalLoadingState,
    reduced: reducedLoadingState,
  }

  const allConsole = [...normal.consoleEntries, ...reduced.consoleEntries]
  const allPageErrors = [...normal.pageErrors, ...reduced.pageErrors]
  const newConsoleErrors = allConsole.filter((entry) => entry.classification === 'new-this-round')
  const newPageErrors = allPageErrors.filter((entry) => entry.classification === 'new-this-round')
  expect(newConsoleErrors).toEqual([])
  expect(newPageErrors).toEqual([])

  const summaryPath = join(OUTPUT_DIR, 'fu76-phase3-summary.json')
  await writeFile(summaryPath, JSON.stringify({
    root,
    screenshots,
    metrics,
    controlledBoundary: {
      loadingHarness: 'Import/Screenshot spinner and Trek skeleton panels are controlled-state captures of shared primitives inside the app shell, not full real business-flow loops.',
      mountainRouteUnavailable: 'Mountain RouteUnavailable screenshots are controlled-state EmptyState captures because current production candidates did not expose this branch and Supabase admin writes were unavailable during evidence capture.',
      weatherSkeleton: 'Weather skeleton screenshots use a controlled delayed /api/weather response to hold the loading state.',
      nicknameSave: 'Nickname save evidence drives the real profile sheet and /api/profile/nickname request, with one controlled delayed 200 success and one controlled 500 error.',
    },
    console: {
      entries: allConsole,
      pageErrors: allPageErrors,
      newConsoleErrors,
      newPageErrors,
    },
    summaryPath,
  }, null, 2))

  await normal.context.close()
  await reduced.context.close()
})
