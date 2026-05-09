import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCommunityPostDetail } from '@/lib/community-server'
import AppToastProvider from '@/components/ui/AppToastProvider'
import CommunityDetailClient from './CommunityDetailClient'

export default async function CommunityPostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const post = await getCommunityPostDetail({
    supabase,
    postId,
    viewerId: user?.id ?? null,
  })

  return (
    <AppToastProvider>
      <CommunityDetailClient post={post} />
    </AppToastProvider>
  )
}
