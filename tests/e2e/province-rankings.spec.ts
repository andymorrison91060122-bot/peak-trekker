import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createGpsCheckinViaApi,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'
import { isFeatureEnabled } from '../../src/lib/feature-flags'

const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')

type ActiveMountain = {
  id: string
  name: string
  latitude: number
  longitude: number
  altitude: number
  difficulty: string | null
}

function getSupabaseAnonClient() {
  const envText = readFileSync('.env.local', 'utf8')
  const url = envText.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
  const anonKey = envText.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim()

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for province ranking tests.')
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function openUserContext(
  browser: Browser,
  baseURL: string,
  {
    returnTo = '/profile',
    province,
  }: {
    returnTo?: string
    province: string
  }
) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const credentials = await registerFreshUser(page, baseURL, {
    returnTo,
    province,
    username: `province-${province}-${Date.now()}`,
  })

  return { context, page, ...credentials }
}

async function listActiveMountainsDetailed(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)

  return page.evaluate(async () => {
    const response = await fetch('/api/trek/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_active_mountains' }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok || !Array.isArray(payload?.mountains)) {
      throw new Error(String(payload?.error ?? 'Failed to list mountains for province ranking tests.'))
    }

    return payload.mountains as ActiveMountain[]
  })
}

function pickMountainByDifficulty(mountains: ActiveMountain[], preferred: string[]) {
  for (const difficulty of preferred) {
    const match = mountains.find((mountain) => mountain.difficulty === difficulty)
    if (match) return match
  }

  const fallback = mountains.find((mountain) => mountain.latitude && mountain.longitude)
  if (!fallback) {
    throw new Error(`Could not find a mountain matching difficulties: ${preferred.join(', ')}`)
  }
  return fallback
}

