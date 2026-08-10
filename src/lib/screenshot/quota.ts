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

export type ReserveScreenshotQuotaResult =
  | { success: true; requestId: string; bucket: 'free' | 'paid'; quota: ScreenshotQuotaState }
  | { success: false; requestId: string; reason: 'exhausted' | 'existing' | 'rpc_error'; quota: ScreenshotQuotaState; error?: string }

export type ReserveScreenshotRecognitionLeaseResult =
  | { success: true; requestId: string; bucket: 'free' | 'paid'; quota: ScreenshotQuotaState }
  | { success: false; requestId: string; reason: 'exhausted' | 'existing' | 'rpc_error'; quota: ScreenshotQuotaState; error?: string }

export type CompleteScreenshotRecognitionAttemptResult =
  | { success: true; requestId: string; quota: ScreenshotQuotaState }
  | { success: false; requestId: string; reason: 'rpc_error' | 'not_found' | 'not_reserved'; quota: ScreenshotQuotaState; error?: string }

export type ReleaseScreenshotRecognitionLeaseResult =
  | { success: true; requestId: string }
  | { success: false; requestId: string; reason: 'rpc_error' | 'not_found'; error?: string }

export type FinalizeScreenshotRecognitionResult =
  | { success: true; requestId: string; checkinId: string; quota: ScreenshotQuotaState }
  | { success: false; requestId: string; reason: 'rpc_error' | 'not_found' | 'pending' | 'not_ready' | 'expired' | 'legacy_consumed' | 'exhausted'; quota: ScreenshotQuotaState; error?: string }

export type CompleteScreenshotQuotaAttemptResult =
  | { success: true; requestId: string; quota: ScreenshotQuotaState }
  | { success: false; requestId: string; reason: 'rpc_error' | 'not_found' | 'not_reserved'; quota: ScreenshotQuotaState; error?: string }

export type RefundScreenshotQuotaAttemptResult =
  | { success: true; requestId: string; reason: null | 'already_refunded'; quota: ScreenshotQuotaState }
  | { success: false; requestId: string; reason: 'rpc_error' | 'not_found' | 'not_reserved'; quota: ScreenshotQuotaState; error?: string }

type ScreenshotQuotaRpcRow = {
  success: boolean | null
  reason: string | null
  bucket: string | null
  free_used: number | null
  paid_used: number | null
  request_id?: string | null
  checkin_id?: string | null
}

type ScreenshotRecognitionReplayRpcRow = {
  found: boolean | null
  status: string | null
  recognition_result: unknown
}

export type ScreenshotRecognitionReplay =
  | { success: true; kind: 'missing' }
  | { success: true; kind: 'pending' }
  | { success: true; kind: 'completed'; recognition: unknown }
  | { success: true; kind: 'result_unavailable' }
  | { success: true; kind: 'refunded' }
  | { success: false; reason: 'rpc_error'; error?: string }

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

