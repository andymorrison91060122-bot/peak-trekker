import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createHistoricalCheckinViaApi,
  registerFreshUser as registerFreshUserViaHelper,
} from './community.helpers'

type ExploreCardMeta = {
  href: string
  province: string
  difficulty: string
  altitude: number
  lengthKm: number | null
  licenseLevel: string
  heroImageCount: number
}

type TrekMountainMeta = {
  id: string
  latitude: number
  longitude: number
  altitude: number
}

type NetworkRequestRecord = {
  method: string
  url: string
  disposition: 'allowed' | 'blocked' | 'stubbed'
}

async function installReadOnlyNetworkGuard(page: Page) {
  const records: NetworkRequestRecord[] = []
  const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

  await page.context().route('**/*', async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const url = new URL(request.url())

    if (url.pathname === '/api/analytics/event') {
      records.push({ method, url: request.url(), disposition: 'stubbed' })
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname.startsWith('/api/weather/')) {
      records.push({ method, url: request.url(), disposition: 'stubbed' })
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weather stubbed for read-only carousel test' }),
      })
      return
    }

    if (mutationMethods.has(method)) {
      records.push({ method, url: request.url(), disposition: 'blocked' })
      await route.abort('blockedbyclient')
      return
    }

    await route.continue()
  })

  return records
}

async function dispatchHorizontalTouchSwipe({
  page,
  client,
}: {
  page: Page
  client: CDPSession
}) {
  const carousel = page.getByTestId('mountain-hero-carousel')
  const box = await carousel.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error('Expected carousel bounding box.')

  const start = {
    x: box.x + box.width * 0.82,
    y: box.y + box.height * 0.5,
  }
  const endX = box.x + box.width * 0.18
  const hitTarget = await page.evaluate(({ x, y }) => {
    const carouselNode = document.querySelector<HTMLElement>('[data-testid="mountain-hero-carousel"]')
    const hitNode = document.elementFromPoint(x, y)
    return {
      tagName: hitNode?.tagName ?? null,
      withinCarousel: Boolean(carouselNode && hitNode && carouselNode.contains(hitNode)),
      ariaHiddenAncestor: Boolean(hitNode?.closest('[aria-hidden="true"]')),
      testId: hitNode?.getAttribute('data-testid') ?? null,
      activeIndex: carouselNode?.getAttribute('data-active-index') ?? null,
    }
  }, start)

  expect(
    hitTarget.withinCarousel,
    `Touch hit target must be a carousel descendant: ${JSON.stringify(hitTarget)}`,
  ).toBe(true)
  expect(
    hitTarget.ariaHiddenAncestor,
    `Touch hit target must not be inside an aria-hidden decoration: ${JSON.stringify(hitTarget)}`,
  ).toBe(false)

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...start, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
  })
  for (let step = 1; step <= 12; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: start.x + ((endX - start.x) * step) / 12,
        y: start.y,
        radiusX: 2,
        radiusY: 2,
        force: 1,
        id: 1,
      }],
    })
    await page.waitForTimeout(20)
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  return hitTarget
}

async function expectCarouselSnap(page: Page, targetIndex: number) {
  const carousel = page.getByTestId('mountain-hero-carousel')
  await expect.poll(
    () => carousel.getAttribute('data-active-index'),
    { timeout: 5_000 },
  ).toBe(String(targetIndex))
  await expect.poll(async () => carousel.evaluate((node, index) => {
    return Math.abs(node.scrollLeft - node.clientWidth * index)
  }, targetIndex), { timeout: 5_000 }).toBeLessThanOrEqual(2)

  const samples: number[] = []
  for (let sample = 0; sample < 3; sample += 1) {
    samples.push(await carousel.evaluate((node) => node.scrollLeft))
    await page.waitForTimeout(100)
  }
  expect(Math.max(...samples) - Math.min(...samples)).toBeLessThanOrEqual(2)
}

