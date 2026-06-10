export const SCREENSHOT_FIELD_LIMITS = {
  elevationMeters: { min: 0, max: 8849 },
  distanceKm: { minExclusive: 0, max: 1000 },
  elevationGainMeters: { min: 0, max: 10000 },
  elevationLossMeters: { min: 0, max: 10000 },
  speedKmh: { min: 0, max: 30 },
  paceMinPerKm: { min: 2, max: 40 },
  durationSeconds: { min: 1, max: 99 * 3600 + 59 * 60 + 59 },
  locationChars: { max: 30 },
} as const

export type ScreenshotFieldKey =
  | 'elevation'
  | 'distance'
  | 'duration'
  | 'elevationGain'
  | 'elevationLoss'
  | 'date'
  | 'location'
  | 'speed'
  | 'pace'

export type ScreenshotParsedFieldPayload = {
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
  paceMinPerKm?: number
}

export type ScreenshotEditableFields = Record<ScreenshotFieldKey, string>
export type ScreenshotFieldToggles = Record<ScreenshotFieldKey, boolean>

export type ScreenshotFieldValidationResult =
  | { ok: true; parsedData: ScreenshotParsedFieldPayload; errors: Partial<Record<ScreenshotFieldKey, string>> }
  | { ok: false; errors: Partial<Record<ScreenshotFieldKey, string>> }

function trim(value: string) {
  return value.trim()
}

export function parseScreenshotNumberInput(value: string) {
  const normalized = trim(value).replace(/,/g, '.').replace(/[^\d.-]/g, '')
  if (!normalized) return undefined
  const numberValue = Number(normalized)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function integerInRange(value: unknown, min: number, max: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return undefined
  const rounded = Math.round(numberValue)
  return rounded >= min && rounded <= max ? rounded : undefined
}

function numberInRange(value: unknown, min: number, max: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return undefined
  return numberValue >= min && numberValue <= max ? numberValue : undefined
}

export function formatScreenshotPace(value: number) {
  const totalSeconds = Math.max(0, Math.round(value * 60))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}'${String(seconds).padStart(2, '0')}"`
}

