'use client'

import type { ChangeEvent, CSSProperties, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OcrResult, ParsedScreenshotFields, ScreenshotOcrSource, ScreenshotQuotaState } from '@/lib/screenshot/types'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import ModalShell from '@/components/ui/ModalShell'
import { BackIcon, CameraIcon, CheckIcon, ShareIcon, WarnIcon } from '@/components/ui/Icons'
import { trackEvent } from '@/lib/analytics/client'

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
const PROCESSING_MIN_DURATION_MS = 2000
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const SCREENSHOT_MIN_PACE_MIN_PER_KM = 2
const SCREENSHOT_MAX_PACE_MIN_PER_KM = 40

type ScreenshotStep = 'upload' | 'processing' | 'confirm' | 'submitting' | 'success'
type RecognizeErrorKind = 'auth' | 'too_large' | 'unsupported' | 'network' | 'file' | 'quota'
type FieldKey = 'elevation' | 'distance' | 'duration' | 'elevationGain' | 'elevationLoss' | 'date' | 'location' | 'speed' | 'pace'

type RecognizeResult = {
  ok: true
  ocrResult: OcrResult
  parsedFields: ParsedScreenshotFields
  ocrSource?: ScreenshotOcrSource
}

type RecognizeResponse = {
  ok?: boolean
  ocrResult?: OcrResult
  parsedFields?: ParsedScreenshotFields
  ocrSource?: ScreenshotOcrSource
  quota?: ScreenshotQuotaState
  code?: string
  error?: string
}

type SubmitResult = {
  ok: true
  checkinId?: string
}

type FieldToggles = Record<FieldKey, boolean>
type EditableFields = Record<FieldKey, string>

type MountainOption = {
  id: string
  name: string
  altitude?: number | null
  province?: string | null
}

type MountainSearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

type FieldConfig = {
  key: FieldKey
  label: string
  locked: boolean
}

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'elevation', label: '海拔', locked: false },
  { key: 'distance', label: '总距离', locked: true },
  { key: 'duration', label: '时长', locked: false },
  { key: 'elevationGain', label: '爬升', locked: false },
  { key: 'elevationLoss', label: '下降', locked: false },
  { key: 'date', label: '日期', locked: false },
  { key: 'location', label: '地点', locked: false },
  { key: 'speed', label: '速度', locked: false },
  { key: 'pace', label: '配速', locked: false },
]

const EMPTY_FIELD_TOGGLES: FieldToggles = {
  elevation: false,
  distance: true,
  duration: false,
  elevationGain: false,
  elevationLoss: false,
  date: false,
  location: false,
  speed: false,
  pace: false,
}

const EMPTY_EDITABLE_FIELDS: EditableFields = {
  elevation: '',
  distance: '',
  duration: '',
  elevationGain: '',
  elevationLoss: '',
  date: '',
  location: '',
  speed: '',
  pace: '',
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function buildContentHash(file: File) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return `${file.name}:${file.size}:${file.lastModified}`
  }
}

function readImagePreview(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('这张截图暂时无法预览，请换一张再试。'))
      }
    }
    reader.onerror = () => reject(new Error('这张截图暂时无法预览，请换一张再试。'))
    reader.readAsDataURL(file)
  })
}

function buildLoginHref() {
  return `/auth/login?from=${encodeURIComponent('/screenshot')}`
}

function validateImageFile(file: File): { message: string; kind: RecognizeErrorKind } | null {
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return {
      message: '截图文件不能超过 10MB。',
      kind: 'too_large',
    }
  }

  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return {
      message: '仅支持 JPG、PNG 或 WebP 截图。',
      kind: 'unsupported',
    }
  }

  return null
}

function responseKind(status: number): RecognizeErrorKind {
  if (status === 401) return 'auth'
  if (status === 402) return 'quota'
  if (status === 413) return 'too_large'
  if (status === 415) return 'unsupported'
  if (status >= 500) return 'network'
  return 'file'
}

function readableError(message: string, kind: RecognizeErrorKind) {
  if (kind === 'auth') return '登录后才能识别截图。'
  if (kind === 'quota') return '本月截图识别次数已用完。'
  if (/unauthorized/i.test(message)) return '登录后才能识别截图。'
  return message || '这张截图暂时无法识别，请换一张再试。'
}

function providerFromSource(source?: ScreenshotOcrSource) {
  if (source === 'mimo_v25') return 'mimo_v25'
  if (source === 'basic' || source === 'accurate') return `tencent_ocr_${source}`
  return 'screenshot_recognition'
}

