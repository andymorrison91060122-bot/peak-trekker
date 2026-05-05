import { createSupabaseAdminClient } from '../supabase-admin.ts'
import { findHighestTrackPoint, haversineMeters } from './track-stats.ts'
import type { TrackPoint } from './types.ts'

type MountainMatchRow = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

export function matchNearestMountainFromRows(trackPoints: TrackPoint[], mountains: MountainMatchRow[]) {
  const anchor = findHighestTrackPoint(trackPoints)
  if (!anchor) return null

  const nearest = mountains
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
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0]

  if (!nearest || nearest.distanceMeters > 5000) return null
  return nearest
}

export async function matchNearestMountain(trackPoints: TrackPoint[]) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('mountains')
    .select('id, name, latitude, longitude')
    .eq('is_active', true)

  if (error) {
    throw new Error(error.message)
  }

  return matchNearestMountainFromRows(trackPoints, (data ?? []) as MountainMatchRow[])
}
