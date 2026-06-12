import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  buildCommunityTrackPreview,
  parseCommunityPostPayload,
  serializeCommunityPostPayload,
} from '../../src/lib/community'
import { parseGpx } from '../../src/lib/import/gpx-parser'
import {
  createGpsCheckinViaApi,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'
import { HUASHAN, WUDANG } from './trek-regression.helpers'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu83-render-pair-acceptance'
const EVIDENCE_DIR = join(OUTPUT_DIR, 'browser')
const GPX_FIXTURE = '/Users/liuhongyuan/Desktop/peak-trekker/tests/fixtures/gpx/fu83-portrait-49609d3c.gpx'
const CREATED_CHECKINS: string[] = []
const CREATED_POSTS: string[] = []

type TestTrackPoint = {
  lat: number
  lng: number
  altitude: number
  accuracy: number
  ts: number
}

function readEnvValue(key: string) {
  try {
    const envText = readFileSync('.env.local', 'utf8')
    return envText.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for FU-83 E2E tests.')
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function ensureEvidenceDir() {
  await mkdir(EVIDENCE_DIR, { recursive: true })
}

function toPersistedTrack(points: TestTrackPoint[]) {
  return points.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    altitude: point.altitude,
    accuracy: point.accuracy,
    ts: point.ts,
  }))
}

function portraitGpxTrack() {
  const parsed = parseGpx(readFileSync(GPX_FIXTURE, 'utf8'), 'fu83-portrait-49609d3c.gpx')
  const source = parsed.trackPoints
  const step = Math.max(1, Math.ceil(source.length / 180))
  const sampled = source.filter((_, index) => index % step === 0)
  const finalPoints = sampled.at(-1) === source.at(-1) ? sampled : [...sampled, source.at(-1)!]
  return finalPoints.map((point, index) => ({
    lat: point.latitude,
    lng: point.longitude,
    altitude: point.elevation ?? 100 + index,
    accuracy: 5,
    ts: Date.now() - (finalPoints.length - index) * 1000,
  }))
}

function huashanInsideTrack() {
  return Array.from({ length: 24 }, (_, index) => ({
    lat: HUASHAN.latitude - 0.012 + index * 0.00075,
    lng: HUASHAN.longitude - 0.01 + index * 0.0007,
    altitude: 1600 + index * 12,
    accuracy: 5,
    ts: Date.now() - (24 - index) * 1000,
  }))
}

function farOutsideTrack() {
  return Array.from({ length: 24 }, (_, index) => ({
    lat: 31.55 + index * 0.001,
    lng: 117.08 + index * 0.001,
    altitude: 300 + index * 8,
    accuracy: 5,
    ts: Date.now() - (24 - index) * 1000,
  }))
}

async function updateCheckinTrack(checkinId: string, points: TestTrackPoint[]) {
  const supabase = getSupabaseAdminClient()
  const persistedTrack = toPersistedTrack(points)
  const distanceMeters = Math.max(1000, points.length * 80)
  const maxAltitude = Math.max(...points.map((point) => point.altitude))
  const minAltitude = Math.min(...points.map((point) => point.altitude))
  const { data: checkin, error: readError } = await supabase
    .from('checkins')
    .select('id, session_id')
    .eq('id', checkinId)
    .maybeSingle()

  if (readError || !checkin) {
    throw new Error(`Failed to read FU-83 checkin ${checkinId}: ${readError?.message ?? 'not found'}`)
  }

  const { error: checkinError } = await supabase
    .from('checkins')
    .update({
      type: 'gps',
      source: 'realtime_gps',
      track_points: persistedTrack,
      distance_meters: distanceMeters,
      duration_seconds: points.length * 45,
      elevation_gain_meters: Math.max(0, maxAltitude - minAltitude),
      max_elevation_meters: maxAltitude,
      min_elevation_meters: minAltitude,
    })
    .eq('id', checkinId)

  if (checkinError) {
    throw new Error(`Failed to update FU-83 checkin track ${checkinId}: ${checkinError.message}`)
  }

  if (checkin.session_id) {
    const { error: sessionError } = await supabase
      .from('trek_sessions')
      .update({
        track_points: persistedTrack,
        distance_m: distanceMeters,
        ascent_m: Math.max(0, maxAltitude - minAltitude),
        max_altitude_m: maxAltitude,
      })
      .eq('id', checkin.session_id)

    if (sessionError) {
      throw new Error(`Failed to update FU-83 session track ${checkin.session_id}: ${sessionError.message}`)
    }
  }
}

async function createTrackedCheckin(page: Page, mountain: typeof HUASHAN | typeof WUDANG, points: TestTrackPoint[], note: string) {
  const checkinId = await createGpsCheckinViaApi(page, mountain, note)
  CREATED_CHECKINS.push(checkinId)
  await updateCheckinTrack(checkinId, points)
  return checkinId
}

async function attachTrackPreviewToPost(postId: string, checkinId: string, points: TestTrackPoint[]) {
  const supabase = getSupabaseAdminClient()
  const { data: row, error } = await supabase
    .from('posts')
    .select('content')
    .eq('id', postId)
    .maybeSingle()

  if (error || !row) {
    throw new Error(`Failed to read FU-83 post ${postId}: ${error?.message ?? 'not found'}`)
  }

  const payload = parseCommunityPostPayload({
    content: row.content,
    checkinId,
    sourceType: 'realtime_gps',
    mountainName: WUDANG.name,
  })
  const preview = buildCommunityTrackPreview(toPersistedTrack(points))

  if (!preview) {
    throw new Error('Failed to build FU-83 community track preview fixture.')
  }
  const trackPreview = {
    ...preview,
    points: preview.points.map((point) => ({
      ...point,
      accuracy: 5,
    })),
  }

  const { error: updateError } = await supabase
    .from('posts')
    .update({
      content: serializeCommunityPostPayload({
        ...payload,
        trackPreview,
      }),
    })
    .eq('id', postId)

  if (updateError) {
    throw new Error(`Failed to attach FU-83 track preview to post ${postId}: ${updateError.message}`)
  }
}

