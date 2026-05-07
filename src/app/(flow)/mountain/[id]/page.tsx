import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getMountainDetailHeroImages } from '@/lib/mountain-media'
import { listWaypointsByMountain } from '@/lib/waypoints-queries'
import { listFeaturedPostsByMountain } from '@/lib/community-server'
import type { CommunityPostViewModel, Mountain, User } from '@/types'
import type { Waypoint } from '@/lib/waypoints'
import type { WeatherCurrent, WeatherData, WeatherForecastDay } from '@/lib/weather/types'
import MountainDetailClient from './MountainDetailClient'

type MountainDetailMountain = Mountain & {
  weather_enabled?: boolean | null
}

type WeatherCacheRow = {
  weather_data: WeatherData | null
  fetched_at: string | null
}

export type MountainDetailWeather = {
  fetchedAt: string
  current: WeatherCurrent | null
  forecast: WeatherForecastDay[]
}

function sortWaypointsByElevation(waypoints: Waypoint[]) {
  return [...waypoints].sort((a, b) => {
    const aElevation = typeof a.elevation === 'number' ? a.elevation : Number.POSITIVE_INFINITY
    const bElevation = typeof b.elevation === 'number' ? b.elevation : Number.POSITIVE_INFINITY
    if (aElevation !== bElevation) return aElevation - bElevation
    return a.sort_order - b.sort_order
  })
}

async function loadWeatherCache(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  mountain: MountainDetailMountain
): Promise<MountainDetailWeather | null> {
  if (mountain.weather_enabled === false) return null

  try {
    const { data, error } = await supabase
      .from('weather_cache')
      .select('weather_data, fetched_at')
      .eq('mountain_id', mountain.id)
      .maybeSingle()

    if (error || !data) return null

    const row = data as WeatherCacheRow
    const forecast = row.weather_data?.forecast?.slice(0, 5) ?? []

    return {
      fetchedAt: row.fetched_at ?? row.weather_data?.fetchedAt ?? new Date().toISOString(),
      current: row.weather_data?.current ?? null,
      forecast,
    }
  } catch {
    return null
  }
}

async function loadFeaturedPosts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  mountainId: string
): Promise<CommunityPostViewModel[]> {
  try {
    return await listFeaturedPostsByMountain({
      supabase,
      mountainId,
      limit: 3,
    })
  } catch {
    return []
  }
}

export default async function MountainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [mountainRes, profileRes, waypointsRes] = await Promise.all([
    supabase.from('mountains').select('*').eq('id', id).single(),
    user
      ? supabase.from('profiles').select('license_level').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
    listWaypointsByMountain(id).catch(() => []),
  ])

  const mountain = mountainRes.data as MountainDetailMountain | null
  if (!mountain) notFound()

  const [weather, featuredPosts] = await Promise.all([
    loadWeatherCache(supabase, mountain),
    loadFeaturedPosts(supabase, mountain.id),
  ])

  return (
    <MountainDetailClient
      mountain={mountain}
      userLicense={(profileRes.data?.license_level ?? 'none') as User['license_level']}
      requiresLogin={!user}
      waypoints={sortWaypointsByElevation(waypointsRes)}
      weather={weather}
      featuredPosts={featuredPosts}
      heroImages={getMountainDetailHeroImages(mountain, 6)}
    />
  )
}
