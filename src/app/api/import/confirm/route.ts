import { NextResponse } from 'next/server'
import { getSupplementalTimeFallback } from '@/lib/import/confirm-time-fallback'
import { validateImportMountainSelectionDistance } from '@/lib/import/mountain-distance-check'
import { normalizeScreenshotData } from '@/lib/import/screenshot-confirm-data'
import type { NormalizedScreenshotData } from '@/lib/import/screenshot-confirm-data'
import { measureScreenshotRouteShape, validateScreenshotRouteShape } from '@/lib/screenshot-route-shape'
import { computeTrackContentHash } from '@/lib/import/track-hash'
import { buildComputedTrackStats, findHighestTrackPoint } from '@/lib/import/track-stats'
import type { ImportedTrackData, TrackPoint } from '@/lib/import/types'
import { isScreenshotRecognitionSource, rankingWeightByDifficulty, SCREENSHOT_RECOGNITION_SOURCE } from '@/lib/trek-utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { insertCheckinWithFallback } from '@/lib/trek-verify-helpers'

type ImportMountainRow = {
  id: string
  latitude: number | null
  longitude: number | null
  difficulty: string | null
}

type PersistedTrackPoint = {
  lat: number
  lng: number
  ele?: number
  time?: string
}

type DuplicateTrackRow = {
  id: string
  created_at: string | null
}

type NormalizedImportedTrackData = Pick<ImportedTrackData, 'format' | 'fileName' | 'trackPoints'> &
  Partial<
    Pick<
      ImportedTrackData,
      | 'name'
      | 'startTime'
      | 'endTime'
      | 'durationSeconds'
    >
  >

type ImportConfirmSource = 'track_import' | typeof SCREENSHOT_RECOGNITION_SOURCE

const CLIENT_METRIC_KEYS = [
  'distanceMeters',
  'elevationGainMeters',
  'elevationLossMeters',
  'maxElevation',
  'minElevation',
] as const

const IMPORT_CONFIRM_GENERIC_ERROR = '活动记录暂时没有生成成功，请再试一次。'

function logImportConfirmFailure(context: string, error: unknown) {
  console.error(`[import-confirm] ${context}`, error)
}

type NormalizeImportedTrackResult =
  | { ok: true; data: NormalizedImportedTrackData }
  | { ok: false; reason: 'invalid' | 'trackPointsRequired' }

function toSafeNote(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 240)
}

function toSafeTrackName(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 180) : undefined
}

function toIsoTimestamp(value: unknown) {
  if (typeof value !== 'string') return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

function toFinitePositiveInteger(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined
  return Math.round(numberValue)
}

function normalizeTrackPoint(value: unknown): TrackPoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const latitude = Number(record.latitude)
  const longitude = Number(record.longitude)
  const elevation = Number(record.elevation)
  const timestamp = toIsoTimestamp(record.timestamp)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  return {
    latitude,
    longitude,
    ...(Number.isFinite(elevation) ? { elevation } : {}),
    ...(timestamp ? { timestamp } : {}),
  }
}

function toPersistedTrackPoints(trackPoints: TrackPoint[]): PersistedTrackPoint[] {
  return trackPoints.map((point) => ({
    lat: point.latitude,
    lng: point.longitude,
    ...(typeof point.elevation === 'number' ? { ele: point.elevation } : {}),
    ...(point.timestamp ? { time: point.timestamp } : {}),
  }))
}

function trackPointsRequiredResponse() {
  return NextResponse.json({
    error: '活动数据不完整，请重新导入后再试。',
    hint: '导入确认需要完整轨迹点。',
  }, { status: 400 })
}

function trackDuplicateResponse(duplicateTrack: DuplicateTrackRow | null) {
  return NextResponse.json({
    ok: false,
    code: 'track_duplicate',
    error: '这份轨迹已经上传过。',
    ...(duplicateTrack ? {
      duplicateTrack: {
        existingCheckinId: duplicateTrack.id,
        existingCreatedAt: duplicateTrack.created_at,
      },
    } : {}),
  }, { status: 409 })
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === '23505'
}

async function findDuplicateTrackImport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  trackContentHash: string
) {
  const { data, error } = await supabase
    .from('checkins')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('track_content_hash', trackContentHash)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    logImportConfirmFailure('duplicate lookup failed', error)
    return {
      duplicateTrack: null as DuplicateTrackRow | null,
      response: NextResponse.json({ error: IMPORT_CONFIRM_GENERIC_ERROR }, { status: 500 }),
    }
  }

  return {
    duplicateTrack: data as DuplicateTrackRow | null,
    response: null as NextResponse | null,
  }
}

function getClientMetricKeys(value: unknown) {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  return CLIENT_METRIC_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(record, key))
}

function warnIgnoredClientMetrics(value: unknown) {
  const metricKeys = getClientMetricKeys(value)
  if (metricKeys.length > 0) {
    console.warn('[import-confirm] ignoring client-provided metric fields', metricKeys)
  }
}