async function createPublishedTrackPost(page: Page, checkinId: string, points: TestTrackPoint[]) {
  const title = `FU83 route preview ${Date.now()}`
  const response = await page.request.post('/api/community/actions', {
    data: {
      action: 'create_or_update_post',
      checkinId,
      title,
      body: 'FU-83 uses this post to verify community route projection keeps geographic aspect.',
      visibility: 'public',
      tags: ['FU83'],
      assets: [],
      coverAssetId: null,
    },
  })
  const payload = await response.json().catch(() => ({}))
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy()
  const postId = String(payload?.postId ?? '')
  expect(postId).toMatch(/[0-9a-f-]{36}/i)
  CREATED_POSTS.push(postId)
  await attachTrackPreviewToPost(postId, checkinId, points)
  return String(payload?.detailUrl ?? `/community/${postId}`)
}

async function captureRouteMap(page: Page, checkinId: string, name: string) {
  await page.goto(`/activity/${checkinId}`, { waitUntil: 'domcontentloaded' })
  const routeMap = page.getByTestId('activity-route-map')
  await routeMap.scrollIntoViewIfNeeded()
  await expect(routeMap).toBeVisible({ timeout: 20_000 })
  await routeMap.screenshot({ path: join(EVIDENCE_DIR, name) })
  return routeMap
}

async function routeTraceRatio(page: Page) {
  return page.locator('.act-route__trace').evaluate((node) => {
    const box = (node as SVGGraphicsElement).getBBox()
    return {
      width: box.width,
      height: box.height,
      ratio: box.height <= 0 ? 0 : box.width / box.height,
    }
  })
}

async function cleanupRows() {
  const supabase = getSupabaseAdminClient()
  if (CREATED_POSTS.length) {
    const ids = CREATED_POSTS.splice(0, CREATED_POSTS.length)
    const { error } = await supabase.from('posts').delete().in('id', ids)
    if (error) throw new Error(`Failed to clean FU-83 posts: ${error.message}`)
  }
  if (CREATED_CHECKINS.length) {
    const ids = CREATED_CHECKINS.splice(0, CREATED_CHECKINS.length)
    const { error } = await supabase.from('checkins').delete().in('id', ids)
    if (error) throw new Error(`Failed to clean FU-83 checkins: ${error.message}`)
  }
}

async function writeDataResidueReport() {
  const supabase = getSupabaseAdminClient()
  const { count, error } = await supabase
    .from('checkins')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'screenshot_recognition')
  if (error) throw new Error(`Failed to count FU-83 screenshot residue: ${error.message}`)
  await writeFile(join(OUTPUT_DIR, 'data-residue.json'), JSON.stringify({
    source: 'screenshot_recognition',
    count: count ?? 0,
    expected: 0,
  }, null, 2))
}

test.beforeEach(async () => {
  await ensureEvidenceDir()
})

test.afterEach(async () => {
  await cleanupRows()
  await writeDataResidueReport()
})

test('activity route map uses aspect-correct trace-only fallback and envelope reasons', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })

  const portraitCheckinId = await createTrackedCheckin(page, WUDANG, portraitGpxTrack(), 'FU83 portrait trace')
  const portraitMap = await captureRouteMap(page, portraitCheckinId, 'activity-49609d3c-trace-only-after.png')
  await expect(portraitMap).toHaveAttribute('data-map-mode', 'trace-only-no-asset')
  const portraitRatio = await routeTraceRatio(page)
  expect(portraitRatio.ratio).toBeGreaterThan(0.52)
  expect(portraitRatio.ratio).toBeLessThan(0.68)

  const outsideCheckinId = await createTrackedCheckin(page, HUASHAN, farOutsideTrack(), 'FU83 outside envelope')
  const outsideMap = await captureRouteMap(page, outsideCheckinId, 'activity-3e4927bd-envelope-after.png')
  await expect(outsideMap).toHaveAttribute('data-map-mode', 'trace-only-out-of-envelope')

  const insideCheckinId = await createTrackedCheckin(page, HUASHAN, huashanInsideTrack(), 'FU83 inside envelope')
  const insideMap = await captureRouteMap(page, insideCheckinId, 'activity-huashan-in-bbox-after.png')
  await expect(insideMap).toHaveAttribute('data-map-mode', 'mountain-pmtiles')
})

test('community detail route preview uses the shared aspect-correct projection', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  await dismissActivationChecklistIfPresent(page)

  const communityTrack = portraitGpxTrack()
  const checkinId = await createTrackedCheckin(page, WUDANG, communityTrack, 'FU83 community route')
  const detailUrl = await createPublishedTrackPost(page, checkinId, communityTrack)
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
  const media = page.getByTestId('community-detail-media')
  await media.scrollIntoViewIfNeeded()
  await expect(media).toBeVisible({ timeout: 20_000 })
  await media.screenshot({ path: join(EVIDENCE_DIR, 'community-detail-route-preview-after.png') })

  const pathRatio = await media.locator('path').nth(1).evaluate((node) => {
    const box = (node as SVGGraphicsElement).getBBox()
    return box.height <= 0 ? 0 : box.width / box.height
  })
  expect(pathRatio).toBeGreaterThan(0.52)
  expect(pathRatio).toBeLessThan(0.68)
})