function hasFieldValue<T extends { value?: unknown }>(
  field: T | undefined
): field is T & { value: NonNullable<T['value']> } {
  if (!field) return false
  if (typeof field.value === 'string') return field.value.trim().length > 0
  return field.value !== null && field.value !== undefined && field.value !== ''
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const rest = safeSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function buildEditableFields(fields: ParsedScreenshotFields): EditableFields {
  return {
    elevation: hasFieldValue(fields.elevation) ? String(Math.round(fields.elevation.value)) : '',
    distance: hasFieldValue(fields.distance) ? String(fields.distance.value) : '',
    duration: hasFieldValue(fields.duration) ? formatDuration(fields.duration.value) : '',
    elevationGain: hasFieldValue(fields.elevationGain) ? String(Math.round(fields.elevationGain.value)) : '',
    elevationLoss: hasFieldValue(fields.elevationLoss) ? String(Math.round(fields.elevationLoss.value)) : '',
    date: hasFieldValue(fields.date) ? fields.date.value : '',
    location: hasFieldValue(fields.location) ? fields.location.value : '',
    speed: hasFieldValue(fields.speed) ? String(fields.speed.value) : '',
    pace: hasFieldValue(fields.paceMinPerKm) ? formatPaceForInput(fields.paceMinPerKm.value) : '',
  }
}

function parseNumberInput(value: string) {
  const normalized = value.trim().replace(/,/g, '.').replace(/[^\d.-]/g, '')
  if (!normalized) return undefined
  const numberValue = Number(normalized)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function formatPaceForInput(value: number) {
  const totalSeconds = Math.max(0, Math.round(value * 60))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}'${String(seconds).padStart(2, '0')}"`
}

function parsePaceInput(value: string) {
  const normalized = value
    .trim()
    .replace(/\s+/gu, '')
    .replace(/[’′]/gu, "'")
    .replace(/[”″]/gu, '"')
  if (!normalized) return undefined

  const paceMatch = normalized.match(/^([0-9]{1,2})[':]([0-9]{2})"?$/u)
  if (paceMatch) {
    const minutes = Number(paceMatch[1])
    const seconds = Number(paceMatch[2])
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return undefined
    const pace = Math.round((minutes + seconds / 60) * 100) / 100
    return pace >= SCREENSHOT_MIN_PACE_MIN_PER_KM && pace <= SCREENSHOT_MAX_PACE_MIN_PER_KM ? pace : undefined
  }

  if (!/^[0-9]+(?:[,.][0-9]+)?$/u.test(normalized)) return undefined
  const decimalPace = Number(normalized.replace(/,/gu, '.'))
  return Number.isFinite(decimalPace) &&
    decimalPace >= SCREENSHOT_MIN_PACE_MIN_PER_KM &&
    decimalPace <= SCREENSHOT_MAX_PACE_MIN_PER_KM
    ? decimalPace
    : undefined
}

function parseDurationInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const hms = trimmed.match(/^(\d{1,3}):([0-5]?\d):([0-5]?\d)$/u)
  if (hms) {
    return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  }

  const hm = trimmed.match(/^(\d{1,3}):([0-5]?\d)$/u)
  if (hm) {
    return Number(hm[1]) * 3600 + Number(hm[2]) * 60
  }

  const chinese = trimmed.match(/(?:(\d+)\s*(?:小时|时|h))?\s*(?:(\d+)\s*(?:分钟|分|m))?\s*(?:(\d+)\s*(?:秒|s))?/iu)
  if (!chinese?.[0]?.trim() || (!chinese[1] && !chinese[2] && !chinese[3])) return undefined
  const hours = Number(chinese[1] ?? 0)
  const minutes = Number(chinese[2] ?? 0)
  const seconds = Number(chinese[3] ?? 0)
  if (hours < 0 || hours > 999 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return undefined
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  return totalSeconds > 0 ? totalSeconds : undefined
}

function buildScreenshotParsedData(fields: EditableFields, toggles: FieldToggles, fileName?: string) {
  const elevation = toggles.elevation ? parseNumberInput(fields.elevation) : undefined
  const distanceKm = parseNumberInput(fields.distance)
  const durationSeconds = toggles.duration
    ? parseDurationInput(fields.duration)
    : undefined
  const elevationGain = toggles.elevationGain ? parseNumberInput(fields.elevationGain) : undefined
  const elevationLoss = toggles.elevationLoss ? parseNumberInput(fields.elevationLoss) : undefined
  const speed = toggles.speed ? parseNumberInput(fields.speed) : undefined
  const pace = toggles.pace ? parsePaceInput(fields.pace) : undefined
  const date = toggles.date && fields.date.trim() ? fields.date.trim() : undefined
  const location = toggles.location && fields.location.trim() ? fields.location.trim() : undefined

  return {
    format: 'screenshot',
    fileName: fileName ?? 'screenshot',
    ...(location ? { name: location, location } : {}),
    ...(typeof elevation === 'number' ? { maxElevation: Math.round(elevation) } : {}),
    ...(typeof distanceKm === 'number' ? { distanceMeters: Math.round(distanceKm * 1000) } : {}),
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
    ...(typeof elevationGain === 'number' ? { elevationGainMeters: Math.round(elevationGain) } : {}),
    ...(typeof elevationLoss === 'number' ? { elevationLossMeters: Math.round(elevationLoss) } : {}),
    ...(typeof speed === 'number' ? { speedKmh: speed } : {}),
    ...(typeof pace === 'number' ? { paceMinPerKm: pace } : {}),
    ...(date ? { date } : {}),
  }
}

function missingLockedEditableFields(fields: EditableFields) {
  return typeof parseNumberInput(fields.distance) !== 'number'
}

function formatFieldValue(fields: ParsedScreenshotFields, key: FieldKey) {
  switch (key) {
    case 'elevation': {
      const field = fields.elevation
      return hasFieldValue(field) ? `${Math.round(field.value)} m` : '—'
    }
    case 'distance': {
      const field = fields.distance
      return hasFieldValue(field) ? `${field.value} km` : '—'
    }
    case 'duration': {
      const field = fields.duration
      return hasFieldValue(field) ? formatDuration(field.value) : '—'
    }
    case 'elevationGain': {
      const field = fields.elevationGain
      return hasFieldValue(field) ? `${Math.round(field.value)} m` : '—'
    }
    case 'elevationLoss': {
      const field = fields.elevationLoss
      return hasFieldValue(field) ? `${Math.round(field.value)} m` : '—'
    }
    case 'date': {
      const field = fields.date
      return hasFieldValue(field) ? field.value : '—'
    }
    case 'location': {
      const field = fields.location
      return hasFieldValue(field) ? field.value : '—'
    }
    case 'speed': {
      const field = fields.speed
      return hasFieldValue(field) ? `${field.value} km/h` : '—'
    }
    case 'pace': {
      const field = fields.paceMinPerKm
      return hasFieldValue(field) ? `${formatPaceForInput(field.value)} /km` : '—'
    }
  }
}

function hasParsedField(fields: ParsedScreenshotFields, key: FieldKey) {
  switch (key) {
    case 'elevation':
      return hasFieldValue(fields.elevation)
    case 'distance':
      return hasFieldValue(fields.distance)
    case 'duration':
      return hasFieldValue(fields.duration)
    case 'elevationGain':
      return hasFieldValue(fields.elevationGain)
    case 'elevationLoss':
      return hasFieldValue(fields.elevationLoss)
    case 'date':
      return hasFieldValue(fields.date)
    case 'location':
      return hasFieldValue(fields.location)
    case 'speed':
      return hasFieldValue(fields.speed)
    case 'pace':
      return hasFieldValue(fields.paceMinPerKm)
  }
}

function buildInitialFieldToggles(fields: ParsedScreenshotFields): FieldToggles {
  return {
    elevation: hasParsedField(fields, 'elevation'),
    distance: true,
    duration: hasParsedField(fields, 'duration'),
    elevationGain: hasParsedField(fields, 'elevationGain'),
    elevationLoss: hasParsedField(fields, 'elevationLoss'),
    date: hasParsedField(fields, 'date'),
    location: hasParsedField(fields, 'location'),
    speed: hasParsedField(fields, 'speed'),
    pace: hasParsedField(fields, 'pace'),
  }
}

function recognizedFieldKeys(fields: ParsedScreenshotFields) {
  return FIELD_CONFIGS
    .map((field) => field.key)
    .filter((key) => hasParsedField(fields, key))
}

function validationTone(fields: ParsedScreenshotFields) {
  const elevation = fields.elevation?.value
  const distanceKm = fields.distance?.value
  const durationSeconds = fields.duration?.value
  const elevationGain = fields.elevationGain?.value
  const elevationLoss = fields.elevationLoss?.value

  return (typeof elevation === 'number' && elevation >= 9000) ||
    (typeof distanceKm === 'number' && distanceKm >= 200) ||
    (typeof durationSeconds === 'number' && durationSeconds >= 48 * 3600) ||
    (typeof elevationGain === 'number' && elevationGain >= 10000) ||
    (typeof elevationLoss === 'number' && elevationLoss >= 10000)
    ? 'warning'
    : 'normal'
}

function ScanGlyph({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M8 16V10a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M40 16V10a2 2 0 0 0-2-2h-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 32v6a2 2 0 0 0 2 2h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M40 32v6a2 2 0 0 1-2 2h-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 24h20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return <CheckIcon size={18} />
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: 12,
        height: 12,
        borderRadius: 'var(--radius-pill)',
        border: '1.5px solid currentColor',
        opacity: state === 'active' ? 0.9 : 0.45,
      }}
    />
  )
}

function SRNavBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        position: 'relative',
      }}
    >
      <button
        type="button"
        aria-label="返回"
        onClick={onBack}
        style={{
          appearance: 'none',
          width: 44,
          height: 44,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-on-surface)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <BackIcon size={22} />
      </button>
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-title-m-size)',
          lineHeight: 'var(--font-title-m-line)',
          fontWeight: 600,
        }}
      >
        {title}
      </div>
    </header>
  )
}

