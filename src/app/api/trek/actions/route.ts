import { NextRequest, NextResponse } from 'next/server'
import { assertActivityUpdatePolicy } from '@/lib/activity-field-policy'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { TREK_RULES } from '@/lib/trek-rules-server'
import { isTrekServerDevBypassAllowed, resolveTrekServerVerificationRules } from '@/lib/trek-verification-rules'
import { syncUserLicenseLevel } from '@/lib/license-progress'
import {
  ALLOW_LOCAL_TREK_SESSION,
  LOCAL_FALLBACK_SESSION_PREFIX,
  isLocalFallbackSessionId,
  isLocalTrekSessionId,
} from '@/lib/trek-server-utils'
import { rankingWeightByDifficulty, resolveCheckinSource, safeTrackPoints } from '@/lib/trek-utils'
import { normalizeAppendTrackPoint, summarizeTrekTrackPoints, TREK_APPEND_BATCH_LIMIT } from '@/lib/trek-track-metrics'
import {
  TREK_VERIFY_SESSION_SELECT,
  fetchMountainForVerification,
  insertCheckinWithFallback,
  listActiveMountainsForVerification,
  recordServerVerifyFailure,
  resolveNearestMountainForVerification,
  resolveSummitEvidencePoint,
  updateVerificationStats,
  type TrekVerifyRecordRpcRow,
  type TrekVerifySessionRecord,
} from '@/lib/trek-verify-helpers'
import type { ShareAnchorPosition, ShareCardTemplate, ShareRenderMode } from '@/types'

type ActionName =
  | 'list_active_mountains'
  | 'start_trek_session'
  | 'get_in_progress_trek_session'
  | 'pause_trek_session'
  | 'resume_trek_session'
  | 'finish_trek_session'
  | 'finish_incomplete_trek'
  | 'append_trek_point'
  | 'append_trek_points'
  | 'verify_summit_checkin'
  | 'submit_historical_checkin'
  | 'generate_share_card'

const SHARE_TEMPLATES: ShareCardTemplate[] = ['trek_snapshot', 'summit_card', 'activity_summary']
const SHARE_RENDER_MODES: ShareRenderMode[] = ['photo_composite', 'overlay_only', 'classic_card']
const MIN_INCOMPLETE_TREK_SECONDS = 60
const TREK_RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_TREK_PAUSE_ELAPSED_SECONDS = Math.floor(TREK_RESTORE_WINDOW_MS / 1000)
const SERVER_SUMMIT_VERIFY_RADIUS_M = 300
const TREK_ACTION_GENERIC_ERROR = '操作暂时没有完成，请稍后重试。'
const TREK_SESSION_GENERIC_ERROR = '记录会话暂时无法同步，请稍后重试。'
const TREK_CHECKIN_SAVE_ERROR = '山行记录暂时没有保存成功，请稍后重试。'

function logTrekActionFailure(stage: string, error: unknown) {
  console.error(`[trek-actions] ${stage}`, error)
}

function trekActionErrorResponse(stage: string, error: unknown, status = 500, message = TREK_ACTION_GENERIC_ERROR) {
  logTrekActionFailure(stage, error)
  return NextResponse.json({ error: message }, { status })
}

function isRequestedTrekTestMode(value: unknown) {
  return value === true || value === '1'
}

function toSafeNote(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 240)
}

function toSafePhotoUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 2048) : null
}

async function persistSummitPhotoUrl({
  checkinId,
  userId,
  photoUrl,
}: {
  checkinId: string
  userId: string
  photoUrl: string | null
}) {
  if (!photoUrl) return null

  const update = { photo_url: photoUrl }
  assertActivityUpdatePolicy(update, { allowedFields: ['photo_url'] })

  const result = await (async () => {
    try {
      return await createSupabaseAdminClient()
        .from('checkins')
        .update(update)
        .eq('id', checkinId)
        .eq('user_id', userId)
        .select('id')
        .single()
    } catch (error) {
      return {
        data: null,
        error,
      }
    }
  })()

  if (result.error || !result.data) {
    logTrekActionFailure('persist summit photo failed', result.error)
    return {
      error: '登顶照保存失败，请稍后重试。',
    }
  }

  return null
}

function finiteNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function durationFromStart(startedAt: unknown, endedAt: number) {
  const startedAtMs = typeof startedAt === 'number' ? startedAt : new Date(String(startedAt ?? '')).getTime()
  if (!Number.isFinite(startedAtMs)) return null
  return Math.max(0, Math.floor((endedAt - startedAtMs) / 1000))
}

function clampTrekPauseElapsedSeconds(value: unknown) {
  const numberValue = finiteNumber(value)
  if (numberValue === null) return null
  return Math.min(MAX_TREK_PAUSE_ELAPSED_SECONDS, Math.max(0, Math.floor(numberValue)))
}

function isCheckinSessionUniqueViolation(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: unknown; message?: unknown }
  return (
    record.code === '23505' ||
    (typeof record.message === 'string' && record.message.includes('idx_checkins_session_id_unique_not_null'))
  )
}

function summarizeTrackPoints(points: Array<{ altitude: number | null; ts: number }>) {
  const altitudes = points.flatMap((point) => (typeof point.altitude === 'number' ? [point.altitude] : []))
  const firstTs = points[0]?.ts ?? null
  const lastTs = points.at(-1)?.ts ?? null
  return {
    minAltitudeM: altitudes.length ? Math.round(Math.min(...altitudes)) : null,
    maxAltitudeM: altitudes.length ? Math.round(Math.max(...altitudes)) : null,
    startTime: typeof firstTs === 'number' ? new Date(firstTs).toISOString() : null,
    endTime: typeof lastTs === 'number' ? new Date(lastTs).toISOString() : null,
  }
}