function createTestEmail() {
  return `qa-e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

async function getExploreCardMeta(page: Page): Promise<ExploreCardMeta[]> {
  const cardsLocator = page.locator('[data-testid="explore-mountain-card"]')
  await expect(cardsLocator.first()).toBeVisible({ timeout: 20_000 })
  return page.locator('[data-testid="explore-mountain-card"]').evaluateAll((cards) =>
    cards.map((card) => ({
      href: (card.getAttribute('href') ?? '').trim(),
      province: (card.getAttribute('data-province') ?? '').trim(),
      difficulty: (card.getAttribute('data-difficulty') ?? '').trim(),
      altitude: Number(card.getAttribute('data-altitude') ?? '0'),
      lengthKm: card.getAttribute('data-length-km') === null
        ? null
        : Number(card.getAttribute('data-length-km')),
      licenseLevel: (card.getAttribute('data-license-level') ?? '').trim(),
      heroImageCount: Number(card.getAttribute('data-hero-image-count') ?? '0'),
    })).filter((card) => card.href.startsWith('/mountain/'))
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
  beginner: '入门线',
  intermediate: '进阶线',
  advanced: '高阶线',
  expert: '专家线',
}

async function getFirstMountain(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '山峰列表' })).toBeVisible()

  const firstMountainLink = page.locator('[data-testid="explore-mountain-card"][href^="/mountain/"], a[href^="/mountain/"]').first()
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

async function fetchTrekMountainMeta(page: Page, mountainId: string): Promise<TrekMountainMeta> {
  return page.evaluate(async (targetMountainId) => {
    const response = await fetch('/api/trek/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_active_mountains' }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(payload?.mountains)) {
      throw new Error(String(payload?.error ?? 'Failed to load mountains for Trek test.'))
    }
    const match = payload.mountains.find((item: { id: string }) => item.id === targetMountainId)
    if (!match) {
      throw new Error(`Could not find target mountain ${targetMountainId} for Trek test.`)
    }
    return match as TrekMountainMeta
  }, mountainId)
}

async function grantTrekLocation(page: Page, mountain: TrekMountainMeta) {
  const origin = new URL(page.url()).origin
  await page.context().grantPermissions(['geolocation'], { origin })
  await page.context().setGeolocation({
    latitude: mountain.latitude,
    longitude: mountain.longitude,
    accuracy: 5,
  })
}

async function completeIntroOnboarding(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  const skipButton = page.getByRole('button', { name: '跳过' })
  await skipButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click()
  }

  await expect(page.getByText('已经走过？把结果带回来')).toBeVisible({ timeout: 15000 })
}

async function registerFreshUser(page: Page) {
  const email = createTestEmail()
  const password = 'PeakTrekker123!'
  await registerFreshUserViaHelper(page, 'http://127.0.0.1:3100', {
    email,
    password,
    username: `qa-${Date.now()}`,
    returnTo: '/explore',
  })
}

async function dismissActivationChecklistIfPresent(page: Page) {
  const introSkipButton = page.getByRole('button', { name: '跳过' })
  await introSkipButton.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {})
  if (await introSkipButton.isVisible().catch(() => false)) {
    await introSkipButton.click()
  }

  const dismissButton = page.getByRole('button', { name: '先自己逛逛' })
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click()
    await expect(dismissButton).not.toBeVisible({ timeout: 10000 })
  }
}

test('guest can register from protected trek redirect and return to the targeted mountain flow', async ({ page }) => {
  const { mountainId } = await getFirstMountain(page)
  const email = createTestEmail()
  const password = 'PeakTrekker123!'

  await page.goto(`/trek?mountainId=${mountainId}`)
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByText('PEAK TREKKER')).toBeVisible()

  const loginUrl = new URL(page.url())
  expect(loginUrl.searchParams.get('from')).toBe(`/trek?mountainId=${mountainId}`)

  await page.getByRole('link', { name: /注册/ }).click()
  await expect(page).toHaveURL(/\/auth\/register/)

  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('至少6位').fill(password)
  await page.getByRole('button', { name: '下一步 →' }).click()

  await page.getByPlaceholder('给自己起个名字').fill(`qa-${Date.now()}`)
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()
  await page.waitForLoadState('domcontentloaded')
  if (/\/auth\/login/.test(page.url())) {
    await page.getByPlaceholder('your@email.com').fill(email)
    await page.getByPlaceholder(/至少6位|••••••••/).fill(password)
    await page.getByRole('button', { name: '▶ 开始登山' }).click()
  }

  await expect(page).toHaveURL(new RegExp(`/trek\\?mountainId=${mountainId}$`))
  const mountain = await fetchTrekMountainMeta(page, mountainId)
  await grantTrekLocation(page, mountain)
  const permissionButton = page.getByRole('button', { name: /去开启权限|重新检测/ })
  if (await permissionButton.isVisible().catch(() => false)) {
    await permissionButton.click()
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
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

test('ONB-001: first-time visitors can skip intro and continue to explore without a province gate', async ({ page }) => {
  await completeIntroOnboarding(page)

  await expect(page.getByText('Activation Checklist')).toHaveCount(0)
  await expect(page.getByText('已经走过？把结果带回来')).toBeVisible()
  await expect(page.getByText('山峰列表')).toBeVisible()
  await expect(page.getByText('先选一个与你有连接的地方。')).toHaveCount(0)
  await expect(page.getByText('选择归属地')).toHaveCount(0)

  await page.goto('/auth/register')
  await page.getByPlaceholder('your@email.com').fill(createTestEmail())
  await page.getByPlaceholder('至少6位').fill('PeakTrekker123!')
  await page.getByRole('button', { name: '下一步 →' }).click()
  await expect(page.getByPlaceholder('给自己起个名字')).toBeVisible()
  await expect(page.locator('select')).toHaveCount(0)
  await expect(page.getByText('选择归属地')).toHaveCount(0)
})

test('explore search supports an empty-state recovery path for real users', async ({ page }) => {
  await page.goto('/explore')
  await expect(page.getByText('已经走过？把结果带回来')).toBeVisible()

  const searchInput = page.getByPlaceholder('搜山名、地区、海拔')
  await searchInput.fill('this-mountain-should-not-exist')
  await expect(page.getByText('没找到这座山', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '继续搜索', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '导入轨迹记录', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '识别成绩截图', exact: true })).toBeVisible()

  await searchInput.fill('')
  await expect(page.getByText('没找到这座山', { exact: true })).not.toBeVisible()
  await expect(page.getByTestId('explore-mountain-card').first()).toBeVisible()
})

test('explore advanced filters combine correctly for real mountain results', async ({ page }) => {
  await completeIntroOnboarding(page)
  await dismissActivationChecklistIfPresent(page)
  await expect(page.getByText('找山出发')).toBeVisible()

  const candidate = (await getExploreCardMeta(page)).find((card) => card.lengthKm !== null)
  expect(candidate).toBeTruthy()
  if (!candidate || candidate.lengthKm === null) throw new Error('Expected a mountain with a real route length')

  const searchInput = page.getByPlaceholder('搜山名、地区、海拔')
  await searchInput.fill(candidate.province)
  await page.getByRole('button', { name: '展开高级筛选' }).click({ force: true })
  await page.getByRole('button', { name: DIFFICULTY_FILTER_LABEL[candidate.difficulty], exact: true }).last().click()
  await page.getByRole('button', { name: altitudeFilterFor(candidate.altitude).label }).click()
  await page.getByRole('button', { name: lengthFilterFor(candidate.lengthKm).label }).click()

  const filteredCards = await getExploreCardMeta(page)
  expect(filteredCards.length).toBeGreaterThan(0)

  for (const card of filteredCards) {
    expect(card.province).toContain(candidate.province)
    expect(card.difficulty).toBe(candidate.difficulty)

    const altitudeBand = altitudeFilterFor(card.altitude).value
    if (card.lengthKm === null) throw new Error('Length-filtered results must have real route lengths')
    const lengthBand = lengthFilterFor(card.lengthKm).value

    expect(altitudeBand).toBe(altitudeFilterFor(candidate.altitude).value)
    expect(lengthBand).toBe(lengthFilterFor(candidate.lengthKm).value)
  }
})

test('guest detail CTA preserves the target mountain when redirecting to login', async ({ page }) => {
  const { href, mountainId } = await getFirstMountain(page)

  await page.goto(href)
  const loginCta = page.getByRole('link', { name: '登录后开始记录' }).first()
  await expect(loginCta).toBeVisible()
  await loginCta.click()

  await expect(page).toHaveURL(/\/auth\/login/)
  const loginUrl = new URL(page.url())
  expect(loginUrl.searchParams.get('from')).toBe(`/mountain/${mountainId}`)
})

test('higher difficulty mountain detail gives advisory while keeping record CTA enabled', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/explore')
  await dismissActivationChecklistIfPresent(page)

  const advisoryMountain = (await getExploreCardMeta(page)).find((card) => card.difficulty !== 'beginner')
  expect(advisoryMountain).toBeTruthy()

  await page.goto(advisoryMountain!.href, { waitUntil: 'domcontentloaded' })
  const bottomCta = page.getByTestId('mountain-bottom-cta')
  await expect(page.getByTestId('difficulty-advisory')).toBeVisible()
  await expect(bottomCta.getByRole('link', { name: '开始记录' })).toHaveAttribute('href', `/trek?mountainId=${advisoryMountain!.href.split('/').pop()}`)
  await expect(bottomCta.getByRole('link', { name: '查看路线' })).toBeVisible()
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

  await page.goto(unlockedMountain!.href, { waitUntil: 'domcontentloaded' })
  const mountain = await fetchTrekMountainMeta(page, mountainId!)
  await grantTrekLocation(page, mountain)
  const startCta = page.getByTestId('mountain-bottom-cta').getByRole('link', { name: '开始记录' })
  await expect(startCta).toBeVisible()
  await startCta.click()

  await expect(page).toHaveURL(new RegExp(`/trek\\?mountainId=${mountainId}$`))
  await expect(page.getByText('确认今天要记录的山峰')).toBeVisible()
})

test('mountain detail prioritizes recording CTA and removes the dead favorite action', async ({ page }) => {
  const { href } = await getFirstMountain(page)

  await page.goto(href, { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('button', { name: '收藏' })).toHaveCount(0)
  await expect(page.getByTestId('mountain-bottom-cta').getByText(/开始记录|登录后开始记录/).first()).toBeVisible()
  await expect(page.getByText('山峰图集')).toHaveCount(0)
  await expect(page.getByText('POI 摘要')).toHaveCount(0)
  await expect(page.getByText('近期登顶')).toHaveCount(0)
  await expect(page.getByText('路线信息')).toHaveCount(0)
  await expect(page.getByText('山峰简介')).toBeVisible()
  await expect(page.getByTestId('mountain-route-section')).toBeVisible()
  await expect(page.getByTestId('mountain-weather-section')).toBeVisible()
  await expect(page.getByText('只保留轻量决策提示，不做专业天气承诺。')).toHaveCount(0)

  const keyPoints = page.getByTestId('mountain-waypoints-section')
  const keyPointModuleCount = await keyPoints.count()
  const routeCta = page.getByTestId('mountain-bottom-cta').getByRole('link', { name: '查看路线' })
  await expect(routeCta).toHaveAttribute('href', keyPointModuleCount > 0 ? '#waypoints' : '#route')
  await expect(page.getByTestId('mountain-route-section')).toHaveAttribute('id', 'route')
  if (keyPointModuleCount > 0) {
    await expect(keyPoints).toBeVisible()
    await expect(keyPoints).toHaveAttribute('id', 'waypoints')
  }
})

test('mountain detail hero uses a lightweight multi-image carousel when mountain photos are available', async ({ page }, testInfo) => {
  const threeImageMountain = {
    href: '/mountain/906ee700-5779-5370-8cbe-780797a82f8d',
    heroImageCount: 3,
  }
  const twoImageMountain = {
    href: '/mountain/216508c9-ffca-4164-8010-534d8650ee64',
    heroImageCount: 2,
  }
  const evidenceDir = join(
    process.cwd(),
    'output/mountain-carousel-hotfix-acceptance/carousel',
  )
  await mkdir(evidenceDir, { recursive: true })
  await page.setViewportSize({ width: 375, height: 812 })
  const networkRecords = await installReadOnlyNetworkGuard(page)
  const touchTrace: unknown[] = []
  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  const waitForSlideImage = async (carousel: ReturnType<Page['getByTestId']>, index: number) => {
    await expect.poll(() => carousel.locator('img').nth(index).evaluate((image) => (
      image.complete && image.naturalWidth > 0
    ))).toBe(true)
  }

  try {
    await page.goto(threeImageMountain.href, { waitUntil: 'domcontentloaded' })
    const threeImageCarousel = page.getByTestId('mountain-hero-carousel')
    await expect(threeImageCarousel).toBeVisible()
    await expect(threeImageCarousel.locator(':scope > div')).toHaveCount(threeImageMountain.heroImageCount)
    await expect(threeImageCarousel).toHaveAttribute('data-active-index', '0')
    await expect(page.getByTestId('mountain-hero-dot')).toHaveCount(threeImageMountain.heroImageCount)
    await waitForSlideImage(threeImageCarousel, 0)
    await page.screenshot({ path: join(evidenceDir, 'three-image-index-0.png') })
    touchTrace.push(await dispatchHorizontalTouchSwipe({ page, client }))
    await expectCarouselSnap(page, 1)
    await waitForSlideImage(threeImageCarousel, 1)
    await page.screenshot({ path: join(evidenceDir, 'three-image-index-1.png') })
    touchTrace.push(await dispatchHorizontalTouchSwipe({ page, client }))
    await expectCarouselSnap(page, 2)
    await waitForSlideImage(threeImageCarousel, 2)
    await page.screenshot({ path: join(evidenceDir, 'three-image-index-2.png') })

    await page.goto(twoImageMountain.href, { waitUntil: 'domcontentloaded' })
    const twoImageCarousel = page.getByTestId('mountain-hero-carousel')
    await expect(twoImageCarousel).toBeVisible()
    await expect(twoImageCarousel.locator(':scope > div')).toHaveCount(2)
    await expect(page.getByTestId('mountain-hero-dot')).toHaveCount(2)
    await expect(twoImageCarousel).toHaveAttribute('data-active-index', '0')
    touchTrace.push(await dispatchHorizontalTouchSwipe({ page, client }))
    await expectCarouselSnap(page, 1)
    touchTrace.push(await dispatchHorizontalTouchSwipe({ page, client }))
    await expectCarouselSnap(page, 1)
    await expect(twoImageCarousel).not.toHaveAttribute('data-active-index', '2')

    const undeclaredMutations = networkRecords.filter((record) => (
      record.disposition === 'blocked'
    ))
    expect(undeclaredMutations).toEqual([])
    await expect(page.getByText('山峰图集')).toHaveCount(0)
  } finally {
    await writeFile(
      join(evidenceDir, 'touch-trace.json'),
      `${JSON.stringify(touchTrace, null, 2)}\n`,
    )
    await writeFile(
      join(evidenceDir, 'network-requests.json'),
      `${JSON.stringify(networkRecords, null, 2)}\n`,
    )
    await testInfo.attach('carousel-network-requests', {
      body: Buffer.from(JSON.stringify(networkRecords, null, 2)),
      contentType: 'application/json',
    })
  }
})

test('targeted trek flow requires explicit mountain confirmation before recording starts', async ({ page }) => {
  const { mountainId } = await getFirstMountain(page)

  await registerFreshUser(page)
  const mountain = await fetchTrekMountainMeta(page, mountainId)
  await grantTrekLocation(page, mountain)
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

  await expect(page.getByText('还没有选择这次要去的山')).toBeVisible()
  await expect(page.getByRole('button', { name: '从这里开始' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '去 Explore 选山' })).toBeVisible()
  await expect(page.locator('button').filter({ hasText: /无归属|认领/ })).toHaveCount(0)
})

test('profile page focuses on identity records and shares instead of achievements and province ranking boards', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/profile')

  await expect(page.getByTestId('profile-identity-card')).toBeVisible()
  await expect(page.getByText('我的山行档案', { exact: true })).toBeVisible()
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

  const badge = page.getByTestId('profile-license-badge')
  await expect(badge).toBeVisible()
  await badge.click()

  const sheet = page.getByTestId('license-progress-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('license-progress-current')).toBeVisible()
  await expect(sheet.getByTestId('license-progress-rung')).toHaveCount(4)
  await expect(sheet.getByTestId('license-progress-algorithm')).toHaveCount(0)
  await expect(sheet.getByTestId('license-progress-learn-more')).toHaveAttribute('href', '/faq?anchor=license.license-upgrade')

  const ladderFits = await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  expect(ladderFits).toBeTruthy()

  const cardHeights = await sheet.getByTestId('license-progress-rung').evaluateAll((items) =>
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

  await registerFreshUser(page)
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, note)

  await page.goto(`${root}/profile`)
  await dismissActivationChecklistIfPresent(page)
  const recordsSection = page.getByTestId('profile-archive-preview')
  const recordRow = recordsSection.locator(`a[href="/activity/${checkinId}"]`).first()
  await expect(recordRow).toBeVisible()
  await recordRow.click()

  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}$`))
  await expect(page.locator(`[data-activity-checkin-id="${checkinId}"]`)).toBeVisible()
  await expect(page.getByTestId('activity-inline-actions')).toBeVisible()
  await expect(page.getByRole('button', { name: '点赞' })).toHaveCount(0)
})

