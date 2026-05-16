export const SCREENSHOT_MAX_DURATION_SECONDS = 30 * 24 * 60 * 60
export const SCREENSHOT_MAX_DISTANCE_METERS = 1_000_000
export const SCREENSHOT_MAX_ELEVATION_METERS = 8_848
export const SCREENSHOT_MAX_ELEVATION_GAIN_METERS = 10_000
export const SCREENSHOT_MAX_SPEED_KMH = 50

export type NormalizedScreenshotData = {
  format: 'screenshot'
  fileName?: string
  name?: string
  location?: string
  date?: string
  distanceMeters: number
  durationSeconds?: number
  elevationGainMeters?: number
  elevationLossMeters?: number
  maxElevation?: number
  speedKmh?: number
}

export type NormalizeScreenshotResult =
  | { ok: true; data: NormalizedScreenshotData }
  | { ok: false; reason: 'invalid' }

function toSafeTrackName(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 180) : undefined
}

function toIsoDate(value: unknown) {
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^([12][0-9]{3})-([0-9]{2})-([0-9]{2})$/u)
  if (!match) return undefined
  const timestamp = Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

function normalizeIntegerInRange(value: unknown, min: number, max: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return undefined
  const rounded = Math.round(numberValue)
  return rounded >= min && rounded <= max ? rounded : undefined
}

function normalizeNumberInRange(value: unknown, min: number, max: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return undefined
  return numberValue >= min && numberValue <= max ? numberValue : undefined
}

export function normalizeScreenshotData(value: unknown): NormalizeScreenshotResult {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'invalid' }
  const record = value as Record<string, unknown>
  if (record.format !== 'screenshot') return { ok: false, reason: 'invalid' }

  const distanceMeters = normalizeIntegerInRange(record.distanceMeters, 1, SCREENSHOT_MAX_DISTANCE_METERS)
  if (typeof distanceMeters !== 'number') return { ok: false, reason: 'invalid' }

  const fileName = toSafeTrackName(record.fileName)
  const name = toSafeTrackName(record.name)
  const location = toSafeTrackName(record.location)
  const date = toIsoDate(record.date)
  const durationSeconds = normalizeIntegerInRange(record.durationSeconds, 1, SCREENSHOT_MAX_DURATION_SECONDS)
  const elevationGainMeters = normalizeIntegerInRange(record.elevationGainMeters, 0, SCREENSHOT_MAX_ELEVATION_GAIN_METERS)
  const elevationLossMeters = normalizeIntegerInRange(record.elevationLossMeters, 0, SCREENSHOT_MAX_ELEVATION_GAIN_METERS)
  const maxElevation = normalizeIntegerInRange(record.maxElevation, 0, SCREENSHOT_MAX_ELEVATION_METERS)
  const speedKmh = normalizeNumberInRange(record.speedKmh, 0, SCREENSHOT_MAX_SPEED_KMH)

  return {
    ok: true,
    data: {
      format: 'screenshot',
      distanceMeters,
      ...(fileName ? { fileName } : {}),
      ...(name ? { name } : {}),
      ...(location ? { location } : {}),
      ...(date ? { date } : {}),
      ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
      ...(typeof elevationGainMeters === 'number' ? { elevationGainMeters } : {}),
      ...(typeof elevationLossMeters === 'number' ? { elevationLossMeters } : {}),
      ...(typeof maxElevation === 'number' ? { maxElevation } : {}),
      ...(typeof speedKmh === 'number' ? { speedKmh } : {}),
    },
  }
}
