import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const OUTPUT_DIR = join(process.cwd(), 'output/route-geometry-stage2/visual')
const HUASHAN_ID = '216508c9-ffca-4164-8010-534d8650ee64'
const LONG_ROUTE_SAMPLE_ID = '906ee700-5779-5370-8cbe-780797a82f8d'

async function installReadOnlyNetworkGuard(page: Page) {
  const blockedMutations: string[] = []

  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api/weather/**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'route_geometry_visual_test' }),
    })
  })
  page.on('request', (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return
    if (request.url().includes('/api/analytics/event')) return
    blockedMutations.push(`${request.method()} ${request.url()}`)
  })

  return blockedMutations
}

async function assertNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
}

test('mountain route reference renders honest empty and complete trace states', async ({ page }) => {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await page.setViewportSize({ width: 375, height: 812 })
  const blockedMutations = await installReadOnlyNetworkGuard(page)

  await page.goto(`/mountain/${HUASHAN_ID}`, { waitUntil: 'domcontentloaded' })
  const emptySection = page.getByTestId('mountain-route-section')
  await emptySection.scrollIntoViewIfNeeded()
  await expect(emptySection.getByText('暂未收录参考轨迹')).toBeVisible()
  await expect(page.getByTestId('mountain-route-trace-shape')).toHaveCount(0)
  await emptySection.screenshot({ path: join(OUTPUT_DIR, 'no-track-375.png') })
  await assertNoHorizontalOverflow(page)

  await page.goto(`/mountain/${LONG_ROUTE_SAMPLE_ID}?routeGeometryFixture=trace`, { waitUntil: 'domcontentloaded' })
  const traceSection = page.getByTestId('mountain-route-section')
  await traceSection.scrollIntoViewIfNeeded()
  const traceShape = page.getByTestId('mountain-route-trace-shape')
  await expect(traceShape).toBeVisible()
  await expect(traceSection.getByText('轨迹形状示意，不是导航地图')).toBeVisible()
  await expect(traceShape.locator('path')).toHaveCount(2)
  await traceSection.screenshot({ path: join(OUTPUT_DIR, 'long-trace-shape-375.png') })
  await assertNoHorizontalOverflow(page)

  expect(blockedMutations).toEqual([])
})
