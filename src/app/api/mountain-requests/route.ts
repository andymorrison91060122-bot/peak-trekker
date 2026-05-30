import { NextResponse } from 'next/server'

import { normalizeMountainRequestInput } from '@/lib/mountain-requests'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function isUniqueViolation(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === '23505'
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const normalized = normalizeMountainRequestInput(body)
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const mountainRequest = normalized.request
  const { error } = await supabase
    .from('mountain_requests')
    .insert({
      user_id: user.id,
      request_source: mountainRequest.requestSource,
      location_name: mountainRequest.locationName,
      latitude: mountainRequest.latitude,
      longitude: mountainRequest.longitude,
      altitude_m: mountainRequest.altitudeM,
      province: mountainRequest.province,
      track_name: mountainRequest.trackName,
      file_name: mountainRequest.fileName,
      import_format: mountainRequest.importFormat,
      candidate_mountain_id: mountainRequest.candidateMountainId,
      candidate_mountain_name: mountainRequest.candidateMountainName,
      candidate_distance_m: mountainRequest.candidateDistanceM,
      reference_point_source: mountainRequest.referencePointSource,
      track_content_hash: mountainRequest.trackContentHash,
      request_fingerprint: mountainRequest.requestFingerprint,
      dedupe_bucket_start: mountainRequest.dedupeBucketStart,
      context: mountainRequest.context,
    })

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ ok: true, deduped: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deduped: false })
}
