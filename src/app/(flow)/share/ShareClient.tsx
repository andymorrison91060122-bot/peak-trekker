'use client'

/* eslint-disable @next/next/no-img-element */

import type { ChangeEvent, CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BackIcon,
  CameraIcon,
  MoreIcon,
  MountainIcon,
  ShareIcon,
} from '@/components/ui/Icons'
import { HelpTrigger } from '@/components/help/HelpTrigger'
import type { ShareRenderTemplate } from '@/lib/share-templates/types'
import { buildShareTrackPath, type ShareTrackPreview } from '@/lib/share-track-preview'

type ShareViewMode = 'editor' | 'watermarkPreview'
type ExportAction = 'save' | 'share' | 'transparent' | null
type TemplateId = ShareRenderTemplate
type BasicTemplateId = Extract<TemplateId, 'base-classic' | 'base-data'>
type AdvancedTemplateId = Exclude<TemplateId, BasicTemplateId>
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

export interface ShareActivityData {
  mountainName?: string
  altitude?: number
  distance?: number
  duration?: number
  elevationGain?: number
  date?: string
  location?: string
  pace?: string
  source?: ShareActivitySource
  trackPreview?: ShareTrackPreview | null
}

type FieldConfig = {
  key: ShareFieldKey
  label: string
  locked: boolean
  defaultOn: boolean
}

type BasicTemplate = {
  id: BasicTemplateId
  label: string
  variant: 'classic' | 'data'
}

type AdvancedTemplate = {
  id: AdvancedTemplateId
  label: string
  kind:
    | 'photo-composite'
    | 'photo-overlay'
    | 'bold-number'
    | 'data-scatter'
    | 'mono-film'
    | 'altitude-profile'
    | 'summit-certificate'
    | 'vertical-story'
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
  { id: 'base-classic', label: 'Classic', variant: 'classic' },
  { id: 'base-data', label: 'Data', variant: 'data' },
]

const ADVANCED_TEMPLATES: AdvancedTemplate[] = [
  { id: 'premium-photo-composite', label: 'Photo', kind: 'photo-composite' },
  { id: 'premium-photo-overlay', label: 'Overlay', kind: 'photo-overlay' },
  { id: 'premium-bold-number', label: 'Number', kind: 'bold-number' },
  { id: 'premium-data-scatter', label: 'HUD', kind: 'data-scatter' },
  { id: 'premium-mono-film', label: 'Film', kind: 'mono-film' },
  { id: 'premium-altitude-profile', label: 'Profile', kind: 'altitude-profile' },
  { id: 'premium-summit-certificate', label: 'Cert', kind: 'summit-certificate' },
  { id: 'premium-vertical-story', label: 'Story', kind: 'vertical-story' },
]

type ShareTemplateOption =
  | { tier: 'basic'; template: BasicTemplate }
  | { tier: 'advanced'; template: AdvancedTemplate }

const SHARE_TEMPLATE_OPTIONS: ShareTemplateOption[] = [
  ...BASIC_TEMPLATES.map((template) => ({ tier: 'basic' as const, template })),
  ...ADVANCED_TEMPLATES.map((template) => ({ tier: 'advanced' as const, template })),
]

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

function isAdvancedTemplateId(template: TemplateId): template is AdvancedTemplateId {
  return template.startsWith('premium-')
}

function isVisible(field: ShareFieldKey, toggles: Record<ShareFieldKey, boolean>) {
  const config = FIELD_CONFIGS.find((item) => item.key === field)
  return Boolean(config?.locked || toggles[field])
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function noop() {}

function stripDataUrlPrefix(dataUrl: string | null) {
  return dataUrl?.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '') ?? undefined
}

async function resizePhotoFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('照片读取失败，请换一张再试'))
      nextImage.src = url
    })
    const maxWidth = 1080
    const scale = image.width > maxWidth ? maxWidth / image.width : 1
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('照片处理失败，请换一张再试')
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function IconButton({
  label,
  children,
  onClick = noop,
  style,
  disabled = false,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  style?: CSSProperties
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.46 : 1,
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

function TopoBackground() {
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
    </>
  )
}

const DEFAULT_PREVIEW_TRAIL_PATH =
  'M66 328 C 94 306 82 278 112 260 C 146 239 132 202 157 186 C 198 160 172 126 209 110 C 235 98 228 70 250 48'

function TrailPath({ trackPreview }: { trackPreview?: ShareTrackPreview | null }) {
  const route = buildShareTrackPath(trackPreview, {
    x: 32,
    y: 44,
    width: 216,
    height: 290,
    padding: 10,
  })
  const path = route?.d ?? DEFAULT_PREVIEW_TRAIL_PATH
  const start = route?.start ?? { x: 66, y: 328 }
  const end = route?.end ?? { x: 250, y: 48 }

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
        data-real-track={route ? 'true' : undefined}
        d={path}
        stroke="var(--color-success)"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
        opacity="0.18"
        filter="url(#share-trail-glow)"
      />
      <path
        data-real-track={route ? 'true' : undefined}
        d={path}
        stroke="var(--color-success)"
        strokeWidth="4.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={start.x} cy={start.y} r="7" fill="var(--color-surface)" stroke="var(--color-success)" strokeWidth="3" />
      <circle cx={end.x} cy={end.y} r="8" fill="var(--color-success)" />
    </svg>
  )
}

