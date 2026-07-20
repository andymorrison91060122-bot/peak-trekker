import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createSolidColorPngBuffer,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
  seedFreshUserAccountForLogin,
} from './community.helpers'
import { captureOptionalE2EScreenshot } from './trek-regression.helpers'

const SEEDED_CHECKIN_IDS: string[] = []
const SEEDED_USER_IDS: string[] = []
const EVIDENCE_DIR = 'output/fu115-fu113-debt-acceptance'
const FIXTURE_RUN_ID = process.env.FU115_FIXTURE_RUN_ID ?? `local-${process.pid}`
const FIXTURE_RUN_DIR = `${EVIDENCE_DIR}/e2e-runs/${FIXTURE_RUN_ID}`
const FIXTURE_LEDGER = {
  checkinsCreated: 0,
  checkinsDeleted: 0,
  usersCreated: 0,
  usersDeleted: 0,
}

type CleanupAttempt = {
  kind: 'checkins' | 'users'
  pendingIds: string[]
  deletedIds: string[]
  errors: string[]
}

const CLEANUP_ATTEMPTS: CleanupAttempt[] = []

const PRIOR_FIXTURE_RECOVERY_ATTEMPTS: unknown[] = (() => {
  try {
    const manifest = JSON.parse(readFileSync(`${EVIDENCE_DIR}/fixture-recovery-manifest.json`, 'utf8'))
    return Array.isArray(manifest.attempts) ? manifest.attempts : []
  } catch {
    return []
  }
})()

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