function normalizeImportedTrackData(value: unknown): NormalizeImportedTrackResult {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'invalid' }
  const record = value as Record<string, unknown>
  const format = record.format
  const fileName = record.fileName
  const rawPoints = record.trackPoints

  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return { ok: false, reason: 'trackPointsRequired' }
  if (format !== 'gpx' && format !== 'kml' && format !== 'fit') return { ok: false, reason: 'invalid' }
  if (typeof fileName !== 'string') return { ok: false, reason: 'invalid' }

  const trackPoints = rawPoints.flatMap((point) => {
    const normalized = normalizeTrackPoint(point)
    return normalized ? [normalized] : []
  })

  if (trackPoints.length === 0) return { ok: false, reason: 'trackPointsRequired' }

  const name = toSafeTrackName(record.name)
  const startTime = toIsoTimestamp(record.startTime)
  const endTime = toIsoTimestamp(record.endTime)
  const durationSeconds = toFinitePositiveInteger(record.durationSeconds)

  return {
    ok: true,
    data: {
      format,
      fileName,
      ...(name ? { name } : {}),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(durationSeconds ? { durationSeconds } : {}),
      trackPoints,
    },
  }
}

function normalizeImportConfirmSource(value: unknown): ImportConfirmSource {
  return isScreenshotRecognitionSource(value) ? SCREENSHOT_RECOGNITION_SOURCE : 'track_import'
}

async function fetchImportMountain(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  mountainId: string | null
) {
  if (!mountainId) return { mountain: null as ImportMountainRow | null, response: null as NextResponse | null }

  const { data, error } = await supabase
    .from('mountains')
    .select('id, latitude, longitude, difficulty')
    .eq('id', mountainId)
    .maybeSingle()

  if (error) {
    logImportConfirmFailure('mountain lookup failed', error)
    return { mountain: null, response: NextResponse.json({ error: '这座山暂时无法关联，请重新选择。' }, { status: 500 }) }
  }

  if (!data) {
    return { mountain: null, response: NextResponse.json({ error: '这座山暂时无法关联，请重新选择。' }, { status: 400 }) }
  }

  return { mountain: data as ImportMountainRow, response: null }
}

function screenshotTimeRange(data: NormalizedScreenshotData) {
  const startTime = data.date ?? null
  if (!startTime) return { startTime: null, endTime: null }
  if (!data.durationSeconds) return { startTime, endTime: null }
  return {
    startTime,
    endTime: new Date(new Date(startTime).getTime() + data.durationSeconds * 1000).toISOString(),
  }
}

