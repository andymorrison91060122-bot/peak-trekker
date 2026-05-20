'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CheckinAsset, CommunityPostMetrics, CommunityPostViewModel, CommunityTrackPreview } from '@/types'
import { normalizeCommunityActionError } from '@/lib/community'
import { getSourceLabelType } from '@/lib/source-label-utils'
import { sanitizeCommunityText, sanitizeCommunityUsername } from '@/components/community/communityRender'
import AuthorStrip from '@/components/community/AuthorStrip'
import CommunityContentBlock from '@/components/community/CommunityContentBlock'
import CommunityTagBlock from '@/components/community/CommunityTagBlock'
import InteractionBar from '@/components/community/InteractionBar'
import IconButton from '@/components/ui/IconButton'
import { BackIcon, MoreIcon, ShareIcon } from '@/components/ui/Icons'
import { useAppToast } from '@/components/ui/AppToastProvider'

const monoStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
}

const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })

function formatDistance(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--'
  return value.toFixed(1)
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '--'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}`
  return `${Math.max(1, minutes)}m`
}

function renderMedia(asset: CheckinAsset, title: string, index: number) {
  if (asset.type === 'video') {
    return (
      <video
        src={asset.url}
        poster={asset.thumbnail_url || undefined}
        muted
        playsInline
        preload="metadata"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        aria-label={`${title} 素材 ${index + 1}`}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.url}
      alt={`${title} 素材 ${index + 1}`}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

function getMediaAssets(post: CommunityPostViewModel) {
  return post.assets.filter((asset) => asset.type === 'image' || asset.type === 'video')
}

function getMountainHref(post: CommunityPostViewModel) {
  return post.mountain?.id ? `/mountain/${post.mountain.id}` : '/explore'
}

function DetailIconButton({
  icon,
  ariaLabel,
  onClick,
}: {
  icon: ReactNode
  ariaLabel: string
  onClick?: () => void
}) {
  return (
    <IconButton
      ariaLabel={ariaLabel}
      icon={icon}
      shape="circular"
      variant="filled"
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        color: 'var(--color-on-surface)',
        background: 'var(--color-surface-variant)',
        border: '1px solid var(--color-outline)',
      }}
    />
  )
}

function DetailTopBar({ authorName }: { authorName: string }) {
  const router = useRouter()

  function goBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/community')
  }

  return (
    <header
      data-testid="community-detail-topbar"
      style={{
        height: 48,
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1fr) 40px',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-1) var(--space-2) 0',
      }}
    >
      <DetailIconButton ariaLabel="返回山友圈" icon={<BackIcon size={20} />} onClick={goBack} />
      <div
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 600,
        }}
      >
        {authorName}
      </div>
      <div aria-hidden="true" style={{ width: 40, height: 40 }} />
    </header>
  )
}

function MountainPlaceholder() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 22%, var(--color-surface-elevated)), color-mix(in srgb, var(--color-on-surface-variant) 18%, var(--color-surface-variant)))',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--color-on-surface-variant)',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 17L9.8 8.2a1 1 0 0 1 1.7 0L20 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function MountainBindCard({ post }: { post: CommunityPostViewModel }) {
  const href = getMountainHref(post)
  const mountain = post.mountain
  const cover = mountain?.coverImage || post.coverUrl
  const location = [mountain?.province].filter(Boolean).join(' · ')

  return (
    <Link
      href={href}
      data-testid="community-record-source-card"
      style={{
        display: 'grid',
        gridTemplateColumns: '60px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 10,
        border: '1px solid var(--color-outline)',
        borderRadius: 14,
        background: 'var(--color-surface-variant)',
        color: 'var(--color-on-surface)',
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-elevated)',
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={mountain?.name ?? '山峰'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <MountainPlaceholder />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            ...monoStyle,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          来自
        </div>
        <div
          style={{
            marginTop: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 700,
          }}
        >
          {mountain?.name ?? '未知山峰'}
        </div>
        {location ? (
          <div
            style={{
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            {location}
          </div>
        ) : null}
      </div>

      <div style={{ textAlign: 'right', display: 'grid', justifyItems: 'end', gap: 6 }}>
        <div
          style={{
            ...monoStyle,
            color: 'var(--color-success)',
            fontSize: 16,
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 700,
          }}
        >
          {formatNumber.format(Math.round(post.metrics.altitudeM || mountain?.altitude || 0))}
          <span style={{ marginLeft: 2, color: 'var(--color-on-surface-variant)', fontSize: 10 }}>m</span>
        </div>
        <IconButton
          ariaLabel="进入山峰详情"
          icon="chevron-right"
          shape="circular"
          variant="plain"
          tabIndex={-1}
          style={{
            width: 18,
            height: 18,
            color: 'var(--color-on-surface-variant)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </Link>
  )
}

function GalleryFullBleed({
  media,
  title,
}: {
  media: CheckinAsset[]
  title: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(0)

  function handleScroll() {
    const node = scrollRef.current
    if (!node) return
    const nextIndex = Math.round(node.scrollLeft / Math.max(1, node.clientWidth))
    setIndex(Math.max(0, Math.min(media.length - 1, nextIndex)))
  }

  return (
    <section
      data-testid="community-detail-media"
      style={{
        marginTop: 18,
        marginLeft: 'calc(var(--space-4) * -1)',
        marginRight: 'calc(var(--space-4) * -1)',
        position: 'relative',
      }}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="community-detail-gallery"
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
        }}
      >
        {media.map((asset, assetIndex) => (
          <div
            key={asset.id}
            style={{
              flex: '0 0 100%',
              aspectRatio: '4 / 3',
              scrollSnapAlign: 'start',
              background: 'var(--color-surface-elevated)',
              overflow: 'hidden',
            }}
          >
            {renderMedia(asset, title, assetIndex)}
          </div>
        ))}
      </div>

      {media.length > 1 ? (
        <div
          data-testid="community-detail-gallery-counter"
          style={{
            position: 'absolute',
            right: 'var(--space-3)',
            bottom: 'var(--space-3)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'color-mix(in srgb, var(--color-surface) 72%, transparent)',
            color: 'var(--color-on-surface)',
            backdropFilter: 'blur(6px)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 600,
            ...monoStyle,
          }}
        >
          {index + 1} / {media.length}
        </div>
      ) : null}
    </section>
  )
}

function buildRoutePath(points: CommunityTrackPreview['points']) {
  if (points.length < 2) return ''
  const width = 320
  const height = 190
  const padding = 22
  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = Math.max(0.000001, maxLat - minLat)
  const lngRange = Math.max(0.000001, maxLng - minLng)

  return points
    .map((point, pointIndex) => {
      const x = padding + ((point.lng - minLng) / lngRange) * (width - padding * 2)
      const y = height - padding - ((point.lat - minLat) / latRange) * (height - padding * 2)
      return `${pointIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function RoutePreviewBlock({
  trackPreview,
  mountainName,
}: {
  trackPreview: CommunityTrackPreview
  mountainName?: string | null
}) {
  const path = buildRoutePath(trackPreview.points)

  if (!path) return null

  return (
    <section
      data-testid="community-detail-media"
      style={{
        margin: '20px 0 0',
        border: '1px solid var(--color-outline)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 32%), linear-gradient(135deg, var(--color-surface-variant), var(--color-surface))',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4 / 3' }}>
        <svg viewBox="0 0 320 190" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, lineIndex) => {
            const x = 20 + lineIndex * 56
            return <line key={`v-${lineIndex}`} x1={x} y1="12" x2={x} y2="178" stroke="var(--color-outline)" strokeWidth="1" opacity="0.42" />
          })}
          {Array.from({ length: 5 }).map((_, lineIndex) => {
            const y = 24 + lineIndex * 34
            return <line key={`h-${lineIndex}`} x1="14" y1={y} x2="306" y2={y} stroke="var(--color-outline)" strokeWidth="1" opacity="0.42" />
          })}
          <path d={path} fill="none" stroke="color-mix(in srgb, var(--color-on-surface) 20%, transparent)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d={path} fill="none" stroke="var(--color-success)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 'var(--space-4)',
            top: 'var(--space-4)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-surface) 72%, transparent)',
            color: 'var(--color-on-surface)',
          }}
        >
          <div style={{ fontSize: 'var(--font-label-m-size)', lineHeight: 'var(--font-label-m-line)', fontWeight: 700 }}>路线轨迹</div>
          <div style={{ marginTop: 2, color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>
            {mountainName ?? '本次山行'}
          </div>
        </div>
      </div>
    </section>
  )
}