type AppendTrekPointsRpcRow = {
  accepted_ids?: string[] | null
  rejected_ids?: string[] | null
  point_count?: number | null
  distance_m?: number | null
  ascent_m?: number | null
  descent_m?: number | null
  max_altitude_m?: number | null
}

function rejectablePointId(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    ? id
    : null
}

function ensureAppendPointIdentity(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const raw = value as Record<string, unknown>
  const ts = Number.isFinite(Number(raw.ts)) ? Number(raw.ts) : Date.now()
  return {
    ...raw,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().toLowerCase() : crypto.randomUUID(),
    ts,
    captureSeq: Number.isFinite(Number(raw.captureSeq)) ? Number(raw.captureSeq) : ts,
  }
}

function normalizeAppendPointsPayload(action: ActionName, body: Record<string, unknown>): unknown[] | null {
  const rawPoints =
    action === 'append_trek_points'
      ? Array.isArray(body?.points)
        ? body.points
        : null
      : [ensureAppendPointIdentity(body?.point)]

  if (!rawPoints || rawPoints.length > TREK_APPEND_BATCH_LIMIT) return null
  return rawPoints
}

function summarizeLocalAppendPoints(points: unknown[]) {
  const acceptedPoints = points.flatMap((point) => {
    const normalized = normalizeAppendTrackPoint(point)
    return normalized ? [normalized] : []
  })
  const acceptedIds = acceptedPoints.map((point) => point.id).filter(Boolean) as string[]
  const rejectedIds = points
    .map(rejectablePointId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => !acceptedIds.includes(id))
  return {
    acceptedPoints,
    acceptedIds,
    rejectedIds: Array.from(new Set(rejectedIds)),
    summary: summarizeTrekTrackPoints(acceptedPoints),
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = body?.action as ActionName | undefined

  if (!action) {
    return NextResponse.json({ error: '操作类型不完整，请重新打开页面后再试。' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    if (authError) logTrekActionFailure('auth failed', authError)
    return NextResponse.json({ error: '登录后即可记录山行。' }, { status: 401 })
  }

  if (action === 'list_active_mountains') {
    const { data: mountains, error } = await supabase
      .from('mountains')
      .select('*')
      .eq('is_active', true)
      .eq('entity_type', 'mountain')
      .order('checkin_count', { ascending: false })

    if (error) {
      return trekActionErrorResponse('list active mountains failed', error, 500, '山峰列表暂时不可用，请稍后重试。')
    }

    return NextResponse.json({
      ok: true,
      mountains: mountains ?? [],
    })
  }

  if (action === 'get_in_progress_trek_session') {
    const { data: session, error } = await supabase
      .from('trek_sessions')
      .select('id, mountain_id, status, started_at, paused_at, paused_elapsed_seconds, track_points, distance_m, ascent_m, max_altitude_m')
      .eq('user_id', user.id)
      .in('status', ['tracking', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return trekActionErrorResponse('load in-progress session failed', error, 500, TREK_SESSION_GENERIC_ERROR)
    }

    if (!session) {
      return NextResponse.json({ ok: true, session: null })
    }

    const isPausedSession = session.status === 'paused'
    const startedAtMs = new Date(String(session.started_at ?? '')).getTime()
    if (!Number.isFinite(startedAtMs)) {
      return NextResponse.json({
        ok: true,
        session: null,
        ignoredReason: 'invalid_started_at',
      })
    }

    const pausedAtMs = isPausedSession ? new Date(String(session.paused_at ?? '')).getTime() : null
    if (isPausedSession && !Number.isFinite(pausedAtMs)) {
      return NextResponse.json({
        ok: true,
        session: null,
        ignoredReason: 'invalid_paused_at',
      })
    }

    const freshnessAnchorMs = isPausedSession ? pausedAtMs : startedAtMs
    if (Date.now() - Number(freshnessAnchorMs) > TREK_RESTORE_WINDOW_MS) {
      return NextResponse.json({
        ok: true,
        session: null,
        ignoredReason: 'stale',
      })
    }

    return NextResponse.json({
      ok: true,
      session: {
        sessionId: session.id,
        mountainId: session.mountain_id ?? null,
        status: isPausedSession ? 'paused' : 'tracking',
        startedAt: session.started_at,
        pausedAt: session.paused_at ?? null,
        pausedElapsedSeconds: clampTrekPauseElapsedSeconds(session.paused_elapsed_seconds),
        trackPoints: safeTrackPoints(session.track_points),
        distanceM: Math.round(Number(session.distance_m ?? 0)),
        ascentM: Math.round(Number(session.ascent_m ?? 0)),
        maxAltitudeM: finiteNumber(session.max_altitude_m),
      },
    })
  }

  if (action === 'start_trek_session') {
    const mountainId = typeof body?.mountainId === 'string' ? body.mountainId : null

    if (mountainId) {
      const { data: mountain, error } = await supabase
        .from('mountains')
        .select('id, entity_type')
        .eq('id', mountainId)
        .eq('is_active', true)
        .eq('entity_type', 'mountain')
        .single()
      if (error || !mountain) {
        if (error) logTrekActionFailure('validate start mountain failed', error)
        return NextResponse.json({ error: '请选择有效的山峰。' }, { status: 400 })
      }
    }

    const finishActiveSessions = await supabase
      .from('trek_sessions')
      .update({
        status: 'finished',
        ended_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('status', 'tracking')

    if (finishActiveSessions.error && !isSchemaCompatibilityErrorMessage(finishActiveSessions.error.message)) {
      return trekActionErrorResponse('finish active sessions before start failed', finishActiveSessions.error, 500, TREK_SESSION_GENERIC_ERROR)
    }

    const { data: session, error } = await supabase
      .from('trek_sessions')
      .insert({
        user_id: user.id,
        mountain_id: mountainId,
        status: 'tracking',
        verify_state: 'pending',
        started_at: new Date().toISOString(),
        track_points: [],
        track_summary: {
          distance_m: 0,
          ascent_m: 0,
          descent_m: 0,
          max_altitude_m: 0,
          point_count: 0,
        },
        distance_m: 0,
        ascent_m: 0,
        descent_m: 0,
        max_altitude_m: 0,
      })
      .select('id, started_at')
      .single()

    if (error || !session) {
      if (isSchemaCompatibilityErrorMessage(error?.message)) {
        // Temporary fallback for stale schema environments. Production schema should be aligned;
        // keep a warning so a hidden migration drift cannot stay silent.
        console.warn('start_trek_session schema compatibility fallback triggered', {
          userId: user.id,
          error: error?.message,
        })
        return NextResponse.json({
          ok: true,
          sessionId: `${LOCAL_FALLBACK_SESSION_PREFIX}${crypto.randomUUID()}`,
          startedAt: new Date().toISOString(),
          fallback: 'client',
        })
      }
      return trekActionErrorResponse('start session failed', error, 500, TREK_SESSION_GENERIC_ERROR)
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      startedAt: session.started_at,
    })
  }

  if (action === 'append_trek_point' || action === 'append_trek_points') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
    const points = normalizeAppendPointsPayload(action, body as Record<string, unknown>)

    if (!sessionId || !points) {
      return NextResponse.json({ error: 'invalid point payload' }, { status: 400 })
    }

    if (points.length > TREK_APPEND_BATCH_LIMIT) {
      return NextResponse.json({ error: 'point batch too large' }, { status: 413 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)

    if (isFallbackSession || isTestLocalSession) {
      if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
        return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
      }
      const { acceptedIds, rejectedIds, summary } = summarizeLocalAppendPoints(points)
      return NextResponse.json({
        ok: true,
        fallback: 'client',
        acceptedIds,
        rejectedIds,
        pointCount: summary.pointCount,
        summary,
      })
    }

    const { data: appendResult, error: appendError } = await supabase
      .rpc('append_trek_points', {
        p_session_id: sessionId,
        p_points: points,
      })
      .single()

    if (appendError || !appendResult) {
      const message = appendError?.message ?? 'append trek points failed'
      const status = message.includes('not found') || message.includes('forbidden')
        ? 404
        : message.includes('not tracking')
          ? 409
          : message.includes('cap exceeded') || message.includes('batch too large')
            ? 413
            : message.includes('invalid point')
              ? 400
              : 500
      logTrekActionFailure('append trek points failed', appendError ?? message)
      const displayMessage = message.includes('not found') || message.includes('forbidden')
        ? 'session not found'
        : message.includes('not tracking')
          ? 'session is not tracking'
          : message.includes('cap exceeded') || message.includes('batch too large')
            ? 'batch too large'
            : message.includes('invalid point')
              ? 'invalid point payload'
              : TREK_SESSION_GENERIC_ERROR
      return NextResponse.json({ error: displayMessage }, { status })
    }

    const row = appendResult as AppendTrekPointsRpcRow
    const acceptedIds = Array.isArray(row.accepted_ids) ? row.accepted_ids : []
    const rejectedIds = Array.isArray(row.rejected_ids) ? row.rejected_ids : []
    const distanceM = Math.round(Number(row.distance_m ?? 0))
    const ascentM = Math.round(Number(row.ascent_m ?? 0))
    const descentM = Math.round(Number(row.descent_m ?? 0))
    const maxAltitudeM = Number.isFinite(Number(row.max_altitude_m)) ? Math.round(Number(row.max_altitude_m)) : null

    return NextResponse.json({
      ok: true,
      accepted: acceptedIds.length > 0,
      acceptedIds,
      rejectedIds,
      pointCount: Number(row.point_count ?? 0),
      summary: {
        distanceM,
        ascentM,
        descentM,
        maxAltitudeM,
      },
    })
  }

  if (action === 'pause_trek_session') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)

    if (isFallbackSession || isTestLocalSession) {
      if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
        return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
      }
      return NextResponse.json({ ok: true, fallback: 'client', sessionId, status: 'paused' })
    }

    const { data: session, error: sessionError } = await supabase
      .from('trek_sessions')
      .select('id, user_id, status, started_at, paused_at, paused_elapsed_seconds')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (session.status === 'paused') {
      return NextResponse.json({
        ok: true,
        sessionId,
        status: 'paused',
        pausedAt: session.paused_at ?? null,
        pausedElapsedSeconds: clampTrekPauseElapsedSeconds(session.paused_elapsed_seconds) ?? 0,
        ignored: true,
      })
    }

    if (session.status !== 'tracking') {
      return NextResponse.json({ error: 'session is not tracking' }, { status: 409 })
    }

    const now = Date.now()
    const fallbackElapsedSeconds = durationFromStart(session.started_at, now) ?? 0
    const pausedElapsedSeconds = clampTrekPauseElapsedSeconds(body?.elapsedSeconds) ?? clampTrekPauseElapsedSeconds(fallbackElapsedSeconds) ?? 0
    const pausedAt = new Date(now).toISOString()

    const { error: updateError } = await supabase
      .from('trek_sessions')
      .update({
        status: 'paused',
        paused_at: pausedAt,
        paused_elapsed_seconds: pausedElapsedSeconds,
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'tracking')

    if (updateError) {
      return trekActionErrorResponse('pause session failed', updateError, 500, TREK_SESSION_GENERIC_ERROR)
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      status: 'paused',
      pausedAt,
      pausedElapsedSeconds,
    })
  }

  if (action === 'resume_trek_session') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)

    if (isFallbackSession || isTestLocalSession) {
      if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
        return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
      }
      return NextResponse.json({ ok: true, fallback: 'client', sessionId, status: 'tracking' })
    }

    const { data: session, error: sessionError } = await supabase
      .from('trek_sessions')
      .select('id, user_id, status, started_at, paused_at, paused_elapsed_seconds')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (session.status === 'tracking') {
      return NextResponse.json({
        ok: true,
        sessionId,
        status: 'tracking',
        startedAt: session.started_at,
        ignored: true,
      })
    }

    if (session.status !== 'paused') {
      return NextResponse.json({ error: 'session is not paused' }, { status: 409 })
    }

    const startedAtMs = new Date(String(session.started_at ?? '')).getTime()
    if (!Number.isFinite(startedAtMs)) {
      return NextResponse.json({ error: 'invalid_session_start_time' }, { status: 400 })
    }

    const pausedAtMs = new Date(String(session.paused_at ?? '')).getTime()
    const now = Date.now()
    const pausedDurationMs = Number.isFinite(pausedAtMs) ? Math.max(0, now - pausedAtMs) : 0
    const nextStartedAt = new Date(startedAtMs + pausedDurationMs).toISOString()

    const { error: updateError } = await supabase
      .from('trek_sessions')
      .update({
        status: 'tracking',
        started_at: nextStartedAt,
        paused_at: null,
        paused_elapsed_seconds: null,
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'paused')

    if (updateError) {
      return trekActionErrorResponse('resume session failed', updateError, 500, TREK_SESSION_GENERIC_ERROR)
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      status: 'tracking',
      startedAt: nextStartedAt,
    })
  }

  if (action === 'finish_trek_session') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
    const finalStatus = body?.finalStatus === 'aborted' ? 'aborted' : 'finished'

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)

    if (isFallbackSession || isTestLocalSession) {
      if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
        return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
      }
      return NextResponse.json({ ok: true, fallback: 'client', status: finalStatus })
    }

    const { data: session, error: sessionError } = await supabase
      .from('trek_sessions')
      .select('id, user_id, status')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (session.status === 'summit_verified') {
      return NextResponse.json({ ok: true, sessionId, status: session.status, ignored: true })
    }

    const { error: updateError } = await supabase
      .from('trek_sessions')
      .update({
        status: finalStatus,
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (updateError) {
      return trekActionErrorResponse('finish session failed', updateError, 500, TREK_SESSION_GENERIC_ERROR)
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      status: finalStatus,
    })
  }

  if (action === 'finish_incomplete_trek') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
    const note = toSafeNote(body?.note)
    const mountainId = typeof body?.mountainId === 'string' ? body.mountainId : null
    const endedAtMs = Date.now()

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)
    if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
      return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
    }

    const isLocalSession = isFallbackSession || isTestLocalSession
    const verificationRules = resolveTrekServerVerificationRules({
      requestedTestMode: isRequestedTrekTestMode(body?.testMode),
      isLocalSession,
    })
    const minIncompleteSeconds = isRequestedTrekTestMode(body?.testMode)
      ? Math.min(MIN_INCOMPLETE_TREK_SECONDS, verificationRules.minSessionSeconds)
      : MIN_INCOMPLETE_TREK_SECONDS
    const points = isLocalSession ? safeTrackPoints(body?.trackPoints) : []
    const localStartedAt = finiteNumber(body?.startedAt)
    const localElapsedSeconds = isLocalSession ? finiteNumber(body?.elapsedSeconds) : null

    let session:
      | (TrekVerifySessionRecord & {
          ended_at?: string | null
        })
      | null = null

    if (!isLocalSession) {
      const { data, error } = await supabase
        .from('trek_sessions')
        .select(`${TREK_VERIFY_SESSION_SELECT}, ended_at`)
        .eq('id', sessionId)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'session not found' }, { status: 404 })
      }

      session = data as TrekVerifySessionRecord & { ended_at?: string | null }
      if (session.user_id !== user.id) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }

    const effectivePoints = isLocalSession ? points : safeTrackPoints(session?.track_points)
    const startedAt = isLocalSession ? localStartedAt : new Date(session?.started_at ?? '').getTime()
    const durationSeconds =
      localElapsedSeconds !== null
        ? Math.max(0, Math.floor(localElapsedSeconds))
        : durationFromStart(startedAt, endedAtMs)

    if (durationSeconds === null || durationSeconds < minIncompleteSeconds) {
      if (!isLocalSession && session) {
        await supabase
          .from('trek_sessions')
          .update({
            status: 'aborted',
            ended_at: new Date(endedAtMs).toISOString(),
          })
          .eq('id', session.id)
          .eq('user_id', user.id)
      }
      return NextResponse.json(
        {
          error: 'record_too_short',
          detail: `need at least ${minIncompleteSeconds}s`,
        },
        { status: 422 }
      )
    }

    if (!effectivePoints.length) {
      return NextResponse.json({ error: 'no_track_points' }, { status: 422 })
    }

    const effectiveMountainId = session?.mountain_id ?? mountainId
    if (!effectiveMountainId) {
      return NextResponse.json({ error: 'mountain_id_required' }, { status: 400 })
    }

    const findExistingCheckinForSession = async () => {
      if (isLocalSession) return null
      const { data } = await supabase
        .from('checkins')
        .select('id, completion_status')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      return (data as { id?: string; completion_status?: string | null } | null) ?? null
    }

    const markServerSessionFinished = async () => {
      if (isLocalSession || !session) return
      await supabase
        .from('trek_sessions')
        .update({
          status: 'finished',
          ended_at: new Date(endedAtMs).toISOString(),
        })
        .eq('id', session.id)
        .eq('user_id', user.id)
    }

    const buildAlreadyFinishedResponse = async (existingCheckin: {
      id?: string
      completion_status?: string | null
    }) => {
      await markServerSessionFinished()
      return NextResponse.json({
        ok: true,
        alreadyFinished: true,
        duplicated: true,
        checkinId: existingCheckin.id ?? null,
        completionStatus: existingCheckin.completion_status ?? 'incomplete',
      })
    }

    if (!isLocalSession) {
      const existingCheckin = await findExistingCheckinForSession()
      if (existingCheckin?.id) {
        return buildAlreadyFinishedResponse(existingCheckin)
      }
    }

    const trackSummary = summarizeTrackPoints(effectivePoints)
    const distanceMeters =
      finiteNumber(session?.distance_m) ??
      finiteNumber(body?.distanceMeters) ??
      0
    const ascentMeters =
      finiteNumber(session?.ascent_m) ??
      finiteNumber(body?.ascentMeters) ??
      0
    const descentMeters = finiteNumber(session?.descent_m) ?? 0
    const maxAltitudeMeters =
      finiteNumber(session?.max_altitude_m) ??
      trackSummary.maxAltitudeM

    const { data: finishMountain } = await fetchMountainForVerification(supabase, effectiveMountainId)
    if (
      finishMountain &&
      effectivePoints.length >= verificationRules.minTrackPoints &&
      durationSeconds >= verificationRules.minSessionSeconds
    ) {
      const finishSummitRadius = finishMountain.summit_radius_m ?? TREK_RULES.defaultSummitRadiusM
      const maxVerifyDistanceM = Math.max(finishSummitRadius, SERVER_SUMMIT_VERIFY_RADIUS_M)
      const evidence = resolveSummitEvidencePoint({
        points: effectivePoints,
        mountain: finishMountain,
        maxVerifyDistanceM,
      })

      if (evidence?.insideVerifyRadius) {
        const rankingWeight = rankingWeightByDifficulty(finishMountain.difficulty)
        const now = new Date().toISOString()
        let verifiedCheckin: { id: string; duplicated: boolean }

        if (session) {
          const { data: recordedCheckin, error: recordError } = await supabase
            .rpc('verify_and_record_checkin', {
              p_session_id: session.id,
              p_user_id: user.id,
              p_mountain_id: finishMountain.id,
              p_latitude: evidence.point.lat,
              p_longitude: evidence.point.lng,
              p_note: note,
              p_verified_at: now,
              p_verification_distance_m: Math.round(evidence.distanceM),
              p_ranking_weight: rankingWeight,
            })
            .single()

          const rpcRow = recordedCheckin as TrekVerifyRecordRpcRow | null
          if (recordError || !rpcRow?.checkin_id) {
            return trekActionErrorResponse('record auto verified checkin failed', recordError, 500, TREK_CHECKIN_SAVE_ERROR)
          }

          verifiedCheckin = {
            id: rpcRow.checkin_id,
            duplicated: Boolean(rpcRow.duplicated),
          }
        } else {
          const { data: createdCheckin, error: createError } = await insertCheckinWithFallback(
            supabase,
            {
              user_id: user.id,
              mountain_id: finishMountain.id,
              type: 'gps',
              source: 'realtime_gps',
              completion_status: 'complete',
              latitude: evidence.point.lat,
              longitude: evidence.point.lng,
              note,
              verified_at: now,
              verification_distance_m: Math.round(evidence.distanceM),
              ranking_weight: rankingWeight,
              distance_meters: Math.round(distanceMeters),
              duration_seconds: durationSeconds,
              elevation_gain_meters: Math.round(ascentMeters),
              elevation_loss_meters: Math.round(descentMeters),
              max_elevation_meters: maxAltitudeMeters,
              min_elevation_meters: trackSummary.minAltitudeM,
              start_time: trackSummary.startTime ?? (startedAt ? new Date(startedAt).toISOString() : null),
              end_time: trackSummary.endTime ?? new Date(endedAtMs).toISOString(),
              track_name: `${finishMountain.name} GPS 登顶记录`,
              track_points: effectivePoints,
            },
            'id'
          )

          if (createError || !createdCheckin) {
            return trekActionErrorResponse('create auto verified checkin failed', createError, 500, TREK_CHECKIN_SAVE_ERROR)
          }

          verifiedCheckin = {
            id: (createdCheckin as unknown as { id: string }).id,
            duplicated: false,
          }
        }

        const statsWarning =
          verifiedCheckin.duplicated
            ? false
            : await updateVerificationStats({
                supabase,
                mountain: finishMountain,
                userId: user.id,
              })

        try {
          await syncUserLicenseLevel({
            supabase,
            userId: user.id,
          })
        } catch (error) {
          console.warn('license sync after auto summit verification failed', error)
        }

        return NextResponse.json({
          ok: true,
          checkinId: verifiedCheckin.id,
          completionStatus: 'complete',
          autoVerified: true,
          verificationDistanceM: Math.round(evidence.distanceM),
          rankingWeight,
          ...(statsWarning ? { statsWarning: 'stats_update_failed' } : {}),
          mountain: {
            id: finishMountain.id,
            name: finishMountain.name,
          },
        })
      }
    }

    const lastPoint = effectivePoints.at(-1)!

    const { data: createdCheckin, error: createError } = await insertCheckinWithFallback(
      supabase,
      {
        user_id: user.id,
        mountain_id: effectiveMountainId,
        type: 'gps',
        source: 'realtime_gps',
        completion_status: 'incomplete',
        latitude: lastPoint.lat,
        longitude: lastPoint.lng,
        note,
        ...(isLocalSession ? {} : { session_id: sessionId }),
        ranking_weight: 0,
        distance_meters: Math.round(distanceMeters),
        duration_seconds: durationSeconds,
        elevation_gain_meters: Math.round(ascentMeters),
        elevation_loss_meters: Math.round(descentMeters),
        max_elevation_meters: maxAltitudeMeters,
        min_elevation_meters: trackSummary.minAltitudeM,
        start_time: trackSummary.startTime ?? (startedAt ? new Date(startedAt).toISOString() : null),
        end_time: trackSummary.endTime ?? new Date(endedAtMs).toISOString(),
        track_name: '未完成 Trek 记录',
        track_points: effectivePoints,
      },
      'id, completion_status'
    )

    if (createError || !createdCheckin) {
      if (!isLocalSession && isCheckinSessionUniqueViolation(createError)) {
        const existingCheckin = await findExistingCheckinForSession()
        if (existingCheckin?.id) {
          return buildAlreadyFinishedResponse(existingCheckin)
        }
      }
      return trekActionErrorResponse('save incomplete trek failed', createError, 500, TREK_CHECKIN_SAVE_ERROR)
    }

    await markServerSessionFinished()

    const checkin = createdCheckin as unknown as {
      id: string
      completion_status?: string | null
    }

    return NextResponse.json({
      ok: true,
      checkinId: checkin.id,
      completionStatus: checkin.completion_status ?? 'incomplete',
    })
  }

  if (action === 'verify_summit_checkin') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
    const note = toSafeNote(body?.note)
    const photoUrl = toSafePhotoUrl(body?.photoUrl)

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)
    if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
      return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
    }
    const isLocalSession = isFallbackSession || isTestLocalSession
    const verificationRules = resolveTrekServerVerificationRules({
      requestedTestMode: isRequestedTrekTestMode(body?.testMode),
      isLocalSession,
    })
    const sessionResult = isLocalSession
      ? {
          data: null,
          error: null,
        }
      : await supabase
          .from('trek_sessions')
          .select(TREK_VERIFY_SESSION_SELECT)
          .eq('id', sessionId)
          .single()

    const serverSession = isLocalSession ? null : ((sessionResult.data as TrekVerifySessionRecord | null) ?? null)

    if (!isLocalSession && (sessionResult.error || !serverSession)) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }

    if (serverSession && serverSession.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (serverSession?.status === 'summit_verified') {
      const { data: existing } = await supabase
        .from('checkins')
        .select('id')
        .eq('session_id', serverSession.id)
        .maybeSingle()
      return NextResponse.json({
        ok: true,
        duplicated: true,
        checkinId: existing?.id ?? null,
      })
    }

    const points = isLocalSession ? safeTrackPoints(body?.trackPoints) : safeTrackPoints(serverSession?.track_points)
    if (points.length < verificationRules.minTrackPoints) {
      await recordServerVerifyFailure({
        supabase,
        session: serverSession,
        reason: 'insufficient_track_points',
        detail: `need at least ${verificationRules.minTrackPoints} points`,
      })
      return NextResponse.json(
        { error: 'insufficient_track_points', detail: `need at least ${verificationRules.minTrackPoints} points` },
        { status: 422 }
      )
    }

    const startedAt = isLocalSession ? Number(body?.startedAt) : new Date(serverSession?.started_at ?? '').getTime()
    if (!Number.isFinite(startedAt)) {
      return NextResponse.json({ error: 'invalid_session_start_time' }, { status: 400 })
    }
    const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    if (durationSeconds < verificationRules.minSessionSeconds) {
      await recordServerVerifyFailure({
        supabase,
        session: serverSession,
        reason: 'session_too_short',
        detail: `need at least ${verificationRules.minSessionSeconds}s`,
      })
      return NextResponse.json(
        { error: 'session_too_short', detail: `need at least ${verificationRules.minSessionSeconds}s` },
        { status: 422 }
      )
    }

    const explicitMountainId = typeof body?.mountainId === 'string' ? body.mountainId : null
    const targetMountainId = explicitMountainId ?? serverSession?.mountain_id ?? null
    const targetMountain = isLocalSession
      ? targetMountainId
        ? (await fetchMountainForVerification(supabase, targetMountainId)).data
        : null
      : targetMountainId
        ? (await fetchMountainForVerification(supabase, targetMountainId)).data
        : null

    let mountain = targetMountain
    if (!mountain) {
      const canUseNearestMountainFallback =
        ALLOW_LOCAL_TREK_SESSION ||
        isTrekServerDevBypassAllowed({
          requestedTestMode: isRequestedTrekTestMode(body?.testMode),
          isLocalSession,
        })

      if (!canUseNearestMountainFallback) {
        await recordServerVerifyFailure({
          supabase,
          session: serverSession,
          reason: 'mountain_id_required',
        })
        return NextResponse.json({ error: 'mountain_id_required' }, { status: 400 })
      }

      const { data: allMountains } = await listActiveMountainsForVerification(supabase)

      if (!allMountains?.length) {
        await recordServerVerifyFailure({
          supabase,
          session: serverSession,
          reason: 'no_active_mountains',
        })
        return NextResponse.json({ error: 'no_active_mountains' }, { status: 500 })
      }

      const last = points.at(-1)!
      const nearest = resolveNearestMountainForVerification({
        mountains: allMountains,
        lat: last.lat,
        lng: last.lng,
      })

      if (!nearest) {
        await recordServerVerifyFailure({
          supabase,
          session: serverSession,
          reason: 'no_active_mountains',
        })
        return NextResponse.json({ error: 'no_active_mountains' }, { status: 500 })
      }

      mountain = nearest.mountain
      console.warn('nearest mountain fallback triggered', {
        lat: last.lat,
        lng: last.lng,
        nearestId: mountain.id,
        distanceM: Math.round(nearest.distanceM),
      })
    }

    const summitRadius = mountain.summit_radius_m ?? TREK_RULES.defaultSummitRadiusM
    const maxVerifyDistance = Math.max(summitRadius, SERVER_SUMMIT_VERIFY_RADIUS_M)
    const evidence = resolveSummitEvidencePoint({
      points,
      mountain,
      maxVerifyDistanceM: maxVerifyDistance,
    })

    if (!evidence) {
      await recordServerVerifyFailure({
        supabase,
        session: serverSession,
        reason: 'insufficient_track_points',
        detail: 'no valid summit evidence point',
      })
      return NextResponse.json({ error: 'insufficient_track_points', detail: 'no valid summit evidence point' }, { status: 422 })
    }

    if (!evidence.insideVerifyRadius) {
      await recordServerVerifyFailure({
        supabase,
        session: serverSession,
        reason: 'outside_summit_radius',
        detail: `closest distance ${Math.round(evidence.distanceM)}m > ${maxVerifyDistance}m`,
      })
      return NextResponse.json(
        {
          error: 'outside_summit_radius',
          detail: `closest distance ${Math.round(evidence.distanceM)}m > ${maxVerifyDistance}m`,
          distanceMeters: Math.round(evidence.distanceM),
          maxMeters: maxVerifyDistance,
        },
        { status: 422 }
      )
    }

    if (serverSession) {
      const { data: duplicateCheckin } = await supabase
        .from('checkins')
        .select('id')
        .eq('session_id', serverSession.id)
        .maybeSingle()

      if (duplicateCheckin) {
        return NextResponse.json({
          ok: true,
          duplicated: true,
          checkinId: duplicateCheckin.id,
        })
      }
    }

    const rankingWeight = rankingWeightByDifficulty(mountain.difficulty)
    const now = new Date().toISOString()
    let verifiedCheckin: { id: string; duplicated: boolean }

    if (serverSession) {
      const { data: recordedCheckin, error: recordError } = await supabase
        .rpc('verify_and_record_checkin', {
          p_session_id: serverSession.id,
          p_user_id: user.id,
          p_mountain_id: mountain.id,
          p_latitude: evidence.point.lat,
          p_longitude: evidence.point.lng,
          p_note: note,
          p_verified_at: now,
          p_verification_distance_m: Math.round(evidence.distanceM),
          p_ranking_weight: rankingWeight,
        })
        .single()

      const rpcRow = recordedCheckin as TrekVerifyRecordRpcRow | null

      if (recordError || !rpcRow?.checkin_id) {
        return trekActionErrorResponse('record summit checkin failed', recordError, 500, TREK_CHECKIN_SAVE_ERROR)
      }

      verifiedCheckin = {
        id: rpcRow.checkin_id,
        duplicated: Boolean(rpcRow.duplicated),
      }

    } else {
      const { data: createdCheckin, error: createError } = await insertCheckinWithFallback(
        supabase,
        {
          user_id: user.id,
          mountain_id: mountain.id,
          type: 'gps',
          source: 'realtime_gps',
          latitude: evidence.point.lat,
          longitude: evidence.point.lng,
          note,
          photo_url: photoUrl,
          verified_at: now,
          verification_distance_m: Math.round(evidence.distanceM),
          ranking_weight: rankingWeight,
          completion_status: 'complete',
        },
        'id'
      )

      if (createError || !createdCheckin) {
        return trekActionErrorResponse('create summit checkin failed', createError, 500, TREK_CHECKIN_SAVE_ERROR)
      }

      verifiedCheckin = {
        id: (createdCheckin as unknown as { id: string }).id,
        duplicated: false,
      }
    }

    const photoPersistenceError = await persistSummitPhotoUrl({
      checkinId: verifiedCheckin.id,
      userId: user.id,
      photoUrl,
    })
    if (photoPersistenceError) {
      return NextResponse.json(
        { error: 'photo_persistence_failed', detail: photoPersistenceError.error },
        { status: 500 }
      )
    }

    const statsWarning =
      verifiedCheckin.duplicated
        ? false
        : await updateVerificationStats({
            supabase,
            mountain,
            userId: user.id,
          })

    try {
      await syncUserLicenseLevel({
        supabase,
        userId: user.id,
      })
    } catch (error) {
      console.warn('license sync after summit verification failed', error)
    }

    return NextResponse.json({
      ok: true,
      ...(verifiedCheckin.duplicated ? { duplicated: true } : {}),
      checkinId: verifiedCheckin.id,
      verificationDistanceM: Math.round(evidence.distanceM),
      rankingWeight,
      ...(statsWarning ? { statsWarning: 'stats_update_failed' } : {}),
      mountain: {
        id: mountain.id,
        name: mountain.name,
      },
    })
  }

  if (action === 'submit_historical_checkin') {
    const mountainId = typeof body?.mountainId === 'string' ? body.mountainId : ''
    const photoUrl = typeof body?.photoUrl === 'string' ? body.photoUrl : ''
    const note = toSafeNote(body?.note)

    if (!mountainId || !photoUrl) {
      return NextResponse.json({ error: 'mountainId and photoUrl required' }, { status: 400 })
    }

    const { data: mountain, error: mountainError } = await supabase
      .from('mountains')
      .select('id, entity_type')
      .eq('id', mountainId)
      .eq('is_active', true)
      .eq('entity_type', 'mountain')
      .single()

    if (mountainError || !mountain) {
      if (mountainError) logTrekActionFailure('validate historical mountain failed', mountainError)
      return NextResponse.json({ error: '请选择有效的山峰。' }, { status: 400 })
    }

    const { data: checkin, error } = await insertCheckinWithFallback(
      supabase,
      {
        user_id: user.id,
        mountain_id: mountainId,
        type: 'photo',
        source: 'historical_photo',
        photo_url: photoUrl,
        note,
        ranking_weight: 0,
      },
      'id'
    )

    if (error || !checkin) {
      return trekActionErrorResponse('submit historical checkin failed', error, 500, TREK_CHECKIN_SAVE_ERROR)
    }

    const historicalCheckin = checkin as unknown as { id: string }

    return NextResponse.json({
      ok: true,
      checkinId: historicalCheckin.id,
    })
  }

  if (action === 'generate_share_card') {
    const checkinId = typeof body?.checkinId === 'string' ? body.checkinId : ''
    const template = typeof body?.template === 'string' ? body.template as ShareCardTemplate : 'summit_card'
    const renderMode = typeof body?.renderMode === 'string' ? body.renderMode as ShareRenderMode : 'photo_composite'
    const anchorPosition: ShareAnchorPosition = body?.anchorPosition === 'bottom' ? 'bottom' : 'top'

    if (!checkinId) {
      return NextResponse.json({ error: 'checkinId required' }, { status: 400 })
    }

    if (!SHARE_TEMPLATES.includes(template)) {
      return NextResponse.json({ error: 'invalid template' }, { status: 400 })
    }

    if (!SHARE_RENDER_MODES.includes(renderMode)) {
      return NextResponse.json({ error: 'invalid renderMode' }, { status: 400 })
    }

    let checkinResult = await supabase
      .from('checkins')
      .select('id, user_id, type, source, photo_url')
      .eq('id', checkinId)
      .single()

    if (checkinResult.error && checkinResult.error.message.includes('source')) {
      checkinResult = await supabase
        .from('checkins')
        .select('id, user_id, type, photo_url')
        .eq('id', checkinId)
        .single()
    }

    const checkin = checkinResult.data as {
      id: string
      user_id: string
      type: 'gps' | 'photo'
      source?: string | null
      photo_url?: string | null
    } | null

    if (checkinResult.error || !checkin) {
      return NextResponse.json({ error: 'checkin not found' }, { status: 404 })
    }

    const source = resolveCheckinSource({ source: checkin.source, type: checkin.type })
    const posterRenderMode: ShareRenderMode = renderMode === 'photo_composite' ? 'overlay_only' : renderMode
    const effectiveRenderMode: ShareRenderMode = renderMode
    const posterUrl = `/api/poster?checkinId=${encodeURIComponent(checkin.id)}&template=${template}&renderMode=${posterRenderMode}&anchorPosition=${anchorPosition}`
    const isOwner = checkin.user_id === user.id

    if (isOwner) {
      const posterUpdate = {
        poster_template: template,
        poster_url: posterUrl,
      }
      assertActivityUpdatePolicy(posterUpdate, { allowedFields: ['poster_template', 'poster_url'] })
      const adminSupabase = createSupabaseAdminClient()

      await adminSupabase
        .from('checkins')
        .update(posterUpdate)
        .eq('id', checkin.id)
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      ok: true,
      checkinId: checkin.id,
      template,
      renderMode,
      effectiveRenderMode,
      posterRenderMode,
      anchorPosition,
      source,
      posterUrl,
      photoUrl: checkin.photo_url ?? null,
      persisted: isOwner,
    })
  }

  return NextResponse.json({ error: 'unsupported action' }, { status: 400 })
}
