import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase-server'
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
  mountains: MountainRelation | MountainRelation[] | null
}

type TrekSessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  ascent_m: number | null
  max_altitude_m: number | null
}

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

async function loadShareData(checkinId: string): Promise<ShareActivityData | null> {
  const supabase = await createSupabaseServerClient()
  const { data: checkin, error } = await supabase
    .from('checkins')
    .select(
      `
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
        mountains(id, name, altitude, province)
      `,
    )
    .eq('id', checkinId)
    .maybeSingle()

  if (error || !checkin) {
    return null
  }

  const row = checkin as ShareCheckinRow
  const mountain = firstRelation(row.mountains)
  let session: TrekSessionRow | null = null

  if (row.session_id) {
    const { data: sessionData } = await supabase
      .from('trek_sessions')
      .select('id, started_at, ended_at, distance_m, ascent_m, max_altitude_m')
      .eq('id', row.session_id)
      .maybeSingle()
    session = (sessionData ?? null) as TrekSessionRow | null
  }

  const distanceMeters = row.distance_meters ?? session?.distance_m ?? null
  const durationSeconds =
    row.duration_seconds ??
    (session?.started_at && session?.ended_at
      ? Math.max(0, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000))
      : null)
  const elevationGain = row.elevation_gain_meters ?? session?.ascent_m ?? null
  const altitude = row.max_elevation_meters ?? session?.max_altitude_m ?? mountain?.altitude ?? null

  return {
    mountainName: mountain?.name ?? '未知山峰',
    location: mountain?.province ?? '',
    date: formatShareDate(row.start_time ?? session?.started_at ?? row.created_at),
    altitude: altitude ?? undefined,
    distance: typeof distanceMeters === 'number' ? Number((distanceMeters / 1000).toFixed(1)) : undefined,
    duration: durationSeconds ?? undefined,
    elevationGain: elevationGain ?? undefined,
    source: sourceForShare(row.source),
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ShareClient initialData={initialData} checkinId={checkinId} />
    </div>
  )
}
