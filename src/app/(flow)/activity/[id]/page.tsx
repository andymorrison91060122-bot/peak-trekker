import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import type { SourceLabelProps } from '@/components/ui/SourceLabel'
import { getSourceLabelType } from '@/lib/source-label-utils'
import { resolveCheckinSource, type CheckinSource } from '@/lib/trek-utils'
import ActivityDetailClient, {
  type ActivityDetailViewModel,
  type ActivityPhotoViewModel,
} from './ActivityDetailClient'

type MountainRelation = {
  id: string
  name: string
  altitude: number | null
  province: string | null
  difficulty?: string | null
  cover_image?: string | null
  gallery_images?: string[] | null
}

type CheckinRow = {
  id: string
  user_id: string
  mountain_id: string | null
  type: string | null
  source?: string | null
  status: 'pending' | 'approved' | 'rejected'
  photo_url: string | null
  note: string | null
  session_id?: string | null
  verified_at?: string | null
  created_at: string
  distance_meters?: number | string | null
  duration_seconds?: number | null
  elevation_gain_meters?: number | string | null
  max_elevation_meters?: number | string | null
  min_elevation_meters?: number | string | null
  start_time?: string | null
  end_time?: string | null
  track_points?: unknown
  mountains: MountainRelation | MountainRelation[] | null
}

type SessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  ascent_m: number | null
  max_altitude_m: number | null
  track_points?: unknown
}

type CheckinAssetRow = {
  id: string
  checkin_id: string
  type: 'image' | 'video' | 'poster'
  url: string
  thumbnail_url: string | null
  created_at: string
  sort_order: number | null
}

type RawTrackPoint = {
  altitude: number | null
  time: string | null
}

const CHECKIN_SELECT_FULL = `
  id, user_id, mountain_id, type, source, status, photo_url, note, session_id, verified_at, created_at,
  distance_meters, duration_seconds, elevation_gain_meters, max_elevation_meters, min_elevation_meters,
  start_time, end_time, track_points,
  mountains(id, name, altitude, province, difficulty, cover_image, gallery_images)
`

const CHECKIN_SELECT_LEGACY = `
  id, user_id, mountain_id, type, source, status, photo_url, note, session_id, verified_at, created_at,
  mountains(id, name, altitude, province, difficulty, cover_image, gallery_images)
`

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function toNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function parseTrackPoints(value: unknown): RawTrackPoint[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const altitude =
      toNumber(raw.altitude) ??
      toNumber(raw.elevation) ??
      toNumber(raw.ele) ??
      toNumber(raw.maxElevation) ??
      null
    const time =
      typeof raw.time === 'string'
        ? raw.time
        : typeof raw.ts === 'number'
          ? new Date(raw.ts).toISOString()
          : null

    if (altitude === null && !time) return []

    return [{ altitude, time }]
  })
}

function uniquePhotos(legacyPhotoUrl: string | null, assets: CheckinAssetRow[]): ActivityPhotoViewModel[] {
  const photos: ActivityPhotoViewModel[] = []
  const seen = new Set<string>()

  if (legacyPhotoUrl) {
    seen.add(legacyPhotoUrl)
    photos.push({
      id: 'legacy-photo',
      assetId: null,
      url: legacyPhotoUrl,
      thumbnailUrl: legacyPhotoUrl,
      isLegacyCover: true,
    })
  }

  for (const asset of assets) {
    if (asset.type !== 'image' || seen.has(asset.url)) continue
    seen.add(asset.url)
    photos.push({
      id: asset.id,
      assetId: asset.id,
      url: asset.url,
      thumbnailUrl: asset.thumbnail_url ?? asset.url,
    })
  }

  return photos
}

function durationFromRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null
  const startedAt = new Date(start).getTime()
  const endedAt = new Date(end).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return null
  return Math.round((endedAt - startedAt) / 1000)
}

function deriveSourceLabelType(checkin: CheckinRow, sourceType: CheckinSource): SourceLabelProps['type'] {
  if (checkin.source) return getSourceLabelType(sourceType)
  if (checkin.verified_at || checkin.status === 'approved' || (checkin.status as string) === 'verified') {
    return 'gps_verified'
  }
  return 'uploaded'
}