function removePendingIds(pendingIds: string[], deletedIds: string[]) {
  const deletedIdSet = new Set(deletedIds)
  for (let index = pendingIds.length - 1; index >= 0; index -= 1) {
    if (deletedIdSet.has(pendingIds[index])) pendingIds.splice(index, 1)
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function writeFixtureRecoveryManifest() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  mkdirSync(FIXTURE_RUN_DIR, { recursive: true })
  const runManifest = {
    runId: FIXTURE_RUN_ID,
    pendingCheckinIds: SEEDED_CHECKIN_IDS,
    pendingUserIds: SEEDED_USER_IDS,
    attempts: CLEANUP_ATTEMPTS,
    ledger: FIXTURE_LEDGER,
  }
  writeFileSync(
    `${EVIDENCE_DIR}/fixture-recovery-manifest.json`,
    `${JSON.stringify({
      ...runManifest,
      attempts: [...PRIOR_FIXTURE_RECOVERY_ATTEMPTS, ...CLEANUP_ATTEMPTS],
    }, null, 2)}\n`,
  )
  writeFileSync(`${FIXTURE_RUN_DIR}/fixture-recovery-manifest.json`, `${JSON.stringify(runManifest, null, 2)}\n`)
}

async function cleanupSeededCheckins(): Promise<CleanupAttempt> {
  const pendingIds = [...SEEDED_CHECKIN_IDS]
  const attempt: CleanupAttempt = { kind: 'checkins', pendingIds, deletedIds: [], errors: [] }
  if (pendingIds.length === 0) {
    CLEANUP_ATTEMPTS.push(attempt)
    return attempt
  }

  try {
    const { data, error } = await getSupabaseAdminClient()
      .from('checkins')
      .delete()
      .in('id', pendingIds)
      .select('id')
    if (error) throw new Error(`Failed to clean up screenshot E2E checkins: ${error.message}`)

    const deletedIds = (data ?? []).map((row) => String(row.id))
    const missingIds = pendingIds.filter((id) => !deletedIds.includes(id))
    if (missingIds.length > 0) {
      throw new Error(`Screenshot E2E checkin cleanup missed ids: ${missingIds.join(', ')}`)
    }

    attempt.deletedIds.push(...deletedIds)
    removePendingIds(SEEDED_CHECKIN_IDS, deletedIds)
    FIXTURE_LEDGER.checkinsDeleted += deletedIds.length
  } catch (error) {
    attempt.errors.push(errorMessage(error))
  }

  CLEANUP_ATTEMPTS.push(attempt)
  return attempt
}

async function cleanupSeededUsers(): Promise<CleanupAttempt> {
  const pendingIds = [...SEEDED_USER_IDS]
  const attempt: CleanupAttempt = { kind: 'users', pendingIds, deletedIds: [], errors: [] }

  for (const userId of pendingIds) {
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.auth.admin.deleteUser(userId)
      if (error) throw new Error(`Failed to clean up screenshot E2E auth user ${userId}: ${error.message}`)

      const { data: remainingProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
      if (profileError) throw new Error(`Failed to verify screenshot E2E profile cleanup ${userId}: ${profileError.message}`)
      if ((remainingProfiles ?? []).length > 0) {
        throw new Error(`Screenshot E2E profile cleanup did not remove user id: ${userId}`)
      }

      const { data: remainingUser, error: lookupError } = await supabase.auth.admin.getUserById(userId)
      if (lookupError && !/not found/i.test(lookupError.message)) {
        throw new Error(`Failed to verify screenshot E2E auth cleanup ${userId}: ${lookupError.message}`)
      }
      if (remainingUser.user?.id === userId) {
        throw new Error(`Screenshot E2E auth cleanup did not remove user id: ${userId}`)
      }

      attempt.deletedIds.push(userId)
      removePendingIds(SEEDED_USER_IDS, [userId])
      FIXTURE_LEDGER.usersDeleted += 1
    } catch (error) {
      attempt.errors.push(errorMessage(error))
    }
  }

  CLEANUP_ATTEMPTS.push(attempt)
  return attempt
}

function writeFixtureLedger() {
  mkdirSync(FIXTURE_RUN_DIR, { recursive: true })
  writeFileSync(
    `${FIXTURE_RUN_DIR}/fixture-ledger.json`,
    `${JSON.stringify({ runId: FIXTURE_RUN_ID, ...FIXTURE_LEDGER }, null, 2)}\n`,
  )
}

test.afterEach(async () => {
  const checkinAttempt = await cleanupSeededCheckins()
  const userAttempt = await cleanupSeededUsers()
  const persistenceErrors: string[] = []

  try {
    writeFixtureLedger()
  } catch (error) {
    persistenceErrors.push(`fixture ledger: ${errorMessage(error)}`)
  }
  try {
    writeFixtureRecoveryManifest()
  } catch (error) {
    persistenceErrors.push(`fixture recovery manifest: ${errorMessage(error)}`)
  }

  const cleanupErrors = [
    ...checkinAttempt.errors.map((error) => `checkins: ${error}`),
    ...userAttempt.errors.map((error) => `users: ${error}`),
    ...persistenceErrors,
  ]
  if (cleanupErrors.length > 0) {
    throw new Error(`Screenshot E2E fixture cleanup failed:\n${cleanupErrors.join('\n')}`)
  }
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

  const account = await registerFreshUser(page, root, { returnTo: '/screenshot' })
  SEEDED_USER_IDS.push(account.userId)
  FIXTURE_LEDGER.usersCreated += 1
  writeFixtureRecoveryManifest()
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
  FIXTURE_LEDGER.checkinsCreated += 1
  writeFixtureRecoveryManifest()

  await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '返回活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await expect(page.getByText('上传记录')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('GPS 实测')).toHaveCount(0)
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

  const account = await registerFreshUser(page, root, { returnTo: '/screenshot' })
  SEEDED_USER_IDS.push(account.userId)
  FIXTURE_LEDGER.usersCreated += 1
  writeFixtureRecoveryManifest()
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
  FIXTURE_LEDGER.checkinsCreated += 1
  writeFixtureRecoveryManifest()
  await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '返回活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await expect(page.getByText('上传记录')).toBeVisible({ timeout: 20_000 })
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
  await expect(page.getByTestId('archive-summary-max-altitude-value')).toHaveText('--')
  await expect(page.getByTestId('archive-summary-max-altitude-value')).not.toContainText('0')
  await expect(page.getByTestId('archive-trip-max-altitude-value').first()).toHaveText('--')
  await expect(page.getByTestId('archive-trip-max-altitude-value').first()).not.toContainText('0')
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

  const account = await registerFreshUser(page, root, { returnTo: '/screenshot' })
  SEEDED_USER_IDS.push(account.userId)
  FIXTURE_LEDGER.usersCreated += 1
  writeFixtureRecoveryManifest()
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
  FIXTURE_LEDGER.checkinsCreated += 1
  writeFixtureRecoveryManifest()

  await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '返回活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await expect(page.getByTestId('activity-detail-title')).toHaveText('阳江市')
  await expect(page.getByTestId('activity-detail-subline')).toContainText('未关联山峰')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-location-activity.png')
  await page.goBack()
  await expect(page).not.toHaveURL(/\/screenshot/, { timeout: 10_000 })

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
  await expect(page.getByTestId('archive-summary-max-altitude-value')).toHaveText('--')
  await expect(page.getByTestId('archive-summary-max-altitude-value')).not.toContainText('0')
  await expect(page.getByTestId('archive-trip-max-altitude-value').first()).toHaveText('--')
  await expect(page.getByTestId('archive-trip-max-altitude-value').first()).not.toContainText('0')
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-location-archive.png')

  await page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('profile-trip-title').first()).toHaveText('阳江市')
  await expect(page.getByTestId('profile-trip-unmatched-tag').first()).toHaveText('未关联')
  await expect(page.getByTestId('profile-trip-secondary').first()).toContainText('未关联山峰')
  const profileShareLink = page.locator(`a[data-testid="profile-trip-share-link"][href="/share?checkinId=${checkinId}"]`)
  await expect(profileShareLink).toHaveText(/分享素材/)
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-unmatched-location-profile.png')

  await profileShareLink.click()
  await expect(page).toHaveURL(new RegExp(`/share\\?checkinId=${checkinId}`), { timeout: 20_000 })
  const shareHero = page.getByTestId('share-hero-preview')
  await expect(shareHero).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('body')).not.toContainText(/GPS VERIFIED|GPS 真实轨迹|verified/i)
  await expect(shareHero.locator('[data-real-track]')).toHaveCount(0)
  await captureOptionalE2EScreenshot(page, 'screenshot-recognition-profile-share-editor.png')
})

