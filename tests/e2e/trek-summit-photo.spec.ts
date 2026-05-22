import { expect, test } from '@playwright/test'
import {
  HUASHAN,
  expectNoRuntimeIssueBadge,
  fetchCheckinForE2E,
  openAuthenticatedTrek,
  setMockGps,
  tinySummitPhoto,
} from './trek-regression.helpers'

test('testMode trek can reach summit photo and submit verification with an uploaded photo', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

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
  await page.getByRole('button', { name: '从这里开始' }).click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })

  await setMockGps(page, {
    latitude: HUASHAN.latitude,
    longitude: HUASHAN.longitude,
    altitude: HUASHAN.altitude,
    accuracy: 5,
  })
  await expect(page.getByTestId('trek-near-summit-view')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('就绪')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('trek-near-summit-cta').click()

  await expect(page.getByTestId('trek-summit-photo-view')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('trek-summit-photo-empty-state')).toBeVisible()
  await expect(page.getByTestId('trek-summit-photo-file')).toHaveText('还没有选择照片')

  const photo = tinySummitPhoto()
  await page.locator('input[type="file"]').setInputFiles(photo)
  await expect(page.getByText(photo.name)).toBeVisible()

  const uploadResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/trek/photo-upload') && response.request().method() === 'POST'
  )
  const verifyResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"verify_summit_checkin"') ?? false
  })

  await page.getByRole('button', { name: '提交留证' }).click()

  const uploadResponse = await uploadResponsePromise
  expect(uploadResponse.status(), await uploadResponse.text()).toBe(200)

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
  await expectNoRuntimeIssueBadge(page)
})
