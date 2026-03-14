import { createSupabaseServerClient } from '@/lib/supabase-server'
import CommunityClient from './CommunityClient'

export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // 拉取已审核打卡记录（作为动态源），关联山峰和用户
  const { data: checkins } = await supabase
    .from('checkins')
    .select(`
      id, note, type, created_at,
      mountains(id, name, altitude, province, difficulty),
      profiles(id, username, province, license_level, mountain_count)
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(30)

  // 当前用户的点赞记录
  const { data: userLikes } = user
    ? await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.id)
    : { data: [] }

  const likedIds = new Set((userLikes ?? []).map((l: any) => l.post_id))

  // 点赞数（从 posts 表，如果有对应帖子）
  const { data: posts } = await supabase
    .from('posts')
    .select('id, checkin_id, like_count, comment_count')

  const postMap = new Map((posts ?? []).map((p: any) => [p.checkin_id, p]))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* 顶部 Banner */}
      <div style={{
        padding: '20px 16px 0',
        background: 'linear-gradient(180deg, #050f05 0%, var(--bg-primary) 100%)',
      }}>
        <div className="font-pixel" style={{ fontSize: 9, color: 'var(--green-neon)', textShadow: '0 0 8px var(--green-neon)', letterSpacing: 2, marginBottom: 4 }}>
          // COMMUNITY
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <div className="font-pixel" style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 6 }}>
              山友圈
            </div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
              {checkins?.length ?? 0} 条登顶记录
            </div>
          </div>
          {/* 省份热度小徽章 */}
          <div style={{
            fontFamily: 'Share Tech Mono', fontSize: 9,
            color: 'var(--green-bright)',
            background: 'rgba(45,106,79,0.12)',
            border: '1px solid rgba(45,106,79,0.3)',
            padding: '4px 10px',
          }}>
            🔥 四川最活跃
          </div>
        </div>

        {/* 顶部刻度装饰线 */}
        <div style={{
          height: '1px',
          background: 'repeating-linear-gradient(90deg, var(--green-primary) 0, var(--green-primary) 3px, transparent 3px, transparent 9px)',
          marginBottom: 16,
        }} />
      </div>

      <CommunityClient
        checkins={(checkins ?? []) as any}
        postMap={Object.fromEntries(postMap)}
        likedIds={[...likedIds]}
        currentUserId={user?.id ?? null}
      />
    </div>
  )
}
