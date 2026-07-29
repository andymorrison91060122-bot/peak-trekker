import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getMountainDetailHeroImages } from '@/lib/mountain-media'
import { listWaypointsByMountain } from '@/lib/waypoints-queries'
import { listFeaturedPostsByMountain } from '@/lib/community-server'
import { listProfileTrips } from '@/lib/profile-records-server'
import { buildLicenseProgressSummary } from '@/lib/license-progress'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { normalizeApprovedRouteGeometry } from '@/lib/mountain-route-geometry'
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
  routeGeometryFixture?: string | string[]
}

function buildRouteGeometryQaFixture(
  mountainId: string,
  value: string | string[] | undefined,
) {
  const fixture = Array.isArray(value) ? value[0] : value
  if (fixture !== 'trace') return null

  const coordinates = [
    [
      [80.147, 42.733, 2180],
      [80.091, 42.681, 2460],
      [79.984, 42.612, 3020],
    ],
    [
      [79.984, 42.612, 3020],
      [79.842, 42.493, 3510],
      [79.712, 42.371, 2890],
    ],
  ]

  return normalizeApprovedRouteGeometry({
    id: 'qa-trace',
    mountain_id: mountainId,
    simplified_geometry: {
      type: 'MultiLineString',
      coordinates,
    },
    display_mode: 'trace_only',
    review_status: 'approved',
    point_count: coordinates.reduce((sum, line) => sum + line.length, 0),
    segment_count: coordinates.length,
  })
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
  const routeGeometryFixture = resolvedSearchParams.routeGeometryFixture
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [mountainRes, profileRes, waypointsRes, profileTrips, routeGeometryRes] = await Promise.all([
    supabase.from('mountains').select('*').eq('id', id).single(),
    user
      ? supabase.from('profiles').select('license_level').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
    listWaypointsByMountain(id).catch(() => []),
    user
      ? listProfileTrips({ supabase, userId: user.id }).catch(() => [])
      : Promise.resolve([]),
    supabase
      .from('mountain_route_geometries')
      .select('id, mountain_id, simplified_geometry, display_mode, review_status, point_count, segment_count')
      .eq('mountain_id', id)
      .eq('review_status', 'approved')
      .maybeSingle(),
  ])

  const mountain = mountainRes.data as Mountain | null
  if (!mountain) notFound()
  const routeGeometry = process.env.ENABLE_QA_TEST_HELPERS === 'true'
    ? buildRouteGeometryQaFixture(id, routeGeometryFixture)
        ?? (routeGeometryRes.error ? null : normalizeApprovedRouteGeometry(routeGeometryRes.data))
    : routeGeometryRes.error
      ? null
      : normalizeApprovedRouteGeometry(routeGeometryRes.data)

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
      routeGeometry={routeGeometry}
      featuredPosts={featuredPosts}
      heroImages={getMountainDetailHeroImages(mountain, 6)}
    />
  )
}
