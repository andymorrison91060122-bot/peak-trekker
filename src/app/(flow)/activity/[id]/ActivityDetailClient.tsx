'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import IconButton from '@/components/ui/IconButton'
import { SourceLabel, type SourceLabelProps } from '@/components/ui/SourceLabel'
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

export type ActivityPhotoViewModel = {
  id: string
  url: string
  thumbnailUrl: string
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

function PhotoStrip({ activity, onAddPhoto }: { activity: ActivityDetailViewModel; onAddPhoto: () => void }) {
  const photos = activity.photos.slice(0, 4)
  const labels = ['起点', 'C1', '山顶', '回营']

  if (!photos.length) {
    return (
      <section style={sectionPadding('var(--space-5)')}>
        <SectionHead>照片</SectionHead>
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
            style={{ marginTop: 12, minHeight: 44, height: 44 }}
            onClick={onAddPhoto}
          >
            补一张照片
          </SecondaryButton>
        </div>
      </section>
    )
  }

  return (
    <section style={sectionPadding('var(--space-5)')}>
      <SectionHead right={`${activity.photos.length} 张`}>照片</SectionHead>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            style={{
              position: 'relative',
              overflow: 'hidden',
              aspectRatio: '1 / 1',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-outline)',
              backgroundImage: `url("${photo.thumbnailUrl}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 35%',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, transparent 58%, color-mix(in srgb, var(--color-surface) 60%, transparent))',
              }}
            />
            <div
              style={{
                ...monoStyle,
                position: 'absolute',
                left: 10,
                bottom: 8,
                color: 'var(--color-on-surface)',
                fontSize: 10,
                lineHeight: '14px',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              {labels[index] ?? `C${index + 1}`}
            </div>
          </div>
        ))}
        <button
          type="button"
          aria-label="补充照片"
          onClick={onAddPhoto}
          style={{
            display: 'grid',
            placeItems: 'center',
            aspectRatio: '1 / 1',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-outline)',
            color: 'var(--color-on-surface-variant)',
            background: 'var(--color-surface)',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          <CameraIcon size={32} />
        </button>
      </div>
    </section>
  )
}

function MemoryNote({ activity, onEditNote }: { activity: ActivityDetailViewModel; onEditNote: () => void }) {
  const hasNote = Boolean(activity.note.trim())
  const notePlace = activity.isSummit ? '山顶' : '途中'

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
            「{activity.note}」
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
              onClick={onEditNote}
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
            onClick={onEditNote}
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

function ActivityBottomBar({ activity }: { activity: ActivityDetailViewModel }) {
  const router = useRouter()

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 10,
        left: 0,
        right: 0,
        bottom: 0,
        padding: '12px var(--space-4) 26px',
        background:
          'linear-gradient(180deg, transparent, color-mix(in srgb, var(--color-surface) 96%, transparent) 30%)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: 10,
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
        }}
      >
        <SecondaryButton as="a" href={`/community/publish/${activity.id}`} style={{ whiteSpace: 'nowrap' }}>
          发布到山友圈
        </SecondaryButton>
        <PrimaryButton
          onClick={() => router.push(`/share?checkinId=${activity.id}`)}
          style={{ width: '100%', whiteSpace: 'nowrap' }}
        >
          分享这次山行
        </PrimaryButton>
      </div>
    </div>
  )
}

export default function ActivityDetailClient({ activity }: { activity: ActivityDetailViewModel }) {
  const router = useRouter()
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100dvh',
        marginTop: 'calc(-1 * max(env(safe-area-inset-top), var(--space-2)))',
        paddingBottom: 120,
        color: 'var(--color-on-surface)',
        background: 'var(--color-surface)',
        overflowX: 'hidden',
      }}
    >
      <ActivityTopBar onBack={handleBack} onShare={handleShare} />
      <ActivityHero activity={activity} />
      <MemoryNote activity={activity} onEditNote={() => showLocalToast('手记功能即将上线')} />
      {activity.isSummit ? <SummitReachedCard activity={activity} /> : <MaxAltitudeCard activity={activity} />}
      <KeyDataGrid activity={activity} />
      <RouteSnapshot activity={activity} />
      <PhotoStrip activity={activity} onAddPhoto={() => showLocalToast('照片补传功能即将上线')} />
      <ProofStrip status={activity.proofStatus} />
      <BackToRecords activity={activity} />
      <ActivityBottomBar activity={activity} />
      {toastMessage ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            zIndex: 20,
            left: 'var(--space-4)',
            right: 'var(--space-4)',
            bottom: 96,
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
