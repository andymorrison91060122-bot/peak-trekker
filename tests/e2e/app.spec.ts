import { expect, test, type Page } from '@playwright/test'
import { createHistoricalCheckinViaApi } from './community.helpers'

type ExploreCardMeta = {
  href: string
  province: string
  difficulty: string
  altitude: number
  lengthKm: number
  licenseLevel: string
  heroImageCount: number
}

function createTestEmail() {
  return `qa-e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

async function getExploreCardMeta(page: Page): Promise<ExploreCardMeta[]> {
  return page.locator('[data-testid="explore-mountain-card"]').evaluateAll((cards) =>
    cards.map((card) => ({
      href: (card.getAttribute('href') ?? '').trim(),
      province: (card.getAttribute('data-province') ?? '').trim(),
      difficulty: (card.getAttribute('data-difficulty') ?? '').trim(),
      altitude: Number(card.getAttribute('data-altitude') ?? '0'),
      lengthKm: Number(card.getAttribute('data-length-km') ?? '0'),
      licenseLevel: (card.getAttribute('data-license-level') ?? '').trim(),
      heroImageCount: Number(card.getAttribute('data-hero-image-count') ?? '0'),
    }))
  )
}

function altitudeFilterFor(altitude: number) {
  if (altitude < 2000) return { label: '<2000m', value: 'low' }
  if (altitude < 4000) return { label: '2000-4000m', value: 'mid' }
  return { label: '>4000m', value: 'high' }
}

function lengthFilterFor(lengthKm: number) {
  if (lengthKm < 8) return { label: '短线', value: 'short' }
  if (lengthKm < 16) return { label: '中线', value: 'mid' }
  return { label: '长线', value: 'long' }
}

const DIFFICULTY_FILTER_LABEL: Record<string, string> = {
  beginner: '无执照',
  intermediate: '初级',
  advanced: '中级',
  expert: '高级',
}

async function getFirstMountain(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '山峰列表' })).toBeVisible()

  const firstMountainLink = page.locator('a[href^="/mountain/"]').first()
  await expect(firstMountainLink).toBeVisible()
  const href = await firstMountainLink.getAttribute('href')

  if (!href) {
    throw new Error('Expected at least one mountain detail link on the explore page.')
  }

  const mountainId = href.split('/').pop()
  if (!mountainId) {
    throw new Error(`Could not parse mountain id from href: ${href}`)
  }

  return { href, mountainId }
}

async function completeProvinceOnboarding(page: Page, province = '四川') {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  const skipButton = page.getByRole('button', { name: '跳过' })
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click()
  }

  await expect(page.getByText('告诉我，你将为哪片土地而战？')).toBeVisible()
  await page.getByRole('button', { name: province }).click()
  await page.getByRole('button', { name: '生成空白执照' }).click()
}

async function registerFreshUser(page: Page, province = '四川') {
  const email = createTestEmail()
  const password = 'PeakTrekker123!'

  await page.goto('/auth/register', { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('至少6位').fill(password)
  await page.getByRole('button', { name: '下一步 →' }).click()

  await page.getByPlaceholder('你的登山代号').fill(`qa-${Date.now()}`)
  await page.locator('select').selectOption(province)
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()

  await page.waitForLoadState('domcontentloaded')
  if (/\/auth\/login/.test(page.url())) {
    await page.getByPlaceholder('your@email.com').fill(email)
    await page.getByPlaceholder('至少6位').fill(password)
    await page.getByRole('button', { name: '▶ 开始登山' }).click()
  }

  await expect(page).toHaveURL(/\/(explore|trek)(\?|$)/)
}

async function dismissActivationChecklistIfPresent(page: Page) {
  const dismissButton = page.getByRole('button', { name: '先自己逛逛' })
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click()
    await expect(dismissButton).not.toBeVisible({ timeout: 10000 })
  }
}

test('guest can register from protected trek redirect and return to the targeted mountain flow', async ({ page }) => {
  const { mountainId } = await getFirstMountain(page)

  await page.goto(`/trek?mountainId=${mountainId}`)
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByText('PEAK TREKKER')).toBeVisible()

  const loginUrl = new URL(page.url())
  expect(loginUrl.searchParams.get('from')).toBe(`/trek?mountainId=${mountainId}`)

  await page.getByRole('link', { name: /注册/ }).click()
  await expect(page).toHaveURL(/\/auth\/register/)

  await page.getByPlaceholder('your@email.com').fill(createTestEmail())
  await page.getByPlaceholder('至少6位').fill('PeakTrekker123!')
  await page.getByRole('button', { name: '下一步 →' }).click()

  await page.getByPlaceholder('你的登山代号').fill(`qa-${Date.now()}`)
  await page.locator('select').selectOption('四川')
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()

  await expect(page).toHaveURL(new RegExp(`/trek\\?mountainId=${mountainId}$`))
  await expect(page.getByText('确认今天要记录的山峰')).toBeVisible()
  const confirmTargetButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  await expect(confirmTargetButton).toBeEnabled({ timeout: 30000 })
  await confirmTargetButton.click()
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeVisible()

  await page.goto('/onboarding-qa')
  await expect(page.getByText('Product QA Console')).toBeVisible()
  await expect(page.getByText('演示顺序模式')).toBeVisible()

  await page.getByRole('button', { name: '复制报告摘要' }).click()
  await expect(page.getByText('已复制 QA 报告摘要到剪贴板。')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Markdown' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^peak-trekker-qa-report-\d{4}-\d{2}-\d{2}\.md$/)
})

test('first-time visitors can skip the intro, anchor a province, and continue to explore', async ({ page }) => {
  await completeProvinceOnboarding(page)

  await expect(page.getByText('Activation Checklist')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '探索' })).toBeVisible()
  await expect(page.getByText('山峰列表')).toBeVisible()
})

test('province draft from onboarding prefills the register profile step', async ({ page }) => {
  await completeProvinceOnboarding(page)

  await page.goto('/auth/register')
  await page.getByPlaceholder('your@email.com').fill(createTestEmail())
  await page.getByPlaceholder('至少6位').fill('PeakTrekker123!')
  await page.getByRole('button', { name: '下一步 →' }).click()
  await expect(page.locator('select')).toHaveValue('四川')
})

test('explore search supports an empty-state recovery path for real users', async ({ page }) => {
  await page.goto('/explore')
  await expect(page.getByText('找下一座山')).toBeVisible()

  const searchInput = page.getByPlaceholder('搜索山峰或省份')
  await searchInput.fill('this-mountain-should-not-exist')
  await expect(page.getByText('没有找到匹配的山峰')).toBeVisible()

  await searchInput.fill('')
  await expect(page.getByText('没有找到匹配的山峰')).not.toBeVisible()
  await expect(page.locator('a[href^="/explore/"]').first()).toBeVisible()
})

test('explore advanced filters combine correctly for real mountain results', async ({ page }) => {
  await completeProvinceOnboarding(page)
  await dismissActivationChecklistIfPresent(page)
  await expect(page.getByText('找下一座山')).toBeVisible()

  const [candidate] = await getExploreCardMeta(page)
  expect(candidate).toBeTruthy()

  const searchInput = page.getByPlaceholder('搜索山峰或省份')
  await searchInput.fill(candidate.province)
  await page.getByRole('button', { name: '筛选' }).click({ force: true })
  await page.getByRole('button', { name: DIFFICULTY_FILTER_LABEL[candidate.difficulty], exact: true }).click()
  await page.getByRole('button', { name: altitudeFilterFor(candidate.altitude).label }).click()
  await page.getByRole('button', { name: lengthFilterFor(candidate.lengthKm).label }).click()

  const filteredCards = await getExploreCardMeta(page)
  expect(filteredCards.length).toBeGreaterThan(0)

  for (const card of filteredCards) {
    expect(card.province).toContain(candidate.province)
    expect(card.difficulty).toBe(candidate.difficulty)

    const altitudeBand = altitudeFilterFor(card.altitude).value
    const lengthBand = lengthFilterFor(card.lengthKm).value

    expect(altitudeBand).toBe(altitudeFilterFor(candidate.altitude).value)
    expect(lengthBand).toBe(lengthFilterFor(candidate.lengthKm).value)
  }
})

test('guest detail CTA preserves the target mountain when redirecting to login', async ({ page }) => {
  const { href, mountainId } = await getFirstMountain(page)

  await page.goto(href)
  const loginCta = page.getByRole('button', { name: '登录后开始记录' }).first()
  await expect(loginCta).toBeVisible()
  await loginCta.click()

  await expect(page).toHaveURL(/\/auth\/login/)
  const loginUrl = new URL(page.url())
  expect(loginUrl.searchParams.get('from')).toBe(`/trek?mountainId=${mountainId}`)
})

test('locked mountain detail keeps the user on detail and surfaces the license restriction prompt', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/explore')
  await dismissActivationChecklistIfPresent(page)

  const lockedMountain = (await getExploreCardMeta(page)).find((card) => card.licenseLevel !== 'none')
  expect(lockedMountain).toBeTruthy()

  await page.goto(lockedMountain!.href)
  const lockCta = page.getByTestId('mountain-detail-primary-cta').getByRole('button', { name: '查看执照要求' })
  await expect(lockCta).toBeVisible()
  await lockCta.click()

  await expect(page.getByText('需要更高等级执照')).toBeVisible()
  await expect(page.getByText(/当前路线需要初级执照|当前路线需要中级执照|当前路线需要高级执照/).first()).toBeVisible()
  await expect(page).not.toHaveURL(/\/trek/)
})

test('eligible mountain detail CTA enters the record page with the target mountain carried through', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/explore')
  await dismissActivationChecklistIfPresent(page)

  const unlockedMountain = (await getExploreCardMeta(page)).find((card) => card.licenseLevel === 'none')
  expect(unlockedMountain).toBeTruthy()

  const mountainId = unlockedMountain!.href.split('/').pop()
  expect(mountainId).toBeTruthy()

  await page.goto(unlockedMountain!.href)
  const startCta = page.getByTestId('mountain-detail-primary-cta').getByRole('button', { name: '开始记录' })
  await expect(startCta).toBeVisible()
  await startCta.click()

  await expect(page).toHaveURL(new RegExp(`/trek\\?mountainId=${mountainId}$`))
  await expect(page.getByText('确认今天要记录的山峰')).toBeVisible()
})

test('mountain detail prioritizes recording CTA and removes the dead favorite action', async ({ page }) => {
  const { href } = await getFirstMountain(page)

  await page.goto(href)

  await expect(page.getByRole('button', { name: '收藏' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /开始记录|登录后开始记录/ }).first()).toBeVisible()
  await expect(page.getByText('山峰图集')).toHaveCount(0)
  await expect(page.getByText('POI 摘要')).toHaveCount(0)
  await expect(page.getByText('近期登顶')).toHaveCount(0)
  await expect(page.getByText('路线信息')).toHaveCount(0)
  await expect(page.getByText('山峰简介')).toBeVisible()
  await expect(page.locator('.section-title').filter({ hasText: '静态路线参考' })).toBeVisible()
  await expect(page.getByText('行前天气提醒')).toBeVisible()
  await expect(page.getByText('只保留轻量决策提示，不做专业天气承诺。')).toHaveCount(0)
  await expect(page.getByText('本路线仅供参考，实际请结合专业地图、天气、向导和现场情况判断。')).toBeVisible()

  const routeFacts = page.getByTestId('mountain-route-facts')
  await expect(routeFacts).toBeVisible()
  await expect(routeFacts.locator('.metric-tile')).toHaveCount(4)
  await expect(routeFacts.getByText('准入要求', { exact: true })).toHaveCount(0)

  const reminderList = page.getByTestId('weather-reminder-list')
  await expect(reminderList).toBeVisible()
  await expect(reminderList.getByTestId('weather-reminder-item')).toHaveCount(3)

  const reminderHeights = await reminderList.getByTestId('weather-reminder-item').evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().height)
  )
  expect(Math.max(...reminderHeights)).toBeLessThan(72)

  const keyPoints = page.getByTestId('mountain-key-points')
  const keyPointModuleCount = await keyPoints.count()
  if (keyPointModuleCount > 0) {
    const tabCount = await keyPoints.getByRole('button').count()
    if (tabCount <= 1) {
      await expect(keyPoints.getByTestId('mountain-key-point-item')).toHaveCount(1)
    } else {
      await expect(keyPoints.getByRole('button')).toHaveCount(tabCount)
    }
  }
})

test('mountain detail hero uses a lightweight multi-image carousel when mountain photos are available', async ({ page }) => {
  await completeProvinceOnboarding(page)
  await dismissActivationChecklistIfPresent(page)
  await page.goto('/explore')
  const [candidate] = await getExploreCardMeta(page)
  expect(candidate).toBeTruthy()

  await page.goto(candidate.href)

  const carousel = page.getByTestId('mountain-hero-carousel')
  await expect(carousel).toBeVisible()
  const expectedSlideCount = Math.max(1, candidate.heroImageCount)
  await expect(carousel.locator('[data-testid="mountain-hero-slide"]')).toHaveCount(expectedSlideCount)

  if (candidate.heroImageCount > 1) {
    const indicator = page.getByTestId('mountain-hero-indicator')
    await expect(indicator).toContainText(`1/${candidate.heroImageCount}`)
    await carousel.evaluate((node) => {
      node.scrollTo({ left: node.clientWidth, behavior: 'auto' })
    })
    await expect(indicator).toContainText(`2/${candidate.heroImageCount}`)
  } else {
    await expect(page.getByTestId('mountain-hero-indicator')).toHaveCount(0)
  }

  await expect(page.getByText('山峰图集')).toHaveCount(0)
})

test('targeted trek flow requires explicit mountain confirmation before recording starts', async ({ page }) => {
  const { mountainId } = await getFirstMountain(page)

  await registerFreshUser(page)
  await page.goto(`/trek?mountainId=${mountainId}`)
  await dismissActivationChecklistIfPresent(page)

  await expect(page.getByText('确认今天要记录的山峰')).toBeVisible()
  await expect(page.getByRole('button', { name: '从这里开始' })).toHaveCount(0)
  const confirmTargetButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  await expect(confirmTargetButton).toBeEnabled({ timeout: 30000 })
  await confirmTargetButton.click()
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeVisible()
})

test('direct trek access requires choosing a mountain before recording can begin', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/trek')
  await dismissActivationChecklistIfPresent(page)

  await expect(page.getByText('先选一座山，再开始今天的记录')).toBeVisible()
  await expect(page.locator('select option')).not.toHaveCount(1, { timeout: 30000 })
  const confirmButton = page.getByRole('button', { name: '确认目标山峰', exact: true })
  await expect(confirmButton).toBeDisabled()

  await page.locator('select').selectOption({ index: 1 })
  await expect(confirmButton).toBeEnabled()
})

test('profile page focuses on identity records and shares instead of achievements and province ranking boards', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/profile')

  await expect(page.getByText('我的登山记录', { exact: true })).toBeVisible()
  await expect(page.getByText('我的分享', { exact: true })).toBeVisible()
  await expect(page.getByText('成就分类')).toHaveCount(0)
  await expect(page.getByText('省内荣誉榜')).toHaveCount(0)
  await expect(page.getByText('省内排名')).toHaveCount(0)
})

test('header uses a compact progress pill that expands on click instead of showing raw mountain-count text', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/explore')
  await dismissActivationChecklistIfPresent(page)

  const progressButton = page.getByRole('button', { name: '查看登山进度' })
  await expect(progressButton).toBeVisible()
  await expect(page.getByTestId('header-progress-pill')).not.toContainText('座')

  await progressButton.click()
  await expect(page.getByText('还没点亮第一座山')).toBeVisible()
  await expect(page.getByText('当前执照')).toBeVisible()
})

test('profile hosts the compact certificate summary layout while debug stays focused on QA tools', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/profile')

  await expect(page.getByText('执照进度', { exact: true })).toBeVisible()
  await expect(page.getByText('当前执照', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('下一阶段', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('profile-license-summary').locator('[data-license-summary-card]')).toHaveCount(2)
  await expect(page.locator('[data-license-card]')).toHaveCount(4)
  await expect(page.locator('[data-license-card][data-license-state="current"]')).toHaveCount(1)

  const ladderFits = await page.getByTestId('profile-license-grid').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  expect(ladderFits).toBeTruthy()

  const cardHeights = await page.locator('[data-license-card]').evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().height)
  )
  expect(Math.max(...cardHeights)).toBeLessThan(160)

  await page.goto('/debug')
  await expect(page.getByText('执照进度', { exact: true })).toHaveCount(0)
})

test('profile records open a private activity detail page instead of using community detail as the record object', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const { mountainId } = await getFirstMountain(page)
  const note = `activity-detail-${Date.now()}`

  await registerFreshUser(page, '四川')
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, note)

  await page.goto(`${root}/profile`)
  await dismissActivationChecklistIfPresent(page)
  const recordsSection = page.locator('#profile-records')
  const recordRow = recordsSection.locator('.profile-record-card').filter({ hasText: note }).first()
  await expect(recordRow).toBeVisible()
  await recordRow.getByRole('link', { name: '查看攀登记录' }).click()

  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}$`))
  await expect(page.locator(`[data-activity-checkin-id="${checkinId}"]`)).toBeVisible()
  await expect(page.getByRole('link', { name: '发布到山友圈' })).toBeVisible()
  await expect(page.getByRole('button', { name: '点赞' })).toHaveCount(0)
})