test('activity detail keeps record-first actions and embedded photo previews contained on 375', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const { mountainId } = await getFirstMountain(page)
  const note = `activity-preview-${Date.now()}`

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page)
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, note)

  await page.goto(`${root}/activity/${checkinId}`)
  const activityRoot = page.locator(`[data-activity-checkin-id="${checkinId}"]`)
  await expect(activityRoot).toBeVisible()

  const actions = activityRoot.getByTestId('activity-inline-actions')
  await expect(actions).toBeVisible()
  await expect(actions.getByRole('link', { name: '生成分享' })).toHaveAttribute('href', `/share?checkinId=${checkinId}`)
  await expect(actions.getByRole('button', { name: '发布到山友圈' })).toHaveCount(0)
  await expect(actions.getByRole('link', { name: '查看已发布内容' })).toHaveCount(0)
  await expect(actions.getByRole('link', { name: '编辑山友圈内容' })).toHaveCount(0)

  const photoGrid = activityRoot.getByTestId('activity-photo-gallery')
  await expect(photoGrid.getByTestId('activity-photo-tile-0')).toBeVisible({ timeout: 30_000 })

  const activityPreviewFits = await photoGrid.evaluate((node) => {
    const containerRect = node.getBoundingClientRect()
    const items = [...node.querySelectorAll<HTMLElement>('[data-testid^="activity-photo-tile-"]')]
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
  await expect(page.getByText('已经走过？把结果带回来')).toBeVisible()
  await expect(page.getByText('找山出发')).toBeVisible()
  await expect(page.getByText('精选路线')).toHaveCount(0)
  await expect(page.getByText('待补素材山峰清单')).toHaveCount(0)
  await expect(page.getByText('山峰列表')).toBeVisible()
  await expect(page.getByTestId('explore-mountain-card').first()).toBeVisible()
})

test('explore cards stay image-first on 375 instead of using a tiny thumbnail layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/explore')
  await expect(page.getByText('已经走过？把结果带回来')).toBeVisible()

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
  await expect(firstCard.getByTestId('explore-mountain-card-altitude')).toBeVisible()
  await expect(firstCard.getByTestId('explore-mountain-card-difficulty')).toContainText(/入门线|进阶线/)

  const bodyBox = await body.boundingBox()
  const cardBox = await firstCard.boundingBox()
  expect(bodyBox).toBeTruthy()
  expect(cardBox).toBeTruthy()
  expect(cardBox!.height).toBeGreaterThanOrEqual(184)
  expect(cardBox!.height).toBeLessThanOrEqual(188)
  expect(Math.abs(bodyBox!.height - box!.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(cardBox!.height - box!.height)).toBeLessThanOrEqual(2)
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
