'use client'

import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OcrResult, ParsedScreenshotFields } from '@/lib/screenshot/types'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { BackIcon, CameraIcon, CheckIcon, ShareIcon, WarnIcon } from '@/components/ui/Icons'

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
const PROCESSING_MIN_DURATION_MS = 2000
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type ScreenshotStep = 'upload' | 'processing' | 'confirm' | 'submitting' | 'success'
type RecognizeErrorKind = 'auth' | 'too_large' | 'unsupported' | 'network' | 'file'
type FieldKey = 'elevation' | 'distance' | 'duration' | 'elevationGain' | 'date' | 'location' | 'speed'

type RecognizeResult = {
  ok: true
  ocrResult: OcrResult
  parsedFields: ParsedScreenshotFields
}

type RecognizeResponse = {
  ok?: boolean
  ocrResult?: OcrResult
  parsedFields?: ParsedScreenshotFields
  error?: string
}

type SubmitResult = {
  ok: true
  checkinId?: string
}

type FieldToggles = Record<FieldKey, boolean>

type FieldConfig = {
  key: FieldKey
  label: string
  locked: boolean
}

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'elevation', label: '海拔', locked: true },
  { key: 'distance', label: '总距离', locked: true },
  { key: 'duration', label: '时长', locked: false },
  { key: 'elevationGain', label: '爬升', locked: false },
  { key: 'date', label: '日期', locked: false },
  { key: 'location', label: '地点', locked: false },
  { key: 'speed', label: '速度', locked: false },
]

const EMPTY_FIELD_TOGGLES: FieldToggles = {
  elevation: true,
  distance: true,
  duration: false,
  elevationGain: false,
  date: false,
  location: false,
  speed: false,
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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
  if (status === 413) return 'too_large'
  if (status === 415) return 'unsupported'
  if (status >= 500) return 'network'
  return 'file'
}

function readableError(message: string, kind: RecognizeErrorKind) {
  if (kind === 'auth') return '登录后才能识别截图。'
  if (/unauthorized/i.test(message)) return '登录后才能识别截图。'
  return message || '这张截图暂时无法识别，请换一张再试。'
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
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
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
    case 'date':
      return hasFieldValue(fields.date)
    case 'location':
      return hasFieldValue(fields.location)
    case 'speed':
      return hasFieldValue(fields.speed)
  }
}

function buildInitialFieldToggles(fields: ParsedScreenshotFields): FieldToggles {
  return {
    elevation: true,
    distance: true,
    duration: hasParsedField(fields, 'duration'),
    elevationGain: hasParsedField(fields, 'elevationGain'),
    date: hasParsedField(fields, 'date'),
    location: hasParsedField(fields, 'location'),
    speed: hasParsedField(fields, 'speed'),
  }
}

function missingLockedFields(fields: ParsedScreenshotFields) {
  return !hasParsedField(fields, 'elevation') || !hasParsedField(fields, 'distance')
}

