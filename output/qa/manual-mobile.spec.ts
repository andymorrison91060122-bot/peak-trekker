import { expect, test, devices, type Locator, type Page, type TestInfo } from '@playwright/test'
import {
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  fetchMostPopularMountain,
  getFirstMountain,
  registerFreshUser,
} from '../../tests/e2e/community.helpers'

test.use({
  ...devices['Pixel 7'],
})

async function attachViewportEvidence(page: Page, testInfo: TestInfo, label: string) {
  const path = testInfo.outputPath(`${label}.png`)
  await page.screenshot({ path, fullPage: false })
  await testInfo.attach(label, {
    path,
    contentType: 'image/png',
  })
  console.log(JSON.stringify({ check: `${label}_evidence`, screenshotPath: path }))
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const layout = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))

  console.log(JSON.stringify({ check: `${label}_layout`, ...layout }))
  expect(layout.rootScrollWidth, `${label} should not overflow horizontally`).toBeLessThanOrEqual(layout.innerWidth + 4)
  expect(layout.bodyScrollWidth, `${label} body should stay within viewport`).toBeLessThanOrEqual(layout.innerWidth + 4)
}

async function expectTapTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox()
  expect(box, `${label} should be visible`).not.toBeNull()
  expect(box!.height, `${label} should have enough tap height`).toBeGreaterThanOrEqual(40)
  expect(box!.width, `${label} should have enough tap width`).toBeGreaterThanOrEqual(40)
}

async function finishProvinceOnboarding(page: Page, root: string, { dismissChecklist = false } = {}) {
  await page.goto(`${root}/explore`)
  await expect(page.getByText('先找一座你真的想去的山。')).toBeVisible()
  await page.getByRole('button', { name: '跳过' }).click()
  await expect(page.getByText('告诉我，你将为哪片土地而战？')).toBeVisible()
  await page.getByRole('button', { name: '四川' }).click()
  await page.getByRole('button', { name: '生成空白执照' }).click()
  await expect(page.getByText('Activation Checklist')).toBeVisible()

  if (dismissChecklist) {
    await page.getByRole('button', { name: '先自己逛逛' }).click()
    await expect(page.getByText('Activation Checklist')).toHaveCount(0)
  }
}

async function installSummitGeolocation(page: Page, mountain: Awaited<ReturnType<typeof fetchMostPopularMountain>>) {
  await page.addInitScript(({ latitude, longitude, altitude }) => {
    type GeoPoint = {
      latitude: number
      longitude: number
      accuracy: number
      altitude: number
    }

    const points: GeoPoint[] = [
      { latitude: latitude - 0.00012, longitude: longitude - 0.00012, accuracy: 6, altitude: altitude - 60 },
      { latitude, longitude, accuracy: 4, altitude },
      { latitude: latitude + 0.00001, longitude: longitude + 0.00001, accuracy: 4, altitude: altitude + 2 },
    ]

    const timers = new Map<number, number[]>()
    let watchId = 0

    const buildPosition = (point: GeoPoint) =>
      ({
        coords: {
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
          altitude: point.altitude,
          altitudeAccuracy: 1,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      }) as GeolocationPosition

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          success(buildPosition(points[0]))
        },
        watchPosition(success: PositionCallback) {
          const id = ++watchId
          const handles = [
            window.setTimeout(() => success(buildPosition(points[0])), 60),
            window.setTimeout(() => success(buildPosition(points[1])), 1400),
            window.setTimeout(() => success(buildPosition(points[2])), 2800),
          ]
          timers.set(id, handles)
          return id
        },
        clearWatch(id: number) {
          for (const handle of timers.get(id) ?? []) {
            window.clearTimeout(handle)
          }
          timers.delete(id)
        },
      },
    })
  }, {
    latitude: mountain.latitude,
    longitude: mountain.longitude,
    altitude: mountain.altitude,
  })
}