async function clearUserProvince({
  email,
  password,
}: {
  email: string
  password: string
}) {
  const supabase = getSupabaseAnonClient()
  const signIn = await supabase.auth.signInWithPassword({ email, password })

  if (signIn.error || !signIn.data.user) {
    throw new Error(`Failed to sign in province-less test user: ${signIn.error?.message ?? 'unknown error'}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      province: null,
      province_code: null,
    })
    .eq('id', signIn.data.user.id)

  if (error) {
    throw new Error(`Failed to clear user province: ${error.message}`)
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('province, province_code')
    .eq('id', signIn.data.user.id)
    .single()

  if (profileError) {
    throw new Error(`Failed to read back cleared province: ${profileError.message}`)
  }

  if (profile?.province || profile?.province_code) {
    throw new Error(`Province clear did not persist: ${JSON.stringify(profile)}`)
  }

  await supabase.auth.signOut()
}

async function signInUser(page: Page, baseURL: string, email: string, password: string, returnTo = '/profile') {
  await page.goto(`${baseURL}/auth/login?from=${encodeURIComponent(returnTo)}`, { waitUntil: 'domcontentloaded' })
  await clearOnboardingProvinceDraft(page)
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await page.waitForURL((url) => !/\/auth\/login/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
}

async function clearOnboardingProvinceDraft(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('peak_trekker_province_draft')
  })
}

async function dismissProvinceSelectionIfPresent(page: Page) {
  const skipProvince = page.getByRole('button', { name: '稍后再选' })
  if (await skipProvince.count()) {
    await skipProvince.click().catch(() => {})
  }
}

async function completeGpsSummitViaUi(
  page: Page,
  root: string,
  mountain: {
    id: string
    latitude: number
    longitude: number
    altitude: number
    difficulty: string | null
  }
) {
  const serverMinimumRecordingMs = 95_000
  await page.context().grantPermissions(['geolocation'], { origin: root })
  await page.addInitScript(({ latitude, longitude, altitude }) => {
    type GeoPoint = {
      latitude: number
      longitude: number
      accuracy: number
      altitude: number
    }

    const points: GeoPoint[] = Array.from({ length: 8 }, (_, index) => {
      const factor = (7 - index) / 7
      return {
        latitude: latitude - 0.00012 * factor,
        longitude: longitude - 0.00012 * factor,
        accuracy: index < 2 ? 6 : 4,
        altitude: altitude - Math.round(60 * factor),
      }
    })
    const pointDelays = [60, 14_000, 28_000, 42_000, 56_000, 70_000, 84_000, 98_000]

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
          const handles = points.map((point, index) =>
            window.setTimeout(() => success(buildPosition(point)), pointDelays[index] ?? 98_000)
          )
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

  await page.goto(`${root}/trek?mountainId=${mountain.id}`, { waitUntil: 'domcontentloaded' })
  await dismissProvinceSelectionIfPresent(page)
  await dismissActivationChecklistIfPresent(page)

  const confirmTargetButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  await expect(confirmTargetButton).toBeEnabled({ timeout: 15_000 })
  await confirmTargetButton.click()
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeVisible()
  await page.getByRole('button', { name: '从这里开始' }).click()
  const recordStartedAt = Date.now()
  await expect(page.getByRole('button', { name: '停止记录' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('已接近峰顶')).toBeVisible({ timeout: 15_000 })
  const remainingServerWaitMs = serverMinimumRecordingMs - (Date.now() - recordStartedAt)
  if (remainingServerWaitMs > 0) {
    await page.waitForTimeout(remainingServerWaitMs)
  }
  await expect(page.getByRole('button', { name: '确认登顶' })).toBeEnabled({ timeout: 130_000 })

  const verifyResponse = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"verify_summit_checkin"') ?? false
  })

  await page.getByRole('button', { name: '确认登顶' }).click()
  const verifyPayload = await (await verifyResponse).json().catch(() => ({}))
  expect(String(verifyPayload?.checkinId ?? '')).not.toHaveLength(0)
  await expect(page.getByText('登顶已核验')).toBeVisible({ timeout: 20_000 })
}

test.describe('province rankings', () => {
  test.skip(!provinceRankingEnabled, 'Province ranking UI is hidden by the feature flag.')

  test('province rankings page basic load shows title and footer notes', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'

    await page.goto(`${root}/rankings/province`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('省域热力榜', { exact: true })).toBeVisible()
    await expect(page.getByText('榜单每月 1 号 00:00 重置', { exact: true })).toBeVisible()
    await expect(page.getByText('难度权重：入门 1 · 进阶 2 · 挑战 5 · 硬核 10', { exact: true })).toBeVisible()
  })

  test('province rankings page sorts by score desc and highlights current province row', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const primaryUser = await openUserContext(browser, root, {
      returnTo: '/profile',
      province: '北京',
    })
    const secondaryUser = await openUserContext(browser, root, {
      returnTo: '/profile',
      province: '四川',
    })

    try {
      const mountains = await listActiveMountainsDetailed(primaryUser.page)
      const expertMountain = pickMountainByDifficulty(mountains, ['expert', 'advanced'])
      const beginnerMountain = pickMountainByDifficulty(mountains, ['beginner', 'intermediate'])

      await createGpsCheckinViaApi(primaryUser.page, expertMountain, `province-rank-beijing-${Date.now()}`)
      await createGpsCheckinViaApi(secondaryUser.page, beginnerMountain, `province-rank-sichuan-${Date.now()}`)

      await primaryUser.page.goto(`${root}/rankings/province`, { waitUntil: 'domcontentloaded' })
      await dismissActivationChecklistIfPresent(primaryUser.page)

      const summary = primaryUser.page.getByTestId('province-ranking-summary')
      await expect(summary).toBeVisible()
      await expect(summary).toContainText('我的贡献')
      await expect(summary).toContainText(/本月 \d+ 分/)
      await expect(summary).toContainText(/\d+ 次登顶/)

      const rows = primaryUser.page.getByTestId('province-ranking-row')
      await expect(rows.first()).toBeVisible()

      const rankingData = await rows.evaluateAll((nodes) =>
        nodes.map((node) => ({
          province: node.getAttribute('data-province'),
          totalScore: Number(node.getAttribute('data-total-score') ?? '0'),
          current: node.getAttribute('data-current-province') === 'true',
        }))
      )

      expect(rankingData.length).toBeGreaterThan(1)
      expect(rankingData.every((row, index, list) => index === 0 || list[index - 1]!.totalScore >= row.totalScore)).toBeTruthy()

      const currentProvinceRow = primaryUser.page.getByTestId('province-ranking-row').filter({ has: primaryUser.page.getByText('北京', { exact: true }) }).first()
      await expect(currentProvinceRow).toHaveAttribute('data-current-province', 'true')
      await expect(currentProvinceRow.getByTestId('province-ranking-current-dot')).toBeVisible()
    } finally {
      await primaryUser.context.close()
      await secondaryUser.context.close()
    }
  })

  test('province rankings page shows empty state when target month has no data', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'

    await page.goto(`${root}/rankings/province?year=2099&month=1`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('本月暂无登山记录', { exact: true })).toBeVisible()
    await expect(page.getByTestId('province-ranking-row')).toHaveCount(0)
  })

  test('profile province contribution section shows metrics and navigates to rankings when user has a province', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/profile',
      province: '河南',
    })

    try {
      const mountains = await listActiveMountainsDetailed(user.page)
      const scoredMountain = pickMountainByDifficulty(mountains, ['advanced', 'intermediate', 'beginner'])
      await createGpsCheckinViaApi(user.page, scoredMountain, `province-profile-${Date.now()}`)

      await user.page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })
      await dismissActivationChecklistIfPresent(user.page)

      const section = user.page.getByTestId('province-contribution-section')
      await section.scrollIntoViewIfNeeded()
      await expect(section).toBeVisible()
      await expect(section.getByText('省域贡献', { exact: true })).toBeVisible()
      await expect(section.getByText('河南', { exact: true })).toBeVisible()
      await expect(section.getByText('当前排名', { exact: true })).toBeVisible()
      await expect(section.getByText('积分', { exact: true })).toBeVisible()
      await expect(section.getByText('登顶数', { exact: true })).toBeVisible()
      await expect(section.getByText(/前 \d+%/)).toBeVisible()

      await section.getByRole('link', { name: '查看月榜' }).click()
      await expect(user.page).toHaveURL(`${root}/rankings/province`)
    } finally {
      await user.context.close()
    }
  })

  test('profile province contribution section prompts completion when user has no province', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/profile',
      province: '山西',
    })

    try {
      await clearUserProvince({
        email: user.email,
        password: user.password,
      })

      await signInUser(user.page, root, user.email, user.password, '/profile')
      await user.page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })
      const skipProvince = user.page.getByRole('button', { name: '稍后再选' })
      if (await skipProvince.count()) {
        await skipProvince.click().catch(() => {})
      }
      await dismissActivationChecklistIfPresent(user.page)

      const section = user.page.getByTestId('province-contribution-section')
      await section.scrollIntoViewIfNeeded()
      await expect(section).toBeVisible()
      await expect(section.getByText('完善资料后,你的省域贡献会显示在这里。', { exact: true })).toBeVisible()
      await expect(section.getByRole('link', { name: '查看月榜' })).toHaveCount(0)
    } finally {
      await user.context.close()
    }
  })

  test('explore banner is visible for signed-in users with a province and links to province rankings', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/explore',
      province: '海南',
    })

    try {
      const mountains = await listActiveMountainsDetailed(user.page)
      const scoredMountain = pickMountainByDifficulty(mountains, ['advanced', 'intermediate', 'beginner'])
      await createGpsCheckinViaApi(user.page, scoredMountain, `explore-banner-${Date.now()}`)

      await user.page.goto(`${root}/explore`, { waitUntil: 'domcontentloaded' })
      await dismissActivationChecklistIfPresent(user.page)

      const banner = user.page.getByTestId('province-banner-strip')
      await expect(banner).toBeVisible()
      await expect(banner).toContainText('海南')
      await expect(banner).toContainText(/本月 \d+ 分/)
      await expect(banner).toContainText(/第 \d+ 名/)
      await expect(banner).not.toContainText(/前 \d+%/)
      await expect(banner).not.toContainText('我的贡献')

      await banner.click()
      await expect(user.page).toHaveURL(`${root}/rankings/province`)
    } finally {
      await user.context.close()
    }
  })

  test('explore banner shows province no-data copy when current month has no province activity', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/explore',
      province: '青海',
    })

    try {
      await user.page.goto(`${root}/explore`, { waitUntil: 'domcontentloaded' })
      await dismissActivationChecklistIfPresent(user.page)

      const banner = user.page.getByTestId('province-banner-strip')
      await expect(banner).toBeVisible()
      await expect(banner).toContainText('青海')
      await expect(banner).toContainText('本月暂无登山记录')

      await banner.click()
      await expect(user.page).toHaveURL(`${root}/rankings/province`)
      await expect(user.page.getByTestId('province-ranking-summary')).toContainText('我的贡献')
      await expect(user.page.getByTestId('province-ranking-summary')).toContainText('本月暂无登顶')
    } finally {
      await user.context.close()
    }
  })

  test('explore banner shows 加入省域月榜 for signed-in users without a province and does not navigate', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/explore',
      province: '山西',
    })

    try {
      await clearUserProvince({
        email: user.email,
        password: user.password,
      })

      await signInUser(user.page, root, user.email, user.password, '/explore')
      await user.page.goto(`${root}/explore`, { waitUntil: 'domcontentloaded' })
      await dismissProvinceSelectionIfPresent(user.page)
      await dismissActivationChecklistIfPresent(user.page)

      const banner = user.page.getByTestId('province-banner-strip')
      await expect(banner).toBeVisible()
      await expect(banner).toContainText('加入省域月榜')
      await expect(banner.locator('a')).toHaveCount(0)

      const currentUrl = user.page.url()
      await banner.click()
      await expect(user.page).toHaveURL(currentUrl)
    } finally {
      await user.context.close()
    }
  })

  test('explore banner does not render for guests', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'

    await page.goto(`${root}/explore`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('province-banner-strip')).toHaveCount(0)
  })

  test('gps summit success feedback shows province contribution note without rankings navigation', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/explore',
      province: '四川',
    })

    try {
      const mountains = await listActiveMountainsDetailed(user.page)
      const mountain = pickMountainByDifficulty(mountains, ['advanced', 'intermediate', 'beginner'])

      await completeGpsSummitViaUi(user.page, root, mountain)

      const successCard = user.page.getByText('登顶已核验').locator('..').locator('..')
      await expect(user.page.getByTestId('trek-province-contribution-note')).toContainText('贡献给 四川')
      await expect(user.page.getByTestId('trek-province-contribution-note')).toContainText(/\+\d+ 分/)
      await expect(successCard.getByRole('link', { name: /查看省榜/ })).toHaveCount(0)
      await expect(successCard.getByRole('button', { name: /查看省榜/ })).toHaveCount(0)
      await expect(user.page.getByRole('link', { name: '查看攀登记录' })).toBeVisible()
      await expect(user.page.getByRole('link', { name: '分享到山友圈' })).toBeVisible()
    } finally {
      await user.context.close()
    }
  })
})

test.describe('province rankings disabled by feature flag', () => {
  test.skip(provinceRankingEnabled, 'Province ranking UI is enabled by the feature flag.')

  test('province rankings page redirects to explore when flag is off', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'

    await page.goto(`${root}/rankings/province`, { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(`${root}/explore`)
    await expect(page.getByText('省域热力榜', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('province-ranking-list')).toHaveCount(0)
  })

  test('profile hides province contribution section when flag is off', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/profile',
      province: '河南',
    })

    try {
      await user.page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })
      await dismissActivationChecklistIfPresent(user.page)

      await expect(user.page.getByTestId('province-contribution-section')).toHaveCount(0)
      await expect(user.page.getByText('省域贡献', { exact: true })).toHaveCount(0)
      await expect(user.page.getByRole('link', { name: '查看月榜' })).toHaveCount(0)
      await expect(user.page.getByTestId('profile-archive-preview')).toBeVisible()
      await expect(user.page.getByTestId('profile-share-preview-section')).toBeVisible()
    } finally {
      await user.context.close()
    }
  })

  test('explore hides province banner and hot-province chip when flag is off', async ({ browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const user = await openUserContext(browser, root, {
      returnTo: '/explore',
      province: '海南',
    })

    try {
      await user.page.goto(`${root}/explore`, { waitUntil: 'domcontentloaded' })
      await dismissActivationChecklistIfPresent(user.page)

      await expect(user.page.getByTestId('province-banner-strip')).toHaveCount(0)
      await expect(user.page.getByRole('button', { name: '本省热门' })).toHaveCount(0)
      await expect(user.page.getByText('加入省域月榜', { exact: true })).toHaveCount(0)
      await expect(user.page.getByText('山峰列表', { exact: true })).toBeVisible()
    } finally {
      await user.context.close()
    }
  })
})
