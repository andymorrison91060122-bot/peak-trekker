import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScreenshotQuotaState } from './types'

export const SCREENSHOT_QUOTA_FIRST_MONTH_FREE_LIMIT = 5
export const SCREENSHOT_QUOTA_MONTHLY_FREE_LIMIT = 2
export const SCREENSHOT_QUOTA_PAID_LIMIT = 30

export type ScreenshotQuotaRow = {
  month_key: string
  free_used: number | null
  paid_used: number | null
}

export type ScreenshotQuotaProfile = {
  subscription_tier: string | null
}

export type ConsumeScreenshotQuotaResult =
  | { success: true; bucket: 'free' | 'paid'; quota: ScreenshotQuotaState }
  | { success: false; reason: 'exhausted' | 'rpc_error'; quota: ScreenshotQuotaState; error?: string }

type ScreenshotQuotaRpcRow = {
  success: boolean | null
  reason: string | null
  bucket: string | null
  free_used: number | null
  paid_used: number | null
}

export function getScreenshotQuotaMonthKey(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function normalizeSubscriptionTier(tier: unknown): ScreenshotQuotaState['subscriptionTier'] {
  return tier === 'premium' || tier === 'premium_trial' ? tier : 'free'
}

export function computeScreenshotQuotaState({
  rows,
  profile,
  monthKey = getScreenshotQuotaMonthKey(),
}: {
  rows: ScreenshotQuotaRow[]
  profile?: ScreenshotQuotaProfile | null
  monthKey?: string
}): ScreenshotQuotaState {
  const orderedRows = [...rows].sort((a, b) => a.month_key.localeCompare(b.month_key))
  const current = orderedRows.find((row) => row.month_key === monthKey)
  const firstUsageMonth = orderedRows[0]?.month_key ?? monthKey
  const subscriptionTier = normalizeSubscriptionTier(profile?.subscription_tier)
  const freeLimit = firstUsageMonth === monthKey ? SCREENSHOT_QUOTA_FIRST_MONTH_FREE_LIMIT : SCREENSHOT_QUOTA_MONTHLY_FREE_LIMIT
  const paidLimit = subscriptionTier === 'free' ? 0 : SCREENSHOT_QUOTA_PAID_LIMIT
  const freeUsed = Math.max(0, Number(current?.free_used ?? 0))
  const paidUsed = Math.max(0, Number(current?.paid_used ?? 0))
  const freeRemaining = Math.max(0, freeLimit - freeUsed)
  const paidRemaining = Math.max(0, paidLimit - paidUsed)

  return {
    monthKey,
    isFirstMonth: firstUsageMonth === monthKey,
    subscriptionTier,
    freeLimit,
    freeUsed,
    paidLimit,
    paidUsed,
    freeRemaining,
    paidRemaining,
    remaining: freeRemaining + paidRemaining,
    totalLimit: freeLimit + paidLimit,
  }
}

function withQuotaUsage(quota: ScreenshotQuotaState, freeUsed: number | null | undefined, paidUsed: number | null | undefined): ScreenshotQuotaState {
  const nextFreeUsed = Math.max(0, Number(freeUsed ?? quota.freeUsed))
  const nextPaidUsed = Math.max(0, Number(paidUsed ?? quota.paidUsed))
  const freeRemaining = Math.max(0, quota.freeLimit - nextFreeUsed)
  const paidRemaining = Math.max(0, quota.paidLimit - nextPaidUsed)

  return {
    ...quota,
    freeUsed: nextFreeUsed,
    paidUsed: nextPaidUsed,
    freeRemaining,
    paidRemaining,
    remaining: freeRemaining + paidRemaining,
    totalLimit: quota.freeLimit + quota.paidLimit,
  }
}

export async function getScreenshotQuotaState(
  supabase: SupabaseClient,
  userId: string,
  monthKey = getScreenshotQuotaMonthKey()
): Promise<ScreenshotQuotaState> {
  const [quotaResult, profileResult] = await Promise.all([
    supabase
      .from('screenshot_quota')
      .select('month_key, free_used, paid_used')
      .eq('user_id', userId)
      .order('month_key', { ascending: true }),
    supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .maybeSingle(),
  ])

  if (quotaResult.error) {
    throw new Error(`Failed to load screenshot quota: ${quotaResult.error.message}`)
  }

  return computeScreenshotQuotaState({
    rows: (quotaResult.data ?? []) as ScreenshotQuotaRow[],
    profile: profileResult.error ? null : (profileResult.data as ScreenshotQuotaProfile | null),
    monthKey,
  })
}

export async function consumeScreenshotQuota(
  supabase: SupabaseClient,
  userId: string,
  quota: ScreenshotQuotaState
): Promise<ConsumeScreenshotQuotaResult> {
  const { data, error } = await supabase.rpc('consume_screenshot_quota', {
    p_user_id: userId,
    p_month_key: quota.monthKey,
    p_free_limit: quota.freeLimit,
    p_paid_limit: quota.paidLimit,
  })

  if (error) {
    return {
      success: false,
      reason: 'rpc_error',
      quota,
      error: error.message,
    }
  }

  const result = Array.isArray(data) ? (data[0] as ScreenshotQuotaRpcRow | undefined) : data as ScreenshotQuotaRpcRow | null
  if (!result?.success) {
    return {
      success: false,
      reason: 'exhausted',
      quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
    }
  }

  return {
    success: true,
    bucket: result.bucket === 'paid' ? 'paid' : 'free',
    quota: withQuotaUsage(quota, result.free_used, result.paid_used),
  }
}