function BottomActions({ children }: { children: ReactNode }) {
  return (
    <footer
      style={{
        padding: 'var(--space-3) var(--space-5) calc(28px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        background: 'var(--color-surface)',
      }}
    >
      {children}
    </footer>
  )
}

function QuotaBar({
  quota,
  loading,
  onUpgrade,
}: {
  quota: ScreenshotQuotaState | null
  loading: boolean
  onUpgrade: () => void
}) {
  if (!loading && !quota) return null

  const used = quota ? quota.freeUsed + quota.paidUsed : 0
  const total = quota?.totalLimit ?? 1
  const remaining = quota?.remaining ?? 0
  const progress = quota ? Math.min(100, Math.max(0, (used / Math.max(1, total)) * 100)) : 12
  const label = loading ? '正在读取本月识别额度' : `剩余 ${remaining} / ${total} 次`
  const sub = loading ? '读取中' : quota?.subscriptionTier === 'free' ? '免费额度' : '会员额度'

  return (
    <section
      aria-label="截图识别额度"
      data-screenshot-quota-bar
      style={{
        margin: '0 var(--space-4) var(--space-2)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 'var(--space-3)',
        alignItems: 'center',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          <span
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 700,
            }}
          >
            本月截图识别
          </span>
          <span
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              whiteSpace: 'nowrap',
            }}
          >
            {sub}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            height: 6,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-surface-elevated)',
            overflow: 'hidden',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'block',
              height: '100%',
              width: `${progress}%`,
              borderRadius: 'inherit',
              background: loading ? 'var(--color-on-surface-variant)' : 'var(--color-success)',
            }}
          />
        </div>
        <div
          style={{
            marginTop: 6,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          {label}
        </div>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        style={{
          appearance: 'none',
          border: '1px solid color-mix(in srgb, var(--color-success) 32%, transparent)',
          background: 'transparent',
          color: 'var(--color-success)',
          borderRadius: 'var(--radius-pill)',
          padding: '7px 12px',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        升级
      </button>
    </section>
  )
}

function ScreenshotShell({
  step,
  title = '识别截图',
  onBack,
  children,
  footer,
  quota,
  quotaLoading,
  onUpgrade,
}: {
  step: ScreenshotStep
  title?: string
  onBack: () => void
  children: ReactNode
  footer?: ReactNode
  quota?: ScreenshotQuotaState | null
  quotaLoading?: boolean
  onUpgrade?: () => void
}) {
  return (
    <div
      data-screenshot-step={step}
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      <SRNavBar title={title} onBack={onBack} />
      <QuotaBar quota={quota ?? null} loading={quotaLoading ?? false} onUpgrade={onUpgrade ?? (() => {})} />
      {children}
      {footer ? <BottomActions>{footer}</BottomActions> : null}
    </div>
  )
}

function ErrorNotice({
  message,
  authRequired,
  onLogin,
}: {
  message: string
  authRequired: boolean
  onLogin: () => void
}) {
  return (
    <div
      role="alert"
      style={{
        width: '100%',
        maxWidth: 320,
        display: 'grid',
        gridTemplateColumns: '20px minmax(0, 1fr)',
        gap: 'var(--space-2)',
        alignItems: 'start',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
        color: 'var(--color-on-surface)',
        textAlign: 'left',
      }}
    >
      <span style={{ color: 'var(--color-error)' }}>
        <WarnIcon size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
          }}
        >
          {message}
        </div>
        {authRequired ? (
          <button
            type="button"
            onClick={onLogin}
            style={{
              marginTop: 'var(--space-2)',
              appearance: 'none',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-success)',
              padding: 0,
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            去登录
          </button>
        ) : null}
      </div>
    </div>
  )
}

function UploadScreen({
  error,
  authRequired,
  quota,
  quotaLoading,
  onBack,
  onChoose,
  onCamera,
  onHowTo,
  onLogin,
  onUpgrade,
}: {
  error: string | null
  authRequired: boolean
  quota: ScreenshotQuotaState | null
  quotaLoading: boolean
  onBack: () => void
  onChoose: () => void
  onCamera: () => void
  onHowTo: () => void
  onLogin: () => void
  onUpgrade: () => void
}) {
  return (
    <ScreenshotShell
      step="upload"
      onBack={onBack}
      quota={quota}
      quotaLoading={quotaLoading}
      onUpgrade={onUpgrade}
      footer={
        <>
          <PrimaryButton onClick={onChoose}>选择照片</PrimaryButton>
          <SecondaryButton onClick={onCamera}>拍照</SecondaryButton>
        </>
      }
    >
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-5) var(--space-6)',
          gap: 18,
          minHeight: 0,
        }}
      >
        <button
          type="button"
          onClick={onChoose}
          style={{
            appearance: 'none',
            width: 'min(280px, 100%)',
            height: 200,
            borderRadius: 'var(--radius-lg)',
            background: 'transparent',
            border: '2px dashed var(--color-outline)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            padding: '0 var(--space-5)',
            cursor: 'pointer',
            color: 'var(--color-on-surface)',
            textAlign: 'center',
          }}
        >
          <span style={{ color: 'var(--color-success)', display: 'grid', placeItems: 'center' }}>
            <ScanGlyph />
          </span>
          <span
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-m-size)',
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 600,
            }}
          >
            上传记录截图
          </span>
          <span
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 12,
              lineHeight: 1.5,
              maxWidth: 240,
            }}
          >
            支持两步路、六只脚、行者等APP的记录截图
          </span>
        </button>

        <button
          type="button"
          onClick={onHowTo}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            padding: '6px var(--space-2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--color-success)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          如何获取截图？
          <ChevronIcon />
        </button>

        {error ? <ErrorNotice message={error} authRequired={authRequired} onLogin={onLogin} /> : null}
      </main>
    </ScreenshotShell>
  )
}

function StatusRow({
  state,
  label,
}: {
  state: 'done' | 'active' | 'pending'
  label: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span
        style={{
          width: 18,
          height: 18,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          color: state === 'done' ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
        }}
      >
        <StatusIcon state={state} />
      </span>
      <span
        style={{
          color: state === 'done' ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-body-m-size)',
          lineHeight: 'var(--font-body-m-line)',
          fontWeight: state === 'done' ? 500 : 400,
        }}
      >
        {label}
      </span>
    </div>
  )
}

