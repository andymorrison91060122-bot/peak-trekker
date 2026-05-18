import { expect, test } from '@playwright/test'
import {
  createHistoricalCheckinViaApi,
  createSolidColorPngBuffer,
  dismissActivationChecklistIfPresent,
  getCheckinPhotoUrlForTest,
  listActiveMountainsViaApi,
  registerFreshUser,
} from './community.helpers'

async function buildGalleryUploadFiles() {
  const colors = [
    { red: 210, green: 72, blue: 64 },
    { red: 46, green: 128, blue: 92 },
    { red: 62, green: 112, blue: 210 },
    { red: 220, green: 168, blue: 54 },
  ]

  return Promise.all(
    colors.map(async (color, index) => ({
      name: `activity-gallery-${index + 1}.png`,
      mimeType: 'image/png',
      buffer: await createSolidColorPngBuffer({ width: 240, height: 320, ...color }),
    }))
  )
}

test('activity detail shows 4+ photos in gallery, opens lightbox, and deletes photos with cover fallback', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })

  const mountains = await listActiveMountainsViaApi(page)
  const mountainId = mountains[0]?.id
  if (!mountainId) {
    throw new Error('No active mountain available for activity photo gallery e2e.')
  }

  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, `activity-gallery-${Date.now()}`)
  const originalPhotoUrl = await getCheckinPhotoUrlForTest(checkinId)
  expect(originalPhotoUrl).toMatch(/^data:image\/png/)

  await page.goto(`${root}/activity/${checkinId}`, { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page.locator(`[data-activity-checkin-id="${checkinId}"]`)).toBeVisible()

  await page.getByTestId('activity-photo-upload-input').setInputFiles(await buildGalleryUploadFiles())
  await expect(page.getByRole('status')).toContainText('现场照片已上传。', { timeout: 30_000 })
  await expect(page.getByTestId('activity-photo-tile-0')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-testid^="activity-photo-tile-"]')).toHaveCount(5)
  await expect(page.getByText('已 5/9 张')).toBeVisible()

  await page.getByTestId('activity-photo-tile-3').click()
  await expect(page.getByTestId('activity-photo-lightbox')).toBeVisible()
  await expect(page.getByTestId('activity-photo-lightbox-count')).toHaveText('4 / 5')

  await page.getByRole('button', { name: '下一张照片' }).click()
  await expect(page.getByTestId('activity-photo-lightbox-count')).toHaveText('5 / 5')

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('删除后')
    await dialog.accept()
  })
  await page.getByTestId('activity-photo-delete-button').click()
  await expect(page.getByRole('status')).toContainText('现场照片已删除。', { timeout: 20_000 })
  await expect(page.locator('[data-testid^="activity-photo-tile-"]')).toHaveCount(4)
  await expect(page.getByTestId('activity-photo-lightbox-count')).toHaveText('4 / 4')

  await page.getByRole('button', { name: '关闭照片查看' }).click()
  await page.getByTestId('activity-photo-tile-0').click()
  await expect(page.getByTestId('activity-photo-lightbox-count')).toHaveText('1 / 4')

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('删除后')
    await dialog.accept()
  })
  await page.getByTestId('activity-photo-delete-button').click()
  await expect(page.getByRole('status')).toContainText('现场照片已删除。', { timeout: 20_000 })
  await expect(page.locator('[data-testid^="activity-photo-tile-"]')).toHaveCount(3)

  await expect.poll(() => getCheckinPhotoUrlForTest(checkinId), { timeout: 20_000 }).toMatch(/^https?:\/\//)
  const nextPhotoUrl = await getCheckinPhotoUrlForTest(checkinId)
  expect(nextPhotoUrl).not.toBe(originalPhotoUrl)
})
