import {
  SCREENSHOT_FIELD_LIMITS,
  normalizeScreenshotParsedData,
  type ScreenshotParsedFieldPayload,
} from '../screenshot-field-validation.ts'

export const SCREENSHOT_MAX_DURATION_SECONDS = SCREENSHOT_FIELD_LIMITS.durationSeconds.max
export const SCREENSHOT_MAX_DISTANCE_METERS = SCREENSHOT_FIELD_LIMITS.distanceKm.max * 1000
export const SCREENSHOT_MAX_ELEVATION_METERS = SCREENSHOT_FIELD_LIMITS.elevationMeters.max
export const SCREENSHOT_MAX_ELEVATION_GAIN_METERS = SCREENSHOT_FIELD_LIMITS.elevationGainMeters.max
export const SCREENSHOT_MAX_SPEED_KMH = SCREENSHOT_FIELD_LIMITS.speedKmh.max

export type NormalizedScreenshotData = ScreenshotParsedFieldPayload

export type NormalizeScreenshotResult =
  | { ok: true; data: NormalizedScreenshotData }
  | { ok: false; reason: 'invalid' }

export function normalizeScreenshotData(value: unknown): NormalizeScreenshotResult {
  const result = normalizeScreenshotParsedData(value)
  return result.ok ? { ok: true, data: result.parsedData } : { ok: false, reason: 'invalid' }
}
