import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUTPUT_DIR = join(
  process.cwd(),
  'output/mountain-carousel-hotfix-acceptance/performance/after',
)

type NetworkRecord = {
  method: string
  url: string
  disposition: 'allowed' | 'blocked' | 'stubbed'
}

async function installReadOnlyGuard(context: BrowserContext) {
  const records: NetworkRecord[] = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const url = new URL(request.url())
    if (url.pathname === '/api/analytics/event') {
      records.push({ method, url: request.url(), disposition: 'stubbed' })
      await route.fulfill({ status: 204 })
      return
    }
    if (url.pathname.startsWith('/api/weather/')) {
      records.push({ method, url: request.url(), disposition: 'stubbed' })
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weather stubbed for read-only performance evidence' }),
      })
      return
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      records.push({ method, url: request.url(), disposition: 'blocked' })
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return records
}

async function installPerformanceObservers(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    localStorage.setItem('peak_trekker_province_draft', '北京')
    const state = window as Window & {
      __explorePerformance?: {
        cls: number
        shifts: Array<{ value: number; startTime: number }>
        firstCoverVisibleAtMs: number | null
      }
    }
    state.__explorePerformance = {
      cls: 0,
      shifts: [],
      firstCoverVisibleAtMs: null,
    }
    new PerformanceObserver((list) => {
      for (const rawEntry of list.getEntries()) {
        const entry = rawEntry as PerformanceEntry & { value: number; hadRecentInput: boolean }
        if (entry.hadRecentInput) continue
        state.__explorePerformance!.cls += entry.value
        state.__explorePerformance!.shifts.push({
          value: entry.value,
          startTime: entry.startTime,
        })
      }
    }).observe({ type: 'layout-shift', buffered: true })

    document.addEventListener('load', (event) => {
      const image = event.target
      if (!(image instanceof HTMLImageElement)) return
      if (image.dataset.testid !== 'explore-mountain-card-cover-image') return
      requestAnimationFrame(() => {
        if (state.__explorePerformance!.firstCoverVisibleAtMs !== null) return
        const rect = image.getBoundingClientRect()
        const style = getComputedStyle(image)
        const visible = (
          rect.width > 0
          && rect.height > 0
          && rect.bottom > 0
          && rect.top < innerHeight
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0
        )
        if (visible) state.__explorePerformance!.firstCoverVisibleAtMs = performance.now()
      })
    }, true)
  })
}

