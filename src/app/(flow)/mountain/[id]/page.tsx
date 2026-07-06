import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getMountainDetailHeroImages } from '@/lib/mountain-media'
import { listWaypointsByMountain } from '@/lib/waypoints-queries'
import { listFeaturedPostsByMountain } from '@/lib/community-server'
import { listProfileTrips } from '@/lib/profile-records-server'
import { buildLicenseProgressSummary } from '@/lib/license-progress'
import { isFeatureEnabled } from '@/lib/feature-flags'
import type { CommunityPostViewModel, Mountain, User } from '@/types'
import type { Waypoint } from '@/lib/waypoints'
import MountainDetailClient from './MountainDetailClient'

function sortWaypointsByElevation(waypoints: Waypoint[]) {
  return [...waypoints].sort((a, b) => {
    const aElevation = typeof a.elevation === 'number' ? a.elevation : Number.POSITIVE_INFINITY
    const bElevation = typeof b.elevation === 'number' ? b.elevation : Number.POSITIVE_INFINITY
    if (aElevation !== bElevation) return aElevation - bElevation
    return a.sort_order - b.sort_order
  })
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

type MountainDetailSearchParams = {
  fu47bRouteMock?: string | string[]
  fu47bMapError?: string | string[]
}

function searchFlag(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] === '1' : value === '1'
}

export default async function MountainDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<MountainDetailSearchParams>
}) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const routeMockEnabled = process.env.NODE_ENV !== 'production' && searchFlag(resolvedSearchParams.fu47bRouteMock)
  const forceRouteMapError = process.env.NODE_ENV !== 'production' && searchFlag(resolvedSearchParams.fu47bMapError)
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [mountainRes, profileRes, waypointsRes, profileTrips] = await Promise.all([
    supabase.from('mountains').select('*').eq('id', id).single(),
    user
      ? supabase.from('profiles').select('license_level').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
    listWaypointsByMountain(id).catch(() => []),
    user
      ? listProfileTrips({ supabase, userId: user.id }).catch(() => [])
      : Promise.resolve([]),
  ])

  const mountain = mountainRes.data as Mountain | null
  if (!mountain) notFound()

  const featuredPosts = isFeatureEnabled('COMMUNITY_ENABLED')
    ? await loadFeaturedPosts(supabase, mountain.id)
    : []

  return (
    <MountainDetailClient
      mountain={mountain}
      userLicense={(profileRes.data?.license_level ?? 'none') as User['license_level']}
      licenseProgress={buildLicenseProgressSummary({
        storedLevel: profileRes.data?.license_level ?? 'none',
        records: profileTrips,
      })}
      requiresLogin={!user}
      waypoints={sortWaypointsByElevation(waypointsRes)}
      featuredPosts={featuredPosts}
      heroImages={getMountainDetailHeroImages(mountain, 6)}
      routeMockEnabled={routeMockEnabled}
      forceRouteMapError={forceRouteMapError}
    />
  )
}
