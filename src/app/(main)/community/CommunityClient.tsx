'use client'

import { useState, useTransition } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { MountainImagePlaceholder } from '@/components/ui/MountainUI'
import SharePosterButton from '@/components/ui/SharePosterButton'

const DIFF_COLOR: Record<string, string> = {
  beginner: '#52B788',
  intermediate: '#F4A261',
  advanced: '#E76F51',
  expert: '#E63946',
}

const DIFF_LABEL: Record<string, string> = {
  beginner: '入门', intermediate: '中级', advanced: '高级', expert: '专家',
}

const LICENSE_ICON: Record<string, string> = {
  none: '', basic: '◉', intermediate: '◈', advanced: '★',
}

type Checkin = {
  id: string
  note: string | null
  type: string
  created_at: string
  mountains: { id: string; name: string; altitude: number; province: string; difficulty: string } | null
  profiles: { id: string; username: string; province: string; license_level: string; mountain_count: number } | null
}

type PostMeta = { id: string; like_count: number; comment_count: number }

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

// 单条动态卡片
function PostCard({
  checkin,
  postMeta,
  isLiked: initLiked,
  currentUserId,
}: {
  checkin: Checkin
  postMeta: PostMeta | null
  isLiked: boolean
  currentUserId: string | null
}) {
  const supabase = createSupabaseBrowserClient()
  const [liked, setLiked] = useState(initLiked)
  const [likeCount, setLikeCount] = useState(postMeta?.like_count ?? 0)
  const [showComment, setShowComment] = useState(false)
  const [comments, setComments] = useState<{ id: string; content: string; profiles: { username: string } | null; created_at: string }[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComment, setLoadingComment] = useState(false)
  const [isPending, startTransition] = useTransition()

  const m = checkin.mountains
  const p = checkin.profiles

  async function toggleLike() {
    if (!currentUserId || !postMeta) return
    startTransition(async () => {
      if (liked) {
        await supabase.from('likes').delete().eq('post_id', postMeta.id).eq('user_id', currentUserId)
        await supabase.from('posts').update({ like_count: likeCount - 1 }).eq('id', postMeta.id)
        setLikeCount(c => c - 1)
      } else {
        await supabase.from('likes').insert({ post_id: postMeta.id, user_id: currentUserId })
        await supabase.from('posts').update({ like_count: likeCount + 1 }).eq('id', postMeta.id)
        setLikeCount(c => c + 1)
      }
      setLiked(v => !v)
    })
  }

  async function loadComments() {
    if (showComment) { setShowComment(false); return }
    if (!postMeta) return
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, profiles(username)')
      .eq('post_id', postMeta.id)
      .order('created_at', { ascending: true })
      .limit(20)
    setComments((data ?? []) as any)
    setShowComment(true)
  }

  async function submitComment() {
    if (!commentText.trim() || !currentUserId || !postMeta) return
    setLoadingComment(true)
    const { data } = await supabase
      .from('comments')
      .insert({ post_id: postMeta.id, user_id: currentUserId, content: commentText.trim() })
      .select('id, content, created_at, profiles(username)')
      .single()
    if (data) setComments(c => [...c, data as any])
    setCommentText('')
    setLoadingComment(false)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      marginBottom: 12,
      position: 'relative',
    }}>
      {/* 左侧纵向执照色条 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: m ? DIFF_COLOR[m.difficulty] ?? 'var(--green-primary)' : 'var(--green-primary)',
      }} />

      <div style={{ padding: '14px 14px 14px 18px' }}>

        {/* 顶部：用户信息行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* 像素头像 */}
            <div style={{
              width: 36, height: 36, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--green-primary), #0a1a0a)',
              border: '1px solid var(--green-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {p?.province ? p.province.slice(0, 1) : '⛰'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="font-pixel" style={{ fontSize: 8, color: 'var(--text-primary)' }}>
                  {p?.username ?? '匿名'}
                </span>
                {p?.license_level && LICENSE_ICON[p.license_level] && (
                  <span style={{ fontSize: 8, color: 'var(--green-neon)' }}>
                    {LICENSE_ICON[p.license_level]}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginTop: 2 }}>
                {p?.province} · {p?.mountain_count ?? 0}座 · {timeAgo(checkin.created_at)}
              </div>
            </div>
          </div>
          {/* 打卡类型徽章 */}
          <div style={{
            fontFamily: 'Share Tech Mono', fontSize: 9,
            padding: '2px 7px',
            background: checkin.type === 'gps' ? 'rgba(57,255,20,0.1)' : 'rgba(244,162,97,0.1)',
            border: `1px solid ${checkin.type === 'gps' ? 'rgba(57,255,20,0.3)' : 'rgba(244,162,97,0.3)'}`,
            color: checkin.type === 'gps' ? 'var(--green-neon)' : '#F4A261',
          }}>
            {checkin.type === 'gps' ? '📍 GPS' : '📷 照片'}
          </div>
        </div>

        {/* 山峰信息主体 */}
        {m && (
          <div style={{
            display: 'flex', gap: 10, marginBottom: 12,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderLeft: `2px solid ${DIFF_COLOR[m.difficulty] ?? 'var(--green-primary)'}`,
            padding: 10,
          }}>
            {/* 山峰小图 */}
            <div style={{ width: 60, flexShrink: 0 }}>
              <MountainImagePlaceholder name={m.name} altitude={m.altitude} size="sm" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-pixel" style={{ fontSize: 9, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.6 }}>
                ▲ {m.name}
              </div>
              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                {m.province} · {m.altitude.toLocaleString()}m
              </div>
              <span style={{
                fontFamily: 'Press Start 2P', fontSize: 7,
                color: DIFF_COLOR[m.difficulty],
                background: `${DIFF_COLOR[m.difficulty]}18`,
                border: `1px solid ${DIFF_COLOR[m.difficulty]}40`,
                padding: '1px 6px',
              }}>
                {DIFF_LABEL[m.difficulty]}
              </span>
            </div>
          </div>
        )}

        {/* 打卡感言 */}
        {checkin.note && (
          <div style={{
            fontFamily: 'Share Tech Mono', fontSize: 11,
            color: 'var(--text-primary)',
            lineHeight: 1.8, marginBottom: 12,
            padding: '8px 10px',
            background: 'rgba(45,106,79,0.05)',
            borderLeft: '2px solid rgba(45,106,79,0.3)',
          }}>
            "{checkin.note}"
          </div>
        )}

        {/* 底部互动栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          paddingTop: 10,
          borderTop: '1px solid var(--border-color)',
        }}>
          {/* 点赞 */}
          <button
            onClick={toggleLike}
            disabled={!currentUserId || !postMeta || isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent', border: 'none', cursor: currentUserId && postMeta ? 'pointer' : 'default',
              padding: 0,
            }}
          >
            <span style={{ fontSize: 14, filter: liked ? 'none' : 'grayscale(0.8)' }}>
              {liked ? '❤️' : '🤍'}
            </span>
            <span style={{
              fontFamily: 'Share Tech Mono', fontSize: 10,
              color: liked ? '#E63946' : 'var(--text-muted)',
            }}>
              {likeCount}
            </span>
          </button>

          {/* 评论 */}
          <button
            onClick={loadComments}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <span style={{ fontSize: 14 }}>💬</span>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
              {postMeta?.comment_count ?? 0}
            </span>
          </button>

          {/* 分享海报按钮 */}
          <div style={{ marginLeft: 'auto' }}>
            <SharePosterButton
              checkinId={checkin.id}
              mountainName={checkin.mountains?.name ?? '山峰'}
            />
          </div>
        </div>

        {/* 评论区 */}
        {showComment && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
            {comments.length === 0 && (
              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
                暂无评论，来说第一句
              </div>
            )}
            {comments.map(c => (
              <div key={c.id} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                <div style={{
                  width: 20, height: 20, flexShrink: 0,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10,
                }}>⛰</div>
                <div>
                  <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--green-bright)', marginRight: 6 }}>
                    {(c.profiles as any)?.username ?? '匿名'}
                  </span>
                  <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-primary)' }}>
                    {c.content}
                  </span>
                </div>
              </div>
            ))}
            {currentUserId && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="说点什么..."
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  style={{
                    flex: 1, padding: '7px 10px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderBottom: '2px solid var(--green-primary)',
                    color: 'var(--text-primary)',
                    fontFamily: 'Share Tech Mono', fontSize: 11,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={submitComment}
                  disabled={loadingComment || !commentText.trim()}
                  className="pixel-btn"
                  style={{ padding: '7px 12px', fontSize: 8 }}
                >
                  发送
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 空状态
function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⛰</div>
      <div className="font-pixel" style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 2.5 }}>
        还没有人分享登顶记录<br />去出发页打卡吧！
      </div>
    </div>
  )
}