function serverProvenance() {
  const listener = execFileSync(
    'lsof',
    ['-nP', '-iTCP:3115', '-sTCP:LISTEN', '-t'],
    { encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)
  expect(listener).toHaveLength(1)
  const pid = listener[0]
  return {
    pid,
    listener: execFileSync(
      'lsof',
      ['-nP', '-a', '-p', pid, '-iTCP:3115', '-sTCP:LISTEN'],
      { encoding: 'utf8' },
    ),
    cwd: execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' }),
    git_branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    git_head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    process_cwd: process.cwd(),
  }
}

async function waitForVisibleCoverImages(page: Page) {
  await expect.poll(() => page.getByTestId('explore-mountain-card-cover-image').evaluateAll((images) => {
    const visibleImages = images.filter((image) => {
      const rect = image.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < innerHeight
    })
    return (
      visibleImages.length > 0
      && visibleImages.every((image) => (
        image instanceof HTMLImageElement
        && image.complete
        && image.naturalWidth > 0
      ))
    )
  })).toBe(true)
}

test('Explore production build batches cards and loads thumbnails without mutations', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000)
  await mkdir(OUTPUT_DIR, { recursive: true })
  const networkRecords = await installReadOnlyGuard(context)
  await installPerformanceObservers(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200_000,
    uploadThroughput: 93_750,
    connectionType: 'cellular4g',
  })
  const requests = new Map<string, { url: string; type: string }>()
  const completed: Array<{ url: string; type: string; encodedDataLength: number }> = []
  cdp.on('Network.requestWillBeSent', (event) => {
    requests.set(event.requestId, { url: event.request.url, type: event.type })
  })
  cdp.on('Network.loadingFinished', (event) => {
    const request = requests.get(event.requestId)
    if (request) completed.push({ ...request, encodedDataLength: event.encodedDataLength })
  })

  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  const cards = page.getByTestId('explore-mountain-card')
  await expect(cards).toHaveCount(12)
  await expect.poll(() => page.evaluate(() => (
    (window as Window & {
      __explorePerformance?: { firstCoverVisibleAtMs: number | null }
    }).__explorePerformance?.firstCoverVisibleAtMs ?? null
  ))).not.toBeNull()
  await page.waitForTimeout(1_000)

  const initialThumbnailRequests = [...requests.values()]
    .filter((request) => request.url.includes('/thumb-v1-'))
  const initialThumbnailResponses = completed
    .filter((request) => request.url.includes('/thumb-v1-'))
  expect(initialThumbnailRequests.length).toBeLessThanOrEqual(12)
  expect(initialThumbnailResponses.reduce(
    (sum, response) => sum + response.encodedDataLength,
    0,
  )).toBeLessThanOrEqual(2 * 1024 * 1024)
  await expect(page.locator('[data-thumbnail-source="fallback"]')).toHaveCount(0)
  await expect(page.locator('[data-cover-failed="true"]')).toHaveCount(0)
  await page.screenshot({ path: join(OUTPUT_DIR, 'explore-first-viewport.png') })

  await page.getByTestId('explore-load-more-sentinel').scrollIntoViewIfNeeded()
  await expect(cards).toHaveCount(24)
  await waitForVisibleCoverImages(page)
  await page.screenshot({ path: join(OUTPUT_DIR, 'explore-first-batch-end.png') })
  await page.getByTestId('explore-load-more-sentinel').scrollIntoViewIfNeeded()
  await expect(cards).toHaveCount(36)
  await waitForVisibleCoverImages(page)
  await page.screenshot({ path: join(OUTPUT_DIR, 'explore-second-batch-complete.png') })

  const search = page.getByPlaceholder('搜山名、地区、海拔')
  await search.fill('加舒尔布鲁木 I 峰')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toHaveAttribute(
    'href',
    '/mountain/906ee700-5779-5370-8cbe-780797a82f8d',
  )
  await search.fill('')
  await expect(cards).toHaveCount(12)
  await page.getByRole('button', { name: '入门线', exact: true }).click()
  await expect(cards).toHaveCount(12)
  await expect.poll(() => cards.evaluateAll((nodes) => (
    nodes.every((node) => node.getAttribute('data-difficulty') === 'beginner')
  ))).toBe(true)
  await page.getByRole('button', { name: '附近', exact: true }).click()
  await expect(cards).toHaveCount(12)

  const firstCard = cards.first()
  const exploreImageUrl = await firstCard
    .getByTestId('explore-mountain-card-cover-image')
    .getAttribute('src')
  expect(exploreImageUrl).toContain('/thumb-v1-')
  const performance = await page.evaluate(() => (
    (window as Window & { __explorePerformance?: unknown }).__explorePerformance
  ))
  const detailHref = await firstCard.getAttribute('href')
  expect(detailHref).toMatch(/^\/mountain\//)
  await page.goto(detailHref!, { waitUntil: 'domcontentloaded' })
  const detailImageUrl = await page
    .getByTestId('mountain-hero-carousel')
    .locator('img')
    .first()
    .getAttribute('src')
  expect(detailImageUrl).not.toContain('/thumb-v1-')

  const metrics = {
    mode: 'local production build E2E',
    initial_dom_count: 12,
    first_scroll_dom_count: 24,
    second_scroll_dom_count: 36,
    initial_thumbnail_request_count: initialThumbnailRequests.length,
    initial_thumbnail_bytes: initialThumbnailResponses.reduce(
      (sum, response) => sum + response.encodedDataLength,
      0,
    ),
    performance,
    explore_image_url: exploreImageUrl,
    detail_image_url: detailImageUrl,
    network_records: networkRecords,
  }
  await writeFile(join(OUTPUT_DIR, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)
  await writeFile(
    join(OUTPUT_DIR, 'server-provenance.json'),
    `${JSON.stringify(serverProvenance(), null, 2)}\n`,
  )
  expect(networkRecords.filter((record) => record.disposition === 'blocked')).toEqual([])
})