function MountainTexturePreview() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 280 498"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, opacity: 0.34 }}
      aria-hidden="true"
    >
      <path d="M-20 210 L42 152 L80 178 L130 112 L184 190 L228 130 L300 214" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity=".42" />
      <path d="M-30 246 L54 180 L98 210 L146 150 L196 226 L245 168 L310 260" stroke="var(--color-on-surface)" strokeWidth="0.65" fill="none" opacity=".28" />
      <path d="M-20 284 L62 220 L112 248 L160 196 L212 276 L258 228 L312 312" stroke="var(--color-on-surface)" strokeWidth="0.55" fill="none" opacity=".18" />
      <path d="M-28 336 L52 270 L106 306 L164 254 L222 342 L276 288 L318 366" stroke="var(--color-on-surface)" strokeWidth="0.45" fill="none" opacity=".12" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
        <path
          key={index}
          d={`M${14 + index * 30} 330 C ${36 + index * 28} 262 ${56 + index * 25} 184 ${82 + index * 22} 118`}
          stroke="var(--color-on-surface)"
          strokeWidth="0.45"
          fill="none"
          opacity=".14"
        />
      ))}
    </svg>
  )
}

function PreviewSourcePill({ source }: { source: ShareActivityData['source'] }) {
  const gps = source === 'gps'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: gps ? 22 : 21,
        padding: gps ? '0 7px' : '0 8px',
        borderRadius: 'var(--radius-xs)',
        border: gps ? '1px solid var(--color-success)' : '1px solid var(--color-outline)',
        background: gps
          ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)'
          : 'color-mix(in srgb, var(--color-surface-variant) 72%, transparent)',
        color: gps ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
        whiteSpace: 'nowrap',
        boxShadow: gps ? '0 0 14px color-mix(in srgb, var(--color-primary) 22%, transparent)' : 'none',
      }}
    >
      {gps ? (
        <>
          <MountainIcon size={12} color="currentColor" />
          <span
            aria-hidden="true"
            style={{
              width: 1,
              height: 12,
              background: 'color-mix(in srgb, var(--color-success) 58%, transparent)',
              marginLeft: 5,
              marginRight: 5,
              flex: '0 0 auto',
            }}
          />
          <svg width="11" height="11" viewBox="0 0 24 24" style={{ display: 'block', flex: '0 0 auto' }} aria-hidden="true">
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ marginLeft: 5, fontSize: 8.5, lineHeight: 1, fontWeight: 800, letterSpacing: '0.04em' }}>
            GPS VERIFIED
          </span>
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" style={{ display: 'block', flex: '0 0 auto', marginRight: 5 }} aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M14 3v5h5M8.5 14l2 2 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ fontSize: 8.5, lineHeight: 1, fontWeight: 800, letterSpacing: '0.06em' }}>
            UPLOADED
          </span>
        </>
      )}
    </span>
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
      <PreviewSourcePill source={data.source} />
    </div>
  )
}

function PreviewWatermarkOverlay() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: -48,
        right: -48,
        top: '20%',
        height: '60%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
        transform: 'rotate(-30deg) scale(1.25)',
        transformOrigin: 'center',
        pointerEvents: 'none',
        zIndex: 8,
      }}
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          style={{
            color: 'rgba(255,255,255,0.2)',
            fontSize: 17,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          Peak Trekker 预览版 · Peak Trekker 预览版
        </div>
      ))}
    </div>
  )
}

function LockBadge() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 7,
        right: 7,
        width: 22,
        height: 22,
        borderRadius: 'var(--radius-xs)',
        background: 'color-mix(in srgb, var(--color-surface) 78%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-on-surface) 14%, transparent)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 3,
      }}
    >
      <LockIcon />
    </span>
  )
}

