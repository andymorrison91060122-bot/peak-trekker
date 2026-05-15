import { NextRequest, NextResponse } from 'next/server'
import { assertActivityUpdatePolicy } from '@/lib/activity-field-policy'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { TREK_RULES } from '@/lib/trek-rules-server'
import { isTrekServerDevBypassAllowed, resolveTrekServerVerificationRules } from '@/lib/trek-verification-rules'
import {
  ALLOW_LOCAL_TREK_SESSION,
  LOCAL_FALLBACK_SESSION_PREFIX,
  isLocalFallbackSessionId,
  isLocalTrekSessionId,
} from '@/lib/trek-server-utils'
import { haversineMeters, rankingWeightByDifficulty, resolveCheckinSource, safeTrackPoints } from '@/lib/trek-utils'
import {
  TREK_VERIFY_SESSION_SELECT,
  fetchMountainForVerification,
  insertCheckinWithFallback,
  listActiveMountainsForVerification,
  recordServerVerifyFailure,
  resolveNearestMountainForVerification,
  updateVerificationStats,
  type TrekVerifyRecordRpcRow,
  type TrekVerifySessionRecord,
} from '@/lib/trek-verify-helpers'
import type { ShareAnchorPosition, ShareCardTemplate, ShareRenderMode } from '@/types'

type ActionName =
  | 'list_active_mountains'
  | 'start_trek_session'
  | 'finish_trek_session'
  | 'finish_incomplete_trek'
  | 'append_trek_point'
  | 'verify_summit_checkin'
  | 'submit_historical_checkin'
  | 'generate_share_card'

