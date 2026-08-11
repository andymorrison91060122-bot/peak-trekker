import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { resolveCheckinDisplayTitle } from '@/lib/checkin-display-title'
import ArchiveClient, {
  type ArchiveSummaryViewModel,
  type ArchiveTripViewModel,
  type ArchiveUserViewModel,
} from './ArchiveClient'

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

type ProfileRow = {
  id: string
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
  province?: string | null
  city?: string | null
  license_level?: string | null
}

type MountainRelation = {
  id: string
  name: string
  altitude: number | string | null
  province: string | null
  region?: string | null
  cover_image?: string | null
  gallery_images?: string[] | null
}

type CheckinRow = {
  id: string
  user_id: string
  mountain_id: string | null
  type?: string | null
  source?: string | null
  photo_url: string | null
  verified_at?: string | null
  start_time?: string | null
  note?: string | null
  created_at: string
  summit_verified?: boolean | null
  altitude?: number | string | null
  distance_km?: number | string | null
  ascent_m?: number | string | null
  duration_seconds?: number | string | null
  distance_meters?: number | string | null
  elevation_gain_meters?: number | string | null
  max_elevation_meters?: number | string | null
  session_id?: string | null
  track_name?: string | null
  mountains: MountainRelation | MountainRelation[] | null
}

type SessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | string | null
  ascent_m: number | string | null
  max_altitude_m: number | string | null
}

type AssetRow = {
  id: string
  checkin_id: string
  type: 'image' | 'video' | 'poster'
  url: string
  thumbnail_url: string | null
  sort_order: number | null
  created_at: string
}

const PROFILE_SELECT_VARIANTS = [
  'id, username, display_name, avatar_url, province, city, license_level',
  'id, username, avatar_url, province, license_level',
] as const

const CHECKIN_SELECT_VARIANTS = [
  `
    id, user_id, mountain_id, type, source, photo_url, verified_at, start_time, note, created_at,
    summit_verified, altitude, distance_km, ascent_m, duration_seconds,
    distance_meters, elevation_gain_meters, max_elevation_meters, session_id, track_name,
    mountains(id, name, altitude, province, region, cover_image, gallery_images)
  `,
  `
    id, user_id, mountain_id, type, source, photo_url, verified_at, start_time, note, created_at,
    distance_meters, elevation_gain_meters, max_elevation_meters, duration_seconds,
    session_id, track_name,
    mountains(id, name, altitude, province, cover_image, gallery_images)
  `,
  `
    id, user_id, mountain_id, type, photo_url, verified_at, start_time, note, created_at, session_id,
    mountains(id, name, altitude, province, cover_image, gallery_images)
  `,
  `
    id, user_id, mountain_id, type, photo_url, created_at,
    mountains(id, name, altitude, province)
  `,
] as const

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function toValidIsoDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return Number.isFinite(new Date(value).getTime()) ? value : null
}

function resolveActivityAt({
  startTime,
  sessionStartedAt,
  createdAt,
}: {
  startTime?: string | null
  sessionStartedAt?: string | null
  createdAt?: string | null
}): string | null {
  return toValidIsoDate(startTime) ?? toValidIsoDate(sessionStartedAt) ?? toValidIsoDate(createdAt)
}

function resolveArchiveMaxAltitude({
  maxElevationMeters,
  altitude,
  sessionMaxAltitudeM,
  mountainAltitude,
  isSummit,
}: {
  maxElevationMeters?: unknown
  altitude?: unknown
  sessionMaxAltitudeM?: unknown
  mountainAltitude?: unknown
  isSummit: boolean
}): number | null {
  const measuredMaxAltitudeM =
    toNumber(maxElevationMeters) ?? toNumber(altitude) ?? toNumber(sessionMaxAltitudeM)
  const resolvedAltitude = measuredMaxAltitudeM ?? (isSummit ? toNumber(mountainAltitude) : null)
  return resolvedAltitude !== null && resolvedAltitude > 0 ? Math.round(resolvedAltitude) : null
}

