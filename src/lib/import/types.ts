export type ImportFormat = 'gpx' | 'kml' | 'fit'

export interface TrackPoint {
  latitude: number
  longitude: number
  elevation?: number
  timestamp?: string
}

export interface ImportedTrackData {
  format: ImportFormat
  fileName: string
  name?: string
  startTime?: string
  endTime?: string
  durationSeconds?: number
  distanceMeters?: number
  elevationGainMeters?: number
  elevationLossMeters?: number
  maxElevation?: number
  minElevation?: number
  trackPoints: TrackPoint[]
  suggestedMountain?: {
    id: string
    name: string
    distanceMeters: number
  } | null
}
