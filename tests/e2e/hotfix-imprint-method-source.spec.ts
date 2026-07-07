import { test, expect, type Browser, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTestEmail, registerFreshUser } from './community.helpers'

const OUTPUT_DIR = '/private/tmp/peak-trekker-hotfix-imprint-method-source/output/hotfix-imprint-method-source'
const AUTH_STATE = join(OUTPUT_DIR, 'hotfix-imprint-auth-state.json')

type ConsoleEntry = {
  type: string
  text: string
  location: ReturnType<ConsoleMessage['location']>
  classification: 'new-this-round' | 'pre-existing' | 'environment'
}

type EvidenceContext = {
  context: BrowserContext
  page: Page
  consoleEntries: ConsoleEntry[]
  pageErrors: string[]
}

function classifyConsole(type: string, text: string): ConsoleEntry['classification'] {
  if (/Failed to load resource|favicon|net::ERR|WebGL|maplibre/i.test(text)) return 'environment'
  if (/warning|deprecated|React does not recognize/i.test(text)) return 'pre-existing'
  return type === 'warning' ? 'pre-existing' : 'new-this-round'
}

async function newEvidenceContext(
  browser: Browser,
  baseURL: string,
  {
    reducedMotion = false,
    storageState,
  }: {
    reducedMotion?: boolean
    storageState?: string
  } = {}
): Promise<EvidenceContext> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    storageState,
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 375, height: 812 },
    },
  })
  await context.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.localStorage.setItem('peak_trekker_province_draft', '四川')
  })
  const page = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
      classification: classifyConsole(message.type(), message.text()),
    })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { context, page, consoleEntries, pageErrors }
}

async function closeWithVideo(context: BrowserContext, page: Page, name: string) {
  const video = page.video()
  await context.close()
  if (!video) return null
  const rawPath = await video.path()
  const copiedPath = join(OUTPUT_DIR, name)
  await copyFile(rawPath, copiedPath)
  return copiedPath
}

async function capture(page: Page, name: string) {
  const path = join(OUTPUT_DIR, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  return dimensions
}

async function optionStates(page: Page) {
  return page.locator('.imprint-source-option').evaluateAll((nodes) =>
    nodes.map((node) => {
      const element = node as HTMLElement
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const transform = style.transform
      let translateY = 0
      if (transform && transform !== 'none') {
        const matrix = new DOMMatrixReadOnly(transform)
        translateY = matrix.m42
      }
      return {
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        opacity: Number(style.opacity),
        visibility: style.visibility,
        transform,
        translateY,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
      }
    })
  )
}

async function assertOptionsTerminalVisible(page: Page) {
  await expect(page.locator('.imprint-source-option')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /导入轨迹文件/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /识别截图/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /选山实时记录/ })).toBeVisible()
  await expect.poll(async () => {
    const states = await optionStates(page)
    return states.length === 3 && states.every((state) =>
      state.visibility === 'visible'
      && state.opacity >= 0.99
      && Math.abs(state.translateY) <= 0.5
      && state.height > 40
    )
  }, { timeout: 3000 }).toBe(true)
  const states = await optionStates(page)
  expect(states).toHaveLength(3)
  for (const state of states) {
    expect(state.visibility, state.text).toBe('visible')
    expect(state.opacity, state.text).toBeGreaterThanOrEqual(0.99)
    expect(Math.abs(state.translateY), state.text).toBeLessThanOrEqual(0.5)
    expect(state.height, state.text).toBeGreaterThan(40)
  }
  return states
}

async function openMethodFromFacade(page: Page) {
  await page.goto('/imprint', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('imprint-facade')).toBeVisible()
  await expect(page.getByRole('button', { name: /就用这一款/ })).toBeVisible()
  await page.getByRole('button', { name: /就用这一款/ }).click()
  await expect(page.getByText('选择数据来源')).toBeVisible()
  await page.waitForTimeout(900)
  return assertOptionsTerminalVisible(page)
}