function ScreenshotProcessingPreview({ imagePreview }: { imagePreview: string | null }) {
  return (
    <div
      data-sr-preview="true"
      style={{
        width: 220,
        aspectRatio: '9 / 16',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-variant) 100%)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {imagePreview ? (
        <div
          role="img"
          aria-label="正在识别的截图预览"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${imagePreview})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'saturate(.86) brightness(.72)',
          }}
        />
      ) : null}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: imagePreview
            ? 'linear-gradient(180deg, rgba(10,12,14,.08) 0%, rgba(10,12,14,.34) 100%)'
            : 'transparent',
        }}
      />
      <div
        style={{
          height: 22,
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--color-on-surface-variant)',
          opacity: 0.72,
        }}
      >
        <span style={{ width: 26, height: 4, borderRadius: 'var(--radius-xs)', background: 'var(--color-outline)' }} />
        <span style={{ width: 18, height: 4, borderRadius: 'var(--radius-xs)', background: 'var(--color-outline)' }} />
      </div>

      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ height: 6, width: '70%', background: 'var(--color-outline)', borderRadius: 'var(--radius-xs)' }} />
        <div
          style={{
            height: 4,
            width: '40%',
            background: 'var(--color-outline)',
            borderRadius: 'var(--radius-xs)',
            marginTop: 5,
            opacity: 0.55,
          }}
        />
      </div>

      <div
        style={{
          margin: '0 10px',
          height: 140,
          borderRadius: 'var(--radius-xs)',
          background: 'radial-gradient(ellipse at 30% 40%, var(--color-outline) 0%, var(--color-surface-variant) 60%, var(--color-surface) 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 140"
          fill="none"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0 }}
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M20 110 Q50 80 70 90 T110 60 Q130 45 150 50 T185 25"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            opacity="0.96"
          />
          <circle cx="20" cy="110" r="3" fill="var(--color-success)" />
          <circle cx="185" cy="25" r="3" fill="var(--color-success)" />
        </svg>
      </div>

      <div style={{ padding: '12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
        {[0, 1, 2].map((item) => (
          <div key={item}>
            <div style={{ height: 10, width: '72%', background: 'var(--color-outline)', borderRadius: 'var(--radius-xs)' }} />
            <div
              style={{
                height: 4,
                width: '52%',
                background: 'var(--color-outline)',
                borderRadius: 'var(--radius-xs)',
                marginTop: 4,
                opacity: 0.45,
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[90, 75, 82, 60].map((width) => (
          <div
            key={width}
            style={{
              height: 3,
              width: `${width}%`,
              background: 'var(--color-outline)',
              borderRadius: 'var(--radius-xs)',
              opacity: 0.45,
            }}
          />
        ))}
      </div>

      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '18%',
          height: 2,
          background: 'var(--color-success)',
          boxShadow: '0 0 12px var(--color-success), 0 0 24px color-mix(in srgb, var(--color-success) 50%, transparent)',
          animation: 'sr-scan 2.4s ease-in-out infinite',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(18% - 30px)',
          height: 32,
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--color-success) 12%, transparent) 80%, transparent 100%)',
          animation: 'sr-scan-glow 2.4s ease-in-out infinite',
        }}
      />
    </div>
  )
}

function ProcessingScreen({
  imagePreview,
  quota,
  quotaLoading,
  onBack,
  onUpgrade,
}: {
  imagePreview: string | null
  quota: ScreenshotQuotaState | null
  quotaLoading: boolean
  onBack: () => void
  onUpgrade: () => void
}) {
  return (
    <ScreenshotShell step="processing" onBack={onBack} quota={quota} quotaLoading={quotaLoading} onUpgrade={onUpgrade}>
      <style>{`
        @keyframes sr-scan {
          0%, 100% { top: 18%; }
          50% { top: 78%; }
        }
        @keyframes sr-scan-glow {
          0%, 100% { top: calc(18% - 30px); }
          50% { top: calc(78% - 30px); }
        }
        @keyframes sr-pulse {
          0%, 80%, 100% { opacity: .25; transform: scale(.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'var(--space-6) var(--space-4) var(--space-6)',
          minHeight: 0,
        }}
      >
        <ScreenshotProcessingPreview imagePreview={imagePreview} />

        <div style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
          <div
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-m-size)',
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 600,
            }}
          >
            正在识别你的记录...
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 'var(--space-3)' }}>
            {[0, 1, 2].map((item) => (
              <span
                key={item}
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-success)',
                  animation: 'sr-pulse 1.4s ease-in-out infinite',
                  animationDelay: `${item * 0.18}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            width: '100%',
            maxWidth: 300,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <StatusRow state="active" label="读取截图中的数据" />
          <StatusRow state="pending" label="整理为可编辑字段" />
          <StatusRow state="pending" label="准备确认页面" />
        </div>
      </main>
    </ScreenshotShell>
  )
}

function TrailPreviewCard() {
  return (
    <div
      style={{
        height: 180,
        borderRadius: 'var(--radius-md)',
        border: '2px dashed var(--color-outline)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-on-surface-variant)',
        fontSize: 'var(--font-label-m-size)',
        lineHeight: 'var(--font-label-m-line)',
        background: 'transparent',
      }}
    >
      未能识别轨迹，可跳过
    </div>
  )
}

function DragHandle() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="none" aria-hidden="true" focusable="false">
      {[0, 1].flatMap((col) =>
        [0, 1, 2].map((row) => (
          <circle
            key={`${col}-${row}`}
            cx={3 + col * 8}
            cy={4 + row * 6}
            r="1.5"
            fill="currentColor"
            opacity="0.5"
          />
        ))
      )}
    </svg>
  )
}

