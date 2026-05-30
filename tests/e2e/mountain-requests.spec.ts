import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'

const importFixture = join(process.cwd(), 'tests/fixtures/import-dedupe/duplicate-track.gpx')

async function mockImportParse(page: Page) {
  await page.route('**/api/import/parse', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        parsedData: {
          format: 'gpx',
          fileName: 'wild-ridge.gpx',
          name: '未收录山脊线',
          durationSeconds: 3600,
          distanceMeters: 8200,
          elevationGainMeters: 620,
          maxElevation: 1330,
          minElevation: 710,
          trackContentHash: 'e2e-track-hash',
          trackPoints: [
            { latitude: 30.1, longitude: 119.1, elevation: 710, timestamp: '2026-05-30T01:00:00.000Z' },
            { latitude: 30.2, longitude: 119.2, elevation: 1330, timestamp: '2026-05-30T02:00:00.000Z' },
          ],
          suggestedMountain: null,
          suggestedCandidates: [],
        },
      }),
    })
  })
}

async function parseMockTrack(page: Page, root: string) {
  await page.goto(`${root}/import`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[aria-label="轨迹文件"]').setInputFiles(importFixture)
  await expect(page.getByRole('button', { name: '开始解析' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '开始解析' }).click()
  await expect(page.getByText('解析完成')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '继续' }).click()
}

async function loginAdmin(page: Page, root: string, from: string) {
  await page.goto(`${root}/auth/login?from=${encodeURIComponent(from)}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com').fill('qa-admin-1774068792@example.com')
  await page.getByPlaceholder(/至少6位|••••••••/).fill('PeakTrekker123!')
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await page.waitForURL((url) => !/\/auth\/login/.test(url.pathname), { timeout: 30_000 }).catch(() => {})
  if (!page.url().includes(from)) {
    await page.goto(`${root}${from}`, { waitUntil: 'domcontentloaded' })
  }
}

test('no-match request keeps existing feedback and submits mountain request payload', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })
  await mockImportParse(page)

  let requestPayload: Record<string, unknown> | null = null
  await page.route('**/api/mountain-requests', async (route) => {
    requestPayload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, deduped: false }),
    })
  })

  await parseMockTrack(page, root)
  await expect(page.getByRole('heading', { name: '还没找到对应的山' })).toBeVisible({ timeout: 20_000 })
  await page.getByText('申请收录山峰').click()
  await expect(page.getByText('正在提交您的山峰反馈…')).toBeVisible()
  await expect(page.getByText('没有我想去的山怎么办')).toBeVisible()
  await expect(page.getByText('已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放')).toBeVisible()
  await expect(page.getByText('正在提交您的山峰反馈…')).not.toBeVisible()
  await expect(page.getByText('申请暂时没写入，请稍后重试。')).not.toBeVisible()

  await expect.poll(() => requestPayload).not.toBeNull()
  expect(requestPayload?.requestSource).toBe('import_no_match')
  expect(requestPayload?.importFormat).toBe('gpx')
  expect(requestPayload?.trackContentHash).toBe('e2e-track-hash')
})

test('distance-blocked request submits candidate context', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await mockImportParse(page)

  await page.route('**/api/mountains/search?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        mountains: [
          {
            id: '216508c9-ffca-4164-8010-534d8650ee64',
            name: '华山',
            altitude: 2154,
            province: '陕西',
            latitude: 34.482,
            longitude: 110.083,
          },
        ],
      }),
    })
  })

  let requestPayload: Record<string, unknown> | null = null
  await page.route('**/api/mountain-requests', async (route) => {
    requestPayload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, deduped: false }),
    })
  })

  await parseMockTrack(page, root)
  await page.getByText('手动搜索关联山峰').click()
  await page.getByLabel('搜索山峰').fill('华山')
  await expect(page.getByText('华山')).toBeVisible({ timeout: 20_000 })
  await page.getByText('华山').click()
  await expect(page.getByText(/无法匹配此山峰/)).toBeVisible()
  await page.getByRole('button', { name: '申请收录山峰' }).click()

  await expect.poll(() => requestPayload).not.toBeNull()
  expect(requestPayload?.requestSource).toBe('import_distance_blocked')
  expect(requestPayload?.candidateMountainName).toBe('华山')
  expect(requestPayload?.province).toBe('陕西')
  expect(typeof requestPayload?.candidateDistanceM).toBe('number')
})

test('admin read-only request demo escapes XSS text and has no mutation actions', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })
  await loginAdmin(page, root, '/admin/mountains/requests?fu6Demo=1')

  await expect(page.getByTestId('admin-mountain-requests-list')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('<img src=x onerror=alert(1)> 华山外侧路线')).toBeVisible()
  await expect(page.getByText('距离阻断')).toBeVisible()
  await expect(page.getByRole('button', { name: /审核|入库|删除|标记/ })).toHaveCount(0)

  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflowX).toBe(false)
})
