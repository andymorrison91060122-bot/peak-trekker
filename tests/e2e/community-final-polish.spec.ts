import { expect, test, type Locator } from '@playwright/test'
import {
  createGpsCheckinViaApi,
  createHistoricalCheckinViaApi,
  createPngDataUrl,
  dismissActivationChecklistIfPresent,
  fetchMountainByIdViaApi,
  getFirstMountain,
  registerFreshUser,
} from './community.helpers'

async function createPublishedPost(
  page: import('@playwright/test').Page,
  baseURL: string,
  {
    title,
    body,
    tags = [],
    imageCount = 1,
  }: {
    title: string
    body: string
    tags?: string[]
    imageCount?: number
  }
) {
  const { mountainId } = await getFirstMountain(page, baseURL)
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, `community-polish-${Date.now()}`)
  const pngDataUrl = createPngDataUrl()
  const assets = Array.from({ length: imageCount }, (_, index) => ({
    id: `seed-image-${Date.now()}-${index}`,
    checkin_id: checkinId,
    type: 'image',
    url: pngDataUrl,
    thumbnail_url: pngDataUrl,
    created_at: new Date(Date.now() + index * 1000).toISOString(),
    sort_order: index,
    source: 'record',
  }))

  const response = await page.request.post(`${baseURL}/api/community/actions`, {
    data: {
      action: 'create_or_update_post',
      checkinId,
      title,
      body,
      visibility: 'public',
      tags,
      assets,
      coverAssetId: assets[0]?.id ?? null,
    },
  })

  const payload = await response.json().catch(() => ({}))
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy()

  return {
    checkinId,
    detailUrl: `${baseURL}${String(payload?.detailUrl ?? '')}`,
  }
}

async function readFontSizePx(locator: Locator) {
  return locator.evaluate((node) => Number.parseFloat(window.getComputedStyle(node as HTMLElement).fontSize))
}

test('share sheet keeps a single-column sticky layout on 375px without horizontal overflow', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  const { mountainId } = await getFirstMountain(page, root)
  const mountain = await fetchMountainByIdViaApi(page, mountainId)
  const checkinId = await createGpsCheckinViaApi(page, mountain, `share-layout-${Date.now()}`)

  await page.goto(`${root}/activity/${checkinId}`)
  await dismissActivationChecklistIfPresent(page)
  await page.getByRole('button', { name: '生成分享素材' }).click()

  const dialog = page.getByRole('dialog', { name: '分享素材' })
  const layout = dialog.getByTestId('share-sheet-layout')
  const preview = dialog.getByTestId('share-preview-surface')
  const modalFooter = dialog.locator('.modal-footer[data-layout="share-sheet"]')
  const footer = dialog.getByTestId('share-sheet-footer-actions')

  await expect(layout).toBeVisible()
  await expect(dialog.getByTestId('share-preview-image')).toBeVisible({ timeout: 30_000 })
  await expect(footer).toBeVisible()

  const [layoutBox, previewBox, layoutOrder, footerStyle] = await Promise.all([
    layout.boundingBox(),
    preview.boundingBox(),
    layout.evaluate((node) => [...node.children].map((child) => (child as HTMLElement).className)),
    modalFooter.evaluate((node) => {
      const style = window.getComputedStyle(node as HTMLElement)
      return {
        position: style.position,
        bottom: style.bottom,
      }
    }),
  ])

  expect(layoutBox).not.toBeNull()
  expect(previewBox).not.toBeNull()

  expect(layoutOrder).toEqual([
    'share-sheet__preview-card',
    'share-sheet__mode-switch',
    'share-sheet__mode-copy',
    'share-sheet__utility-card',
  ])
  expect((previewBox?.width ?? 0) / (layoutBox?.width ?? 1)).toBeGreaterThan(0.88)
  expect(footerStyle.position).toBe('sticky')
  expect(footerStyle.bottom).toBe('0px')

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(hasHorizontalOverflow).toBeFalsy()
})

test('share sheet copies the current page link when navigator.share is unavailable', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.addInitScript(() => {
    const win = window as Window & { __clipboardWrites?: string[] }
    win.__clipboardWrites = []
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          win.__clipboardWrites?.push(value)
        },
      },
    })
  })

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  const { mountainId } = await getFirstMountain(page, root)
  const mountain = await fetchMountainByIdViaApi(page, mountainId)
  const checkinId = await createGpsCheckinViaApi(page, mountain, `share-fallback-${Date.now()}`)

  await page.goto(`${root}/activity/${checkinId}`)
  await dismissActivationChecklistIfPresent(page)
  await page.getByRole('button', { name: '生成分享素材' }).click()

  const dialog = page.getByRole('dialog', { name: '分享素材' })
  await expect(dialog.getByTestId('share-preview-image')).toBeVisible({ timeout: 30_000 })
  const shareButton = dialog.getByRole('button', { name: '分享' })
  await expect(shareButton).toBeEnabled()
  await shareButton.click()

  await expect(page.locator('[role="alert"][data-toast-appearance="surface"]')).toContainText('链接已复制')
  const clipboardWrites = await page.evaluate(() => (window as Window & { __clipboardWrites?: string[] }).__clipboardWrites ?? [])
  expect(clipboardWrites).toHaveLength(1)
  expect(clipboardWrites[0]).toBe(`${root}/activity/${checkinId}`)
})

