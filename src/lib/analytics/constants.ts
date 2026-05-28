export const ANALYTICS_SESSION_COOKIE = 'pt_anon_sid'
export const ATTRIBUTION_LINK_COOKIE = 'pt_attribution_link_id'
export const ATTRIBUTION_TEMPLATE_COOKIE = 'pt_attribution_template_id'
export const ATTRIBUTION_SOURCE_COOKIE = 'pt_attribution_source_user_id'

export const ANALYTICS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export const TREK_SUMMIT_PROXIMITY_THRESHOLD_M = 200
export const TREK_TIMEOUT_THRESHOLD_HOURS = 6

export const ANALYTICS_EVENT_TYPES = ['page_view', 'auth', 'business', 'paid_attempt', 'system'] as const
