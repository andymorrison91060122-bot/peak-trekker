import { expect, test } from '@playwright/test'
import { backdateTrekSessionForTest } from './community.helpers'
import {
  HUASHAN,
  appendSummitServerGpsPoints,
  captureOptionalE2EScreenshot,
  expectNoRuntimeIssueBadge,
  feedSummitGpsPoints,
  fetchCheckinForE2E,
  openAuthenticatedTrek,
} from './trek-regression.helpers'

test('testMode trek can confirm summit without requiring an uploaded photo', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await openAuthenticatedTrek({
    page,
    root,
    initialGps: {
      latitude: HUASHAN.latitude - 0.02,
      longitude: HUASHAN.longitude - 0.02,
      altitude: 1329,
      accuracy: 5,
    },
  })

  const confirmButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  if (!(await confirmButton.isEnabled({ timeout: 20_000 }).catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  await expect(confirmButton).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '确认这座山，开始记录准备' }).click()
  await expect(page.getByTestId('trek-dev-threshold-chip')).toContainText('1 点 / 10s')
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeEnabled({ timeout: 20_000 })
  const startResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"start_trek_session"') ?? false
  })
  await page.getByRole('button', { name: '从这里开始' }).click()
  const startResponse = await startResponsePromise
  const startBody = await startResponse.json().catch(() => ({}))
  expect(startResponse.status(), JSON.stringify(startBody)).toBe(200)
  const sessionId = String(startBody?.sessionId ?? '')
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })

  await feedSummitGpsPoints(page)
  await appendSummitServerGpsPoints(page, sessionId)
  await backdateTrekSessionForTest(sessionId, 120_000)
  await expect(page.getByTestId('trek-near-summit-view')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('就绪')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('trek-near-summit-cta').click()

  await expect(page.getByTestId('trek-summit-photo-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('trek-summit-photo-empty-state')).toBeVisible()
  await expect(page.getByTestId('trek-summit-photo-file')).toHaveText('未选择照片（可选）')
  await expect(page.getByText('GPS 轨迹已能作为登顶核验依据')).toBeVisible()
  await captureOptionalE2EScreenshot(page, 'manual-no-photo-confirm-375.png')

  const verifyResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"verify_summit_checkin"') ?? false
  })

  await page.getByRole('button', { name: '确认登顶' }).click()

  const verifyResponse = await verifyResponsePromise
  const verifyBody = await verifyResponse.json().catch(() => ({}))
  expect(verifyResponse.status(), JSON.stringify(verifyBody)).toBe(200)
  const checkinId = String(verifyBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)

  await expect(page.getByTestId('trek-summit-confirmed-view')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[role="alert"]').filter({ hasText: '登顶核验成功' })).toBeVisible()

  const checkin = await fetchCheckinForE2E(checkinId)
  expect(checkin.completion_status ?? 'complete').toBe('complete')
  expect(checkin.verified_at).toBeTruthy()
  expect(checkin.photo_url).toBeNull()

  const duplicateFinishResponse = await page.request.post('/api/trek/actions', {
    data: {
      action: 'finish_incomplete_trek',
      sessionId,
      mountainId: HUASHAN.id,
      elapsedSeconds: 120,
      distanceMeters: 1200,
      ascentMeters: 120,
      testMode: true,
    },
  })
  const duplicateFinishBody = await duplicateFinishResponse.json().catch(() => ({}))
  expect(duplicateFinishResponse.status(), JSON.stringify(duplicateFinishBody)).toBe(200)
  expect(duplicateFinishBody?.duplicated).toBe(true)
  expect(duplicateFinishBody?.checkinId).toBe(checkinId)
  await expectNoRuntimeIssueBadge(page)
})