function Toggle({
  on,
  onClick,
}: {
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? '隐藏字段' : '显示字段'}
      onClick={onClick}
      style={{
        width: 38,
        height: 22,
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        background: on ? 'var(--color-success)' : 'var(--color-outline)',
        position: 'relative',
        flexShrink: 0,
        padding: 0,
        cursor: 'pointer',
        transition: 'background 160ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'var(--color-on-surface)',
          boxShadow: '0 1px 3px color-mix(in srgb, var(--color-surface) 45%, transparent)',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  )
}

function FieldRow({
  config,
  value,
  missing,
  on,
  last,
  onChange,
  onToggle,
}: {
  config: FieldConfig
  value: string
  missing: boolean
  on: boolean
  last: boolean
  onChange: (value: string) => void
  onToggle: () => void
}) {
  return (
    <div
      data-field-key={config.key}
      data-field-missing={missing ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: '14px var(--space-1)',
        minHeight: 56,
        borderBottom: last ? 'none' : '1px solid var(--color-surface)',
      }}
    >
      <div style={{ paddingTop: 4, color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
        <DragHandle />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 'var(--font-body-m-line)',
              color: 'var(--color-on-surface-variant)',
              flexShrink: 0,
              minWidth: 80,
            }}
          >
            {config.label}
          </span>
          <input
            aria-label={config.label}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            disabled={!config.locked && !on}
            placeholder={
              config.key === 'duration'
                ? 'HH:MM:SS'
                : config.key === 'date'
                  ? 'YYYY-MM-DD'
                  : config.key === 'pace'
                    ? '如 7\'09"'
                    : '未识别，可手动填写'
            }
            style={{
              appearance: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              padding: 0,
              fontSize: 'var(--font-title-m-size)',
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 600,
              color: missing ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              opacity: !config.locked && !on ? 0.54 : 1,
            }}
          />
        </div>
        {missing ? (
          <div
            style={{
              marginLeft: 92,
              marginTop: 'var(--space-1)',
              color: 'var(--color-error)',
              fontSize: 12,
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 500,
            }}
          >
            未识别
          </div>
        ) : null}
      </div>
      <div
        style={{
          width: 38,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          color: 'var(--color-on-surface-variant)',
          flexShrink: 0,
        }}
      >
        {config.locked ? (
          <span
            style={{
              color: 'var(--color-success)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            必填
          </span>
        ) : (
          <Toggle on={on} onClick={onToggle} />
        )}
      </div>
    </div>
  )
}

function DurationFieldRow({
  value,
  missing,
  on,
  last,
  onChange,
  onToggle,
}: {
  value: string
  missing: boolean
  on: boolean
  last: boolean
  onChange: (value: string) => void
  onToggle: () => void
}) {
  const disabled = !on
  const inputStyle: CSSProperties = {
    appearance: 'none',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: 0,
    width: '100%',
    fontSize: 'var(--font-title-m-size)',
    lineHeight: 'var(--font-title-m-line)',
    fontWeight: 600,
    color: missing ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
    fontVariantNumeric: 'tabular-nums',
    opacity: disabled ? 0.54 : 1,
    textAlign: 'left' as const,
  }

  return (
    <div
      data-field-key="duration"
      data-field-missing={missing ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: '14px var(--space-1)',
        minHeight: 56,
        borderBottom: last ? 'none' : '1px solid var(--color-surface)',
      }}
    >
      <div style={{ paddingTop: 4, color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
        <DragHandle />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 'var(--font-body-m-line)',
              color: 'var(--color-on-surface-variant)',
              flexShrink: 0,
              minWidth: 80,
            }}
          >
            时长
          </span>
          <div
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <input
              aria-label="时长"
              inputMode="numeric"
              value={value}
              onChange={(event) => onChange(event.currentTarget.value.replace(/[^\d:hms时分秒小时分钟\s]/giu, '').slice(0, 12))}
              disabled={disabled}
              placeholder="HH:MM:SS"
              style={inputStyle}
            />
          </div>
        </div>
        {missing ? (
          <div
            style={{
              marginLeft: 92,
              marginTop: 'var(--space-1)',
              color: 'var(--color-error)',
              fontSize: 12,
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 500,
            }}
          >
            未识别
          </div>
        ) : null}
      </div>
      <div
        style={{
          width: 38,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          color: 'var(--color-on-surface-variant)',
          flexShrink: 0,
        }}
      >
        <Toggle on={on} onClick={onToggle} />
      </div>
    </div>
  )
}

function ValidationBar({ tone }: { tone: 'normal' | 'warning' }) {
  const warning = tone === 'warning'
  return (
    <div
      data-validation-tone={tone}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: warning
          ? 'color-mix(in srgb, var(--color-warning) 8%, transparent)'
          : 'color-mix(in srgb, var(--color-success) 6%, transparent)',
        border: warning
          ? '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)'
          : '1px solid color-mix(in srgb, var(--color-success) 20%, transparent)',
        color: warning ? 'var(--color-warning)' : 'var(--color-success)',
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {warning ? <WarnIcon size={16} /> : <CheckIcon size={16} />}
      </span>
      <span
        style={{
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 500,
        }}
      >
        {warning ? '部分数据偏高，请确认是否正确' : '所有数据在合理范围内'}
      </span>
    </div>
  )
}

function SubmitErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
        color: 'var(--color-on-surface)',
        fontSize: 'var(--font-label-m-size)',
        lineHeight: 'var(--font-label-m-line)',
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  )
}

function MountainMatchSection({
  options,
  selectedMountainId,
  status,
  error,
  onSelect,
  onSearch,
}: {
  options: MountainOption[]
  selectedMountainId: string | null
  status: MountainSearchStatus
  error: string | null
  onSelect: (id: string | null) => void
  onSearch: () => void
}) {
  return (
    <section
      style={{
        marginTop: 'var(--space-5)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div>
          <h3
            style={{
              margin: 0,
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-s-size)',
              lineHeight: 'var(--font-title-s-line)',
              fontWeight: 700,
            }}
          >
            山峰匹配
          </h3>
          <p
            style={{
              margin: 'var(--space-1) 0 0',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 'var(--font-label-m-line)',
            }}
          >
            可确认匹配，也可以不关联山峰继续生成活动
          </p>
        </div>
        <button
          type="button"
          onClick={onSearch}
          style={{
            appearance: 'none',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-surface)',
            color: 'var(--color-on-surface)',
            padding: '7px 11px',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          重新匹配
        </button>
      </div>

      <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {status === 'loading' ? (
          <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-m-size)' }}>正在查找附近山峰…</div>
        ) : null}
        {status === 'error' ? (
          <div style={{ color: 'var(--color-warning)', fontSize: 'var(--font-label-m-size)' }}>
            {error ?? '山峰匹配暂时不可用，可不关联继续。'}
          </div>
        ) : null}
        {status === 'empty' ? (
          <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-m-size)' }}>
            暂未匹配到山峰，可不关联继续。
          </div>
        ) : null}

        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            aria-pressed={selectedMountainId === option.id}
            style={{
              appearance: 'none',
              width: '100%',
              border: selectedMountainId === option.id
                ? '1px solid color-mix(in srgb, var(--color-success) 54%, transparent)'
                : '1px solid var(--color-outline)',
              borderRadius: 'var(--radius-md)',
              background: selectedMountainId === option.id
                ? 'color-mix(in srgb, var(--color-success) 8%, transparent)'
                : 'var(--color-surface)',
              color: 'var(--color-on-surface)',
              padding: '10px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-3)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--font-body-m-size)', lineHeight: 'var(--font-body-m-line)', fontWeight: 700 }}>
                {option.name}
              </span>
              <span style={{ display: 'block', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>
                {[option.province, typeof option.altitude === 'number' ? `${Math.round(option.altitude)}m` : null].filter(Boolean).join(' · ') || '山峰库候选'}
              </span>
            </span>
            {selectedMountainId === option.id ? <CheckIcon size={18} /> : null}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedMountainId === null}
          style={{
            appearance: 'none',
            width: '100%',
            border: selectedMountainId === null
              ? '1px solid color-mix(in srgb, var(--color-on-surface) 34%, transparent)'
              : '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            color: 'var(--color-on-surface-variant)',
            padding: '10px 12px',
            textAlign: 'left',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          不关联山峰
        </button>
      </div>
    </section>
  )
}

function ConfirmScreen({
  result,
  editableFields,
  fieldToggles,
  quota,
  quotaLoading,
  mountainOptions,
  selectedMountainId,
  mountainSearchStatus,
  mountainSearchError,
  submitError,
  onFieldChange,
  onToggle,
  onSelectMountain,
  onSearchMountain,
  onBack,
  onSubmit,
  onUpgrade,
}: {
  result: RecognizeResult
  editableFields: EditableFields
  fieldToggles: FieldToggles
  quota: ScreenshotQuotaState | null
  quotaLoading: boolean
  mountainOptions: MountainOption[]
  selectedMountainId: string | null
  mountainSearchStatus: MountainSearchStatus
  mountainSearchError: string | null
  submitError: string | null
  onFieldChange: (key: FieldKey, value: string) => void
  onToggle: (key: FieldKey) => void
  onSelectMountain: (id: string | null) => void
  onSearchMountain: () => void
  onBack: () => void
  onSubmit: () => void
  onUpgrade: () => void
}) {
  const fields = result.parsedFields
  const tone = validationTone(fields)

  return (
    <ScreenshotShell
      step="confirm"
      title="确认识别结果"
      onBack={onBack}
      quota={quota}
      quotaLoading={quotaLoading}
      onUpgrade={onUpgrade}
      footer={
        <>
          {submitError ? <SubmitErrorNotice message={submitError} /> : null}
          <PrimaryButton onClick={onSubmit}>确认并生成活动</PrimaryButton>
          <div
            style={{
              textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            确认后将生成活动记录，可随时在分享编辑器中调整
          </div>
        </>
      }
    >
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-2) var(--space-4) 0',
          minWidth: 0,
        }}
      >
        <TrailPreviewCard />

        <h2
          style={{
            margin: '22px 0 var(--space-2)',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 600,
          }}
        >
          识别结果
        </h2>

        <div>
          {FIELD_CONFIGS.map((config, index) => {
            const missing = !hasParsedField(fields, config.key)
            if (config.key === 'duration') {
              return (
                <DurationFieldRow
                  key={config.key}
                  value={editableFields.duration}
                  missing={
                    missing &&
                    !editableFields.duration.trim()
                  }
                  on={fieldToggles.duration}
                  last={index === FIELD_CONFIGS.length - 1}
                  onChange={(value) => onFieldChange('duration', value)}
                  onToggle={() => onToggle(config.key)}
                />
              )
            }
            return (
              <FieldRow
                key={config.key}
                config={config}
                value={editableFields[config.key]}
                missing={missing && editableFields[config.key].trim().length === 0}
                on={config.locked ? true : fieldToggles[config.key]}
                last={index === FIELD_CONFIGS.length - 1}
                onChange={(value) => onFieldChange(config.key, value)}
                onToggle={() => onToggle(config.key)}
              />
            )
          })}
        </div>

        <MountainMatchSection
          options={mountainOptions}
          selectedMountainId={selectedMountainId}
          status={mountainSearchStatus}
          error={mountainSearchError}
          onSelect={onSelectMountain}
          onSearch={onSearchMountain}
        />

        <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <ValidationBar tone={tone} />
        </div>
      </main>
    </ScreenshotShell>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: '3px solid color-mix(in srgb, var(--color-success) 18%, transparent)',
        borderTopColor: 'var(--color-success)',
        animation: 'sr-spin 900ms linear infinite',
      }}
    />
  )
}