type Box = { x: number; y: number; width: number; height: number }

function overlapArea(left: Box, right: Box) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

async function captureHeroGeometry(
  page: Page,
  sample: { label: string; href: string },
) {
  await page.goto(sample.href, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('mountain-hero-indicator')).toBeVisible()
  await expect.poll(() => page.evaluate(async () => {
    await document.fonts.ready
    const targets = [
      ...document.querySelectorAll<HTMLElement>('[data-mountain-motion="hero"], [data-mountain-hero-item]'),
    ]
    return targets.length > 0 && targets.every((target) => {
      const style = getComputedStyle(target)
      return style.transform === 'none' && style.opacity === '1'
    })
  })).toBe(true)
  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector)
      return node?.getBoundingClientRect().toJSON() ?? null
    }
    const dotRects = [...document.querySelectorAll<HTMLElement>('[data-testid="mountain-hero-dot"]')]
      .map((dot) => dot.getBoundingClientRect())
    const left = Math.min(...dotRects.map((box) => box.left))
    const right = Math.max(...dotRects.map((box) => box.right))
    const top = Math.min(...dotRects.map((box) => box.top))
    const bottom = Math.max(...dotRects.map((box) => box.bottom))
    return {
      dot_group: { x: left, y: top, width: right - left, height: bottom - top },
      title: rect('[data-mountain-hero-item="title"]'),
      location: rect('[data-mountain-hero-item="location"]'),
      chip: rect('[data-mountain-hero-item="chip"]'),
      toolbar: rect('[data-testid="mountain-hero-toolbar"]'),
    }
  })
  const overlaps = Object.fromEntries(
    (['title', 'location', 'chip', 'toolbar'] as const).map((key) => [
      key,
      geometry[key] ? overlapArea(geometry.dot_group, geometry[key]) : null,
    ]),
  )
  await page.screenshot({ path: join(OUTPUT_DIR, `dots-${sample.label}.png`) })
  const evidence = { ...sample, ...geometry, overlaps }
  await writeFile(
    join(OUTPUT_DIR, `dots-${sample.label}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
  )
  for (const key of ['title', 'location', 'chip', 'toolbar'] as const) {
    expect(geometry[key]).not.toBeNull()
    expect(
      overlapArea(geometry.dot_group, geometry[key]!),
      `${sample.label}: dots overlap ${key}`,
    ).toBe(0)
  }
  return evidence
}

test('carousel dots remain centered at the bottom without overlapping hero copy', async ({
  context,
  page,
}) => {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const networkRecords = await installReadOnlyGuard(context)
  const samples = [
    { label: 'short-huashan', href: '/mountain/216508c9-ffca-4164-8010-534d8650ee64' },
    { label: 'three-image-snow', href: '/mountain/906ee700-5779-5370-8cbe-780797a82f8d' },
    { label: 'long-name', href: '/mountain/5e633589-7142-5771-9243-1f5ea21f4471' },
  ]
  const geometries = []
  for (const sample of samples) geometries.push(await captureHeroGeometry(page, sample))
  await writeFile(
    join(OUTPUT_DIR, 'carousel-dot-bboxes.json'),
    `${JSON.stringify(geometries, null, 2)}\n`,
  )
  expect(networkRecords.filter((record) => record.disposition === 'blocked')).toEqual([])
})
