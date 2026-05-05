import { buildComputedTrackStats } from './track-stats.ts'
import type { ImportedTrackData, TrackPoint } from './types.ts'
import { getAttribute, getChildTagText, getFirstTagText } from './xml-utils.ts'

export function parseGpx(content: string, fileName: string): ImportedTrackData {
  const trackPoints: TrackPoint[] = []
  const trkptPattern = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi
  let match: RegExpExecArray | null

  while ((match = trkptPattern.exec(content)) !== null) {
    const attributes = match[1]
    const body = match[2]
    const latitude = Number(getAttribute(attributes, 'lat'))
    const longitude = Number(getAttribute(attributes, 'lon'))
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue

    const elevationValue = Number(getChildTagText(body, 'ele'))
    const time = getChildTagText(body, 'time')
    trackPoints.push({
      latitude,
      longitude,
      ...(Number.isFinite(elevationValue) ? { elevation: elevationValue } : {}),
      ...(time ? { timestamp: time } : {}),
    })
  }

  if (trackPoints.length === 0) {
    throw new Error('GPX 文件中没有可用轨迹点。')
  }

  return {
    format: 'gpx',
    fileName,
    ...(getFirstTagText(content, 'name') ? { name: getFirstTagText(content, 'name') } : {}),
    ...buildComputedTrackStats(trackPoints),
    trackPoints,
    suggestedMountain: null,
  }
}