async function fetchCheckin(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string) {
  const fullResult = await supabase.from('checkins').select(CHECKIN_SELECT_FULL).eq('id', id).maybeSingle()

  if (!fullResult.error || !isSchemaCompatibilityErrorMessage(fullResult.error.message)) {
    return fullResult as { data: CheckinRow | null; error: typeof fullResult.error }
  }

  return (await supabase.from('checkins').select(CHECKIN_SELECT_LEGACY).eq('id', id).maybeSingle()) as {
    data: CheckinRow | null
    error: typeof fullResult.error
  }
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?from=/activity/${id}`)
  }

  const { data: checkin, error: checkinError } = await fetchCheckin(supabase, id)

  if (checkinError || !checkin || checkin.user_id !== user.id) {
    notFound()
  }

  const mountain = firstRelation(checkin.mountains)
  const sourceType = resolveCheckinSource({
    source: checkin.source as CheckinSource | string | null | undefined,
    type: checkin.type === 'photo' ? 'photo' : 'gps',
  })
  const isScreenshotRecognition = sourceType === 'screenshot_recognition'
  const sourceLabelType = deriveSourceLabelType(checkin, sourceType)

  const [assetResult, sessionResult, countResult] = await Promise.all([
    supabase
      .from('checkin_assets')
      .select('id, checkin_id, type, url, thumbnail_url, created_at, sort_order')
      .eq('checkin_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    checkin.session_id
      ? supabase
          .from('trek_sessions')
          .select('id, started_at, ended_at, distance_m, ascent_m, max_altitude_m, track_points')
          .eq('id', checkin.session_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'approved'),
  ])

  const session = (sessionResult.data ?? null) as SessionRow | null
  const assets = assetResult.error ? [] : ((assetResult.data ?? []) as CheckinAssetRow[])
  const photos = uniquePhotos(checkin.photo_url ?? null, assets)
  const sessionSamples = parseTrackPoints(session?.track_points)
  const checkinSamples = parseTrackPoints(checkin.track_points)
  const trackSamples = sessionSamples.length ? sessionSamples : checkinSamples
  const elevationSamples = trackSamples.flatMap((point) =>
    point.altitude === null ? [] : [Math.round(point.altitude)]
  )
  const maxSampleAltitude = elevationSamples.length ? Math.max(...elevationSamples) : null
  const minSampleAltitude = elevationSamples.length ? Math.min(...elevationSamples) : null
  const maxAltitude =
    toNumber(checkin.max_elevation_meters) ??
    (isScreenshotRecognition ? null : toNumber(session?.max_altitude_m)) ??
    (isScreenshotRecognition ? null : maxSampleAltitude) ??
    (isScreenshotRecognition ? null : toNumber(mountain?.altitude)) ??
    0
  const explicitAscent =
    toNumber(checkin.elevation_gain_meters) ??
    (isScreenshotRecognition ? null : toNumber(session?.ascent_m))
  const minAltitude =
    toNumber(checkin.min_elevation_meters) ??
    (isScreenshotRecognition ? null : minSampleAltitude) ??
    (explicitAscent !== null ? Math.max(0, maxAltitude - explicitAscent) : 0)
  const distanceKm =
    toNumber(checkin.distance_meters) !== null
      ? Number(((toNumber(checkin.distance_meters) ?? 0) / 1000).toFixed(1))
      : session?.distance_m
        ? Number((session.distance_m / 1000).toFixed(1))
        : 0
  const ascentM = Math.round(
    explicitAscent ?? (isScreenshotRecognition ? 0 : Math.max(0, maxAltitude - minAltitude))
  )
  const rawDurationSeconds =
    toNumber(checkin.duration_seconds) ??
    durationFromRange(checkin.start_time, checkin.end_time) ??
    durationFromRange(session?.started_at, session?.ended_at) ??
    0
  const durationSeconds = rawDurationSeconds > 0 && rawDurationSeconds <= 30 * 24 * 60 * 60
    ? rawDurationSeconds
    : 0
  const summitAt = checkin.verified_at ?? checkin.end_time ?? session?.ended_at ?? null
  const isSummit = checkin.status === 'approved'
  const proofStatus =
    isSummit && elevationSamples.length >= 8 ? 'confirmed' : isSummit ? 'partial' : 'none'

  const activity: ActivityDetailViewModel = {
    id: checkin.id,
    createdAt: checkin.created_at,
    startedAt: checkin.start_time ?? session?.started_at ?? checkin.created_at,
    summitAt,
    sourceType,
    sourceLabelType,
    status: checkin.status,
    isSummit,
    mountain: {
      id: mountain?.id ?? null,
      name: mountain?.name ?? '未关联山峰',
      altitude: Math.round(toNumber(mountain?.altitude) ?? maxAltitude),
      province: mountain?.province ?? '未关联地区',
      region: mountain?.province ?? '未关联地区',
      coverImage: mountain?.cover_image ?? null,
      difficulty: mountain?.difficulty ?? null,
    },
    metrics: {
      maxAltitudeM: Math.round(maxAltitude),
      minAltitudeM: Math.round(minAltitude),
      ascentM,
      distanceKm,
      durationSeconds,
    },
    note: checkin.note?.trim() ?? '',
    photos,
    elevationSamples,
    proofStatus,
    recordCount: countResult.count ?? 0,
  }

  return <ActivityDetailClient activity={activity} />
}
