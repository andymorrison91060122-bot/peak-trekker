import { redirect } from 'next/navigation'
import TrekClient from './TrekClient'
import { buildAuthReturnTarget } from '@/lib/auth-redirect'
import { listReviewQueueRecords } from '@/lib/review-queue'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import AppToastProvider from '@/components/ui/AppToastProvider'

export default async function TrekPage({
  searchParams,
}: {
  searchParams: Promise<{ mountainId?: string }>
}) {
  const { mountainId } = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const search = mountainId ? `?mountainId=${encodeURIComponent(mountainId)}` : ''
    redirect(`/auth/login?from=${encodeURIComponent(buildAuthReturnTarget('/trek', search))}`)
  }

  const reviewQueueRecords = await listReviewQueueRecords({
    supabase,
    userId: user.id,
  })
  const { data: profile } = await supabase
    .from('profiles')
    .select('province')
    .eq('id', user.id)
    .single()

  return (
    <AppToastProvider>
      <TrekClient
        initialReviewQueueRecords={reviewQueueRecords}
        initialReviewQueueCount={reviewQueueRecords.length}
        userProvince={profile?.province ?? null}
      />
    </AppToastProvider>
  )
}