function SubmittingScreen() {
  return (
    <div
      data-screenshot-step="submitting"
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-6)',
        textAlign: 'center',
      }}
    >
      <style>{`
        @keyframes sr-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
        <Spinner />
        <div
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
          }}
        >
          正在生成活动记录…
        </div>
      </div>
    </div>
  )
}

function PenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.5 8.5l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function SuccessActionCard({
  label,
  sub,
  icon,
  accent = false,
  onClick,
}: {
  label: string
  sub: string
  icon: ReactNode
  accent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: 'none',
        border: accent
          ? '1px solid color-mix(in srgb, var(--color-success) 26%, transparent)'
          : '1px solid var(--color-outline)',
        background: accent
          ? 'color-mix(in srgb, var(--color-success) 8%, var(--color-surface-variant))'
          : 'var(--color-surface-variant)',
        color: accent ? 'var(--color-success)' : 'var(--color-on-surface)',
        borderRadius: 14,
        padding: 'var(--space-3)',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          background: accent
            ? 'color-mix(in srgb, var(--color-success) 14%, transparent)'
            : 'var(--color-surface-elevated)',
          border: accent
            ? '1px solid color-mix(in srgb, var(--color-success) 24%, transparent)'
            : '1px solid var(--color-outline)',
        }}
      >
        {icon}
      </span>
      <span
        style={{
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 500,
        }}
      >
        {sub}
      </span>
    </button>
  )
}

function SuccessScreen({
  result,
  submitResult,
  onViewActivity,
}: {
  result: RecognizeResult | null
  submitResult: SubmitResult | null
  onViewActivity: () => void
}) {
  const fields = result?.parsedFields ?? {}
  return (
    <div
      data-screenshot-step="success"
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        padding: 'var(--space-10) var(--space-4) calc(var(--space-8) + env(safe-area-inset-bottom))',
        overflowX: 'hidden',
      }}
    >
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--color-success)',
            background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-success) 28%, transparent)',
          }}
        >
          <CheckIcon size={28} />
        </div>
        <h1
          style={{
            margin: 'var(--space-4) 0 0',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-headline-m-size)',
            lineHeight: 'var(--font-headline-m-line)',
            fontWeight: 700,
          }}
        >
          已带回档案
        </h1>
        <p
          style={{
            margin: 'var(--space-2) 0 0',
            maxWidth: 280,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 1.6,
          }}
        >
          {formatFieldValue(fields, 'date')} 这次山行已成为你档案里的一条记录
        </p>

        <div
          style={{
            width: '100%',
            marginTop: 'var(--space-6)',
            borderRadius: 14,
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            padding: 'var(--space-4)',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline' }}>
            <div>
              <div
                style={{
                  color: 'var(--color-on-surface)',
                  fontSize: 'var(--font-title-m-size)',
                  lineHeight: 'var(--font-title-m-line)',
                  fontWeight: 700,
                }}
              >
                截图识别活动
              </div>
              <div
                style={{
                  marginTop: 2,
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 'var(--font-label-s-size)',
                  lineHeight: 'var(--font-label-s-line)',
                }}
              >
                来源：UPLOADED
              </div>
            </div>
            <div
              style={{
                color: 'var(--color-success)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-title-l-size)',
                lineHeight: 'var(--font-title-l-line)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {formatFieldValue(fields, 'elevation')}
            </div>
          </div>
          <div
            style={{
              marginTop: 'var(--space-4)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--color-outline)',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            {[
              ['距离', formatFieldValue(fields, 'distance')],
              ['时长', formatFieldValue(fields, 'duration')],
              ['爬升', formatFieldValue(fields, 'elevationGain')],
            ].map(([label, value]) => (
              <div key={label}>
                <div
                  style={{
                    color: 'var(--color-on-surface-variant)',
                    fontSize: 'var(--font-label-s-size)',
                    lineHeight: 'var(--font-label-s-line)',
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-label-m-size)',
                    lineHeight: 'var(--font-label-m-line)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <section style={{ width: '100%', marginTop: 'var(--space-6)', textAlign: 'left' }}>
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
            接下来
          </div>
          <div
            style={{
              marginTop: 'var(--space-3)',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            <SuccessActionCard label="补照片" sub="登顶 / 路上" icon={<CameraIcon size={20} />} onClick={() => undefined} />
            <SuccessActionCard label="写一句话" sub="留下这次的感受" icon={<PenIcon size={20} />} onClick={() => undefined} />
            <SuccessActionCard
              label="生成分享"
              sub="海拔卡 / 朋友圈"
              icon={<ShareIcon size={20} />}
              accent
              onClick={() => undefined}
            />
            <SuccessActionCard
              label="查看活动"
              sub={submitResult?.checkinId ? '进入完整记录' : '活动页待生成'}
              icon={<EyeIcon size={20} />}
              onClick={onViewActivity}
            />
          </div>
        </section>
      </main>
    </div>
  )
}

function UpgradeSheet({ open, onClose, onEngage }: { open: boolean; onClose: () => void; onEngage: () => void }) {
  if (!open) return null

  return (
    <ModalShell
      title="本月识别次数已用完"
      description="升级后可继续识别更多截图。"
      mode="sheet"
      closeControl="icon"
      onClose={onClose}
      footer={
        <PrimaryButton
          onClick={() => {
            onEngage()
            window.alert('付费方案即将上线。')
          }}
        >
          了解付费方案
        </PrimaryButton>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-body-m-size)',
          lineHeight: 'var(--font-body-m-line)',
        }}
      >
        <p style={{ margin: 0 }}>免费用户首月可识别 5 次，之后每月 2 次。</p>
        <p style={{ margin: 0 }}>付费方案会提供每月 30 次截图识别额度，支付入口将在后续版本开放。</p>
      </div>
    </ModalShell>
  )
}

export default function ScreenshotClient() {
  const router = useRouter()
  const albumInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const recognizeContentHashRef = useRef<string | null>(null)
  const recognizedFieldsRef = useRef<string[]>([])
  const editedFieldsRef = useRef<Set<string>>(new Set())

  const [step, setStep] = useState<ScreenshotStep>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [recognizeResult, setRecognizeResult] = useState<RecognizeResult | null>(null)
  const [recognizeError, setRecognizeError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [fieldToggles, setFieldToggles] = useState<FieldToggles>(EMPTY_FIELD_TOGGLES)
  const [editableFields, setEditableFields] = useState<EditableFields>(EMPTY_EDITABLE_FIELDS)
  const [mountainOptions, setMountainOptions] = useState<MountainOption[]>([])
  const [selectedMountainId, setSelectedMountainId] = useState<string | null>(null)
  const [mountainSearchStatus, setMountainSearchStatus] = useState<MountainSearchStatus>('idle')
  const [mountainSearchError, setMountainSearchError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [quotaState, setQuotaState] = useState<ScreenshotQuotaState | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)
  const [upgradeSheetOpen, setUpgradeSheetOpen] = useState(false)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadQuota() {
      setQuotaLoading(true)
      try {
        const response = await fetch('/api/screenshot/recognize', { method: 'GET' })
        const payload = (await response.json().catch(() => ({}))) as RecognizeResponse
        if (!cancelled && response.ok && payload.quota) {
          setQuotaState(payload.quota)
        }
      } finally {
        if (!cancelled) setQuotaLoading(false)
      }
    }

    void loadQuota()
    return () => {
      cancelled = true
    }
  }, [])

  async function searchMountains(query: string) {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMountainOptions([])
      setSelectedMountainId(null)
      setMountainSearchStatus('empty')
      setMountainSearchError(null)
      return
    }

    setMountainSearchStatus('loading')
    setMountainSearchError(null)
    try {
      const response = await fetch(`/api/mountains/search?q=${encodeURIComponent(trimmed)}`)
      const payload = (await response.json().catch(() => ({}))) as { mountains?: MountainOption[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? '山峰匹配暂时不可用')
      const options = Array.isArray(payload.mountains) ? payload.mountains.slice(0, 5) : []
      setMountainOptions(options)
      setSelectedMountainId(options[0]?.id ?? null)
      setMountainSearchStatus(options.length > 0 ? 'ready' : 'empty')
    } catch (error) {
      setMountainOptions([])
      setSelectedMountainId(null)
      setMountainSearchStatus('error')
      setMountainSearchError(error instanceof Error ? error.message : '山峰匹配暂时不可用')
    }
  }

  async function recognize(file: File) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const contentHash = await buildContentHash(file)
    recognizeContentHashRef.current = contentHash
    recognizedFieldsRef.current = []
    editedFieldsRef.current = new Set()
    const startedAt = performance.now()
    trackEvent({
      event_type: 'business',
      event_name: 'business.screenshot_recognize_start',
      properties: {
        provider: 'mimo_v25_primary',
        content_hash: contentHash,
      },
    })

    try {
      const formData = new FormData()
      formData.append('image', file)

      const [response] = await Promise.all([
        fetch('/api/screenshot/recognize', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        }),
        wait(PROCESSING_MIN_DURATION_MS),
      ])

      const payload = (await response.json().catch(() => ({}))) as RecognizeResponse
      if (payload.quota) {
        setQuotaState(payload.quota)
      }
      if (!response.ok) {
        const kind = responseKind(response.status)
        if (kind === 'quota') {
          setUpgradeSheetOpen(true)
        }
        throw Object.assign(new Error(readableError(payload.error ?? '', kind)), { kind })
      }

      if (!payload.ok || !payload.ocrResult || !payload.parsedFields) {
        throw Object.assign(new Error('这张截图暂时无法识别，请换一张再试。'), { kind: 'file' as RecognizeErrorKind })
      }

      const fieldsRecognized = recognizedFieldKeys(payload.parsedFields)
      recognizedFieldsRef.current = fieldsRecognized
      trackEvent({
        event_type: 'business',
        event_name: 'business.screenshot_recognize_complete',
        properties: {
          provider: providerFromSource(payload.ocrSource),
          duration_ms: Math.round(performance.now() - startedAt),
          input_tokens: null,
          output_tokens: null,
          cost_cny: 0,
          fields_recognized: fieldsRecognized,
          success: true,
          content_hash: contentHash,
        },
      })
      setRecognizeResult({
        ok: true,
        ocrResult: payload.ocrResult,
        parsedFields: payload.parsedFields,
        ocrSource: payload.ocrSource,
      })
      const nextEditableFields = buildEditableFields(payload.parsedFields)
      setEditableFields(nextEditableFields)
      setFieldToggles(buildInitialFieldToggles(payload.parsedFields))
      void searchMountains(nextEditableFields.location)
      setSubmitError(null)
      setSubmitResult(null)
      setStep('confirm')
    } catch (error) {
      if (controller.signal.aborted) return
      const kind = (error instanceof Error && 'kind' in error ? error.kind : 'network') as RecognizeErrorKind
      const message = error instanceof Error ? error.message : '这张截图暂时无法识别，请换一张再试。'
      trackEvent({
        event_type: 'business',
        event_name: 'business.screenshot_recognize_error',
        properties: {
          provider: 'mimo_v25_primary',
          error_type: kind,
          duration_ms: Math.round(performance.now() - startedAt),
          content_hash: contentHash,
        },
      })
      setRecognizeError(readableError(message, kind))
      setAuthRequired(kind === 'auth')
      setStep('upload')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }

  function resetPreview() {
    if (recognizeResult && !submitResult && recognizeContentHashRef.current) {
      trackEvent({
        event_type: 'business',
        event_name: 'business.screenshot_recognize_abandon',
        properties: {
          last_provider: providerFromSource(recognizeResult.ocrSource),
          fields_recognized: recognizedFieldsRef.current,
          content_hash: recognizeContentHashRef.current,
        },
      })
    }
    abortRef.current?.abort()
    abortRef.current = null
    setImageFile(null)
    setImagePreview(null)
    setRecognizeResult(null)
    setFieldToggles(EMPTY_FIELD_TOGGLES)
    setEditableFields(EMPTY_EDITABLE_FIELDS)
    setMountainOptions([])
    setSelectedMountainId(null)
    setMountainSearchStatus('idle')
    setMountainSearchError(null)
    setSubmitError(null)
    setSubmitResult(null)
  }

  function resetToUpload() {
    resetPreview()
    setRecognizeError(null)
    setAuthRequired(false)
    setStep('upload')
  }

  async function handleFile(file: File | null) {
    if (!file) return
    if (!canUseScreenshotQuota()) return
    const validation = validateImageFile(file)
    if (validation) {
      resetPreview()
      setRecognizeError(validation.message)
      setAuthRequired(validation.kind === 'auth')
      setStep('upload')
      return
    }

    let nextPreview: string
    try {
      nextPreview = await readImagePreview(file)
    } catch (error) {
      resetPreview()
      setRecognizeError(error instanceof Error ? error.message : '这张截图暂时无法预览，请换一张再试。')
      setAuthRequired(false)
      setStep('upload')
      return
    }

    setImageFile(file)
    setImagePreview(nextPreview)
    setRecognizeResult(null)
    setRecognizeError(null)
    setAuthRequired(false)
    setFieldToggles(EMPTY_FIELD_TOGGLES)
    setEditableFields(EMPTY_EDITABLE_FIELDS)
    setMountainOptions([])
    setSelectedMountainId(null)
    setMountainSearchStatus('idle')
    setMountainSearchError(null)
    setSubmitError(null)
    setSubmitResult(null)
    setStep('processing')
    void recognize(file)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    void handleFile(file)
  }

  function handleBack() {
    if (step === 'upload') {
      router.back()
      return
    }

    if (step === 'submitting') {
      return
    }

    resetToUpload()
  }

  function openLogin() {
    router.push(buildLoginHref())
  }

  function openUpgradeSheet() {
    setUpgradeSheetOpen(true)
  }

  function trackScreenshotQuotaGate(currentState: 'gate_shown' | 'gate_dismissed' | 'gate_engaged') {
    trackEvent({
      event_type: 'paid_attempt',
      event_name: 'paid_attempt.screenshot_quota_exceeded',
      properties: {
        feature_id: 'screenshot_recognition',
        current_state: currentState,
      },
    })
  }

  function closeUpgradeSheetAsDismissed() {
    if (upgradeSheetOpen) trackScreenshotQuotaGate('gate_dismissed')
    setUpgradeSheetOpen(false)
  }

  function engageUpgradeSheet() {
    trackScreenshotQuotaGate('gate_engaged')
    setUpgradeSheetOpen(false)
  }

  function canUseScreenshotQuota() {
    if (quotaState && quotaState.remaining <= 0) {
      setRecognizeError('本月截图识别次数已用完。')
      setAuthRequired(false)
      trackScreenshotQuotaGate('gate_shown')
      openUpgradeSheet()
      return false
    }

    return true
  }

  function toggleField(key: FieldKey) {
    const config = FIELD_CONFIGS.find((field) => field.key === key)
    if (config?.locked) return
    setFieldToggles((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function updateField(key: FieldKey, value: string) {
    if (recognizeContentHashRef.current && recognizedFieldsRef.current.includes(key) && !editedFieldsRef.current.has(key)) {
      editedFieldsRef.current.add(key)
      trackEvent({
        event_type: 'business',
        event_name: 'business.screenshot_recognize_user_edit',
        properties: {
          field_edited: key,
          content_hash: recognizeContentHashRef.current,
        },
      })
    }
    setEditableFields((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function searchCurrentLocation() {
    void searchMountains(editableFields.location)
  }

  async function handleSubmit() {
    if (!recognizeResult) return
    if (missingLockedEditableFields(editableFields)) {
      setSubmitError('请先补全总距离。')
      return
    }

    setSubmitError(null)
    setStep('submitting')
    try {
      const response = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'screenshot_recognition',
          mountainId: selectedMountainId,
          parsedData: buildScreenshotParsedData(editableFields, fieldToggles, imageFile?.name),
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; checkinId?: string; error?: string }
      if (!response.ok || !payload.ok || !payload.checkinId) {
        throw new Error(payload.error ?? '活动生成失败，请稍后再试。')
      }
      trackEvent({
        event_type: 'business',
        event_name: 'business.activity_create',
        properties: {
          source: 'screenshot_recognition',
          proof_status: 'uploaded',
          mountain_id: selectedMountainId,
          checkin_id: payload.checkinId,
        },
      })
      setSubmitResult({ ok: true, checkinId: payload.checkinId })
      router.push(`/activity/${payload.checkinId}`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '活动生成失败，请稍后再试。')
      setStep('confirm')
    }
  }

  function handleViewActivity() {
    if (submitResult?.checkinId) {
      router.push(`/activity/${submitResult.checkinId}`)
    }
  }

  return (
    <>
      <input
        ref={albumInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {step === 'upload' ? (
        <UploadScreen
          error={recognizeError}
          authRequired={authRequired}
          quota={quotaState}
          quotaLoading={quotaLoading}
          onBack={handleBack}
          onChoose={() => {
            if (canUseScreenshotQuota()) albumInputRef.current?.click()
          }}
          onCamera={() => {
            if (canUseScreenshotQuota()) cameraInputRef.current?.click()
          }}
          onHowTo={() => console.log('Screenshot how-to will be added later')}
          onLogin={openLogin}
          onUpgrade={openUpgradeSheet}
        />
      ) : null}

      {step === 'processing' ? (
        <ProcessingScreen
          imagePreview={imagePreview}
          quota={quotaState}
          quotaLoading={quotaLoading}
          onBack={handleBack}
          onUpgrade={openUpgradeSheet}
        />
      ) : null}

      {step === 'confirm' && recognizeResult ? (
        <ConfirmScreen
          result={recognizeResult}
          editableFields={editableFields}
          fieldToggles={fieldToggles}
          quota={quotaState}
          quotaLoading={quotaLoading}
          mountainOptions={mountainOptions}
          selectedMountainId={selectedMountainId}
          mountainSearchStatus={mountainSearchStatus}
          mountainSearchError={mountainSearchError}
          submitError={submitError}
          onFieldChange={updateField}
          onToggle={toggleField}
          onSelectMountain={setSelectedMountainId}
          onSearchMountain={searchCurrentLocation}
          onBack={handleBack}
          onSubmit={handleSubmit}
          onUpgrade={openUpgradeSheet}
        />
      ) : null}

      {step === 'submitting' ? <SubmittingScreen /> : null}

      {step === 'success' ? (
        <SuccessScreen result={recognizeResult} submitResult={submitResult} onViewActivity={handleViewActivity} />
      ) : null}

      <UpgradeSheet open={upgradeSheetOpen} onClose={closeUpgradeSheetAsDismissed} onEngage={engageUpgradeSheet} />

      <span
        data-screenshot-file={imageFile?.name ?? ''}
        data-screenshot-preview-ready={imagePreview ? 'true' : 'false'}
        data-screenshot-ocr-source={recognizeResult?.ocrSource ?? ''}
        hidden
      />
    </>
  )
}
