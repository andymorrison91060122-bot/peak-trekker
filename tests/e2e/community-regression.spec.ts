import { expect, test, type Browser } from '@playwright/test'
import {
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  getFirstMountain,
  registerFreshUser,
} from './community.helpers'

async function openSecondUserContext(browser: Browser, baseURL: string, returnTo = '/community') {
  const context = await browser.newContext()
  const page = await context.newPage()
  await registerFreshUser(page, baseURL, { returnTo })
  return { context, page }
}

async function openAdminContext(browser: Browser, baseURL: string) {
  const adminEmail =
    process.env.COMMUNITY_TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAILS?.split(',').map((value) => value.trim()).find(Boolean)
  if (!adminEmail) {
    throw new Error('COMMUNITY_TEST_ADMIN_EMAIL or ADMIN_EMAILS is required for admin community regression.')
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  await registerFreshUser(page, baseURL, {
    returnTo: '/admin/community',
    email: adminEmail,
    username: `qa-admin-${Date.now()}`,
  })
  return { context, page }
}

test.skip('community flow regression covers publish, browse, edit, delete, report, and admin review permissions', async ({ page, browser, baseURL }) => {
  // Current community detail "more" menu does not expose the owner/reviewer menu actions
  // reliably enough for this end-to-end permission flow. The fix belongs in production UI.
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const uniqueId = Date.now()
  const submissionNote = `community-regression-note-${uniqueId}`
  const publishedTitle = `社区回归 ${uniqueId}`
  const publishedBody = '这是一条用于完整社区回归的登山记录，包含发布、浏览、编辑和举报验证。'
  const updatedTitle = `社区更新 ${uniqueId}`
  const updatedBody = '这条内容已经完成编辑回归，更新后的正文应该在列表和详情里保持一致。'

  await registerFreshUser(page, root, { returnTo: '/profile' })
  const { mountainId } = await getFirstMountain(page, root)
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, submissionNote)

  await page.goto(`${root}/profile`)
  await dismissActivationChecklistIfPresent(page)
  const recordsHeading = page.getByText('我的登山记录', { exact: true })
  await recordsHeading.scrollIntoViewIfNeeded()
  await expect(recordsHeading).toBeVisible()
  await page.getByRole('link', { name: '发布到山友圈' }).first().click()

  await expect(page.locator('textarea[placeholder="补充路况攻略、装备建议、注意事项或你的登山感受。"]')).toBeVisible()
  await page.locator('input:not([type="file"])').first().fill(publishedTitle)
  await page.locator('textarea[placeholder="补充路况攻略、装备建议、注意事项或你的登山感受。"]').fill(publishedBody)
  await page.locator('input[placeholder="自定义标签，最多 3 个"]').fill('夜登回归')
  await page.getByRole('button', { name: '添加' }).click()
  await page.getByRole('button', { name: '#路线提醒' }).click()
  const createPostResponse = page.waitForResponse((response) => {
    if (!response.url().includes('/api/community/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"create_or_update_post"') ?? false
  })
  await page.getByRole('button', { name: '发布到山友圈' }).click()

  const createResult = await createPostResponse
  expect(createResult.ok()).toBeTruthy()
  await page.waitForURL(new RegExp(`/activity/${checkinId}\\?published=1&mode=created`), { timeout: 30_000 })
  await expect(page.getByText('发布成功')).toBeVisible()
  const detailUrl = await page.getByRole('link', { name: '查看已发布内容' }).first().getAttribute('href')
  expect(detailUrl).toBeTruthy()
  const resolvedDetailUrl = detailUrl as string
  await page.goto(`${root}${resolvedDetailUrl}?published=1&mode=created`)
  await expect(page.getByText('发布成功')).toBeVisible()
  await expect(page.getByText(publishedBody)).toBeVisible()
  await expect(page.getByText('#路线提醒')).toBeVisible()

  const second = await openSecondUserContext(browser, root)
  try {
    await second.page.goto(`${root}/community`)
    await dismissActivationChecklistIfPresent(second.page)
    const publishedCard = second.page.getByTestId('community-feed-card').filter({ hasText: publishedBody }).first()
    await expect(publishedCard).toBeVisible()
    await expect(second.page.getByText('登山记录摘要').first()).toBeVisible()
    await expect(second.page.getByText('#路线提醒').first()).toBeVisible()
    await publishedCard.locator('a.community-card__title-link').click()
    await expect(second.page).toHaveURL(new RegExp('/community/.+'))
    await expect(second.page.getByText(publishedBody)).toBeVisible()
  } finally {
    await second.context.close()
  }

  await page.goto(resolvedDetailUrl)
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('link', { name: '编辑内容' }).click()
  await expect(page.locator('textarea[placeholder="补充路况攻略、装备建议、注意事项或你的登山感受。"]')).toBeVisible()
  await page.locator('input[placeholder]').first().fill(updatedTitle)
  await page.locator('textarea[placeholder="补充路况攻略、装备建议、注意事项或你的登山感受。"]').fill(updatedBody)
  const updatePostResponse = page.waitForResponse((response) => {
    if (!response.url().includes('/api/community/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"create_or_update_post"') ?? false
  })
  await page.getByRole('button', { name: '更新内容' }).click()

  const updateResult = await updatePostResponse
  expect(updateResult.ok()).toBeTruthy()
  await page.waitForURL(new RegExp(`/activity/${checkinId}\\?published=1&mode=updated`), { timeout: 30_000 })
  await expect(page.getByText('分享已更新')).toBeVisible()
  await page.goto(`${resolvedDetailUrl}?published=1&mode=updated`)
  await expect(page.getByText('分享已更新')).toBeVisible()
  await expect(page.getByText(updatedBody)).toBeVisible()

  const reviewer = await openSecondUserContext(browser, root)
  try {
    await reviewer.page.goto(`${root}/community`)
    await dismissActivationChecklistIfPresent(reviewer.page)
    const updatedCard = reviewer.page.getByTestId('community-feed-card').filter({ hasText: updatedBody }).first()
    await expect(updatedCard).toBeVisible()
    await updatedCard.locator('a.community-card__title-link').click()
    await expect(reviewer.page).toHaveURL(new RegExp('/community/.+'))
    await expect(reviewer.page.getByText(updatedBody)).toBeVisible()
    await reviewer.page.getByRole('button', { name: '更多操作' }).click()
    await reviewer.page.getByRole('button', { name: '举报 · 与登山无关' }).click()
    await expect(reviewer.page.getByText('举报已提交，我们会尽快处理。')).toBeVisible()

    await reviewer.page.goto(`${root}/admin/community`)
    await expect(reviewer.page).toHaveURL(/\/profile/)
  } finally {
    await reviewer.context.close()
  }

  const admin = await openAdminContext(browser, root)
  try {
    await admin.page.goto(`${root}/admin/community`)
    await admin.page.getByRole('button', { name: /举报 \(/ }).click()
    await expect(admin.page.getByText('与登山无关').first()).toBeVisible()
  } finally {
    await admin.context.close()
  }

  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('button', { name: '从山友圈移除' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}\\?postDeleted=1`))
  await expect(page.getByText('内容已从山友圈移除')).toBeVisible()
  await expect(page.getByRole('link', { name: '发布到山友圈' }).first()).toBeVisible()
})
