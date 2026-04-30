import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listAdminCommunityPosts, listCommunityReports } from '@/lib/community-server'
import AdminCommunityClient from './AdminCommunityClient'

export default async function AdminCommunityPage() {
  const supabase = await createSupabaseServerClient()

  const [posts, reports] = await Promise.all([
    listAdminCommunityPosts({
      supabase,
      limit: 80,
    }),
    listCommunityReports({
      supabase,
    }),
  ])

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          COMMUNITY OPS
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
          山友圈内容管理 · {posts.length} 条内容 · {reports.length} 条举报
        </div>
      </div>

      <AdminCommunityClient posts={posts} reports={reports} />
    </div>
  )
}
