import type { TrackPoint } from './types.ts'

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusM = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2

  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function calculateDistance(points: TrackPoint[]) {
  let distance = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    distance += haversineMeters(previous.latitude, previous.longitude, current.latitude, current.longitude)
  }

  return Math.round(distance)
}

export function calculateElevationGain(
  points: TrackPoint[],
  { noiseThresholdMeters = 2 }: { noiseThresholdMeters?: number } = {}
) {
  let gain = 0
  let loss = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].elevation
    const current = points[index].elevation
    if (typeof previous !== 'number' || typeof current !== 'number') continue

    const delta = current - previous
    if (Math.abs(delta) < noiseThresholdMeters) continue
    if (delta > 0) gain += delta
    if (delta < 0) loss += Math.abs(delta)
  }

  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
  }
}

export function calculateDuration(points: TrackPoint[]) {
  const first = points.find((point) => point.timestamp)?.timestamp
  const last = [...points].reverse().find((point) => point.timestamp)?.timestamp
  if (!first || !last) return undefined

  const start = Date.parse(first)
  const end = Date.parse(last)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined

  return Math.floor((end - start) / 1000)
}

export function findHighestTrackPoint(points: TrackPoint[]) {
  const withElevation = points.filter((point) => typeof point.elevation === 'number')
  if (withElevation.length === 0) return points.at(-1) ?? null

  return withElevation.reduce((highest, point) =>
    Number(point.elevation) > Number(highest.elevation) ? point : highest
  )
}

export function getElevationExtremes(points: TrackPoint[]) {
  const elevations = points
    .map((point) => point.elevation)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (elevations.length === 0) {
    return {}
  }

  return {
    maxElevation: Math.max(...elevations),
    minElevation: Math.min(...elevations),
  }
}

export function getTrackTimeBounds(points: TrackPoint[]) {
  const timestamps = points
    .map((point) => point.timestamp)
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))

  if (timestamps.length === 0) {
    return {}
  }

  return {
    startTime: timestamps[0],
    endTime: timestamps[timestamps.length - 1],
  }
}

export function buildComputedTrackStats(points: TrackPoint[]) {
  const elevation = calculateElevationGain(points)
  return {
    ...getTrackTimeBounds(points),
    durationSeconds: calculateDuration(points),
    distanceMeters: calculateDistance(points),
    elevationGainMeters: elevation.gain,
    elevationLossMeters: elevation.loss,
    ...getElevationExtremes(points),
  }
}
