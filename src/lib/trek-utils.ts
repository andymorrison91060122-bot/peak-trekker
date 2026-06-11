import type { CheckinSource, Mountain } from '@/types'

/**
 * @deprecated Import TREK_RULES from trek-rules-client or trek-rules-server.
 * This facade keeps legacy client imports working while server code uses fixed rules.
 */
export { TREK_RULES } from './trek-rules-client.ts'

export type TrackPoint = {
  lat: number
  lng: number
  accuracy: number
  altitude: number | null
  ts: number
}

export type { CheckinSource } from '@/types'

export const SCREENSHOT_RECOGNITION_SOURCE = 'screenshot_recognition' as const satisfies CheckinSource

export function isScreenshotRecognitionSource(value: unknown): value is typeof SCREENSHOT_RECOGNITION_SOURCE {
  return value === SCREENSHOT_RECOGNITION_SOURCE
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function rankingWeightByDifficulty(difficulty: Mountain['difficulty'] | string | null | undefined) {
  if (difficulty === 'expert') return 80
  if (difficulty === 'advanced') return 40
  if (difficulty === 'intermediate') return 20
  return 10
}

export function resolveCheckinSource({
  source,
  type,
}: {
  source?: CheckinSource | string | null
  type?: string | null
}): CheckinSource {
  if (
    source === 'realtime_gps' ||
    source === 'historical_photo' ||
    source === 'track_import' ||
    isScreenshotRecognitionSource(source)
  ) {
    return source
  }
  return type === 'gps' ? 'realtime_gps' : 'historical_photo'
}

export function safeTrackPoints(value: unknown): TrackPoint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const lat = Number(raw.lat)
    const lng = Number(raw.lng)
    const accuracy = Number(raw.accuracy)
    const ts = Number(raw.ts)
    const altitudeValue = raw.altitude
    const altitude = Number.isFinite(Number(altitudeValue)) ? Number(altitudeValue) : null

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy) || !Number.isFinite(ts)) {
      return []
    }

    return [
      {
        lat,
        lng,
        accuracy,
        ts,
        altitude,
      },
    ]
  })
}
