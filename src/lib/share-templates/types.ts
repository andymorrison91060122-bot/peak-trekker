import type { ShareTrackPreview } from '../share-track-preview'

export type ShareRenderTemplate =
  | 'base-classic'
  | 'base-minimal'
  | 'base-data'
  | 'premium-photo-composite'
  | 'premium-photo-overlay'
  | 'premium-split-view'
  | 'premium-bold-number'
  | 'premium-data-scatter'
  | 'premium-mono-film'
  | 'premium-altitude-profile'
  | 'premium-summit-certificate'
  | 'premium-vertical-story'

export type ShareRenderSource = 'gps' | 'uploaded'

export type ShareVisibleFields = {
  duration: boolean
  elevationGain: boolean
  date: boolean
  location: boolean
  pace: boolean
  mountainName: boolean
}

export type ShareTemplateData = {
  mountainName: string
  location: string
  date: string
  altitude: number
  distance: number
  duration: string
  elevationGain: number
  source: ShareRenderSource
  visibleFields: ShareVisibleFields
  trackPreview?: ShareTrackPreview | null
}

export type ShareRenderRequest = {
  template: ShareRenderTemplate
  data: ShareTemplateData
  photoBase64?: string
  transparent?: boolean
}

export type ShareTemplateProps = {
  data: ShareTemplateData
  photoDataUrl?: string | null
}