function normalizeArchiveNote(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function durationFromRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null
  const startedAt = new Date(start).getTime()
  const endedAt = new Date(end).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return null
  return Math.round((endedAt - startedAt) / 1000)
}

async function fetchProfile(supabase: SupabaseServerClient, userId: string) {
  let lastResult: { data: ProfileRow | null; error: { message?: string | null } | null } | null = null

  for (const selectClause of PROFILE_SELECT_VARIANTS) {
    const result = await supabase.from('profiles').select(selectClause).eq('id', userId).maybeSingle()
    lastResult = result as { data: ProfileRow | null; error: { message?: string | null } | null }
    if (!result.error || !isSchemaCompatibilityErrorMessage(result.error.message)) {
      return lastResult
    }
  }

  return lastResult ?? { data: null, error: null }
}

async function fetchCheckins(supabase: SupabaseServerClient, userId: string) {
  let lastResult: { data: CheckinRow[] | null; error: { message?: string | null } | null } | null = null

  for (const selectClause of CHECKIN_SELECT_VARIANTS) {
    const result = await supabase
      .from('checkins')
      .select(selectClause)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    lastResult = result as { data: CheckinRow[] | null; error: { message?: string | null } | null }
    if (!result.error || !isSchemaCompatibilityErrorMessage(result.error.message)) {
      return lastResult
    }
  }

  return lastResult ?? { data: [], error: null }
}

async function loadSessionMap(supabase: SupabaseServerClient, sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, SessionRow>()

  const result = await supabase
    .from('trek_sessions')
    .select('id, started_at, ended_at, distance_m, ascent_m, max_altitude_m')
    .in('id', sessionIds)

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    return new Map<string, SessionRow>()
  }

  return new Map(((result.data ?? []) as SessionRow[]).map((session) => [session.id, session]))
}

async function loadAssetMap(supabase: SupabaseServerClient, checkinIds: string[]) {
  if (!checkinIds.length) return new Map<string, AssetRow[]>()

  const result = await supabase
    .from('checkin_assets')
    .select('id, checkin_id, type, url, thumbnail_url, sort_order, created_at')
    .in('checkin_id', checkinIds)
    .eq('type', 'image')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    return new Map<string, AssetRow[]>()
  }

  const assetMap = new Map<string, AssetRow[]>()
  for (const asset of (result.data ?? []) as AssetRow[]) {
    const current = assetMap.get(asset.checkin_id) ?? []
    current.push(asset)
    assetMap.set(asset.checkin_id, current)
  }
  return assetMap
}

function resolveUser(profile: ProfileRow | null, fallbackName: string): ArchiveUserViewModel {
  const displayName = profile?.display_name?.trim() || profile?.username?.trim() || fallbackName || '登山者'
  return {
    displayName,
    avatarUrl: profile?.avatar_url ?? null,
    city: profile?.city?.trim() || null,
    licenseLevel: profile?.license_level ?? 'none',
  }
}

