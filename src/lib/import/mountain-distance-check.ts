import { findHighestTrackPoint, haversineMeters } from './track-stats.ts'
import type { TrackPoint } from './types.ts'

export const IMPORT_MOUNTAIN_DISTANCE_THRESHOLD_METERS = 20_000
export const IMPORT_MOUNTAIN_OUT_OF_RANGE_MESSAGE = '附近 20 公里内没有收录的山峰，可以选择不关联山峰先生成记录。'

export type ImportTrackReferencePointSource = 'median' | 'highest' | 'center'

export type ImportTrackReferencePoint = {
  latitude: number
  longitude: number
  source: ImportTrackReferencePointSource
}

export type ImportMountainDistanceCheckResult = {
  valid: boolean
  distanceMeters: number | null
  thresholdMeters: number
  referencePoint: ImportTrackReferencePoint | null
  triedPoints: Array<{
    source: ImportTrackReferencePointSource
    distanceMeters: number
  }>
  reason?: 'missing_track_reference' | 'missing_mountain_coordinates'
}

type MountainCoordinate = {
  latitude: number | null
  longitude: number | null
}

export type ImportMountainDistanceValidationResult =
  | {
      ok: true
      verificationDistanceM: number | null
      check: ImportMountainDistanceCheckResult | null
    }
  | {
      ok: false
      error: string
      code: 'mountain_out_of_range'
      distanceMeters: number | null
      thresholdMeters: number
      check: ImportMountainDistanceCheckResult
    }

function isUsableCoordinate(latitude: unknown, longitude: unknown) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return false

  const lat = Number(latitude)
  const lng = Number(longitude)

  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
}

function toReferencePoint(point: TrackPoint, source: ImportTrackReferencePointSource): ImportTrackReferencePoint | null {
  if (!isUsableCoordinate(point.latitude, point.longitude)) return null

  return {
    latitude: point.latitude,
    longitude: point.longitude,
    source,
  }
}

export function getImportTrackReferencePoints(trackPoints: TrackPoint[]): ImportTrackReferencePoint[] {
  const validPoints = trackPoints.filter((point) => isUsableCoordinate(point.latitude, point.longitude))
  if (validPoints.length === 0) return []

  const medianIndex = Math.floor((validPoints.length - 1) / 2)
  const median = toReferencePoint(validPoints[medianIndex], 'median')
  const highest = toReferencePoint(findHighestTrackPoint(validPoints) ?? validPoints[validPoints.length - 1], 'highest')

  const latitudes = validPoints.map((point) => point.latitude)
  const longitudes = validPoints.map((point) => point.longitude)
  const center = toReferencePoint({
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  }, 'center')

  return [median, highest, center].filter((point): point is ImportTrackReferencePoint => Boolean(point))
}

export function checkImportMountainDistance(
  trackPoints: TrackPoint[],
  mountain: MountainCoordinate,
  options: { thresholdMeters?: number } = {}
): ImportMountainDistanceCheckResult {
  const thresholdMeters = options.thresholdMeters ?? IMPORT_MOUNTAIN_DISTANCE_THRESHOLD_METERS

  if (!isUsableCoordinate(mountain.latitude, mountain.longitude)) {
    return {
      valid: false,
      distanceMeters: null,
      thresholdMeters,
      referencePoint: null,
      triedPoints: [],
      reason: 'missing_mountain_coordinates',
    }
  }

  const mountainLatitude = Number(mountain.latitude)
  const mountainLongitude = Number(mountain.longitude)
  const referencePoints = getImportTrackReferencePoints(trackPoints)
  if (referencePoints.length === 0) {
    return {
      valid: false,
      distanceMeters: null,
      thresholdMeters,
      referencePoint: null,
      triedPoints: [],
      reason: 'missing_track_reference',
    }
  }

  const triedPoints = referencePoints
    .map((point) => ({
      source: point.source,
      distanceMeters: Math.round(haversineMeters(point.latitude, point.longitude, mountainLatitude, mountainLongitude)),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  const closest = triedPoints[0]
  const referencePoint = referencePoints.find((point) => point.source === closest.source) ?? referencePoints[0]

  return {
    valid: closest.distanceMeters <= thresholdMeters,
    distanceMeters: closest.distanceMeters,
    thresholdMeters,
    referencePoint,
    triedPoints,
  }
}

export function validateImportMountainSelectionDistance(
  trackPoints: TrackPoint[],
  mountain: MountainCoordinate | null,
  options: { thresholdMeters?: number } = {}
): ImportMountainDistanceValidationResult {
  if (!mountain) {
    return {
      ok: true,
      verificationDistanceM: null,
      check: null,
    }
  }

  const check = checkImportMountainDistance(trackPoints, mountain, options)
  if (!check.valid) {
    return {
      ok: false,
      error: IMPORT_MOUNTAIN_OUT_OF_RANGE_MESSAGE,
      code: 'mountain_out_of_range',
      distanceMeters: check.distanceMeters,
      thresholdMeters: check.thresholdMeters,
      check,
    }
  }

  return {
    ok: true,
    verificationDistanceM: check.distanceMeters,
    check,
  }
}