test('activity detail keeps record-first actions and embedded photo previews contained on 375', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const { mountainId } = await getFirstMountain(page)
  const note = `activity-preview-${Date.now()}`

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, '四川')
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, note)

  await page.goto(`${root}/activity/${checkinId}`)
  const activityRoot = page.locator(`[data-activity-checkin-id="${checkinId}"]`)
  await expect(activityRoot).toBeVisible()

  const actions = activityRoot.getByTestId('activity-actions')
  await expect(actions).toBeVisible()
  await expect(actions.getByRole('link', { name: '发布到山友圈' })).toHaveCount(1)
  await expect(actions.getByRole('link', { name: '查看已发布内容' })).toHaveCount(0)
  await expect(actions.getByRole('link', { name: '编辑山友圈内容' })).toHaveCount(0)
  await expect(actions.getByTestId('activity-utility-action').getByRole('button', { name: '生成分享素材' })).toBeVisible()

  const photoGrid = activityRoot.getByTestId('activity-photo-grid')
  await expect(photoGrid.locator('.activity-photo-grid__item')).toHaveCount(1, { timeout: 30_000 })

  const activityPreviewFits = await photoGrid.evaluate((node) => {
    const containerRect = node.getBoundingClientRect()
    const items = [...node.querySelectorAll<HTMLElement>('.activity-photo-grid__item')]
    const maxOverflow = items.reduce((overflow, item) => {
      const rect = item.getBoundingClientRect()
      return Math.max(overflow, rect.right - containerRect.right, containerRect.left - rect.left)
    }, 0)

    return {
      scrollFits: node.scrollWidth <= node.clientWidth + 1,
      maxOverflow,
    }
  })

  expect(activityPreviewFits.scrollFits).toBeTruthy()
  expect(activityPreviewFits.maxOverflow).toBeLessThanOrEqual(1)
})