async function installUnsupportedSystemShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new Error('System share unavailable in mobile verification')
      },
    })
  })
}

async function confirmTrekPreflight(page: Page) {
  await expect(page.getByText('确认今天要记录的山峰')).toBeVisible()
  const confirmTargetButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  await expect(confirmTargetButton).toBeEnabled({ timeout: 30_000 })
  await confirmTargetButton.click()
  await expect(page.getByRole('button', { name: 'Start 开启记录' })).toBeVisible()
}

async function publishPostViaApi(
  page: Page,
  {
    checkinId,
    title,
    body,
    visibility = 'public',
    tags = [],
  }: {
    checkinId: string
    title: string
    body: string
    visibility?: 'public' | 'private'
    tags?: string[]
  }
) {
  const response = await page.evaluate(
    async ({ checkinId, title, body, visibility, tags }) => {
      const res = await fetch('/api/community/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_or_update_post',
          checkinId,
          title,
          body,
          visibility,
          tags,
          assets: [],
          coverAssetId: null,
        }),
      })
      return {
        status: res.status,
        body: await res.json().catch(() => ({})),
      }
    },
    { checkinId, title, body, visibility, tags }
  )

  expect(response.status).toBe(200)
  return {
    postId: String(response.body.postId),
    detailUrl: String(response.body.detailUrl),
  }
}

test('mobile onboarding can be dismissed and reopened through the lightweight entry', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await finishProvinceOnboarding(page, root)
  await page.getByRole('button', { name: '先自己逛逛' }).click()
  await expect(page.getByText('Activation Checklist')).toHaveCount(0)

  await page.goto(`${root}/explore`)
  await expect(page.getByText('Activation Checklist')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '继续引导' })).toBeVisible()

  const hasNoRemind = (await page.getByText('不再提醒').count()) > 0
  console.log(JSON.stringify({ check: 'onboarding_lightweight_reentry', hasNoRemind }))
})

test('mobile onboarding supports a version-level no-remind path that hides the lightweight resume entry', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await finishProvinceOnboarding(page, root)

  await page.getByRole('button', { name: '不再提醒' }).click()
  await expect(page.getByText('Activation Checklist')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '继续引导' })).toHaveCount(0)

  await page.goto(`${root}/explore`)
  await expect(page.getByText('Activation Checklist')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '继续引导' })).toHaveCount(0)
})

test('mobile onboarding copy stays user-facing through intro and checklist', async ({ page, baseURL }, testInfo) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.goto(`${root}/explore`)
  await expect(page.getByText('先找一座你真的想去的山。')).toBeVisible()
  await expect(page.getByText('Peak Trekker 会先帮你看清路线、海拔和门槛。')).toBeVisible()
  await attachViewportEvidence(page, testInfo, 'mobile-onboarding-scene-1')

  await page.getByRole('button', { name: '快进下一幕' }).click()
  await expect(page.getByText('开始记录后，轨迹、照片和海报会串成一条完整记录。')).toBeVisible()
  await expect(page.getByText('确认目标山峰后再开始，能避免误以为已经开录。')).toBeVisible()

  await page.getByRole('button', { name: '快进下一幕' }).click()
  await expect(page.getByText('记录完成后，去“我的”管理记录，再决定要不要发到山友圈。')).toBeVisible()
  await expect(page.getByText('你可以回看自己的登山记录、重新分享海报')).toBeVisible()
  await page.getByRole('button', { name: '继续' }).click()

  await expect(page.getByText('告诉我，你将为哪片土地而战？')).toBeVisible()
  await page.getByRole('button', { name: '四川' }).click()
  await page.getByRole('button', { name: '生成空白执照' }).click()
  await expect(page.getByText('Activation Checklist')).toBeVisible()
  await expect(page.getByText('先打开一座山的详情')).toBeVisible()
  await expect(page.getByText('去出发页确认目标山峰，再开始记录')).toBeVisible()
  await expect(page.getByText('先知道海报和山友圈怎么接起来')).toBeVisible()

  await attachViewportEvidence(page, testInfo, 'mobile-onboarding-checklist')
})

