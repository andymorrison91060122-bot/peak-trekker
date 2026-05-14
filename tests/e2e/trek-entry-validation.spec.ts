import { expect, test } from '@playwright/test'
import {
  HUASHAN,
  WUDANG,
  expectNoRuntimeIssueBadge,
  openAuthenticatedTrek,
} from './trek-regression.helpers'

test('entry validation blocks far-away target before preStart or live UI', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await openAuthenticatedTrek({
    page,
    root,
    mountainId: WUDANG.id,
    initialGps: {
      latitude: HUASHAN.latitude,
      longitude: HUASHAN.longitude,
      altitude: HUASHAN.altitude,
      accuracy: 5,
    },
  })

  await expect(page.locator('[role="alert"]').filter({ hasText: '经校验，您并不在这个山峰的附近' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page).toHaveURL(/\/explore/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '探索' })).toBeVisible()
  await expect(page.getByRole('button', { name: '从这里开始' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '暂停' })).toHaveCount(0)
  await expectNoRuntimeIssueBadge(page)
})
