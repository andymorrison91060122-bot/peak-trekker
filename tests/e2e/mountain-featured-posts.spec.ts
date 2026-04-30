import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  createPublishedCommunityPostViaApi,
  dismissActivationChecklistIfPresent,
  listActiveMountainsViaApi,
  registerFreshUser,
} from './community.helpers'

async function openAdminContext(browser: Browser, baseURL: string) {
  const adminEmail = 'qa-admin-1774068792@example.com'
  const adminPassword = 'PeakTrekker123!'
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${baseURL}/auth/login?from=${encodeURIComponent('/admin/community')}`)
  await page.getByPlaceholder('your@email.com').fill(adminEmail)
  await page.getByPlaceholder('••••••••').fill(adminPassword)
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await page.waitForURL((url) => !/\/auth\/login/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
  if (!/\/admin\/community/.test(page.url())) {
    await page.goto(`${baseURL}/admin/community`)
  }
  return { context, page }
}

async function featurePostFromAdminUi(page: Page, title: string) {
  const card = page.locator('.surface-card').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '标记精选' }).click()
  await expect(card.getByRole('button', { name: '取消精选' })).toBeVisible()
}

async function unfeaturePostFromAdminUi(page: Page, title: string) {
  const card = page.locator('.surface-card').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '取消精选' }).click()
  await expect(card.getByRole('button', { name: '标记精选' })).toBeVisible()
}

function featuredCardByPostId(page: Page, postId: string) {
  return page.locator(`[data-testid="mountain-featured-post-card"][data-post-id="${postId}"]`)
}

async function findMountainWithoutFeaturedSection(page: Page, root: string) {
  const mountains = await listActiveMountainsViaApi(page)

  for (const mountain of mountains) {
    await page.goto(`${root}/explore/${mountain.id}`)
    await dismissActivationChecklistIfPresent(page)
    if (await page.getByTestId('mountain-featured-posts-section').count() === 0) {
      return mountain
    }
  }

  throw new Error('Expected at least one mountain without featured posts for the empty-state regression check.')
}

test.describe('mountain detail featured posts', () => {
  test('mountain detail shows 山友经验 when featured content exists', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const mountains = await listActiveMountainsViaApi(page)
    const targetMountain = mountains[0]
    const title = `精选攻略展示 ${Date.now()}`

    const post = await createPublishedCommunityPostViaApi(page, {
      mountainId: targetMountain.id,
      title,
      body: '这条公开山友圈内容将被标记为精选，并回流到山峰详情页的山友经验模块中。',
      tags: ['精选展示'],
    })

    const admin = await openAdminContext(browser, root)
    try {
      await admin.page.goto(`${root}/admin/community`)
      await featurePostFromAdminUi(admin.page, title)
    } finally {
      await admin.context.close()
    }

    await page.goto(`${root}/explore/${targetMountain.id}`)
    await dismissActivationChecklistIfPresent(page)
    await expect(page.getByText('山友经验', { exact: true })).toBeVisible()
    await expect(featuredCardByPostId(page, post.postId)).toHaveCount(1)
  })

  test('mountain detail hides 山友经验 when there is no featured content', async ({ page, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const targetMountain = await findMountainWithoutFeaturedSection(page, root)

    await page.goto(`${root}/explore/${targetMountain.id}`)
    await dismissActivationChecklistIfPresent(page)
    await expect(page.getByText('山友经验', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('mountain-featured-post-card')).toHaveCount(0)
  })

  test('featured card navigates to community detail', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const mountains = await listActiveMountainsViaApi(page)
    const targetMountain = mountains[0]
    const title = `精选跳转 ${Date.now()}`
    const post = await (async () => {
      return createPublishedCommunityPostViaApi(page, {
        mountainId: targetMountain.id,
        title,
        body: '这条精选内容用于验证 Mountain Detail 精选卡片点击后会跳到社区详情页。',
      })
    })()

    const admin = await openAdminContext(browser, root)
    try {
      await admin.page.goto(`${root}/admin/community`)
      await featurePostFromAdminUi(admin.page, title)
    } finally {
      await admin.context.close()
    }

    await page.goto(`${root}/explore/${targetMountain.id}`)
    await dismissActivationChecklistIfPresent(page)
    await featuredCardByPostId(page, post.postId).click()
    await expect(page).toHaveURL(`${root}${post.detailUrl}`)
  })

  test('admin feature action makes the post appear in mountain detail', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const mountains = await listActiveMountainsViaApi(page)
    const targetMountain = mountains[0]
    const title = `后台标记精选 ${Date.now()}`

    const post = await createPublishedCommunityPostViaApi(page, {
      mountainId: targetMountain.id,
      title,
      body: '管理员点击标记精选后，这条内容应立即出现在山峰详情页的山友经验区。',
    })

    const admin = await openAdminContext(browser, root)
    try {
      await admin.page.goto(`${root}/admin/community`)
      await featurePostFromAdminUi(admin.page, title)
    } finally {
      await admin.context.close()
    }

    await page.goto(`${root}/explore/${targetMountain.id}`)
    await dismissActivationChecklistIfPresent(page)
    await expect(featuredCardByPostId(page, post.postId)).toHaveCount(1)
  })

  test('admin unfeature action removes the post from mountain detail', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const mountains = await listActiveMountainsViaApi(page)
    const targetMountain = mountains[0]
    const title = `后台取消精选 ${Date.now()}`

    const post = await createPublishedCommunityPostViaApi(page, {
      mountainId: targetMountain.id,
      title,
      body: '这条内容会先被标记为精选，然后取消精选，最后从山峰详情页消失。',
    })

    const admin = await openAdminContext(browser, root)
    try {
      await admin.page.goto(`${root}/admin/community`)
      await featurePostFromAdminUi(admin.page, title)
      await unfeaturePostFromAdminUi(admin.page, title)
    } finally {
      await admin.context.close()
    }

    await page.goto(`${root}/explore/${targetMountain.id}`)
    await dismissActivationChecklistIfPresent(page)
    await expect(featuredCardByPostId(page, post.postId)).toHaveCount(0)
  })
})
