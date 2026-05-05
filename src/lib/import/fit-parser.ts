import FitParser from 'fit-file-parser'
import { buildComputedTrackStats } from './track-stats.ts'
import type { ImportedTrackData, TrackPoint } from './types.ts'

type FitRecord = {
  position_lat?: number
  position_long?: number
  altitude?: number
  enhanced_altitude?: number
  timestamp?: string | Date
}

type FitSession = {
  total_distance?: number
  total_elapsed_time?: number
  total_timer_time?: number
  total_ascent?: number
  total_descent?: number
  max_altitude?: number
  enhanced_max_altitude?: number
  min_altitude?: number
  enhanced_min_altitude?: number
}

type ParsedFitLike = {
  records?: FitRecord[]
  sessions?: FitSession[]
  activity?: {
    sessions?: Array<FitSession & { laps?: Array<{ records?: FitRecord[] }> }>
  }
  laps?: Array<{ records?: FitRecord[] }>
}

export function semicirclesToDegrees(value: number) {
  return value * (180 / 2 ** 31)
}

function normalizeFitCoordinate(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return Math.abs(numberValue) > 180 ? semicirclesToDegrees(numberValue) : numberValue
}

function normalizeFitTimestamp(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function getRecords(parsed: ParsedFitLike) {
  const direct = parsed.records ?? []
  const fromLaps = (parsed.laps ?? []).flatMap((lap) => lap.records ?? [])
  const fromActivity = (parsed.activity?.sessions ?? []).flatMap((session) =>
    (session.laps ?? []).flatMap((lap) => lap.records ?? [])
  )

  return [...direct, ...fromLaps, ...fromActivity]
}

function getFirstSession(parsed: ParsedFitLike) {
  return parsed.sessions?.[0] ?? parsed.activity?.sessions?.[0] ?? null
}

export function buildImportedFitDataFromParsedFit(parsed: ParsedFitLike, fileName: string): ImportedTrackData {
  const trackPoints = getRecords(parsed).flatMap((record): TrackPoint[] => {
    const latitude = normalizeFitCoordinate(record.position_lat)
    const longitude = normalizeFitCoordinate(record.position_long)
    if (latitude === null || longitude === null) return []

    const elevation = Number(record.enhanced_altitude ?? record.altitude)
    const timestamp = normalizeFitTimestamp(record.timestamp)

    return [
      {
        latitude,
        longitude,
        ...(Number.isFinite(elevation) ? { elevation } : {}),
        ...(timestamp ? { timestamp } : {}),
      },
    ]
  })

  if (trackPoints.length === 0) {
    throw new Error('FIT 文件中没有可用轨迹点。')
  }

  const session = getFirstSession(parsed)
  const computed = buildComputedTrackStats(trackPoints)

  return {
    format: 'fit',
    fileName,
    ...computed,
    ...(Number.isFinite(Number(session?.total_distance)) ? { distanceMeters: Math.round(Number(session?.total_distance)) } : {}),
    ...(Number.isFinite(Number(session?.total_elapsed_time ?? session?.total_timer_time))
      ? { durationSeconds: Math.round(Number(session?.total_elapsed_time ?? session?.total_timer_time)) }
      : {}),
    ...(Number.isFinite(Number(session?.total_ascent)) ? { elevationGainMeters: Math.round(Number(session?.total_ascent)) } : {}),
    ...(Number.isFinite(Number(session?.total_descent)) ? { elevationLossMeters: Math.round(Number(session?.total_descent)) } : {}),
    ...(Number.isFinite(Number(session?.enhanced_max_altitude ?? session?.max_altitude))
      ? { maxElevation: Number(session?.enhanced_max_altitude ?? session?.max_altitude) }
      : {}),
    ...(Number.isFinite(Number(session?.enhanced_min_altitude ?? session?.min_altitude))
      ? { minElevation: Number(session?.enhanced_min_altitude ?? session?.min_altitude) }
      : {}),
    trackPoints,
    suggestedMountain: null,
  }
}

export async function parseFit(content: Buffer, fileName: string): Promise<ImportedTrackData> {
  const fitParser = new FitParser({
    force: true,
    lengthUnit: 'm',
    speedUnit: 'm/s',
    elapsedRecordField: true,
    mode: 'both',
  })
  const parsed = await fitParser.parseAsync(content as unknown as Buffer<ArrayBuffer>)
  return buildImportedFitDataFromParsedFit(parsed as ParsedFitLike, fileName)
}