export function parseScreenshotPaceInput(value: string) {
  const normalized = trim(value)
    .replace(/\s+/gu, '')
    .replace(/[’′]/gu, "'")
    .replace(/[”″]/gu, '"')
  if (!normalized) return undefined

  const paceMatch = normalized.match(/^([0-9]{1,2})[':]([0-9]{2})"?$/u)
  if (!paceMatch) return undefined
  const minutes = Number(paceMatch[1])
  const seconds = Number(paceMatch[2])
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return undefined
  const pace = minutes + seconds / 60
  return pace >= SCREENSHOT_FIELD_LIMITS.paceMinPerKm.min && pace <= SCREENSHOT_FIELD_LIMITS.paceMinPerKm.max
    ? pace
    : undefined
}

export function parseScreenshotDurationInput(value: string) {
  const normalized = trim(value)
  if (!normalized) return undefined

  const parts = normalized.split(':')
  if (parts.length !== 2 && parts.length !== 3) return undefined
  if (!parts.every((part) => /^\d{1,2}$/u.test(part))) return undefined

  const values = parts.map((part) => Number(part))
  const hours = parts.length === 3 ? values[0]! : 0
  const minutes = parts.length === 3 ? values[1]! : values[0]!
  const seconds = parts.length === 3 ? values[2]! : values[1]!

  if (hours > 99 || minutes > 59 || seconds > 59) return undefined
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  return totalSeconds > 0 && totalSeconds <= SCREENSHOT_FIELD_LIMITS.durationSeconds.max ? totalSeconds : undefined
}

function isoDateOnOrBeforeToday(value: string) {
  const normalized = trim(value)
  if (!normalized) return undefined
  const match = normalized.match(/^([12][0-9]{3})-([0-9]{2})-([0-9]{2})$/u)
  if (!match) return undefined
  const candidate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`)
  if (!Number.isFinite(candidate.getTime())) return undefined
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (candidate.getTime() > todayUtc) return undefined
  return candidate.toISOString()
}

function safeShortText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const normalized = trim(value)
  if (!normalized || normalized.length > maxLength) return undefined
  return normalized
}

export function validateScreenshotEditableFields({
  fields,
  toggles,
  fileName,
}: {
  fields: ScreenshotEditableFields
  toggles: ScreenshotFieldToggles
  fileName?: string
}): ScreenshotFieldValidationResult {
  const errors: Partial<Record<ScreenshotFieldKey, string>> = {}

  const distanceKm = parseScreenshotNumberInput(fields.distance)
  if (
    typeof distanceKm !== 'number' ||
    distanceKm <= SCREENSHOT_FIELD_LIMITS.distanceKm.minExclusive ||
    distanceKm > SCREENSHOT_FIELD_LIMITS.distanceKm.max
  ) {
    errors.distance = '总距离需为大于 0 且不超过 1000 的数字。'
  }

  const elevationInput = fields.elevation.trim()
  const elevation = toggles.elevation && elevationInput ? parseScreenshotNumberInput(fields.elevation) : undefined
  const normalizedElevation = integerInRange(elevation, 0, SCREENSHOT_FIELD_LIMITS.elevationMeters.max)
  if (toggles.elevation && elevationInput && typeof normalizedElevation !== 'number') {
    errors.elevation = '格式不对，本次不会保存该字段。海拔需为 0–8849 m。'
  }

  const durationInput = fields.duration.trim()
  const durationSeconds = toggles.duration && durationInput ? parseScreenshotDurationInput(fields.duration) : undefined
  if (toggles.duration && durationInput && typeof durationSeconds !== 'number') {
    errors.duration = '格式不对，本次不会保存该字段。时长格式为 HH:MM:SS 或 MM:SS。'
  }

  const elevationGainInput = fields.elevationGain.trim()
  const elevationGain = toggles.elevationGain && elevationGainInput ? parseScreenshotNumberInput(fields.elevationGain) : undefined
  const normalizedElevationGain = integerInRange(elevationGain, 0, SCREENSHOT_FIELD_LIMITS.elevationGainMeters.max)
  if (toggles.elevationGain && elevationGainInput && typeof normalizedElevationGain !== 'number') {
    errors.elevationGain = '格式不对，本次不会保存该字段。爬升需为 0–10000 m。'
  }

  const elevationLossInput = fields.elevationLoss.trim()
  const elevationLoss = toggles.elevationLoss && elevationLossInput ? parseScreenshotNumberInput(fields.elevationLoss) : undefined
  const normalizedElevationLoss = integerInRange(elevationLoss, 0, SCREENSHOT_FIELD_LIMITS.elevationLossMeters.max)
  if (toggles.elevationLoss && elevationLossInput && typeof normalizedElevationLoss !== 'number') {
    errors.elevationLoss = '格式不对，本次不会保存该字段。下降需为 0–10000 m。'
  }

  const speedInput = fields.speed.trim()
  const speed = toggles.speed && speedInput ? parseScreenshotNumberInput(fields.speed) : undefined
  const normalizedSpeed = numberInRange(speed, 0, SCREENSHOT_FIELD_LIMITS.speedKmh.max)
  if (toggles.speed && speedInput && typeof normalizedSpeed !== 'number') {
    errors.speed = '格式不对，本次不会保存该字段。速度需为 0–30 km/h。'
  }

  const paceInput = fields.pace.trim()
  const pace = toggles.pace && paceInput ? parseScreenshotPaceInput(fields.pace) : undefined
  if (toggles.pace && paceInput && typeof pace !== 'number') {
    errors.pace = "格式不对，本次不会保存该字段。配速格式应为 7'09\"。"
  }

  const date = toggles.date ? isoDateOnOrBeforeToday(fields.date) : undefined
  if (toggles.date && fields.date.trim() && !date) {
    errors.date = '格式不对，本次不会保存该字段。日期不能晚于今天。'
  }

  const location = toggles.location ? safeShortText(fields.location, SCREENSHOT_FIELD_LIMITS.locationChars.max) : undefined
  if (toggles.location && fields.location.trim() && !location) {
    errors.location = '格式不对，本次不会保存该字段。地点不能超过 30 个字。'
  }

  if (typeof distanceKm !== 'number' || errors.distance) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    parsedData: {
      format: 'screenshot',
      fileName: fileName ?? 'screenshot',
      distanceMeters: Math.round(distanceKm * 1000),
      ...(location ? { name: location, location } : {}),
      ...(typeof normalizedElevation === 'number' ? { maxElevation: Math.round(normalizedElevation) } : {}),
      ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
      ...(typeof normalizedElevationGain === 'number' ? { elevationGainMeters: Math.round(normalizedElevationGain) } : {}),
      ...(typeof normalizedElevationLoss === 'number' ? { elevationLossMeters: Math.round(normalizedElevationLoss) } : {}),
      ...(typeof normalizedSpeed === 'number' ? { speedKmh: normalizedSpeed } : {}),
      ...(typeof pace === 'number' ? { paceMinPerKm: pace } : {}),
      ...(date ? { date } : {}),
    },
    errors,
  }
}

export function normalizeScreenshotParsedData(value: unknown): ScreenshotFieldValidationResult {
  if (!value || typeof value !== 'object') return { ok: false, errors: { distance: 'parsedData invalid' } }
  const record = value as Record<string, unknown>
  if (record.format !== 'screenshot') return { ok: false, errors: { distance: 'parsedData invalid' } }

  const distanceMeters = integerInRange(record.distanceMeters, 1, SCREENSHOT_FIELD_LIMITS.distanceKm.max * 1000)
  if (typeof distanceMeters !== 'number') return { ok: false, errors: { distance: 'parsedData invalid' } }

  const fileName = safeShortText(record.fileName, 180)
  const name = safeShortText(record.name, SCREENSHOT_FIELD_LIMITS.locationChars.max)
  const location = safeShortText(record.location, SCREENSHOT_FIELD_LIMITS.locationChars.max)
  const date = typeof record.date === 'string' ? isoDateOnOrBeforeToday(record.date.slice(0, 10)) : undefined
  const durationSeconds = integerInRange(record.durationSeconds, 1, SCREENSHOT_FIELD_LIMITS.durationSeconds.max)
  const elevationGainMeters = integerInRange(record.elevationGainMeters, 0, SCREENSHOT_FIELD_LIMITS.elevationGainMeters.max)
  const elevationLossMeters = integerInRange(record.elevationLossMeters, 0, SCREENSHOT_FIELD_LIMITS.elevationLossMeters.max)
  const maxElevation = integerInRange(record.maxElevation, 0, SCREENSHOT_FIELD_LIMITS.elevationMeters.max)
  const speedKmh = numberInRange(record.speedKmh, 0, SCREENSHOT_FIELD_LIMITS.speedKmh.max)
  const paceMinPerKm = numberInRange(
    record.paceMinPerKm,
    SCREENSHOT_FIELD_LIMITS.paceMinPerKm.min,
    SCREENSHOT_FIELD_LIMITS.paceMinPerKm.max
  )

  return {
    ok: true,
    parsedData: {
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
      ...(typeof paceMinPerKm === 'number' ? { paceMinPerKm } : {}),
    },
    errors: {},
  }
}
