import { NextResponse } from 'next/server'
import { findHighestTrackPoint, haversineMeters } from '@/lib/import/track-stats'
import type { ImportedTrackData, TrackPoint } from '@/lib/import/types'
import { rankingWeightByDifficulty } from '@/lib/trek-utils'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type ImportMountainRow = {
  id: string
  latitude: number | null
  longitude: number | null
  difficulty: string | null
}

function toSafeNote(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 240)
}

function normalizeTrackPoint(value: unknown): TrackPoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const latitude = Number(record.latitude)
  const longitude = Number(record.longitude)
  const elevation = Number(record.elevation)
  const timestamp = typeof record.timestamp === 'string' ? record.timestamp : undefined

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  return {
    latitude,
    longitude,
    ...(Number.isFinite(elevation) ? { elevation } : {}),
    ...(timestamp ? { timestamp } : {}),
  }
}

function normalizeImportedTrackData(value: unknown): Pick<ImportedTrackData, 'format' | 'fileName' | 'trackPoints'> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const format = record.format
  const fileName = record.fileName
  const rawPoints = record.trackPoints

  if (format !== 'gpx' && format !== 'kml' && format !== 'fit') return null
  if (typeof fileName !== 'string' || !Array.isArray(rawPoints)) return null

  const trackPoints = rawPoints.flatMap((point) => {
    const normalized = normalizeTrackPoint(point)
    return normalized ? [normalized] : []
  })

  if (trackPoints.length === 0) return null

  return {
    format,
    fileName,
    trackPoints,
  }
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
  const parsedData = normalizeImportedTrackData((body as { parsedData?: unknown } | null)?.parsedData)

  if (!parsedData) {
    return NextResponse.json({ error: 'parsedData invalid' }, { status: 400 })
  }

  const mountainId = typeof (body as { mountainId?: unknown } | null)?.mountainId === 'string'
    ? ((body as { mountainId: string }).mountainId.trim() || null)
    : null
  const note = toSafeNote((body as { note?: unknown } | null)?.note)
  const anchorPoint = findHighestTrackPoint(parsedData.trackPoints)

  if (!anchorPoint) {
    return NextResponse.json({ error: 'track points required' }, { status: 422 })
  }

  let mountain: ImportMountainRow | null = null
  let verificationDistanceM: number | null = null

  if (mountainId) {
    const { data, error } = await supabase
      .from('mountains')
      .select('id, latitude, longitude, difficulty')
      .eq('id', mountainId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'invalid mountainId' }, { status: 400 })
    }

    mountain = data as ImportMountainRow
    const mountainLatitude = Number(mountain?.latitude)
    const mountainLongitude = Number(mountain?.longitude)
    if (Number.isFinite(mountainLatitude) && Number.isFinite(mountainLongitude)) {
      verificationDistanceM = Math.round(
        haversineMeters(anchorPoint.latitude, anchorPoint.longitude, mountainLatitude, mountainLongitude)
      )
    }
  }

  const { data: checkin, error } = await supabase
    .from('checkins')
    .insert({
      user_id: user.id,
      mountain_id: mountain?.id ?? null,
      type: 'gps',
      source: 'track_import',
      status: 'approved',
      latitude: anchorPoint.latitude,
      longitude: anchorPoint.longitude,
      note,
      verified_at: new Date().toISOString(),
      verification_distance_m: verificationDistanceM,
      ranking_weight: mountain ? rankingWeightByDifficulty(mountain.difficulty) : 0,
    })
    .select('id')
    .single()

  if (error || !checkin) {
    return NextResponse.json({ error: error?.message ?? 'create imported checkin failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    checkinId: (checkin as { id: string }).id,
  })
}
