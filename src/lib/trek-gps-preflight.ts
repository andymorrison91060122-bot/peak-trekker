import type { Mountain } from '@/types'

export const TREK_PREP_GPS_READY_ACCURACY_M = 50
export const TREK_PREP_GPS_RETRY_MS = 10_000
export const TREK_PREP_GPS_MAX_RETRIES = 3

export type TrekPrepGpsQuality = 'ready' | 'weak' | 'unavailable'

export type TrekPrepGpsPosition = {
  lat: number
  lng: number
  accuracy: number
  altitude?: number | null
}

export function classifyPrepGpsAccuracy(accuracy: unknown): TrekPrepGpsQuality {
  const value = Number(accuracy)
  if (!Number.isFinite(value) || value <= 0) return 'unavailable'
  return value <= TREK_PREP_GPS_READY_ACCURACY_M ? 'ready' : 'weak'
}

export function requestCurrentGpsPosition(
  geolocation: Geolocation | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.geolocation
): Promise<TrekPrepGpsPosition> {
  if (!geolocation) {
    const error = new Error('geolocation_unsupported') as Error & { code?: number }
    error.code = 0
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitude } = position.coords
        resolve({
          lat: latitude,
          lng: longitude,
          accuracy,
          altitude,
        })
      },
      reject,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    )
  })
}

export function buildLateProofHref(
  mountain: Pick<Mountain, 'id' | 'name' | 'altitude'> | null | undefined
) {
  if (!mountain) return '/explore'

  const params = new URLSearchParams({
    mountainId: mountain.id,
    mountainName: mountain.name,
  })
  if (Number.isFinite(mountain.altitude)) {
    params.set('altitude', String(Math.round(mountain.altitude)))
  }

  return `/late-proof?${params.toString()}`
}
