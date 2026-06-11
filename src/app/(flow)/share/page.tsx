import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { checkTemplateAccess, isPremiumPaywallEnabled } from '@/lib/premium'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import {
  buildShareTrackPreview,
  buildShareTrackPreviewFromScreenshotRouteShape,
} from '@/lib/share-track-preview'
import { resolveMeasuredShareAltitude, resolveShareMountainName } from '@/lib/share-data'
import ShareClient, { type ShareActivityData } from './ShareClient'

export const metadata: Metadata = {
  title: '分享编辑器 | Peak Trekker',
}

type SearchParams = {
  checkinId?: string | string[]
}

type MountainRelation = {
  id: string
  name: string | null
  altitude: number | null
  province: string | null
}

type ShareCheckinRow = {
  id: string
  source: string | null
  created_at: string | null
  start_time?: string | null
  end_time?: string | null
  distance_meters?: number | null
  duration_seconds?: number | null
  elevation_gain_meters?: number | null
  max_elevation_meters?: number | null
  session_id?: string | null
  track_name?: string | null
  track_points?: unknown
  screenshot_route_shape?: unknown
  mountains: MountainRelation | MountainRelation[] | null
}

type TrekSessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  ascent_m: number | null
  max_altitude_m: number | null
  track_points?: unknown
}

const SHARE_CHECKIN_SELECT_FULL = `
  id,
  source,
  created_at,
  start_time,
  end_time,
  distance_meters,
  duration_seconds,
  elevation_gain_meters,
  max_elevation_meters,
  session_id,
  track_name,
  track_points,
  screenshot_route_shape,
  mountains(id, name, altitude, province)
`

const SHARE_CHECKIN_SELECT_WITHOUT_SCREENSHOT_ROUTE_SHAPE = `
  id,
  source,
  created_at,
  start_time,
  end_time,
  distance_meters,
  duration_seconds,
  elevation_gain_meters,
  max_elevation_meters,
  session_id,
  track_name,
  track_points,
  mountains(id, name, altitude, province)
`

const SHARE_CHECKIN_SELECT_LEGACY = `
  id,
  source,
  created_at,
  start_time,
  end_time,
  distance_meters,
  duration_seconds,
  elevation_gain_meters,
  max_elevation_meters,
  session_id,
  track_name,
  mountains(id, name, altitude, province)
`

const TREK_SESSION_SELECT_FULL = 'id, started_at, ended_at, distance_m, ascent_m, max_altitude_m, track_points'
const TREK_SESSION_SELECT_LEGACY = 'id, started_at, ended_at, distance_m, ascent_m, max_altitude_m'

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatShareDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function sourceForShare(source?: string | null): ShareActivityData['source'] {
  if (source === 'track_import' || source === 'screenshot_recognition') return source
  return 'gps'
}

async function fetchShareCheckin(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  checkinId: string,
) {
  const fullResult = await supabase.from('checkins').select(SHARE_CHECKIN_SELECT_FULL).eq('id', checkinId).maybeSingle()

  if (!fullResult.error || !isSchemaCompatibilityErrorMessage(fullResult.error.message)) {
    return fullResult as { data: ShareCheckinRow | null; error: typeof fullResult.error }
  }

  const withoutShapeResult = await supabase
    .from('checkins')
    .select(SHARE_CHECKIN_SELECT_WITHOUT_SCREENSHOT_ROUTE_SHAPE)
    .eq('id', checkinId)
    .maybeSingle()

  if (!withoutShapeResult.error || !isSchemaCompatibilityErrorMessage(withoutShapeResult.error.message)) {
    return withoutShapeResult as { data: ShareCheckinRow | null; error: typeof withoutShapeResult.error }
  }

  return (await supabase.from('checkins').select(SHARE_CHECKIN_SELECT_LEGACY).eq('id', checkinId).maybeSingle()) as {
    data: ShareCheckinRow | null
    error: typeof fullResult.error
  }
}

async function fetchTrekSession(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sessionId: string,
) {
  const fullResult = await supabase
    .from('trek_sessions')
    .select(TREK_SESSION_SELECT_FULL)
    .eq('id', sessionId)
    .maybeSingle()

  if (!fullResult.error || !isSchemaCompatibilityErrorMessage(fullResult.error.message)) {
    return (fullResult.data ?? null) as TrekSessionRow | null
  }

  const legacyResult = await supabase
    .from('trek_sessions')
    .select(TREK_SESSION_SELECT_LEGACY)
    .eq('id', sessionId)
    .maybeSingle()

  return (legacyResult.data ?? null) as TrekSessionRow | null
}

async function loadShareData(checkinId: string): Promise<ShareActivityData | null> {
  const supabase = await createSupabaseServerClient()
  const { data: checkin, error } = await fetchShareCheckin(supabase, checkinId)

  if (error || !checkin) {
    return null
  }

  const row = checkin as ShareCheckinRow
  const mountain = firstRelation(row.mountains)
  let session: TrekSessionRow | null = null

  if (row.session_id) {
    session = await fetchTrekSession(supabase, row.session_id)
  }

  const distanceMeters = row.distance_meters ?? session?.distance_m ?? null
  const durationSeconds =
    row.duration_seconds ??
    (session?.started_at && session?.ended_at
      ? Math.max(0, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000))
      : null)
  const elevationGain = row.elevation_gain_meters ?? session?.ascent_m ?? null
  const altitude = resolveMeasuredShareAltitude(row.max_elevation_meters, session?.max_altitude_m)
  const isScreenshotRecognition = row.source === 'screenshot_recognition'
  const trackPreview = isScreenshotRecognition
    ? buildShareTrackPreviewFromScreenshotRouteShape(row.screenshot_route_shape)
    : buildShareTrackPreview(row.track_points) ?? buildShareTrackPreview(session?.track_points)

  return {
    mountainName: resolveShareMountainName({
      mountainName: mountain?.name,
      trackName: row.track_name,
    }),
    location: mountain?.province ?? '',
    date: formatShareDate(row.start_time ?? session?.started_at ?? row.created_at),
    altitude,
    distance: typeof distanceMeters === 'number' ? Number((distanceMeters / 1000).toFixed(1)) : undefined,
    duration: durationSeconds ?? undefined,
    elevationGain: elevationGain ?? undefined,
    source: sourceForShare(row.source),
    trackPreview,
  }
}

async function getCurrentUserId() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

export default async function SharePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const checkinId = firstSearchValue(resolvedSearchParams.checkinId)
  const initialData = checkinId ? await loadShareData(checkinId) : null
  const paywallEnabled = isPremiumPaywallEnabled()
  const userId = await getCurrentUserId()
  const premiumAccess = paywallEnabled
    ? await checkTemplateAccess('premium-photo-composite', userId)
    : { allowed: true }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ShareClient
        initialData={initialData}
        checkinId={checkinId}
        paywallEnabled={paywallEnabled}
        premiumUnlocked={premiumAccess.allowed}
        currentUserId={userId}
      />
    </div>
  )
}