test('explore keeps the first screen focused on search filters and mountain cards', async ({ page }) => {
  await page.goto('/explore')
  await expect(page.getByText('找下一座山')).toBeVisible()
  await expect(page.getByText('精选路线')).toHaveCount(0)
  await expect(page.getByText('待补素材山峰清单')).toHaveCount(0)
  await expect(page.getByText('山峰列表')).toBeVisible()
  await expect(page.locator('a[href^="/explore/"]').first()).toBeVisible()
})

test('explore cards stay image-first on 375 instead of using a tiny thumbnail layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/explore')
  await expect(page.getByText('找下一座山')).toBeVisible()

  const firstCard = page.getByTestId('explore-mountain-card').first()
  const cover = firstCard.getByTestId('explore-mountain-card-cover')
  await expect(cover).toBeVisible()

  const box = await cover.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeGreaterThan(260)
  expect(box!.height).toBeGreaterThan(150)

  const body = firstCard.getByTestId('explore-mountain-card-body')
  await expect(body).toBeVisible()
  await expect(firstCard.getByTestId('explore-mountain-card-topline')).toBeVisible()
  await expect(firstCard.getByTestId('explore-mountain-card-subline')).toBeVisible()
  await expect(firstCard.getByTestId('explore-mountain-card-location')).toBeVisible()
  await expect(firstCard.getByTestId('explore-mountain-card-difficulty')).toBeVisible()
  await expect(firstCard.getByTestId('explore-mountain-card-metrics')).toBeVisible()
  await expect(firstCard.getByTestId('explore-mountain-card-requirement')).toBeVisible()
  await expect(body.locator('.muted-chip')).toHaveCount(1)
  await expect(firstCard.getByTestId('explore-mountain-card-metrics').locator('.metric-label')).toHaveCount(3)

  const bodyBox = await body.boundingBox()
  const cardBox = await firstCard.boundingBox()
  expect(bodyBox).toBeTruthy()
  expect(cardBox).toBeTruthy()
  expect(bodyBox!.height).toBeLessThan(175)
  expect(cardBox!.height).toBeLessThan(360)
})

