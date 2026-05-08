'use client'

import type { ReactNode } from 'react'
import { startTransition, useEffect, useRef, useState } from 'react'
import { normalizeCommunityActionError } from '@/lib/community'
import { useAppToast } from '@/components/ui/AppToastProvider'
import { MoreIcon, ShareIcon } from '@/components/ui/Icons'
import LikeAvatarStack from '@/components/community/LikeAvatarStack'

type LikerApiUser = {
  id: string
  username?: string | null
  avatarUrl?: string | null
}

type LikedUser = {
  id: string
  avatar_url?: string | null
  username?: string | null
}

type InteractionBarProps = {
  postId: string
  detailUrl: string
  initialLiked: boolean
  initialCount: number
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  menu: ReactNode
}

const actionButtonStyle = {
  width: 24,
  height: 24,
  minWidth: 24,
  minHeight: 24,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: '#9ca3af',
  display: 'inline-grid',
  placeItems: 'center',
  cursor: 'pointer',
} as const

const disabledActionStyle = {
  opacity: 0.62,
  cursor: 'wait',
} as const

function HeartIcon({ liked }: { liked: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 20.5s-7.4-4.6-9.4-9.5C1.5 8 3.5 5 6.6 5c1.9 0 3.6 1 4.4 2.7C11.8 6 13.5 5 15.4 5 18.5 5 20.5 8 19.4 11c-2 4.9-9.4 9.5-9.4 9.5z"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function InteractionBar({
  postId,
  detailUrl,
  initialLiked,
  initialCount,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  menu,
}: InteractionBarProps) {
  const { showToast } = useAppToast()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)
  const [likedUsers, setLikedUsers] = useState<LikedUser[]>([])
  const [likersLoaded, setLikersLoaded] = useState(false)
  const [likersLoading, setLikersLoading] = useState(false)
  const detailHref = detailUrl.startsWith('http') ? detailUrl : detailUrl

  async function runAction(body: Record<string, unknown>) {
    const response = await fetch('/api/community/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(String(data?.error ?? '操作失败，请稍后重试。'))
    }
    return data
  }

  async function loadLikers() {
    if (count <= 0 || likersLoaded || likersLoading) return

    setLikersLoading(true)
    try {
      const data = await runAction({
        action: 'list_post_likes',
        postId,
      })
      const nextUsers = Array.isArray(data.likers)
        ? (data.likers as LikerApiUser[]).map((liker) => ({
            id: liker.id,
            username: liker.username ?? '山友',
            avatar_url: liker.avatarUrl ?? null,
          }))
        : []
      setLikedUsers(nextUsers)
      setLikersLoaded(true)
    } catch {
      setLikedUsers([])
      setLikersLoaded(true)
    } finally {
      setLikersLoading(false)
    }
  }

  useEffect(() => {
    if (count <= 0) {
      setLikedUsers([])
      setLikersLoaded(false)
      return
    }

    const node = rootRef.current
    if (!node) return

    if (!('IntersectionObserver' in window)) {
      void loadLikers()
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadLikers()
        observer.disconnect()
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, postId])

  function toggleLike() {
    if (pending) return

    const previousLiked = liked
    const previousCount = count
    const optimisticLiked = !liked
    const optimisticCount = Math.max(0, count + (optimisticLiked ? 1 : -1))

    setLiked(optimisticLiked)
    setCount(optimisticCount)
    setLikersLoaded(false)
    if (optimisticCount === 0) setLikedUsers([])
    setPending(true)

    startTransition(async () => {
      try {
        const data = await runAction({
          action: 'toggle_post_like',
          postId,
        })
        const nextCount = Number(data.likeCount ?? optimisticCount)
        setLiked(Boolean(data.liked))
        setCount(nextCount)
        setLikersLoaded(false)
        if (nextCount === 0) setLikedUsers([])
        showToast({ key: Boolean(data.liked) ? 'like_added' : 'like_removed' })
      } catch (error) {
        setLiked(previousLiked)
        setCount(previousCount)
        setLikersLoaded(false)
        showToast({
          key: 'like_failure',
          message: normalizeCommunityActionError(error instanceof Error ? error.message : null, '点赞失败，请稍后重试。'),
        })
      } finally {
        setPending(false)
      }
    })
  }

  function sharePost() {
    onMenuClose()
    const absoluteUrl = typeof window !== 'undefined' ? new URL(detailHref, window.location.origin).toString() : detailHref

    startTransition(async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: 'Peak Trekker 山友圈动态',
            text: '查看这条真实登山分享',
            url: absoluteUrl,
          })
          showToast({ key: 'share_invoked' })
          return
        }

        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(absoluteUrl)
          showToast({ key: 'dynamic_link_copied' })
          return
        }

        showToast({ key: 'share_unsupported' })
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

  return (
    <div
      ref={rootRef}
      data-testid="community-interaction-bar"
      style={{
        minHeight: 44,
        padding: '8px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minWidth: 0,
      }}
    >
      <div
        style={{
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <LikeAvatarStack likedUsers={likedUsers} totalCount={count} />
      </div>

      <div
        data-community-menu-root
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 16,
          flex: '0 0 auto',
        }}
      >
        <button
          type="button"
          data-testid="community-interaction-like"
          aria-label={liked ? '取消点赞' : '点赞'}
          onClick={toggleLike}
          disabled={pending}
          style={{
            ...actionButtonStyle,
            ...(pending ? disabledActionStyle : null),
            color: liked ? '#7ef0b4' : '#9ca3af',
          }}
        >
          <HeartIcon liked={liked} />
        </button>
        <button
          type="button"
          data-testid="community-interaction-share"
          aria-label="分享动态"
          onClick={sharePost}
          style={actionButtonStyle}
        >
          <ShareIcon size={24} />
        </button>
        <button
          type="button"
          data-testid="community-interaction-more"
          aria-label={menuOpen ? '关闭更多操作' : '更多操作'}
          onClick={onMenuToggle}
          style={actionButtonStyle}
        >
          <MoreIcon size={24} />
        </button>
        {menuOpen ? menu : null}
      </div>
    </div>
  )
}
