'use client'

import type { ChangeEvent, CSSProperties, FocusEvent, PointerEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { OcrResult, ParsedScreenshotFields, ScreenshotOcrSource, ScreenshotQuotaState } from '@/lib/screenshot/types'
import ArchiveCreationSuccess from '@/components/activity/ArchiveCreationSuccess'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import ModalShell from '@/components/ui/ModalShell'
import Spinner from '@/components/ui/Spinner'
import { BackIcon, CheckIcon, WarnIcon } from '@/components/ui/Icons'
import { trackEvent } from '@/lib/analytics/client'
import ScreenshotRouteCalibrationSection from './ScreenshotRouteCalibrationSection'
import { createEmptyScreenshotRouteCalibration, type ScreenshotRouteCalibration } from '@/lib/screenshot-track/calibration'
import {
  readableError,
  responseKind,
  type RecognizeErrorKind,
} from '@/lib/screenshot/recognize-client-errors'
import {
  formatScreenshotPace,
  validateScreenshotEditableFields,
  type ScreenshotEditableFields,
  type ScreenshotFieldKey,
  type ScreenshotFieldToggles,
} from '@/lib/screenshot-field-validation'
import {
  buildPersistableScreenshotRouteShape,
  measureScreenshotRouteShape,
  type PersistedScreenshotRouteShape,
  validateScreenshotRouteShape,
} from '@/lib/screenshot-route-shape'
import { buildImprintSourceUrl, buildShareUrlForCheckin } from '@/lib/share-template-intent'
import type { ShareRenderTemplate } from '@/lib/share-templates/types'
import { useHelpSheet } from '@/components/help/useHelpSheet'
import { SCREENSHOT_RECOGNITION_SOURCE } from '@/lib/trek-utils'
import {
  recoverScreenshotRecognition,
  readScreenshotRecognitionResponse,
  type ScreenshotRecognitionRecoveryResponse,
} from '@/lib/screenshot/recognition-recovery'

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
const PROCESSING_MIN_DURATION_MS = 2000
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
gsap.registerPlugin(useGSAP)

type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

type ScreenshotStep = 'upload' | 'processing' | 'confirm' | 'submitting' | 'success'
type FieldKey = ScreenshotFieldKey

type RecognizeResult = {
  ok: true
  requestId: string
  ocrResult: OcrResult
  parsedFields: ParsedScreenshotFields
  ocrSource?: ScreenshotOcrSource
}

type RecognizeResponse = {
  ok?: boolean
  requestId?: string
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
  routeShape?: PersistedScreenshotRouteShape | null
}

type ConfirmResponse = {
  ok?: boolean
  checkinId?: string
  quota?: ScreenshotQuotaState
  error?: string
  code?: string
}

function readPayloadError(payload: unknown) {
  return typeof (payload as { error?: unknown } | null)?.error === 'string'
    ? String((payload as { error: string }).error)
    : ''
}

function screenshotDisplayError(scope: string, payload: unknown, fallback: string) {
  const rawMessage = readPayloadError(payload)
  if (rawMessage) console.warn(`[screenshot] ${scope}`, rawMessage)
  return fallback
}

type FieldToggles = ScreenshotFieldToggles
type EditableFields = ScreenshotEditableFields
type FieldErrors = Partial<Record<FieldKey, string>>

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
  { key: 'elevation', label: '海拔 m', locked: false },
  { key: 'distance', label: '总距离 km', locked: true },
  { key: 'duration', label: '时长', locked: false },
  { key: 'elevationGain', label: '爬升 m', locked: false },
  { key: 'elevationLoss', label: '下降 m', locked: false },
  { key: 'date', label: '日期', locked: false },
  { key: 'location', label: '地点', locked: false },
  { key: 'speed', label: '速度 km/h', locked: false },
  { key: 'pace', label: '配速 /km', locked: false },
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

function providerFromSource(source?: ScreenshotOcrSource) {
  return source ?? SCREENSHOT_RECOGNITION_SOURCE
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

function parseMotionTokenSeconds(root: HTMLElement, tokenName: string, fallbackMs: number) {
  const raw = window.getComputedStyle(root).getPropertyValue(tokenName).trim()
  if (!raw) return fallbackMs / 1000
  if (raw.endsWith('ms')) {
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value / 1000 : fallbackMs / 1000
  }
  if (raw.endsWith('s')) {
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : fallbackMs / 1000
  }
  return fallbackMs / 1000
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

function formatPaceForInput(value: number) {
  return formatScreenshotPace(value)
}

function routeSolveLooksPending(calibration: ScreenshotRouteCalibration) {
  return (
    calibration.controlPoints.length >= 2 &&
    (!calibration.imageSize || calibration.segments.length < calibration.controlPoints.length - 1)
  )
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
      <path data-scan-draw="corner" d="M8 16V10a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path data-scan-draw="corner" d="M40 16V10a2 2 0 0 0-2-2h-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path data-scan-draw="corner" d="M8 32v6a2 2 0 0 0 2 2h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path data-scan-draw="corner" d="M40 32v6a2 2 0 0 1-2 2h-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path data-scan-draw="scan-line" d="M14 24h20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
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
      data-screenshot-upload-motion="nav"
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
        className="pt-pressable"
        onClick={onBack}
        onPointerDown={markPressFallback}
        onPointerUp={clearPressFallback}
        onPointerCancel={clearPressFallback}
        onPointerLeave={clearPressFallback}
        onBlur={clearPressFallback}
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
  const progressRatio = loading ? 0 : progress / 100
  const label = loading ? '正在读取本月识别额度' : `剩余 ${remaining} / ${total} 次`
  const sub = loading ? '读取中' : quota?.subscriptionTier === 'free' ? '免费额度' : '本月额度'
  const showQuotaCta = Boolean(!loading && quota && remaining <= 0)

  return (
    <section
      aria-label="截图识别额度"
      data-screenshot-quota-bar
      data-screenshot-upload-motion="quota-card"
      style={{
        margin: '0 var(--space-4) var(--space-2)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
        display: 'grid',
        gridTemplateColumns: showQuotaCta ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
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
            data-screenshot-upload-motion="quota-fill"
            data-quota-ratio={progressRatio.toFixed(4)}
            style={{
              display: 'block',
              height: '100%',
              width: '100%',
              borderRadius: 'inherit',
              background: loading ? 'var(--color-on-surface-variant)' : 'var(--color-success)',
              transform: `scaleX(${progressRatio})`,
              transformOrigin: 'left center',
            }}
          />
        </div>
        <div
          data-screenshot-upload-motion="quota-label"
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
      {showQuotaCta ? (
        <button
          type="button"
          className="pt-pressable"
          onClick={onUpgrade}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
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
          想要更多额度
        </button>
      ) : null}
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
  const isUploadStep = step === 'upload'
  return (
    <div
      className={isUploadStep ? undefined : 'pt-screenshot-step-enter'}
      data-screenshot-step={step}
      data-screenshot-motion="step-panel"
      style={{
        height: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <style>
        {`
          .pt-screenshot-step-enter {
            animation: pt-screenshot-step-enter var(--motion-enter) var(--ease-out) both;
          }
          @keyframes pt-screenshot-step-enter {
            from {
              opacity: 0;
              transform: translateY(12px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .pt-screenshot-step-enter {
              animation: none !important;
              opacity: 1 !important;
              transform: none !important;
            }
          }
        `}
      </style>
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
            className="pt-pressable"
            onClick={onLogin}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
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
          <PrimaryButton className="pt-pressable-hero" data-screenshot-upload-motion="footer-primary" onClick={onChoose}>选择照片</PrimaryButton>
	          <SecondaryButton data-screenshot-upload-motion="footer-secondary" onClick={onCamera}>拍照</SecondaryButton>
	        </>
	      }
    >
	      <main
	        data-screenshot-upload-motion="upload-main"
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
            data-screenshot-upload-motion="upload-card"
            type="button"
            className="pt-pressable-hero"
            onClick={onChoose}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
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
	          <span data-screenshot-upload-motion="scan-icon" style={{ color: 'var(--color-success)', display: 'grid', placeItems: 'center' }}>
	            <ScanGlyph />
	          </span>
	          <span
	            data-screenshot-upload-motion="upload-title"
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
	            data-screenshot-upload-motion="upload-copy"
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
            data-screenshot-upload-motion="howto"
            type="button"
            className="pt-pressable"
            onClick={onHowTo}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
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
        data-sr-motion="scan-line"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '18%',
          height: 2,
          background: 'var(--color-success)',
          boxShadow: '0 0 12px var(--color-success), 0 0 24px color-mix(in srgb, var(--color-success) 50%, transparent)',
          willChange: 'transform',
          animation: 'sr-scan 2.4s ease-in-out infinite',
        }}
      />
      <span
        aria-hidden="true"
        data-sr-motion="scan-glow"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(18% - 30px)',
          height: 32,
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--color-success) 12%, transparent) 80%, transparent 100%)',
          willChange: 'transform',
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
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(220px * 16 / 9 * 0.6)); }
        }
        @keyframes sr-scan-glow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(220px * 16 / 9 * 0.6)); }
        }
        @keyframes sr-pulse {
          0%, 80%, 100% { opacity: .25; transform: scale(.85); }
          40% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-sr-motion],
          [data-sr-processing-dot] {
            animation: none !important;
            transform: none !important;
          }
          [data-sr-processing-dot] {
            opacity: 1 !important;
          }
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
                data-sr-processing-dot
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
      className="pt-pressable"
      aria-pressed={on}
      aria-label={on ? '隐藏字段' : '显示字段'}
      onClick={onClick}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
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
        transition: 'background var(--motion-fast) var(--ease-standard)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'var(--color-on-surface)',
          boxShadow: '0 1px 3px color-mix(in srgb, var(--color-surface) 45%, transparent)',
          transform: on ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform var(--motion-fast) var(--ease-standard)',
        }}
      />
    </button>
  )
}

