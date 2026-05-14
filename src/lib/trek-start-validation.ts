import { haversineMeters } from './import/track-stats.ts'

export const TREK_START_DISTANCE_THRESHOLD_METERS = 100_000

export type TrekStartPosition = {
  lat: number
  lng: number
}

export type TrekStartMountain = {
  latitude: number
  longitude: number
}

export type TrekStartDistanceCheck = {
  valid: boolean
  distanceMeters: number | null
  thresholdMeters: number
}

function isFiniteCoordinate(value: unknown) {
  return Number.isFinite(Number(value))
}

export function checkTrekStartDistance(
  position: TrekStartPosition | null | undefined,
  mountain: TrekStartMountain | null | undefined,
  thresholdMeters = TREK_START_DISTANCE_THRESHOLD_METERS
): TrekStartDistanceCheck {
  if (
    !position ||
    !mountain ||
    !isFiniteCoordinate(position.lat) ||
    !isFiniteCoordinate(position.lng) ||
    !isFiniteCoordinate(mountain.latitude) ||
    !isFiniteCoordinate(mountain.longitude)
  ) {
    return {
      valid: false,
      distanceMeters: null,
      thresholdMeters,
    }
  }

  const distanceMeters = haversineMeters(
    Number(position.lat),
    Number(position.lng),
    Number(mountain.latitude),
    Number(mountain.longitude)
  )

  return {
    valid: distanceMeters <= thresholdMeters,
    distanceMeters,
    thresholdMeters,
  }
}

export function formatTrekStartDistanceKm(distanceMeters: number | null) {
  if (distanceMeters === null || distanceMeters === undefined) return '未知距离'
  if (!Number.isFinite(Number(distanceMeters))) return '未知距离'
  return `${(Number(distanceMeters) / 1000).toFixed(1)} km`
}
