'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import IconButton from '@/components/ui/IconButton'
import { ActionGlyph } from '@/components/ui/IconActionButton'
import ActivityRouteMap from '@/components/activity/ActivityRouteMap'
import { SourceLabel, type SourceLabelProps } from '@/components/ui/SourceLabel'
import { HelpLink } from '@/components/help/HelpLink'
import {
  ArchiveIcon,
  BackIcon,
  CameraIcon,
  CheckIcon,
  MoreIcon,
  ShareIcon,
  WarnIcon,
} from '@/components/ui/Icons'
import type { CheckinSource } from '@/types'
import { getDifficultyLevelLabel } from '@/lib/license-ui'
import {
  ACTIVITY_NOTE_MAX_LENGTH,
  ACTIVITY_PHOTO_MAX_COUNT,
  getActivityNoteValidation,
  getActivityPhotoDeleteValidation,
  getActivityPhotoUploadValidation,
} from '@/lib/activity-detail-validation'

export type ActivityPhotoViewModel = {
  id: string
  assetId: string | null
  url: string
  thumbnailUrl: string
  isLegacyCover?: boolean
}

export type ActivityWaypointViewModel = {
  time: string
  name: string
  altitudeM: number
  tone: 'fg' | 'fg2' | 'warning' | 'success'
}

export type ActivityCompanionViewModel = {
  id: string
  name: string
  handle?: string
  avatarUrl?: string | null
}

export type ActivityDetailViewModel = {
  id: string
  createdAt: string
  startedAt: string
  summitAt: string | null
  sourceType: CheckinSource
  sourceLabelType: SourceLabelProps['type']
  status: 'pending' | 'approved' | 'rejected'
  isSummit: boolean
  hasMeaningfulActivityData: boolean
  mountain: {
    id: string | null
    name: string
    altitude: number
    province: string
    region: string
    coverImage: string | null
    difficulty: string | null
  }
  metrics: {
    maxAltitudeM: number
    minAltitudeM: number
    ascentM: number
    distanceKm: number
    durationSeconds: number
  }
  note: string
  photos: ActivityPhotoViewModel[]
  waypoints?: ActivityWaypointViewModel[]
  companions?: ActivityCompanionViewModel[]
  elevationSamples: number[]
  proofStatus: 'confirmed' | 'partial' | 'none'
  recordCount: number
}

const monoStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value))
}

