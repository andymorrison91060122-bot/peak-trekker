'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useMemo, useState } from 'react'
import type { CommunityPostViewModel } from '@/types'
import { normalizeCommunityActionError } from '@/lib/community'
import { sanitizeCommunityText, sanitizeCommunityUsername } from '@/components/community/communityRender'
import { useAppToast } from '@/components/ui/AppToastProvider'
import ActivityStatStrip from '@/components/community/ActivityStatStrip'
import AuthorStrip from '@/components/community/AuthorStrip'
import InteractionBar from '@/components/community/InteractionBar'
import MediaBlock from '@/components/community/MediaBlock'
import MountainBindRow from '@/components/community/MountainBindRow'
import PostBody from '@/components/community/PostBody'

function getPostMedia(post: CommunityPostViewModel) {
  return post.assets.filter((asset) => asset.type === 'image' || asset.type === 'video')
}

export default function CommunityCard({
  post,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onDeleted,
}: {
  post: CommunityPostViewModel
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onDeleted: (postId: string) => void
}) {
  const router = useRouter()
  const { showToast } = useAppToast()
  const [pending, setPending] = useState(false)
  const authorName = sanitizeCommunityUsername(post.author.username, '山友')
  const bodyText = sanitizeCommunityText(post.body || post.note || '')
  const media = useMemo(() => getPostMedia(post), [post])
  const mountain = {
    name: post.mountain?.name ?? '未知山峰',
    location: post.mountain?.province ?? '',
  }
  const mountainHref = post.mountain?.id ? `/mountain/${post.mountain.id}` : '/explore'
  const activityHref = `/activity/${post.checkinId}`
  const detailHref = `/community/${post.id}`

  function runMenuAction(action: () => void) {
    onMenuClose()
    action()
  }

  function deletePost() {
    if (!window.confirm('删除后，这条内容会从山友圈移除，活动记录仍会保留。')) {
      return
    }

    setPending(true)
    startTransition(async () => {
      try {
        const response = await fetch('/api/community/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_post',
            postId: post.id,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(data?.error ?? '删除失败，请稍后重试。'))
        }
        showToast({ key: 'delete_success' })
        onDeleted(post.id)
      } catch (error) {
        showToast({
          key: 'delete_failure',
          message: normalizeCommunityActionError(error instanceof Error ? error.message : null, '删除失败，请稍后重试。'),
        })
      } finally {
        setPending(false)
      }
    })
  }

  function reportPost() {
    setPending(true)
    startTransition(async () => {
      try {
        const response = await fetch('/api/community/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'report_post',
            postId: post.id,
            reason: '与登山无关',
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(data?.error ?? '举报失败，请稍后重试。'))
        }
        showToast({ key: 'report_submitted' })
      } catch (error) {
        showToast({
          key: 'report_failure',
          message: normalizeCommunityActionError(error instanceof Error ? error.message : null, '举报失败，请稍后重试。'),
        })
      } finally {
        setPending(false)
      }
    })
  }

  return (
    <article className="community-v2-card" data-testid="community-feed-card">
      <AuthorStrip
        name={authorName}
        avatarUrl={post.author.avatarUrl}
        time={post.publishedRelative}
        isMine={post.isOwner}
      />

      <MountainBindRow mountain={mountain} mountainHref={mountainHref} />
      <PostBody text={bodyText} />
      <MediaBlock media={media} title={post.title || mountain.name} />
      <ActivityStatStrip metrics={post.metrics} />

      <InteractionBar
        postId={post.id}
        detailUrl={detailHref}
        initialLiked={post.isLiked}
        initialCount={post.likeCount}
        menuOpen={menuOpen}
        onMenuToggle={onMenuToggle}
        onMenuClose={onMenuClose}
        menu={
          <div className="community-v2-card-menu" data-testid="community-card-menu" role="menu">
            {post.isOwner ? (
              <>
                <button
                  type="button"
                  className="community-v2-card-menu__item"
                  role="menuitem"
                  onClick={() => runMenuAction(() => router.push(activityHref))}
                >
                  查看活动详情
                </button>
                <div className="community-v2-card-menu__divider" />
                <button
                  type="button"
                  className="community-v2-card-menu__item community-v2-card-menu__item--danger"
                  role="menuitem"
                  onClick={() => runMenuAction(deletePost)}
                  disabled={pending}
                >
                  删除
                </button>
              </>
            ) : (
              <button
                type="button"
                className="community-v2-card-menu__item community-v2-card-menu__item--danger"
                role="menuitem"
                onClick={() => runMenuAction(reportPost)}
                disabled={pending}
              >
                举报
              </button>
            )}
          </div>
        }
      />
    </article>
  )
}