test('community feed uses token title hierarchy and inline threshold metadata', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const title = `山友圈收口 ${Date.now()}`

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  await createPublishedPost(page, root, {
    title,
    body: '这条动态用于验证 feed 标题层级、标签位置和山峰门槛标签。',
    tags: ['收口验证'],
  })

  await page.goto(`${root}/community`)
  const pageTitle = page.locator('.community-page__title')
  const card = page.getByTestId('community-feed-card').filter({ hasText: '这条动态用于验证 feed 标题层级、标签位置和山峰门槛标签。' }).first()
  const postTitle = card.locator('.community-card__title')
  const threshold = card.getByTestId('community-post-threshold')
  const sourcePill = card.locator('.community-card__source-pill')
  const authorLine = card.locator('.community-card__author-line')

  await expect(pageTitle).toHaveText('山友圈')
  await expect(card).toBeVisible()
  await expect(page.getByRole('button', { name: '全部难度' })).toHaveCount(0)
  await expect(threshold).toBeVisible()
  await expect(card.getByText('内容摘要')).toHaveCount(0)
  await expect(card.getByText('话题标签')).toHaveCount(0)
  await expect(card.getByText('#收口验证')).toBeVisible()

  const pageTitleSize = await readFontSizePx(pageTitle)
  const postTitleSize = await readFontSizePx(postTitle)
  const thresholdSize = await readFontSizePx(threshold)
  const [sourceBox, authorBox] = await Promise.all([sourcePill.boundingBox(), authorLine.boundingBox()])

  expect(pageTitleSize).toBeGreaterThanOrEqual(22)
  expect(postTitleSize).toBeLessThanOrEqual(18)
  expect(thresholdSize).toBe(11)
  expect(Math.abs((sourceBox?.top ?? 0) - (authorBox?.top ?? 0))).toBeLessThanOrEqual(10)
})

test('community feed and profile share cards clamp long summaries to three lines and link to detail', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const title = `长摘要折叠 ${Date.now()}`
  const excerpt = '清晨从山脚起步时林线还很安静'
  const body = [
    '清晨从山脚起步时林线还很安静，前半段土路和碎石混在一起，鞋底抓地力不够会一直打滑。',
    '转上山脊以后风明显变硬，补水点不多，建议把保暖层放在最上面，随时能拿到。',
    '最后接近观景台的二十分钟几乎没有树荫，体能分配一定要保守，留力给返程。',
    '如果是第一次来，建议天亮前出发，避开中午暴晒，也能把沿途云海和山脊线完整看到。',
  ].join('')

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/community' })
  const post = await createPublishedPost(page, root, {
    title,
    body,
    tags: ['长摘要'],
  })

  await page.goto(`${root}/community`)

  const feedCard = page.getByTestId('community-feed-card').filter({ hasText: excerpt }).first()
  const feedSummary = feedCard.locator('.community-copy-block__body')
  const readMore = feedCard.getByRole('link', { name: '查看完整内容 →' })

  await expect(feedCard).toBeVisible()
  await expect(feedSummary).toHaveClass(/community-copy-block__body--clamped/)
  await expect(readMore).toBeVisible()

  const summaryStyle = await feedSummary.evaluate((node) => {
    const element = node as HTMLElement
    return {
      display: element.style.display,
      lineClamp: element.style.webkitLineClamp,
      boxOrient: (element.style as CSSStyleDeclaration & { webkitBoxOrient?: string }).webkitBoxOrient ?? '',
    }
  })

  expect(summaryStyle.display).toBe('-webkit-box')
  expect(summaryStyle.lineClamp).toBe('3')
  expect(summaryStyle.boxOrient).toBe('vertical')

  await Promise.all([
    page.waitForURL(post.detailUrl),
    readMore.click(),
  ])

  const detailSummary = page.locator('.community-copy-block__body').first()
  await expect(detailSummary).toContainText('如果是第一次来，建议天亮前出发')
  await expect(page.getByRole('link', { name: '查看完整内容 →' })).toHaveCount(0)

  await page.goto(`${root}/profile`)
  await dismissActivationChecklistIfPresent(page)
  const profileShareCard = page.getByTestId('profile-share-card').filter({ hasText: excerpt }).first()
  await expect(profileShareCard).toBeVisible()
  await expect(profileShareCard.locator('.community-copy-block__body')).toHaveClass(/community-copy-block__body--clamped/)
  await expect(profileShareCard.getByRole('link', { name: '查看完整内容 →' })).toBeVisible()
})

test('community detail merges post content into one shell and keeps source metadata outside', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const title = `社区详情合并 ${Date.now()}`

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  const post = await createPublishedPost(page, root, {
    title,
    body: '这条动态用于验证社区详情现在是一个帖子主体容器，而不是卡片套卡片。',
    tags: ['主体容器', '详情页'],
    imageCount: 2,
  })

  await page.goto(post.detailUrl)
  const rootShell = page.getByTestId('community-detail')
  const postShell = page.getByTestId('community-detail-post-shell')
  const sourceCard = page.getByTestId('community-record-source-card')

  await expect(rootShell).toBeVisible()
  await expect(postShell).toHaveCount(1)
  await expect(postShell.getByTestId('community-detail-media')).toBeVisible()
  await expect(postShell.getByTestId('community-detail-actions')).toBeVisible()
  await expect(postShell).toContainText('这条动态用于验证社区详情现在是一个帖子主体容器，而不是卡片套卡片。')
  await expect(postShell.getByText('动态正文')).toHaveCount(0)
  await expect(postShell.getByText('话题标签')).toHaveCount(0)
  await expect(postShell.locator('.surface-card')).toHaveCount(0)
  await expect(sourceCard).toBeVisible()
  await expect(postShell.getByTestId('community-record-source-card')).toHaveCount(0)
})