function UnlockHintBar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="share-unlock-hint"
      style={{
        margin: 'var(--space-3) var(--space-5) 0',
        minHeight: 46,
        borderRadius: 'var(--radius-md)',
        border: '1px solid color-mix(in srgb, var(--color-success) 24%, transparent)',
        background: 'color-mix(in srgb, var(--color-success) 7%, transparent)',
        color: 'var(--color-success)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: '0 var(--space-3)',
        cursor: 'pointer',
        width: 'calc(100% - var(--space-10))',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <LockIcon />
        <span
          style={{
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          解锁高级模板，导出无水印版本
        </span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function BaseHeroPreview({
  data,
  toggles,
  template,
  photoDataUrl,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  template: BasicTemplateId
  photoDataUrl: string | null
}) {
  const isData = template === 'base-data'
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
      {photoDataUrl ? (
        <>
          <PreviewPhotoBackground photoDataUrl={photoDataUrl} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 24%, transparent), color-mix(in srgb, var(--color-surface) 86%, transparent) 82%, var(--color-surface))',
            }}
          />
          {isData ? <MountainTexturePreview /> : null}
        </>
      ) : isData ? (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--color-success) 14%, transparent), transparent 30%), linear-gradient(180deg, var(--color-surface-variant), var(--color-surface))',
            }}
          />
          <MountainTexturePreview />
        </>
      ) : !isData ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 58% 24%, color-mix(in srgb, var(--color-success) 10%, transparent), transparent 22%), var(--color-surface)',
          }}
        />
      ) : null}
      {isData ? null : <TrailPath trackPreview={data.trackPreview} />}
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
          bottom: isData ? 118 : 104,
          color: 'var(--color-on-surface)',
          textAlign: isData ? 'center' : 'left',
        }}
      >
        {isData ? (
          <div
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 13,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: '0.08em',
              marginBottom: 8,
            }}
          >
            峰顶海拔
          </div>
        ) : mountainLine ? (
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
            fontSize: isData ? 68 : 54,
            lineHeight: 0.95,
            fontWeight: 700,
            letterSpacing: '0',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {formatNumber(data.altitude)}
          <span style={{ fontSize: isData ? 22 : 19, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
        </div>
        {isData && mountainLine ? (
          <div
            style={{
              marginTop: 16,
              color: 'var(--color-on-surface)',
              fontSize: 14,
              lineHeight: 1.3,
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountainLine}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: isData ? 76 : 52,
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

function PreviewPhotoBackground({
  photoDataUrl,
  grayscale = false,
  children,
}: {
  photoDataUrl: string | null
  grayscale?: boolean
  children?: ReactNode
}) {
  return (
    <>
      {photoDataUrl ? (
        <img
          src={photoDataUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: grayscale ? 'grayscale(1)' : 'none',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 62% 18%, color-mix(in srgb, var(--color-success) 14%, transparent), transparent 26%), linear-gradient(180deg, var(--color-surface-variant), var(--color-surface))',
          }}
        />
      )}
      {children}
    </>
  )
}

function MiniRidges() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 280 498" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, opacity: 0.26 }} aria-hidden="true">
      <path d="M-20 214 L38 168 L76 190 L128 134 L182 204 L224 154 L300 226" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity=".5" />
      <path d="M-24 268 L52 208 L100 232 L154 178 L208 260 L260 212 L310 302" stroke="var(--color-on-surface)" strokeWidth="0.7" fill="none" opacity=".34" />
      <path d="M-26 326 L44 270 L108 306 L168 250 L224 344 L276 286 L318 376" stroke="var(--color-on-surface)" strokeWidth="0.55" fill="none" opacity=".24" />
    </svg>
  )
}

function PremiumHeroPreview({
  data,
  toggles,
  template,
  photoDataUrl,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  template: AdvancedTemplateId
  photoDataUrl: string | null
}) {
  const statItems = [
    { key: 'distance', label: 'DISTANCE', value: formatDistance(data.distance), unit: 'km' },
    isVisible('duration', toggles) ? { key: 'duration', label: 'TIME', value: formatDuration(data.duration), unit: '' } : null,
    isVisible('elevationGain', toggles) ? { key: 'elevationGain', label: 'GAIN', value: formatNumber(data.elevationGain), unit: 'm' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; unit: string }>
  const mountainLine = [
    isVisible('mountainName', toggles) ? data.mountainName : null,
    isVisible('location', toggles) ? data.location : null,
    isVisible('date', toggles) ? data.date : null,
  ].filter(Boolean).join(' · ')
  const verticalStory = template === 'premium-vertical-story'
  const monoFilm = template === 'premium-mono-film'
  const certificate = template === 'premium-summit-certificate'
  const dataScatter = template === 'premium-data-scatter'
  const overlay = template === 'premium-photo-overlay'
  const bold = template === 'premium-bold-number'
  const profile = template === 'premium-altitude-profile'

  if (monoFilm) {
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
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
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', overflow: 'hidden' }}>
          <PreviewPhotoBackground photoDataUrl={photoDataUrl} grayscale>{photoDataUrl ? null : <MiniRidges />}</PreviewPhotoBackground>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', background: 'linear-gradient(180deg, rgba(15,17,19,0) 0%, rgba(15,17,19,.56) 58%, rgba(15,17,19,1) 100%)' }} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '56%', bottom: 0, background: 'linear-gradient(180deg, var(--color-surface), #0a0c0e)' }} />

        <div style={{ position: 'absolute', left: 18, right: 18, top: '38%' }}>
          {mountainLine ? (
            <div style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.2, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {mountainLine}
            </div>
          ) : null}
          <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', marginTop: 16 }}>峰顶海拔</div>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 10, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: 62, lineHeight: 0.9, fontWeight: 800 }}>{formatNumber(data.altitude)}</span>
            <span style={{ fontSize: 18, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div>
        </div>

        <PreviewStats stats={statItems} bottom={62} compact />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  if (verticalStory) {
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
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
        <PreviewPhotoBackground photoDataUrl={photoDataUrl} grayscale>
          {!photoDataUrl ? <MiniRidges /> : null}
        </PreviewPhotoBackground>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 10%, transparent), color-mix(in srgb, var(--color-surface) 16%, transparent) 62%, transparent)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%', background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.42) 46%, rgba(10,12,14,0.84) 100%)' }} />
        <div style={{ position: 'absolute', left: 16, right: 16, top: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ color: 'var(--color-on-surface)', fontSize: 10, fontWeight: 800 }}>Peak Trekker</div>
          {data.date ? <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 10, fontWeight: 800 }}>{data.date}</div> : null}
        </div>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 122, textAlign: 'left' }}>
          {mountainLine ? <div style={{ color: 'var(--color-on-surface)', fontSize: 13, lineHeight: 1.25, fontWeight: 800 }}>{mountainLine}</div> : null}
          <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 8, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: 44, lineHeight: 0.92, fontWeight: 800 }}>{formatNumber(data.altitude)}</span>
            <span style={{ fontSize: 16, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div>
        </div>
        <StoryPreviewDataBar data={data} toggles={toggles} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  if (overlay) {
    const overlayName = isVisible('mountainName', toggles) ? data.mountainName : ''
    const overlayLocation = isVisible('location', toggles) ? data.location : ''
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
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
        <PreviewPhotoBackground photoDataUrl={photoDataUrl}>{photoDataUrl ? null : <TopoBackground />}</PreviewPhotoBackground>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--color-surface), color-mix(in srgb, var(--color-surface) 80%, transparent) 44%, transparent)' }} />
        <div style={{ position: 'absolute', left: 18, top: 74, width: 104 }}>
          {overlayName ? <div style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.18, fontWeight: 800 }}>{overlayName}</div> : null}
          {overlayLocation ? <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, lineHeight: 1.1, fontWeight: 800, marginTop: 9 }}>{overlayLocation}</div> : null}
          <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 20, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: 42, lineHeight: 0.92, fontWeight: 800 }}>{formatNumber(data.altitude)}</span>
            <span style={{ fontSize: 14, marginLeft: 2, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 24 }}>
            <PremiumMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
            {isVisible('duration', toggles) ? <PremiumMetric label="时长" value={formatDuration(data.duration)} /> : null}
            {isVisible('elevationGain', toggles) ? <PremiumMetric label="爬升" value={formatNumber(data.elevationGain)} unit="m" /> : null}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  if (bold) {
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
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
        <PreviewPhotoBackground photoDataUrl={photoDataUrl}>{photoDataUrl ? null : <TopoBackground />}</PreviewPhotoBackground>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 12%, transparent), color-mix(in srgb, var(--color-surface) 86%, transparent) 78%, var(--color-surface))' }} />
        <div style={{ position: 'absolute', left: 16, top: 54, color: 'rgba(255,255,255,0.32)', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' }}>峰顶海拔</div>
        <div style={{ position: 'absolute', left: 14, right: 14, top: 78, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-mono)', fontSize: 66, lineHeight: 0.92, fontWeight: 800 }}>
          {formatNumber(data.altitude)}
          <span style={{ fontSize: 22, marginLeft: 3 }}>m</span>
        </div>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 104, textAlign: 'left' }}>
          {mountainLine ? <div style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.25, fontWeight: 800 }}>{mountainLine}</div> : null}
          <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 8, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: 42, lineHeight: 0.92, fontWeight: 800 }}>{formatNumber(data.altitude)}</span>
            <span style={{ fontSize: 16, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div>
        </div>
        <PreviewStats stats={statItems.slice(0, 2)} bottom={52} compact />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="share-hero-preview"
      data-template={template}
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
      {certificate ? (
        <>
          {photoDataUrl ? (
            <>
              <PreviewPhotoBackground photoDataUrl={photoDataUrl} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 36%, transparent), color-mix(in srgb, var(--color-surface) 68%, transparent) 100%)' }} />
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, var(--color-surface-variant), var(--color-surface))' }} />
          )}
          <MiniRidges />
          <svg width="100%" height="56%" viewBox="0 0 280 278" style={{ position: 'absolute', insetInline: 0, top: 22 }} aria-hidden="true">
            <path d="M26 210 H254M26 160 H254M26 110 H254" stroke="var(--color-on-surface)" strokeWidth=".6" strokeDasharray="3 5" opacity=".18" />
            <path d="M26 222 C 58 190 86 208 116 162 S 164 110 198 82 S 228 58 254 38 L254 232 L26 232 Z" fill="var(--color-success)" opacity=".13" />
            <path d="M26 222 C 58 190 86 208 116 162 S 164 110 198 82 S 228 58 254 38" stroke="var(--color-success)" strokeWidth="2" fill="none" />
          </svg>
        </>
      ) : dataScatter ? (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '42%', background: 'linear-gradient(160deg, var(--color-surface-variant), var(--color-surface))' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '60%', overflow: 'hidden' }}>
            <PreviewPhotoBackground photoDataUrl={photoDataUrl}>{photoDataUrl ? null : <TopoBackground />}</PreviewPhotoBackground>
          </div>
        </>
      ) : (
        <PreviewPhotoBackground photoDataUrl={photoDataUrl} grayscale={verticalStory}>
          {!photoDataUrl ? <TopoBackground /> : null}
        </PreviewPhotoBackground>
      )}

      {!certificate && !dataScatter ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: overlay
              ? 'linear-gradient(90deg, color-mix(in srgb, var(--color-surface) 88%, transparent), transparent 76%)'
              : 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--color-surface) 88%, transparent) 76%, var(--color-surface))',
          }}
        />
      ) : null}

      {template === 'premium-photo-composite' ? <TrailPath trackPreview={data.trackPreview} /> : null}

      {bold ? (
        <div style={{ position: 'absolute', left: 14, right: 14, top: 46, color: 'color-mix(in srgb, var(--color-on-surface) 26%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 66, lineHeight: 0.92, fontWeight: 800 }}>
          {formatNumber(data.altitude)}
          <span style={{ fontSize: 22, marginLeft: 3 }}>m</span>
        </div>
      ) : null}

      {profile ? (
        <>
          <div style={{ position: 'absolute', left: 16, top: 36 }}><PremiumMetric label="DISTANCE" value={formatDistance(data.distance)} unit="km" accent /></div>
          <div style={{ position: 'absolute', right: 16, top: 36, textAlign: 'right' }}><PremiumMetric label="GAIN" value={formatNumber(data.elevationGain)} unit="m" accent align="right" /></div>
          <div style={{ position: 'absolute', left: 18, bottom: 120, width: 54, height: 54, borderRadius: 999, border: '1px solid color-mix(in srgb, var(--color-on-surface) 28%, transparent)', display: 'grid', placeItems: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 40 40"><path d="M5 30 Q 13 18 20 22 T 34 7" stroke="var(--color-on-surface)" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          </div>
        </>
      ) : null}

      {dataScatter ? (
        <div style={{ position: 'absolute', left: 14, top: 66, width: 92 }}>
          <div style={{ color: 'var(--color-on-surface)', fontSize: 11, lineHeight: 1.2, fontWeight: 800 }}>{mountainLine}</div>
          <div style={{ marginTop: 16, color: 'var(--color-on-surface-variant)', fontSize: 8, fontWeight: 800, letterSpacing: '0.08em' }}>峰顶海拔</div>
          <div style={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)', fontSize: 30, lineHeight: 1, fontWeight: 800 }}>{formatNumber(data.altitude)}<span style={{ fontSize: 10, marginLeft: 2 }}>m</span></div>
          <div style={{ width: 22, height: 2, borderRadius: 999, background: 'var(--color-success)', marginTop: 14, marginBottom: 10 }} />
          {statItems.map((item) => <TinyMetric key={item.key} label={item.label} value={item.value} unit={item.unit} />)}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: overlay ? 18 : 16,
            right: overlay ? 118 : 16,
            bottom: certificate ? 112 : verticalStory ? 96 : monoFilm ? 116 : 104,
            textAlign: certificate || verticalStory || profile ? 'center' : 'left',
          }}
        >
          {mountainLine ? (
            <div style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.25, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {mountainLine}
            </div>
          ) : null}
          <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 8, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: certificate ? 44 : verticalStory ? 44 : profile ? 46 : 56, lineHeight: 0.92, fontWeight: 800 }}>{formatNumber(data.altitude)}</span>
            <span style={{ fontSize: 18, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div>
        </div>
      )}

      {!dataScatter && !profile && !verticalStory ? (
        <PreviewStats stats={statItems} bottom={monoFilm ? 62 : certificate ? 74 : 52} compact={monoFilm || certificate} />
      ) : null}
      {verticalStory ? <PreviewStats stats={statItems} bottom={58} compact pill /> : null}
      {profile ? (
        <div style={{ position: 'absolute', right: 16, bottom: 112, display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'flex-end' }}>
          {isVisible('duration', toggles) ? <PremiumMetric label="TIME" value={formatDuration(data.duration)} align="right" /> : null}
          {isVisible('date', toggles) && data.date ? <PremiumMetric label="DATE" value={data.date} align="right" /> : null}
        </div>
      ) : null}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
        <BrandFooter data={data} />
      </div>
    </div>
  )
}