test('mobile explore surfaces stay visually stable from list to detail', async ({ page, baseURL }, testInfo) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await finishProvinceOnboarding(page, root, { dismissChecklist: true })
  const { href } = await getFirstMountain(page, root)
  const searchInput = page.getByPlaceholder('Find peaks')
  await expect(searchInput).toBeVisible()
  await expectNoHorizontalOverflow(page, 'mobile-explore')
  await attachViewportEvidence(page, testInfo, 'mobile-explore')

  await page.goto(`${root}${href}`)
  const mainCta = page.getByRole('button', { name: /开始记录这座山|登录后开始记录/ }).first()
  await expect(mainCta).toBeVisible()
  await expectTapTarget(mainCta, 'detail primary CTA')
  await expectNoHorizontalOverflow(page, 'mobile-explore-detail-top')
  await attachViewportEvidence(page, testInfo, 'mobile-explore-detail-top')

  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }))
  const floatingCta = page.getByRole('button', { name: /开始记录这座山|登录后开始记录/ }).last()
  await expect(floatingCta).toBeVisible()
  await expectTapTarget(floatingCta, 'detail floating CTA')
  await expectNoHorizontalOverflow(page, 'mobile-explore-detail-scrolled')
  await attachViewportEvidence(page, testInfo, 'mobile-explore-detail-scrolled')
})

test('mobile trek page keeps preflight and primary controls stable', async ({ page, baseURL }, testInfo) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await registerFreshUser(page, root, { returnTo: `/trek?mountainId=${mountain.id}` })
  await dismissActivationChecklistIfPresent(page)
  await expect(page.getByText('确认今天要记录的山峰')).toBeVisible()
  const confirmTargetButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  await expectTapTarget(confirmTargetButton, 'trek confirm target CTA')
  await expectNoHorizontalOverflow(page, 'mobile-trek-preflight')
  await attachViewportEvidence(page, testInfo, 'mobile-trek-preflight')

  await confirmTargetButton.click()
  const startButton = page.getByRole('button', { name: 'Start 开启记录' })
  await expect(startButton).toBeVisible()
  await expectTapTarget(startButton, 'trek start CTA')
  await expect(page.getByRole('button', { name: '图层' })).toBeVisible()
  await expect(page.getByRole('button', { name: '天气' })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'mobile-trek-ready')
  await attachViewportEvidence(page, testInfo, 'mobile-trek-ready')
})

test('mobile profile keeps the progress pill compact and records area stable', async ({ page, baseURL }, testInfo) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/profile' })
  const { mountainId } = await getFirstMountain(page, root)

  await createHistoricalCheckinViaApi(page, mountainId, `mobile-share-hint-1-${Date.now()}`)
  await createHistoricalCheckinViaApi(page, mountainId, `mobile-share-hint-2-${Date.now()}`)

  await page.goto(`${root}/profile`)
  await dismissActivationChecklistIfPresent(page)

  const progressButton = page.getByRole('button', { name: '查看登山进度' })
  await expect(progressButton).toBeVisible()
  await expect(page.getByTestId('header-progress-pill')).not.toContainText('座')
  await progressButton.click()
  await expect(page.getByText('当前执照').first()).toBeVisible()

  const shareHint = page.getByText(/你有 \d+ 条审核通过的补签记录还没发到山友圈/)
  await expect(shareHint).toBeVisible()
  await page.getByRole('link', { name: '查看活动' }).click()
  await expect(page).toHaveURL(/#profile-records$/)
  await expectNoHorizontalOverflow(page, 'mobile-profile')
  await attachViewportEvidence(page, testInfo, 'mobile-profile')

  console.log(JSON.stringify({ check: 'profile_historical_share_hint', text: await shareHint.textContent() }))
})