const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatHeroDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '---- -- -- · --'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} · ${dayNames[date.getDay()]}`
}

function formatMonthDay(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-- --'
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(value: string | null) {
  if (!value) return '--:--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}

function routeFallbackSamples(min: number, max: number) {
  if (max <= min) return [min, max]
  return [min, Math.round(min + (max - min) * 0.35), max, Math.round(min + (max - min) * 0.48), min]
}

function sectionPadding(top = 'var(--space-5)'): CSSProperties {
  return {
    padding: `${top} var(--space-4) 0`,
  }
}

function ActivityIconButton({
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
        width: 'var(--control-size)',
        height: 'var(--control-size)',
        color: 'var(--color-on-surface)',
        background: 'color-mix(in srgb, var(--color-surface) 62%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-outline) 80%, transparent)',
        backdropFilter: 'blur(10px)',
      }}
    />
  )
}

function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warn' }) {
  const toneStyle =
    tone === 'success'
      ? {
          color: 'var(--color-success)',
          background: 'color-mix(in srgb, var(--color-success) 14%, transparent)',
          borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
        }
      : tone === 'warn'
        ? {
            color: 'var(--color-warning)',
            background: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
            borderColor: 'color-mix(in srgb, var(--color-warning) 30%, transparent)',
          }
        : {
            color: 'var(--color-on-surface-variant)',
            background: 'color-mix(in srgb, var(--color-on-surface) 5%, transparent)',
            borderColor: 'var(--color-outline)',
          }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 24,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid',
        fontSize: 'var(--font-label-s-size)',
        lineHeight: 'var(--font-label-s-line)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...toneStyle,
      }}
    >
      {children}
    </span>
  )
}

function SectionHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: '0 var(--space-1) 10px',
      }}
    >
      <div
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {children}
      </div>
      {right ? (
        <div
          style={{
            ...monoStyle,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            whiteSpace: 'nowrap',
          }}
        >
          {right}
        </div>
      ) : null}
    </div>
  )
}

function ActivityTopBar({
  onBack,
  onShare,
}: {
  onBack: () => void
  onShare: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 3,
        top: 0,
        left: 0,
        right: 0,
        paddingTop: 'max(env(safe-area-inset-top), var(--space-2))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-1) var(--space-3)',
        }}
      >
        <ActivityIconButton ariaLabel="返回" icon={<BackIcon size={20} />} onClick={onBack} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <ActivityIconButton ariaLabel="分享" icon={<ShareIcon size={20} />} onClick={onShare} />
          <ActivityIconButton ariaLabel="更多" icon={<MoreIcon size={20} />} />
        </div>
      </div>
    </div>
  )
}

function ActivityHero({ activity }: { activity: ActivityDetailViewModel }) {
  const heroPhoto = activity.photos[0]?.url ?? activity.mountain.coverImage ?? null
  const isFallback = !heroPhoto
  const regionParts = [
    activity.mountain.province,
    activity.mountain.region && activity.mountain.region !== activity.mountain.province ? activity.mountain.region : null,
    `${getDifficultyLevelLabel(activity.mountain.difficulty)}路线`,
  ].filter(Boolean)
  const regionLine = regionParts.join(' · ')

  return (
    <section style={{ position: 'relative', height: 320, overflow: 'hidden' }}>
      {heroPhoto ? (
        <div
          aria-label="活动封面照片"
          role="img"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${heroPhoto}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 35%',
          }}
        />
      ) : (
        <div
          aria-label="默认封面"
          role="img"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 30% 18%, color-mix(in srgb, var(--color-surface-elevated) 82%, var(--color-on-surface)) 0, transparent 36%), linear-gradient(145deg, var(--color-surface-elevated), var(--color-surface))',
          }}
        />
      )}
      {isFallback ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(max(env(safe-area-inset-top), var(--space-2)) + 58px)',
            right: 16,
            zIndex: 2,
          }}
        >
          <Chip tone="neutral">默认封面</Chip>
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 55%, transparent) 0%, transparent 35%, color-mix(in srgb, var(--color-surface) 95%, transparent) 100%)',
        }}
      />
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 18 }}>
        <div
          style={{
            ...monoStyle,
            color: 'color-mix(in srgb, var(--color-on-surface) 75%, transparent)',
            fontSize: 12,
            lineHeight: '16px',
          }}
        >
          {formatHeroDate(activity.createdAt)}
        </div>
        <h1
          style={{
            margin: '6px 0 0',
            color: 'var(--color-on-surface)',
            fontSize: 26,
            lineHeight: 1.15,
            fontWeight: 800,
            letterSpacing: '-0.01em',
          }}
        >
          {activity.mountain.name}
        </h1>
        <div
          style={{
            color: 'var(--color-on-surface-variant)',
            marginTop: 6,
            fontSize: 13,
            lineHeight: '18px',
            fontWeight: 500,
          }}
        >
          {regionLine}
        </div>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <SourceLabel type={activity.sourceLabelType} size="md" />
        </div>
      </div>
    </section>
  )
}

function SummitReachedCard({ activity }: { activity: ActivityDetailViewModel }) {
  return (
    <section style={sectionPadding('var(--space-4)')}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '14px var(--space-4)',
          borderRadius: 14,
          border: '1px solid color-mix(in srgb, var(--color-success) 28%, transparent)',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-success) 8%, transparent) 0%, transparent 100%)',
        }}
      >
        <div>
          <div
            style={{
              color: 'var(--color-success)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            登顶海拔
          </div>
          <div
            style={{
              ...monoStyle,
              marginTop: 4,
              color: 'var(--color-success)',
              fontSize: 36,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            {formatNumber(activity.metrics.maxAltitudeM)}
            <span
              style={{
                marginLeft: 4,
                color: 'var(--color-on-surface-variant)',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              m
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 10,
              lineHeight: '14px',
              letterSpacing: '0.08em',
            }}
          >
            登顶时间
          </div>
          <div
            style={{
              ...monoStyle,
              marginTop: 4,
              color: 'var(--color-on-surface)',
              fontSize: 14,
              lineHeight: '18px',
              fontWeight: 700,
            }}
          >
            {formatTime(activity.summitAt)}
          </div>
        </div>
      </div>
    </section>
  )
}

function MaxAltitudeCard({ activity }: { activity: ActivityDetailViewModel }) {
  return (
    <section style={sectionPadding('var(--space-4)')}>
      <div
        style={{
          padding: '14px var(--space-4)',
          borderRadius: 14,
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <div>
            <div
              style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              最高海拔
            </div>
            <div
              style={{
                ...monoStyle,
                marginTop: 4,
                color: 'var(--color-on-surface)',
                fontSize: 30,
                lineHeight: 1,
                fontWeight: 800,
              }}
            >
              {formatNumber(activity.metrics.maxAltitudeM)}
              <span
                style={{
                  marginLeft: 4,
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                m
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 10, lineHeight: '14px', letterSpacing: '0.08em' }}>
              未登顶
            </div>
            <div
              style={{
                ...monoStyle,
                marginTop: 4,
                color: 'var(--color-warning)',
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 600,
              }}
            >
              折返记录
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function KeyDataGrid({ activity }: { activity: ActivityDetailViewModel }) {
  const cells = [
    { label: '最高海拔 m', value: activity.metrics.maxAltitudeM > 0 ? formatNumber(activity.metrics.maxAltitudeM) : '--' },
    { label: '总用时', value: activity.metrics.durationSeconds > 0 ? formatDuration(activity.metrics.durationSeconds) : '--' },
    { label: '总距离 km', value: activity.metrics.distanceKm > 0 ? activity.metrics.distanceKm.toFixed(1) : '--' },
    { label: '累计爬升 m', value: activity.metrics.ascentM > 0 ? formatNumber(activity.metrics.ascentM) : '--' },
  ]

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4) 0',
      }}
    >
      {cells.map((cell) => (
        <div
          key={cell.label}
          style={{
            padding: '12px 10px',
            textAlign: 'center',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
          }}
        >
          <div
            style={{
              ...monoStyle,
              color: 'var(--color-on-surface)',
              fontSize: 16,
              lineHeight: '20px',
              fontWeight: 700,
            }}
          >
            {cell.value}
          </div>
          <div
            style={{
              marginTop: 4,
              color: 'var(--color-on-surface-variant)',
              fontSize: 10,
              lineHeight: '14px',
              letterSpacing: '0.04em',
            }}
          >
            {cell.label}
          </div>
        </div>
      ))}
    </section>
  )
}

function RouteSnapshot({ activity }: { activity: ActivityDetailViewModel }) {
  const samples = activity.elevationSamples.length
    ? activity.elevationSamples
    : routeFallbackSamples(activity.metrics.minAltitudeM, activity.metrics.maxAltitudeM)
  const min = Math.min(...samples, activity.metrics.minAltitudeM)
  const max = Math.max(...samples, activity.metrics.maxAltitudeM)
  const canChart = activity.elevationSamples.length >= 8 && max > min

  let points = ''
  let areaPoints = ''
  let summitX = 150
  let summitY = 20

  if (canChart) {
    const mapped = samples.map((value, index) => {
      const x = (index / (samples.length - 1)) * 300
      const y = 90 - ((value - min) / (max - min)) * 70
      return { x, y, value }
    })
    points = mapped.map((point) => `${point.x},${point.y}`).join(' ')
    areaPoints = `0,100 ${points} 300,100`
    const summitIndex = mapped.reduce((best, point, index) => (point.value > mapped[best].value ? index : best), 0)
    summitX = mapped[summitIndex].x
    summitY = mapped[summitIndex].y
  }

  return (
    <section style={sectionPadding('var(--space-5)')}>
      <SectionHead right="走过的路线">轨迹记忆</SectionHead>
      <div
        style={{
          overflow: 'hidden',
          borderRadius: 14,
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
        }}
      >
        {canChart ? (
          <>
            <svg width="100%" height="110" viewBox="0 0 300 110" preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="activity-route-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 40, 60, 80].map((y) => (
                <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="var(--color-outline)" strokeWidth="0.5" />
              ))}
              <polygon points={areaPoints} fill="url(#activity-route-fill)" />
              <polyline
                points={points}
                stroke="var(--color-success)"
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1={summitX}
                x2={summitX}
                y1={summitY}
                y2="100"
                stroke="var(--color-success)"
                strokeWidth="0.8"
                strokeDasharray="2 3"
                opacity="0.55"
              />
              <circle cx={summitX} cy={summitY} r="4" fill="var(--color-success)" />
              <circle cx={summitX} cy={summitY} r="8" fill="none" stroke="var(--color-success)" strokeOpacity="0.3" strokeWidth="1.5" />
            </svg>
            <div
              style={{
                ...monoStyle,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
                padding: '8px 14px 12px',
                color: 'var(--color-on-surface-variant)',
                fontSize: 10,
                lineHeight: '14px',
                letterSpacing: '0.05em',
              }}
            >
              <span>大本营</span>
              <span style={{ color: 'var(--color-success)' }}>山顶 · {formatNumber(max)}m</span>
              <span>回营</span>
            </div>
          </>
        ) : (
          <div
            style={{
              ...monoStyle,
              padding: '24px var(--space-4)',
              color: 'var(--color-on-surface)',
              fontSize: 17,
              lineHeight: '24px',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {formatNumber(min)}m → {formatNumber(max)}m
          </div>
        )}
      </div>
    </section>
  )
}

function PhotoStrip({
  activity,
  onAddPhoto,
  onOpenPhoto,
  isUploading,
  isDeleting,
}: {
  activity: ActivityDetailViewModel
  onAddPhoto: () => void
  onOpenPhoto: (index: number) => void
  isUploading: boolean
  isDeleting: boolean
}) {
  const photos = activity.photos
  const photoCount = activity.photos.length
  const uploadValidation = getActivityPhotoUploadValidation({
    currentPhotoCount: photoCount,
    selectedFileCount: 1,
    status: activity.status,
    isUploading,
  })
  const uploadDisabled = !uploadValidation.isApproved || isUploading || isDeleting || photoCount >= ACTIVITY_PHOTO_MAX_COUNT
  const uploadHint = !uploadValidation.isApproved
    ? '待审核通过后可补传'
    : photoCount >= ACTIVITY_PHOTO_MAX_COUNT
      ? '已达到 9 张上限'
      : null

  if (!photos.length) {
    return (
      <section style={sectionPadding('var(--space-5)')}>
        <SectionHead right={`已 ${photoCount}/${ACTIVITY_PHOTO_MAX_COUNT} 张`}>照片</SectionHead>
        <div
          style={{
            padding: '20px var(--space-4)',
            textAlign: 'center',
            borderRadius: 14,
            border: '1px dashed var(--color-outline)',
            background: 'var(--color-surface-variant)',
          }}
        >
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 36,
              height: 36,
              margin: '0 auto 10px',
              borderRadius: 10,
              border: '1px solid var(--color-outline)',
              color: 'var(--color-on-surface-variant)',
              background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
            }}
          >
            <CameraIcon size={20} />
          </div>
          <div style={{ color: 'var(--color-on-surface)', fontSize: 13, lineHeight: '18px', fontWeight: 600 }}>
            这次没有留下照片
          </div>
          <div
            style={{
              marginTop: 4,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 1.5,
            }}
          >
            但你去过的山不会忘记你 · 也可以补一张
          </div>
          <SecondaryButton
            aria-disabled={uploadDisabled ? 'true' : undefined}
            loading={isUploading}
            style={{
              marginTop: 12,
              minHeight: 44,
              height: 44,
              ...(uploadDisabled ? { cursor: 'not-allowed', opacity: 0.58 } : {}),
            }}
            onClick={onAddPhoto}
          >
            {isUploading ? '上传中' : '补一张照片'}
          </SecondaryButton>
          {uploadHint ? (
            <div
              style={{
                marginTop: 'var(--space-2)',
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
              }}
            >
              {uploadHint}
            </div>
          ) : null}
        </div>
      </section>
    )
  }

  const layoutClass =
    photos.length >= 5
      ? 'act-photos__layout act-photos__layout--grid'
      : photos.length === 4
        ? 'act-photos__layout act-photos__layout--four'
        : photos.length === 3
          ? 'act-photos__layout act-photos__layout--three'
          : photos.length === 2
            ? 'act-photos__layout act-photos__layout--two'
            : 'act-photos__layout act-photos__layout--one'

  return (
    <section style={sectionPadding('var(--space-5)')}>
      <SectionHead right={`已 ${photoCount}/${ACTIVITY_PHOTO_MAX_COUNT} 张`}>这次的照片</SectionHead>
      <div className={layoutClass} data-testid="activity-photo-gallery">
        {photos.map((photo, index) => {
          const isHero = photos.length === 3 && index === 0
          return (
            <button
              type="button"
              key={photo.id}
              className={isHero ? 'act-photo act-photo--hero' : 'act-photo'}
              data-testid={`activity-photo-tile-${index}`}
              aria-label={`查看第 ${index + 1} 张照片`}
              onClick={() => onOpenPhoto(index)}
              style={{ backgroundImage: `url("${photo.thumbnailUrl}")` }}
            >
              <div className="act-photo__scrim" />
            </button>
          )
        })}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-3)',
        }}
      >
        <div
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          {uploadHint ?? '可以继续补充现场照片'}
        </div>
        <SecondaryButton
          aria-disabled={uploadDisabled ? 'true' : undefined}
          loading={isUploading}
          onClick={onAddPhoto}
          style={{
            minHeight: 40,
            height: 40,
            padding: '0 var(--space-4)',
            whiteSpace: 'nowrap',
            ...(uploadDisabled ? { cursor: 'not-allowed', opacity: 0.58 } : {}),
          }}
        >
          {isUploading ? '上传中' : '补一张'}
        </SecondaryButton>
      </div>
    </section>
  )
}

function ActivityPhotoLightbox({
  photos,
  activeIndex,
  isDeleting,
  status,
  onClose,
  onSelectIndex,
  onDeletePhoto,
}: {
  photos: ActivityPhotoViewModel[]
  activeIndex: number
  isDeleting: boolean
  status: ActivityDetailViewModel['status']
  onClose: () => void
  onSelectIndex: (index: number) => void
  onDeletePhoto: (photo: ActivityPhotoViewModel) => void
}) {
  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(photos.length - 1, 0))
  const activePhoto = photos[safeIndex]
  const touchStartXRef = useRef<number | null>(null)
  const deleteValidation = getActivityPhotoDeleteValidation({ status, isDeleting })

  function goToOffset(offset: number) {
    if (isDeleting || photos.length <= 1) return
    onSelectIndex((safeIndex + offset + photos.length) % photos.length)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') goToOffset(-1)
      if (event.key === 'ArrowRight') goToOffset(1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  if (!activePhoto) return null

  return (
    <div
      className="act-lightbox"
      data-testid="activity-photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="查看活动照片"
    >
      <IconButton
        icon="close"
        ariaLabel="关闭照片查看"
        variant="filled"
        shape="circular"
        onClick={onClose}
        disabled={isDeleting}
        className="act-lightbox__close"
      />

      <div
        className="act-lightbox__stage"
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(event) => {
          const startX = touchStartXRef.current
          touchStartXRef.current = null
          const endX = event.changedTouches[0]?.clientX ?? null
          if (startX === null || endX === null) return
          const deltaX = endX - startX
          if (Math.abs(deltaX) < 40) return
          goToOffset(deltaX > 0 ? -1 : 1)
        }}
      >
        {photos.length > 1 ? (
          <>
            <IconButton
              icon={<BackIcon size={20} />}
              ariaLabel="上一张照片"
              variant="filled"
              shape="circular"
              onClick={() => goToOffset(-1)}
              disabled={isDeleting}
              className="act-lightbox__nav act-lightbox__nav--prev"
            />
            <IconButton
              icon="chevron-right"
              ariaLabel="下一张照片"
              variant="filled"
              shape="circular"
              onClick={() => goToOffset(1)}
              disabled={isDeleting}
              className="act-lightbox__nav act-lightbox__nav--next"
            />
          </>
        ) : null}

        <div
          className="act-lightbox__image"
          data-testid="activity-photo-lightbox-image"
          role="img"
          aria-label={`活动照片 ${safeIndex + 1}`}
          style={{ backgroundImage: `url("${activePhoto.url}")` }}
        />
      </div>

      <div className="act-lightbox__footer">
        <div>
          <div className="act-lightbox__count" data-testid="activity-photo-lightbox-count">
            {safeIndex + 1} / {photos.length}
          </div>
          {deleteValidation.isApproved ? null : (
            <div className="act-lightbox__hint">待审核通过后可删除</div>
          )}
        </div>

        <button
          type="button"
          className="act-lightbox__delete"
          data-testid="activity-photo-delete-button"
          disabled={!deleteValidation.canDelete}
          onClick={() => onDeletePhoto(activePhoto)}
        >
          <span className="act-lightbox__delete-glyph" aria-hidden="true">
            <ActionGlyph name="delete" />
          </span>
          {isDeleting ? '删除中' : '删除'}
        </button>
      </div>

      {photos.length > 1 ? (
        <div className="act-lightbox__thumbs" aria-label="照片缩略图">
          {photos.map((photo, index) => (
            <button
              key={`${photo.id}-thumb`}
              type="button"
              className="act-lightbox__thumb"
              data-active={index === safeIndex ? 'true' : 'false'}
              aria-label={`切换到第 ${index + 1} 张照片`}
              onClick={() => onSelectIndex(index)}
              disabled={isDeleting}
              style={{ backgroundImage: `url("${photo.thumbnailUrl}")` }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MemoryNote({
  activity,
  savedNote,
  draftNote,
  isEditing,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
}: {
  activity: ActivityDetailViewModel
  savedNote: string
  draftNote: string
  isEditing: boolean
  isSaving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onDraftChange: (value: string) => void
  onSave: () => void
}) {
  const hasNote = Boolean(savedNote.trim())
  const notePlace = activity.isSummit ? '山顶' : '途中'
  const noteValidation = getActivityNoteValidation({
    draftNote,
    savedNote,
    status: activity.status,
    isSaving,
  })
  const counterColor = noteValidation.isOverLimit ? 'var(--color-error)' : 'var(--color-on-surface-variant)'

  if (isEditing) {
    return (
      <section style={sectionPadding('var(--space-5)')}>
        <SectionHead>手记</SectionHead>
        <div
          style={{
            padding: '14px var(--space-4)',
            borderRadius: 14,
            border: `1px solid ${noteValidation.isOverLimit ? 'var(--color-error)' : 'var(--color-outline)'}`,
            background: 'var(--color-surface-variant)',
          }}
        >
          <textarea
            data-testid="activity-note-editor"
            value={draftNote}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="写下这次山行想记住的一句话。"
            rows={5}
            disabled={isSaving}
            style={{
              width: '100%',
              minHeight: 120,
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-outline)',
              color: 'var(--color-on-surface)',
              background: 'var(--color-surface)',
              font: 'inherit',
              fontSize: 15,
              lineHeight: 1.7,
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            <div
              style={{
                color: counterColor,
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
                fontWeight: noteValidation.isOverLimit ? 700 : 500,
              }}
            >
              {noteValidation.characterCount}/{ACTIVITY_NOTE_MAX_LENGTH}
              {noteValidation.isOverLimit ? ' · 已超出 2000 字' : ''}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <SecondaryButton
                disabled={isSaving}
                onClick={onCancelEdit}
                style={{ minHeight: 40, height: 40, padding: '0 var(--space-4)' }}
              >
                取消
              </SecondaryButton>
              <PrimaryButton
                disabled={!noteValidation.canSave}
                loading={isSaving}
                onClick={onSave}
                style={{ minHeight: 40, height: 40, padding: '0 var(--space-4)' }}
              >
                保存
              </PrimaryButton>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section style={sectionPadding('var(--space-5)')}>
      <SectionHead>手记</SectionHead>
      {hasNote ? (
        <div
          style={{
            padding: '14px var(--space-4)',
            borderRadius: 14,
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
          }}
        >
          <div
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 15,
              lineHeight: 1.75,
              fontWeight: 400,
              borderLeft: '2px solid color-mix(in srgb, var(--color-success) 48%, transparent)',
              paddingLeft: 'var(--space-3)',
            }}
          >
            「{savedNote}」
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-3)',
            }}
          >
            <div
              style={{
                ...monoStyle,
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: '14px',
                letterSpacing: '0.08em',
              }}
            >
              — 写于 {formatMonthDay(activity.createdAt)} · {notePlace}
            </div>
            <button
              type="button"
              onClick={onStartEdit}
              style={{
                border: 0,
                padding: 0,
                color: 'var(--color-on-surface-variant)',
                background: 'transparent',
                font: 'inherit',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
                cursor: 'pointer',
              }}
            >
              编辑
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            padding: '16px 14px',
            textAlign: 'center',
            borderRadius: 14,
            border: '1px dashed var(--color-outline)',
            background: 'var(--color-surface-variant)',
            font: 'inherit',
          }}
        >
          <div style={{ color: 'var(--color-on-surface)', fontSize: 15, lineHeight: '20px', fontWeight: 600 }}>
            这次山行，你想记住什么？
          </div>
          <div
            style={{
              marginTop: 'var(--space-1)',
              color: 'var(--color-on-surface-variant)',
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            哪怕一句话也好 · 只有你自己能看到
          </div>
          <button
            type="button"
            onClick={onStartEdit}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 10,
              border: '1px solid var(--color-outline)',
              color: 'var(--color-on-surface)',
              background: 'var(--color-surface-variant)',
              font: 'inherit',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            写一句
          </button>
        </div>
      )}
    </section>
  )
}

function ProofStrip({ status }: { status: ActivityDetailViewModel['proofStatus'] }) {
  const cfg = {
    confirmed: {
      label: '留证已确认',
      sub: '轨迹 · 海拔 · 登顶点位均完整',
      tone: 'success' as const,
      icon: <CheckIcon size={20} />,
    },
    partial: {
      label: '留证不完整',
      sub: '记录不完整 · 但这次山行是真实的',
      tone: 'warn' as const,
      icon: <WarnIcon size={20} />,
    },
    none: {
      label: '仅手动补签',
      sub: '无自动记录 · 仅凭用户声明',
      tone: 'warn' as const,
      icon: <WarnIcon size={20} />,
    },
  }[status]

  const color = cfg.tone === 'success' ? 'var(--color-success)' : 'var(--color-warning)'

  return (
    <section style={sectionPadding('var(--space-5)')}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
          background: `color-mix(in srgb, ${color} 8%, transparent)`,
        }}
      >
        <div style={{ display: 'grid', placeItems: 'center', color }}>{cfg.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color, fontSize: 13, lineHeight: '18px', fontWeight: 700 }}>{cfg.label}</div>
          <div
            style={{
              marginTop: 2,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            {cfg.sub}
          </div>
        </div>
      </div>
    </section>
  )
}

function CompanionStrip({ companions }: { companions: ActivityCompanionViewModel[] }) {
  const visibleCompanions = companions.slice(0, 3)
  const companionNames = companions
    .slice(0, 3)
    .map((companion) => companion.handle ?? companion.name)
    .join(' · ')

  if (!companions.length) return null

  return (
    <section style={sectionPadding('var(--space-5)')} data-testid="activity-companion-strip">
      <SectionHead>同行者</SectionHead>
      <div className="act-companion">
        <div className="act-companion__avatars" aria-hidden="true">
          {visibleCompanions.map((companion, index) => (
            <div
              key={companion.id}
              className={`act-companion__avatar act-companion__avatar--${index}`}
              style={companion.avatarUrl ? { backgroundImage: `url("${companion.avatarUrl}")` } : undefined}
            />
          ))}
        </div>
        <div className="act-companion__copy">
          <div className="act-companion__title">{companions.length} 位山友 · 一同登顶</div>
          <div className="act-companion__subtitle">{companionNames}</div>
        </div>
        <SecondaryButton style={{ minHeight: 36, height: 36, padding: '0 14px' }}>查看</SecondaryButton>
      </div>
    </section>
  )
}

function BackToRecords({ activity }: { activity: ActivityDetailViewModel }) {
  const router = useRouter()

  return (
    <section style={sectionPadding('var(--space-5)')}>
      <button
        type="button"
        onClick={() => router.push('/archive')}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          textAlign: 'left',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-outline)',
          background: 'transparent',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 32,
            height: 32,
            borderRadius: 10,
            color: 'var(--color-on-surface)',
            background: 'var(--color-surface-elevated)',
          }}
        >
          <ArchiveIcon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--color-on-surface)', fontSize: 13, lineHeight: '18px', fontWeight: 600 }}>
            返回我的山行档案
          </div>
          <div
            style={{
              marginTop: 2,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            共 {activity.recordCount} 次山行 · 最新一次是这一次
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 6l6 6-6 6"
            stroke="var(--color-on-surface-variant)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </section>
  )
}

function ActivityInlineActions({ activity }: { activity: ActivityDetailViewModel }) {
  const router = useRouter()
  const canPublishToCommunity = activity.mountain.id !== null && activity.hasMeaningfulActivityData

  return (
    <section className="act-actions" data-testid="activity-inline-actions">
      <div className="act-actions__inner">
        <div className="act-actions__grid">
          {canPublishToCommunity ? (
            <SecondaryButton className="act-actions__button" onClick={() => router.push(`/community/publish/${activity.id}`)}>
              发布到山友圈
            </SecondaryButton>
          ) : null}
          <PrimaryButton as="a" href={`/share?checkinId=${activity.id}`} className="act-actions__button">
            生成分享
          </PrimaryButton>
        </div>
        {canPublishToCommunity ? (
          <>
            <div className="act-actions__help">
              <HelpLink anchor="review.community-eligibility">什么样能发到山友圈</HelpLink>
            </div>
            <div className="act-actions__hint">这是属于你的山行 · 不发布也是好选择</div>
          </>
        ) : null}
      </div>
    </section>
  )
}

export default function ActivityDetailClient({ activity }: { activity: ActivityDetailViewModel }) {
  const router = useRouter()
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(activity.note)
  const [draftNote, setDraftNote] = useState(activity.note)
  const [isNoteEditing, setIsNoteEditing] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [photos, setPhotos] = useState(activity.photos)
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false)
  const noteSaveInFlightRef = useRef(false)
  const photoUploadInFlightRef = useRef(false)
  const photoDeleteInFlightRef = useRef(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const isNoteEditingRef = useRef(false)

  useEffect(() => {
    isNoteEditingRef.current = isNoteEditing
  }, [isNoteEditing])

  useEffect(() => {
    setSavedNote(activity.note)
    if (!isNoteEditingRef.current) {
      setDraftNote(activity.note)
    }
  }, [activity.note])

  useEffect(() => {
    setPhotos(activity.photos)
  }, [activity.photos])

  useEffect(() => {
    if (lightboxIndex === null) return
    if (!photos.length) {
      setLightboxIndex(null)
      return
    }
    if (lightboxIndex >= photos.length) {
      setLightboxIndex(photos.length - 1)
    }
  }, [lightboxIndex, photos.length])

  const renderedActivity: ActivityDetailViewModel = {
    ...activity,
    note: savedNote,
    photos,
  }

  function showLocalToast(message: string) {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 2200)
  }

  function handleBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/archive')
  }

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${activity.mountain.name} · Peak Trekker`,
          text: '这次山行已收进我的档案。',
          url,
        })
        return
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
      }
    }
    await navigator.clipboard?.writeText(url)
    window.alert('活动链接已复制。')
  }

  function handleStartNoteEdit() {
    setDraftNote(savedNote)
    setIsNoteEditing(true)
  }

  function handleCancelNoteEdit() {
    setDraftNote(savedNote)
    setIsNoteEditing(false)
  }

  async function handleSaveNote() {
    const validation = getActivityNoteValidation({
      draftNote,
      savedNote,
      status: activity.status,
      isSaving: isSavingNote,
    })
    if (!validation.canSave || noteSaveInFlightRef.current) return

    noteSaveInFlightRef.current = true
    setIsSavingNote(true)
    try {
      const response = await fetch('/api/activity/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_activity_note',
          checkinId: activity.id,
          note: validation.normalizedDraft,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(String(payload?.error ?? '攀登日记保存失败，请稍后重试。'))
      }

      const nextNote = typeof payload?.note === 'string' ? payload.note : validation.normalizedDraft
      setSavedNote(nextNote)
      setDraftNote(nextNote)
      setIsNoteEditing(false)
      showLocalToast('攀登日记已保存。')
      router.refresh()
    } catch (error) {
      showLocalToast(error instanceof Error ? error.message : '攀登日记保存失败，请稍后重试。')
    } finally {
      noteSaveInFlightRef.current = false
      setIsSavingNote(false)
    }
  }

  function handleAddPhoto() {
    if (isDeletingPhoto || photoDeleteInFlightRef.current) return

    const validation = getActivityPhotoUploadValidation({
      currentPhotoCount: photos.length,
      selectedFileCount: 1,
      status: activity.status,
      isUploading: isUploadingPhotos,
    })

    if (!validation.isApproved) {
      showLocalToast('待审核通过后可补传。')
      return
    }
    if (photos.length >= ACTIVITY_PHOTO_MAX_COUNT) {
      showLocalToast(`已达 ${ACTIVITY_PHOTO_MAX_COUNT} 张上限，删掉一张才能补传。`)
      return
    }
    if (isUploadingPhotos || photoUploadInFlightRef.current) return

    photoInputRef.current?.click()
  }

  function handleOpenPhoto(index: number) {
    if (!photos[index]) return
    setLightboxIndex(index)
  }

  async function handleDeletePhoto(photo: ActivityPhotoViewModel) {
    const validation = getActivityPhotoDeleteValidation({
      status: activity.status,
      isDeleting: isDeletingPhoto,
    })

    if (!validation.isApproved) {
      showLocalToast('待审核通过后可删除。')
      return
    }
    if (!validation.canDelete || photoDeleteInFlightRef.current) return

    if (!window.confirm('删除后，这张照片会从活动详情移除。')) return

    photoDeleteInFlightRef.current = true
    setIsDeletingPhoto(true)
    try {
      const response = await fetch('/api/activity/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_activity_image',
          checkinId: activity.id,
          photoId: photo.assetId ?? photo.id,
          photoUrl: photo.url,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(String(payload?.error ?? '现场照片删除失败，请稍后重试。'))
      }

      const deletedPhotoUrl = typeof payload?.deletedPhotoUrl === 'string' ? payload.deletedPhotoUrl : photo.url
      const nextPhotos = photos.filter((candidate) => {
        if (candidate.id === photo.id) return false
        if (candidate.assetId && photo.assetId && candidate.assetId === photo.assetId) return false
        if (candidate.url === deletedPhotoUrl) return false
        return true
      })

      setPhotos(nextPhotos)
      setLightboxIndex((currentIndex) => {
        if (!nextPhotos.length) return null
        return Math.min(currentIndex ?? 0, nextPhotos.length - 1)
      })
      showLocalToast('现场照片已删除。')
      router.refresh()
    } catch (error) {
      showLocalToast(error instanceof Error ? error.message : '现场照片删除失败，请稍后重试。')
    } finally {
      photoDeleteInFlightRef.current = false
      setIsDeletingPhoto(false)
    }
  }

  async function handlePhotoSelection(files: FileList | null) {
    if (!files?.length) return

    const selectedFiles = [...files]
    const validation = getActivityPhotoUploadValidation({
      currentPhotoCount: photos.length,
      selectedFileCount: selectedFiles.length,
      status: activity.status,
      isUploading: isUploadingPhotos,
    })

    if (!validation.isApproved) {
      showLocalToast('待审核通过后可补传。')
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    if (validation.isOverLimit) {
      showLocalToast(`最多只能保留 ${ACTIVITY_PHOTO_MAX_COUNT} 张现场照片。`)
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    if (photoUploadInFlightRef.current || isUploadingPhotos) {
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    photoUploadInFlightRef.current = true
    setIsUploadingPhotos(true)
    try {
      const formData = new FormData()
      formData.set('action', 'add_activity_images')
      formData.set('checkinId', activity.id)
      for (const file of selectedFiles) {
        formData.append('files', file)
      }

      const response = await fetch('/api/activity/actions', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(String(payload?.error ?? '现场照片上传失败，请稍后重试。'))
      }

      const nextPhotos: ActivityPhotoViewModel[] = Array.isArray(payload?.assets)
        ? payload.assets.flatMap((asset: unknown): ActivityPhotoViewModel[] => {
            if (!asset || typeof asset !== 'object') return []
            const candidate = asset as Record<string, unknown>
            if (typeof candidate.id !== 'string' || typeof candidate.url !== 'string') return []
            return [
              {
                id: candidate.id,
                assetId: candidate.id,
                url: candidate.url,
                thumbnailUrl:
                  typeof candidate.thumbnail_url === 'string' && candidate.thumbnail_url
                    ? candidate.thumbnail_url
                    : candidate.url,
              },
            ]
          })
        : []

      if (nextPhotos.length) {
        setPhotos((current) => {
          const seen = new Set(current.map((photo) => photo.url))
          const uniqueNext = nextPhotos.filter((photo) => {
            if (seen.has(photo.url)) return false
            seen.add(photo.url)
            return true
          })
          return [...current, ...uniqueNext]
        })
      }

      showLocalToast(selectedFiles.length > 1 ? '现场照片已上传。' : '现场照片已添加。')
      router.refresh()
    } catch (error) {
      showLocalToast(error instanceof Error ? error.message : '现场照片上传失败，请稍后重试。')
    } finally {
      photoUploadInFlightRef.current = false
      setIsUploadingPhotos(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  return (
    <main
      className="activity-detail-page"
      data-activity-checkin-id={activity.id}
      style={{
        position: 'relative',
        minHeight: '100dvh',
        marginTop: 'calc(-1 * max(env(safe-area-inset-top), var(--space-2)))',
        color: 'var(--color-on-surface)',
        background: 'var(--color-surface)',
        overflowX: 'hidden',
      }}
    >
      <ActivityTopBar onBack={handleBack} onShare={handleShare} />
      <ActivityHero activity={renderedActivity} />
      <MemoryNote
        activity={renderedActivity}
        savedNote={savedNote}
        draftNote={draftNote}
        isEditing={isNoteEditing}
        isSaving={isSavingNote}
        onStartEdit={handleStartNoteEdit}
        onCancelEdit={handleCancelNoteEdit}
        onDraftChange={setDraftNote}
        onSave={handleSaveNote}
      />
      {renderedActivity.isSummit ? <SummitReachedCard activity={renderedActivity} /> : <MaxAltitudeCard activity={renderedActivity} />}
      <KeyDataGrid activity={renderedActivity} />
      <ActivityRouteMap activity={renderedActivity} />
      <RouteSnapshot activity={renderedActivity} />
      <PhotoStrip
        activity={renderedActivity}
        onAddPhoto={handleAddPhoto}
        onOpenPhoto={handleOpenPhoto}
        isUploading={isUploadingPhotos}
        isDeleting={isDeletingPhoto}
      />
      <input
        ref={photoInputRef}
        data-testid="activity-photo-upload-input"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void handlePhotoSelection(event.currentTarget.files)
        }}
      />
      {lightboxIndex !== null ? (
        <ActivityPhotoLightbox
          photos={photos}
          activeIndex={lightboxIndex}
          isDeleting={isDeletingPhoto}
          status={activity.status}
          onClose={() => setLightboxIndex(null)}
          onSelectIndex={setLightboxIndex}
          onDeletePhoto={(photo) => {
            void handleDeletePhoto(photo)
          }}
        />
      ) : null}
      <CompanionStrip companions={renderedActivity.companions ?? []} />
      <ProofStrip status={renderedActivity.proofStatus} />
      <BackToRecords activity={renderedActivity} />
      <ActivityInlineActions activity={renderedActivity} />
      {toastMessage ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            zIndex: 20,
            left: 'var(--space-4)',
            right: 'var(--space-4)',
            bottom: 'calc(var(--act-actions-footer-height, 148px) + env(safe-area-inset-bottom) + var(--space-3))',
            maxWidth: 'var(--page-max-width)',
            margin: '0 auto',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            color: 'var(--color-on-surface)',
            background: 'var(--color-surface-elevated)',
            textAlign: 'center',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
          }}
        >
          {toastMessage}
        </div>
      ) : null}
    </main>
  )
}