function MediaRegion({ post }: { post: CommunityPostViewModel }) {
  const media = getMediaAssets(post)
  if (media.length > 0) {
    return <GalleryFullBleed media={media} title={post.title || post.mountain?.name || '山友圈动态'} />
  }
  if (post.trackPreview) {
    return <RoutePreviewBlock trackPreview={post.trackPreview} mountainName={post.mountain?.name} />
  }
  return null
}

function DetailStatBlock({ metrics }: { metrics: CommunityPostMetrics }) {
  const cells = [
    { label: '海拔 m', value: formatNumber.format(Math.round(metrics.altitudeM)), accent: true },
    { label: '距离 km', value: formatDistance(metrics.distanceKm), accent: false },
    { label: '爬升 m', value: formatNumber.format(Math.round(metrics.ascentM)), accent: false },
    { label: '用时', value: formatDuration(metrics.durationSec), accent: false },
  ]

  return (
    <section data-testid="community-detail-stat-block" style={{ paddingTop: 'var(--space-5)' }}>
      <div
        style={{
          paddingBottom: 10,
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          ...monoStyle,
        }}
      >
        这次山行
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
        {cells.map((cell) => (
          <div
            key={cell.label}
            style={{
              minWidth: 0,
              padding: '10px 8px',
              border: '1px solid var(--color-outline)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-variant)',
            }}
          >
            <div
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--color-on-surface-variant)',
                fontSize: 9,
                lineHeight: 1.25,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                ...monoStyle,
              }}
            >
              {cell.label}
            </div>
            <div
              style={{
                marginTop: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: cell.accent ? 'var(--color-success)' : 'var(--color-on-surface)',
                fontSize: 17,
                lineHeight: 'var(--font-title-l-line)',
                fontWeight: 700,
                ...monoStyle,
              }}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AuthorOnlyLink({ checkinId }: { checkinId: string }) {
  return (
    <Link
      href={`/activity/${checkinId}`}
      data-testid="community-detail-author-activity-link"
      style={{
        marginTop: 18,
        width: '100%',
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: '0 14px',
        border: '1px dashed var(--color-outline)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
        color: 'var(--color-on-surface)',
        textDecoration: 'none',
        fontSize: 'var(--font-label-m-size)',
        lineHeight: 'var(--font-label-m-line)',
        fontWeight: 600,
      }}
    >
      <span>查看活动详情</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          ...monoStyle,
        }}
      >
        仅自己可见
        <span aria-hidden="true">›</span>
      </span>
    </Link>
  )
}

function FooterActionButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        minWidth: 28,
        minHeight: 28,
        padding: 0,
        border: 0,
        background: 'transparent',
        color: 'var(--color-on-surface-variant)',
        display: 'inline-grid',
        placeItems: 'center',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.62 : 1,
      }}
    >
      {icon}
    </button>
  )
}

function DetailMenu({
  isOwner,
  pending,
  onActivity,
  onDelete,
  onReport,
}: {
  isOwner: boolean
  pending: boolean
  onActivity: () => void
  onDelete: () => void
  onReport: () => void
}) {
  return (
    <div
      className="community-v2-card-menu"
      data-testid="community-detail-menu"
      role="menu"
      style={{ top: 'auto', bottom: 'calc(100% + var(--space-2))' }}
    >
      {isOwner ? (
        <>
          <button type="button" className="community-v2-card-menu__item" role="menuitem" onClick={onActivity}>
            查看活动详情
          </button>
          <div className="community-v2-card-menu__divider" />
          <button type="button" className="community-v2-card-menu__item community-v2-card-menu__item--danger" role="menuitem" onClick={onDelete} disabled={pending}>
            删除
          </button>
        </>
      ) : (
        <button type="button" className="community-v2-card-menu__item community-v2-card-menu__item--danger" role="menuitem" onClick={onReport} disabled={pending}>
          举报
        </button>
      )}
    </div>
  )
}

function AuthorFooter({
  post,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  menu,
}: {
  post: CommunityPostViewModel
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  menu: ReactNode
}) {
  const { showToast } = useAppToast()

  function sharePost() {
    onMenuClose()
    const absoluteUrl = new URL(`/community/${post.id}`, window.location.origin).toString()

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
      data-testid="community-detail-author-footer"
      style={{
        minHeight: 44,
        padding: '8px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
      }}
    >
      <div
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 600,
        }}
      >
        · 你的发布 ·
      </div>
      <div data-community-menu-root style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <FooterActionButton label="分享动态" icon={<ShareIcon size={24} />} onClick={sharePost} />
        <FooterActionButton label={menuOpen ? '关闭更多操作' : '更多操作'} icon={<MoreIcon size={24} />} onClick={onMenuToggle} />
        {menuOpen ? menu : null}
      </div>
    </div>
  )
}

