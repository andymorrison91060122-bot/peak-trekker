import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import {
  HUASHAN,
  captureOptionalE2EScreenshot,
} from './trek-regression.helpers'
import {
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'

type TrackCase = 'empty' | 'single' | 'multi'

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
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for share preview E2E tests.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function trackPointsForCase(kind: TrackCase) {
  if (kind === 'empty') return []
  if (kind === 'single') {
    return [
      {
        lat: HUASHAN.latitude,
        lng: HUASHAN.longitude,
        altitude: HUASHAN.altitude,
        accuracy: 5,
        ts: Date.now(),
      },
    ]
  }

  return [
    { lat: HUASHAN.latitude - 0.016, lng: HUASHAN.longitude - 0.012, altitude: 1320, accuracy: 5, ts: Date.now() - 80_000 },
    { lat: HUASHAN.latitude - 0.011, lng: HUASHAN.longitude - 0.008, altitude: 1510, accuracy: 5, ts: Date.now() - 60_000 },
    { lat: HUASHAN.latitude - 0.006, lng: HUASHAN.longitude - 0.004, altitude: 1760, accuracy: 5, ts: Date.now() - 40_000 },
    { lat: HUASHAN.latitude - 0.002, lng: HUASHAN.longitude - 0.001, altitude: 2020, accuracy: 5, ts: Date.now() - 20_000 },
    { lat: HUASHAN.latitude, lng: HUASHAN.longitude, altitude: HUASHAN.altitude, accuracy: 5, ts: Date.now() },
  ]
}

async function updateCheckinTrack(checkinId: string, kind: TrackCase) {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('checkins')
    .update({
      type: 'gps',
      source: 'realtime_gps',
      status: 'approved',
      track_points: trackPointsForCase(kind),
      distance_meters: kind === 'multi' ? 2800 : 0,
      duration_seconds: kind === 'multi' ? 1800 : 10,
      elevation_gain_meters: kind === 'multi' ? 620 : 0,
      max_elevation_meters: HUASHAN.altitude,
      completion_status: 'complete',
    })
    .eq('id', checkinId)

  if (error) {
    throw new Error(`Failed to update share preview E2E checkin ${checkinId}: ${error.message}`)
  }
}

async function seedShareCheckin(page: Page, kind: TrackCase) {
  const checkinId = await createHistoricalCheckinViaApi(page, HUASHAN.id, `share-preview-${kind}-${Date.now()}`)
  SEEDED_CHECKIN_IDS.push(checkinId)
  await updateCheckinTrack(checkinId, kind)
  return checkinId
}

async function cleanupSeededCheckins() {
  if (SEEDED_CHECKIN_IDS.length === 0) return

  const ids = SEEDED_CHECKIN_IDS.splice(0, SEEDED_CHECKIN_IDS.length)
  const { error } = await getSupabaseAdminClient()
    .from('checkins')
    .delete()
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to clean up share preview E2E checkins: ${error.message}`)
  }
}

async function expectServerPng(page: Page, checkinId: string) {
  const response = await page.request.post('/api/share/render', {
    data: {
      template: 'base-classic',
      checkinId,
      fieldVisibility: {},
      transparent: false,
    },
  })
  const body = await response.body()
  expect(response.status(), body.toString('utf8')).toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')

  const metadata = await sharp(body).metadata()
  expect(metadata.width).toBe(1080)
  expect(metadata.height).toBe(1920)
}

test.afterEach(async () => {
  await cleanupSeededCheckins()
})

test('share editor renders empty, single-point, and real track previews without fake fallback routes', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/explore' })
  await dismissActivationChecklistIfPresent(page)

  const emptyCheckinId = await seedShareCheckin(page, 'empty')
  const singleCheckinId = await seedShareCheckin(page, 'single')
  const multiCheckinId = await seedShareCheckin(page, 'multi')

  await page.goto(`/share?checkinId=${emptyCheckinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('share-hero-preview').locator('[data-real-track]')).toHaveCount(0)
  await captureOptionalE2EScreenshot(page, 'share-track-empty.png')
  await expectServerPng(page, emptyCheckinId)

  await page.goto(`/share?checkinId=${singleCheckinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('share-hero-preview').locator('[data-real-track="single-point"]')).toHaveCount(1)
  await expect(page.getByTestId('share-hero-preview').locator('path[data-real-track="true"]')).toHaveCount(0)
  await captureOptionalE2EScreenshot(page, 'share-track-single.png')
  await expectServerPng(page, singleCheckinId)

  await page.goto(`/share?checkinId=${multiCheckinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('share-hero-preview').locator('path[data-real-track="true"]')).toHaveCount(2)
  await captureOptionalE2EScreenshot(page, 'share-track-multi.png')
  await expectServerPng(page, multiCheckinId)
})