async function handleScreenshotRecognitionConfirm({
  supabase,
  userId,
  body,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  userId: string
  body: Record<string, unknown>
}) {
  const parsedDataResult = normalizeScreenshotData(body.parsedData)
  if (!parsedDataResult.ok) {
    return NextResponse.json({ error: '截图数据不完整，请重新识别后再试。' }, { status: 400 })
  }
  const routeShapeResult = validateScreenshotRouteShape(body.routeShape)
  if (!routeShapeResult.ok) {
    return NextResponse.json({
      error: '校准路线太复杂，无法保存。请减少控制点后再确认，或清空校准路线后只保存文字数据。',
      code: 'route_shape_invalid',
    }, { status: 400 })
  }

  const mountainId = typeof body.mountainId === 'string' ? (body.mountainId.trim() || null) : null
  const { mountain, response } = await fetchImportMountain(supabase, mountainId)
  if (response) return response

  const parsedData = parsedDataResult.data
  const { startTime, endTime } = screenshotTimeRange(parsedData)
  const note = toSafeNote(body.note)

  const { data: checkin, error } = await insertCheckinWithFallback(
    supabase,
    {
      user_id: userId,
      mountain_id: mountain?.id ?? null,
      type: 'gps',
      source: SCREENSHOT_RECOGNITION_SOURCE,
      completion_status: 'complete',
      latitude: mountain?.latitude ?? null,
      longitude: mountain?.longitude ?? null,
      note,
      // Screenshot recognition is uploaded proof, not GPS/summit verification.
      verified_at: null,
      verification_distance_m: null,
      ranking_weight: 0,
      distance_meters: parsedData.distanceMeters,
      duration_seconds: parsedData.durationSeconds ?? null,
      elevation_gain_meters: parsedData.elevationGainMeters ?? null,
      elevation_loss_meters: parsedData.elevationLossMeters ?? null,
      max_elevation_meters: parsedData.maxElevation ?? null,
      min_elevation_meters: null,
      start_time: startTime,
      end_time: endTime,
      track_name: parsedData.name ?? parsedData.location ?? parsedData.fileName ?? '截图识别活动',
      track_points: [],
      screenshot_route_shape: routeShapeResult.shape,
    },
    'id'
  )

  if (error || !checkin) {
    console.error('screenshot route shape checkin insert failed', {
      code: routeShapeResult.shape ? 'route_shape_persist_failed' : 'screenshot_checkin_insert_failed',
      userId,
      hasShape: Boolean(routeShapeResult.shape),
      shapeMetrics: measureScreenshotRouteShape(routeShapeResult.shape),
      error: error?.message ?? 'missing inserted checkin',
    })
    return NextResponse.json({
      error: routeShapeResult.shape
        ? '校准路线保存失败，请稍后重试。'
        : '活动生成失败，请稍后再试。',
      code: routeShapeResult.shape ? 'route_shape_persist_failed' : undefined,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    checkinId: (checkin as unknown as { id: string }).id,
  })
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    if (authError) logImportConfirmFailure('auth failed', authError)
    return NextResponse.json({ error: '登录后即可生成活动记录。' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '活动数据不完整，请重新导入后再试。' }, { status: 400 })
  }

  const source = normalizeImportConfirmSource((body as { source?: unknown }).source)

  if (isScreenshotRecognitionSource(source)) {
    return handleScreenshotRecognitionConfirm({
      supabase,
      userId: user.id,
      body: body as Record<string, unknown>,
    })
  }

  const rawParsedData = (body as { parsedData?: unknown } | null)?.parsedData
  const parsedDataResult = normalizeImportedTrackData(rawParsedData)

  if (!parsedDataResult.ok) {
    if (parsedDataResult.reason === 'trackPointsRequired') {
      return trackPointsRequiredResponse()
    }
    return NextResponse.json({ error: '活动数据不完整，请重新导入后再试。' }, { status: 400 })
  }

  warnIgnoredClientMetrics(rawParsedData)

  const parsedData = parsedDataResult.data
  const trackContentHash = computeTrackContentHash(parsedData.trackPoints)
  if (trackContentHash) {
    const { duplicateTrack, response } = await findDuplicateTrackImport(supabase, user.id, trackContentHash)
    if (response) return response
    if (duplicateTrack) return trackDuplicateResponse(duplicateTrack)
  }

  const mountainId = typeof (body as { mountainId?: unknown } | null)?.mountainId === 'string'
    ? ((body as { mountainId: string }).mountainId.trim() || null)
    : null
  const note = toSafeNote((body as { note?: unknown } | null)?.note)
  const anchorPoint = findHighestTrackPoint(parsedData.trackPoints)

  if (!anchorPoint) {
    return trackPointsRequiredResponse()
  }

  const computed = buildComputedTrackStats(parsedData.trackPoints)
  const supplementalTime = getSupplementalTimeFallback(computed, parsedData)

  let mountain: ImportMountainRow | null = null
  let verificationDistanceM: number | null = null

  if (mountainId) {
    const { data, error } = await supabase
      .from('mountains')
      .select('id, latitude, longitude, difficulty')
      .eq('id', mountainId)
      .maybeSingle()

    if (error) {
      logImportConfirmFailure('selected mountain lookup failed', error)
      return NextResponse.json({ error: '这座山暂时无法关联，请重新选择。' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: '这座山暂时无法关联，请重新选择。' }, { status: 400 })
    }

    mountain = data as ImportMountainRow
    const distanceValidation = validateImportMountainSelectionDistance(parsedData.trackPoints, mountain)
    if (!distanceValidation.ok) {
      return NextResponse.json({
        error: distanceValidation.error,
        code: distanceValidation.code,
        distanceMeters: distanceValidation.distanceMeters,
        thresholdMeters: distanceValidation.thresholdMeters,
      }, { status: 400 })
    }

    verificationDistanceM = distanceValidation.verificationDistanceM
  }

  const { data: checkin, error } = await supabase
    .from('checkins')
    .insert({
      user_id: user.id,
      mountain_id: mountain?.id ?? null,
      type: 'gps',
      source,
      latitude: anchorPoint.latitude,
      longitude: anchorPoint.longitude,
      note,
      verified_at: new Date().toISOString(),
      verification_distance_m: verificationDistanceM,
      ranking_weight: mountain ? rankingWeightByDifficulty(mountain.difficulty) : 0,
      distance_meters: computed.distanceMeters ?? null,
      duration_seconds: computed.durationSeconds ?? supplementalTime?.durationSeconds ?? null,
      elevation_gain_meters: computed.elevationGainMeters ?? null,
      elevation_loss_meters: computed.elevationLossMeters ?? null,
      max_elevation_meters: computed.maxElevation ?? null,
      min_elevation_meters: computed.minElevation ?? null,
      start_time: computed.startTime ?? supplementalTime?.startTime ?? null,
      end_time: computed.endTime ?? supplementalTime?.endTime ?? null,
      track_name: parsedData.name ?? null,
      track_content_hash: trackContentHash,
      track_points: toPersistedTrackPoints(parsedData.trackPoints),
    })
    .select('id')
    .single()

  if (error || !checkin) {
    if (trackContentHash && isUniqueViolation(error)) {
      const { duplicateTrack, response } = await findDuplicateTrackImport(supabase, user.id, trackContentHash)
      if (response) return response
      return trackDuplicateResponse(duplicateTrack)
    }
    logImportConfirmFailure('checkin insert failed', error ?? 'missing inserted checkin')
    return NextResponse.json({ error: IMPORT_CONFIRM_GENERIC_ERROR }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    checkinId: (checkin as { id: string }).id,
  })
}
