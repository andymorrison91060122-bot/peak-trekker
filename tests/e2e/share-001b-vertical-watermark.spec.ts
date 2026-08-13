import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUTPUT_DIR = join(process.cwd(), 'output', 'share-001b')

type MotionPhase = {
  phase: string
  opacity: number
  transform: string
}

type MotionMetric = {
  kind: string
  format: string
  value: string
  text: string
}

type Box = {
  left: number
  top: number
  right: number
  bottom: number
}

type MetricGeometry = {
  label: Box | null
  value: Box | null
  unit: Box | null
  group: Box
}

type MetricTypography = {
  role: string
  dataRole: string
  fontFamily: string
  fontWeight: string
}

type TerminalContentTarget = {
  text: string
  opacity: number
  visibility: string
  width: number
  height: number
}

type VerticalTerminalContent = {
  labels: TerminalContentTarget[]
  units: TerminalContentTarget[]
  values: TerminalContentTarget[]
  brand: TerminalContentTarget[]
  source: TerminalContentTarget[]
  routeCount: number
  routeOpacity: number
}

type DrawTerminalState = {
  count: number
  dasharrays: string[]
  dashoffsets: string[]
}

async function installNoMutationRoutes(page: Page) {
  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
}

async function openContext(browser: Browser, reducedMotion: 'reduce' | 'no-preference', recordVideo = false) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    reducedMotion,
    ...(recordVideo ? { recordVideo: { dir: OUTPUT_DIR, size: { width: 375, height: 812 } } } : {}),
  })
  const page = await context.newPage()
  await installNoMutationRoutes(page)
  return { context, page }
}

async function hideDevPortal(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal').forEach((portal) => portal.remove())
  })
}

async function readMotionPhases(page: Page) {
  return page.locator('[data-testid="share-main-poster-preview"] [data-motion-phase]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const element = node as HTMLElement
      const style = getComputedStyle(element)
      return {
        phase: element.dataset.motionPhase ?? '',
        opacity: Number.parseFloat(style.opacity || '1'),
        transform: style.transform,
      }
    })
  )) as Promise<MotionPhase[]>
}

async function waitForTerminalMotion(page: Page) {
  await expect.poll(async () => {
    const phases = await readMotionPhases(page)
    return phases.length === 3 && phases.every((phase) => phase.opacity >= 0.99)
  }, { timeout: 5_000 }).toBe(true)
  return readMotionPhases(page)
}

async function readViewport(page: Page) {
  return page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  }))
}

async function readMotionMetrics(scope: Locator) {
  return scope.locator('[data-role="num"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const element = node as HTMLElement
      return {
        kind: element.dataset.motionKind ?? '',
        format: element.dataset.fmt ?? '',
        value: element.dataset.val ?? '',
        text: element.textContent ?? '',
      }
    })
  )) as Promise<MotionMetric[]>
}

async function readMetricGeometry(scope: Locator) {
  return scope.locator('[data-motion-phase="data"] > div').evaluateAll((nodes) => (
    nodes.map((node) => {
      const group = node as HTMLElement
      const label = group.querySelector<HTMLElement>('[data-motion-kind="metric-label"]')
      const value = group.querySelector<HTMLElement>('[data-role="num"]')
      const unit = group.querySelector<HTMLElement>('[data-motion-kind="metric-unit"]')
      const toBox = (rect: DOMRect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
      return {
        group: toBox(group.getBoundingClientRect()),
        label: label ? toBox(label.getBoundingClientRect()) : null,
        value: value ? toBox(value.getBoundingClientRect()) : null,
        unit: unit ? toBox(unit.getBoundingClientRect()) : null,
      }
    })
  )) as Promise<MetricGeometry[]>
}

async function readMetricTypography(scope: Locator) {
  return scope.locator('[data-motion-kind="metric-label"], [data-role="num"], [data-motion-kind="metric-unit"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const element = node as HTMLElement
      const style = getComputedStyle(element)
      return {
        role: element.dataset.motionKind ?? '',
        dataRole: element.dataset.role ?? '',
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
      }
    })
  )) as Promise<MetricTypography[]>
}

