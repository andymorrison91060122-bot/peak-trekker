'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  BackIcon,
  CameraIcon,
  MoreIcon,
  MountainIcon,
  ShareIcon,
} from '@/components/ui/Icons'
import { SourceLabel } from '@/components/ui/SourceLabel'

type ShareTab = 'basic' | 'advanced'
type TemplateId = 'basic-classic' | 'basic-minimal' | 'basic-data'
type ShareFieldKey =
  | 'altitude'
  | 'distance'
  | 'duration'
  | 'elevationGain'
  | 'date'
  | 'location'
  | 'pace'
  | 'mountainName'

type ShareActivitySource = 'gps' | 'track_import' | 'screenshot_recognition'

interface ShareActivityData {
  mountainName?: string
  altitude?: number
  distance?: number
  duration?: number
  elevationGain?: number
  date?: string
  location?: string
  pace?: string
  source?: ShareActivitySource
}

type FieldConfig = {
  key: ShareFieldKey
  label: string
  locked: boolean
  defaultOn: boolean
}

type BasicTemplate = {
  id: TemplateId
  label: string
  variant: 'classic' | 'minimal' | 'data'
}

const MOCK_DATA: ShareActivityData = {
  mountainName: '玉山主峰',
  altitude: 3952,
  distance: 12.8,
  duration: 24120,
  elevationGain: 1350,
  date: '2026.04.28',
  location: '台湾',
  source: 'gps',
}

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'altitude', label: '海拔', locked: true, defaultOn: true },
  { key: 'distance', label: '总距离', locked: true, defaultOn: true },
  { key: 'duration', label: '时长', locked: false, defaultOn: true },
  { key: 'elevationGain', label: '爬升', locked: false, defaultOn: true },
  { key: 'date', label: '日期', locked: false, defaultOn: true },
  { key: 'location', label: '地点', locked: false, defaultOn: true },
  { key: 'pace', label: '配速', locked: false, defaultOn: false },
  { key: 'mountainName', label: '山峰名', locked: false, defaultOn: true },
]

const BASIC_TEMPLATES: BasicTemplate[] = [
  { id: 'basic-classic', label: 'Classic', variant: 'classic' },
  { id: 'basic-minimal', label: 'Minimal', variant: 'minimal' },
  { id: 'basic-data', label: 'Data', variant: 'data' },
]

const ADVANCED_TEMPLATES = [
  'Photo',
  'Overlay',
  'Split',
  'Number',
  'Story',
] as const

const initialFieldToggles = FIELD_CONFIGS.reduce<Record<ShareFieldKey, boolean>>((next, field) => {
  next[field.key] = field.defaultOn
  return next
}, {} as Record<ShareFieldKey, boolean>)

function formatNumber(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return String(Math.round(value))
}

function formatDistance(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return value.toFixed(1)
}

function formatDistanceWithUnit(value: number | undefined) {
  const formatted = formatDistance(value)
  return formatted === '--' ? formatted : `${formatted} km`
}

function formatDuration(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const safeSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatFieldValue(field: ShareFieldKey, data: ShareActivityData) {
  if (field === 'altitude') {
    const value = formatNumber(data.altitude)
    return value === '--' ? value : `${value} m`
  }
  if (field === 'distance') return formatDistanceWithUnit(data.distance)
  if (field === 'duration') return formatDuration(data.duration)
  if (field === 'elevationGain') {
    const value = formatNumber(data.elevationGain)
    return value === '--' ? value : `${value} m`
  }
  if (field === 'date') return data.date ?? '--'
  if (field === 'location') return data.location ?? '--'
  if (field === 'pace') return data.pace ?? '--'
  return data.mountainName ?? '--'
}

function sourceLabelType(source: ShareActivityData['source']) {
  return source === 'gps' ? 'gps_verified' : 'uploaded'
}

function isVisible(field: ShareFieldKey, toggles: Record<ShareFieldKey, boolean>) {
  const config = FIELD_CONFIGS.find((item) => item.key === field)
  return Boolean(config?.locked || toggles[field])
}

function noop() {}

function IconButton({
  label,
  children,
  onClick = noop,
  style,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'color-mix(in srgb, var(--color-surface-variant) 84%, transparent)',
        color: 'var(--color-on-surface)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        flexShrink: 0,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function NavBar({ onBack }: { onBack: () => void }) {
  return (
    <div
      data-testid="share-nav"
      style={{
        height: 48,
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        background: 'color-mix(in srgb, var(--color-surface) 86%, transparent)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <button
        type="button"
        aria-label="返回"
        onClick={onBack}
        style={{
          width: 44,
          height: 44,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-on-surface)',
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          cursor: 'pointer',
          zIndex: 1,
        }}
      >
        <BackIcon size={22} />
      </button>
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          pointerEvents: 'none',
          textAlign: 'center',
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-title-m-size)',
          lineHeight: 'var(--font-title-m-line)',
          fontWeight: 600,
        }}
      >
        分享编辑器
      </div>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={noop}
        style={{
          minWidth: 56,
          height: 40,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-success)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 700,
          cursor: 'pointer',
          zIndex: 1,
        }}
      >
        预览
      </button>
    </div>
  )
}

