import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUTPUT_DIR = join(process.cwd(), 'output/t9b-acceptance')
const T9B_BASE_URL = process.env.T9B_BASE_URL ?? 'http://127.0.0.1:3100'

const MOUNTAINS = {
  huanggang: 'd5374798-ed2d-44b5-b338-b11cc8e207b7',
  muztagata: '1c250ea9-7c86-4322-9f10-f17e72430f4c',
  kawagebo: '39da9919-3efd-4523-b5a2-2bf9ba6a9eaa',
  yulong: 'a470ba81-6504-4f7f-b76b-fa01919197f3',
} as const

type DetailEvidence = {
  mountain: string
  stats: Array<{ kind: string | null; value: string; label: string; countValue: string | null }>
  decisionText: string
  cta: { tag: string; text: string; disabled: boolean; href: string | null }
  overflow: { viewportWidth: number; documentWidth: number; overflowX: boolean }
}

async function makeReadOnly(page: Page) {
  const unexpectedMutationRequests: Array<{ method: string; url: string }> = []

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    const method = request.method()

    if (url.includes('/api/analytics/event')) {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (url.includes('/api/weather/')) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'T9b read-only evidence stub' }),
      })
      return
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      unexpectedMutationRequests.push({ method, url })
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })

  await page.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.localStorage.setItem('peak_trekker_province_draft', '北京')
  })

  return unexpectedMutationRequests
}

async function readOverflow(page: Page) {
  return page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  }))
}

async function collectDetailEvidence(page: Page, mountain: string): Promise<DetailEvidence> {
  const stats = await page.locator('[data-mountain-stat-tile]').evaluateAll((tiles) => tiles.map((tile) => {
    const value = tile.querySelector<HTMLElement>('[data-mountain-stat-value]')
    const label = tile.lastElementChild
    return {
      kind: tile.getAttribute('data-mountain-stat-tile'),
      value: value?.textContent?.trim() ?? '',
      label: label?.textContent?.trim() ?? '',
      countValue: value?.getAttribute('data-count-value') ?? null,
    }
  }))
  const cta = await page.getByTestId('mountain-primary-cta').evaluate((element) => ({
    tag: element.tagName.toLowerCase(),
    text: element.textContent?.trim() ?? '',
    disabled: element instanceof HTMLButtonElement
      ? element.disabled
      : element.getAttribute('aria-disabled') === 'true',
    href: element.getAttribute('href'),
  }))

  return {
    mountain,
    stats,
    decisionText: (await page.getByTestId('mountain-decision-section').textContent())?.trim() ?? '',
    cta,
    overflow: await readOverflow(page),
  }
}

