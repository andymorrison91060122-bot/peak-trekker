'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useEffect, useState } from 'react'
import { normalizeCommunityActionError } from '@/lib/community'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { sanitizeCommunityLine, sanitizeCommunityUsername } from '@/components/community/communityRender'
import { useAppToast } from '@/components/ui/AppToastProvider'
import IconActionButton, { ActionGlyph } from '@/components/ui/IconActionButton'

const REPORT_REASONS = ['广告引流', '与登山无关', '违规内容', '侵犯隐私']

type LikeUser = {
  id: string
  username: string
  province: string
  avatarUrl?: string | null
  likedAt?: string
}

function AvatarCircle({
  username,
  avatarUrl,
  size = 30,
}: {
  username: string
  avatarUrl?: string | null
  size?: number
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={username}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          border: '2px solid rgba(13,15,17,0.92)',
          background: 'rgba(255,255,255,0.08)',
        }}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        border: '2px solid rgba(13,15,17,0.92)',
        background: 'linear-gradient(180deg, rgba(34,197,94,0.24), rgba(34,197,94,0.08))',
        color: 'var(--text-primary)',
        fontSize: Math.max(12, Math.floor(size * 0.38)),
        fontWeight: 800,
      }}
    >
      {username.slice(0, 1).toUpperCase()}
    </div>
  )
}