test('share card lab opens as a preview-first share sheet with lightweight mode switching', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/share-card-lab')

  const shareButton = page.getByRole('button', { name: '生成分享素材' }).first()
  await expect(shareButton).toBeVisible()
  await shareButton.click()

  await expect(page.getByText('分享素材', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '推荐' })).toBeVisible()
  await expect(page.getByRole('button', { name: '结果卡' })).toBeVisible()
  await expect(page.getByRole('button', { name: '透明水印' })).toBeVisible()
  await expect(page.getByRole('button', { name: '分享', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '下载', exact: true })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '结果卡' }).click()
  await expect(page.getByText('不依赖现场照片，直接生成简洁结果卡。')).toBeVisible()

  await page.getByRole('button', { name: '透明水印' }).click()
  await expect(page.getByText('透明背景预览，适合导出后在外部工具继续叠加。')).toBeVisible()

  await page.getByRole('button', { name: '推荐' }).click()
  const uploadInput = page.locator('input[type="file"]').first()
  await uploadInput.setInputFiles({
    name: 'summit-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wm0WZ0AAAAASUVORK5CYII=',
      'base64'
    ),
  })
  await expect(page.getByText('已优先使用现场照片合成分享图，打开后就能直接分享。')).toBeVisible()
  await expect(page.getByRole('button', { name: '分享', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '更多操作' }).click()
  await expect(page.getByRole('button', { name: '下载透明水印' })).toBeVisible()
})

test('share card lab uses upgraded background copy and surfaces generation failures through global toast', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/share-card-lab')

  await page.route('**/api/poster*', async (route) => {
    await route.abort('failed')
  }, { times: 1 })

  await page.getByRole('button', { name: '生成分享素材' }).first().click()
  await expect(
    page.locator('[role="alert"]').filter({ hasText: '生成分享图失败，请稍后重试。' })
  ).toBeVisible()
  await expect(page.getByText('生成失败', { exact: true })).toHaveCount(0)
})

test('poster preview supports classic card, photo composite, and transparent overlay modes', async ({ request }) => {
  const cases = [
    { template: 'summit_card', renderMode: 'overlay_only' },
    { template: 'summit_card', renderMode: 'photo_composite' },
    { template: 'activity_summary', renderMode: 'classic_card' },
  ] as const

  for (const item of cases) {
    const response = await request.get(
      `/api/poster-preview?template=${item.template}&renderMode=${item.renderMode}`
    )

    expect(response.ok()).toBeTruthy()
    expect(response.headers()['content-type']).toContain('image/')

    const body = await response.body()
    expect(body.byteLength).toBeGreaterThan(8_000)
  }
})
