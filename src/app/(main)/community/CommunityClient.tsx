'use client'

import { useEffect, useRef, useState } from 'react'
import type { CommunityPostViewModel } from '@/types'
import CommunityCard from '@/components/community/CommunityCard'
import CommunityCardSkeleton from '@/components/community/CommunityCardSkeleton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { MountainIcon } from '@/components/ui/Icons'

type CommunityViewState = 'populated' | 'empty' | 'loading'

function FeedHeader() {
  return (
    <div className="community-v2-feed-header" data-testid="community-feed-header">
      <div className="community-v2-feed-header__inner">
        <h1 className="community-v2-feed-header__title">山友圈</h1>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="community-v2-empty" data-testid="community-feed-empty">
      <div className="community-v2-empty__icon" aria-hidden="true">
        <MountainIcon size={28} />
      </div>
      <div className="community-v2-empty__title">还没有人发布山行</div>
      <div className="community-v2-empty__copy">
        山友圈里只有真实走过的山。
        <br />
        去找一座你想去的山,从那里开始。
      </div>
      <SecondaryButton as="a" href="/explore" className="community-v2-empty__cta">
        去探索
      </SecondaryButton>
    </div>
  )
}

function EndMarker() {
  return (
    <div className="community-v2-end-marker" data-testid="community-feed-end-marker">
      · 已经看完 ·
    </div>
  )
}

export default function CommunityClient({
  initialPosts,
  currentUserId,
  viewState,
}: {
  initialPosts: CommunityPostViewModel[]
  currentUserId: string | null
  viewState?: CommunityViewState
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const resolvedViewState: CommunityViewState = viewState ?? (posts.length > 0 ? 'populated' : 'empty')

  useEffect(() => {
    if (!openMenuPostId) return

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Element | null
      if (target?.closest('[data-community-menu-root]')) return
      setOpenMenuPostId(null)
    }

    function closeOnScroll() {
      setOpenMenuPostId(null)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('scroll', closeOnScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('scroll', closeOnScroll)
    }
  }, [openMenuPostId])

  function handleDeleted(postId: string) {
    setPosts((current) => current.filter((post) => post.id !== postId))
    setOpenMenuPostId(null)
  }

  return (
    <section className="community-v2-feed" data-testid="community-feed" data-viewer={currentUserId ? 'signed-in' : 'guest'}>
      <FeedHeader />
      <div ref={listRef} className="community-v2-feed__body" data-state={resolvedViewState} style={{ gap: 16 }}>
        {resolvedViewState === 'loading' ? (
          <>
            <CommunityCardSkeleton />
            <CommunityCardSkeleton />
            <CommunityCardSkeleton />
          </>
        ) : resolvedViewState === 'empty' ? (
          <EmptyState />
        ) : (
          <>
            {posts.map((post) => (
              <CommunityCard
                key={post.id}
                post={post}
                menuOpen={openMenuPostId === post.id}
                onMenuToggle={() => setOpenMenuPostId((current) => (current === post.id ? null : post.id))}
                onMenuClose={() => setOpenMenuPostId(null)}
                onDeleted={handleDeleted}
              />
            ))}
            <EndMarker />
          </>
        )}
      </div>
    </section>
  )
}
