'use client'

import { startTransition, useState } from 'react'
import { normalizeCommunityActionError } from '@/lib/community'
import { useAppToast } from '@/components/ui/AppToastProvider'

export default function LikeButton({
  postId,
  initialLiked,
  initialCount,
}: {
  postId: string
  initialLiked: boolean
  initialCount: number
}) {
  const { showToast } = useAppToast()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)

  function toggleLike() {
    if (pending) return

    const previousLiked = liked
    const previousCount = count
    const optimisticLiked = !liked

    setLiked(optimisticLiked)
    setCount(Math.max(0, count + (optimisticLiked ? 1 : -1)))
    setPending(true)

    startTransition(async () => {
      try {
        const response = await fetch('/api/community/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'toggle_post_like',
            postId,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(data?.error ?? '点赞失败，请稍后重试。'))
        }
        setLiked(Boolean(data.liked))
        setCount(Number(data.likeCount ?? count))
        showToast({ key: Boolean(data.liked) ? 'like_added' : 'like_removed' })
      } catch (error) {
        setLiked(previousLiked)
        setCount(previousCount)
        showToast({
          key: 'like_failure',
          message: normalizeCommunityActionError(error instanceof Error ? error.message : null, '点赞失败，请稍后重试。'),
        })
      } finally {
        setPending(false)
      }
    })
  }

  return (
    <button
      type="button"
      className="community-v2-like-button"
      data-liked={liked ? 'true' : 'false'}
      data-testid="community-like-button"
      aria-label={liked ? '取消点赞' : '点赞'}
      onClick={toggleLike}
      disabled={pending}
    >
      <svg viewBox="0 0 24 24" className="community-v2-like-button__icon" aria-hidden="true">
        <path
          d="M12 20.5s-7.4-4.6-9.4-9.5C1.5 8 3.5 5 6.6 5c1.9 0 3.6 1 4.4 2.7C11.8 6 13.5 5 15.4 5 18.5 5 20.5 8 19.4 11c-2 4.9-9.4 9.5-9.4 9.5z"
          fill={liked ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span>{count}</span>
    </button>
  )
}