test.describe('FU-115 anonymous screenshot history closure', () => {
  test('anonymous explore entry returns to explore after auth, recognition, and activity creation', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(240_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    const navigationEvents: Array<{ url: string; status?: number; resourceType?: string }> = []
    const historySnapshots: Array<{
      stage: string
      currentIndex: number
      entries: Array<{ id: number; url: string; userTypedURL: string }>
    }> = []
    let recognizeCalls = 0

    mkdirSync(EVIDENCE_DIR, { recursive: true })
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      recordVideo: { dir: EVIDENCE_DIR, size: { width: 375, height: 812 } },
    })
    const page = await context.newPage()
    const video = page.video()
    let testFailure: unknown = null
    let captureFinalHistory: (() => Promise<void>) | null = null

    try {
    await page.addInitScript(() => {
      window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
      window.localStorage.setItem('peak_trekker_province_draft', '四川')
    })
    await page.route('**/api/analytics/event', async (route) => {
      await route.fulfill({ status: 204 })
    })
    await page.route('**/api/mountains/search?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mountains: [] }),
      })
    })
    await page.route('**/api/screenshot/recognize', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      recognizeCalls += 1
      if (recognizeCalls === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'controlled auth gate' }),
        })
        return
      }
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

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigationEvents.push({ url: frame.url() })
    })
    page.on('response', (response) => {
      const resourceType = response.request().resourceType()
      if (resourceType === 'document' || (response.status() >= 300 && response.status() < 400)) {
        navigationEvents.push({
          url: response.url(),
          status: response.status(),
          resourceType,
        })
      }
    })

    const cdp = await page.context().newCDPSession(page)
    async function captureHistory(stage: string) {
      const snapshot = await cdp.send('Page.getNavigationHistory')
      historySnapshots.push({
        stage,
        currentIndex: snapshot.currentIndex,
        entries: snapshot.entries.map((entry) => ({
          id: entry.id,
          url: entry.url,
          userTypedURL: entry.userTypedURL,
        })),
      })
    }
    captureFinalHistory = () => captureHistory('test-final-state')

    const account = await seedFreshUserAccountForLogin({
      username: `qa-history-${Date.now()}`,
      province: '四川',
    })
    expect(account.userId).toMatch(/[0-9a-f-]{36}/i)
    SEEDED_USER_IDS.push(account.userId)
    FIXTURE_LEDGER.usersCreated += 1
    writeFixtureRecoveryManifest()

    await page.goto(`${root}/explore`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(`${root}/explore`)
    await expect(page.locator('[data-explore-pathway-button="识别截图"]')).toBeVisible({ timeout: 20_000 })
    await captureHistory('anonymous-explore')

    await page.locator('[data-explore-pathway-button="识别截图"]').click()
    await expect(page).toHaveURL(`${root}/screenshot`)
    await captureHistory('anonymous-screenshot')

    const screenshot = await createSolidColorPngBuffer({
      width: 390,
      height: 780,
      red: 20,
      green: 25,
      blue: 31,
    })
    const upload = {
      name: 'fu115-history-closure.png',
      mimeType: 'image/png',
      buffer: screenshot,
    }
    async function uploadThroughVisibleEntry() {
      const fileChooserPromise = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: /^上传记录截图/ }).click()
      const fileChooser = await fileChooserPromise
      await fileChooser.setFiles(upload)
    }

    await uploadThroughVisibleEntry()
    await expect(page.locator('main').getByRole('alert')).toContainText('登录后才能识别截图。', { timeout: 20_000 })
    await expect(page.getByRole('button', { name: '去登录' })).toBeVisible()
    await captureHistory('controlled-401-auth-gate')

    await page.getByRole('button', { name: '去登录' }).click()
    await expect(page).toHaveURL(new RegExp('/auth/login\\?from=%2Fscreenshot$'))
    await captureHistory('login-page')

    await page.getByPlaceholder('your@email.com').fill(account.email)
    await page.getByPlaceholder(/至少6位|••••••••/).fill(account.password)
    await page.getByRole('button', { name: '▶ 开始登山' }).click()
    await expect(page).toHaveURL(`${root}/screenshot`, { timeout: 30_000 })
    await captureHistory('authenticated-screenshot')

    await uploadThroughVisibleEntry()
    await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByLabel('总距离')).toHaveValue('10.32')
    await expect(page.getByLabel('地点')).toHaveValue('阳江市')
    expect(recognizeCalls).toBe(2)

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
    FIXTURE_LEDGER.checkinsCreated += 1
    writeFixtureRecoveryManifest()

    await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: '返回活动' }).click()
    await expect(page).toHaveURL(`${root}/activity/${checkinId}`, { timeout: 20_000 })
    await captureHistory('activity-detail')

    await page.goBack({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(`${root}/explore`, { timeout: 20_000 })
    await captureHistory('browser-back-explore')
    await page.screenshot({
      path: `${EVIDENCE_DIR}/fu115-browser-back-explore-375x812.png`,
      fullPage: true,
    })

    const finalHistory = historySnapshots.at(-1)
    const currentEntry = finalHistory?.entries[finalHistory.currentIndex]
    expect(currentEntry?.url).toBe(`${root}/explore`)
    } catch (error) {
      testFailure = error
      throw error
    } finally {
      const evidenceErrors: string[] = []
      const captureEvidence = async (label: string, operation: () => Promise<void> | void) => {
        try {
          await operation()
        } catch (error) {
          evidenceErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      await captureEvidence('final history', async () => {
        if (captureFinalHistory) await captureFinalHistory()
      })
      await captureEvidence('final screenshot', async () => {
        await page.screenshot({
          path: `${EVIDENCE_DIR}/fu115-anonymous-screenshot-final-state-375x812.png`,
          fullPage: true,
        })
      })
      await captureEvidence('history evidence', () => {
        writeFileSync(
          `${EVIDENCE_DIR}/fu115-history-chain.json`,
          `${JSON.stringify({
            evidenceBoundary: {
              ocr: 'controlled by Playwright route interception',
              login: 'real application and Supabase auth',
              history: 'real Chromium navigation history',
              middleware: 'real application middleware',
              activityWrite: 'real application API and test-account database row',
              browserBack: 'real Chromium goBack',
            },
            outcome: testFailure ? 'failed' : 'passed',
            finalUrl: page.url(),
            recognizeCalls,
            navigationEvents,
            historySnapshots,
          }, null, 2)}\n`,
        )
      })
      await captureEvidence('context close', () => context.close())
      await captureEvidence('video save', async () => {
        if (video) await video.saveAs(`${EVIDENCE_DIR}/fu115-anonymous-screenshot-history-375x812.webm`)
      })

      if (evidenceErrors.length > 0) {
        const message = `FU-115 evidence persistence failed: ${evidenceErrors.join('; ')}`
        if (testFailure) {
          console.error(message)
        } else {
          throw new Error(message)
        }
      }
    }
  })
})
