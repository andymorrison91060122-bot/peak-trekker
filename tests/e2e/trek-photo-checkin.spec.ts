import { expect, test } from '@playwright/test'
import { dismissActivationChecklistIfPresent, registerFreshUser } from './community.helpers'

test('trek page no longer exposes the legacy historical photo check-in panel', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  await dismissActivationChecklistIfPresent(page)

  await expect(page.getByText('还没有选择这次要去的山')).toBeVisible()
  await expect(page.getByTestId('photo-checkin-toggle')).toHaveCount(0)
  await expect(page.getByTestId('photo-checkin-status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '提交照片打卡' })).toHaveCount(0)
})

test('trek page no longer shows the old development-facing fallback copy', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/trek' })
  await dismissActivationChecklistIfPresent(page)

  await expect(page.getByText(/无地图降级/i)).toHaveCount(0)
  await expect(page.getByText(/闭环/i)).toHaveCount(0)
  await expect(page.getByText(/重点保证/i)).toHaveCount(0)
})
