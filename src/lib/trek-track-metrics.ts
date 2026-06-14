import { haversineMeters, type TrackPoint } from './trek-utils.ts'

export const TREK_APPEND_BATCH_LIMIT = 500
export const TREK_SESSION_POINT_HARD_LIMIT = 20_000
export const TREK_TRACK_POINT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MAX_DRIFT_SPEED_MPS = 9.5

export type TrekTrackSummary = {
  distanceM: number
  ascentM: number
  descentM: number
  maxAltitudeM: number | null
  minAltitudeM: number | null
  pointCount: number
}

export type TrekMergeResult = {
  points: TrackPoint[]
  acceptedIds: string[]
  rejectedIds: string[]
  summary: TrekTrackSummary
}

export function normalizeAppendTrackPoint(value: unknown): TrackPoint | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const lat = Number(raw.lat)
  const lng = Number(raw.lng)
  const accuracy = Number(raw.accuracy)
  const ts = Number(raw.ts)
  const captureSeq = Number(raw.captureSeq)
  const altitudeValue = raw.altitude
  const altitude =
    altitudeValue === null || altitudeValue === undefined || altitudeValue === ''
      ? null
      : Number.isFinite(Number(altitudeValue))
        ? Number(altitudeValue)
        : null

  if (!TREK_TRACK_POINT_ID_PATTERN.test(id)) return null
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10_000) return null
  if (!Number.isFinite(ts) || ts < 0 || ts > 4_102_444_800_000) return null
  if (!Number.isFinite(captureSeq) || captureSeq < 0 || captureSeq > Number.MAX_SAFE_INTEGER) return null
  if (altitude !== null && (altitude < -1000 || altitude > 10_000)) return null

  return {
    id,
    lat,
    lng,
    accuracy,
    altitude,
    ts,
    captureSeq,
  }
}

function pointSortKey(point: TrackPoint) {
  return {
    ts: point.ts,
    captureSeq: Number.isFinite(Number(point.captureSeq)) ? Number(point.captureSeq) : Number.MAX_SAFE_INTEGER,
    id: point.id ?? '',
  }
}

function comparePointOrder(a: TrackPoint, b: TrackPoint) {
  const aKey = pointSortKey(a)
  const bKey = pointSortKey(b)
  if (aKey.ts !== bKey.ts) return aKey.ts - bKey.ts
  if (aKey.captureSeq !== bKey.captureSeq) return aKey.captureSeq - bKey.captureSeq
  return aKey.id.localeCompare(bKey.id)
}

function isDriftPoint(previous: TrackPoint | undefined, point: TrackPoint) {
  if (!previous) return false
  const segmentMeters = haversineMeters(previous.lat, previous.lng, point.lat, point.lng)
  const elapsed = Math.max(1, (point.ts - previous.ts) / 1000)
  const speed = segmentMeters / elapsed
  return speed > MAX_DRIFT_SPEED_MPS && point.accuracy > 25
}

export function summarizeTrekTrackPoints(points: TrackPoint[]): TrekTrackSummary {
  let distanceM = 0
  let ascentM = 0
  let descentM = 0
  let maxAltitudeM: number | null = null
  let minAltitudeM: number | null = null

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    if (typeof point.altitude === 'number') {
      const rounded = Math.round(point.altitude)
      maxAltitudeM = maxAltitudeM === null ? rounded : Math.max(maxAltitudeM, rounded)
      minAltitudeM = minAltitudeM === null ? rounded : Math.min(minAltitudeM, rounded)
    }

    const previous = points[index - 1]
    if (!previous) continue
    distanceM += haversineMeters(previous.lat, previous.lng, point.lat, point.lng)
    if (typeof previous.altitude === 'number' && typeof point.altitude === 'number') {
      const delta = point.altitude - previous.altitude
      if (delta > 0) ascentM += Math.round(delta)
      if (delta < 0) descentM += Math.round(Math.abs(delta))
    }
  }

  return {
    distanceM: Math.round(distanceM),
    ascentM,
    descentM,
    maxAltitudeM,
    minAltitudeM,
    pointCount: points.length,
  }
}

export function mergeTrekTrackPoints({
  existingPoints,
  incomingPoints,
}: {
  existingPoints: TrackPoint[]
  incomingPoints: TrackPoint[]
}): TrekMergeResult {
  const normalizedIncoming = incomingPoints.flatMap((point) => {
    const normalized = normalizeAppendTrackPoint(point)
    return normalized ? [normalized] : []
  })
  const incomingIds = new Set(normalizedIncoming.map((point) => point.id).filter(Boolean) as string[])
  const legacyPrefix = existingPoints.filter((point) => !point.id)
  const keyed = [...existingPoints.filter((point) => point.id), ...normalizedIncoming].sort(comparePointOrder)
  const byId = new Map<string, TrackPoint>()

  for (const point of keyed) {
    if (!point.id) continue
    if (!byId.has(point.id)) byId.set(point.id, point)
  }

  const canonical = [...legacyPrefix, ...Array.from(byId.values()).sort(comparePointOrder)]
  const points: TrackPoint[] = []
  const rejectedIds: string[] = []

  for (const point of canonical) {
    const isNewPoint = Boolean(point.id && incomingIds.has(point.id))
    if (isNewPoint && isDriftPoint(points.at(-1), point)) {
      rejectedIds.push(point.id!)
      continue
    }
    points.push(point)
  }

  const storedIds = new Set(points.map((point) => point.id).filter(Boolean) as string[])
  const acceptedIds = Array.from(incomingIds).filter((id) => storedIds.has(id))

  return {
    points,
    acceptedIds,
    rejectedIds,
    summary: summarizeTrekTrackPoints(points),
  }
}