async function readVerticalTerminalContent(poster: Locator) {
  return poster.evaluate((node) => {
    const toTarget = (element: Element) => {
      const style = getComputedStyle(element)
      const box = (element as HTMLElement).getBoundingClientRect()
      return {
        text: element.textContent?.trim() ?? '',
        opacity: Number.parseFloat(style.opacity || '1'),
        visibility: style.visibility,
        width: box.width,
        height: box.height,
      }
    }
    const collect = (selector: string) => Array.from(node.querySelectorAll(selector)).map(toTarget)
    const route = node.querySelector<HTMLElement>('[data-motion-phase="route"]')

    return {
      labels: collect('[data-motion-kind="metric-label"]'),
      units: collect('[data-motion-kind="metric-unit"]'),
      values: collect('[data-role="num"]'),
      brand: collect('[data-motion-kind="brand"]'),
      source: collect('[data-motion-kind="pill"]'),
      routeCount: route?.querySelectorAll('path[data-role="draw"]').length ?? 0,
      routeOpacity: route ? Number.parseFloat(getComputedStyle(route).opacity || '1') : 0,
    }
  }) as Promise<VerticalTerminalContent>
}

async function readDrawTerminalState(scope: Locator) {
  return scope.locator('path[data-role="draw"]').evaluateAll((nodes) => ({
    count: nodes.length,
    dasharrays: nodes.map((node) => getComputedStyle(node).strokeDasharray),
    dashoffsets: nodes.map((node) => getComputedStyle(node).strokeDashoffset),
  })) as Promise<DrawTerminalState>
}

function isTerminallyVisible(target: TerminalContentTarget) {
  return target.opacity >= 0.99 && target.visibility !== 'hidden' && target.width > 0 && target.height > 0
}

function hasCompleteVerticalTerminalContent(content: VerticalTerminalContent) {
  return (
    content.labels.map((target) => target.text).join('|') === '最高海拔|距离|时长'
    && content.units.map((target) => target.text).join('|') === 'm|km'
    && content.values.map((target) => target.text).join('|') === '3952|12.8|06:42'
    && content.brand.map((target) => target.text).join('|') === 'Peak Trekker'
    && content.source.length === 1
    && ['GPS VERIFIED', 'UPLOADED'].includes(content.source[0].text)
    && [...content.labels, ...content.units, ...content.values, ...content.brand, ...content.source].every(isTerminallyVisible)
    && content.routeCount > 0
    && content.routeOpacity >= 0.99
  )
}

function hasSettledDrawTerminal(state: DrawTerminalState) {
  return state.count > 0
    && state.dasharrays.every((dasharray) => dasharray === 'none')
    && state.dashoffsets.every((dashoffset) => dashoffset === '0px')
}