// 主客户端组件
export default function CommunityClient({
  checkins,
  postMap,
  likedIds,
  currentUserId,
}: {
  checkins: Checkin[]
  postMap: Record<string, PostMeta>
  likedIds: string[]
  currentUserId: string | null
}) {
  const likedSet = new Set(likedIds)
  const [filter, setFilter] = useState<'all' | 'gps' | 'photo'>('all')

  const filtered = checkins.filter(c =>
    filter === 'all' || c.type === filter
  )

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* 筛选标签 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([
          { key: 'all', label: '全部' },
          { key: 'gps', label: '📍 GPS打卡' },
          { key: 'photo', label: '📷 照片打卡' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '4px 10px',
              fontFamily: 'Press Start 2P', fontSize: 7,
              background: filter === f.key ? 'var(--green-primary)' : 'transparent',
              color: filter === f.key ? 'var(--text-primary)' : 'var(--text-muted)',
              border: `1px solid ${filter === f.key ? 'var(--green-primary)' : 'var(--border-color)'}`,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 动态列表 */}
      {filtered.length === 0
        ? <EmptyState />
        : filtered.map(c => (
          <PostCard
            key={c.id}
            checkin={c}
            postMeta={postMap[c.id] ?? null}
            isLiked={likedSet.has(postMap[c.id]?.id ?? '')}
            currentUserId={currentUserId}
          />
        ))
      }
    </div>
  )
}
