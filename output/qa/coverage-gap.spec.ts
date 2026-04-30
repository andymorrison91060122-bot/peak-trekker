import { expect, test, type Page } from '@playwright/test'
import {
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  fetchMostPopularMountain,
  registerFreshUser,
} from '../../tests/e2e/community.helpers'

test.describe.configure({ timeout: 120_000 })

function createTinyPngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAADZc7J/AAAADElEQVR42mP8z8AARAAA//8CBAEAJ5MCKQAAAABJRU5ErkJggg==',
    'base64'
  )
}

function createBrowserTestEmail() {
  return `qa-browser-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

function createPngFile(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: createTinyPngBuffer(),
  }
}

async function registerFreshBrowserUser(page: Page, root: string, province = '四川') {
  const email = createBrowserTestEmail()
  const password = 'PeakTrekker123!'

  await page.goto(`${root}/auth/register`)
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('至少6位').fill(password)
  await page.getByRole('button', { name: '下一步 →' }).click()

  await page.getByPlaceholder('你的登山代号').fill(`qa-${Date.now()}`)
  await page.locator('select').selectOption(province)
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()

  await page.waitForLoadState('networkidle')
  if (/\/auth\/login/.test(page.url())) {
    await page.getByPlaceholder('your@email.com').fill(email)
    await page.getByPlaceholder('至少6位').fill(password)
    await page.getByRole('button', { name: '▶ 开始登山' }).click()
  }

  await expect(page).toHaveURL(/\/(explore|trek)(\?|$)/)
  return { email, password }
}

async function maybeConfirmTarget(page: Page) {
  const confirmButton = page.locator('button').filter({ hasText: /确认这座山，开始记录准备|确认目标山峰/ }).first()
  const startButton = page.getByRole('button', { name: 'Start 开启记录' })
  const deadline = Date.now() + 45_000

  while (Date.now() < deadline) {
    const startVisible = await startButton.isVisible().catch(() => false)
    const confirmVisible = await confirmButton.isVisible().catch(() => false)

    if (startVisible) {
      return
    }

    if (confirmVisible) {
      await expect(confirmButton).toBeEnabled({ timeout: 30_000 })
      await confirmButton.click()
      await expect(startButton).toBeVisible({ timeout: 15_000 })
      return
    }

    await page.waitForTimeout(1000)
  }

  if (await confirmButton.isVisible().catch(() => false)) {
    await expect(confirmButton).toBeEnabled({ timeout: 30_000 })
    await confirmButton.click()
    await expect(startButton).toBeVisible({ timeout: 15_000 })
    return
  }

  await expect(startButton).toBeVisible({ timeout: 15_000 })
}

async function registerFreshUserOnTrek(page: Page, root: string, mountain: { id: string }) {
  await registerFreshBrowserUser(page, root)
  await page.goto(`${root}/trek?mountainId=${mountain.id}`)
  await dismissActivationChecklistIfPresent(page)
  const mountainSelect = page.getByRole('combobox', { name: '目标山峰' })
  await expect(mountainSelect).toBeVisible({ timeout: 60_000 })
  await mountainSelect.selectOption(mountain.id)
  await maybeConfirmTarget(page)
}

async function installPermissionDeniedGeolocation(page: Page) {
  await page.addInitScript(() => {
    const error = { code: 1, message: 'permission denied' }
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success: unknown, fail: (error: { code: number; message: string }) => void) {
          fail(error)
        },
        watchPosition(_success: unknown, fail: (error: { code: number; message: string }) => void) {
          fail(error)
          return 1
        },
        clearWatch() {},
      },
    })
  })
}

async function installSummitGeolocation(
  page: Page,
  {
    latitude,
    longitude,
    altitude,
  }: { latitude: number; longitude: number; altitude: number }
) {
  await page.addInitScript(
    ({ latitude: lat, longitude: lng, altitude: alt }) => {
      type GeoPoint = {
        latitude: number
        longitude: number
        accuracy: number
        altitude: number
      }

      const points: GeoPoint[] = [
        { latitude: lat - 0.00012, longitude: lng - 0.00012, accuracy: 6, altitude: alt - 40 },
        { latitude: lat - 0.00004, longitude: lng - 0.00004, accuracy: 5, altitude: alt - 8 },
        { latitude: lat + 0.00001, longitude: lng + 0.00001, accuracy: 4, altitude: alt + 1 },
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
              window.setTimeout(() => success(buildPosition(points[0])), 40),
              window.setTimeout(() => success(buildPosition(points[1])), 1200),
              window.setTimeout(() => success(buildPosition(points[2])), 2600),
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
    },
    { latitude, longitude, altitude }
  )
}

async function installUnsupportedSystemShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: undefined,
    })
  })
}

async function installSupportedSystemShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => undefined,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    })
  })
}

async function installClipboardShareFallback(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as typeof window & { __copiedDynamicLink?: string }).__copiedDynamicLink = text
        },
      },
    })
  })
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

test('coverage: trek permission denial shows recoverable feedback and keeps map controls minimal', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await installPermissionDeniedGeolocation(page)
  await registerFreshUserOnTrek(page, root, mountain)

  await expect(page.getByRole('button', { name: '图层' })).toBeVisible()
  await expect(page.getByRole('button', { name: '天气' })).toBeVisible()
  await expect(page.getByRole('button', { name: '定位' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Start 开启记录' }).click()
  await expect(page.getByText(/路线仅供参考|专业地图、向导与现场判断/)).toBeVisible()
  await expect(page.getByText('请先允许浏览器访问位置信息。').first()).toBeVisible()
})

test('coverage: trek invalid short sessions and summit rejections stay understandable', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await installSummitGeolocation(page, mountain)
  await registerFreshUserOnTrek(page, root, mountain)

  await page.getByRole('button', { name: 'Start 开启记录' }).click()
  await expect(page.getByRole('button', { name: '停止记录' })).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '停止记录' }).click()
  await expect(page.getByText('记录时间过短，本次不计为有效记录。')).toBeVisible()
  await expect(page.getByText('登顶已核验')).toHaveCount(0)

  await page.route('**/api/trek/actions', async (route) => {
    const payload = route.request().postData() || ''
    if (payload.includes('"action":"verify_summit_checkin"')) {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'insufficient_track_points',
        }),
      })
      return
    }
    await route.continue()
  })

  await maybeConfirmTarget(page)
  await page.getByRole('button', { name: 'Start 开启记录' }).click()
  await expect(page.getByRole('button', { name: '确认登顶' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '确认登顶' }).click()
  await expect(page.getByText('轨迹点还不够，请继续记录一小段再确认登顶。')).toBeVisible()
})

test('coverage: trek photo panel supports replacement and successful submit', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await page.route('**/storage/v1/object/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: 'mock-checkin-photo' }),
    })
  })
  await page.route('**/api/trek/actions', async (route) => {
    const payload = route.request().postData() || ''
    if (payload.includes('"action":"submit_historical_checkin"')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          checkinId: `mock-photo-checkin-${Date.now()}`,
          status: 'pending',
        }),
      })
      return
    }

    await route.continue()
  })

  await registerFreshUserOnTrek(page, root, mountain)

  await page.getByRole('button', { name: /照片打卡/ }).click()
  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles(createPngFile('first-checkin.png'))
  await expect(page.getByText('first-checkin.png')).toBeVisible()
  await fileInput.setInputFiles(createPngFile('second-checkin.png'))
  await expect(page.getByText('second-checkin.png')).toBeVisible()
  await expect(page.getByText('first-checkin.png')).toHaveCount(0)

  await page.getByRole('button', { name: '提交照片打卡' }).click()
  await expect(page.getByRole('alert').getByText('图片上传成功，照片打卡已提交，等待审核结果。')).toBeVisible()
  await expect(page.getByText('second-checkin.png')).toHaveCount(0)
})

test('coverage: trek photo panel distinguishes generic upload failure from missing storage', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await page.route('**/storage/v1/object/**', async (route, request) => {
    if (request.url().includes('bucket-missing.png')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: '404',
          error: 'Bucket not found',
          message: 'Bucket not found',
        }),
      })
      return
    }

    await route.abort('failed')
  })

  await registerFreshUserOnTrek(page, root, mountain)

  await page.getByRole('button', { name: /照片打卡/ }).click()
  const fileInput = page.locator('input[type="file"]').first()

  await fileInput.setInputFiles(createPngFile('network-failure.png'))
  await page.getByRole('button', { name: '提交照片打卡' }).click()
  await expect.soft(page.getByText('图片上传失败，请稍后重试。')).toBeVisible()

  await fileInput.setInputFiles(createPngFile('bucket-missing.png'))
  await page.getByRole('button', { name: '提交照片打卡' }).click()
  await expect(page.getByText('当前环境未配置图片存储，请联系管理员补齐存储配置。')).toBeVisible()
})

test('coverage: trek summit success supports poster preview, download fallback, and direct community publish entry', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await installSummitGeolocation(page, mountain)
  await installUnsupportedSystemShare(page)
  await registerFreshUserOnTrek(page, root, mountain)

  await page.getByRole('button', { name: 'Start 开启记录' }).click()
  await expect(page.getByRole('button', { name: '确认登顶' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '确认登顶' }).click()
  await expect(page.getByText('登顶已核验')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: '生成分享卡' })).toBeVisible()
  await expect(page.getByRole('link', { name: '分享到山友圈' })).toBeVisible()

  await page.getByRole('button', { name: '生成分享卡' }).click()
  await page.getByRole('button', { name: '山峰结果卡' }).click()
  await page.getByRole('button', { name: '预览分享卡' }).click()
  await expect.soft(page.getByText('海报生成成功，可以预览后再分享。')).toBeVisible({ timeout: 20_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '分享海报' }).click()
  await downloadPromise
  await expect(page.getByText('当前设备暂不支持系统分享，已改为直接下载海报。')).toBeVisible()

  await page.getByRole('link', { name: '分享到山友圈' }).click()
  await expect(page).toHaveURL(/\/community\/publish\//)
})

test('coverage: trek tracking supports lightweight in-progress share with clear fallback when system share is unavailable', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await installSummitGeolocation(page, mountain)
  await installUnsupportedSystemShare(page)
  await registerFreshUserOnTrek(page, root, mountain)

  await page.getByRole('button', { name: 'Start 开启记录' }).click()
  await expect(page.getByRole('button', { name: '分享当前进度' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '分享当前进度' }).click()
  await expect(page.getByText('当前进度分享卡已生成，可以预览后再分享。')).toBeVisible({ timeout: 20_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '分享海报' }).click()
  await downloadPromise
  await expect(page.getByText('当前设备暂不支持系统分享，已改为直接下载海报。')).toBeVisible()
})

test('coverage: profile collapses records and shares, uploads avatar, and carries poster into publish editor', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()

  await registerFreshUser(page, root, { returnTo: '/profile' })
  await dismissActivationChecklistIfPresent(page)

  const seededCheckins: string[] = []
  for (let index = 0; index < 5; index += 1) {
    seededCheckins.push(await createHistoricalCheckinViaApi(page, mountain.id, `profile-gap-${Date.now()}-${index}`))
  }

  for (let index = 0; index < 4; index += 1) {
    await publishPostViaApi(page, {
      checkinId: seededCheckins[index],
      title: `我的分享 ${Date.now()}-${index}`,
      body: `用于覆盖我的分享折叠与详情入口的发布内容 ${index + 1}`,
      visibility: 'public',
      tags: ['路线提醒'],
    })
  }

  await page.evaluate(async ({ checkinId }) => {
    await fetch('/api/trek/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_share_card',
        checkinId,
        template: 'activity_summary',
        renderMode: 'classic_card',
        anchorPosition: 'top',
      }),
    })
  }, { checkinId: seededCheckins[4] })

  await page.goto(`${root}/profile`)
  await dismissActivationChecklistIfPresent(page)

  await page.getByRole('link', { name: '查看活动' }).click()
  await expect(page).toHaveURL(/#profile-records$/)

  await page.route('**/storage/v1/object/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: '404',
        error: 'Bucket not found',
        message: 'Bucket not found',
      }),
    })
  })
  await page.route('**/api/profile/avatar-upload', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        avatarUrl: '/avatars/mock-avatar.png',
      }),
    })
  })
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  })
  await page.locator('[data-testid="profile-avatar-input"]').setInputFiles(createPngFile('avatar.png'))
  await expect(page.locator('[data-testid="profile-avatar-image"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('头像更新成功，个人主页和山友圈会同步刷新。')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '更换头像' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-testid="profile-avatar-image"]')).toBeVisible({ timeout: 30_000 })

  const recordsSection = page.locator('#profile-records')
  await expect(recordsSection.getByRole('button', { name: '再次分享海报' })).toHaveCount(3)
  await recordsSection.getByRole('button', { name: '查看全部' }).click()
  await expect(recordsSection.getByRole('button', { name: '再次分享海报' })).toHaveCount(5)

  const sharesSection = page.locator('.surface-card').filter({ has: page.getByText('我的分享', { exact: true }) }).first()
  await sharesSection.getByRole('button', { name: '查看全部' }).click()
  await expect(sharesSection.getByRole('button', { name: '更多操作' })).toHaveCount(4)

  const detailLink = recordsSection.getByRole('link', { name: '查看分享详情' }).first()
  await detailLink.click()
  await expect.soft(page).toHaveURL(/\/community\//)
  if (page.url().includes('/community/')) {
    await page.goBack()
  } else {
    await page.goto(`${root}/profile`)
  }
  await dismissActivationChecklistIfPresent(page)

  await recordsSection.getByRole('link', { name: '分享到山友圈' }).last().click()
  await expect(page).toHaveURL(new RegExp(`/community/publish/${seededCheckins[4]}`))
  await expect(page.locator('[data-asset-type="poster"]')).toHaveCount(1)
})

test('coverage: profile empty states use user-facing copy for new users', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/profile' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page.getByText('你的首条记录会显示在这里')).toBeVisible()
  await expect(page.getByText('还没有发布过山友圈内容。完成一条有效记录后，可以从上面的“我的登山记录”直接开始分享。')).toBeVisible()
})

test('coverage: community interactions keep icon actions, like roster, share invoke/copy paths, and no dead challenge text', async ({ page, browser, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const mountain = await fetchMostPopularMountain()
  const title = `互动覆盖 ${Date.now()}`

  await registerFreshUser(page, root, { returnTo: '/profile' })
  await dismissActivationChecklistIfPresent(page)
  const checkinId = await createHistoricalCheckinViaApi(page, mountain.id, `community-gap-${Date.now()}`)
  const { postId } = await publishPostViaApi(page, {
    checkinId,
    title,
    body: '验证点赞、分享、更多操作和详情入口。',
    visibility: 'public',
    tags: ['路线提醒'],
  })

  const sharerContext = await browser.newContext()
  const sharerPage = await sharerContext.newPage()
  try {
    await installSupportedSystemShare(sharerPage)
    await registerFreshUser(sharerPage, root, { returnTo: '/community' })
    await dismissActivationChecklistIfPresent(sharerPage)
    await sharerPage.goto(`${root}/community`)
    await expect(sharerPage.getByText(title)).toBeVisible()
    const card = sharerPage.locator('article').filter({ hasText: title }).first()
    const likeButton = card.getByLabel('点赞', { exact: true })
    await expect(likeButton).toBeVisible()
    await expect(card.getByRole('button', { name: '分享动态' })).toBeVisible()
    await expect(card.getByRole('button', { name: '更多操作' })).toBeVisible()
    await expect(card.getByText('评论暂未开放')).toHaveCount(0)
    await expect(card.getByText('同款挑战')).toHaveCount(0)
    await expect.soft(card.getByRole('link', { name: '查看完整动态' })).toBeVisible()

    await likeButton.click()
    await expect(sharerPage.getByText('点赞成功。')).toBeVisible()
    await expect(card.getByText('1 人点赞')).toBeVisible()
    await card.getByRole('button', { name: '查看点赞列表' }).click()
    await expect.soft(sharerPage.locator('[role="dialog"]').getByText('点赞的山友', { exact: true })).toBeVisible()
    if (await sharerPage.getByRole('button', { name: '关闭' }).isVisible().catch(() => false)) {
      await sharerPage.getByRole('button', { name: '关闭' }).click()
    }

    await card.getByRole('button', { name: '分享动态' }).click()
    await expect(sharerPage.getByText('分享已调起。')).toBeVisible()

    await card.getByRole('button', { name: '更多操作' }).click()
    await expect(sharerPage.getByRole('button', { name: '举报 · 与登山无关' })).toBeVisible()
  } finally {
    await sharerContext.close()
  }

  const fallbackContext = await browser.newContext()
  const fallbackPage = await fallbackContext.newPage()
  try {
    await installClipboardShareFallback(fallbackPage)
    await registerFreshUser(fallbackPage, root, { returnTo: '/community' })
    await dismissActivationChecklistIfPresent(fallbackPage)
    await fallbackPage.goto(`${root}/community`)
    const card = fallbackPage.locator('article').filter({ hasText: title }).first()
    await card.getByRole('button', { name: '分享动态' }).click()
    await expect(fallbackPage.getByText('动态链接已复制。')).toBeVisible()
    await expect
      .poll(() => fallbackPage.evaluate(() => (window as typeof window & { __copiedDynamicLink?: string }).__copiedDynamicLink || ''))
      .toContain(`/community/${postId}`)
  } finally {
    await fallbackContext.close()
  }
})
