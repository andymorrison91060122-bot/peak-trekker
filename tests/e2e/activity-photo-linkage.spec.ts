import { expect, test } from '@playwright/test'
import {
  HUASHAN,
  captureOptionalE2EScreenshot,
  completeSummitPhotoFlow,
  expectNoRuntimeIssueBadge,
  fetchCheckinForE2E,
  openAuthenticatedTrek,
} from './trek-regression.helpers'

test('activity detail shows the summit photo saved during trek verification', async ({
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
  await page.getByTestId('trek-summit-activity-cta').click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })

  const checkin = await fetchCheckinForE2E(checkinId)
  expect(checkin.photo_url).toMatch(/^https?:\/\//)
  await expect(page.getByTestId('activity-photo-gallery')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('这次没有留下照片')).toHaveCount(0)
  await captureOptionalE2EScreenshot(page, 'activity-photo-linkage.png')
  await expectNoRuntimeIssueBadge(page)
})
