import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getActivityDetail } from '@/lib/activity-server'
import ActivityDetailClient from '@/components/activity/ActivityDetailClient'

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkinId: string }>
  searchParams?: Promise<{ published?: string; mode?: string; postDeleted?: string; qaHero?: string }>
}) {
  const { checkinId } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?from=/activity/${checkinId}`)
  }

  const activity = await getActivityDetail({
    supabase,
    checkinId,
    userId: user.id,
  })

  if (!activity) {
    notFound()
  }

  const heroScenario =
    process.env.NODE_ENV !== 'production' &&
    (resolvedSearchParams?.qaHero === 'photo' ||
      resolvedSearchParams?.qaHero === 'mountain' ||
      resolvedSearchParams?.qaHero === 'solid')
      ? resolvedSearchParams.qaHero
      : 'default'

  return (
    <ActivityDetailClient
      activity={activity}
      profileBackHref="/profile#profile-records"
      published={resolvedSearchParams?.published === '1'}
      publishMode={resolvedSearchParams?.mode === 'updated' ? 'updated' : 'created'}
      postDeleted={resolvedSearchParams?.postDeleted === '1'}
      heroScenario={heroScenario}
    />
  )
}
