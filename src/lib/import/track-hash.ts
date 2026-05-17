import { createHash } from 'node:crypto'
import type { TrackPoint } from './types'

type NormalizedTrackPointForHash = {
  lat: string
  lng: string
  ele: string
  time: string
}

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeCoordinate(value: number) {
  return value.toFixed(6)
}

function normalizeElevation(value: unknown) {
  const elevation = toFiniteNumber(value)
  return elevation === null ? '' : String(Math.round(elevation))
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ''
}

function compareNormalizedTrackPoint(a: NormalizedTrackPointForHash, b: NormalizedTrackPointForHash) {
  return a.time.localeCompare(b.time)
    || a.lat.localeCompare(b.lat)
    || a.lng.localeCompare(b.lng)
    || a.ele.localeCompare(b.ele)
}

export function normalizeTrackPointsForHash(trackPoints: TrackPoint[]) {
  const normalized = trackPoints.flatMap((point) => {
    const latitude = toFiniteNumber(point.latitude)
    const longitude = toFiniteNumber(point.longitude)
    if (latitude === null || longitude === null) return []

    return [{
      lat: normalizeCoordinate(latitude),
      lng: normalizeCoordinate(longitude),
      ele: normalizeElevation(point.elevation),
      time: normalizeTimestamp(point.timestamp),
    }]
  })

  if (normalized.length > 0 && normalized.every((point) => point.time)) {
    return [...normalized].sort(compareNormalizedTrackPoint)
  }

  return normalized
}

export function computeTrackContentHash(trackPoints: TrackPoint[]) {
  const normalized = normalizeTrackPointsForHash(trackPoints)
  if (normalized.length === 0) return null

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
}