function validationTone(fields: ParsedScreenshotFields) {
  const elevation = fields.elevation?.value
  const distanceKm = fields.distance?.value
  const durationSeconds = fields.duration?.value
  const elevationGain = fields.elevationGain?.value

  return (typeof elevation === 'number' && elevation >= 9000) ||
    (typeof distanceKm === 'number' && distanceKm >= 200) ||
    (typeof durationSeconds === 'number' && durationSeconds >= 48 * 3600) ||
    (typeof elevationGain === 'number' && elevationGain >= 10000)
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
          fontSize: 16,
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

function ScreenshotShell({
  step,
  title = '识别截图',
  onBack,
  children,
  footer,
}: {
  step: ScreenshotStep
  title?: string
  onBack: () => void
  children: ReactNode
  footer?: ReactNode
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
  onBack,
  onChoose,
  onCamera,
  onHowTo,
  onLogin,
}: {
  error: string | null
  authRequired: boolean
  onBack: () => void
  onChoose: () => void
  onCamera: () => void
  onHowTo: () => void
  onLogin: () => void
}) {
  return (
    <ScreenshotShell
      step="upload"
      onBack={onBack}
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
              fontSize: 16,
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

function MockScreenshotPreview() {
  return (
    <div
      data-sr-mock-preview="true"
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

function ProcessingScreen({ onBack }: { onBack: () => void }) {
  return (
    <ScreenshotShell step="processing" onBack={onBack}>
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
        <MockScreenshotPreview />

        <div style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
          <div
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 16,
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
          <StatusRow state="done" label="文字信息提取完成" />
          <StatusRow state="active" label="轨迹路线识别中..." />
          <StatusRow state="pending" label="数据整理中..." />
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

function EditPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M14.7 4.3l5 5L8.5 20.5 3 22l1.5-5.5L14.7 4.3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="5" y="11" width="14" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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
  onToggle,
}: {
  config: FieldConfig
  value: string
  missing: boolean
  on: boolean
  last: boolean
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
          <span
            style={{
              fontSize: 16,
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 600,
              color: missing ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </span>
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
      <button
        type="button"
        aria-label={`编辑${config.label}`}
        onClick={() => undefined}
        style={{
          width: 28,
          height: 28,
          display: 'grid',
          placeItems: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: missing ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
          flexShrink: 0,
        }}
      >
        <EditPencil />
      </button>
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
        {config.locked ? <LockIcon /> : <Toggle on={on} onClick={onToggle} />}
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

function ConfirmScreen({
  result,
  fieldToggles,
  submitError,
  onToggle,
  onBack,
  onSubmit,
}: {
  result: RecognizeResult
  fieldToggles: FieldToggles
  submitError: string | null
  onToggle: (key: FieldKey) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const fields = result.parsedFields
  const tone = validationTone(fields)

  return (
    <ScreenshotShell
      step="confirm"
      title="确认识别结果"
      onBack={onBack}
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
            fontSize: 16,
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 600,
          }}
        >
          识别结果
        </h2>

        <div>
          {FIELD_CONFIGS.map((config, index) => {
            const missing = !hasParsedField(fields, config.key)
            return (
              <FieldRow
                key={config.key}
                config={config}
                value={formatFieldValue(fields, config.key)}
                missing={missing}
                on={config.locked ? true : fieldToggles[config.key]}
                last={index === FIELD_CONFIGS.length - 1}
                onToggle={() => onToggle(config.key)}
              />
            )
          })}
        </div>

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
                fontSize: 18,
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

export default function ScreenshotClient() {
  const router = useRouter()
  const albumInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [step, setStep] = useState<ScreenshotStep>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [recognizeResult, setRecognizeResult] = useState<RecognizeResult | null>(null)
  const [recognizeError, setRecognizeError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [fieldToggles, setFieldToggles] = useState<FieldToggles>(EMPTY_FIELD_TOGGLES)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function recognize(file: File) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

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
      if (!response.ok) {
        const kind = responseKind(response.status)
        throw Object.assign(new Error(readableError(payload.error ?? '', kind)), { kind })
      }

      if (!payload.ok || !payload.ocrResult || !payload.parsedFields) {
        throw Object.assign(new Error('这张截图暂时无法识别，请换一张再试。'), { kind: 'file' as RecognizeErrorKind })
      }

      setRecognizeResult({
        ok: true,
        ocrResult: payload.ocrResult,
        parsedFields: payload.parsedFields,
      })
      setFieldToggles(buildInitialFieldToggles(payload.parsedFields))
      setSubmitError(null)
      setSubmitResult(null)
      setStep('confirm')
    } catch (error) {
      if (controller.signal.aborted) return
      const kind = (error instanceof Error && 'kind' in error ? error.kind : 'network') as RecognizeErrorKind
      const message = error instanceof Error ? error.message : '这张截图暂时无法识别，请换一张再试。'
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
    abortRef.current?.abort()
    abortRef.current = null
    setImageFile(null)
    setImagePreview(null)
    setRecognizeResult(null)
    setFieldToggles(EMPTY_FIELD_TOGGLES)
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

  function toggleField(key: FieldKey) {
    const config = FIELD_CONFIGS.find((field) => field.key === key)
    if (config?.locked) return
    setFieldToggles((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  async function handleSubmit() {
    if (!recognizeResult) return
    if (missingLockedFields(recognizeResult.parsedFields)) {
      setSubmitError('请先补全海拔和总距离。')
      return
    }

    setSubmitError(null)
    setStep('submitting')
    await wait(900)
    setSubmitError('截图活动生成接口待接入，暂时无法生成活动。')
    setStep('confirm')
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
          onBack={handleBack}
          onChoose={() => albumInputRef.current?.click()}
          onCamera={() => cameraInputRef.current?.click()}
          onHowTo={() => console.log('Screenshot how-to will be added later')}
          onLogin={openLogin}
        />
      ) : null}

      {step === 'processing' ? <ProcessingScreen onBack={handleBack} /> : null}

      {step === 'confirm' && recognizeResult ? (
        <ConfirmScreen
          result={recognizeResult}
          fieldToggles={fieldToggles}
          submitError={submitError}
          onToggle={toggleField}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />
      ) : null}

      {step === 'submitting' ? <SubmittingScreen /> : null}

      {step === 'success' ? (
        <SuccessScreen result={recognizeResult} submitResult={submitResult} onViewActivity={handleViewActivity} />
      ) : null}

      <span data-screenshot-file={imageFile?.name ?? ''} data-screenshot-preview-ready={imagePreview ? 'true' : 'false'} hidden />
    </>
  )
}
