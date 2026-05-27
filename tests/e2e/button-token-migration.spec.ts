import { expect, test, type Page } from '@playwright/test'
import {
  createGpsCheckinViaApi,
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  fetchMountainByIdViaApi,
  getFirstMountain,
  registerFreshUser,
} from './community.helpers'

async function createPublishedPostForCheckin(
  page: Page,
  baseURL: string,
  checkinId: string,
  {
    title,
    body,
    visibility = 'public',
  }: {
    title: string
    body: string
    visibility?: 'public' | 'private'
  }
) {
  const pngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wm0WZ0AAAAASUVORK5CYII='
  const response = await page.request.post(`${baseURL}/api/community/actions`, {
    data: {
      action: 'create_or_update_post',
      checkinId,
      title,
      body,
      visibility,
      tags: [],
      assets: [
        {
          id: `seed-image-${Date.now()}`,
          checkin_id: checkinId,
          type: 'image',
          url: pngDataUrl,
          thumbnail_url: pngDataUrl,
          created_at: new Date().toISOString(),
          sort_order: 0,
          source: 'record',
        },
      ],
      coverAssetId: null,
    },
  })

  const payload = await response.json().catch(() => ({}))
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy()
  return {
    detailUrl: `${baseURL}${String(payload?.detailUrl ?? '')}`,
  }
}

test('profile identity header stays compact without a duplicated activity jump button', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await registerFreshUser(page, root, {
    returnTo: '/profile',
    username: `探险者${Date.now()}`,
    province: '河南',
  })

  for (const width of [375, 430, 768]) {
    await page.setViewportSize({ width, height: 812 })
    await page.goto(`${root}/profile`)
    await dismissActivationChecklistIfPresent(page)

    const identityCard = page.getByTestId('profile-identity-card')
    const summary = page.getByRole('region', { name: '山行概览' })
    const avatarShell = page.getByTestId('profile-avatar-shell')
    const editTrigger = page.getByTestId('profile-avatar-edit-trigger')
    const hiddenInput = page.locator('input[type="file"][data-testid="profile-avatar-input"]')
    await expect(identityCard).toBeVisible()
    await expect(identityCard.locator('.pt-title-l')).toHaveText(/\S+/)
    await expect(identityCard.getByText(/河南|未设置省份/)).toBeVisible()
    await expect(identityCard.getByText('无执照登山')).toBeVisible()
    await expect(summary).toBeVisible()
    await expect(avatarShell).toBeVisible()
    await expect(editTrigger).toBeVisible()
    await expect(hiddenInput).toHaveCount(1)
    await expect(page.getByRole('link', { name: '查看活动 →' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /更换头像|上传头像/ })).toHaveCount(0)

    const cardFits = await identityCard.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
    expect(cardFits).toBeTruthy()

    const editOverlay = await editTrigger.evaluate((node) => {
      const element = node as HTMLElement
      const style = window.getComputedStyle(element)
      return {
        position: style.position,
        right: style.right,
        bottom: style.bottom,
        width: style.width,
        height: style.height,
      }
    })

    expect(editOverlay.position).toBe('absolute')
    expect(editOverlay.right).toBe('-2px')
    expect(editOverlay.bottom).toBe('-2px')
    expect(editOverlay.width).toBe('28px')
    expect(editOverlay.height).toBe('28px')
  }
})

test('activity detail switches the primary CTA by publish state and keeps a single primary action', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  const { mountainId } = await getFirstMountain(page, root)
  const mountain = await fetchMountainByIdViaApi(page, mountainId)

  const checkinId = await createGpsCheckinViaApi(page, mountain, `activity-inline-${Date.now()}`)

  await page.goto(`${root}/activity/${checkinId}`)
  const activityRoot = page.locator(`[data-activity-checkin-id="${checkinId}"]`)
  await expect(activityRoot).toBeVisible()
  const inlineActions = activityRoot.getByTestId('activity-inline-actions')
  await expect(inlineActions).toBeVisible()
  await expect(inlineActions.getByRole('link', { name: '生成分享' })).toHaveAttribute('href', `/share?checkinId=${checkinId}`)
  await expect(inlineActions.locator('.ui-btn-root[data-variant="primary"]')).toHaveCount(1)
  expect(await inlineActions.getByRole('button', { name: '发布到山友圈' }).count()).toBeLessThanOrEqual(1)

  const actionGridFits = await inlineActions.locator('.act-actions__grid').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  expect(actionGridFits).toBeTruthy()
})

test('community detail keeps only record actions outside the source card and moves mountain detail into source metadata', async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  const { mountainId } = await getFirstMountain(page, root)
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, `community-source-${Date.now()}`)
  const post = await createPublishedPostForCheckin(page, root, checkinId, {
    title: `Community Source ${Date.now()}`,
    body: '用于校验记录来源动作区位置。',
  })

  await page.goto(post.detailUrl)
  const detail = page.getByTestId('community-detail')
  await expect(detail).toBeVisible()
  await expect(page.getByRole('link', { name: /进入山峰详情/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /查看活动详情/ })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看攀登记录' })).toHaveCount(0)

  const secondContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const secondPage = await secondContext.newPage()
  try {
    await registerFreshUser(secondPage, root, { returnTo: '/community' })
    await secondPage.goto(post.detailUrl)
    await expect(secondPage.getByRole('link', { name: /进入山峰详情/ })).toBeVisible()
    await expect(secondPage.getByRole('link', { name: /查看活动详情/ })).toHaveCount(0)
  } finally {
    await secondContext.close()
  }
})