export default function CommunityPostActions({
  postId,
  detailUrl,
  initialLikeCount,
  initialLiked,
  isOwner,
  editHref,
  onDeleted,
  deleteRedirectHref,
  variant = 'feed',
}: {
  postId: string
  detailUrl: string
  initialLikeCount: number
  initialLiked: boolean
  isOwner: boolean
  editHref?: string
  onDeleted?: (postId: string) => void
  deleteRedirectHref?: string
  variant?: 'feed' | 'detail'
}) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const { showToast } = useAppToast()
  const [liked, setLiked] = useState(initialLiked)
  const [likeCount, setLikeCount] = useState(initialLikeCount)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [likers, setLikers] = useState<LikeUser[]>([])
  const [likersLoading, setLikersLoading] = useState(false)
  const [likersLoaded, setLikersLoaded] = useState(false)
  const [likeSheetOpen, setLikeSheetOpen] = useState(false)

  async function runAction(body: Record<string, unknown>) {
    const response = await fetch('/api/community/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(String(json?.error ?? '操作失败，请稍后重试。'))
    }
    return json
  }

  async function loadLikers(force = false) {
    if (likersLoading) return
    if (likersLoaded && !force) return

    setLikersLoading(true)
    try {
      const data = await runAction({
        action: 'list_post_likes',
        postId,
      })
      setLikers(Array.isArray(data.likers) ? (data.likers as LikeUser[]) : [])
      setLikersLoaded(true)
    } catch (error) {
      showToast({
        key: 'likers_load_failure',
        message: normalizeCommunityActionError(error instanceof Error ? error.message : null, '暂时无法加载点赞列表。'),
      })
    } finally {
      setLikersLoading(false)
    }
  }

  useEffect(() => {
    if (likeCount <= 0) {
      setLikers([])
      setLikersLoaded(false)
      return
    }

    void loadLikers()
    // We intentionally prefetch the first few likers so the avatar stack is ready in feed cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likeCount, postId])

  function toggleLike() {
    setIsPending(true)
    startTransition(async () => {
      try {
        const data = await runAction({
          action: 'toggle_post_like',
          postId,
        })
        setLiked(Boolean(data.liked))
        setLikeCount(Number(data.likeCount ?? likeCount))
        setLikersLoaded(false)
        if (!data.liked && Number(data.likeCount ?? likeCount) <= 0) {
          setLikers([])
        }
        showToast({ key: Boolean(data.liked) ? 'like_added' : 'like_removed' })
      } catch (error) {
        showToast({
          key: 'like_failure',
          message: normalizeCommunityActionError(error instanceof Error ? error.message : null, '点赞失败，请稍后重试。'),
        })
      } finally {
        setIsPending(false)
      }
    })
  }

  function sharePost() {
    const absoluteUrl = typeof window !== 'undefined' ? new URL(detailUrl, window.location.origin).toString() : detailUrl
    startTransition(async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: 'Peak Trekker 山友圈动态',
            text: '查看这条真实登山分享',
            url: absoluteUrl,
          })
          showToast({ key: 'share_invoked' })
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(absoluteUrl)
          showToast({ key: 'dynamic_link_copied' })
        } else {
          showToast({ key: 'share_unsupported' })
        }
      } catch {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(absoluteUrl)
          showToast({ key: 'dynamic_link_copied' })
          return
        }
        showToast({ key: 'share_unsupported' })
      }
    })
  }

  function deletePost() {
    if (!window.confirm('删除后，这条内容会从山友圈移除，但记录仍会保留在“我的登山记录”里。')) {
      return
    }

    setIsPending(true)
    startTransition(async () => {
      try {
        await runAction({
          action: 'delete_post',
          postId,
        })
        showToast({ key: 'delete_success' })
        onDeleted?.(postId)
        if (deleteRedirectHref) {
          window.location.assign(deleteRedirectHref)
          return
        }
        router.refresh()
      } catch (error) {
        const message = normalizeCommunityActionError(
          error instanceof Error ? error.message : null,
          '删除失败，请稍后重试。'
        )

        if (/row-level security|forbidden|删除失败/i.test(message)) {
          try {
            const directDelete = await supabase.from('posts').delete().eq('id', postId).select('id').maybeSingle()
            if (!directDelete.error) {
              const readBack = await supabase.from('posts').select('id').eq('id', postId).maybeSingle()
              if (readBack.error || readBack.data?.id === postId) {
                throw new Error(readBack.error?.message ?? '删除失败，请稍后重试。')
              }
              showToast({ key: 'delete_success' })
              onDeleted?.(postId)
              if (deleteRedirectHref) {
                window.location.assign(deleteRedirectHref)
                return
              }
              router.refresh()
              return
            }
          } catch {}
        }

        showToast({ key: 'delete_failure', message })
      } finally {
        setIsPending(false)
        setMenuOpen(false)
      }
    })
  }

  function reportPost(reason: string) {
    setIsPending(true)
    startTransition(async () => {
      try {
        await runAction({
          action: 'report_post',
          postId,
          reason,
        })
        showToast({ key: 'report_submitted' })
      } catch (error) {
        showToast({
          key: 'report_failure',
          message: normalizeCommunityActionError(error instanceof Error ? error.message : null, '举报失败，请稍后重试。'),
        })
      } finally {
        setIsPending(false)
        setMenuOpen(false)
      }
    })
  }

  const likePreview = likers.slice(0, 3)
  const likeSummaryLabel = likeCount > 0 ? `${likeCount} 人点赞` : '还没有点赞'

  return (
    <div className={`community-post-actions community-post-actions--${variant}`} data-testid="community-post-actions">
      <div className="community-post-actions__row">
        <div
          className="community-post-actions__summary"
          role="button"
          tabIndex={likeCount > 0 ? 0 : -1}
          onClick={() => {
            if (likeCount <= 0) return
            setLikeSheetOpen(true)
            void loadLikers()
          }}
          onKeyDown={(event) => {
            if (likeCount <= 0) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setLikeSheetOpen(true)
              void loadLikers()
            }
          }}
          style={{
            cursor: likeCount > 0 ? 'pointer' : 'default',
          }}
          aria-label={likeCount > 0 ? '查看点赞列表' : likeSummaryLabel}
        >
          <div className="community-post-actions__avatars" style={{ paddingRight: likePreview.length > 0 ? 6 : 0 }}>
            {likePreview.length > 0 ? (
              likePreview.map((liker, index) => (
                <div key={liker.id} style={{ marginLeft: index === 0 ? 0 : -10 }}>
                  <AvatarCircle username={sanitizeCommunityUsername(liker.username, '山友')} avatarUrl={liker.avatarUrl} size={30} />
                </div>
              ))
            ) : (
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  border: '2px solid rgba(13,15,17,0.92)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text-muted)',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                0
              </div>
            )}
          </div>
          <div className="community-post-actions__summary-copy">
            <span className="community-post-actions__summary-title">{likeSummaryLabel}</span>
            <span className="section-subtitle community-post-actions__summary-meta">
              {likeCount > 0 ? '点击查看点赞的山友' : '成为第一个点赞的人'}
            </span>
          </div>
        </div>

        <div className="community-post-actions__cluster">
          <IconActionButton
            active={liked}
            icon={<span style={{ fontSize: 18, lineHeight: 1 }}>{liked ? '♥' : '♡'}</span>}
            label={liked ? '取消点赞' : '点赞'}
            onClick={toggleLike}
            disabled={isPending}
            style={{
              color: liked ? 'var(--green-bright)' : 'var(--text-secondary)',
            }}
          />
          <IconActionButton icon={<ActionGlyph name="share" />} label="分享动态" onClick={sharePost} />
          <div style={{ position: 'relative' }}>
            <IconActionButton icon={<ActionGlyph name="more" />} label="更多操作" onClick={() => setMenuOpen((value) => !value)} />
            {menuOpen && (
              <div className="surface-card community-post-actions__menu">
                {isOwner ? (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {editHref && (
                      <Link
                        href={editHref}
                        className="community-post-actions__menu-item"
                        style={{ textDecoration: 'none' }}
                        onClick={() => setMenuOpen(false)}
                      >
                        <ActionGlyph name="edit" />
                        编辑内容
                      </Link>
                    )}
                    <button
                      type="button"
                      className="community-post-actions__menu-item"
                      onClick={deletePost}
                      disabled={isPending}
                    >
                      <ActionGlyph name="delete" />
                      从山友圈移除
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {REPORT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        className="community-post-actions__menu-item"
                        onClick={() => reportPost(reason)}
                        disabled={isPending}
                      >
                        <ActionGlyph name="report" />
                        举报 · {reason}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {likeSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="点赞的山友"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(8,10,12,0.72)',
            backdropFilter: 'blur(10px)',
          }}
          onClick={() => setLikeSheetOpen(false)}
        >
          <div
            className="surface-card"
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 'max(16px, env(safe-area-inset-bottom))',
              padding: 18,
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div className="card-title" style={{ fontSize: 18, marginBottom: 4 }}>点赞的山友</div>
                    <div className="section-subtitle">{likeSummaryLabel}</div>
                  </div>
                  <IconActionButton label="关闭" icon={<ActionGlyph name="close" />} onClick={() => setLikeSheetOpen(false)} />
                </div>

            {likersLoading ? (
              <div className="section-subtitle">正在加载点赞列表...</div>
            ) : likers.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {likers.map((liker) => {
                  const likerName = sanitizeCommunityUsername(liker.username, '山友')
                  const likerProvince = sanitizeCommunityLine(liker.province, '来自山友圈')
                  return (
                  <div
                    key={liker.id}
                    className="metric-tile"
                    style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <AvatarCircle username={likerName} avatarUrl={liker.avatarUrl} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{likerName}</div>
                      <div className="section-subtitle">{likerProvince}</div>
                    </div>
                  </div>
                  )
                })}
              </div>
            ) : (
              <div className="section-subtitle">这条动态暂时还没有新的点赞。</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
