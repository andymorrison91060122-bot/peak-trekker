'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CommunityPostViewModel } from '@/types'
import { buildCommunityMetricItems, buildCommunityRenderFallbackTitle, resolveCommunityCardVariant } from '@/lib/community'
import CommunityContentBlock from '@/components/community/CommunityContentBlock'
import CommunityMediaGallery from '@/components/community/CommunityMediaGallery'
import CommunityMetricsRow from '@/components/community/CommunityMetricsRow'
import CommunityNoImageCard from '@/components/community/CommunityNoImageCard'
import CommunityPostActions from '@/components/community/CommunityPostActions'
import CommunityTagBlock from '@/components/community/CommunityTagBlock'
import CommunityThresholdTag from '@/components/community/CommunityThresholdTag'
import {
  sanitizeCommunityLine,
  sanitizeCommunityText,
  sanitizeCommunityTitle,
  sanitizeCommunityUsername,
} from '@/components/community/communityRender'
import { MapPlaceholder } from '@/components/ui/MountainUI'

function clampTextStyle(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  }
}

function ProfileAvatar({
  username,
  avatarUrl,
  province,
}: {
  username: string
  avatarUrl?: string | null
  province: string
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={username}
        style={{
          width: 'var(--space-12)',
          height: 'var(--space-12)',
          borderRadius: 'var(--radius-lg)',
          objectFit: 'cover',
          border: '1px solid var(--color-outline)',
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: 'var(--space-12)',
        height: 'var(--space-12)',
        borderRadius: 'var(--radius-lg)',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-outline)',
        fontWeight: 800,
        color: 'var(--color-on-surface)',
      }}
    >
      {(province || username).slice(0, 1)}
    </div>
  )
}

function PostCard({
  post,
  onDeleted,
}: {
  post: CommunityPostViewModel
  onDeleted: (postId: string) => void
}) {
  const authorName = sanitizeCommunityUsername(post.author.username, '山友')
  const sanitizedTitle = sanitizeCommunityTitle(
    post.title,
    buildCommunityRenderFallbackTitle({
      mountainName: post.mountain?.name,
      sourceType: post.sourceType,
    })
  )
  const behaviorLine = sanitizeCommunityLine(post.behaviorText, post.mountain ? `去了 ${post.mountain.name}` : post.sourceLabel)
  const detailHref = `/community/${post.id}`
  const editHref = `/community/publish/${post.checkinId}`
  const authorHref = `/community/user/${post.author.id}`
  const locationLine = sanitizeCommunityLine(
    post.mountain ? `${post.mountain.name} · ${post.mountain.province}` : post.author.province,
    post.mountain?.province ?? ''
  )
  const summaryText = sanitizeCommunityText(post.body || post.note || '')
  const hasSummary = summaryText.length > 0
  const hasTags = post.tags.length > 0
  const cardVariant = resolveCommunityCardVariant({
    sourceType: post.sourceType,
    assets: post.assets,
  })
  const showRouteCard = cardVariant === 'route_map'
  const showNoImageCard = cardVariant === 'no_image'
  const metrics = buildCommunityMetricItems({
    sourceType: post.sourceType,
    metrics: post.metrics,
    mountain: post.mountain,
  })

  return (
    <article className="surface-card community-card community-card--feed" data-testid="community-feed-card">
      <div className="community-card__header">
        <div className="community-card__header-main">
          <Link href={authorHref} style={{ textDecoration: 'none', color: 'inherit' }}>
            <ProfileAvatar
              username={authorName}
              avatarUrl={post.author.avatarUrl}
              province={post.author.province}
            />
          </Link>
          <div style={{ minWidth: 0 }}>
            <div className="community-card__identity-row">
              <div className="community-card__author-line">
                <Link href={authorHref} className="community-card__author-link" style={{ textDecoration: 'none' }}>
                  {authorName}
                </Link>
                <span className="section-subtitle">{post.publishedRelative}</span>
              </div>
              <span className="muted-chip community-card__source-pill">
                {post.sourceLabel}
              </span>
            </div>
            <div className="section-subtitle community-card__eyebrow">{behaviorLine}</div>
          </div>
        </div>
        {post.visibility === 'private' && (
          <span className="muted-chip community-card__status">仅自己可见</span>
        )}
      </div>

      <Link href={detailHref} className="community-card__title-link" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="community-card__title" style={clampTextStyle(2)}>
          {sanitizedTitle}
        </div>
      </Link>

      {(locationLine || post.mountain?.difficulty) ? (
        <div className="community-card__detail-row">
          {locationLine ? <div className="section-subtitle community-card__meta-line">{locationLine}</div> : null}
          <CommunityThresholdTag difficulty={post.mountain?.difficulty} />
        </div>
      ) : null}

      {showRouteCard ? (
        <Link href={detailHref} className="community-card__media-link" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="community-card__media community-card__media--feed">
            <MapPlaceholder
              title="路线概览"
              subtitle={post.trackPreview ? `${post.trackPreview.pointCount} 个轨迹点 · 路线仅供参考` : '先看路线轮廓和核心数据'}
              height={236}
            />
          </div>
        </Link>
      ) : showNoImageCard ? (
        <Link href={detailHref} className="community-card__media-link" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="community-card__media community-card__media--feed">
            <CommunityNoImageCard
              mountainName={post.mountain?.name ?? null}
              sourceLabel={post.sourceLabel}
            />
          </div>
        </Link>
      ) : (
        <Link href={detailHref} className="community-card__media-link" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div className="community-card__media community-card__media--feed">
            <CommunityMediaGallery
              assets={post.assets}
              coverUrl={post.coverUrl}
              title={post.title}
              compact
              previewMode="feed"
            />
          </div>
        </Link>
      )}

      <CommunityMetricsRow items={metrics} variant="feed" />

      {hasSummary ? <CommunityContentBlock content={summaryText} variant="feed" detailHref={detailHref} /> : null}

      {hasTags && (
        <div className="community-card__tags">
          <CommunityTagBlock tags={post.tags} variant="feed" />
        </div>
      )}

      <CommunityPostActions
        postId={post.id}
        detailUrl={detailHref}
        initialLikeCount={post.likeCount}
        initialLiked={post.isLiked}
        isOwner={post.isOwner}
        editHref={post.isOwner ? editHref : undefined}
        deleteRedirectHref={post.isOwner && post.checkinId ? `/activity/${post.checkinId}?postDeleted=1` : undefined}
        onDeleted={onDeleted}
        variant="feed"
      />
    </article>
  )
}

export default function CommunityClient({
  initialPosts,
  currentUserId,
  emptyStateText,
}: {
  initialPosts: CommunityPostViewModel[]
  currentUserId: string | null
  emptyStateText?: string
}) {
  const [posts, setPosts] = useState(initialPosts)

  function handleDeleted(postId: string) {
    setPosts((current) => current.filter((post) => post.id !== postId))
  }

  return (
    <div>
      {posts.length === 0 ? (
        <div className="surface-card community-empty-state">
          {emptyStateText ? (
            <div className="community-empty-state__body">{emptyStateText}</div>
          ) : (
            <>
              <div className="font-pixel community-empty-state__title">还没有公开分享</div>
              <div className="section-subtitle">
                {currentUserId
                  ? '先去完成下一次真实攀登，再把动态发到这里。'
                  : '登录后即可浏览真实登山分享。'}
              </div>
            </>
          )}
        </div>
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} onDeleted={handleDeleted} />
        ))
      )}
    </div>
  )
}