function HeroPreview({
  data,
  toggles,
  template,
  photoDataUrl,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  template: TemplateId
  photoDataUrl: string | null
}) {
  if (template === 'base-classic' || template === 'base-data') {
    return <BaseHeroPreview data={data} toggles={toggles} template={template} photoDataUrl={photoDataUrl} />
  }
  return <PremiumHeroPreview data={data} toggles={toggles} template={template} photoDataUrl={photoDataUrl} />
}

function StoryPreviewDataBar({
  data,
  toggles,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
}) {
  const items = [
    { key: 'altitude', icon: 'pin', value: formatNumber(data.altitude), unit: 'm' },
    { key: 'distance', icon: 'mountain', value: formatDistance(data.distance), unit: 'km' },
    isVisible('duration', toggles) ? { key: 'duration', icon: 'clock', value: formatDuration(data.duration), unit: '' } : null,
    isVisible('elevationGain', toggles) ? { key: 'gain', icon: 'arrow', value: formatNumber(data.elevationGain), unit: 'm' } : null,
  ].filter(Boolean) as Array<{ key: string; icon: 'pin' | 'mountain' | 'clock' | 'arrow'; value: string; unit: string }>

  return (
    <div
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 58,
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.key}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-on-surface)',
            borderLeft: index === 0 ? 'none' : '1px solid color-mix(in srgb, var(--color-on-surface-variant) 42%, transparent)',
            paddingInline: 3,
          }}
        >
          <StoryPreviewIcon kind={item.icon} />
          <span style={{ marginLeft: 3, color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {item.value}
          </span>
          {item.unit ? <span style={{ marginLeft: 1, color: 'var(--color-on-surface-variant)', fontSize: 6.5, fontWeight: 800 }}>{item.unit}</span> : null}
        </div>
      ))}
    </div>
  )
}