test('SHARE-001B makes Vertical first, free, motion-complete, and horizontally stable at 375px', async ({ browser, baseURL }) => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  let analyticsRequests = 0

  const normal = await openContext(browser, 'no-preference', true)
  await normal.page.route('**/api/analytics/event', (route) => {
    analyticsRequests += 1
    return route.fulfill({ status: 204, body: '' })
  })

  await normal.page.goto(`${baseURL}/imprint`, { waitUntil: 'domcontentloaded' })
  await expect(normal.page.getByTestId('imprint-facade')).toBeVisible()
  await expect.poll(() => normal.page.evaluate(() => (
    document.fonts.check('600 20px Rajdhani')
      && document.fonts.check('700 20px Rajdhani')
      && document.fonts.check('800 20px Rajdhani')
  ))).toBe(true)
  const firstImprintCard = normal.page.locator('[data-imprint-card]').first()
  await expect(firstImprintCard).toHaveAttribute('data-template', 'base-vertical-classic')
  await expect(firstImprintCard.locator('[aria-label*="解锁"], [data-testid*="lock"], [class*="lock"]')).toHaveCount(0)
  await expect(firstImprintCard.locator('[data-role="num"]')).toHaveCount(3)
  await expect.poll(async () => (await readMotionMetrics(firstImprintCard)).map((metric) => metric.text)).toEqual(['7546', '20', '30:00'])
  const imprintMetricMotion = await readMotionMetrics(firstImprintCard)
  expect(imprintMetricMotion.map((metric) => metric.kind)).toEqual(['altitude', 'distance', 'duration'])
  expect(imprintMetricMotion.map((metric) => metric.format)).toEqual(['integer', 'decimal-1', 'duration'])
  const imprintMetricGeometry = await readMetricGeometry(firstImprintCard)
  const imprintMetricTypography = await readMetricTypography(firstImprintCard)
  const imprintCardBox = await firstImprintCard.boundingBox()
  expect(imprintCardBox).not.toBeNull()
  expect(imprintMetricGeometry).toHaveLength(3)
  imprintMetricGeometry.forEach((metric, index) => {
    expect(metric.label).not.toBeNull()
    expect(metric.value).not.toBeNull()
    expect(metric.label!.bottom).toBeLessThanOrEqual(metric.value!.top + 1)
    expect(metric.group.left).toBeGreaterThanOrEqual(imprintCardBox!.x - 1)
    expect(metric.group.right).toBeLessThanOrEqual(imprintCardBox!.x + imprintCardBox!.width + 1)
    if (metric.unit) expect(metric.unit.left).toBeGreaterThan(metric.value!.right - 1)
    if (index > 0) expect(imprintMetricGeometry[index - 1].group.bottom).toBeLessThanOrEqual(metric.group.top + 1)
  })
  expect(imprintMetricTypography).toHaveLength(8)
  const imprintLabels = imprintMetricTypography.filter((metric) => metric.role === 'metric-label')
  const imprintValues = imprintMetricTypography.filter((metric) => metric.dataRole === 'num')
  const imprintUnits = imprintMetricTypography.filter((metric) => metric.role === 'metric-unit')
  expect(imprintLabels.every((metric) => metric.fontFamily.includes('Noto Sans SC') && metric.fontWeight === '700')).toBe(true)
  expect(imprintValues.every((metric) => metric.fontFamily.includes('Rajdhani') && metric.fontWeight === '800')).toBe(true)
  expect(imprintUnits.every((metric) => metric.fontFamily.includes('Rajdhani'))).toBe(true)
  await hideDevPortal(normal.page)
  await normal.page.screenshot({ path: join(OUTPUT_DIR, 'imprint-vertical-first-375.png'), fullPage: false })

  await normal.page.goto(`${baseURL}/share?template=base-vertical-classic`, { waitUntil: 'domcontentloaded' })
  const poster = normal.page.getByTestId('share-main-poster-preview')
  await expect(poster).toHaveAttribute('data-current-template', 'base-vertical-classic')
  await expect(normal.page.locator('[data-template-thumb="base-vertical-classic"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(normal.page.locator('[data-template-thumb="base-vertical-classic"] [aria-label*="解锁"], [data-template-thumb="base-vertical-classic"] [class*="lock"]')).toHaveCount(0)
  await expect(poster.getByTestId('share-hero-preview')).toHaveAttribute('data-template', 'base-vertical-classic')
  const shareMetricMotion = await readMotionMetrics(poster.getByTestId('share-hero-preview'))
  expect(shareMetricMotion.map((metric) => metric.kind)).toEqual(['altitude', 'distance', 'duration'])
  expect(shareMetricMotion.map((metric) => metric.format)).toEqual(['integer', 'decimal-1', 'duration'])
  const normalPhases = await waitForTerminalMotion(normal.page)
  expect(normalPhases.map((phase) => phase.phase)).toEqual(['data', 'route', 'brand'])
  const normalViewport = await readViewport(normal.page)
  expect(normalViewport.documentWidth).toBe(normalViewport.viewportWidth)

  await normal.page.goto(`${baseURL}/share?template=premium-data-scatter`, { waitUntil: 'domcontentloaded' })
  const hudPreview = normal.page.getByTestId('share-main-poster-preview').getByTestId('share-hero-preview')
  await expect(hudPreview).toHaveAttribute('data-template', 'premium-data-scatter')
  const hudValue = hudPreview.locator('[data-role="num"][data-motion-kind="altitude"]').first()
  const hudUnit = hudValue.locator('xpath=following-sibling::span[1]')
  const hudLabel = hudPreview.getByText('最高海拔', { exact: true }).first()
  const hudTypography = {
    value: await hudValue.evaluate((element) => getComputedStyle(element).fontFamily),
    unit: await hudUnit.evaluate((element) => getComputedStyle(element).fontFamily),
    label: await hudLabel.evaluate((element) => getComputedStyle(element).fontFamily),
  }
  expect(hudTypography.value).toContain('Rajdhani')
  expect(hudTypography.unit).toContain('Rajdhani')
  expect(hudTypography.label).toContain('Noto Sans SC')

  await normal.page.goto(`${baseURL}/share?template=base-vertical-classic`, { waitUntil: 'domcontentloaded' })
  await hideDevPortal(normal.page)
  await normal.page.screenshot({ path: join(OUTPUT_DIR, 'share-vertical-editor-375.png'), fullPage: false })
  const normalVideo = normal.page.video()
  await normal.context.close()

  const reduced = await openContext(browser, 'reduce')
  await reduced.page.goto(`${baseURL}/share?template=base-vertical-classic`, { waitUntil: 'domcontentloaded' })
  await expect(reduced.page.getByTestId('share-main-poster-preview')).toHaveAttribute('data-current-template', 'base-vertical-classic')
  const reducedPhases = await waitForTerminalMotion(reduced.page)
  expect(reducedPhases.map((phase) => phase.phase)).toEqual(['data', 'route', 'brand'])
  const reducedViewport = await readViewport(reduced.page)
  expect(reducedViewport.documentWidth).toBe(reducedViewport.viewportWidth)
  await reduced.context.close()

  const evidence = {
    viewport: { width: 375, height: 812 },
    normal: {
      phases: normalPhases,
      viewport: normalViewport,
      imprintMetricMotion,
      imprintMetricGeometry,
      imprintMetricTypography,
      shareMetricMotion,
      hudTypography,
    },
    reduced: { phases: reducedPhases, viewport: reducedViewport },
    interceptedAnalyticsRequests: analyticsRequests,
    screenshots: [
      join(OUTPUT_DIR, 'imprint-vertical-first-375.png'),
      join(OUTPUT_DIR, 'share-vertical-editor-375.png'),
    ],
    overlayRecording: normalVideo ? await normalVideo.path() : null,
    evidenceBoundary: 'DB-free browser rendering of the real registered template; the video records the local 9:16 template overlay, not a share API export or user-owned media upload.',
  }
  writeFileSync(join(OUTPUT_DIR, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
})

test('base Vertical Share preview restores every template text target at motion terminal', async ({ browser, baseURL }) => {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const normal = await openContext(browser, 'no-preference')
  await normal.page.goto(`${baseURL}/share?template=base-vertical-classic`, { waitUntil: 'domcontentloaded' })
  const normalPoster = normal.page.getByTestId('share-main-poster-preview')
  await expect(normalPoster).toHaveAttribute('data-current-template', 'base-vertical-classic')
  await waitForTerminalMotion(normal.page)
  await expect.poll(async () => hasCompleteVerticalTerminalContent(await readVerticalTerminalContent(normalPoster))).toBe(true)
  const normalContent = await readVerticalTerminalContent(normalPoster)
  await hideDevPortal(normal.page)
  await normal.page.screenshot({ path: join(OUTPUT_DIR, 'share-vertical-editor-terminal-r1-375.png'), fullPage: false })
  await normal.context.close()

  const reduced = await openContext(browser, 'reduce')
  await reduced.page.goto(`${baseURL}/share?template=base-vertical-classic`, { waitUntil: 'domcontentloaded' })
  const reducedPoster = reduced.page.getByTestId('share-main-poster-preview')
  await expect(reducedPoster).toHaveAttribute('data-current-template', 'base-vertical-classic')
  await waitForTerminalMotion(reduced.page)
  await expect.poll(async () => hasCompleteVerticalTerminalContent(await readVerticalTerminalContent(reducedPoster))).toBe(true)
  const reducedContent = await readVerticalTerminalContent(reducedPoster)
  await reduced.context.close()

  writeFileSync(join(OUTPUT_DIR, 'vertical-motion-r1-evidence.json'), `${JSON.stringify({
    viewport: { width: 375, height: 812 },
    normal: normalContent,
    reduced: reducedContent,
    screenshot: join(OUTPUT_DIR, 'share-vertical-editor-terminal-r1-375.png'),
  }, null, 2)}\n`)
})

test('Share and Imprint route draws settle after replay and reduced-motion rendering', async ({ browser, baseURL }) => {
  const routes = [
    { name: 'Share', path: '/share?template=base-vertical-classic', selector: '[data-testid="share-main-poster-preview"]' },
    { name: 'Imprint', path: '/imprint', selector: '[data-imprint-card][data-index="0"]' },
  ]

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const { context, page } = await openContext(browser, reducedMotion)
    try {
      for (const route of routes) {
        await page.goto(`${baseURL}${route.path}`, { waitUntil: 'domcontentloaded' })
        const scope = page.locator(route.selector)
        await expect(scope).toBeVisible()
        await expect.poll(async () => hasSettledDrawTerminal(await readDrawTerminalState(scope))).toBe(true)

        if (reducedMotion === 'no-preference') {
          await page.reload({ waitUntil: 'domcontentloaded' })
          await expect(scope).toBeVisible()
          await expect.poll(async () => hasSettledDrawTerminal(await readDrawTerminalState(scope))).toBe(true)
        }
      }
    } finally {
      await context.close()
    }
  }
})

test('Share defaults to the first listed template while a valid URL template remains selected', async ({ browser, baseURL }) => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const { context, page } = await openContext(browser, 'no-preference')

  async function expectTemplateSelection(template: string, progress: string) {
    const poster = page.getByTestId('share-main-poster-preview')
    await expect(poster).toHaveAttribute('data-current-template', template)
    await expect(page.locator(`[data-template-thumb="${template}"]`)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('share-template-strip')).toContainText(progress)
  }

  try {
    await page.goto(`${baseURL}/share`, { waitUntil: 'domcontentloaded' })
    await expectTemplateSelection('base-vertical-classic', '01 / 11')
    await waitForTerminalMotion(page)
    const viewport = await readViewport(page)
    expect(viewport.documentWidth).toBe(viewport.viewportWidth)
    await hideDevPortal(page)
    const screenshot = join(OUTPUT_DIR, 'share-default-template-r1-375.png')
    await page.screenshot({ path: screenshot, fullPage: false })

    await page.goto(`${baseURL}/share?template=premium-mono-film`, { waitUntil: 'domcontentloaded' })
    await expectTemplateSelection('premium-mono-film', '08 / 11')

    await page.goto(`${baseURL}/share?template=not-a-template`, { waitUntil: 'domcontentloaded' })
    await expectTemplateSelection('base-vertical-classic', '01 / 11')

    writeFileSync(join(OUTPUT_DIR, 'share-default-template-r1-evidence.json'), `${JSON.stringify({
      viewport,
      defaultTemplate: 'base-vertical-classic',
      explicitTemplate: 'premium-mono-film',
      invalidTemplateFallback: 'base-vertical-classic',
      screenshot,
    }, null, 2)}\n`)
  } finally {
    await context.close()
  }
})
