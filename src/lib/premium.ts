import {
  BASIC_SHARE_TEMPLATE_IDS,
  PREMIUM_SHARE_TEMPLATE_IDS,
  type ShareRenderTemplate,
} from '@/lib/share-templates/types'

export type PremiumAccessReason =
  | 'free_template'
  | 'paywall_disabled'
  | 'subscribed'
  | 'single_unlock'
  | 'not_unlocked'

export interface TemplateAccessResult {
  allowed: boolean
  reason: PremiumAccessReason
}

export const FREE_TEMPLATE_IDS = BASIC_SHARE_TEMPLATE_IDS

export const PREMIUM_TEMPLATE_IDS = PREMIUM_SHARE_TEMPLATE_IDS

export function isPremiumPaywallEnabled(): boolean {
  return process.env.ENABLE_PREMIUM_TEMPLATE_PAYWALL === 'true'
}

export function isBasicTemplate(id: string): id is (typeof FREE_TEMPLATE_IDS)[number] {
  return (FREE_TEMPLATE_IDS as readonly string[]).includes(id)
}

export function isPremiumTemplate(id: string): id is (typeof PREMIUM_TEMPLATE_IDS)[number] {
  return (PREMIUM_TEMPLATE_IDS as readonly string[]).includes(id)
}

export async function checkTemplateAccess(
  templateId: ShareRenderTemplate | string,
  userId?: string | null,
): Promise<TemplateAccessResult> {
  if (isBasicTemplate(templateId)) {
    return { allowed: true, reason: 'free_template' }
  }

  if (!isPremiumTemplate(templateId)) {
    return { allowed: true, reason: 'free_template' }
  }

  if (!isPremiumPaywallEnabled()) {
    return { allowed: true, reason: 'paywall_disabled' }
  }

  if (!userId) {
    return { allowed: false, reason: 'not_unlocked' }
  }

  try {
    const { createSupabaseServerClient } = await import('@/lib/supabase-server')
    const supabase = await createSupabaseServerClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, premium_template_unlocked_until')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) {
      return { allowed: false, reason: 'not_unlocked' }
    }

    const tier = typeof profile.subscription_tier === 'string' ? profile.subscription_tier : 'free'
    if (tier === 'premium' || tier === 'pro') {
      return { allowed: true, reason: 'subscribed' }
    }

    if (profile.premium_template_unlocked_until) {
      const until = new Date(profile.premium_template_unlocked_until)
      if (!Number.isNaN(until.getTime()) && until > new Date()) {
        return { allowed: true, reason: 'single_unlock' }
      }
    }

    return { allowed: false, reason: 'not_unlocked' }
  } catch {
    return { allowed: true, reason: 'paywall_disabled' }
  }
}
