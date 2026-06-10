import type { ShareTrackPreview } from '../share-track-preview'

export const BASIC_SHARE_TEMPLATE_IDS = [
  'base-classic',
  'base-data',
] as const

export const PREMIUM_SHARE_TEMPLATE_IDS = [
  'premium-photo-composite',
  'premium-photo-overlay',
  'premium-bold-number',
  'premium-data-scatter',
  'premium-mono-film',
  'premium-altitude-profile',
  'premium-summit-certificate',
  'premium-vertical-story',
] as const

export const SHARE_RENDER_TEMPLATE_IDS = [
  ...BASIC_SHARE_TEMPLATE_IDS,
  ...PREMIUM_SHARE_TEMPLATE_IDS,
] as const

export type ShareRenderTemplate = (typeof SHARE_RENDER_TEMPLATE_IDS)[number]

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
  altitude?: number | null
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
