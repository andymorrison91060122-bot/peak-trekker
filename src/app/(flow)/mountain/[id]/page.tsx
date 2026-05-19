import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getMountainDetailHeroImages } from '@/lib/mountain-media'
import { listWaypointsByMountain } from '@/lib/waypoints-queries'
import { listFeaturedPostsByMountain } from '@/lib/community-server'
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

  const mountain = mountainRes.data as Mountain | null
  if (!mountain) notFound()

  const featuredPosts = await loadFeaturedPosts(supabase, mountain.id)

  return (
    <MountainDetailClient
      mountain={mountain}
      userLicense={(profileRes.data?.license_level ?? 'none') as User['license_level']}
      requiresLogin={!user}
      waypoints={sortWaypointsByElevation(waypointsRes)}
      featuredPosts={featuredPosts}
      heroImages={getMountainDetailHeroImages(mountain, 6)}
    />
  )
}
