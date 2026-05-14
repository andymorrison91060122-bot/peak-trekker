import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProfileV2TripPreview } from '@/components/profile/ProfileV2Client'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'

type AnySupabase = SupabaseClient

type MountainRelation = {
  id: string
  name: string | null
  altitude: number | string | null
  province: string | null
  cover_image?: string | null
}

type ProfileCheckinRow = {
  id: string
  mountain_id: string | null
  status: string | null
  completion_status?: 'complete' | 'incomplete' | null
  created_at: string
  verified_at?: string | null
  photo_url: string | null
  poster_url?: string | null
  max_elevation_meters?: number | string | null
  mountains: MountainRelation | MountainRelation[] | null
}

const PROFILE_TRIP_SELECT_VARIANTS = [
  `
    id, mountain_id, status, completion_status, created_at, verified_at, photo_url, poster_url, max_elevation_meters,
    mountains(id, name, altitude, province, cover_image)
  `,
  `
    id, mountain_id, status, created_at, verified_at, photo_url, max_elevation_meters,
    mountains(id, name, altitude, province, cover_image)
  `,
  `
    id, mountain_id, status, created_at, photo_url,
    mountains(id, name, altitude, province, cover_image)
  `,
] as const

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function toNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export async function listProfileTrips({
  supabase,
  userId,
}: {
  supabase: AnySupabase
  userId: string
}): Promise<ProfileV2TripPreview[]> {
  let lastResult:
    | {
        data: unknown[] | null
        error: { message?: string | null } | null
      }
    | null = null

  for (const selectClause of PROFILE_TRIP_SELECT_VARIANTS) {
    const result = await supabase
      .from('checkins')
      .select(selectClause)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    lastResult = result as {
      data: unknown[] | null
      error: { message?: string | null } | null
    }

    if (!result.error || !isSchemaCompatibilityErrorMessage(result.error.message)) {
      break
    }
  }

  const rows = (lastResult?.data ?? []) as ProfileCheckinRow[]

  return rows.map((checkin) => {
    const mountain = firstRelation(checkin.mountains)
    const hasProof = Boolean(checkin.mountain_id)
    const mountainAltitude = toNumber(mountain?.altitude)
    const checkinMaxAltitude = toNumber(checkin.max_elevation_meters)

    return {
      checkinId: checkin.id,
      status: checkin.status,
      completionStatus: checkin.completion_status ?? 'complete',
      mountainName: mountain?.name?.trim() || (hasProof ? '已留证山行' : '未关联山行'),
      province: mountain?.province?.trim() || (hasProof ? '未知地点' : '未留证'),
      createdAt: checkin.verified_at || checkin.created_at,
      altitudeM: Math.round(checkinMaxAltitude ?? mountainAltitude ?? 0),
      photoUrl: checkin.photo_url ?? mountain?.cover_image ?? checkin.poster_url ?? null,
    }
  })
}
