export type ShareRenderTemplate = 'base-classic' | 'base-minimal' | 'base-data'

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
}

export type ShareRenderRequest = {
  template: ShareRenderTemplate
  data: ShareTemplateData
}