test('mobile community feed keeps cards and actions stable', async ({ page, baseURL }, testInfo) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await registerFreshUser(page, root, { returnTo: '/community' })
  await dismissActivationChecklistIfPresent(page)

  const checkinId = await createHistoricalCheckinViaApi(page, mountain.id, `mobile-community-${Date.now()}`)
  const title = `移动端卡片巡检 ${Date.now()}`
  await publishPostViaApi(page, {
    checkinId,
    title,
    body: '用于确认移动端山友圈卡片在真实手机宽度下不会折行、挤压或变形。',
    tags: ['路线提醒'],
  })

  await page.goto(`${root}/community`)
  await dismissActivationChecklistIfPresent(page)
  await expect(page.getByRole('main').getByText('山友圈', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '去我的记录' })).toBeVisible()
  await expect(page.getByText(title)).toBeVisible()
  await expect(page.getByRole('link', { name: '查看完整动态' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /点赞|取消点赞/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '分享动态' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '更多操作' }).first()).toBeVisible()
  await expectNoHorizontalOverflow(page, 'mobile-community')
  await attachViewportEvidence(page, testInfo, 'mobile-community')
})

test('mobile happy path carries a new user from onboarding to community and back to profile', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await installSummitGeolocation(page, mountain)
  await installUnsupportedSystemShare(page)

  await finishProvinceOnboarding(page, root, { dismissChecklist: true })
  await registerFreshUser(page, root, { returnTo: '/explore' })
  await dismissActivationChecklistIfPresent(page)

  const searchInput = page.getByPlaceholder('Find peaks')
  await searchInput.fill(mountain.name)
  const targetMountainLink = page.locator(`a[href="/explore/${mountain.id}"]`).first()
  await expect(targetMountainLink).toBeVisible({ timeout: 20_000 })
  await targetMountainLink.click()

  await expect(page.getByRole('button', { name: '开始记录这座山' })).toBeVisible()
  await page.getByRole('button', { name: '开始记录这座山' }).click()

  await confirmTrekPreflight(page)
  await page.getByRole('button', { name: 'Start 开启记录' }).click()
  await expect(page.getByRole('button', { name: '确认登顶' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '确认登顶' }).click()
  await expect(page.getByText('登顶已核验')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: '生成分享卡' }).click()
  await page.getByRole('button', { name: '山峰结果卡' }).click()
  await page.getByRole('button', { name: '预览分享卡' }).click()
  await expect(page.getByText('海报生成成功，可以预览后再分享。')).toBeVisible({ timeout: 20_000 })
  await attachViewportEvidence(page, testInfo, 'mobile-happy-path-poster-preview')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '分享海报' }).click()
  await downloadPromise
  await expect(page.getByText('当前设备暂不支持系统分享，已改为直接下载海报。')).toBeVisible()

  await page.getByRole('link', { name: '分享到山友圈' }).click()
  await expect(page).toHaveURL(/\/community\/publish\//)
  const title = `普通用户完整旅程 ${Date.now()}`
  await page.locator('input:not([type="file"])').first().fill(title)
  await page.locator('textarea[placeholder="补充路况攻略、装备建议、注意事项或你的登山感受。"]').fill('这条内容用于验证普通用户从找山、记录、生成海报到发山友圈的完整闭环。')
  await page.getByRole('button', { name: '发布到山友圈' }).click()

  await expect(page.getByText('发布成功')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-community-post-id]')).toHaveAttribute('data-community-post-id', /.+/)
  await attachViewportEvidence(page, testInfo, 'mobile-happy-path-community-detail')

  await page.goto(`${root}/profile`)
  await dismissActivationChecklistIfPresent(page)
  await expect(page.getByText('我的登山记录', { exact: true })).toBeVisible()
  await expect(page.getByText('我的分享', { exact: true })).toBeVisible()
  await expect(page.getByText(title)).toBeVisible()
  await attachViewportEvidence(page, testInfo, 'mobile-happy-path-profile')
})
