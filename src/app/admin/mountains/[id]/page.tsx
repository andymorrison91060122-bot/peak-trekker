import { notFound } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listWaypointsByMountain } from '@/lib/waypoints-queries'
import AdminMountainDetailClient from './AdminMountainDetailClient'

type AdminMountainRecord = {
  id: string
  name: string
  description: string | null
  altitude: number
  province: string
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  min_license: 'none' | 'basic' | 'intermediate' | 'advanced'
  checkin_count: number | null
  cover_image: string | null
  gallery_images: string[] | null
}

export default async function AdminMountainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const [{ data: mountain, error }, waypoints] = await Promise.all([
    supabase
      .from('mountains')
      .select('id, name, description, altitude, province, difficulty, min_license, checkin_count, cover_image, gallery_images')
      .eq('id', id)
      .maybeSingle(),
    listWaypointsByMountain(id),
  ])

  if (error) throw error
  if (!mountain) notFound()

  return (
    <AdminMountainDetailClient
      mountain={mountain as AdminMountainRecord}
      initialWaypoints={waypoints}
    />
  )
}
