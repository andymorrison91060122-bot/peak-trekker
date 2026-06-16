import { expect, test } from '@playwright/test'
import {
  HUASHAN,
  captureOptionalE2EScreenshot,
  completeSummitPhotoFlow,
  expectNoRuntimeIssueBadge,
  fetchCheckinForE2E,
  openAuthenticatedTrek,
} from './trek-regression.helpers'

test('summit confirmed page is simplified and replaces consumed trek history on share exit', async ({
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

  const { checkinId } = await completeSummitPhotoFlow(page)
  const checkin = await fetchCheckinForE2E(checkinId)
  expect(checkin.photo_url).toMatch(/^https?:\/\//)

  await expect(page.getByTestId('trek-summit-primary-cta')).toHaveText(/生成分享/)
  await expect(page.getByTestId('trek-summit-activity-cta')).toHaveText(/查看登山档案/)
  await expect(page.getByTestId('trek-summit-explore-exit')).toHaveText('回到探索')
  await expect(page.getByTestId('trek-summit-stat')).toHaveCount(3)
  await expect(page.getByText('留下峰顶记录')).toHaveCount(0)
  await expect(page.getByText('保存这次登顶')).toHaveCount(0)
  await expect(page.getByText('稍后整理')).toHaveCount(0)
  await captureOptionalE2EScreenshot(page, 'trek-complete-page.png')

  await page.getByTestId('trek-summit-primary-cta').click()
  await expect(page).toHaveURL(new RegExp(`/share\\?checkinId=${checkinId}`), { timeout: 20_000 })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await page.goBack()
  await expect(page).not.toHaveURL(/\/trek/)
  await expectNoRuntimeIssueBadge(page)
})
