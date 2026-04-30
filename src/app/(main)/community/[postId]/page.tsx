import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildCommunityMetricItems, buildCommunityRenderFallbackTitle, formatCommunityDate, resolveCommunityCardVariant } from '@/lib/community'
import { getCommunityPostDetail } from '@/lib/community-server'
import CommunityContentBlock from '@/components/community/CommunityContentBlock'
import CommunityMediaGallery from '@/components/community/CommunityMediaGallery'
import CommunityMetricsRow from '@/components/community/CommunityMetricsRow'
import CommunityMountainSourceField from '@/components/community/CommunityMountainSourceField'
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
import { ActionGlyph, IconActionLink } from '@/components/ui/IconActionButton'
import SecondaryButton from '@/components/ui/SecondaryButton'

function AuthorAvatar({
  username,
  avatarUrl,
}: {
  username: string
  avatarUrl?: string | null
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
      {username.slice(0, 1).toUpperCase()}
    </div>
  )
}

export default async function CommunityPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>
  searchParams?: Promise<{ published?: string; mode?: string }>
}) {
  const { postId } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const post = await getCommunityPostDetail({
    supabase,
    postId,
    viewerId: user?.id ?? null,
  })
  const authorHref = `/community/user/${post.author.id}`
  const showPublishFeedback = resolvedSearchParams?.published === '1'
  const isUpdated = resolvedSearchParams?.mode === 'updated'
  const activityHref = `/activity/${post.checkinId}`
  const authorName = sanitizeCommunityUsername(post.author.username, '山友')
  const detailTitle = sanitizeCommunityTitle(
    post.title,
    buildCommunityRenderFallbackTitle({
      mountainName: post.mountain?.name,
      sourceType: post.sourceType,
    })
  )
  const behaviorLine = sanitizeCommunityLine(post.behaviorText, post.mountain ? `去了 ${post.mountain.name}` : post.sourceLabel)
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
  const metrics = buildCommunityMetricItems({
    sourceType: post.sourceType,
    metrics: post.metrics,
    mountain: post.mountain,
  })
  return (
    <div
      data-community-post-id={post.id}
      style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: 'var(--space-5) var(--space-5) calc(var(--space-12) * 2 + var(--space-2))' }}
    >
      {showPublishFeedback && (
        <div className="surface-card community-detail__feedback">
          <div className="community-detail__feedback-row">
            <div>
              <div className="font-pixel community-detail__feedback-title">
                {isUpdated ? '分享已更新' : '发布成功'}
              </div>
              <div className="section-subtitle">
                {isUpdated
                  ? '你的山友圈内容已经更新。'
                  : '这条真实登山分享已经进入山友圈。'}
              </div>
            </div>
            <div className="community-detail__feedback-actions">
              <SecondaryButton as="a" href="/community">
                去山友圈
              </SecondaryButton>
            </div>
          </div>
        </div>
      )}

      <div className="page-toolbar">
        <IconActionLink href="/community" label="返回山友圈" icon={<ActionGlyph name="back" />} />
      </div>

      <div data-testid="community-detail" style={{ marginBottom: 'var(--space-4)' }}>
        <article className="surface-card community-detail-post-shell" data-testid="community-detail-post-shell">
          <div className="community-detail__header">
            <div className="community-card__header-main">
              <Link href={authorHref} style={{ textDecoration: 'none', color: 'inherit' }}>
                <AuthorAvatar username={authorName} avatarUrl={post.author.avatarUrl} />
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
            {post.visibility === 'private' ? <span className="muted-chip community-card__status">仅自己可见</span> : null}
          </div>

          <div className="community-detail__title">
            {detailTitle}
          </div>

          {(locationLine || post.mountain?.difficulty) ? (
            <div className="community-card__detail-row">
              {locationLine ? <div className="section-subtitle community-card__meta-line">{locationLine}</div> : null}
              <CommunityThresholdTag difficulty={post.mountain?.difficulty} />
            </div>
          ) : null}

          <div data-testid="community-detail-media">
            {cardVariant === 'route_map' ? (
              <MapPlaceholder
                title="路线轨迹"
                subtitle={post.mountain?.name ?? '本次记录'}
                height={320}
              />
            ) : cardVariant === 'no_image' ? (
              <CommunityNoImageCard
                mountainName={post.mountain?.name ?? null}
                sourceLabel={post.sourceLabel}
                variant="detail"
              />
            ) : (
              <CommunityMediaGallery assets={post.assets} coverUrl={post.coverUrl} title={post.title} previewMode="detail" />
            )}
          </div>

          <CommunityMetricsRow items={metrics} variant="detail" marginBottom={0} />

          {hasSummary ? <CommunityContentBlock content={summaryText} variant="detail" /> : null}

          {hasTags ? <CommunityTagBlock tags={post.tags} variant="detail" /> : null}

          <div className="community-detail-post-shell__actions" data-testid="community-detail-actions">
            <CommunityPostActions
              postId={post.id}
              detailUrl={`/community/${post.id}`}
              initialLikeCount={post.likeCount}
              initialLiked={post.isLiked}
              isOwner={post.isOwner}
              editHref={post.isOwner ? `/community/publish/${post.checkinId}` : undefined}
              deleteRedirectHref={post.isOwner ? `${activityHref}?postDeleted=1` : undefined}
              variant="detail"
            />
          </div>
        </article>
      </div>

      {post.mountain && post.isOwner ? (
        <div
          className="surface-card community-detail__related-actions-card"
          data-testid="community-related-actions"
          style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}
        >
          <div
            className="community-detail__source-actions"
            style={{ gap: 'var(--space-2)' }}
          >
            <SecondaryButton as="a" href={activityHref}>
              查看攀登记录
            </SecondaryButton>
          </div>
        </div>
      ) : null}

      {post.mountain && (
        <div
          className="surface-card community-detail__source-card"
          data-testid="community-record-source-card"
          style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}
        >
          <div className="community-detail__source-title">记录来源</div>
          <div className="community-detail__source-grid">
            <CommunityMountainSourceField
              label="山峰"
              value={post.mountain.name}
              href={`/explore/${post.mountain.id}`}
            />
            {[
              { label: '记录来源', value: post.sourceLabel },
              { label: '发布时间', value: formatCommunityDate(post.publishedAt) },
            ].map((item) => (
              <div key={item.label} className="community-detail__source-item">
                <div className="community-detail__source-label">{item.label}</div>
                <div className="community-detail__source-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
