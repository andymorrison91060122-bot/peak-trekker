import { createSupabaseAdminClient } from '../supabase-admin.ts'
import { findHighestTrackPoint, haversineMeters } from './track-stats.ts'
import type { MountainMatch, TrackPoint } from './types.ts'

type MountainMatchRow = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

const DEFAULT_MATCH_THRESHOLD_METERS = 5000
const DEFAULT_MAX_MATCH_CANDIDATES = 5

function isFiniteCoordinate(latitude: unknown, longitude: unknown) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
}

function getMatchAnchor(trackPoints: TrackPoint[]) {
  const anchor = findHighestTrackPoint(trackPoints)
  if (anchor && isFiniteCoordinate(anchor.latitude, anchor.longitude)) return anchor

  return [...trackPoints].reverse().find((point) => isFiniteCoordinate(point.latitude, point.longitude)) ?? null
}

export function matchNearestMountainCandidates(
  trackPoints: TrackPoint[],
  mountains: MountainMatchRow[],
  options: { maxCandidates?: number; thresholdMeters?: number } = {}
): MountainMatch[] {
  const anchor = getMatchAnchor(trackPoints)
  if (!anchor) return []

  const thresholdMeters = options.thresholdMeters ?? DEFAULT_MATCH_THRESHOLD_METERS
  const maxCandidates = Math.max(1, options.maxCandidates ?? DEFAULT_MAX_MATCH_CANDIDATES)

  return mountains
    .flatMap((mountain) => {
      const latitude = Number(mountain.latitude)
      const longitude = Number(mountain.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []

      return [
        {
          id: mountain.id,
          name: mountain.name,
          distanceMeters: Math.round(haversineMeters(anchor.latitude, anchor.longitude, latitude, longitude)),
        },
      ]
    })
    .filter((match) => match.distanceMeters <= thresholdMeters)
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