function FieldRow({
  config,
  value,
  missing,
  fieldError,
  on,
  last,
  motionIndex,
  onChange,
  onToggle,
}: {
  config: FieldConfig
  value: string
  missing: boolean
  fieldError?: string
  on: boolean
  last: boolean
  motionIndex?: number
  onChange: (value: string) => void
  onToggle: () => void
}) {
  return (
    <div
      data-field-key={config.key}
      data-field-missing={missing ? 'true' : 'false'}
      data-screenshot-recognition-item={typeof motionIndex === 'number' ? 'field' : undefined}
      style={{
        ...(typeof motionIndex === 'number' ? { '--motion-index': motionIndex } : null),
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: '14px var(--space-1)',
        minHeight: 56,
        borderBottom: last ? 'none' : '1px solid var(--color-surface)',
      } as CSSProperties}
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
        {fieldError ? (
          <div
            data-field-error={config.key}
            style={{
              marginLeft: 92,
              marginTop: 'var(--space-1)',
              color: config.locked ? 'var(--color-error)' : 'var(--color-warning)',
              fontSize: 12,
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 500,
            }}
          >
            {fieldError}
          </div>
        ) : missing ? (
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
  fieldError,
  on,
  last,
  motionIndex,
  onChange,
  onToggle,
}: {
  value: string
  missing: boolean
  fieldError?: string
  on: boolean
  last: boolean
  motionIndex?: number
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
      data-screenshot-recognition-item={typeof motionIndex === 'number' ? 'field' : undefined}
      style={{
        ...(typeof motionIndex === 'number' ? { '--motion-index': motionIndex } : null),
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: '14px var(--space-1)',
        minHeight: 56,
        borderBottom: last ? 'none' : '1px solid var(--color-surface)',
      } as CSSProperties}
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
              onChange={(event) => onChange(event.currentTarget.value.replace(/[^\d:]/gu, '').slice(0, 10))}
              disabled={disabled}
              placeholder="HH:MM:SS 或 MM:SS"
              style={inputStyle}
            />
          </div>
        </div>
        {fieldError ? (
          <div
            data-field-error="duration"
            style={{
              marginLeft: 92,
              marginTop: 'var(--space-1)',
              color: 'var(--color-warning)',
              fontSize: 12,
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 500,
            }}
          >
            {fieldError}
          </div>
        ) : missing ? (
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

function SubmitErrorNotice({ message, actions }: { message: string; actions?: ReactNode }) {
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
      <div>{message}</div>
      {actions ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          {actions}
        </div>
      ) : null}
    </div>
  )
}

function MountainMatchSection({
  options,
  selectedMountainId,
  status,
  error,
  motionIndex,
  onSelect,
  onSearch,
}: {
  options: MountainOption[]
  selectedMountainId: string | null
  status: MountainSearchStatus
  error: string | null
  motionIndex?: number
  onSelect: (id: string | null) => void
  onSearch: () => void
}) {
  return (
    <section
      data-screenshot-recognition-item={typeof motionIndex === 'number' ? 'match' : undefined}
      style={{
        ...(typeof motionIndex === 'number' ? { '--motion-index': motionIndex } : null),
        marginTop: 'var(--space-5)',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
      } as CSSProperties}
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
          className="pt-pressable"
          onClick={onSearch}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
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
            className="pt-pressable-card"
            onClick={() => onSelect(option.id)}
            aria-pressed={selectedMountainId === option.id}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
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
          className="pt-pressable-card"
          onClick={() => onSelect(null)}
          aria-pressed={selectedMountainId === null}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
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
  imagePreview,
  editableFields,
  fieldToggles,
  routeCalibration,
  quota,
  quotaLoading,
  mountainOptions,
  selectedMountainId,
  mountainSearchStatus,
  mountainSearchError,
  submitError,
  routeShapeRecoveryOpen,
  onFieldChange,
  onToggle,
  onRouteCalibrationChange,
  onClearRouteCalibration,
  onSaveTextOnly,
  onSelectMountain,
  onSearchMountain,
  onBack,
  onSubmit,
  onUpgrade,
  initialMountainContext,
}: {
  result: RecognizeResult
  imagePreview: string | null
  editableFields: EditableFields
  fieldToggles: FieldToggles
  routeCalibration: ScreenshotRouteCalibration
  quota: ScreenshotQuotaState | null
  quotaLoading: boolean
  mountainOptions: MountainOption[]
  selectedMountainId: string | null
  mountainSearchStatus: MountainSearchStatus
  mountainSearchError: string | null
  submitError: string | null
  routeShapeRecoveryOpen: boolean
  onFieldChange: (key: FieldKey, value: string) => void
  onToggle: (key: FieldKey) => void
  onRouteCalibrationChange: (calibration: ScreenshotRouteCalibration) => void
  onClearRouteCalibration: () => void
  onSaveTextOnly: () => void
  onSelectMountain: (id: string | null) => void
  onSearchMountain: () => void
  onBack: () => void
  onSubmit: () => void
  onUpgrade: () => void
  initialMountainContext: { id: string; name: string } | null
}) {
  const fields = result.parsedFields
  const tone = validationTone(fields)
  const fieldErrors: FieldErrors = validateScreenshotEditableFields({
    fields: editableFields,
    toggles: fieldToggles,
  }).errors
  const visibleFieldConfigs = FIELD_CONFIGS.filter((config) => (
    config.locked ||
    hasParsedField(fields, config.key) ||
    fieldToggles[config.key] ||
    Boolean(editableFields[config.key].trim())
  ))

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
          {submitError ? (
            <SubmitErrorNotice
              message={submitError}
              actions={routeShapeRecoveryOpen ? (
                <>
                  <SecondaryButton onClick={onClearRouteCalibration}>清空路线</SecondaryButton>
                  <PrimaryButton className="pt-pressable-hero" onClick={onSaveTextOnly}>仅保存文字数据</PrimaryButton>
                </>
              ) : undefined}
            />
          ) : null}
          <PrimaryButton className="pt-screenshot-recognition-cta pt-pressable-hero" onClick={onSubmit}>确认并生成活动</PrimaryButton>
          <div
            style={{
              textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            不描绘也可以生成活动，但这条记录不会包含轨迹。
          </div>
        </>
      }
    >
      <main
        data-screenshot-confirm-main="true"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 'var(--space-2) var(--space-4) calc(20px + env(safe-area-inset-bottom))',
          minWidth: 0,
        }}
      >
        <ScreenshotRouteCalibrationSection
          imagePreview={imagePreview}
          calibration={routeCalibration}
          onCalibrationChange={onRouteCalibrationChange}
        />

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
          {visibleFieldConfigs.map((config, index) => {
            const missing = !hasParsedField(fields, config.key)
            if (config.key === 'duration') {
              return (
                <DurationFieldRow
                  key={config.key}
                  value={editableFields.duration}
                  fieldError={fieldErrors.duration}
                  missing={
                    missing &&
                    !editableFields.duration.trim()
                  }
                  on={fieldToggles.duration}
                  last={index === visibleFieldConfigs.length - 1}
                  motionIndex={index}
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
                fieldError={fieldErrors[config.key]}
                missing={missing && editableFields[config.key].trim().length === 0}
                on={config.locked ? true : fieldToggles[config.key]}
                  last={index === visibleFieldConfigs.length - 1}
                motionIndex={index}
                onChange={(value) => onFieldChange(config.key, value)}
                onToggle={() => onToggle(config.key)}
              />
            )
          })}
        </div>

        {initialMountainContext ? (
          <div
            data-testid="screenshot-detail-mountain-context"
            data-screenshot-recognition-item="match"
            style={{
              marginTop: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
              border: '1px solid color-mix(in srgb, var(--color-success) 28%, transparent)',
              background: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
            }}
          >
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>本次记录将关联到</div>
            <div style={{ marginTop: 3, color: 'var(--color-on-surface)', fontSize: 'var(--font-body-m-size)', lineHeight: 'var(--font-body-m-line)', fontWeight: 700 }}>{initialMountainContext.name}</div>
          </div>
        ) : (
          <MountainMatchSection
            options={mountainOptions}
            selectedMountainId={selectedMountainId}
            status={mountainSearchStatus}
            error={mountainSearchError}
            motionIndex={visibleFieldConfigs.length}
            onSelect={onSelectMountain}
            onSearch={onSearchMountain}
          />
        )}

        <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <ValidationBar tone={tone} />
        </div>
      </main>
    </ScreenshotShell>
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
        <Spinner size={34} />
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

function UpgradeSheet({
  open,
  feedbackVisible,
  onClose,
  onEngage,
}: {
  open: boolean
  feedbackVisible: boolean
  onClose: () => void
  onEngage: () => void
}) {
  if (!open) return null

  return (
    <ModalShell
      title="本月识别次数已用完"
      description="免费识别额度有限，后续我们会逐步开放更多。"
      mode="sheet"
      closeControl="icon"
      onClose={onClose}
      footer={
        <PrimaryButton className="pt-pressable-hero" onClick={onEngage} disabled={feedbackVisible}>
          我想要更多额度
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
        {feedbackVisible ? (
          <p
            role="status"
            data-screenshot-quota-feedback
            style={{
              margin: 0,
              color: 'var(--color-success)',
              fontWeight: 700,
            }}
          >
            已记录，我们会根据使用需求逐步开放更多额度。
          </p>
        ) : null}
      </div>
    </ModalShell>
  )
}

export default function ScreenshotClient({
  initialTemplate = null,
  returnToImprint = false,
  initialMountainContext = null,
}: {
  initialTemplate?: ShareRenderTemplate | null
  returnToImprint?: boolean
  initialMountainContext?: { id: string; name: string } | null
}) {
  const router = useRouter()
  const { open: openHelpSheet } = useHelpSheet()
  const motionScopeRef = useRef<HTMLDivElement | null>(null)
  const albumInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const screenshotMotionTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const upgradeEngageCloseTimerRef = useRef<number | null>(null)
  const recognizeContentHashRef = useRef<string | null>(null)
  const recognitionRequestIdRef = useRef<string | null>(null)
  const recognizedFieldsRef = useRef<string[]>([])
  const editedFieldsRef = useRef<Set<string>>(new Set())

  const [step, setStepState] = useState<ScreenshotStep>('upload')
  const screenshotStepRef = useRef<ScreenshotStep>('upload')
  function setStep(nextStep: ScreenshotStep) {
    screenshotStepRef.current = nextStep
    setStepState(nextStep)
  }
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [recognizeResult, setRecognizeResult] = useState<RecognizeResult | null>(null)
  const [recognizeError, setRecognizeError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [fieldToggles, setFieldToggles] = useState<FieldToggles>(EMPTY_FIELD_TOGGLES)
  const [editableFields, setEditableFields] = useState<EditableFields>(EMPTY_EDITABLE_FIELDS)
  const [routeCalibration, setRouteCalibration] = useState<ScreenshotRouteCalibration>(() => createEmptyScreenshotRouteCalibration())
  const isMountainContextLocked = Boolean(initialMountainContext)
  const [mountainOptions, setMountainOptions] = useState<MountainOption[]>([])
  const [selectedMountainId, setSelectedMountainId] = useState<string | null>(() => initialMountainContext?.id ?? null)
  const [mountainSearchStatus, setMountainSearchStatus] = useState<MountainSearchStatus>('idle')
  const [mountainSearchError, setMountainSearchError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [routeShapeRecoveryOpen, setRouteShapeRecoveryOpen] = useState(false)
  const [quotaState, setQuotaState] = useState<ScreenshotQuotaState | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)
  const [upgradeSheetOpen, setUpgradeSheetOpen] = useState(false)
  const [upgradeFeedbackVisible, setUpgradeFeedbackVisible] = useState(false)

  useGSAP((_context, contextSafe) => {
    const root = motionScopeRef.current
    if (!root) return

	    const prepareScanDrawPaths = () => {
	      const scanPaths = gsap.utils.toArray<SVGPathElement>(root.querySelectorAll('[data-scan-draw]'))
	      const drawablePaths: SVGPathElement[] = []
	      for (const path of scanPaths) {
	        try {
	          const length = path.getTotalLength()
	          if (Number.isFinite(length) && length > 0) {
	            path.style.strokeDasharray = String(length)
	            path.style.strokeDashoffset = String(length)
	            drawablePaths.push(path)
	          }
	        } catch {
	          // Evidence scripts assert target counts; failed path length measurement should not be hidden by a fallback animation.
	        }
	      }
	      return drawablePaths
	    }

	    const setScreenshotUploadTerminal = () => {
	      const uploadTargets = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-screenshot-upload-motion]'))
	      if (uploadTargets.length > 0) {
	        gsap.set(uploadTargets, {
	          autoAlpha: 1,
	          y: 0,
	          scale: 1,
	          clearProps: 'willChange',
	        })
	      }
	      const quotaFill = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="quota-fill"]')
	      if (quotaFill) {
	        const ratio = Number.parseFloat(quotaFill.dataset.quotaRatio ?? '0')
	        gsap.set(quotaFill, { scaleX: Number.isFinite(ratio) ? ratio : 0, transformOrigin: 'left center' })
	      }
	      const scanPaths = gsap.utils.toArray<SVGPathElement>(root.querySelectorAll('[data-scan-draw]'))
	      for (const path of scanPaths) {
	        path.style.strokeDasharray = ''
	        path.style.strokeDashoffset = '0'
	      }
	    }

    const terminalizeScreenshotUploadIfActive = () => {
      if (screenshotStepRef.current !== 'upload') return
      if (!root.querySelector('[data-screenshot-upload-motion]')) return
      setScreenshotUploadTerminal()
    }

	    const clearScreenshotMotion = () => {
	      screenshotMotionTimelineRef.current?.kill()
	      screenshotMotionTimelineRef.current = null
	      const motionTargets = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-screenshot-upload-motion], [data-screenshot-recognition-item], .pt-screenshot-recognition-cta'))
	      if (motionTargets.length > 0) {
	        gsap.set(motionTargets, {
	          clearProps: 'willChange,transform,opacity,visibility',
	        })
	      }
	      const scanPaths = gsap.utils.toArray<SVGPathElement>(root.querySelectorAll('[data-scan-draw]'))
	      for (const path of scanPaths) {
	        path.style.strokeDasharray = ''
	        path.style.strokeDashoffset = ''
	      }
	      terminalizeScreenshotUploadIfActive()
	    }

    const setScreenshotRecognitionTerminal = () => {
      const motionTargets = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-screenshot-recognition-item], .pt-screenshot-recognition-cta'))
      if (motionTargets.length > 0) {
        gsap.set(motionTargets, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          clearProps: 'willChange',
        })
      }
    }

    const makeContextSafe = contextSafe ?? ((callback: () => void) => callback)
    let mediaCleanup: (() => void) | null = null
    const runScreenshotMotion = makeContextSafe(() => {
      clearScreenshotMotion()
      mediaCleanup?.()
      mediaCleanup = null
      const mm = gsap.matchMedia()
      mm.add(
        {
          allowMotion: '(prefers-reduced-motion: no-preference)',
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (mediaContext) => {
          clearScreenshotMotion()
	          if (step === 'upload') {
	            if (mediaContext.conditions?.reduceMotion) {
	              setScreenshotUploadTerminal()
	              return () => clearScreenshotMotion()
	            }
	            const enterDuration = parseMotionTokenSeconds(root, '--motion-enter', 320)
	            const baseDuration = parseMotionTokenSeconds(root, '--motion-base', 240)
	            const fastDuration = parseMotionTokenSeconds(root, '--motion-fast', 180)
	            const pressDuration = parseMotionTokenSeconds(root, '--motion-press', 120)
	            const nav = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="nav"]')
	            const quotaCard = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="quota-card"]')
	            const quotaLabel = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="quota-label"]')
	            const uploadCard = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="upload-card"]')
	            const uploadText = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-screenshot-upload-motion="upload-title"], [data-screenshot-upload-motion="upload-copy"]'))
	            const howTo = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="howto"]')
	            const footerButtons = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-screenshot-upload-motion="footer-primary"], [data-screenshot-upload-motion="footer-secondary"]'))
	            const footerPrimary = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="footer-primary"]')
	            const scanPaths = prepareScanDrawPaths()
	            const timelineTargets = [nav, quotaCard, quotaLabel, uploadCard, howTo, footerPrimary, ...uploadText, ...footerButtons].filter(Boolean)
	            gsap.set(timelineTargets, { willChange: 'transform, opacity' })
	            const timeline = gsap.timeline({
	              defaults: { ease: 'power3.out' },
	              onComplete: () => {
	                setScreenshotUploadTerminal()
	                gsap.set(timelineTargets, { clearProps: 'willChange' })
	                for (const path of scanPaths) {
	                  path.style.strokeDasharray = ''
	                  path.style.strokeDashoffset = ''
	                }
	              },
	              onInterrupt: terminalizeScreenshotUploadIfActive,
	            })
	            timeline.addLabel('nav', 0)
	            if (nav) timeline.fromTo(nav, { autoAlpha: 0 }, { autoAlpha: 1, duration: fastDuration }, 'nav')
	            timeline.addLabel('quota', 'nav+=0.08')
	            if (quotaCard) timeline.fromTo(quotaCard, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: enterDuration }, 'quota')
	            if (quotaLabel) timeline.fromTo(quotaLabel, { autoAlpha: 0 }, { autoAlpha: 1, duration: fastDuration }, 'quota+=0.18')
	            timeline.addLabel('upload', 'quota+=0.24')
	            if (uploadCard) timeline.fromTo(uploadCard, { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: enterDuration }, 'upload')
	            if (scanPaths.length > 0) {
	              timeline.to(scanPaths, { strokeDashoffset: 0, duration: baseDuration, stagger: 0.055, ease: 'power2.out' }, 'upload+=0.08')
	            }
	            if (uploadText.length > 0) {
	              timeline.fromTo(uploadText, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: Math.min(0.28, enterDuration), stagger: 0.05 }, 'upload+=0.2')
	            }
	            timeline.addLabel('footer', 'upload+=0.4')
	            const footerTargets = [howTo, ...footerButtons].filter(Boolean)
	            if (footerTargets.length > 0) {
	              timeline.fromTo(footerTargets, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: Math.min(0.28, enterDuration), stagger: 0.07 }, 'footer')
	            }
	            if (footerPrimary) {
	              timeline
	                .to(footerPrimary, { scale: 1.03, duration: Math.max(0.16, pressDuration), ease: 'back.out(1.4)' }, 'footer+=0.18')
	                .to(footerPrimary, { scale: 1, duration: Math.max(0.18, pressDuration), ease: 'power3.out' }, 'footer+=0.34')
	            }
	            screenshotMotionTimelineRef.current = timeline
	            return () => clearScreenshotMotion()
	          }

	          if (step !== 'confirm' || !recognizeResult) {
	            return () => clearScreenshotMotion()
	          }
          if (mediaContext.conditions?.reduceMotion) {
            setScreenshotRecognitionTerminal()
            return () => clearScreenshotMotion()
          }

          const fieldRows = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-screenshot-recognition-item="field"]'))
          const matchCard = root.querySelector<HTMLElement>('[data-screenshot-recognition-item="match"]')
          const cta = root.querySelector<HTMLElement>('.pt-screenshot-recognition-cta')
          const maxDuration = Math.min(parseMotionTokenSeconds(root, '--motion-ceremony-max', 1200), 1.2)
          gsap.set([...fieldRows, matchCard, cta].filter(Boolean), { willChange: 'transform, opacity' })
          gsap.set(fieldRows, { autoAlpha: 0, y: 14 })
          if (matchCard) gsap.set(matchCard, { autoAlpha: 0, y: 14, scale: 0.985 })
          if (cta) gsap.set(cta, { scale: 1, autoAlpha: 1 })
          const timeline = gsap.timeline({
            defaults: { ease: 'power3.out' },
            onComplete: () => {
              gsap.set([...fieldRows, matchCard, cta].filter(Boolean), { clearProps: 'willChange' })
            },
          })
          timeline.addLabel('fields', 0)
          if (fieldRows.length > 0) {
            timeline.to(fieldRows, { autoAlpha: 1, y: 0, duration: Math.min(0.34, maxDuration * 0.32), stagger: 0.045 }, 'fields')
          }
          timeline.addLabel('match', 'fields+=0.22')
          if (matchCard) {
            timeline.to(matchCard, { autoAlpha: 1, y: 0, scale: 1, duration: 0.34 }, 'match')
          }
          timeline.addLabel('cta', 'match+=0.22')
          if (cta) {
            timeline
              .to(cta, { scale: 1.035, duration: 0.16, ease: 'power2.out' }, 'cta')
              .to(cta, { scale: 1, duration: 0.2, ease: 'power3.out' }, 'cta+=0.16')
          }
          screenshotMotionTimelineRef.current = timeline
          return () => clearScreenshotMotion()
        },
        root,
      )
      mediaCleanup = () => {
        clearScreenshotMotion()
        mm.revert()
      }
    })

    let frameOne = 0
    let frameTwo = 0
    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(runScreenshotMotion)
    })
    return () => {
      window.cancelAnimationFrame(frameOne)
      window.cancelAnimationFrame(frameTwo)
      mediaCleanup?.()
      mediaCleanup = null
      clearScreenshotMotion()
    }
	  }, { scope: motionScopeRef, dependencies: [step], revertOnUpdate: true })

	  useGSAP(() => {
	    const root = motionScopeRef.current
	    if (!root || step !== 'upload') return
	    const quotaFill = root.querySelector<HTMLElement>('[data-screenshot-upload-motion="quota-fill"]')
	    if (!quotaFill) return

	    const ratio = Number.parseFloat(quotaFill.dataset.quotaRatio ?? '0')
	    const targetRatio = Number.isFinite(ratio) ? ratio : 0
	    const mm = gsap.matchMedia()
	    mm.add(
	      {
	        allowMotion: '(prefers-reduced-motion: no-preference)',
	        reduceMotion: '(prefers-reduced-motion: reduce)',
	      },
	      (mediaContext) => {
	        if (mediaContext.conditions?.reduceMotion || quotaLoading) {
	          gsap.set(quotaFill, { scaleX: targetRatio, transformOrigin: 'left center' })
	          return () => {
	            gsap.set(quotaFill, { clearProps: 'willChange' })
	          }
	        }

	        const baseDuration = parseMotionTokenSeconds(root, '--motion-base', 240)
	        gsap.set(quotaFill, { willChange: 'transform', transformOrigin: 'left center' })
	        const tween = gsap.fromTo(
	          quotaFill,
	          { scaleX: 0 },
	          {
	            scaleX: targetRatio,
	            duration: baseDuration,
	            ease: 'power2.out',
	            overwrite: true,
	            onComplete: () => {
	              gsap.set(quotaFill, { clearProps: 'willChange' })
	            },
	          }
	        )
	        return () => {
	          tween.kill()
	          gsap.set(quotaFill, { clearProps: 'willChange' })
	        }
	      },
	      root
	    )

	    return () => {
	      mm.revert()
	    }
	  }, {
	    scope: motionScopeRef,
	    dependencies: [
	      step,
	      quotaLoading,
	      quotaState?.freeUsed,
	      quotaState?.paidUsed,
	      quotaState?.totalLimit,
	      quotaState?.remaining,
	    ],
	    revertOnUpdate: true,
	  })

	  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (upgradeEngageCloseTimerRef.current !== null) {
        window.clearTimeout(upgradeEngageCloseTimerRef.current)
      }
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
    if (isMountainContextLocked) return
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
      if (!response.ok) throw new Error(screenshotDisplayError('mountain search failed', payload, '山峰匹配暂时不可用，请稍后重试。'))
      const options = Array.isArray(payload.mountains) ? payload.mountains.slice(0, 5) : []
      setMountainOptions(options)
      setSelectedMountainId(options[0]?.id ?? null)
      setMountainSearchStatus(options.length > 0 ? 'ready' : 'empty')
    } catch (error) {
      if (error instanceof Error) console.warn('[screenshot] mountain search client failed', error)
      setMountainOptions([])
      setSelectedMountainId(null)
      setMountainSearchStatus('error')
      setMountainSearchError('山峰匹配暂时不可用，请稍后重试。')
    }
  }

  async function recognize(file: File) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = crypto.randomUUID()
    recognitionRequestIdRef.current = requestId
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
      const submitRecognition = async (): Promise<ScreenshotRecognitionRecoveryResponse<RecognizeResponse>> => {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('requestId', requestId)

        const response = await fetch('/api/screenshot/recognize', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        return readScreenshotRecognitionResponse<RecognizeResponse>(response)
      }

      const readRecovery = async (
        nextRequestId: string,
        signal: AbortSignal,
      ): Promise<ScreenshotRecognitionRecoveryResponse<RecognizeResponse>> => {
        const response = await fetch(`/api/screenshot/recognize?requestId=${encodeURIComponent(nextRequestId)}`, {
          method: 'GET',
          signal,
        })
        return readScreenshotRecognitionResponse<RecognizeResponse>(response)
      }

      let recognitionResponse: ScreenshotRecognitionRecoveryResponse<RecognizeResponse>
      try {
        recognitionResponse = await submitRecognition()
      } catch (error) {
        if (controller.signal.aborted) throw error
        recognitionResponse = await recoverScreenshotRecognition({
          requestId,
          startedAtMs: startedAt,
          signal: controller.signal,
          read: readRecovery,
        })
      }

      if (recognitionResponse.status === 202 && recognitionResponse.payload.code === 'screenshot_recognition_pending') {
        recognitionResponse = await recoverScreenshotRecognition({
          requestId,
          startedAtMs: startedAt,
          signal: controller.signal,
          read: readRecovery,
        })
      }

      const { payload } = recognitionResponse
      const remainingMinDuration = PROCESSING_MIN_DURATION_MS - (performance.now() - startedAt)
      if (remainingMinDuration > 0) await wait(remainingMinDuration)
      if (payload.quota) {
        setQuotaState(payload.quota)
      }
      if (!recognitionResponse.ok) {
        const kind = responseKind(recognitionResponse.status)
        if (kind === 'quota') {
          setUpgradeSheetOpen(true)
        }
        const rawMessage = readPayloadError(payload)
        if (rawMessage) console.warn('[screenshot] recognize failed', { kind, rawMessage })
        throw Object.assign(new Error(readableError('', kind)), { kind })
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
        requestId: payload.requestId ?? requestId,
        ocrResult: payload.ocrResult,
        parsedFields: payload.parsedFields,
        ocrSource: payload.ocrSource,
      })
      const nextEditableFields = buildEditableFields(payload.parsedFields)
      setEditableFields(nextEditableFields)
      setFieldToggles(buildInitialFieldToggles(payload.parsedFields))
      if (!isMountainContextLocked) void searchMountains(nextEditableFields.location)
      setSubmitError(null)
      setRouteShapeRecoveryOpen(false)
      setSubmitResult(null)
      setStep('confirm')
    } catch (error) {
      if (controller.signal.aborted) return
      const kind = (error instanceof Error && 'kind' in error ? error.kind : 'network') as RecognizeErrorKind
      if (error instanceof Error) console.warn('[screenshot] recognize client failed', error)
      const message = '这张截图暂时无法识别，请换一张再试。'
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
      setRecognizeError(kind === 'quota' ? null : readableError(message, kind))
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
    setRouteCalibration(createEmptyScreenshotRouteCalibration())
    setMountainOptions([])
    setSelectedMountainId(initialMountainContext?.id ?? null)
    setMountainSearchStatus('idle')
    setMountainSearchError(null)
    setSubmitError(null)
    setRouteShapeRecoveryOpen(false)
    setSubmitResult(null)
    recognitionRequestIdRef.current = null
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
      if (error instanceof Error) console.warn('[screenshot] preview read failed', error)
      resetPreview()
      setRecognizeError('这张截图暂时无法预览，请换一张再试。')
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
    setRouteCalibration(createEmptyScreenshotRouteCalibration())
    setMountainOptions([])
    setSelectedMountainId(initialMountainContext?.id ?? null)
    setMountainSearchStatus('idle')
    setMountainSearchError(null)
    setSubmitError(null)
    setRouteShapeRecoveryOpen(false)
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
      if (returnToImprint) {
        router.replace(buildImprintSourceUrl(initialTemplate))
        return
      }
      router.replace('/explore')
      return
    }

    if (step === 'submitting') {
      return
    }

    resetToUpload()
  }

  function openLogin() {
    router.replace(buildLoginHref())
  }

  function openUpgradeSheet() {
    if (upgradeEngageCloseTimerRef.current !== null) {
      window.clearTimeout(upgradeEngageCloseTimerRef.current)
      upgradeEngageCloseTimerRef.current = null
    }
    setUpgradeFeedbackVisible(false)
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
    if (upgradeEngageCloseTimerRef.current !== null) {
      window.clearTimeout(upgradeEngageCloseTimerRef.current)
      upgradeEngageCloseTimerRef.current = null
    }
    if (upgradeSheetOpen && !upgradeFeedbackVisible) trackScreenshotQuotaGate('gate_dismissed')
    setUpgradeFeedbackVisible(false)
    setUpgradeSheetOpen(false)
  }

  function engageUpgradeSheet() {
    // This engagement event is a demand signal for more quota, not a launched paid plan.
    trackScreenshotQuotaGate('gate_engaged')
    setUpgradeFeedbackVisible(true)
    if (upgradeEngageCloseTimerRef.current !== null) {
      window.clearTimeout(upgradeEngageCloseTimerRef.current)
    }
    upgradeEngageCloseTimerRef.current = window.setTimeout(() => {
      setUpgradeSheetOpen(false)
      setUpgradeFeedbackVisible(false)
      upgradeEngageCloseTimerRef.current = null
    }, 2500)
  }

  function canUseScreenshotQuota() {
    if (quotaState && quotaState.remaining <= 0) {
      setRecognizeError(null)
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
    if (key === 'distance') {
      setSubmitError(null)
      setRouteShapeRecoveryOpen(false)
    }
  }

  function updateRouteCalibration(calibration: ScreenshotRouteCalibration) {
    setRouteCalibration(calibration)
  }

  function clearRouteCalibrationForTextOnly() {
    setRouteCalibration(createEmptyScreenshotRouteCalibration())
    setSubmitError(null)
    setRouteShapeRecoveryOpen(false)
  }

  function searchCurrentLocation() {
    void searchMountains(editableFields.location)
  }

  async function handleSubmit(options: { forceTextOnly?: boolean } = {}) {
    if (!recognizeResult) return
    const parsedDataResult = validateScreenshotEditableFields({
      fields: editableFields,
      toggles: fieldToggles,
      fileName: imageFile?.name,
    })
    if (!parsedDataResult.ok) {
      setRouteShapeRecoveryOpen(false)
      setSubmitError(parsedDataResult.errors.distance ?? '请填写有效的总距离。')
      return
    }
    const parsedData = parsedDataResult.parsedData
    const routeShape = options.forceTextOnly ? null : buildPersistableScreenshotRouteShape(routeCalibration)
    if (!options.forceTextOnly && routeCalibration.controlPoints.length >= 2 && !routeShape && routeSolveLooksPending(routeCalibration)) {
      setRouteShapeRecoveryOpen(false)
      setSubmitError('校准路线还没准备好，请稍等片刻或重新校准。')
      return
    }
    const routeShapeValidation = validateScreenshotRouteShape(routeShape)
    if (!routeShapeValidation.ok) {
      console.info('screenshot route shape precheck failed', {
        error: routeShapeValidation.error,
        metrics: measureScreenshotRouteShape(routeShape),
      })
      setRouteShapeRecoveryOpen(true)
      setSubmitError('校准路线太复杂，无法保存。请清空路线后少点重描，或明确选择仅保存文字数据。')
      return
    }

    setSubmitError(null)
    setRouteShapeRecoveryOpen(false)
    setStep('submitting')
    try {
      const response = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: SCREENSHOT_RECOGNITION_SOURCE,
          requestId: recognitionRequestIdRef.current,
          mountainId: initialMountainContext?.id ?? selectedMountainId,
          contextMountainId: initialMountainContext?.id ?? null,
          parsedData,
          routeShape,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as ConfirmResponse
      if (!response.ok || !payload.ok || !payload.checkinId) {
        if (payload.code === 'route_shape_invalid' || payload.code === 'route_shape_persist_failed') {
          setRouteShapeRecoveryOpen(true)
          setSubmitError(screenshotDisplayError('route shape save failed', payload, '校准路线保存失败。请清空路线后少点重描，或明确选择仅保存文字数据。'))
          setStep('confirm')
          return
        }
        throw new Error(screenshotDisplayError('confirm failed', payload, '活动生成失败，请稍后再试。'))
      }
      if (payload.quota) setQuotaState(payload.quota)
      trackEvent({
        event_type: 'business',
        event_name: 'business.activity_create',
        properties: {
          source: SCREENSHOT_RECOGNITION_SOURCE,
          proof_status: 'uploaded',
          mountain_id: initialMountainContext?.id ?? selectedMountainId,
          checkin_id: payload.checkinId,
        },
      })
      setSubmitResult({ ok: true, checkinId: payload.checkinId, routeShape: routeShapeValidation.shape })
      recognitionRequestIdRef.current = null
      setStep('success')
    } catch (error) {
      if (error instanceof Error) console.warn('[screenshot] submit client failed', error)
      setRouteShapeRecoveryOpen(false)
      setSubmitError('活动生成失败，请稍后再试。')
      setStep('confirm')
    }
  }

  function handleArchiveBack() {
    if (submitResult?.checkinId) {
      router.replace(`/activity/${submitResult.checkinId}`)
    }
  }

  function handleArchiveContinue() {
    const shareUrl = buildShareUrlForCheckin({
      checkinId: submitResult?.checkinId,
      template: initialTemplate,
    })
    if (shareUrl) {
      router.replace(shareUrl)
    }
  }

    const selectedMountain = initialMountainContext ?? mountainOptions.find((option) => option.id === selectedMountainId) ?? null

  return (
    <div ref={motionScopeRef} data-screenshot-motion-scope="true" style={{ display: 'contents' }}>
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
          onHowTo={() => openHelpSheet('start.screenshot-how-to')}
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
          imagePreview={imagePreview}
          editableFields={editableFields}
          fieldToggles={fieldToggles}
          routeCalibration={routeCalibration}
          quota={quotaState}
          quotaLoading={quotaLoading}
          mountainOptions={mountainOptions}
          selectedMountainId={selectedMountainId}
          mountainSearchStatus={mountainSearchStatus}
          mountainSearchError={mountainSearchError}
          submitError={submitError}
          routeShapeRecoveryOpen={routeShapeRecoveryOpen}
          onFieldChange={updateField}
          onToggle={toggleField}
          onRouteCalibrationChange={updateRouteCalibration}
          onClearRouteCalibration={clearRouteCalibrationForTextOnly}
          onSaveTextOnly={() => void handleSubmit({ forceTextOnly: true })}
          onSelectMountain={setSelectedMountainId}
          onSearchMountain={searchCurrentLocation}
          onBack={handleBack}
          onSubmit={handleSubmit}
          onUpgrade={openUpgradeSheet}
          initialMountainContext={initialMountainContext}
        />
      ) : null}

      {step === 'submitting' ? <SubmittingScreen /> : null}

      {step === 'success' ? (
        <div data-screenshot-step="success" data-testid="screenshot-archive-moment">
          <ArchiveCreationSuccess
            title={selectedMountain?.name ?? (editableFields.location.trim() || '未命名山行')}
            values={[
              editableFields.distance ? `${editableFields.distance}km` : '--',
              editableFields.duration || '--',
              editableFields.elevationGain ? `${editableFields.elevationGain}m` : '--',
            ] as const}
            routeShape={submitResult?.routeShape ?? null}
            onShare={handleArchiveContinue}
            onViewArchive={handleArchiveBack}
          />
        </div>
      ) : null}

      <UpgradeSheet
        open={upgradeSheetOpen}
        feedbackVisible={upgradeFeedbackVisible}
        onClose={closeUpgradeSheetAsDismissed}
        onEngage={engageUpgradeSheet}
      />

      <span
        data-screenshot-file={imageFile?.name ?? ''}
        data-screenshot-preview-ready={imagePreview ? 'true' : 'false'}
        data-screenshot-ocr-source={recognizeResult?.ocrSource ?? ''}
        hidden
      />
    </div>
  )
}
