import { buildComputedTrackStats } from './track-stats.ts'
import type { ImportedTrackData, TrackPoint } from './types.ts'
import { getFirstTagText } from './xml-utils.ts'

export function parseKml(content: string, fileName: string): ImportedTrackData {
  const coordinateBlocks = [...content.matchAll(/<coordinates(?:\s[^>]*)?>([\s\S]*?)<\/coordinates>/gi)]
  const trackPoints = coordinateBlocks.flatMap((match) =>
    match[1]
      .trim()
      .split(/\s+/)
      .flatMap((rawCoordinate): TrackPoint[] => {
        const [rawLongitude, rawLatitude, rawElevation] = rawCoordinate.split(',')
        const longitude = Number(rawLongitude)
        const latitude = Number(rawLatitude)
        const elevation = Number(rawElevation)

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []

        return [
          {
            latitude,
            longitude,
            ...(Number.isFinite(elevation) ? { elevation } : {}),
          },
        ]
      })
  )

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