function StickyInteractionFooter({
  children,
}: {
  children: ReactNode
}) {
  return (
    <footer
      data-testid="community-detail-sticky-footer"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        borderTop: '1px solid var(--color-outline)',
        background: 'var(--color-surface)',
        padding: '0 var(--space-4) max(env(safe-area-inset-bottom), var(--space-2))',
      }}
    >
      <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto' }}>{children}</div>
    </footer>
  )
}

export default function CommunityDetailClient({ post }: { post: CommunityPostViewModel }) {
  const router = useRouter()
  const { showToast } = useAppToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const authorName = sanitizeCommunityUsername(post.author.username, '山友')
  const bodyText = sanitizeCommunityText(post.body || post.note || '')
  const sourceLabelType = getSourceLabelType(post.sourceType)
  const detailMenu = useMemo(
    () => (
      <DetailMenu
        isOwner={post.isOwner}
        pending={pending}
        onActivity={() => {
          setMenuOpen(false)
          router.push(`/activity/${post.checkinId}`)
        }}
        onDelete={() => {
          setMenuOpen(false)
          deletePost()
        }}
        onReport={() => {
          setMenuOpen(false)
          reportPost()
        }}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, post.checkinId, post.isOwner]
  )

  useEffect(() => {
    if (!menuOpen) return

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Element | null
      if (target?.closest('[data-community-menu-root]')) return
      setMenuOpen(false)
    }

    function closeOnScroll() {
      setMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('scroll', closeOnScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('scroll', closeOnScroll)
    }
  }, [menuOpen])

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

  function deletePost() {
    if (!window.confirm('删除后，这条内容会从山友圈移除，活动记录仍会保留。')) return

    setPending(true)
    startTransition(async () => {
      try {
        await runAction({ action: 'delete_post', postId: post.id })
        showToast({ key: 'delete_success' })
        router.push(`/activity/${post.checkinId}?postDeleted=1`)
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
        await runAction({
          action: 'report_post',
          postId: post.id,
          reason: '与登山无关',
        })
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
    <div
      data-testid="community-detail"
      data-owner={post.isOwner ? 'true' : 'false'}
      style={{
        minHeight: '100dvh',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        paddingBottom: 'calc(82px + env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto' }}>
        <DetailTopBar authorName={authorName} />

        <main>
          <div style={{ padding: '12px var(--space-4) 0' }}>
            <AuthorStrip
              name={authorName}
              avatarUrl={post.author.avatarUrl}
              time={post.publishedRelative}
              isMine={post.isOwner}
              sourceLabelType={sourceLabelType}
            />
          </div>

          <div style={{ padding: '14px var(--space-4) 0' }}>
            <MountainBindCard post={post} />
          </div>

          <div style={{ padding: '18px var(--space-4) 0' }}>
            <section className="community-detail-post-shell" data-testid="community-detail-post-shell">
              {bodyText ? <CommunityContentBlock content={bodyText} variant="detail" /> : null}
              <CommunityTagBlock tags={post.tags} variant="detail" />
              <MediaRegion post={post} />
              <DetailStatBlock metrics={post.metrics} />
              <div data-testid="community-detail-actions">
                {post.isOwner ? <AuthorOnlyLink checkinId={post.checkinId} /> : null}
              </div>
            </section>
          </div>
        </main>
      </div>

      <StickyInteractionFooter>
        {post.isOwner ? (
          <AuthorFooter
            post={post}
            menuOpen={menuOpen}
            onMenuToggle={() => setMenuOpen((current) => !current)}
            onMenuClose={() => setMenuOpen(false)}
            menu={detailMenu}
          />
        ) : (
          <InteractionBar
            postId={post.id}
            detailUrl={`/community/${post.id}`}
            initialLiked={post.isLiked}
            initialCount={post.likeCount}
            menuOpen={menuOpen}
            onMenuToggle={() => setMenuOpen((current) => !current)}
            onMenuClose={() => setMenuOpen(false)}
            menu={detailMenu}
          />
        )}
      </StickyInteractionFooter>
    </div>
  )
}
