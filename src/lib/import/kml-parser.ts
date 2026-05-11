import { buildComputedTrackStats } from './track-stats.ts'
import type { ImportedTrackData, TrackPoint } from './types.ts'
import { decodeXml, getAttribute, getFirstTagText } from './xml-utils.ts'

export function parseKml(content: string, fileName: string): ImportedTrackData {
  const gxTrackPoints = extractGxTrackPoints(content)
  const trackPoints =
    gxTrackPoints.length > 0
      ? gxTrackPoints
      : applyExtendedDataTimeFallback(extractStandardCoordinatePoints(content), extractExtendedDataTimes(content))

  if (trackPoints.length === 0) {
    throw new Error('KML 文件中没有可用轨迹点。')
  }

  return {
    format: 'kml',
    fileName,
    ...(getFirstTagText(content, 'name') ? { name: getFirstTagText(content, 'name') } : {}),
    ...buildComputedTrackStats(trackPoints),
    trackPoints,
    suggestedMountain: null,
  }
}

function extractGxTrackPoints(content: string) {
  const trackBlocks = [...content.matchAll(/<((?:[A-Za-z_][\w.-]*:)?Track)\b[^>]*>([\s\S]*?)<\/\1>/gi)]

  return trackBlocks.flatMap((trackMatch) => {
    const fragment = trackMatch[2]
    const coordinates = [...fragment.matchAll(/<(?:[A-Za-z_][\w.-]*:)?coord\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?coord>/gi)]
      .flatMap((coordMatch) => parseGxCoordinate(coordMatch[1]))
    const timestamps = [...fragment.matchAll(/<(?:[A-Za-z_][\w.-]*:)?when\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?when>/gi)]
      .map((whenMatch) => normalizeIsoTimestamp(whenMatch[1]))

    if (coordinates.length === 0) return []
    if (coordinates.length !== timestamps.length) return coordinates

    return coordinates.map((point, index) => ({
      ...point,
      ...(timestamps[index] ? { timestamp: timestamps[index] } : {}),
    }))
  })
}

function extractStandardCoordinatePoints(content: string) {
  const coordinateBlocks = [...content.matchAll(/<coordinates(?:\s[^>]*)?>([\s\S]*?)<\/coordinates>/gi)]

  return coordinateBlocks.flatMap((match) =>
    match[1]
      .trim()
      .split(/\s+/)
      .flatMap((rawCoordinate) => parseCommaCoordinate(rawCoordinate))
  )
}

function extractExtendedDataTimes(content: string) {
  const values = new Map<string, string>()

  for (const match of content.matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/gi)) {
    const name = getAttribute(match[0], 'name')?.toLowerCase()
    const value = getFirstTagText(match[1], 'value')
    if (name && value) values.set(name, value)
  }

  const beginTime = normalizeUnixMilliseconds(values.get('begintime'))
  const endTime = normalizeUnixMilliseconds(values.get('endtime'))
  if (!beginTime || !endTime || Date.parse(endTime) < Date.parse(beginTime)) return null

  return { beginTime, endTime }
}

function applyExtendedDataTimeFallback(points: TrackPoint[], times: { beginTime: string; endTime: string } | null) {
  if (points.length === 0 || !times) return points

  const nextPoints = points.map((point) => ({ ...point }))
  nextPoints[0].timestamp = times.beginTime
  if (nextPoints.length > 1) {
    nextPoints[nextPoints.length - 1].timestamp = times.endTime
  }

  return nextPoints
}

function parseCommaCoordinate(rawCoordinate: string): TrackPoint[] {
  const [rawLongitude, rawLatitude, rawElevation] = rawCoordinate.split(',')
  return buildTrackPoint(rawLatitude, rawLongitude, rawElevation)
}

function parseGxCoordinate(rawCoordinate: string): TrackPoint[] {
  const [rawLongitude, rawLatitude, rawElevation] = decodeXml(rawCoordinate).trim().split(/\s+/)
  return buildTrackPoint(rawLatitude, rawLongitude, rawElevation)
}

function buildTrackPoint(rawLatitude: string | undefined, rawLongitude: string | undefined, rawElevation: string | undefined) {
  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)
  const elevation = Number(rawElevation)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []

  return [
    {
      latitude,
      longitude,
      ...(Number.isFinite(elevation) ? { elevation } : {}),
    },
  ]
}

function normalizeIsoTimestamp(value: string | undefined) {
  if (!value) return undefined

  const timestamp = decodeXml(value).trim()
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return undefined

  return new Date(parsed).toISOString()
}

function normalizeUnixMilliseconds(value: string | undefined) {
  if (!value) return undefined

  const milliseconds = Number.parseInt(value.trim(), 10)
  if (!Number.isFinite(milliseconds)) return undefined

  const date = new Date(milliseconds)
  if (!Number.isFinite(date.getTime())) return undefined

  return date.toISOString()
}