const SHARE_TEMPLATES: ShareCardTemplate[] = ['trek_snapshot', 'summit_card', 'activity_summary']
const SHARE_RENDER_MODES: ShareRenderMode[] = ['photo_composite', 'overlay_only', 'classic_card']
const ENABLE_QA_TEST_HELPERS = process.env.ENABLE_QA_TEST_HELPERS === 'true'
const MIN_INCOMPLETE_TREK_SECONDS = 60

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
    return {
      error: result.error instanceof Error ? result.error.message : '登顶照保存失败',
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = body?.action as ActionName | undefined

  if (!action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (action === 'list_active_mountains') {
    const { data: mountains, error } = await supabase
      .from('mountains')
      .select('*')
      .eq('is_active', true)
      .order('checkin_count', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      mountains: mountains ?? [],
    })
  }

  if (action === 'start_trek_session') {
    const mountainId = typeof body?.mountainId === 'string' ? body.mountainId : null

    if (mountainId) {
      const { data: mountain, error } = await supabase
        .from('mountains')
        .select('id')
        .eq('id', mountainId)
        .eq('is_active', true)
        .single()
      if (error || !mountain) {
        return NextResponse.json({ error: 'invalid mountainId' }, { status: 400 })
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
      return NextResponse.json({ error: finishActiveSessions.error.message }, { status: 500 })
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
      return NextResponse.json({ error: error?.message ?? 'start session failed' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      startedAt: session.started_at,
    })
  }

  if (action === 'append_trek_point') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
    const point = body?.point ?? {}
    const lat = Number(point.lat)
    const lng = Number(point.lng)
    const accuracy = Number(point.accuracy)
    const altitude = Number.isFinite(Number(point.altitude)) ? Number(point.altitude) : null
    const ts = Number.isFinite(Number(point.ts)) ? Number(point.ts) : Date.now()

    if (!sessionId || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) {
      return NextResponse.json({ error: 'invalid point payload' }, { status: 400 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)

    if (isFallbackSession || isTestLocalSession) {
      if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
        return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
      }
      return NextResponse.json({ ok: true, fallback: 'client' })
    }

    const { data: session, error: sessionError } = await supabase
      .from('trek_sessions')
      .select('id, user_id, status, started_at, track_points, distance_m, ascent_m, descent_m, max_altitude_m')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (session.status !== 'tracking') {
      return NextResponse.json({ error: 'session is not tracking' }, { status: 409 })
    }

    const points = safeTrackPoints(session.track_points)
    const prev = points.at(-1)

    if (prev) {
      const segmentMeters = haversineMeters(prev.lat, prev.lng, lat, lng)
      const elapsed = Math.max(1, (ts - prev.ts) / 1000)
      const speed = segmentMeters / elapsed
      if (speed > TREK_RULES.maxDriftSpeedMps && accuracy > 25) {
        return NextResponse.json({
          ok: true,
          accepted: false,
          reason: 'drift_filtered',
          pointCount: points.length,
        })
      }
    }

    const nextPoint = { lat, lng, accuracy, altitude, ts }
    const nextPoints = [...points, nextPoint]

    let distanceM = Number(session.distance_m ?? 0)
    let ascentM = Number(session.ascent_m ?? 0)
    let descentM = Number(session.descent_m ?? 0)
    let maxAltitudeM = Number(session.max_altitude_m ?? 0)

    if (prev) {
      const segmentMeters = haversineMeters(prev.lat, prev.lng, lat, lng)
      distanceM += segmentMeters
      if (typeof prev.altitude === 'number' && typeof altitude === 'number') {
        const delta = altitude - prev.altitude
        if (delta > 0) ascentM += Math.round(delta)
        if (delta < 0) descentM += Math.round(Math.abs(delta))
      }
    }

    if (typeof altitude === 'number') {
      maxAltitudeM = Math.max(maxAltitudeM, Math.round(altitude))
    }

    const { error: updateError } = await supabase
      .from('trek_sessions')
      .update({
        track_points: nextPoints,
        track_summary: {
          distance_m: Math.round(distanceM),
          ascent_m: ascentM,
          descent_m: descentM,
          max_altitude_m: maxAltitudeM,
          point_count: nextPoints.length,
        },
        distance_m: Math.round(distanceM),
        ascent_m: ascentM,
        descent_m: descentM,
        max_altitude_m: maxAltitudeM,
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      accepted: true,
      pointCount: nextPoints.length,
      summary: {
        distanceM: Math.round(distanceM),
        ascentM,
        descentM,
        maxAltitudeM,
      },
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
      return NextResponse.json({ error: updateError.message }, { status: 500 })
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
    const localElapsedSeconds = finiteNumber(body?.elapsedSeconds)

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

    if (!isLocalSession) {
      const { data: existingCheckin } = await supabase
        .from('checkins')
        .select('id')
        .eq('session_id', sessionId)
        .maybeSingle()

      if (existingCheckin?.id) {
        return NextResponse.json({
          ok: true,
          duplicated: true,
          checkinId: existingCheckin.id,
        })
      }
    }

    const lastPoint = effectivePoints.at(-1)!
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

    const { data: createdCheckin, error: createError } = await insertCheckinWithFallback(
      supabase,
      {
        user_id: user.id,
        mountain_id: effectiveMountainId,
        type: 'gps',
        source: 'realtime_gps',
        status: 'pending',
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
      'id, status, completion_status'
    )

    if (createError || !createdCheckin) {
      return NextResponse.json({ error: createError?.message ?? 'save incomplete trek failed' }, { status: 500 })
    }

    if (!isLocalSession && session) {
      await supabase
        .from('trek_sessions')
        .update({
          status: 'finished',
          ended_at: new Date(endedAtMs).toISOString(),
        })
        .eq('id', session.id)
        .eq('user_id', user.id)
    }

    const checkin = createdCheckin as unknown as {
      id: string
      status: string
      completion_status?: string | null
    }

    return NextResponse.json({
      ok: true,
      checkinId: checkin.id,
      status: checkin.status,
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
        .eq('status', 'approved')
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

    const lastPoint = points.at(-1)!
    const verifyDistance = haversineMeters(lastPoint.lat, lastPoint.lng, mountain.latitude, mountain.longitude)
    const summitRadius = mountain.summit_radius_m ?? TREK_RULES.defaultSummitRadiusM

    if (verifyDistance > summitRadius) {
      await recordServerVerifyFailure({
        supabase,
        session: serverSession,
        reason: 'outside_summit_radius',
        detail: `current distance ${Math.round(verifyDistance)}m > ${summitRadius}m`,
      })
      return NextResponse.json(
        {
          error: 'outside_summit_radius',
          detail: `current distance ${Math.round(verifyDistance)}m > ${summitRadius}m`,
        },
        { status: 422 }
      )
    }

    if (serverSession) {
      const { data: duplicateCheckin } = await supabase
        .from('checkins')
        .select('id')
        .eq('session_id', serverSession.id)
        .eq('status', 'approved')
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
          p_latitude: lastPoint.lat,
          p_longitude: lastPoint.lng,
          p_note: note,
          p_verified_at: now,
          p_verification_distance_m: Math.round(verifyDistance),
          p_ranking_weight: rankingWeight,
        })
        .single()

      const rpcRow = recordedCheckin as TrekVerifyRecordRpcRow | null

      if (recordError || !rpcRow?.checkin_id) {
        return NextResponse.json({ error: recordError?.message ?? 'record checkin failed' }, { status: 500 })
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
          status: 'approved',
          latitude: lastPoint.lat,
          longitude: lastPoint.lng,
          note,
          photo_url: photoUrl,
          verified_at: now,
          verification_distance_m: Math.round(verifyDistance),
          ranking_weight: rankingWeight,
          completion_status: 'complete',
        },
        'id'
      )

      if (createError || !createdCheckin) {
        return NextResponse.json({ error: createError?.message ?? 'create checkin failed' }, { status: 500 })
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

    return NextResponse.json({
      ok: true,
      ...(verifiedCheckin.duplicated ? { duplicated: true } : {}),
      checkinId: verifiedCheckin.id,
      verificationDistanceM: Math.round(verifyDistance),
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
    const qaForceApproved =
      (process.env.NODE_ENV !== 'production' || ENABLE_QA_TEST_HELPERS) && body?.qaForceApproved === true
    const qaForceRejected =
      (process.env.NODE_ENV !== 'production' || ENABLE_QA_TEST_HELPERS) && body?.qaForceRejected === true
    const qaReviewNote = toSafeNote(body?.qaReviewNote)

    if (!mountainId || !photoUrl) {
      return NextResponse.json({ error: 'mountainId and photoUrl required' }, { status: 400 })
    }

    const { data: mountain, error: mountainError } = await supabase
      .from('mountains')
      .select('id')
      .eq('id', mountainId)
      .single()

    if (mountainError || !mountain) {
      return NextResponse.json({ error: 'invalid mountainId' }, { status: 400 })
    }

    const { data: checkin, error } = await insertCheckinWithFallback(
      supabase,
      {
        user_id: user.id,
        mountain_id: mountainId,
        type: 'photo',
        source: 'historical_photo',
        status: qaForceApproved ? 'approved' : qaForceRejected ? 'rejected' : 'pending',
        photo_url: photoUrl,
        note,
        ranking_weight: 0,
        ...(qaForceRejected && qaReviewNote
          ? {
              review_note: qaReviewNote,
              admin_note: qaReviewNote,
            }
          : {}),
      },
      'id, status'
    )

    if (error || !checkin) {
      return NextResponse.json({ error: error?.message ?? 'submit historical checkin failed' }, { status: 500 })
    }

    const historicalCheckin = checkin as unknown as { id: string; status: string }

    return NextResponse.json({
      ok: true,
      checkinId: historicalCheckin.id,
      status: historicalCheckin.status,
      qaForceApproved,
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
      .select('id, user_id, type, source, status, photo_url')
      .eq('id', checkinId)
      .single()

    if (checkinResult.error && checkinResult.error.message.includes('source')) {
      checkinResult = await supabase
        .from('checkins')
        .select('id, user_id, type, status, photo_url')
        .eq('id', checkinId)
        .single()
    }

    const checkin = checkinResult.data as {
      id: string
      user_id: string
      type: 'gps' | 'photo'
      source?: string | null
      status: 'pending' | 'approved' | 'rejected'
      photo_url?: string | null
    } | null

    if (checkinResult.error || !checkin) {
      return NextResponse.json({ error: 'checkin not found' }, { status: 404 })
    }

    if (checkin.status !== 'approved') {
      return NextResponse.json(
        { error: 'checkin_not_approved', detail: 'only approved records can generate share cards' },
        { status: 422 }
      )
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

      await supabase
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
