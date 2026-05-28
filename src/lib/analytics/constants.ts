export const ANALYTICS_SESSION_COOKIE = 'pt_anon_sid'
export const ATTRIBUTION_LINK_COOKIE = 'pt_attribution_link_id'
export const ATTRIBUTION_TEMPLATE_COOKIE = 'pt_attribution_template_id'
export const ATTRIBUTION_SOURCE_COOKIE = 'pt_attribution_source_user_id'

export const ANALYTICS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export const TREK_SUMMIT_PROXIMITY_THRESHOLD_M = 200
export const TREK_TIMEOUT_THRESHOLD_HOURS = 6
export const NEW_USER_THRESHOLD_DAYS = 7

export const ANALYTICS_EVENT_TYPES = ['page_view', 'auth', 'business', 'paid_attempt', 'system'] as const
export const ANALYTICS_COHORT_OPTIONS = [
  { key: 'all', label: '全部', description: '全部用户 / 访客' },
  { key: 'new', label: '新用户', description: `注册 ≤ ${NEW_USER_THRESHOLD_DAYS} 天` },
  { key: 'returning', label: '老用户', description: `注册 > ${NEW_USER_THRESHOLD_DAYS} 天` },
  { key: 'anonymous', label: '匿名访客', description: '未注册 / 仅 session' },
] as const