async function openDetail(page: Page, id: string) {
  await page.goto(`${T9B_BASE_URL}/mountain/${id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('mountain-detail-page')).toBeVisible()
  await expect(page.locator('[data-mountain-stat-tile]')).toHaveCount(4)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1400)
}

async function captureDecisionViewport(page: Page, filename: string) {
  const riskLabel = page.getByText('天气与路线仅供决策参考', { exact: true })
  await riskLabel.evaluate((element) => {
    const targetTop = window.scrollY + element.getBoundingClientRect().top - 180
    window.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
  })
  await page.waitForTimeout(120)
  const rowRects = await page
    .locator('[data-mountain-motion-child="decision-card"] > div')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().toJSON()))
  for (let index = 1; index < rowRects.length; index += 1) {
    expect(rowRects[index].top).toBeGreaterThanOrEqual(rowRects[index - 1].bottom)
  }
  await page.screenshot({ path: join(OUTPUT_DIR, filename) })
}

test.use({ viewport: { width: 375, height: 812 } })

test('T9b honest mountain display and filters stay read-only at 375px', async ({ page }) => {
  test.setTimeout(120_000)
  await mkdir(OUTPUT_DIR, { recursive: true })
  const unexpectedMutationRequests = await makeReadOnly(page)
  const details: DetailEvidence[] = []

  await openDetail(page, MOUNTAINS.huanggang)
  await expect(page.locator('[data-mountain-stat-value="distance"]')).toHaveText('--')
  await expect(page.locator('[data-mountain-stat-value="gain"]')).toHaveText('1467')
  await expect(page.locator('[data-mountain-stat-tile="gain"]')).toContainText('估算')
  await expect(page.locator('[data-mountain-stat-value="duration"]')).toHaveText('--')
  await expect(page.locator('[data-mountain-stat-value="distance"]')).not.toHaveAttribute('data-count-value')
  await expect(page.locator('[data-mountain-stat-value="duration"]')).not.toHaveAttribute('data-count-value')
  details.push(await collectDetailEvidence(page, '黄岗山'))
  await page.screenshot({ path: join(OUTPUT_DIR, 'huanggang-after-375.png'), fullPage: true })

  await openDetail(page, MOUNTAINS.muztagata)
  await expect(page.locator('[data-mountain-stat-value="distance"]')).toHaveText('--')
  await expect(page.locator('[data-mountain-stat-value="gain"]')).toHaveText('--')
  await expect(page.locator('[data-mountain-stat-value="duration"]')).toHaveText('--')
  await expect(page.getByTestId('mountain-decision-section')).toContainText(
    '自然保护区核心区及未开发未开放区域禁止擅自进入',
  )
  await expect(page.getByTestId('mountain-decision-section')).toContainText('开放范围以当地最新公告为准')
  details.push(await collectDetailEvidence(page, '慕士塔格峰'))
  await captureDecisionViewport(page, 'expert-muztagata-375.png')

  await openDetail(page, MOUNTAINS.kawagebo)
  await expect(page.getByTestId('mountain-decision-section')).toContainText('当前不开放')
  await expect(page.getByTestId('mountain-primary-cta')).toBeDisabled()
  await expect(page.getByTestId('mountain-primary-cta')).toHaveText('暂不开放攀登')
  details.push(await collectDetailEvidence(page, '卡瓦格博'))
  await captureDecisionViewport(page, 'closed-kawagebo-375.png')

  await openDetail(page, MOUNTAINS.yulong)
  await expect(page.locator('[data-mountain-stat-value="gain"]')).toHaveText('--')
  await expect(page.getByTestId('mountain-decision-section')).toContainText(
    '自然保护区核心区及未开发未开放区域禁止擅自进入',
  )
  await expect(page.getByTestId('mountain-decision-section')).toContainText('开放范围以当地最新公告为准')
  await expect(page.getByTestId('mountain-primary-cta')).toBeDisabled()
  details.push(await collectDetailEvidence(page, '玉龙雪山'))
  await captureDecisionViewport(page, 'advanced-yulong-risk-375.png')

  await page.goto(`${T9B_BASE_URL}/explore`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('找山出发')).toBeVisible()
  const search = page.getByPlaceholder('搜山名、地区、海拔')
  await search.fill('嵩山')
  const songshanCard = page.getByTestId('explore-mountain-card').filter({ hasText: '嵩山' })
  await expect(songshanCard).toBeVisible()
  await expect(songshanCard.getByTestId('explore-mountain-card-metrics')).toContainText('8km')
  await expect(songshanCard.getByTestId('explore-mountain-card-metrics')).toContainText('4~5h')
  const songshanMetrics = (await songshanCard.getByTestId('explore-mountain-card-metrics').textContent())?.trim()
  await songshanCard.screenshot({ path: join(OUTPUT_DIR, 'explore-card-honest-meta-375.png') })

  await search.fill('黄岗山')
  const huanggangCard = page.getByTestId('explore-mountain-card').filter({ hasText: '黄岗山' })
  await expect(huanggangCard).toBeVisible()
  await expect(huanggangCard.getByTestId('explore-mountain-card-metrics')).toHaveCount(0)
  await page.getByRole('button', { name: '展开高级筛选' }).click({ force: true })
  const allCount = await page.getByTestId('explore-mountain-card').count()
  await page.screenshot({ path: join(OUTPUT_DIR, 'explore-length-filter-all-375.png'), fullPage: true })

  await page.getByRole('button', { name: '短线', exact: true }).click({ force: true })
  await expect(huanggangCard).toHaveCount(0)
  await expect(page.getByText('没有找到匹配的山峰')).toBeVisible()
  const shortCount = await page.getByTestId('explore-mountain-card').count()
  await page.screenshot({ path: join(OUTPUT_DIR, 'explore-length-filter-short-375.png'), fullPage: true })

  const exploreOverflow = await readOverflow(page)
  expect(details.every((item) => item.overflow.overflowX === false)).toBe(true)
  expect(exploreOverflow.overflowX).toBe(false)
  expect(allCount).toBe(1)
  expect(shortCount).toBe(0)
  expect(unexpectedMutationRequests).toEqual([])

  await writeFile(join(OUTPUT_DIR, 't9b-dom-evidence.json'), `${JSON.stringify({
    readOnlyInterception: {
      analytics: 'fulfilled locally with 204',
      weather: 'fulfilled locally with 503',
      unexpectedMutationRequests,
    },
    details,
    explore: {
      songshanMetrics,
      huanggangAllCount: allCount,
      huanggangShortCount: shortCount,
      overflow: exploreOverflow,
    },
  }, null, 2)}\n`)
})
