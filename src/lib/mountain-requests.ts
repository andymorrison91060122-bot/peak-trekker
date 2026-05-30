export const MOUNTAIN_REQUEST_SOURCES = ['import_distance_blocked', 'import_no_match'] as const
export const MOUNTAIN_REQUEST_IMPORT_FORMATS = ['gpx', 'kml', 'fit'] as const
export const MOUNTAIN_REQUEST_REFERENCE_SOURCES = ['median', 'highest', 'center'] as const
export const MOUNTAIN_REQUEST_DEDUPE_WINDOW_MINUTES = 15

export type MountainRequestSource = (typeof MOUNTAIN_REQUEST_SOURCES)[number]
export type MountainRequestImportFormat = (typeof MOUNTAIN_REQUEST_IMPORT_FORMATS)[number]
export type MountainRequestReferenceSource = (typeof MOUNTAIN_REQUEST_REFERENCE_SOURCES)[number]

export type MountainRequestInput = {
  requestSource: MountainRequestSource
  locationName?: string | null
  latitude?: number | null
  longitude?: number | null
  altitudeM?: number | null
  province?: string | null
  trackName?: string | null
  fileName?: string | null
  importFormat?: MountainRequestImportFormat | null
  candidateMountainId?: string | null
  candidateMountainName?: string | null
  candidateDistanceM?: number | null
  referencePointSource?: MountainRequestReferenceSource | null
  trackContentHash?: string | null
  context?: Record<string, unknown> | null
}

export type NormalizedMountainRequest = MountainRequestInput & {
  requestFingerprint: string
  dedupeBucketStart: string
  context: Record<string, unknown>
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value)
}

export function cleanMountainRequestText(value: unknown, maxLength = 160) {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
  return normalized || null
}

function toFiniteNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function toRoundedInteger(value: unknown) {
  const numberValue = toFiniteNumber(value)
  return numberValue === null ? null : Math.round(numberValue)
}

function normalizeCoordinate(value: unknown) {
  const numberValue = toFiniteNumber(value)
  if (numberValue === null) return null
  return Math.round(numberValue * 1_000_000) / 1_000_000
}

function sanitizeContext(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((next, [key, rawValue]) => {
    const safeKey = cleanMountainRequestText(key, 48)
    if (!safeKey) return next

    if (typeof rawValue === 'string') {
      const safeValue = cleanMountainRequestText(rawValue, 180)
      if (safeValue) next[safeKey] = safeValue
      return next
    }

    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      next[safeKey] = rawValue
      return next
    }

    if (typeof rawValue === 'boolean') {
      next[safeKey] = rawValue
    }

    return next
  }, {})
}

export function getMountainRequestDedupeBucketStart(now = new Date()) {
  const bucketMs = MOUNTAIN_REQUEST_DEDUPE_WINDOW_MINUTES * 60 * 1000
  return new Date(Math.floor(now.getTime() / bucketMs) * bucketMs).toISOString()
}

export function buildMountainRequestFingerprint(input: MountainRequestInput) {
  const source = input.requestSource
  const hash = cleanMountainRequestText(input.trackContentHash, 96)
  const candidate = cleanMountainRequestText(input.candidateMountainId, 80)
    ?? cleanMountainRequestText(input.candidateMountainName, 120)
    ?? 'none'

  if (hash) {
    return `${source}|track:${hash}|candidate:${candidate}`
  }

  const lat = typeof input.latitude === 'number' ? input.latitude.toFixed(4) : 'na'
  const lng = typeof input.longitude === 'number' ? input.longitude.toFixed(4) : 'na'
  const altitude = typeof input.altitudeM === 'number' ? String(Math.round(input.altitudeM / 10) * 10) : 'na'
  const name = cleanMountainRequestText(input.locationName, 120)?.toLowerCase() ?? 'unknown'
  return `${source}|geo:${lat},${lng},${altitude}|name:${name}|candidate:${candidate}`
}

export function normalizeMountainRequestInput(value: unknown, now = new Date()):
  | { ok: true; request: NormalizedMountainRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'invalid payload' }

  const record = value as Record<string, unknown>
  const requestSource = record.requestSource
  if (!isOneOf(requestSource, MOUNTAIN_REQUEST_SOURCES)) {
    return { ok: false, error: 'invalid requestSource' }
  }

  const importFormat = record.importFormat
  if (importFormat !== null && importFormat !== undefined && !isOneOf(importFormat, MOUNTAIN_REQUEST_IMPORT_FORMATS)) {
    return { ok: false, error: 'invalid importFormat' }
  }

  const referencePointSource = record.referencePointSource
  if (
    referencePointSource !== null
    && referencePointSource !== undefined
    && !isOneOf(referencePointSource, MOUNTAIN_REQUEST_REFERENCE_SOURCES)
  ) {
    return { ok: false, error: 'invalid referencePointSource' }
  }

  const request: MountainRequestInput = {
    requestSource,
    locationName: cleanMountainRequestText(record.locationName, 160),
    latitude: normalizeCoordinate(record.latitude),
    longitude: normalizeCoordinate(record.longitude),
    altitudeM: toRoundedInteger(record.altitudeM),
    province: cleanMountainRequestText(record.province, 80),
    trackName: cleanMountainRequestText(record.trackName, 180),
    fileName: cleanMountainRequestText(record.fileName, 180),
    importFormat: importFormat as MountainRequestImportFormat | null | undefined,
    candidateMountainId: cleanMountainRequestText(record.candidateMountainId, 80),
    candidateMountainName: cleanMountainRequestText(record.candidateMountainName, 160),
    candidateDistanceM: toRoundedInteger(record.candidateDistanceM),
    referencePointSource: referencePointSource as MountainRequestReferenceSource | null | undefined,
    trackContentHash: cleanMountainRequestText(record.trackContentHash, 120),
    context: sanitizeContext(record.context),
  }

  return {
    ok: true,
    request: {
      ...request,
      requestFingerprint: buildMountainRequestFingerprint(request),
      dedupeBucketStart: getMountainRequestDedupeBucketStart(now),
      context: request.context ?? {},
    },
  }
}
