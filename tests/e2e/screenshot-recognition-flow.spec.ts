import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createSolidColorPngBuffer,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'
import { captureOptionalE2EScreenshot } from './trek-regression.helpers'

const SEEDED_CHECKIN_IDS: string[] = []

function readEnvValue(key: string) {
  const envText = (() => {
    try {
      return readFileSync('.env.local', 'utf8')
    } catch {
      return ''
    }
  })()

  return envText.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for screenshot E2E tests.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function cleanupSeededCheckins() {
  if (SEEDED_CHECKIN_IDS.length === 0) return
  const ids = SEEDED_CHECKIN_IDS.splice(0, SEEDED_CHECKIN_IDS.length)
  const { error } = await getSupabaseAdminClient()
    .from('checkins')
    .delete()
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to clean up screenshot E2E checkins: ${error.message}`)
  }
}

test.afterEach(async () => {
  await cleanupSeededCheckins()
})

test('screenshot recognition flow writes an uploaded activity and opens activity detail', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await page.route('**/api/screenshot/recognize', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ocrResult: {
          rawText: [
            '登顶了泰山',
            '泰山·山东',
            '路线距离',
            '5.9 km',
            '海拔',
            '1.545 m',
            '累计爬升',
            '1051 m',
            '运动时长',
            '2h 00m',
            '2026/04/22',
          ].join('\n'),
          textBlocks: [],
        },
        parsedFields: {
          location: { value: '泰山', raw: '登顶了泰山' },
          distance: { value: 5.9, unit: 'km', raw: '路线距离 5.9 km' },
          elevation: { value: 1545, raw: '海拔 1.545 m' },
          elevationGain: { value: 1051, raw: '累计爬升 1051 m' },
          duration: { value: 7200, raw: '2h 00m' },
          date: { value: '2026-04-22', raw: '2026/04/22' },
        },
      }),
    })
  })

  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page).toHaveURL(/\/screenshot/)

  const screenshot = await createSolidColorPngBuffer({
    width: 390,
    height: 780,
    red: 24,
    green: 28,
    blue: 34,
  })

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'liangbulu-taishan.png',
    mimeType: 'image/png',
    buffer: screenshot,
  })

  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('总距离')).toHaveValue('5.9')
  await expect(page.getByLabel('海拔')).toHaveValue('1545')
  await expect(page.getByLabel('时长')).toHaveValue('02:00:00')
  await expect(page.getByLabel('地点')).toHaveValue('泰山')
  const taishanOption = page.getByRole('button', { name: /泰山/ }).first()
  await expect(taishanOption).toBeVisible({ timeout: 20_000 })
  await taishanOption.click()
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-confirm.png')

  const confirmResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/import/confirm') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"source":"screenshot_recognition"') ?? false
  })

  await page.getByRole('button', { name: '确认并生成活动' }).click()
  const confirmResponse = await confirmResponsePromise
  const confirmBody = await confirmResponse.json().catch(() => ({}))
  expect(confirmResponse.status(), JSON.stringify(confirmBody)).toBe(200)

  const checkinId = String(confirmBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)
  SEEDED_CHECKIN_IDS.push(checkinId)

  await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '返回活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await expect(page.getByText('UPLOADED')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('GPS VERIFIED')).toHaveCount(0)
  await expect(page.getByTestId('activity-detail-title')).toHaveText('泰山')
  await expect(page.getByTestId('activity-detail-subline')).not.toContainText('未关联')
  await expect(page.getByText('5.9', { exact: true })).toBeVisible()
  await expect(page.getByText('总距离 km')).toBeVisible()
  await expect(page.getByRole('link', { name: '生成分享' })).toHaveAttribute('href', `/share?checkinId=${checkinId}`)
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-activity.png')

  const { data, error } = await getSupabaseAdminClient()
    .from('checkins')
    .select(
      'id, source, verified_at, ranking_weight, mountain_id, distance_meters, duration_seconds, max_elevation_meters, elevation_gain_meters',
    )
    .eq('id', checkinId)
    .single()

  expect(error).toBeNull()
  expect(data?.source).toBe('screenshot_recognition')
  expect(data?.verified_at).toBeNull()
  expect(data?.ranking_weight).toBe(0)
  expect(data?.mountain_id).toBeTruthy()
  expect(data?.distance_meters).toBe(5900)
  expect(data?.duration_seconds).toBe(7200)
  expect(data?.max_elevation_meters).toBe(1545)
  expect(data?.elevation_gain_meters).toBe(1051)
})

test('screenshot confirm omits disabled duration and missing elevation without fallback bleed', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await page.route('**/api/screenshot/recognize', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ocrResult: {
          rawText: ['跑步记录', '总距离', '10.34 km', '运动时长', '535385h 23m'].join('\n'),
          textBlocks: [],
        },
        parsedFields: {
          distance: { value: 10.34, unit: 'km', raw: '总距离 10.34 km' },
          duration: { value: 1_927_387_380, raw: '535385h 23m' },
        },
      }),
    })
  })

  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page).toHaveURL(/\/screenshot/)

  const screenshot = await createSolidColorPngBuffer({
    width: 390,
    height: 780,
    red: 18,
    green: 22,
    blue: 28,
  })

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'no-elevation-duration-off.png',
    mimeType: 'image/png',
    buffer: screenshot,
  })

  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('总距离')).toHaveValue('10.34')
  await page.locator('[data-field-key="duration"]').getByRole('button').click()
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-duration-off.png')

  const confirmResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/import/confirm') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"source":"screenshot_recognition"') ?? false
  })

  await page.getByRole('button', { name: '确认并生成活动' }).click()
  const confirmResponse = await confirmResponsePromise
  const confirmBody = await confirmResponse.json().catch(() => ({}))
  expect(confirmResponse.status(), JSON.stringify(confirmBody)).toBe(200)

  const checkinId = String(confirmBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)
  SEEDED_CHECKIN_IDS.push(checkinId)
  await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '返回活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await expect(page.getByText('UPLOADED')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('activity-detail-title')).toHaveText('未关联山行')
  await expect(page.getByTestId('activity-detail-subline')).toContainText('未关联山峰')
  const heroAltitude = page.getByTestId('activity-hero-altitude-value')
  await expect(heroAltitude).toHaveText('--')
  await expect(heroAltitude).not.toContainText('0')
  const routeMemoryElevation = page.getByTestId('activity-route-memory-elevation-value')
  await expect(routeMemoryElevation).toHaveText('--')
  await expect(routeMemoryElevation).not.toContainText('0')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-no-elevation-activity.png')

  const { data, error } = await getSupabaseAdminClient()
    .from('checkins')
    .select('id, source, mountain_id, distance_meters, duration_seconds, max_elevation_meters, elevation_gain_meters')
    .eq('id', checkinId)
    .single()

  expect(error).toBeNull()
  expect(data?.source).toBe('screenshot_recognition')
  expect(data?.mountain_id).toBeNull()
  expect(data?.distance_meters).toBe(10340)
  expect(data?.duration_seconds).toBeNull()
  expect(data?.max_elevation_meters).toBeNull()
  expect(data?.elevation_gain_meters).toBeNull()

  await page.goto(`${root}/archive`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('archive-trip-title').first()).toHaveText('未关联山行')
  await expect(page.getByTestId('archive-trip-unmatched-tag').first()).toHaveText('未关联')
  await expect(page.getByTestId('archive-trip-secondary').first()).toContainText('未知地点')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-no-location-archive.png')

  await page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('profile-trip-title').first()).toHaveText('未关联山行')
  await expect(page.getByTestId('profile-trip-unmatched-tag').first()).toHaveText('未关联')
  await expect(page.getByTestId('profile-trip-secondary').first()).toContainText('未知地点')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-no-location-profile.png')
})

test('unmatched screenshot activity uses recognized location as title across activity and lists', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await page.route('**/api/mountains/search?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mountains: [] }),
    })
  })

  await page.route('**/api/screenshot/recognize', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ocrResult: {
          rawText: ['阳江市', '总距离', '10.32 km', '运动时长', '1h 20m'].join('\n'),
          textBlocks: [],
        },
        parsedFields: {
          location: { value: '阳江市', raw: '阳江市' },
          distance: { value: 10.32, unit: 'km', raw: '总距离 10.32 km' },
          duration: { value: 4800, raw: '1h 20m' },
        },
      }),
    })
  })

  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page).toHaveURL(/\/screenshot/)

  const screenshot = await createSolidColorPngBuffer({
    width: 390,
    height: 780,
    red: 20,
    green: 25,
    blue: 31,
  })

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'yangjiang-screenshot.png',
    mimeType: 'image/png',
    buffer: screenshot,
  })

  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('总距离')).toHaveValue('10.32')
  await expect(page.getByLabel('地点')).toHaveValue('阳江市')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-location-confirm.png')

  const confirmResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/import/confirm') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"source":"screenshot_recognition"') ?? false
  })

  await page.getByRole('button', { name: '确认并生成活动' }).click()
  const confirmResponse = await confirmResponsePromise
  const confirmBody = await confirmResponse.json().catch(() => ({}))
  expect(confirmResponse.status(), JSON.stringify(confirmBody)).toBe(200)

  const checkinId = String(confirmBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)
  SEEDED_CHECKIN_IDS.push(checkinId)

  await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '返回活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await expect(page.getByTestId('activity-detail-title')).toHaveText('阳江市')
  await expect(page.getByTestId('activity-detail-subline')).toContainText('未关联山峰')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-location-activity.png')

  const { data, error } = await getSupabaseAdminClient()
    .from('checkins')
    .select('id, source, mountain_id, track_name, distance_meters, duration_seconds')
    .eq('id', checkinId)
    .single()

  expect(error).toBeNull()
  expect(data?.source).toBe('screenshot_recognition')
  expect(data?.mountain_id).toBeNull()
  expect(data?.track_name).toBe('阳江市')
  expect(data?.distance_meters).toBe(10320)
  expect(data?.duration_seconds).toBe(4800)

  await page.goto(`${root}/archive`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('archive-trip-title').first()).toHaveText('阳江市')
  await expect(page.getByTestId('archive-trip-unmatched-tag').first()).toHaveText('未关联')
  await expect(page.getByTestId('archive-trip-secondary').first()).toContainText('未关联山峰')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-location-archive.png')

  await page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('profile-trip-title').first()).toHaveText('阳江市')
  await expect(page.getByTestId('profile-trip-unmatched-tag').first()).toHaveText('未关联')
  await expect(page.getByTestId('profile-trip-secondary').first()).toContainText('未关联山峰')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-location-profile.png')
})