function TopoBackground({ showMap }: { showMap: boolean }) {
  if (!showMap) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 58% 22%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 34%), linear-gradient(180deg, var(--color-surface-variant), var(--color-surface))',
        }}
      />
    )
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 62% 18%, color-mix(in srgb, var(--color-primary) 15%, transparent), transparent 32%), linear-gradient(180deg, color-mix(in srgb, var(--color-surface-variant) 72%, var(--color-surface)), var(--color-surface))',
        }}
      />
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 280 498"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, opacity: 0.42 }}
        aria-hidden="true"
      >
        {[132, 112, 92, 74, 56, 38, 24].map((rx, index) => (
          <ellipse
            key={rx}
            cx={150 + index * 2}
            cy={170 + index * 5}
            rx={rx}
            ry={Math.max(18, rx * 0.7)}
            stroke="var(--color-on-surface)"
            strokeWidth="0.7"
            fill="none"
            opacity={0.08 + index * 0.018}
          />
        ))}
        <path d="M-10 292 Q 48 276 98 286 T 286 252" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity="0.1" />
        <path d="M-10 334 Q 62 318 128 326 T 290 300" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity="0.08" />
        <path d="M-10 96 Q 52 118 112 96 T 286 88" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity="0.07" />
      </svg>
      <MapLabel x={50} y={135} title="玉山北峰" sub="3858m" />
      <MapLabel x={176} y={260} title="圆峰山屋" sub="3030m" icon="hut" />
      <MapLabel x={42} y={350} title="塔塔加" sub="" />
    </>
  )
}

function MapLabel({
  x,
  y,
  title,
  sub,
  icon = 'peak',
}: {
  x: number
  y: number
  title: string
  sub: string
  icon?: 'peak' | 'hut'
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        color: 'color-mix(in srgb, var(--color-on-surface-variant) 58%, transparent)',
        fontSize: 7,
        lineHeight: 1.35,
        fontWeight: 700,
        textShadow: '0 1px 2px var(--color-surface)',
      }}
    >
      <div>{title}</div>
      {sub ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
          {icon === 'hut' ? <HutGlyph /> : <PeakGlyph />}
          <span>{sub}</span>
        </div>
      ) : null}
    </div>
  )
}

function PeakGlyph() {
  return (
    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2l5 8H1z" fill="currentColor" opacity=".7" />
    </svg>
  )
}

function HutGlyph() {
  return (
    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6l4-3 4 3v4H2z" fill="currentColor" opacity=".7" />
    </svg>
  )
}

function TrailPath() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 280 498"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      <defs>
        <filter id="share-trail-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <path
        d="M66 328 C 94 306 82 278 112 260 C 146 239 132 202 157 186 C 198 160 172 126 209 110 C 235 98 228 70 250 48"
        stroke="var(--color-success)"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
        opacity="0.18"
        filter="url(#share-trail-glow)"
      />
      <path
        d="M66 328 C 94 306 82 278 112 260 C 146 239 132 202 157 186 C 198 160 172 126 209 110 C 235 98 228 70 250 48"
        stroke="var(--color-success)"
        strokeWidth="4.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="66" cy="328" r="7" fill="var(--color-surface)" stroke="var(--color-success)" strokeWidth="3" />
      <circle cx="250" cy="48" r="8" fill="var(--color-success)" />
    </svg>
  )
}

