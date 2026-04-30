import { expect, test } from '@playwright/test'
import {
  createPendingHistoricalCheckinViaApi,
  createRejectedHistoricalCheckinViaApi,
  createTinyPngBuffer,
  dismissActivationChecklistIfPresent,
  getFirstMountain,
  registerFreshUser,
} from './community.helpers'

test('photo check-in buttons use pseudo-disabled state and show a toast before a target mountain is selected', async ({
  page,
  baseURL,
}) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  await dismissActivationChecklistIfPresent(page)
  await page.getByTestId('photo-checkin-toggle').click()

  const status = page.getByTestId('photo-checkin-status')
  const choosePhoto = page.getByRole('button', { name: '选择照片' })
  const submit = page.getByRole('button', { name: '提交照片打卡' })

  await expect(status).toContainText('请先在上方选择目标山峰')
  await expect(choosePhoto).toHaveAttribute('aria-disabled', 'true')
  await expect(submit).toHaveAttribute('aria-disabled', 'true')

  await choosePhoto.click({ force: true })
  await expect(page.locator('[role="alert"]').filter({ hasText: '请先选择目标山峰' })).toBeVisible()
})

test('selected mountain status is transmitted to the photo check-in module', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  await dismissActivationChecklistIfPresent(page)

  const mountainSelect = page.locator('select').last()
  await expect.poll(async () => mountainSelect.locator('option').count()).toBeGreaterThan(1)
  const options = await mountainSelect.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.value, label: node.textContent?.trim() || '' }))
  )
  const selectedMountain = options.find((item) => item.value)
  if (!selectedMountain) throw new Error('Expected at least one active mountain option')

  await mountainSelect.selectOption(selectedMountain.value)
  await page.getByRole('button', { name: '确认目标山峰', exact: true }).click()
  await page.getByTestId('photo-checkin-toggle').click()

  const status = page.getByTestId('photo-checkin-status')
  await expect(status).toContainText('目标山峰：')
  await expect(status).toContainText(selectedMountain.label.split(' · ').slice(0, 2).join(' · '))
  await expect(page.getByRole('button', { name: '选择照片' })).not.toHaveAttribute('aria-disabled', 'true')
})

test('photo check-in completes the upload and submit flow after a target mountain is selected', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  await dismissActivationChecklistIfPresent(page)

  const mountainSelect = page.locator('select').last()
  await expect.poll(async () => mountainSelect.locator('option').count()).toBeGreaterThan(1)
  const options = await mountainSelect.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.value, label: node.textContent?.trim() || '' }))
  )
  const selectedMountain = options.find((item) => item.value)
  if (!selectedMountain) throw new Error('Expected at least one active mountain option')

  await mountainSelect.selectOption(selectedMountain.value)
  await page.getByRole('button', { name: '确认目标山峰', exact: true }).click()
  await page.getByTestId('photo-checkin-toggle').click()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'trek-photo-checkin.png',
    mimeType: 'image/png',
    buffer: createTinyPngBuffer(),
  })

  await expect(page.getByText('trek-photo-checkin.png')).toBeVisible()

  const uploadResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/trek/photo-upload') && response.request().method() === 'POST'
  )
  const submitResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    try {
      const payload = response.request().postDataJSON() as { action?: string }
      return payload?.action === 'submit_historical_checkin'
    } catch {
      return false
    }
  })

  await page.getByRole('button', { name: '提交照片打卡' }).click()

  const uploadResponse = await uploadResponsePromise
  expect(uploadResponse.ok()).toBeTruthy()

  const submitResponse = await submitResponsePromise
  expect(submitResponse.ok()).toBeTruthy()
  const submitPayload = submitResponse.request().postDataJSON() as {
    mountainId?: string
    photoUrl?: string
  }
  expect(submitPayload.mountainId).toBe(selectedMountain.value)
  expect(typeof submitPayload.photoUrl).toBe('string')
  expect(String(submitPayload.photoUrl)).toContain('/checkin-photos/checkins/')

  const submitBody = await submitResponse.json()
  expect(submitBody.status).toBe('pending')

  await expect(page.locator('[role="alert"]').filter({ hasText: '照片已提交，审核通过后将出现在记录中' })).toBeVisible()
})

test('trek page shows the review queue entry when pending or rejected records exist', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  const { mountainId } = await getFirstMountain(page, root)
  const rejectReason = '拍摄角度不足，无法确认峰顶环境。'

  await createPendingHistoricalCheckinViaApi(page, mountainId, `trek-review-pending-${Date.now()}`)
  await createRejectedHistoricalCheckinViaApi(
    page,
    mountainId,
    `trek-review-rejected-${Date.now()}`,
    rejectReason
  )

  await page.goto(`${root}/trek`)
  await dismissActivationChecklistIfPresent(page)
  await page.getByTestId('photo-checkin-toggle').click()

  const trigger = page.getByTestId('trek-review-queue-trigger')
  await expect(trigger).toHaveText('我的记录 (2)')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '我的记录' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('review-queue-card')).toHaveCount(2)
  await expect(dialog.getByText('审核中').first()).toBeVisible()
  await expect(dialog.getByText('未通过').first()).toBeVisible()
  await expect(dialog.getByText(rejectReason)).toBeVisible()
})

test('trek page hides the review queue entry when there are no pending or rejected records', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  await page.goto(`${root}/trek`)
  await dismissActivationChecklistIfPresent(page)
  await page.getByTestId('photo-checkin-toggle').click()

  await expect(page.getByTestId('trek-review-queue-trigger')).toHaveCount(0)
})

test('trek page no longer shows the old development-facing fallback copy', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  await dismissActivationChecklistIfPresent(page)

  await expect(page.getByText(/无地图降级/i)).toHaveCount(0)
  await expect(page.getByText(/闭环/i)).toHaveCount(0)
  await expect(page.getByText(/重点保证/i)).toHaveCount(0)
})
