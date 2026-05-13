import { createSupabaseAdminClient } from '../supabase-admin.ts'
import { checkImportMountainDistance } from './mountain-distance-check.ts'
import type { MountainMatch, TrackPoint } from './types.ts'

type MountainMatchRow = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

export const AUTO_MATCH_THRESHOLD_METERS = 5_000
const DEFAULT_MAX_MATCH_CANDIDATES = 5

export function matchNearestMountainCandidates(
  trackPoints: TrackPoint[],
  mountains: MountainMatchRow[],
  options: { maxCandidates?: number; thresholdMeters?: number } = {}
): MountainMatch[] {
  const thresholdMeters = options.thresholdMeters ?? AUTO_MATCH_THRESHOLD_METERS
  const maxCandidates = Math.max(1, options.maxCandidates ?? DEFAULT_MAX_MATCH_CANDIDATES)

  return mountains
    .flatMap((mountain) => {
      const distanceCheck = checkImportMountainDistance(trackPoints, mountain, { thresholdMeters })
      if (!distanceCheck.valid || distanceCheck.distanceMeters === null) return []

      return [
        {
          id: mountain.id,
          name: mountain.name,
          distanceMeters: distanceCheck.distanceMeters,
          ...(distanceCheck.referencePoint?.source ? { referencePointSource: distanceCheck.referencePoint.source } : {}),
        },
      ]
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, maxCandidates)
}

export function matchNearestMountainFromRows(trackPoints: TrackPoint[], mountains: MountainMatchRow[]) {
  return matchNearestMountainCandidates(trackPoints, mountains)[0] ?? null
}

export async function matchNearestMountainCandidatesForTrack(
  trackPoints: TrackPoint[],
  options: { maxCandidates?: number; thresholdMeters?: number } = {}
) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('mountains')
    .select('id, name, latitude, longitude')
    .eq('is_active', true)

  if (error) {
    throw new Error(error.message)
  }

  return matchNearestMountainCandidates(trackPoints, (data ?? []) as MountainMatchRow[], options)
}

export async function matchNearestMountain(trackPoints: TrackPoint[]) {
  return (await matchNearestMountainCandidatesForTrack(trackPoints))[0] ?? null
}