function BrandFooter({ data }: { data: ShareActivityData }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        transform: 'scale(0.84)',
        transformOrigin: 'center',
      }}
    >
      <MountainIcon size={22} color="var(--color-success)" />
      <span
        style={{
          color: 'var(--color-on-surface)',
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        Peak Trekker
      </span>
      <SourceLabel type={sourceLabelType(data.source)} size="sm" />
    </div>
  )
}

function HeroTemplate({
  data,
  toggles,
  showMap,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  showMap: boolean
}) {
  const statItems = [
    isVisible('distance', toggles)
      ? { key: 'distance', label: 'DISTANCE', value: formatDistance(data.distance), unit: 'km' }
      : null,
    isVisible('duration', toggles)
      ? { key: 'duration', label: 'TIME', value: formatDuration(data.duration), unit: '' }
      : null,
    isVisible('elevationGain', toggles)
      ? { key: 'elevationGain', label: 'GAIN', value: formatNumber(data.elevationGain), unit: 'm' }
      : null,
    isVisible('pace', toggles) && data.pace ? { key: 'pace', label: '配速', value: data.pace, unit: '' } : null,
  ].filter(Boolean).slice(0, 3) as Array<{ key: string; label: string; value: string; unit: string }>

  const mountainLine = [
    isVisible('mountainName', toggles) ? data.mountainName : null,
    isVisible('location', toggles) ? data.location : null,
    isVisible('date', toggles) ? data.date : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      data-testid="share-hero-preview"
      style={{
        width: 'min(65vw, 246px)',
        aspectRatio: '9 / 16',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface)',
        position: 'relative',
        flexShrink: 0,
        boxShadow: '0 24px 56px color-mix(in srgb, var(--color-surface) 76%, transparent)',
      }}
    >
      <TopoBackground showMap={showMap} />
      <TrailPath />
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          bottom: 0,
          height: '47%',
          background:
            'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--color-surface) 84%, transparent) 20%, var(--color-surface) 86%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 104,
          color: 'var(--color-on-surface)',
        }}
      >
        {mountainLine ? (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.25,
              fontWeight: 800,
              letterSpacing: '0',
              marginBottom: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountainLine}
          </div>
        ) : null}
        <div
          style={{
            color: 'var(--color-success)',
            fontFamily: 'var(--font-mono)',
            fontSize: 54,
            lineHeight: 0.95,
            fontWeight: 700,
            letterSpacing: '0',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {formatNumber(data.altitude)}
          <span style={{ fontSize: 19, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 52,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, statItems.length)}, minmax(0, 1fr))`,
          alignItems: 'stretch',
          color: 'var(--color-on-surface)',
        }}
      >
        {statItems.map((item, index) => (
          <div
            key={item.key}
            data-stat-key={item.key}
            style={{
              textAlign: 'center',
              paddingInline: item.key === 'date' ? 0 : 4,
              borderLeft: index === 0 ? 'none' : '1px solid color-mix(in srgb, var(--color-on-surface-variant) 54%, transparent)',
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: 9,
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 700,
                color: 'var(--color-on-surface)',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.value}
              {item.unit ? (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--color-on-surface-variant)', marginLeft: 2 }}>
                  {item.unit}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
        <BrandFooter data={data} />
      </div>
    </div>
  )
}

function TemplateThumb({
  template,
  selected,
  data,
}: {
  template: BasicTemplate
  selected: boolean
  data: ShareActivityData
}) {
  const showTopo = template.variant !== 'minimal'
  const isData = template.variant === 'data'
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={noop}
      style={{
        width: 82,
        height: 122,
        borderRadius: 'var(--radius-sm)',
        border: selected ? '2px solid var(--color-success)' : '1px solid var(--color-outline)',
        background: isData
          ? 'linear-gradient(180deg, color-mix(in srgb, var(--color-success) 10%, var(--color-surface-variant)), var(--color-surface))'
          : 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        position: 'relative',
        overflow: 'hidden',
        flex: '0 0 auto',
        padding: 0,
        cursor: 'pointer',
        boxShadow: selected ? '0 0 0 4px color-mix(in srgb, var(--color-primary) 14%, transparent)' : 'none',
      }}
    >
      {showTopo ? (
        <svg width="100%" height="100%" viewBox="0 0 82 122" style={{ position: 'absolute', inset: 0, opacity: 0.34 }} aria-hidden="true">
          <ellipse cx="48" cy="58" rx="36" ry="24" stroke="var(--color-on-surface)" strokeWidth=".5" fill="none" opacity=".35" />
          <ellipse cx="50" cy="56" rx="26" ry="18" stroke="var(--color-on-surface)" strokeWidth=".5" fill="none" opacity=".35" />
          <ellipse cx="52" cy="54" rx="16" ry="12" stroke="var(--color-on-surface)" strokeWidth=".5" fill="none" opacity=".35" />
        </svg>
      ) : null}
      {template.variant === 'classic' ? (
        <svg width="100%" height="100%" viewBox="0 0 82 122" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
          <path d="M12 92 Q 26 74 38 77 T 62 50 T 72 29" stroke="var(--color-success)" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </svg>
      ) : null}
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          top: isData ? 24 : 28,
          textAlign: 'center',
          color: 'var(--color-success)',
          fontFamily: 'var(--font-mono)',
          fontSize: isData ? 18 : 16,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {formatNumber(data.altitude)}
        <span style={{ fontSize: 8, marginLeft: 1 }}>m</span>
      </div>
      <div
        style={{
          position: 'absolute',
          insetInline: 6,
          top: 52,
          textAlign: 'center',
          color: 'var(--color-on-surface)',
          fontSize: 8,
          lineHeight: 1.2,
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {data.mountainName}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 9,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 3,
          color: 'var(--color-on-surface)',
        }}
      >
        <MountainIcon size={10} color="var(--color-success)" />
        <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.04em' }}>PEAK</span>
      </div>
    </button>
  )
}

function AdvancedThumb({ label, selected }: { label: string; selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={noop}
      style={{
        width: 82,
        height: 122,
        borderRadius: 'var(--radius-sm)',
        border: selected ? '2px solid var(--color-success)' : '1px solid var(--color-outline)',
        background:
          'linear-gradient(145deg, color-mix(in srgb, var(--color-surface-elevated) 86%, var(--color-primary)), var(--color-surface))',
        color: 'var(--color-on-surface)',
        position: 'relative',
        overflow: 'hidden',
        flex: '0 0 auto',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 82 122" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <path d="M0 84 L18 64 L33 72 L50 52 L64 66 L82 45 L82 122 L0 122 Z" fill="color-mix(in srgb, var(--color-surface) 72%, transparent)" />
        <path d="M12 94 Q 26 72 40 76 T 70 30" stroke="var(--color-success)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 7,
          right: 7,
          borderRadius: 'var(--radius-xs)',
          background: 'color-mix(in srgb, var(--color-surface) 72%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-on-surface) 12%, transparent)',
          color: 'var(--color-on-surface)',
          padding: '2px 6px',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        限免
      </div>
      <div
        style={{
          position: 'absolute',
          insetInline: 8,
          bottom: 10,
          fontSize: 8,
          lineHeight: 1.2,
          fontWeight: 800,
          letterSpacing: '0.04em',
          textAlign: 'center',
        }}
      >
        {label}
      </div>
    </button>
  )
}

function Tabs({
  activeTab,
  onChange,
}: {
  activeTab: ShareTab
  onChange: (tab: ShareTab) => void
}) {
  return (
    <div
      data-testid="share-template-tabs"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-6)',
        padding: 'var(--space-3) var(--space-5) 0',
      }}
    >
      {([
        ['basic', '基础'],
        ['advanced', '高级'],
      ] as const).map(([tab, label]) => {
        const active = activeTab === tab
        return (
          <button
            type="button"
            key={tab}
            onClick={() => onChange(tab)}
            style={{
              border: 'none',
              background: 'transparent',
              color: active ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
              padding: '6px 0',
              fontSize: 'var(--font-title-m-size)',
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 700,
              position: 'relative',
              cursor: 'pointer',
            }}
          >
            {label}
            {active ? (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: -2,
                  height: 2,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-success)',
                }}
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function ThumbnailRow({
  activeTab,
  selectedTemplate,
  data,
}: {
  activeTab: ShareTab
  selectedTemplate: TemplateId
  data: ShareActivityData
}) {
  return (
    <div
      className="share-editor-scrollbar"
      data-testid="share-thumbnail-row"
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        overflowX: 'auto',
        padding: 'var(--space-3) var(--space-5) 0',
      }}
    >
      {activeTab === 'basic'
        ? BASIC_TEMPLATES.map((template) => (
            <TemplateThumb
              key={template.id}
              template={template}
              selected={selectedTemplate === template.id}
              data={data}
            />
          ))
        : ADVANCED_TEMPLATES.map((label, index) => (
            <AdvancedThumb key={label} label={label} selected={index === 0} />
          ))}
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l1 12.5A2 2 0 0 0 9.5 21h5a2 2 0 0 0 2-1.5L17.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18l-5 2V6l5-2 6 2 5-2v14l-5 2zM9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InlineSwitch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 32,
        height: 18,
        borderRadius: 'var(--radius-pill)',
        background: on ? 'var(--color-success)' : 'var(--color-outline)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--color-on-surface)',
          boxShadow: '0 1px 3px color-mix(in srgb, var(--color-surface) 65%, transparent)',
          transition: 'left 160ms ease',
        }}
      />
    </span>
  )
}

function ControlRow({
  showMap,
  onToggleMap,
}: {
  showMap: boolean
  onToggleMap: () => void
}) {
  return (
    <div
      className="share-editor-scrollbar"
      data-testid="share-control-row"
      style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        padding: 'var(--space-3) var(--space-5) 0',
        alignItems: 'center',
      }}
    >
      <IconButton label="换照片">
        <CameraIcon size={18} />
      </IconButton>
      <IconButton label="移除照片">
        <TrashIcon />
      </IconButton>
      <button
        type="button"
        onClick={onToggleMap}
        aria-pressed={showMap}
        style={{
          height: 44,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-outline)',
          background: 'color-mix(in srgb, var(--color-surface-variant) 84%, transparent)',
          color: 'var(--color-on-surface)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 var(--space-3)',
          flexShrink: 0,
          cursor: 'pointer',
          fontSize: 'var(--font-label-m-size)',
          fontWeight: 700,
        }}
      >
        <MapIcon />
        地图
        <InlineSwitch on={showMap} />
      </button>
      <button
        type="button"
        onClick={noop}
        style={{
          height: 44,
          borderRadius: 'var(--radius-md)',
          border: '1.5px solid var(--color-success)',
          background: 'transparent',
          color: 'var(--color-success)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 var(--space-3)',
          flexShrink: 0,
          cursor: 'pointer',
          fontSize: 'var(--font-label-m-size)',
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        <DownloadIcon />
        导出透明水印
      </button>
    </div>
  )
}

function DragHandle() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {[0, 1].map((col) =>
        [0, 1, 2].map((row) => (
          <circle key={`${col}-${row}`} cx={3 + col * 8} cy={4 + row * 6} r="1.5" fill="var(--color-on-surface-variant)" opacity=".55" />
        )),
      )}
    </svg>
  )
}

function EditPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.7 4.3l5 5L8.5 20.5 3 22l1.5-5.5L14.7 4.3z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      style={{
        width: 42,
        height: 30,
        border: 'none',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 38,
          height: 22,
          borderRadius: 'var(--radius-pill)',
          background: on ? 'var(--color-success)' : 'var(--color-outline)',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-on-surface)',
            boxShadow: '0 1px 3px color-mix(in srgb, var(--color-surface) 64%, transparent)',
            transition: 'left 160ms ease',
          }}
        />
      </span>
    </button>
  )
}

function FieldSectionHeader() {
  return (
    <div
      style={{
        padding: 'var(--space-6) var(--space-5) var(--space-1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ color: 'var(--color-on-surface)', fontSize: 'var(--font-title-l-size)', lineHeight: 'var(--font-title-l-line)', fontWeight: 700 }}>
        自定义展示字段
      </div>
      <div
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        必填项已锁定
        <LockIcon />
      </div>
    </div>
  )
}

function FieldRow({
  field,
  value,
  on,
  onToggle,
  last,
}: {
  field: FieldConfig
  value: string
  on: boolean
  onToggle: () => void
  last: boolean
}) {
  const missing = value === '--'
  return (
    <div
      data-field-key={field.key}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        minHeight: 58,
        padding: 'var(--space-3) var(--space-1)',
        borderBottom: last ? 'none' : '1px solid color-mix(in srgb, var(--color-outline) 50%, transparent)',
      }}
    >
      <DragHandle />
      <div style={{ width: 72, flexShrink: 0, color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-body-m-size)', lineHeight: 'var(--font-body-m-line)' }}>
        {field.label}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          color: missing ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
          fontSize: 'var(--font-title-m-size)',
          lineHeight: 'var(--font-title-m-line)',
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      <button
        type="button"
        aria-label={`编辑${field.label}`}
        onClick={noop}
        style={{
          width: 30,
          height: 30,
          border: 'none',
          background: 'transparent',
          color: missing ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <EditPencil />
      </button>
      <div style={{ width: 42, display: 'flex', justifyContent: 'flex-end', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
        {field.locked ? <LockIcon /> : <Toggle label={`切换${field.label}`} on={on} onClick={onToggle} />}
      </div>
    </div>
  )
}

function FieldSelector({
  data,
  toggles,
  onToggle,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  onToggle: (field: ShareFieldKey) => void
}) {
  return (
    <section data-testid="share-field-selector">
      <FieldSectionHeader />
      <div
        style={{
          marginInline: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface-variant)',
          border: '1px solid var(--color-outline)',
          paddingInline: 'var(--space-3)',
        }}
      >
        {FIELD_CONFIGS.map((field, index) => (
          <FieldRow
            key={field.key}
            field={field}
            value={formatFieldValue(field.key, data)}
            on={Boolean(toggles[field.key])}
            onToggle={() => onToggle(field.key)}
            last={index === FIELD_CONFIGS.length - 1}
          />
        ))}
      </div>
    </section>
  )
}

function ActionBar() {
  return (
    <div
      data-testid="share-action-bar"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        padding: 'var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom))',
        background:
          'linear-gradient(180deg, transparent, var(--color-surface) 20%, var(--color-surface) 100%)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '0.78fr 1.35fr 0.5fr',
          gap: 'var(--space-2)',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={noop}
          style={{
            height: 50,
            borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--color-success)',
            background: 'transparent',
            color: 'var(--color-success)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          <DownloadIcon />
          保存
        </button>
        <button
          type="button"
          onClick={noop}
          style={{
            height: 50,
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--color-success)',
            color: 'var(--color-on-primary)',
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          分享
          <ShareIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="更多"
          onClick={noop}
          style={{
            height: 50,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            color: 'var(--color-on-surface-variant)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          <MoreIcon size={18} />
        </button>
      </div>
    </div>
  )
}

export default function ShareClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const checkinId = searchParams.get('checkinId')
  const [activeTab, setActiveTab] = useState<ShareTab>('basic')
  const [selectedTemplate] = useState<TemplateId>('basic-classic')
  const [showMap, setShowMap] = useState(true)
  const [fieldToggles, setFieldToggles] = useState<Record<ShareFieldKey, boolean>>(initialFieldToggles)

  const activityData = useMemo(() => MOCK_DATA, [])

  function toggleField(field: ShareFieldKey) {
    const config = FIELD_CONFIGS.find((item) => item.key === field)
    if (config?.locked) return
    setFieldToggles((current) => ({
      ...current,
      [field]: !current[field],
    }))
  }

  return (
    <main
      className="share-editor-root"
      data-share-editor="ready"
      data-checkin-id={checkinId ?? 'mock'}
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        overflowX: 'hidden',
        paddingBottom: 'calc(96px + env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        .share-editor-root * { box-sizing: border-box; }
        .share-editor-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .share-editor-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
      <NavBar onBack={() => router.back()} />

      <section
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-2) var(--space-5) 0',
        }}
      >
        <HeroTemplate data={activityData} toggles={fieldToggles} showMap={showMap} />
      </section>

      <Tabs activeTab={activeTab} onChange={setActiveTab} />
      <div style={{ height: 1, background: 'var(--color-outline)', opacity: 0.7, marginTop: 2 }} />
      <ThumbnailRow activeTab={activeTab} selectedTemplate={selectedTemplate} data={activityData} />
      <ControlRow showMap={showMap} onToggleMap={() => setShowMap((current) => !current)} />
      <FieldSelector data={activityData} toggles={fieldToggles} onToggle={toggleField} />
      <ActionBar />
    </main>
  )
}