function withQuotaUsage(
  quota: ScreenshotQuotaState,
  freeUsed: number | null | undefined,
  paidUsed: number | null | undefined,
): ScreenshotQuotaState {
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

export async function reserveScreenshotRecognitionLease(
  supabase: SupabaseClient,
  userId: string,
  quota: ScreenshotQuotaState,
  requestId: string,
): Promise<ReserveScreenshotRecognitionLeaseResult> {
  const { data, error } = await supabase.rpc('reserve_screenshot_recognition_lease', {
    p_user_id: userId,
    p_month_key: quota.monthKey,
    p_free_limit: quota.freeLimit,
    p_paid_limit: quota.paidLimit,
    p_request_id: requestId,
  })

  if (error) {
    return { success: false, requestId, reason: 'rpc_error', quota, error: error.message }
  }

  const result = Array.isArray(data) ? (data[0] as ScreenshotQuotaRpcRow | undefined) : data as ScreenshotQuotaRpcRow | null
  if (!result?.success) {
    const reason = result?.reason === 'existing'
        ? 'existing'
        : 'exhausted'
    return {
      success: false,
      requestId,
      reason,
      quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
    }
  }

  return {
    success: true,
    requestId,
    bucket: result.bucket === 'paid' ? 'paid' : 'free',
    quota: withQuotaUsage(quota, result.free_used, result.paid_used),
  }
}

export async function completeScreenshotRecognitionAttempt(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
  quota: ScreenshotQuotaState,
  recognitionResult: unknown,
): Promise<CompleteScreenshotRecognitionAttemptResult> {
  const { data, error } = await supabase.rpc('complete_screenshot_recognition_attempt', {
    p_user_id: userId,
    p_request_id: requestId,
    p_recognition_result: recognitionResult,
  })

  if (error) return { success: false, requestId, reason: 'rpc_error', quota, error: error.message }
  const result = Array.isArray(data) ? (data[0] as ScreenshotQuotaRpcRow | undefined) : data as ScreenshotQuotaRpcRow | null
  if (!result?.success) {
    return {
      success: false,
      requestId,
      reason: result?.reason === 'not_found' ? 'not_found' : 'not_reserved',
      quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
    }
  }
  return { success: true, requestId, quota: withQuotaUsage(quota, result.free_used, result.paid_used) }
}

export async function releaseScreenshotRecognitionLease(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<ReleaseScreenshotRecognitionLeaseResult> {
  const { data, error } = await supabase.rpc('release_screenshot_recognition_lease', {
    p_user_id: userId,
    p_request_id: requestId,
  })
  if (error) return { success: false, requestId, reason: 'rpc_error', error: error.message }
  const result = Array.isArray(data) ? data[0] as { success?: boolean; reason?: string | null } | undefined : data as { success?: boolean; reason?: string | null } | null
  if (!result?.success && result?.reason === 'not_found') return { success: false, requestId, reason: 'not_found' }
  if (!result?.success) return { success: false, requestId, reason: 'rpc_error' }
  return { success: true, requestId }
}

export async function finalizeScreenshotRecognition(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
  quota: ScreenshotQuotaState,
  checkinPayload: Record<string, unknown>,
): Promise<FinalizeScreenshotRecognitionResult> {
  const { data, error } = await supabase.rpc('finalize_screenshot_recognition', {
    p_user_id: userId,
    p_month_key: quota.monthKey,
    p_free_limit: quota.freeLimit,
    p_paid_limit: quota.paidLimit,
    p_request_id: requestId,
    p_checkin_payload: checkinPayload,
  })
  if (error) return { success: false, requestId, reason: 'rpc_error', quota, error: error.message }
  const result = Array.isArray(data) ? (data[0] as ScreenshotQuotaRpcRow | undefined) : data as ScreenshotQuotaRpcRow | null
  if (!result?.success || !result.checkin_id) {
    const reason = result?.reason === 'not_found'
      ? 'not_found'
      : result?.reason === 'pending'
        ? 'pending'
        : result?.reason === 'not_ready'
          ? 'not_ready'
          : result?.reason === 'expired'
            ? 'expired'
          : result?.reason === 'legacy_consumed'
            ? 'legacy_consumed'
            : result?.reason === 'exhausted'
              ? 'exhausted'
              : 'rpc_error'
    return {
      success: false,
      requestId,
      reason,
      quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
    }
  }
  return {
    success: true,
    requestId,
    checkinId: result.checkin_id,
    quota: withQuotaUsage(quota, result.free_used, result.paid_used),
  }
}

export async function reserveScreenshotQuota(
  supabase: SupabaseClient,
  userId: string,
  quota: ScreenshotQuotaState,
  requestId: string
): Promise<ReserveScreenshotQuotaResult> {
  const { data, error } = await supabase.rpc('reserve_screenshot_quota_attempt', {
    p_user_id: userId,
    p_month_key: quota.monthKey,
    p_free_limit: quota.freeLimit,
    p_paid_limit: quota.paidLimit,
    p_request_id: requestId,
  })

  if (error) {
    return {
      success: false,
      requestId,
      reason: 'rpc_error',
      quota,
      error: error.message,
    }
  }

  const result = Array.isArray(data) ? (data[0] as ScreenshotQuotaRpcRow | undefined) : data as ScreenshotQuotaRpcRow | null
  if (!result?.success) {
    return {
      success: false,
      requestId,
      reason: result?.reason === 'existing' ? 'existing' : 'exhausted',
      quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
    }
  }

  return {
    success: true,
    requestId,
    bucket: result.bucket === 'paid' ? 'paid' : 'free',
    quota: withQuotaUsage(quota, result.free_used, result.paid_used),
  }
}

export async function completeScreenshotQuotaAttempt(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
  quota: ScreenshotQuotaState,
  recognitionResult: unknown,
): Promise<CompleteScreenshotQuotaAttemptResult> {
  const { data, error } = await supabase.rpc('complete_screenshot_quota_attempt', {
    p_user_id: userId,
    p_request_id: requestId,
    p_recognition_result: recognitionResult,
  })

  if (error) {
    return {
      success: false,
      requestId,
      reason: 'rpc_error',
      quota,
      error: error.message,
    }
  }

  const result = Array.isArray(data) ? (data[0] as ScreenshotQuotaRpcRow | undefined) : data as ScreenshotQuotaRpcRow | null
  if (!result?.success) {
    return {
      success: false,
      requestId,
      reason: result?.reason === 'not_found' ? 'not_found' : 'not_reserved',
      quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
    }
  }

  return {
    success: true,
    requestId,
    quota: withQuotaUsage(quota, result.free_used, result.paid_used),
  }
}

export async function getScreenshotRecognitionReplay(
  supabase: SupabaseClient,
  requestId: string,
): Promise<ScreenshotRecognitionReplay> {
  const { data, error } = await supabase.rpc('get_screenshot_recognition_replay', {
    p_request_id: requestId,
  })

  if (error) {
    return { success: false, reason: 'rpc_error', error: error.message }
  }

  const result = Array.isArray(data) ? (data[0] as ScreenshotRecognitionReplayRpcRow | undefined) : data as ScreenshotRecognitionReplayRpcRow | null
  if (!result?.found) return { success: true, kind: 'missing' }
  if (result.status === 'reserved') return { success: true, kind: 'pending' }
  if (result.status === 'refunded') return { success: true, kind: 'refunded' }
  if (['recognized', 'consumed'].includes(result.status ?? '') && result.recognition_result) {
    return { success: true, kind: 'completed', recognition: result.recognition_result }
  }

  return { success: true, kind: 'result_unavailable' }
}

export async function refundScreenshotQuotaAttempt(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
  quota: ScreenshotQuotaState
): Promise<RefundScreenshotQuotaAttemptResult> {
  const { data, error } = await supabase.rpc('refund_screenshot_quota_attempt', {
    p_user_id: userId,
    p_request_id: requestId,
  })

  if (error) {
    return {
      success: false,
      requestId,
      reason: 'rpc_error',
      quota,
      error: error.message,
    }
  }

  const result = Array.isArray(data) ? (data[0] as ScreenshotQuotaRpcRow | undefined) : data as ScreenshotQuotaRpcRow | null
  if (!result?.success) {
    return {
      success: false,
      requestId,
      reason: result?.reason === 'not_found' ? 'not_found' : 'not_reserved',
      quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
    }
  }

  return {
    success: true,
    requestId,
    reason: result?.reason === 'already_refunded' ? 'already_refunded' : null,
    quota: withQuotaUsage(quota, result?.free_used, result?.paid_used),
  }
}
