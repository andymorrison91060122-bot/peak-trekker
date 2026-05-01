import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { TREK_RULES } from '@/lib/trek-rules-server'
import {
  ALLOW_LOCAL_TREK_SESSION,
  LOCAL_FALLBACK_SESSION_PREFIX,
  isLocalFallbackSessionId,
  isLocalTrekSessionId,
} from '@/lib/trek-server-utils'
import {
  haversineMeters,
  rankingWeightByDifficulty,
  resolveCheckinSource,
  safeTrackPoints,
} from '@/lib/trek-utils'
import type { Mountain, ShareAnchorPosition, ShareCardTemplate, ShareRenderMode } from '@/types'

type ActionName =
  | 'list_active_mountains'
  | 'start_trek_session'
  | 'finish_trek_session'
  | 'append_trek_point'
  | 'verify_summit_checkin'
  | 'submit_historical_checkin'
  | 'generate_share_card'

type TrekVerifySessionRecord = {
  id: string
  user_id: string
  mountain_id: string | null
  status: string
  started_at: string
  track_points: unknown
  distance_m: number | null
  ascent_m: number | null
  descent_m: number | null
  max_altitude_m: number | null
}

type TrekVerifyRecordRpcRow = {
  checkin_id?: string | null
  duplicated?: boolean | null
}

type StatsRpcError = {
  message?: string | null
  code?: string | null
  details?: string | null
  hint?: string | null
}

const SHARE_TEMPLATES: ShareCardTemplate[] = ['trek_snapshot', 'summit_card', 'activity_summary']
const SHARE_RENDER_MODES: ShareRenderMode[] = ['photo_composite', 'overlay_only', 'classic_card']
const ENABLE_QA_TEST_HELPERS = process.env.ENABLE_QA_TEST_HELPERS === 'true'

function toSafeNote(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 240)
}

function normalizeMountainRecord(value: unknown) {
  if (Array.isArray(value)) return (value[0] ?? null) as (Mountain & { summit_radius_m?: number | null }) | null
  return (value as (Mountain & { summit_radius_m?: number | null }) | null) ?? null
}

const MOUNTAIN_VERIFY_SELECT_FULL = 'id, name, altitude, latitude, longitude, difficulty, summit_radius_m, province'
const MOUNTAIN_VERIFY_SELECT_FALLBACK = 'id, name, altitude, latitude, longitude, difficulty, province'

async function fetchMountainForVerification(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  mountainId: string
) {
  let result = (await supabase
    .from('mountains')
    .select(MOUNTAIN_VERIFY_SELECT_FULL)
    .eq('id', mountainId)
    .single()) as {
    data: (Mountain & { summit_radius_m?: number | null }) | null
    error: { message?: string | null } | null
  }

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    result = (await supabase
      .from('mountains')
      .select(MOUNTAIN_VERIFY_SELECT_FALLBACK)
      .eq('id', mountainId)
      .single()) as {
      data: (Mountain & { summit_radius_m?: number | null }) | null
      error: { message?: string | null } | null
    }
  }

  return {
    data: normalizeMountainRecord(result.data),
    error: result.error,
  }
}

async function listActiveMountainsForVerification(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
) {
  let result = (await supabase
    .from('mountains')
    .select(MOUNTAIN_VERIFY_SELECT_FULL)
    .eq('is_active', true)) as {
    data: Array<Mountain & { summit_radius_m?: number | null }> | null
    error: { message?: string | null } | null
  }

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    result = (await supabase
      .from('mountains')
      .select(MOUNTAIN_VERIFY_SELECT_FALLBACK)
      .eq('is_active', true)) as {
      data: Array<Mountain & { summit_radius_m?: number | null }> | null
      error: { message?: string | null } | null
    }
  }

  return {
    data: (result.data ?? []) as Array<Mountain & { summit_radius_m?: number | null }>,
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

async function insertCheckinWithFallback(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
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

    const nextPayload = { ...currentPayload }
    delete nextPayload[missingColumn]
    currentPayload = nextPayload
  }

  return lastResult as never
}

async function updateVerificationStats({
  supabase,
  mountain,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  mountain: Mountain & { summit_radius_m?: number | null }
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

  if (action === 'verify_summit_checkin') {
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
    const note = toSafeNote(body?.note)

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const isFallbackSession = isLocalFallbackSessionId(sessionId)
    const isTestLocalSession = isLocalTrekSessionId(sessionId)
    if (isTestLocalSession && !ALLOW_LOCAL_TREK_SESSION) {
      return NextResponse.json({ error: 'local_trek_session_disabled' }, { status: 403 })
    }
    const isLocalSession = isFallbackSession || isTestLocalSession
    const sessionResult = isLocalSession
      ? {
          data: null,
          error: null,
        }
      : await supabase
          .from('trek_sessions')
          .select('id, user_id, mountain_id, status, started_at, track_points, distance_m, ascent_m, descent_m, max_altitude_m')
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
    if (points.length < TREK_RULES.minTrackPoints) {
      return NextResponse.json(
        { error: 'insufficient_track_points', detail: `need at least ${TREK_RULES.minTrackPoints} points` },
        { status: 422 }
      )
    }

    const startedAt = isLocalSession ? Number(body?.startedAt) : new Date(serverSession?.started_at ?? '').getTime()
    if (!Number.isFinite(startedAt)) {
      return NextResponse.json({ error: 'invalid_session_start_time' }, { status: 400 })
    }
    const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    if (durationSeconds < TREK_RULES.minSessionSeconds) {
      return NextResponse.json(
        { error: 'session_too_short', detail: `need at least ${TREK_RULES.minSessionSeconds}s` },
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
      const { data: allMountains } = await listActiveMountainsForVerification(supabase)

      if (!allMountains?.length) {
        return NextResponse.json({ error: 'no_active_mountains' }, { status: 500 })
      }

      const last = points.at(-1)!
      mountain = [...allMountains].sort(
        (a, b) =>
          haversineMeters(last.lat, last.lng, a.latitude, a.longitude) -
          haversineMeters(last.lat, last.lng, b.latitude, b.longitude)
      )[0] as Mountain & { summit_radius_m?: number | null }
    }

    const lastPoint = points.at(-1)!
    const verifyDistance = haversineMeters(lastPoint.lat, lastPoint.lng, mountain.latitude, mountain.longitude)
    const summitRadius = mountain.summit_radius_m ?? TREK_RULES.defaultSummitRadiusM

    if (verifyDistance > summitRadius) {
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
          verified_at: now,
          verification_distance_m: Math.round(verifyDistance),
          ranking_weight: rankingWeight,
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
      await supabase
        .from('checkins')
        .update({
          poster_template: template,
          poster_url: posterUrl,
        })
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
