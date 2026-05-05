export type TemplateId =
  | 'basic-classic'
  | 'basic-minimal'
  | 'basic-data'
  | 'premium-photo-overlay'
  | 'premium-split-view'
  | 'premium-big-number'

export type SubscriptionTier = 'free' | 'premium' | 'premium_trial'

export interface TemplateAccessResult {
  allowed: boolean
  watermark: boolean
  reason?: string
}

export function isPremiumTemplate(templateId: TemplateId): boolean {
  return templateId.startsWith('premium-')
}

function isPremiumPaywallEnabled(): boolean {
  return process.env.ENABLE_PREMIUM_TEMPLATE_PAYWALL === 'true'
}

export function checkTemplateAccess(
  templateId: TemplateId,
  userTier: SubscriptionTier,
  premiumUnlockedUntil: string | null
): TemplateAccessResult {
  if (!isPremiumTemplate(templateId)) {
    return { allowed: true, watermark: false }
  }

  if (!isPremiumPaywallEnabled()) {
    return { allowed: true, watermark: false }
  }

  if (userTier === 'premium') {
    return { allowed: true, watermark: false }
  }

  if (userTier === 'premium_trial' && premiumUnlockedUntil) {
    const unlockExpiry = new Date(premiumUnlockedUntil)
    if (unlockExpiry > new Date()) {
      return { allowed: true, watermark: false }
    }
  }

  return {
    allowed: false,
    watermark: true,
    reason: 'premium_template_locked',
  }
}
