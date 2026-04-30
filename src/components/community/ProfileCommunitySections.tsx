'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommunityPostViewModel, PublishableRecord } from '@/types'
import { buildCommunityMetricItems, buildCommunityRenderFallbackTitle, formatCommunityDate, formatCommunityDuration, resolveCommunityCardVariant } from '@/lib/community'
import CommunityContentBlock from '@/components/community/CommunityContentBlock'
import CommunityMediaGallery from '@/components/community/CommunityMediaGallery'
import CommunityMetricsRow from '@/components/community/CommunityMetricsRow'
import CommunityNoImageCard from '@/components/community/CommunityNoImageCard'
import CommunityPostActions from '@/components/community/CommunityPostActions'
import {
  sanitizeCommunityLine,
  sanitizeCommunityText,
  sanitizeCommunityTitle,
} from '@/components/community/communityRender'
import IconButton from '@/components/ui/IconButton'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import SharePosterButton from '@/components/ui/SharePosterButton'
import TertiaryButton from '@/components/ui/TertiaryButton'
import { DifficultyBadge, MapPlaceholder, SectionHeader } from '@/components/ui/MountainUI'

export default function ProfileCommunitySections({
  initialRecords,
  initialPosts,
}: {
  initialRecords: PublishableRecord[]
  initialPosts: CommunityPostViewModel[]
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [showAllRecords, setShowAllRecords] = useState(false)
  const [showAllPosts, setShowAllPosts] = useState(false)
  const [openRecordMenuId, setOpenRecordMenuId] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)

  const records = useMemo(() => {
    const postMap = new Map(posts.map((post) => [post.checkinId, post]))
    return initialRecords.map((record) => {
      const post = postMap.get(record.checkinId)
      return {
        ...record,
        shareState: post ? ('published' as const) : ('unshared' as const),
        postId: post?.id ?? null,
        postVisibility: post?.visibility ?? null,
      }
    })
  }, [initialRecords, posts])

  const unsharedHistorical = records.filter(
    (record) => record.sourceType === 'historical_photo' && record.shareState === 'unshared'
  )
  const visibleRecords = showAllRecords ? records : records.slice(0, 3)
  const visiblePosts = showAllPosts ? posts : posts.slice(0, 3)

  function handleDeleted(postId: string) {
    setPosts((current) => current.filter((post) => post.id !== postId))
  }

  useEffect(() => {
    if (!openRecordMenuId) return

    function handlePointerDown(event: PointerEvent) {
      if (actionMenuRef.current?.contains(event.target as Node)) return
      setOpenRecordMenuId(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenRecordMenuId(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openRecordMenuId])

  return (
    <>
      <div id="profile-records" className="surface-card" style={{ padding: 16, marginBottom: 18, scrollMarginTop: 96 }}>
        <SectionHeader
          title="我的登山记录"
          description="这里保留你每次真实完成的攀登记录；是否发布到山友圈，是之后再决定的派生动作。"
          action={
            records.length > 3 ? (
              <button
                type="button"
                className="secondary-btn"
                style={{ minHeight: 40, padding: '0 12px' }}
                onClick={() => setShowAllRecords((value) => !value)}
              >
                {showAllRecords ? '收起记录' : '查看全部'}
              </button>
            ) : null
          }
        />
        {unsharedHistorical.length > 0 && (
          <div className="metric-tile" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="font-pixel" style={{ fontSize: 16, marginBottom: 4 }}>有新的补签记录可分享</div>
              <div className="section-subtitle">
                你有 {unsharedHistorical.length} 条审核通过的补签记录还没发到山友圈，海报和素材会自动带入发布页。
              </div>
            </div>
            <Link href={`/community/publish/${unsharedHistorical[0].checkinId}`} className="primary-btn" style={{ textDecoration: 'none' }}>
              去发布到山友圈
            </Link>
          </div>
        )}
        {records.length === 0 ? (
          <div className="metric-tile">
            <div className="font-pixel" style={{ fontSize: 18, marginBottom: 6 }}>你的首条记录会显示在这里</div>
            <div className="section-subtitle">
              完成实时登顶或补签审核通过后，就可以从这里补充内容并分享到山友圈。
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {visibleRecords.map((record) => (
              <div key={record.checkinId} className="surface-card profile-record-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <Link
                      href={`/activity/${record.checkinId}`}
                      className="font-pixel"
                      style={{ fontSize: 18, marginBottom: 4, color: 'var(--text-primary)', textDecoration: 'none', display: 'inline-flex' }}
                    >
                      {record.mountain.name}
                    </Link>
                    <div className="section-subtitle">
                      {record.mountain.province} · {formatCommunityDate(record.verifiedAt || record.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className={`muted-chip profile-record-card__state ${record.shareState === 'published' ? 'active' : ''}`}>
                      {record.shareState === 'published'
                        ? record.postVisibility === 'private'
                          ? '已发布 · 私密'
                          : '已发布 · 公开'
                        : '未发布'}
                    </span>
                    <DifficultyBadge level={record.mountain.difficulty} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                  {[
                    { label: '海拔', value: `${record.metrics.altitudeM.toLocaleString()} m` },
                    { label: '运动时长', value: formatCommunityDuration(record.metrics.durationSec) },
                    { label: '累计爬升', value: `${record.metrics.ascentM} m` },
                    { label: '路线距离', value: `${record.metrics.distanceKm.toFixed(1)} km` },
                  ].map((item) => (
                    <div key={item.label} className="metric-tile" style={{ padding: '12px 10px' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{item.value}</div>
                      <div className="metric-label">{item.label}</div>
                    </div>
                  ))}
                </div>

                <div className="profile-record-card__footer">
                  <div className="section-subtitle profile-record-card__note" style={{ color: 'var(--text-secondary)' }}>
                    {record.note ? `攀登日记：${record.note}` : '还没有补充攀登日记，先保留记录本身和后续分享入口。'}
                  </div>
                  <div
                    className="profile-record-card__actions"
                    data-testid="profile-record-actions"
                  >
                    <PrimaryButton
                      as="a"
                      href={`/activity/${record.checkinId}`}
                      className="profile-record-card__action"
                    >
                      查看攀登记录
                    </PrimaryButton>
                    <div className="profile-record-card__utility">
                      <SharePosterButton
                        checkinId={record.checkinId}
                        mountainName={record.mountain.name}
                        initialPhotoUrl={record.photoUrl}
                        buttonLabel="分享素材"
                        triggerMode="icon"
                        triggerAriaLabel="分享素材"
                        triggerIcon="share"
                        triggerIconVariant="filled"
                        useTokenFooter
                      />
                    </div>
                    <div
                      ref={openRecordMenuId === record.checkinId ? actionMenuRef : null}
                      className="token-action-menu profile-record-card__overflow"
                      data-testid="profile-record-overflow-actions"
                    >
                      <IconButton
                        icon="more"
                        ariaLabel="更多操作"
                        variant="filled"
                        onClick={() =>
                          setOpenRecordMenuId((current) => (current === record.checkinId ? null : record.checkinId))
                        }
                      />
                      {openRecordMenuId === record.checkinId ? (
                        <div className="surface-card token-action-menu__panel" role="menu">
                          <div className="token-action-menu__content">
                            {record.postId ? (
                              <TertiaryButton
                                as="a"
                                href={`/community/${record.postId}`}
                                className="token-action-menu__item"
                                onClick={() => setOpenRecordMenuId(null)}
                              >
                                查看已发布内容
                              </TertiaryButton>
                            ) : (
                              <TertiaryButton
                                as="a"
                                href={`/community/publish/${record.checkinId}`}
                                className="token-action-menu__item"
                                onClick={() => setOpenRecordMenuId(null)}
                              >
                                发布到山友圈
                              </TertiaryButton>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
        <SectionHeader
          title="我的分享"
          description="这里保留你已经发出去的山友圈动态。"
          action={
            posts.length > 3 ? (
              <button
                type="button"
                className="secondary-btn"
                style={{ minHeight: 40, padding: '0 12px' }}
                onClick={() => setShowAllPosts((value) => !value)}
              >
                {showAllPosts ? '收起分享' : '查看全部'}
              </button>
            ) : null
          }
        />
        {posts.length === 0 ? (
          <div className="metric-tile">
            <div className="section-subtitle">
              还没有发布过山友圈内容。完成一条有效记录后，可以从上面的“我的登山记录”直接开始分享。
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {visiblePosts.map((post) => {
              const cardVariant = resolveCommunityCardVariant({
                sourceType: post.sourceType,
                assets: post.assets,
              })
              const shareTitle = sanitizeCommunityTitle(
                post.title,
                buildCommunityRenderFallbackTitle({
                  mountainName: post.mountain?.name,
                  sourceType: post.sourceType,
                })
              )
              const behaviorLine = sanitizeCommunityLine(post.behaviorText, post.mountain ? `去了 ${post.mountain.name}` : post.sourceLabel)
              const summaryText = sanitizeCommunityText(post.body || post.note || '')
              const hasSummary = summaryText.length > 0
              const metrics = buildCommunityMetricItems({
                sourceType: post.sourceType,
                metrics: post.metrics,
                mountain: post.mountain,
              })

              return (
              <div key={post.id} data-testid="profile-share-card" className="surface-card community-card community-card--profile-share" style={{ padding: 14 }}>
                <div className="community-card__header" style={{ marginBottom: 10 }}>
                  <div>
                    <Link href={`/community/${post.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div className="community-card__title community-card__title--compact" style={{ marginBottom: 4 }}>{shareTitle}</div>
                    </Link>
                    <div className="section-subtitle community-card__meta-line">
                      {behaviorLine} · {post.visibility === 'private' ? '仅自己可见' : '公开可见'}
                    </div>
                  </div>
                  <span className={`muted-chip community-card__status ${post.visibility === 'private' ? '' : 'active'}`}>
                    {post.visibility === 'private' ? '已发布 · 私密' : '已发布 · 公开'}
                  </span>
                </div>

                <div data-testid="profile-share-preview" className="profile-share-preview" style={{ marginBottom: 12 }}>
                  {cardVariant === 'route_map' ? (
                    <MapPlaceholder
                      title="路线概览"
                      subtitle={
                        post.trackPreview
                          ? `${post.trackPreview.pointCount} 个轨迹点 · 路线仅供参考`
                          : `${post.mountain?.name ?? '本次记录'} · 先看路线轮廓和核心数据`
                      }
                      height={220}
                    />
                  ) : cardVariant === 'no_image' ? (
                    <CommunityNoImageCard
                      mountainName={post.mountain?.name ?? null}
                      sourceLabel={post.sourceLabel}
                      variant="compact"
                    />
                  ) : (
                    <CommunityMediaGallery
                      assets={post.assets}
                      coverUrl={post.coverUrl}
                      title={shareTitle}
                      compact
                      previewMode="profile-share"
                    />
                  )}
                </div>

                <CommunityContentBlock
                  content={hasSummary ? summaryText : `${post.mountain?.name ?? '本次记录'} · ${post.sourceLabel}`}
                  variant="feed"
                  detailHref={`/community/${post.id}`}
                />

                <div style={{ marginTop: 12 }}>
                  <div className="section-subtitle community-card__meta-line" style={{ marginBottom: 10 }}>
                    {post.mountain ? `${post.mountain.name} · ${post.mountain.province}` : post.author.province}
                  </div>
                  <div className="community-card__meta-chips" style={{ marginBottom: 12 }}>
                    <span className={`muted-chip ${post.sourceType === 'realtime_gps' ? 'active' : ''}`}>
                      {post.sourceLabel}
                    </span>
                    {post.mountain && <DifficultyBadge level={post.mountain.difficulty} />}
                    <span className="muted-chip">{formatCommunityDate(post.publishedAt)}</span>
                  </div>
                  <CommunityMetricsRow items={metrics} variant="feed" marginBottom={0} />
                </div>

                <CommunityPostActions
                  postId={post.id}
                  detailUrl={`/community/${post.id}`}
                  initialLikeCount={post.likeCount}
                  initialLiked={post.isLiked}
                  isOwner
                  editHref={`/community/publish/${post.checkinId}`}
                  deleteRedirectHref={post.checkinId ? `/activity/${post.checkinId}?postDeleted=1` : undefined}
                  onDeleted={handleDeleted}
                />
              </div>
            )})}
          </div>
        )}
      </div>
    </>
  )
}
