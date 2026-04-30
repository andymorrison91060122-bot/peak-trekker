import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionGlyph, IconActionLink } from '@/components/ui/IconActionButton'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listCommunityPostsByAuthor } from '@/lib/community-server'
import CommunityClient from '../../CommunityClient'

function AuthorAvatar({
  username,
  avatarUrl,
  province,
}: {
  username: string
  avatarUrl?: string | null
  province?: string | null
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={username}
        style={{ width: 72, height: 72, borderRadius: 24, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)' }}
      />
    )
  }

  return (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 24,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, rgba(34,197,94,0.22), rgba(34,197,94,0.08))',
        border: '1px solid rgba(34,197,94,0.22)',
        fontWeight: 800,
        fontSize: 24,
        color: 'var(--text-primary)',
      }}
    >
      {(province || username || '山').slice(0, 1)}
    </div>
  )
}

export default async function CommunityUserPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, posts] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, province, license_level, mountain_count, avatar_url')
      .eq('id', userId)
      .maybeSingle(),
    listCommunityPostsByAuthor({
      supabase,
      authorUserId: userId,
      viewerId: user?.id ?? null,
    }),
  ])

  const typedProfile = profile as {
    id: string
    username: string | null
    province: string | null
    license_level: string | null
    mountain_count: number | null
    avatar_url: string | null
  } | null

  if (!typedProfile) {
    notFound()
  }

  const realtimeCount = posts.filter((post) => post.sourceType === 'realtime_gps').length
  const totalLikes = posts.reduce((sum, post) => sum + post.likeCount, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <IconActionLink href="/community" label="返回山友圈" icon={<ActionGlyph name="back" />} />
        {user?.id === userId && (
          <div className="page-toolbar__actions">
            <Link href="/profile" className="muted-chip" style={{ textDecoration: 'none' }}>
              查看我的主页
            </Link>
          </div>
        )}
      </div>

      <div className="surface-card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <AuthorAvatar
              username={typedProfile.username ?? '匿名登山者'}
              avatarUrl={typedProfile.avatar_url}
              province={typedProfile.province}
            />
            <div>
              <div className="font-pixel" style={{ fontSize: 26, marginBottom: 6 }}>
                {typedProfile.username ?? '匿名登山者'}
              </div>
              <div className="section-subtitle">
                {typedProfile.province ?? '未知省份'} · 执照 {typedProfile.license_level ?? 'none'}
              </div>
            </div>
          </div>
          <div className="section-subtitle" style={{ maxWidth: 360 }}>
            这里只展示与真实登山记录绑定的公开分享，方便你快速了解这位山友去过哪些山、发过哪些真实记录。
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {[
            { label: '公开分享', value: posts.length },
            { label: 'GPS 记录', value: realtimeCount },
            { label: '累计获赞', value: totalLikes },
          ].map((item) => (
            <div key={item.label} className="metric-tile">
              <div className="metric-value">{item.value}</div>
              <div className="metric-label">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="surface-card" style={{ padding: 24 }}>
          <div className="font-pixel" style={{ fontSize: 18, marginBottom: 6 }}>
            这位山友还没有公开分享
          </div>
          <div className="section-subtitle">
            等他发布真实登山记录后，这里会展示完整的山友圈内容流。
          </div>
        </div>
      ) : (
        <CommunityClient initialPosts={posts} currentUserId={user?.id ?? null} />
      )}
    </div>
  )
}
