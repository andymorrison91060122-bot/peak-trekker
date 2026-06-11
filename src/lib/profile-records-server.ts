import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProfileV2TripPreview } from '@/components/profile/ProfileV2Client'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { resolveCheckinSource, type CheckinSource } from '@/lib/trek-utils'
import { resolveCheckinDisplayTitle } from '@/lib/checkin-display-title'

type AnySupabase = SupabaseClient

type MountainRelation = {
  id: string
  name: string | null
  altitude: number | string | null
  province: string | null
  difficulty?: string | null
  cover_image?: string | null
}

type ProfileCheckinRow = {
  id: string
  mountain_id: string | null
  type?: string | null
  source?: CheckinSource | string | null
  completion_status?: 'complete' | 'incomplete' | null
  created_at: string
  verified_at?: string | null
  photo_url: string | null
  poster_url?: string | null
  max_elevation_meters?: number | string | null
  track_name?: string | null
  mountains: MountainRelation | MountainRelation[] | null
}

const PROFILE_TRIP_SELECT_VARIANTS = [
  `
    id, mountain_id, type, source, completion_status, created_at, verified_at, photo_url, poster_url, max_elevation_meters, track_name,
    mountains(id, name, altitude, province, difficulty, cover_image)
  `,
  `
    id, mountain_id, type, created_at, verified_at, photo_url, max_elevation_meters, track_name,
    mountains(id, name, altitude, province, difficulty, cover_image)
  `,
  `
    id, mountain_id, type, created_at, photo_url,
    mountains(id, name, altitude, province, difficulty, cover_image)
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
    const mountainAltitude = toNumber(mountain?.altitude)
    const checkinMaxAltitude = toNumber(checkin.max_elevation_meters)
    const displayTitle = resolveCheckinDisplayTitle({
      mountainName: mountain?.name,
      trackName: checkin.track_name,
    })

    return {
      checkinId: checkin.id,
      mountainId: checkin.mountain_id,
      completionStatus: checkin.completion_status ?? 'complete',
      sourceType: resolveCheckinSource({ source: checkin.source, type: checkin.type }),
      verifiedAt: checkin.verified_at ?? null,
      difficulty: mountain?.difficulty ?? null,
      mountainName: displayTitle.title,
      titleSource: displayTitle.titleSource,
      unmatchedTag: displayTitle.unmatchedTag,
      province: displayTitle.titleSource === 'mountain'
        ? (mountain?.province?.trim() || '未知地点')
        : displayTitle.secondaryLocation,
      createdAt: checkin.verified_at || checkin.created_at,
      altitudeM: Math.round(checkinMaxAltitude ?? mountainAltitude ?? 0),
      photoUrl: checkin.photo_url ?? mountain?.cover_image ?? checkin.poster_url ?? null,
    }
  })
}
