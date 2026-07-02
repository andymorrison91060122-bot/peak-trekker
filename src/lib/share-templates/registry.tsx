import type { ReactElement } from 'react'
import { BaseClassicTemplate } from './base-classic'
import { BaseDataTemplate } from './base-data'
import { PremiumAltitudeProfileTemplate } from './premium-altitude-profile'
import { PremiumBoldNumberTemplate } from './premium-bold-number'
import { PremiumDataScatterTemplate } from './premium-data-scatter'
import { PremiumMonoFilmTemplate } from './premium-mono-film'
import { PremiumPhotoCompositeTemplate } from './premium-photo-composite'
import { PremiumPhotoOverlayTemplate } from './premium-photo-overlay'
import { PremiumSummitCertificateTemplate } from './premium-summit-certificate'
import { PremiumVerticalStoryTemplate } from './premium-vertical-story'
import type { ShareRenderTemplate, ShareTemplateProps } from './types'

export type ShareTemplateTier = 'basic' | 'premium'
export type ShareTemplateComponent = (props: ShareTemplateProps) => ReactElement

export type ShareTemplateRegistryEntry = {
  id: ShareRenderTemplate
  label: string
  tier: ShareTemplateTier
  Component: ShareTemplateComponent
}

export const SHARE_TEMPLATE_REGISTRY = [
  { id: 'base-classic', label: 'Classic', tier: 'basic', Component: BaseClassicTemplate },
  { id: 'base-data', label: 'Data', tier: 'basic', Component: BaseDataTemplate },
  { id: 'premium-photo-composite', label: 'Photo', tier: 'premium', Component: PremiumPhotoCompositeTemplate },
  { id: 'premium-photo-overlay', label: 'Overlay', tier: 'premium', Component: PremiumPhotoOverlayTemplate },
  { id: 'premium-bold-number', label: 'Number', tier: 'premium', Component: PremiumBoldNumberTemplate },
  { id: 'premium-data-scatter', label: 'HUD', tier: 'premium', Component: PremiumDataScatterTemplate },
  { id: 'premium-mono-film', label: 'Film', tier: 'premium', Component: PremiumMonoFilmTemplate },
  { id: 'premium-altitude-profile', label: 'Profile', tier: 'premium', Component: PremiumAltitudeProfileTemplate },
  { id: 'premium-summit-certificate', label: 'Cert', tier: 'premium', Component: PremiumSummitCertificateTemplate },
  { id: 'premium-vertical-story', label: 'Story', tier: 'premium', Component: PremiumVerticalStoryTemplate },
] as const satisfies readonly ShareTemplateRegistryEntry[]

export function getShareTemplateRegistryEntry(template: ShareRenderTemplate) {
  return SHARE_TEMPLATE_REGISTRY.find((entry) => entry.id === template) ?? SHARE_TEMPLATE_REGISTRY[0]
}

export function getShareTemplateComponent(template: ShareRenderTemplate) {
  return getShareTemplateRegistryEntry(template).Component
}
