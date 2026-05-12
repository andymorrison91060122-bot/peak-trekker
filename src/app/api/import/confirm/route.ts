import { NextResponse } from 'next/server'
import { getSupplementalTimeFallback } from '@/lib/import/confirm-time-fallback'
import { buildComputedTrackStats, findHighestTrackPoint, haversineMeters } from '@/lib/import/track-stats'
import type { ImportedTrackData, TrackPoint } from '@/lib/import/types'
import { rankingWeightByDifficulty } from '@/lib/trek-utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'

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

type ImportConfirmSource = 'track_import' | 'screenshot_recognition'

const CLIENT_METRIC_KEYS = [
  'distanceMeters',
  'elevationGainMeters',
  'elevationLossMeters',
  'maxElevation',
  'minElevation',
] as const

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
    error: 'trackPoints required',
    hint: 'Import confirm must include parsed track points for server-side metric calculation.',
  }, { status: 400 })
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
  return value === 'screenshot_recognition' ? 'screenshot_recognition' : 'track_import'
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const rawParsedData = (body as { parsedData?: unknown } | null)?.parsedData
  const parsedDataResult = normalizeImportedTrackData(rawParsedData)

  if (!parsedDataResult.ok) {
    if (parsedDataResult.reason === 'trackPointsRequired') {
      return trackPointsRequiredResponse()
    }
    return NextResponse.json({ error: 'parsedData invalid' }, { status: 400 })
  }

  warnIgnoredClientMetrics(rawParsedData)

  const parsedData = parsedDataResult.data
  const mountainId = typeof (body as { mountainId?: unknown } | null)?.mountainId === 'string'
    ? ((body as { mountainId: string }).mountainId.trim() || null)
    : null
  const source = normalizeImportConfirmSource((body as { source?: unknown } | null)?.source)
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'invalid mountainId' }, { status: 400 })
    }

    mountain = data as ImportMountainRow
    const mountainLatitude = Number(mountain?.latitude)
    const mountainLongitude = Number(mountain?.longitude)
    if (Number.isFinite(mountainLatitude) && Number.isFinite(mountainLongitude)) {
      verificationDistanceM = Math.round(
        haversineMeters(anchorPoint.latitude, anchorPoint.longitude, mountainLatitude, mountainLongitude)
      )
    }
  }

  const { data: checkin, error } = await supabase
    .from('checkins')
    .insert({
      user_id: user.id,
      mountain_id: mountain?.id ?? null,
      type: 'gps',
      source,
      status: 'approved',
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
      track_points: toPersistedTrackPoints(parsedData.trackPoints),
    })
    .select('id')
    .single()

  if (error || !checkin) {
    return NextResponse.json({ error: error?.message ?? 'create imported checkin failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    checkinId: (checkin as { id: string }).id,
  })
}