function StoryPreviewIcon({ kind }: { kind: 'pin' | 'mountain' | 'clock' | 'arrow' }) {
  if (kind === 'mountain') {
    return <MountainIcon size={10} color="var(--color-on-surface)" />
  }
  if (kind === 'clock') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'arrow') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M6 18L18 6M10 6h8v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 21s7-5.2 7-12a7 7 0 0 0-14 0c0 6.8 7 12 7 12z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="9" r="2.2" fill="currentColor" />
    </svg>
  )
}

function PremiumMetric({
  label,
  value,
  unit,
  accent = false,
  align = 'left',
}: {
  label: string
  value: string
  unit?: string
  accent?: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 8, lineHeight: 1, fontWeight: 800, letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ marginTop: 4, color: accent ? 'var(--color-success)' : 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 17, lineHeight: 1, fontWeight: 800 }}>
        {value}
        {unit ? <span style={{ fontSize: 8, marginLeft: 2, color: 'var(--color-on-surface-variant)' }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function TinyMetric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 7, fontWeight: 800, letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, marginTop: 2 }}>
        {value}
        {unit ? <span style={{ fontSize: 6, color: 'var(--color-on-surface-variant)', marginLeft: 1 }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function PreviewStats({
  stats,
  bottom,
  compact = false,
  pill = false,
}: {
  stats: Array<{ key: string; label: string; value: string; unit: string }>
  bottom: number
  compact?: boolean
  pill?: boolean
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: pill ? 16 : 16,
        right: pill ? 16 : 16,
        bottom,
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(1, stats.length)}, minmax(0, 1fr))`,
        alignItems: 'stretch',
        padding: pill ? '7px 8px' : 0,
        borderRadius: pill ? 'var(--radius-pill)' : 0,
        background: pill ? 'color-mix(in srgb, var(--color-surface) 72%, transparent)' : 'transparent',
      }}
    >
      {stats.map((item, index) => (
        <div
          key={item.key}
          style={{
            textAlign: 'center',
            paddingInline: 3,
            borderLeft: index === 0 ? 'none' : '1px solid color-mix(in srgb, var(--color-on-surface-variant) 46%, transparent)',
            minWidth: 0,
          }}
        >
          <div style={{ color: 'var(--color-on-surface-variant)', fontSize: compact ? 7.5 : 9, lineHeight: 1, fontWeight: 800, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            {item.label}
          </div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: compact ? 13 : 18, lineHeight: 1, fontWeight: 800, color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
            {item.value}
            {item.unit ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: compact ? 7 : 10, color: 'var(--color-on-surface-variant)', marginLeft: 1 }}>{item.unit}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function TemplateThumb({
  template,
  selected,
  data,
  onSelect,
}: {
  template: BasicTemplate
  selected: boolean
  data: ShareActivityData
  onSelect: (template: BasicTemplateId) => void
}) {
  const isData = template.variant === 'data'
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(template.id)}
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
      {isData ? (
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

function AdvancedThumb({
  template,
  selected,
  onSelect,
  locked,
  limitedFree,
}: {
  template: AdvancedTemplate
  selected: boolean
  onSelect: (template: AdvancedTemplateId) => void
  locked: boolean
  limitedFree: boolean
}) {
  const photoLike = template.kind.includes('photo') || template.kind === 'vertical-story' || template.kind === 'mono-film'
  const dataLike = template.kind === 'data-scatter' || template.kind === 'altitude-profile' || template.kind === 'summit-certificate'
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(template.id)}
      style={{
        width: 82,
        height: 122,
        borderRadius: 'var(--radius-sm)',
        border: selected ? '2px solid var(--color-success)' : '1px solid var(--color-outline)',
        background: photoLike
          ? 'linear-gradient(145deg, color-mix(in srgb, var(--color-surface-elevated) 72%, var(--color-primary)), var(--color-surface))'
          : dataLike
            ? 'linear-gradient(180deg, color-mix(in srgb, var(--color-success) 12%, var(--color-surface-variant)), var(--color-surface))'
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
      <svg width="100%" height="100%" viewBox="0 0 82 122" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        {template.kind === 'mono-film' ? (
          <>
            <rect x="0" y="0" width="82" height="54" fill="color-mix(in srgb, var(--color-surface-elevated) 78%, var(--color-primary))" />
            <polyline points="-5,48 16,34 30,42 48,27 62,40 88,22" fill="none" stroke="var(--color-success)" strokeWidth="1.2" opacity=".42" />
            <rect x="0" y="50" width="82" height="22" fill="url(#share-thumb-mono-fade)" />
            <text x="9" y="78" fill="var(--color-success)" fontSize="16" fontWeight="800">1265m</text>
            <rect x="0" y="84" width="82" height="38" fill="#0a0c0e" opacity=".92" />
            <rect x="12" y="96" width="12" height="2" rx="1" fill="currentColor" opacity=".45" />
            <rect x="35" y="96" width="12" height="2" rx="1" fill="currentColor" opacity=".45" />
            <rect x="58" y="96" width="12" height="2" rx="1" fill="currentColor" opacity=".45" />
            <defs>
              <linearGradient id="share-thumb-mono-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(10,12,14,0)" />
                <stop offset="100%" stopColor="#0a0c0e" />
              </linearGradient>
            </defs>
          </>
        ) : template.kind === 'summit-certificate' ? (
          <>
            <path d="M7 74 H75M7 55 H75M7 36 H75" stroke="var(--color-on-surface)" strokeWidth=".45" opacity=".18" />
            <path d="M7 88 Q 22 67 34 72 T 57 42 T 75 24" stroke="var(--color-success)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </>
        ) : template.kind === 'bold-number' ? (
          <text x="8" y="54" fill="currentColor" opacity=".24" fontSize="27" fontWeight="800">3952</text>
        ) : template.kind === 'data-scatter' ? (
          <>
            <rect x="0" y="0" width="35" height="122" fill="color-mix(in srgb, var(--color-surface) 78%, transparent)" />
            <path d="M42 84 L57 62 L70 74 L82 52 L82 122 L42 122 Z" fill="color-mix(in srgb, var(--color-success) 10%, transparent)" />
          </>
        ) : (
          <>
            <path d="M0 84 L18 64 L33 72 L50 52 L64 66 L82 45 L82 122 L0 122 Z" fill="color-mix(in srgb, var(--color-surface) 72%, transparent)" />
            <path d="M12 94 Q 26 72 40 76 T 70 30" stroke="var(--color-success)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </>
        )}
      </svg>
      {limitedFree ? (
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
            zIndex: 2,
          }}
        >
          限免
        </div>
      ) : null}
      {locked ? (
        <>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,17,19,0.4)',
              zIndex: 2,
            }}
          />
          <LockBadge />
        </>
      ) : null}
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
        {template.label}
      </div>
    </button>
  )
}

function ThumbnailRow({
  selectedTemplate,
  data,
  onSelectTemplate,
  paywallEnabled,
  premiumUnlocked,
}: {
  selectedTemplate: TemplateId
  data: ShareActivityData
  onSelectTemplate: (template: TemplateId) => void
  paywallEnabled: boolean
  premiumUnlocked: boolean
}) {
  const advancedLocked = paywallEnabled && !premiumUnlocked
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
      {SHARE_TEMPLATE_OPTIONS.map((option) => (
        option.tier === 'basic' ? (
          <TemplateThumb
            key={option.template.id}
            template={option.template}
            selected={selectedTemplate === option.template.id}
            data={data}
            onSelect={onSelectTemplate}
          />
        ) : (
          <AdvancedThumb
            key={option.template.id}
            template={option.template}
            selected={selectedTemplate === option.template.id}
            onSelect={onSelectTemplate}
            locked={advancedLocked}
            limitedFree={!paywallEnabled}
          />
        )
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

function ControlRow({
  onPickPhoto,
  onRemovePhoto,
  onExportTransparent,
  transparentExporting,
  hasPhoto,
}: {
  onPickPhoto: () => void
  onRemovePhoto: () => void
  onExportTransparent: () => void
  transparentExporting: boolean
  hasPhoto: boolean
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
      <IconButton label="换照片" onClick={onPickPhoto}>
        <CameraIcon size={18} />
      </IconButton>
      <IconButton label="移除照片" onClick={onRemovePhoto} disabled={!hasPhoto}>
        <TrashIcon />
      </IconButton>
      <button
        type="button"
        onClick={onExportTransparent}
        disabled={transparentExporting}
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
          cursor: transparentExporting ? 'wait' : 'pointer',
          fontSize: 'var(--font-label-m-size)',
          fontWeight: 800,
          whiteSpace: 'nowrap',
          opacity: transparentExporting ? 0.72 : 1,
        }}
      >
        <DownloadIcon />
        {transparentExporting ? '生成中' : '导出透明水印'}
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
        数据由系统记录
        <HelpTrigger anchor="privacy.share-content" size={14} style={{ width: 28, height: 28 }} />
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

function ActionBar({
  exportingAction,
  onSave,
  onShare,
}: {
  exportingAction: ExportAction
  onSave: () => void
  onShare: () => void
}) {
  const exporting = Boolean(exportingAction)
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
          onClick={onSave}
          disabled={exporting}
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
            cursor: exporting ? 'wait' : 'pointer',
            opacity: exporting && exportingAction !== 'save' ? 0.58 : 1,
            minWidth: 0,
          }}
        >
          <DownloadIcon />
          {exportingAction === 'save' ? '生成中' : '保存'}
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={exporting}
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
            cursor: exporting ? 'wait' : 'pointer',
            opacity: exporting && exportingAction !== 'share' ? 0.58 : 1,
            minWidth: 0,
          }}
        >
          {exportingAction === 'share' ? '生成中' : '分享'}
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

function WatermarkPreviewScreen({
  imageUrl,
  exportingAction,
  onBack,
  onSave,
  onShare,
}: {
  imageUrl: string
  exportingAction: ExportAction
  onBack: () => void
  onSave: () => void
  onShare: () => void
}) {
  const exporting = Boolean(exportingAction)

  return (
    <main
      data-testid="share-watermark-preview"
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'calc(112px + env(safe-area-inset-bottom))',
      }}
    >
      <NavBarTitle title="透明水印预览" onBack={onBack} />
      <section
        style={{
          margin: 'var(--space-3) var(--space-4) 0',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-outline)',
          overflow: 'hidden',
          minHeight: 540,
          display: 'grid',
          placeItems: 'center',
          backgroundColor: 'var(--color-surface-variant)',
          backgroundImage: `
            linear-gradient(45deg, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 25%, transparent 25%),
            linear-gradient(-45deg, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 75%),
            linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 75%)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
        }}
      >
        <img
          src={imageUrl}
          alt="透明水印预览"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            maxHeight: 620,
            objectFit: 'contain',
          }}
        />
      </section>

      <div
        style={{
          margin: 'var(--space-4) var(--space-4) 0',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        导出为透明 PNG 叠层
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 10v6M12 7.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          padding: 'var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom))',
          background: 'linear-gradient(180deg, transparent, var(--color-surface) 20%, var(--color-surface) 100%)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--page-max-width)',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-3)',
          }}
        >
          <button
            type="button"
            onClick={onSave}
            disabled={exporting}
            style={{
              height: 52,
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-success)',
              color: 'var(--color-on-primary)',
              fontSize: 'var(--font-title-m-size)',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: exporting ? 'wait' : 'pointer',
              opacity: exporting && exportingAction !== 'save' ? 0.58 : 1,
            }}
          >
            <DownloadIcon />
            {exportingAction === 'save' ? '保存中' : '保存到相册'}
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={exporting}
            style={{
              height: 52,
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--color-success)',
              background: 'transparent',
              color: 'var(--color-success)',
              fontSize: 'var(--font-title-m-size)',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: exporting ? 'wait' : 'pointer',
              opacity: exporting && exportingAction !== 'share' ? 0.58 : 1,
            }}
          >
            <ShareIcon size={17} />
            {exportingAction === 'share' ? '分享中' : '分享'}
          </button>
        </div>
      </div>
    </main>
  )
}

function NavBarTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
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
          fontSize: 'var(--font-headline-m-size)',
          lineHeight: 'var(--font-headline-m-line)',
          fontWeight: 700,
        }}
      >
        {title}
      </div>
    </div>
  )
}

export default function ShareClient({
  initialData,
  checkinId,
  paywallEnabled = false,
  premiumUnlocked = true,
}: {
  initialData?: ShareActivityData | null
  checkinId?: string
  paywallEnabled?: boolean
  premiumUnlocked?: boolean
}) {
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('base-classic')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ShareViewMode>('editor')
  const [transparentBlob, setTransparentBlob] = useState<Blob | null>(null)
  const [transparentBlobUrl, setTransparentBlobUrl] = useState<string | null>(null)
  const [fieldToggles, setFieldToggles] = useState<Record<ShareFieldKey, boolean>>(initialFieldToggles)
  const [exportingAction, setExportingAction] = useState<ExportAction>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const activityData = useMemo(() => initialData ?? MOCK_DATA, [initialData])
  const premiumPreviewLocked = paywallEnabled && isAdvancedTemplateId(selectedTemplate) && !premiumUnlocked

  useEffect(() => () => {
    if (transparentBlobUrl) URL.revokeObjectURL(transparentBlobUrl)
  }, [transparentBlobUrl])

  function toggleField(field: ShareFieldKey) {
    const config = FIELD_CONFIGS.find((item) => item.key === field)
    if (config?.locked) return
    setFieldToggles((current) => ({
      ...current,
      [field]: !current[field],
    }))
  }

  function showPremiumExportHint() {
    if (!premiumPreviewLocked) return
    setExportError('当前为预览版，解锁后可导出无水印版本')
  }

  async function renderPosterBlob(options: { transparent?: boolean } = {}) {
    if (!checkinId) {
      throw new Error('缺少活动记录，无法生成分享图')
    }

    const response = await fetch('/api/share/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: selectedTemplate,
        checkinId,
        fieldVisibility: {
          duration: fieldToggles.duration,
          elevationGain: fieldToggles.elevationGain,
          date: fieldToggles.date,
          location: fieldToggles.location,
          pace: fieldToggles.pace,
          mountainName: fieldToggles.mountainName,
        },
        photoBase64: stripDataUrlPrefix(photoDataUrl),
        transparent: Boolean(options.transparent),
      }),
    })

    if (!response.ok) {
      throw new Error('分享图生成失败，请稍后再试')
    }

    return response.blob()
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setExportError('请选择图片文件')
      return
    }
    setExportError(null)
    try {
      setPhotoDataUrl(await resizePhotoFile(file))
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '照片处理失败，请换一张再试')
    }
  }

  async function handleSave() {
    setExportingAction('save')
    setExportError(null)
    showPremiumExportHint()
    try {
      const blob = await renderPosterBlob()
      downloadBlob(blob, `peak-trekker-${selectedTemplate}.png`)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '分享图生成失败，请稍后再试')
    } finally {
      setExportingAction(null)
    }
  }

  async function handleShare() {
    setExportingAction('share')
    setExportError(null)
    showPremiumExportHint()
    try {
      const blob = await renderPosterBlob()
      const file = new File([blob], 'peak-trekker.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${activityData.mountainName ?? 'Peak Trekker'} ${formatNumber(activityData.altitude)}m`,
          files: [file],
        })
      } else {
        downloadBlob(blob, `peak-trekker-${selectedTemplate}.png`)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setExportError(error instanceof Error ? error.message : '分享图生成失败，请稍后再试')
    } finally {
      setExportingAction(null)
    }
  }

  async function handleTransparentExport() {
    setExportingAction('transparent')
    setExportError(null)
    showPremiumExportHint()
    try {
      const blob = await renderPosterBlob({ transparent: true })
      const nextUrl = URL.createObjectURL(blob)
      setTransparentBlob(blob)
      setTransparentBlobUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return nextUrl
      })
      setViewMode('watermarkPreview')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '透明水印生成失败，请稍后再试')
    } finally {
      setExportingAction(null)
    }
  }

  function handleWatermarkPreviewBack() {
    setViewMode('editor')
  }

  async function handleSaveTransparent() {
    if (!transparentBlob) return
    setExportingAction('save')
    try {
      downloadBlob(transparentBlob, `peak-trekker-${selectedTemplate}-transparent.png`)
    } finally {
      setExportingAction(null)
    }
  }

  async function handleShareTransparent() {
    if (!transparentBlob) return
    setExportingAction('share')
    try {
      const file = new File([transparentBlob], 'peak-trekker-transparent.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${activityData.mountainName ?? 'Peak Trekker'} 透明水印`,
          files: [file],
        })
      } else {
        downloadBlob(transparentBlob, `peak-trekker-${selectedTemplate}-transparent.png`)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setExportError(error instanceof Error ? error.message : '透明水印分享失败，请稍后再试')
    } finally {
      setExportingAction(null)
    }
  }

  if (viewMode === 'watermarkPreview' && transparentBlobUrl) {
    return (
      <WatermarkPreviewScreen
        imageUrl={transparentBlobUrl}
        exportingAction={exportingAction}
        onBack={handleWatermarkPreviewBack}
        onSave={handleSaveTransparent}
        onShare={handleShareTransparent}
      />
    )
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
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handlePhotoChange}
      />

      <section
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-2) var(--space-5) 0',
        }}
      >
        <div style={{ position: 'relative', display: 'flex' }}>
          <HeroPreview
            data={activityData}
            toggles={fieldToggles}
            template={selectedTemplate}
            photoDataUrl={photoDataUrl}
          />
          {premiumPreviewLocked ? <PreviewWatermarkOverlay /> : null}
        </div>
      </section>
      {premiumPreviewLocked ? (
        <UnlockHintBar onClick={() => window.alert('付费功能即将上线')} />
      ) : null}

      <ThumbnailRow
        selectedTemplate={selectedTemplate}
        data={activityData}
        onSelectTemplate={setSelectedTemplate}
        paywallEnabled={paywallEnabled}
        premiumUnlocked={premiumUnlocked}
      />
      <ControlRow
        onPickPhoto={() => photoInputRef.current?.click()}
        onRemovePhoto={() => setPhotoDataUrl(null)}
        onExportTransparent={handleTransparentExport}
        transparentExporting={exportingAction === 'transparent'}
        hasPhoto={Boolean(photoDataUrl)}
      />
      <FieldSelector data={activityData} toggles={fieldToggles} onToggle={toggleField} />
      {exportError ? (
        <div
          role="status"
          style={{
            margin: 'var(--space-3) var(--space-5) 0',
            color: 'var(--color-error)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
          }}
        >
          {exportError}
        </div>
      ) : null}
      <ActionBar exportingAction={exportingAction} onSave={handleSave} onShare={handleShare} />
    </main>
  )
}
