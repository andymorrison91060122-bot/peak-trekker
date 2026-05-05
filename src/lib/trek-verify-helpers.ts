import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { haversineMeters } from '@/lib/trek-utils'
import type { createSupabaseServerClient } from '@/lib/supabase-server'
import type { Mountain } from '@/types'

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type TrekVerifySessionRecord = {
  id: string
  user_id: string
  mountain_id: string | null
  status: string
  started_at: string
  track_points: unknown
  track_summary: unknown
  distance_m: number | null
  ascent_m: number | null
  descent_m: number | null
  max_altitude_m: number | null
}

export type TrekVerifyRecordRpcRow = {
  checkin_id?: string | null
  duplicated?: boolean | null
}

type StatsRpcError = {
  message?: string | null
  code?: string | null
  details?: string | null
  hint?: string | null
}

type VerifyMountain = Mountain & { summit_radius_m?: number | null }

export type TrekVerifyFailureReason =
  | 'insufficient_track_points'
  | 'session_too_short'
  | 'mountain_id_required'
  | 'no_active_mountains'
  | 'outside_summit_radius'

export const TREK_VERIFY_SESSION_SELECT =
  'id, user_id, mountain_id, status, started_at, track_points, track_summary, distance_m, ascent_m, descent_m, max_altitude_m'

const MOUNTAIN_VERIFY_SELECT_FULL = 'id, name, altitude, latitude, longitude, difficulty, summit_radius_m, province'
const MOUNTAIN_VERIFY_SELECT_FALLBACK = 'id, name, altitude, latitude, longitude, difficulty, province'

function normalizeMountainRecord(value: unknown) {
  if (Array.isArray(value)) return (value[0] ?? null) as VerifyMountain | null
  return (value as VerifyMountain | null) ?? null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
}

export async function fetchMountainForVerification(supabase: ServerSupabaseClient, mountainId: string) {
  let result = (await supabase
    .from('mountains')
    .select(MOUNTAIN_VERIFY_SELECT_FULL)
    .eq('id', mountainId)
    .single()) as {
    data: VerifyMountain | null
    error: { message?: string | null } | null
  }

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    console.warn('fetchMountainForVerification schema compatibility fallback triggered', {
      mountainId,
      error: result.error.message,
    })
    result = (await supabase
      .from('mountains')
      .select(MOUNTAIN_VERIFY_SELECT_FALLBACK)
      .eq('id', mountainId)
      .single()) as {
      data: VerifyMountain | null
      error: { message?: string | null } | null
    }
  }

  return {
    data: normalizeMountainRecord(result.data),
    error: result.error,
  }
}

export async function listActiveMountainsForVerification(supabase: ServerSupabaseClient) {
  let result = (await supabase
    .from('mountains')
    .select(MOUNTAIN_VERIFY_SELECT_FULL)
    .eq('is_active', true)) as {
    data: VerifyMountain[] | null
    error: { message?: string | null } | null
  }

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    console.warn('listActiveMountainsForVerification schema compatibility fallback triggered', {
      error: result.error.message,
    })
    result = (await supabase
      .from('mountains')
      .select(MOUNTAIN_VERIFY_SELECT_FALLBACK)
      .eq('is_active', true)) as {
      data: VerifyMountain[] | null
      error: { message?: string | null } | null
    }
  }

  return {
    data: (result.data ?? []) as VerifyMountain[],
    error: result.error,
  }
}

const OPTIONAL_CHECKIN_COLUMNS = [
  'source',
  'session_id',
  'verified_at',
  'verification_distance_m',
  'ranking_weight',
  'review_note',
  'admin_note',
] as const

export async function insertCheckinWithFallback(
  supabase: ServerSupabaseClient,
  payload: Record<string, unknown>,
  selectClause: string
) {
  let currentPayload = { ...payload }
  let lastResult: {
    data: Record<string, unknown> | null
    error: { message?: string | null } | null
  } | null = null

  for (let attempt = 0; attempt <= OPTIONAL_CHECKIN_COLUMNS.length; attempt += 1) {
    const result = await supabase.from('checkins').insert(currentPayload).select(selectClause).single()
    lastResult = result as {
      data: Record<string, unknown> | null
      error: { message?: string | null } | null
    }

    if (!result.error || !result.error.message) {
      return result
    }

    const missingColumn = OPTIONAL_CHECKIN_COLUMNS.find((column) =>
      result.error?.message.includes(`'${column}' column`)
    )

    if (!missingColumn || !(missingColumn in currentPayload)) {
      return result
    }

    console.warn('checkin insert schema compatibility fallback removed optional column', {
      missingColumn,
      error: result.error.message,
    })

    const nextPayload = { ...currentPayload }
    delete nextPayload[missingColumn]
    currentPayload = nextPayload
  }

  return lastResult as never
}

export async function updateVerificationStats({
  supabase,
  mountain,
  userId,
}: {
  supabase: ServerSupabaseClient
  mountain: VerifyMountain
  userId: string
}) {
  const statsCalls = [
    {
      name: 'increment_checkin_count',
      result: supabase.rpc('increment_checkin_count', { mid: mountain.id }),
    },
    {
      name: 'increment_user_stats',
      result: supabase.rpc('increment_user_stats', { uid: userId, alt: mountain.altitude }),
    },
    ...(mountain.province
      ? [
          {
            name: 'increment_province_score',
            result: supabase.rpc('increment_province_score', { pname: mountain.province }),
          },
        ]
      : []),
  ] as const

  const settled = await Promise.allSettled(
    statsCalls.map(async (call) => {
      const { error } = await call.result
      return { name: call.name, error: error as StatsRpcError | null }
    })
  )

  const failures = settled.flatMap((result, index) => {
    if (result.status === 'rejected') {
      return [{ name: statsCalls[index]?.name ?? 'unknown_stats_rpc', error: result.reason }]
    }
    return result.value.error ? [result.value] : []
  })

  if (failures.length > 0) {
    console.error('Trek verification stats update failed', failures)
  }

  return failures.length > 0
}

export function resolveNearestMountainForVerification({
  mountains,
  lat,
  lng,
}: {
  mountains: VerifyMountain[]
  lat: number
  lng: number
}) {
  return [...mountains]
    .map((candidate) => ({
      mountain: candidate,
      distanceM: haversineMeters(lat, lng, candidate.latitude, candidate.longitude),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)[0] ?? null
}

export async function recordServerVerifyFailure({
  supabase,
  session,
  reason,
  detail,
}: {
  supabase: ServerSupabaseClient
  session: TrekVerifySessionRecord | null
  reason: TrekVerifyFailureReason
  detail?: string
}) {
  if (!session) return

  const trackSummary = asRecord(session.track_summary)
  const { error } = await supabase
    .from('trek_sessions')
    .update({
      verify_state: 'failed',
      track_summary: {
        ...trackSummary,
        last_verify_error: reason,
        last_verify_detail: detail ?? null,
        last_verify_failed_at: new Date().toISOString(),
      },
    })
    .eq('id', session.id)
    .eq('user_id', session.user_id)

  if (error) {
    console.warn('Failed to record trek verify failure state', {
      sessionId: session.id,
      reason,
      error: error.message,
    })
  }
}