function normalizeTrip({
  checkin,
  session,
  assets,
}: {
  checkin: CheckinRow
  session: SessionRow | null
  assets: AssetRow[]
}): ArchiveTripViewModel {
  const mountain = firstRelation(checkin.mountains)

  const mountainAltitude = toNumber(mountain?.altitude)
  const isSummit =
    checkin.summit_verified === true ||
    Boolean(checkin.verified_at)
  const activityAt = resolveActivityAt({
    startTime: checkin.start_time,
    sessionStartedAt: session?.started_at,
    createdAt: checkin.created_at,
  }) ?? checkin.created_at
  const fallbackAltitude =
    toNumber(checkin.max_elevation_meters) ?? toNumber(checkin.altitude) ?? toNumber(session?.max_altitude_m) ?? 0
  const maxAltitude = resolveArchiveMaxAltitude({
    maxElevationMeters: checkin.max_elevation_meters,
    altitude: checkin.altitude,
    sessionMaxAltitudeM: session?.max_altitude_m,
    mountainAltitude,
    isSummit,
  })
  const distanceKm =
    toNumber(checkin.distance_km) ??
    (toNumber(checkin.distance_meters) !== null ? Number(((toNumber(checkin.distance_meters) ?? 0) / 1000).toFixed(1)) : null) ??
    (toNumber(session?.distance_m) !== null ? Number(((toNumber(session?.distance_m) ?? 0) / 1000).toFixed(1)) : null) ??
    0
  const ascentM =
    toNumber(checkin.ascent_m) ??
    toNumber(checkin.elevation_gain_meters) ??
    toNumber(session?.ascent_m) ??
    0
  const durationSeconds =
    toNumber(checkin.duration_seconds) ??
    durationFromRange(session?.started_at, session?.ended_at) ??
    0
  const hasProof = Boolean(checkin.mountain_id)
  const displayTitle = resolveCheckinDisplayTitle({
    mountainName: mountain?.name,
    trackName: checkin.track_name,
  })
  const photoUrl = checkin.photo_url ?? assets[0]?.thumbnail_url ?? assets[0]?.url ?? null

  return {
    id: checkin.id,
    activityAt,
    note: normalizeArchiveNote(checkin.note),
    mountain: {
      id: mountain?.id ?? null,
      name: displayTitle.title,
      titleSource: displayTitle.titleSource,
      unmatchedTag: displayTitle.unmatchedTag,
      province: displayTitle.titleSource === 'mountain'
        ? (mountain?.province?.trim() || '未知地点')
        : displayTitle.secondaryLocation,
      region: displayTitle.titleSource === 'mountain' ? (mountain?.region ?? null) : null,
      altitude: Math.round(mountainAltitude ?? fallbackAltitude),
      coverImage: mountain?.cover_image ?? null,
    },
    metrics: {
      maxAltitudeM: maxAltitude,
      distanceKm: Number(distanceKm.toFixed(1)),
      ascentM: Math.round(ascentM),
      durationSeconds: Math.round(durationSeconds),
    },
    photoUrl,
    isSummit,
    hasProof,
  }
}

function buildSummary(trips: ArchiveTripViewModel[]): ArchiveSummaryViewModel {
  const highestPoint = trips
    .filter((trip) => trip.metrics.maxAltitudeM !== null)
    .sort((left, right) => {
      const altitudeDelta = (right.metrics.maxAltitudeM ?? 0) - (left.metrics.maxAltitudeM ?? 0)
      if (altitudeDelta !== 0) return altitudeDelta
      const timeDelta = new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime()
      return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id)
    })[0] ?? null

  return {
    totalTrips: trips.length,
    summitCount: trips.filter((trip) => trip.isSummit).length,
    maxAltitudeM: highestPoint?.metrics.maxAltitudeM ?? null,
    recordedAscentM: trips.reduce((total, trip) => total + Math.max(0, trip.metrics.ascentM), 0),
    highestPoint: highestPoint
      ? {
          tripId: highestPoint.id,
          mountainName: highestPoint.mountain.name,
          activityAt: highestPoint.activityAt,
          maxAltitudeM: highestPoint.metrics.maxAltitudeM,
        }
      : null,
  }
}

export default async function ArchivePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/archive')
  }

  const [profileResult, checkinResult] = await Promise.all([
    fetchProfile(supabase, user.id),
    fetchCheckins(supabase, user.id),
  ])
  const checkins = checkinResult.data ?? []
  const sessionIds = [...new Set(checkins.map((checkin) => checkin.session_id).filter(Boolean) as string[])]
  const checkinIds = checkins.map((checkin) => checkin.id)
  const [sessionMap, assetMap] = await Promise.all([
    loadSessionMap(supabase, sessionIds),
    loadAssetMap(supabase, checkinIds),
  ])
  const trips = checkins
    .map((checkin) =>
      normalizeTrip({
        checkin,
        session: checkin.session_id ? sessionMap.get(checkin.session_id) ?? null : null,
        assets: assetMap.get(checkin.id) ?? [],
      })
    )
    .sort((left, right) => {
      const timeDelta = new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime()
      return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id)
    })

  return (
    <ArchiveClient
      user={resolveUser(profileResult.data ?? null, user.email?.split('@')[0] ?? '登山者')}
      summary={buildSummary(trips)}
      trips={trips}
    />
  )
}
