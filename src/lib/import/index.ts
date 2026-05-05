import { parseFit } from './fit-parser.ts'
import { parseGpx } from './gpx-parser.ts'
import { parseKml } from './kml-parser.ts'
import type { ImportedTrackData, ImportFormat } from './types.ts'

export function getImportFormatFromFileName(fileName: string): ImportFormat {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'gpx' || extension === 'kml' || extension === 'fit') return extension
  throw new Error('Unsupported import format. Please upload a GPX, KML, or FIT file.')
}

export async function parseTrackFile(fileName: string, content: Buffer): Promise<ImportedTrackData> {
  const format = getImportFormatFromFileName(fileName)

  if (format === 'gpx') {
    return parseGpx(content.toString('utf8'), fileName)
  }

  if (format === 'kml') {
    return parseKml(content.toString('utf8'), fileName)
  }

  return parseFit(content, fileName)
}

export type { ImportedTrackData, ImportFormat, TrackPoint } from './types.ts'