test('hotfix imprint method source options stay visible after auth facade transition', async ({ browser, baseURL }) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await mkdir(OUTPUT_DIR, { recursive: true })

  const normal = await newEvidenceContext(browser, root)
  const screenshots: Record<string, string> = {}
  const videos: Record<string, string | null> = {}
  const metrics: Record<string, unknown> = {}
  const allConsole: ConsoleEntry[] = []
  const allPageErrors: string[] = []

  await registerFreshUser(normal.page, root, {
    returnTo: '/imprint',
    email: createTestEmail('hotfix-imprint'),
    username: `hotfix-imprint-${Date.now()}`,
    province: '四川',
  })
  await expect(normal.page.getByTestId('imprint-facade')).toBeVisible()
  screenshots.authBefore = await capture(normal.page, 'auth-imprint-facade-before-cta-375.png')
  await normal.context.storageState({ path: AUTH_STATE })
  await normal.page.getByRole('button', { name: /就用这一款/ }).click()
  await expect(normal.page.getByText('选择数据来源')).toBeVisible()
  await normal.page.waitForTimeout(900)
  metrics.normalOptions = await assertOptionsTerminalVisible(normal.page)
  screenshots.authAfter = await capture(normal.page, 'auth-imprint-method-source-options-visible-375.png')
  metrics.normalOverflow = await expectNoHorizontalOverflow(normal.page)
  allConsole.push(...normal.consoleEntries)
  allPageErrors.push(...normal.pageErrors)
  videos.normal = await closeWithVideo(normal.context, normal.page, 'auth-imprint-method-source-normal-375.webm')

  const reduced = await newEvidenceContext(browser, root, { reducedMotion: true, storageState: AUTH_STATE })
  metrics.reducedOptions = await openMethodFromFacade(reduced.page)
  screenshots.reduced = await capture(reduced.page, 'auth-imprint-method-source-reduced-visible-375.png')
  metrics.reducedOverflow = await expectNoHorizontalOverflow(reduced.page)
  allConsole.push(...reduced.consoleEntries)
  allPageErrors.push(...reduced.pageErrors)
  videos.reduced = await closeWithVideo(reduced.context, reduced.page, 'auth-imprint-method-source-reduced-375.webm')

  const rapid = await newEvidenceContext(browser, root, { storageState: AUTH_STATE })
  await rapid.page.goto('/imprint', { waitUntil: 'domcontentloaded' })
  await expect(rapid.page.getByRole('button', { name: /就用这一款/ })).toBeVisible()
  for (let index = 0; index < 3; index += 1) {
    await rapid.page.getByRole('button', { name: /就用这一款/ }).click()
    await rapid.page.waitForTimeout(260)
    await expect(rapid.page.getByText('选择数据来源')).toBeVisible()
    await rapid.page.getByRole('button', { name: '返回样式选择' }).click()
    await expect(rapid.page.getByRole('button', { name: /就用这一款/ })).toBeVisible()
  }
  await rapid.page.getByRole('button', { name: /就用这一款/ }).click()
  await rapid.page.waitForTimeout(900)
  metrics.rapidOptions = await assertOptionsTerminalVisible(rapid.page)
  screenshots.rapid = await capture(rapid.page, 'auth-imprint-method-source-rapid-reentry-visible-375.png')
  metrics.rapidOverflow = await expectNoHorizontalOverflow(rapid.page)
  allConsole.push(...rapid.consoleEntries)
  allPageErrors.push(...rapid.pageErrors)
  videos.rapid = await closeWithVideo(rapid.context, rapid.page, 'auth-imprint-method-source-rapid-reentry-375.webm')

  const navigation = await newEvidenceContext(browser, root, { storageState: AUTH_STATE })
  const navigationResults: Record<string, string> = {}
  await openMethodFromFacade(navigation.page)
  await navigation.page.getByRole('button', { name: /导入轨迹文件/ }).click()
  await expect(navigation.page).toHaveURL(/\/import/)
  navigationResults.import = navigation.page.url()

  await openMethodFromFacade(navigation.page)
  await navigation.page.getByRole('button', { name: /识别截图/ }).click()
  await expect(navigation.page).toHaveURL(/\/screenshot/)
  navigationResults.screenshot = navigation.page.url()

  await openMethodFromFacade(navigation.page)
  await navigation.page.getByRole('button', { name: /选山实时记录/ }).click()
  await expect(navigation.page).toHaveURL(/\/explore/)
  navigationResults.record = navigation.page.url()

  screenshots.navigation = await capture(navigation.page, 'auth-imprint-source-entry-navigation-375.png')
  metrics.navigationOverflow = await expectNoHorizontalOverflow(navigation.page)
  allConsole.push(...navigation.consoleEntries)
  allPageErrors.push(...navigation.pageErrors)
  videos.navigation = await closeWithVideo(navigation.context, navigation.page, 'auth-imprint-source-entry-navigation-375.webm')

  const newConsoleErrors = allConsole.filter((entry) => entry.classification === 'new-this-round')
  const summary = {
    scope: 'P0/P1 hotfix: /imprint method source options terminal visibility after authenticated facade transition',
    baseURL: root,
    screenshots,
    videos,
    metrics,
    navigationResults,
    console: allConsole,
    pageErrors: allPageErrors,
    newConsoleErrors,
  }
  const summaryPath = join(OUTPUT_DIR, 'hotfix-imprint-method-source-summary.json')
  await writeFile(summaryPath, JSON.stringify(summary, null, 2))

  expect(newConsoleErrors).toEqual([])
  expect(allPageErrors).toEqual([])
})
