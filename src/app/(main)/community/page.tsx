import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listCommunityPosts } from '@/lib/community-server'
import CommunityClient from './CommunityClient'

export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const posts = await listCommunityPosts({
    supabase,
    viewerId: user?.id ?? null,
    limit: 80,
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: 'var(--space-5) var(--space-5) calc(var(--space-12) * 2 + var(--space-2))' }}>
      <div className="community-page__header">
        <div className="font-pixel community-page__title">
          山友圈
        </div>
      </div>

      <CommunityClient
        initialPosts={posts}
        currentUserId={user?.id ?? null}
        emptyStateText="还没有山友分享动态"
      />
    </div>
  )
}
