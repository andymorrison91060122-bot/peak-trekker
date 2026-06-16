import { expect, test, type Page } from '@playwright/test'
import {
  HUASHAN,
  expectNoRuntimeIssueBadge,
  fetchCheckinForE2E,
  openAuthenticatedTrek,
  setMockGps,
} from './trek-regression.helpers'

async function enterReadyPreStart(page: Page) {
  const confirmButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  if (!(await confirmButton.isEnabled({ timeout: 20_000 }).catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  await expect(confirmButton).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '确认这座山，开始记录准备' }).click()
  await expect(page.getByTestId('trek-dev-threshold-chip')).toContainText('1 点 / 10s')
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeEnabled({ timeout: 20_000 })
}

test('testMode incomplete trek save persists a pending incomplete checkin after 10 seconds', async ({
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
  await enterReadyPreStart(page)

  await page.getByRole('button', { name: '从这里开始' }).click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(11_000)
  await page.getByRole('button', { name: '暂停' }).click()
  await expect(page.getByRole('button', { name: '结束并保存' })).toBeVisible({ timeout: 10_000 })

  const finishResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"finish_incomplete_trek"') ?? false
  })

  await page.getByRole('button', { name: '结束并保存' }).click()
  const finishResponse = await finishResponsePromise
  const finishBody = await finishResponse.json().catch(() => ({}))
  expect(finishResponse.status(), JSON.stringify(finishBody)).toBe(200)
  const checkinId = String(finishBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)

  await expect(page.locator('[role="alert"]').filter({ hasText: '记录已保存到我的山行档案' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await page.goBack()
  await expect(page).not.toHaveURL(/\/trek/, { timeout: 10_000 })

  const checkin = await fetchCheckinForE2E(checkinId)
  expect(checkin.completion_status).toBe('incomplete')
  expect(checkin.verified_at).toBeNull()
  await expectNoRuntimeIssueBadge(page)
})

test('short record block returns to preStart and stale GPS callbacks cannot re-enter tracking', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000)
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
  await enterReadyPreStart(page)

  await page.getByRole('button', { name: '从这里开始' }).click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '暂停' }).click()
  await expect(page.getByRole('button', { name: '结束并保存' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: '结束并保存' }).click()
  await expect(page.locator('[role="alert"]').filter({ hasText: '不足 10 秒' })).toBeVisible()
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeVisible({ timeout: 10_000 })

  await setMockGps(page, {
    latitude: HUASHAN.latitude,
    longitude: HUASHAN.longitude,
    altitude: HUASHAN.altitude,
    accuracy: 5,
  })
  await page.waitForTimeout(3_000)

  await expect(page.getByRole('button', { name: '从这里开始' })).toBeVisible()
  await expect(page.getByRole('button', { name: '暂停' })).toHaveCount(0)
  await expect(page.getByTestId('trek-near-summit-view')).toHaveCount(0)
  await expectNoRuntimeIssueBadge(page)
})
