'use client'

import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ImportedTrackData } from '@/lib/import/types'
import Card from '@/components/ui/Card'
import PrimaryButton from '@/components/ui/PrimaryButton'
import {
  ArchiveIcon,
  BackIcon,
  CameraIcon,
  CheckIcon,
  MountainIcon,
  SearchIcon,
  ShareIcon,
  WarnIcon,
} from '@/components/ui/Icons'

const IMPORT_MAX_BYTES = 20 * 1024 * 1024
const SUPPORTED_FORMATS = ['gpx', 'kml', 'fit'] as const
const PARSING_MIN_DURATION_MS = 700

type ImportStep =
  | 'entry'
  | 'upload_empty'
  | 'upload_selected'
  | 'upload_parsing'
  | 'upload_error'
  | 'preview'
  | 'match'
  | 'no_match'
  | 'confirming'
  | 'success'

type SupportedFormat = (typeof SUPPORTED_FORMATS)[number]
type ParseErrorKind = 'unsupported' | 'too_large' | 'auth' | 'file' | 'network'

type ParseResponse = {
  ok?: boolean
  parsedData?: ImportedTrackData
  error?: string
}

type ConfirmResponse = {
  ok?: boolean
  checkinId?: string
  error?: string
}

type ConfirmResult = {
  checkinId: string
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function isSupportedFormat(value: string): value is SupportedFormat {
  return SUPPORTED_FORMATS.includes(value as SupportedFormat)
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function formatDistance(meters?: number) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return '--'
  return `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds?: number) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${Math.max(1, m)}m`
}

function formatElevation(meters?: number) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return '--'
  return `${Math.round(meters).toLocaleString('en-US')} m`
}

function formatDateTime(isoString?: string) {
  if (!isoString) return '--'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '--'
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

function formatActivityDate(isoString?: string) {
  if (!isoString) return '日期待补充'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '日期待补充'
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function buildLoginHref() {
  return `/auth/login?from=${encodeURIComponent('/import')}`
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function validateFile(file: File): { message: string; kind: ParseErrorKind } | null {
  const extension = getFileExtension(file.name)
  if (!isSupportedFormat(extension)) {
    return {
      message: '仅支持 GPX、KML 或 FIT 轨迹文件。',
      kind: 'unsupported',
    }
  }

  if (file.size > IMPORT_MAX_BYTES) {
    return {
      message: '轨迹文件不能超过 20MB。',
      kind: 'too_large',
    }
  }

  return null
}

function getResponseErrorKind(status: number): ParseErrorKind {
  if (status === 401) return 'auth'
  if (status === 413) return 'too_large'
  if (status === 415) return 'unsupported'
  return 'file'
}

function getErrorBadge(kind: ParseErrorKind | null) {
  if (kind === 'unsupported') return 'UNSUPPORTED'
  if (kind === 'too_large') return 'TOO LARGE'
  if (kind === 'auth') return 'LOGIN'
  if (kind === 'network') return 'NETWORK'
  return 'CHECK FILE'
}

function formatStep(step: number) {
  return String(step).padStart(2, '0')
}

function getVisualStep(step: ImportStep) {
  if (step === 'entry') return 1
  if (step === 'preview') return 3
  if (step === 'match' || step === 'no_match') return 4
  return 2
}

function FileIcon({
  size = 20,
  color = 'currentColor',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 13h6M9 16h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CloudIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6-1A4 4 0 0 0 7 18z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HealthIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PenIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 19l4-1 11-11-3-3L5 15z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function EyeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function FlowHeader({
  step,
  total = 4,
  title,
  onBack,
  backDisabled = false,
}: {
  step: number
  total?: number
  title?: ReactNode
  onBack: () => void
  backDisabled?: boolean
}) {
  return (
    <header style={{ padding: 'var(--space-1) var(--space-4) 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          aria-label="返回"
          onClick={onBack}
          disabled={backDisabled}
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-pill)',
            background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
            border: '1px solid var(--color-outline)',
            color: 'var(--color-on-surface)',
            cursor: backDisabled ? 'not-allowed' : 'pointer',
            display: 'grid',
            placeItems: 'center',
            opacity: backDisabled ? 0.42 : 1,
          }}
        >
          <BackIcon size={16} />
        </button>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            color: 'var(--color-on-surface-variant)',
            letterSpacing: '0.1em',
          }}
        >
          {formatStep(step)} / {formatStep(total)}
        </div>
        <div style={{ width: 36 }} />
      </div>
      {title ? (
        <h1
          style={{
            margin: '18px 0 0',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-headline-m-size)',
            lineHeight: 'var(--font-headline-m-line)',
            fontWeight: 700,
          }}
        >
          {title}
        </h1>
      ) : null}
    </header>
  )
}

function CTAFooter({ children }: { children: ReactNode }) {
  return (
    <footer
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        width: 'min(100%, var(--page-max-width))',
        padding: '14px var(--space-4) calc(22px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(180deg, transparent 0%, var(--color-surface) 30%)',
        zIndex: 30,
      }}
    >
      {children}
    </footer>
  )
}

function ImportScreen({
  step,
  title,
  onBack,
  children,
  footer,
  backDisabled = false,
}: {
  step: ImportStep
  title?: ReactNode
  onBack: () => void
  children: ReactNode
  footer?: ReactNode
  backDisabled?: boolean
}) {
  return (
    <div
      data-import-step={step}
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        position: 'relative',
        background: 'var(--color-surface)',
        paddingBottom: footer ? 'calc(110px + env(safe-area-inset-bottom))' : 'var(--space-6)',
        overflowX: 'hidden',
      }}
    >
      <FlowHeader step={getVisualStep(step)} title={title} onBack={onBack} backDisabled={backDisabled} />
      <main style={{ padding: 'var(--space-2) var(--space-4) 0', minWidth: 0 }}>{children}</main>
      {footer ? <CTAFooter>{footer}</CTAFooter> : null}
    </div>
  )
}

function FormatChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 30,
        padding: '6px var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
        border: '1px solid var(--color-outline)',
        color: 'var(--color-on-surface)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 'var(--font-label-m-line)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function SourceHintRow({
  icon,
  label,
  sub,
}: {
  icon: ReactNode
  label: string
  sub: string
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-3) 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-sm)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-on-surface-variant)',
          background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
          border: '1px solid var(--color-outline)',
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 2,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  )
}

function UploadDropZone({
  onPick,
  onDrop,
}: {
  onPick: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className="import-drop-zone"
      onClick={onPick}
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
      style={{
        appearance: 'none',
        width: '100%',
        border: '1.5px dashed var(--color-outline)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-8) var(--space-4)',
        background: 'color-mix(in srgb, var(--color-on-surface) 2%, transparent)',
        color: 'inherit',
        textAlign: 'center',
        cursor: 'pointer',
        display: 'grid',
        justifyItems: 'center',
      }}
    >
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-lg)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-on-surface-variant)',
          background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
          border: '1px solid var(--color-outline)',
        }}
      >
        <ShareIcon size={26} />
      </span>
      <span
        style={{
          marginTop: 14,
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-body-m-size)',
          lineHeight: 'var(--font-body-m-line)',
          fontWeight: 700,
        }}
      >
        选择轨迹文件
      </span>
      <span
        style={{
          marginTop: 'var(--space-2)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 1.6,
        }}
      >
        从相册、文件、第三方 App 中选择
        <br />
        GPX · KML · FIT
      </span>
    </button>
  )
}

function PrivacyNote() {
  return (
    <div
      style={{
        marginTop: 'var(--space-3)',
        padding: '10px var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--color-on-surface) 2%, transparent)',
        border: '1px solid var(--color-outline)',
        color: 'var(--color-on-surface-variant)',
        fontSize: 'var(--font-label-s-size)',
        lineHeight: 1.6,
        textAlign: 'center',
      }}
    >
      文件只用于解析，不会保存原始文件
    </div>
  )
}

function FileInfoCard({
  file,
  onRemove,
  status,
  progress,
}: {
  file: File
  onRemove?: () => void
  status?: ReactNode
  progress?: ReactNode
}) {
  const extension = getFileExtension(file.name).toUpperCase()

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', gap: 'var(--space-3)', alignItems: 'center' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--color-success)',
              background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)',
            }}
          >
            <FileIcon />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'var(--color-on-surface)',
                fontSize: 'var(--font-body-m-size)',
                lineHeight: 'var(--font-body-m-line)',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {file.name}
            </div>
            <div
              style={{
                marginTop: 3,
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
              }}
            >
              {formatFileSize(file.size)} · {extension || 'FILE'}
            </div>
          </div>
          {onRemove ? (
            <button
              type="button"
              aria-label="移除文件"
              onClick={onRemove}
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-pill)',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid var(--color-outline)',
                background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
                color: 'var(--color-on-surface-variant)',
                cursor: 'pointer',
              }}
            >
              <CloseIcon />
            </button>
          ) : (
            <div style={{ width: 32 }} />
          )}
        </div>
        {progress}
        {status}
      </div>
    </Card>
  )
}

function StatusRow() {
  return (
    <div
      style={{
        paddingTop: 'var(--space-3)',
        borderTop: '1px solid var(--color-outline)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--color-success)',
          flex: '0 0 auto',
        }}
      />
      <span
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
        }}
      >
        文件可读 · 等待解析
      </span>
    </div>
  )
}

function ProgressBlock({ progress }: { progress: number }) {
  const total = 2008
  const current = Math.max(1, Math.min(total, Math.round((Math.min(progress, 64) / 64) * 1284)))

  return (
    <div>
      <div
        style={{
          height: 4,
          borderRadius: 'var(--radius-pill)',
          background: 'color-mix(in srgb, var(--color-on-surface) 6%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: 'inherit',
            background: 'var(--color-success)',
            transition: 'width 180ms ease',
          }}
        />
      </div>
      <div
        style={{
          marginTop: 'var(--space-2)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
        }}
      >
        <span>{Math.round(progress)}%</span>
        <span>读取轨迹点 · {current.toLocaleString('en-US')} / {total.toLocaleString('en-US')}</span>
      </div>
    </div>
  )
}

function ParsingStepList() {
  const rows: Array<[string, boolean]> = [
    ['读取文件', true],
    ['提取轨迹点', true],
    ['计算距离与爬升', false],
    ['匹配山峰', false],
  ]

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      {rows.map(([label, done]) => (
        <div
          key={label}
          style={{
            display: 'grid',
            gridTemplateColumns: '24px minmax(0, 1fr)',
            gap: '10px',
            alignItems: 'center',
            padding: '10px var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
          }}
        >
          {done ? (
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 'var(--radius-pill)',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--color-success)',
                color: 'var(--color-on-primary)',
              }}
            >
              <CheckIcon size={13} />
            </span>
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                marginInline: 1,
                borderRadius: 'var(--radius-pill)',
                border: '1.5px solid var(--color-outline)',
              }}
            />
          )}
          <span
            style={{
              color: done ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
              fontSize: 12,
              lineHeight: 'var(--font-label-m-line)',
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

function ImportEntry({
  onBack,
  onUpload,
  onHelp,
}: {
  onBack: () => void
  onUpload: () => void
  onHelp: () => void
}) {
  return (
    <ImportScreen
      step="entry"
      title={(
        <>
          把这次结果
          <br />
          带回来
        </>
      )}
      onBack={onBack}
      footer={(
        <>
          <PrimaryButton onClick={onUpload} style={{ width: '100%' }}>
            上传轨迹文件
          </PrimaryButton>
          <button
            type="button"
            onClick={onHelp}
            style={{
              marginTop: 10,
              width: '100%',
              height: 44,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-on-surface-variant)',
              font: 'inherit',
              fontSize: 'var(--font-label-m-size)',
              cursor: 'pointer',
            }}
          >
            查看导入说明
          </button>
        </>
      )}
    >
      <p
        style={{
          margin: 0,
          paddingInline: 'var(--space-1)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 1.7,
        }}
      >
        从手表、其他 App 或健康记录中导出的轨迹，都可以导入到 Peak Trekker，作为这次山行的依据。
      </p>

      <div style={{ marginTop: 22 }}>
        <Card>
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
            支持格式
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 10 }}>
            {SUPPORTED_FORMATS.map((format) => (
              <FormatChip key={format}>{format.toUpperCase()}</FormatChip>
            ))}
          </div>
          <div
            style={{
              marginTop: 10,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 1.6,
            }}
          >
            可从 Garmin Connect、佳明 / 高驰 / 苹果健康、两步路、Strava 等导出
          </div>
        </Card>
      </div>

      <div
        style={{
          marginTop: 14,
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        导入后会做的事
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        {[
          ['01', '解析轨迹', '提取距离、时长、海拔与时间'],
          ['02', '匹配山峰', '尝试关联到已收录山峰'],
          ['03', '存入档案', '成为你的一次山行记录'],
        ].map(([number, title, description]) => (
          <div
            key={number}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px minmax(0, 1fr)',
              gap: 'var(--space-3)',
              alignItems: 'center',
              padding: '10px var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-outline)',
              background: 'color-mix(in srgb, var(--color-on-surface) 2%, transparent)',
            }}
          >
            <div
              style={{
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
              }}
            >
              {number}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: 'var(--color-on-surface)',
                  fontSize: 'var(--font-label-m-size)',
                  lineHeight: 'var(--font-label-m-line)',
                  fontWeight: 700,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  marginTop: 2,
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 'var(--font-label-s-size)',
                  lineHeight: 'var(--font-label-s-line)',
                }}
              >
                {description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ImportScreen>
  )
}

function ImportUploadEmpty({
  onBack,
  onPick,
  onDrop,
}: {
  onBack: () => void
  onPick: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
}) {
  return (
    <ImportScreen
      step="upload_empty"
      title="上传轨迹文件"
      onBack={onBack}
      footer={(
        <PrimaryButton onClick={onPick} style={{ width: '100%' }}>
          从「文件」中选择
        </PrimaryButton>
      )}
    >
      <UploadDropZone onPick={onPick} onDrop={onDrop} />
      <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 14 }}>
        <SourceHintRow icon={<HealthIcon />} label="从「健康」导入" sub="iOS · 可选择已导出的轨迹文件" />
        <SourceHintRow icon={<CloudIcon />} label="从云端 / 第三方 App" sub="Garmin · 高驰 · 两步路 · Strava" />
      </div>
      <PrivacyNote />
    </ImportScreen>
  )
}

function ImportUploadSelected({
  file,
  onBack,
  onContinue,
  onRemove,
}: {
  file: File
  onBack: () => void
  onContinue: () => void
  onRemove: () => void
}) {
  return (
    <ImportScreen
      step="upload_selected"
      title="上传轨迹文件"
      onBack={onBack}
      footer={(
        <PrimaryButton onClick={onContinue} style={{ width: '100%' }}>
          开始解析
        </PrimaryButton>
      )}
    >
      <FileInfoCard file={file} onRemove={onRemove} status={<StatusRow />} />
      <PrivacyNote />
    </ImportScreen>
  )
}

function ImportUploadParsing({
  file,
  progress,
  onBack,
}: {
  file: File
  progress: number
  onBack: () => void
}) {
  return (
    <ImportScreen step="upload_parsing" title="上传轨迹文件" onBack={onBack} backDisabled>
      <FileInfoCard
        file={file}
        progress={<ProgressBlock progress={progress} />}
        status={(
          <div
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            正在解析…
          </div>
        )}
      />
      <div style={{ marginTop: 14 }}>
        <ParsingStepList />
      </div>
    </ImportScreen>
  )
}

function ImportUploadError({
  file,
  error,
  errorKind,
  authRequired,
  onBack,
  onRetry,
  onPickAnother,
  onLogin,
}: {
  file: File | null
  error: string
  errorKind: ParseErrorKind | null
  authRequired: boolean
  onBack: () => void
  onRetry: () => void
  onPickAnother: () => void
  onLogin: () => void
}) {
  return (
    <ImportScreen
      step="upload_error"
      title="上传轨迹文件"
      onBack={onBack}
      footer={(
        <>
          {authRequired ? (
            <PrimaryButton onClick={onLogin} style={{ width: '100%' }}>
              去登录
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={onPickAnother} style={{ width: '100%' }}>
              选择其他文件
            </PrimaryButton>
          )}
          <button
            type="button"
            onClick={authRequired ? onPickAnother : onRetry}
            disabled={!file && !authRequired}
            style={{
              marginTop: 10,
              width: '100%',
              height: 44,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-on-surface-variant)',
              font: 'inherit',
              fontSize: 'var(--font-label-m-size)',
              cursor: !file && !authRequired ? 'not-allowed' : 'pointer',
              opacity: !file && !authRequired ? 0.5 : 1,
            }}
          >
            {authRequired ? '选择其他文件' : '重试解析'}
          </button>
        </>
      )}
    >
      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          background: 'color-mix(in srgb, var(--color-error) 5%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              placeItems: 'center',
              background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
              color: 'var(--color-error)',
              flex: '0 0 auto',
            }}
          >
            <WarnIcon size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'var(--color-on-surface)',
                fontSize: 'var(--font-body-m-size)',
                lineHeight: 'var(--font-body-m-line)',
                fontWeight: 700,
              }}
            >
              无法解析这个文件
            </div>
            <div
              style={{
                marginTop: 3,
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
              }}
            >
              {error}
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid color-mix(in srgb, var(--color-error) 18%, transparent)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 'var(--space-2)',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            {file?.name ?? '未选择文件'}
          </div>
          <div
            style={{
              color: 'var(--color-error)',
              fontSize: 10,
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            {getErrorBadge(errorKind)}
          </div>
        </div>
      </div>

      <Card className="import-common-issues">
        <div
          style={{
            color: 'var(--color-on-surface)',
            fontSize: 12,
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 700,
          }}
        >
          常见问题
        </div>
        <ul
          style={{
            margin: 'var(--space-2) 0 0',
            paddingInlineStart: 18,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 1.8,
          }}
        >
          <li>压缩包请先解压再选择</li>
          <li>仅支持 GPX · KML · FIT 格式</li>
          <li>文件需包含至少一条带时间与位置的轨迹</li>
        </ul>
      </Card>
    </ImportScreen>
  )
}

function formatElevationCompact(meters?: number) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return '--'
  return `${Math.round(meters).toLocaleString('en-US')}m`
}

function sampleElevations(result: ImportedTrackData) {
  const elevations = result.trackPoints
    .map((point) => point.elevation)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (elevations.length < 2) {
    return [3180, 3430, 3610, 3890, 4210, 4630, 5030, 5396, 5120, 4760, 4380, 3970, 3650]
  }

  if (elevations.length <= 48) return elevations
  const lastIndex = elevations.length - 1
  return Array.from({ length: 48 }, (_, index) => elevations[Math.round((index / 47) * lastIndex)])
}

function RoutePreviewSVG({ result }: { result: ImportedTrackData }) {
  const elevations = sampleElevations(result)
  const minElevation = Math.min(...elevations)
  const maxElevation = Math.max(...elevations)
  const range = Math.max(1, maxElevation - minElevation)
  const topPadding = 18
  const bottomY = 122
  const graphHeight = bottomY - topPadding
  const points = elevations.map((elevation, index) => {
    const x = elevations.length === 1 ? 0 : (index / (elevations.length - 1)) * 320
    const y = bottomY - ((elevation - minElevation) / range) * graphHeight
    return { x, y, elevation }
  })
  const lineD = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const fillD = `${lineD} L320 140 L0 140Z`
  const highest = points.reduce((best, point) => (point.elevation > best.elevation ? point : best), points[0])
  const startElevation = result.trackPoints.find((point) => typeof point.elevation === 'number')?.elevation ?? result.minElevation
  const endElevation = [...result.trackPoints].reverse().find((point) => typeof point.elevation === 'number')?.elevation ?? result.maxElevation

  return (
    <>
      <svg viewBox="0 0 320 140" style={{ width: '100%', height: 140, display: 'block' }} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="import-elevation-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--color-primary) 18%, transparent)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <g stroke="color-mix(in srgb, var(--color-on-surface) 4%, transparent)" strokeWidth="1">
          <line x1="0" y1="35" x2="320" y2="35" />
          <line x1="0" y1="70" x2="320" y2="70" />
          <line x1="0" y1="105" x2="320" y2="105" />
        </g>
        <path d={fillD} fill="url(#import-elevation-fill)" />
        <path d={lineD} stroke="var(--color-primary)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={highest.x} cy={highest.y} r="7" fill="none" stroke="color-mix(in srgb, var(--color-primary) 40%, transparent)" strokeWidth="1" />
        <circle cx={highest.x} cy={highest.y} r="3.5" fill="var(--color-primary)" />
        <text
          x={Math.min(300, Math.max(20, highest.x))}
          y={Math.max(12, highest.y - 10)}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fill="var(--color-success)"
        >
          {formatElevationCompact(result.maxElevation ?? highest.elevation)}
        </text>
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 var(--space-4) var(--space-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          lineHeight: 'var(--font-label-s-line)',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        <span>{formatElevationCompact(startElevation)}</span>
        <span>距离 {formatDistance(result.distanceMeters)}</span>
        <span>{formatElevationCompact(endElevation)}</span>
      </div>
    </>
  )
}

function PreviewStatTile({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 10,
          lineHeight: 'var(--font-label-s-line)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          color: accent ? 'var(--color-success)' : 'var(--color-on-surface)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function SuccessChip() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 24,
        padding: '4px 9px',
        borderRadius: 'var(--radius-pill)',
        color: 'var(--color-success)',
        background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-primary) 26%, transparent)',
        fontSize: 'var(--font-label-s-size)',
        lineHeight: 'var(--font-label-s-line)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">●</span>
      解析成功
    </span>
  )
}

function ConfirmErrorNotice({
  error,
  authRequired,
  onLogin,
}: {
  error: string | null
  authRequired: boolean
  onLogin: () => void
}) {
  if (!error) return null

  return (
    <div
      style={{
        marginTop: 'var(--space-3)',
        padding: '10px var(--space-3)',
        borderRadius: 'var(--radius-md)',
        color: authRequired ? 'var(--color-warning)' : 'var(--color-error)',
        background: authRequired
          ? 'color-mix(in srgb, var(--color-warning) 8%, transparent)'
          : 'color-mix(in srgb, var(--color-error) 7%, transparent)',
        border: authRequired
          ? '1px solid color-mix(in srgb, var(--color-warning) 26%, transparent)'
          : '1px solid color-mix(in srgb, var(--color-error) 26%, transparent)',
        fontSize: 'var(--font-label-s-size)',
        lineHeight: 1.6,
      }}
    >
      <div>{error}</div>
      {authRequired ? (
        <button
          type="button"
          onClick={onLogin}
          style={{
            marginTop: 'var(--space-2)',
            height: 32,
            padding: '0 var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid currentColor',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          去登录
        </button>
      ) : null}
    </div>
  )
}

function ImportPreview({
  result,
  onBack,
  onContinue,
}: {
  result: ImportedTrackData
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <ImportScreen
      step="preview"
      title="解析完成"
      onBack={onBack}
      footer={(
        <>
          <PrimaryButton onClick={onContinue} style={{ width: '100%' }}>
            继续
          </PrimaryButton>
          <button
            type="button"
            onClick={() => {
              console.log('Full track preview will be connected in a later batch.')
            }}
            style={{
              marginTop: 10,
              width: '100%',
              height: 44,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-on-surface-variant)',
              font: 'inherit',
              fontSize: 'var(--font-label-m-size)',
              cursor: 'pointer',
            }}
          >
            查看完整轨迹
          </button>
        </>
      )}
    >
      <div
        style={{
          background: 'var(--color-surface-variant)',
          border: '1px solid var(--color-outline)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px var(--space-4) 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
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
            轨迹概览
          </div>
          <SuccessChip />
        </div>
        <RoutePreviewSVG result={result} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <PreviewStatTile label="距离" value={formatDistance(result.distanceMeters)} />
        <PreviewStatTile label="时长" value={formatDuration(result.durationSeconds)} />
        <PreviewStatTile label="累计爬升" value={formatElevation(result.elevationGainMeters)} accent />
        <PreviewStatTile label="最高点" value={formatElevation(result.maxElevation)} accent />
      </div>

      <div
        style={{
          marginTop: 14,
          background: 'var(--color-surface-variant)',
          border: '1px solid var(--color-outline)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) 14px',
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
          起止时间
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 16px 1fr', gap: 10, alignItems: 'center', marginTop: 'var(--space-2)' }}>
          <div>
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 10, lineHeight: 'var(--font-label-s-line)' }}>出发</div>
            <div style={{ marginTop: 2, color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 'var(--font-label-m-line)', fontWeight: 700 }}>
              {formatDateTime(result.startTime)}
            </div>
          </div>
          <div style={{ color: 'var(--color-on-surface-variant)', display: 'grid', placeItems: 'center' }}>
            <ChevronIcon size={14} />
          </div>
          <div>
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 10, lineHeight: 'var(--font-label-s-line)' }}>结束</div>
            <div style={{ marginTop: 2, color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 'var(--font-label-m-line)', fontWeight: 700 }}>
              {formatDateTime(result.endTime)}
            </div>
          </div>
        </div>
      </div>
    </ImportScreen>
  )
}

function ImportMatch({
  result,
  selectedMountainId,
  confirmError,
  confirmAuthRequired,
  onSelect,
  onBack,
  onManual,
  onConfirm,
  onLogin,
}: {
  result: ImportedTrackData
  selectedMountainId: string | null
  confirmError: string | null
  confirmAuthRequired: boolean
  onSelect: (id: string) => void
  onBack: () => void
  onManual: () => void
  onConfirm: () => void
  onLogin: () => void
}) {
  const mountain = result.suggestedMountain
  const selected = !!mountain?.id && selectedMountainId === mountain.id

  return (
    <ImportScreen
      step="match"
      title={(
        <>
          看起来是
          <br />
          这座山
        </>
      )}
      onBack={onBack}
      footer={(
        <>
          {confirmError ? (
            <div
              style={{
                marginBottom: 'var(--space-2)',
                color: confirmAuthRequired ? 'var(--color-warning)' : 'var(--color-error)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 1.5,
                textAlign: 'center',
              }}
            >
              {confirmError}
            </div>
          ) : null}
          <PrimaryButton onClick={confirmAuthRequired ? onLogin : onConfirm} style={{ width: '100%' }} disabled={!mountain?.id}>
            {confirmAuthRequired ? '去登录' : '确认是这一座'}
          </PrimaryButton>
        </>
      )}
    >
      <p
        style={{
          margin: 0,
          paddingInline: 'var(--space-1)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 1.7,
        }}
      >
        根据轨迹的位置与最高点，系统找到了候选。请确认是哪一座。
      </p>

      {mountain ? (
        <button
          type="button"
          onClick={() => onSelect(mountain.id)}
          style={{
            marginTop: 14,
            width: '100%',
            textAlign: 'left',
            padding: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            background: selected
              ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
              : 'var(--color-surface-variant)',
            border: selected
              ? '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)'
              : '1px solid var(--color-outline)',
            borderRadius: 14,
            display: 'grid',
            gridTemplateColumns: '44px minmax(0, 1fr) auto',
            gap: 'var(--space-3)',
            alignItems: 'center',
            color: 'inherit',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--color-success)',
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-outline)',
            }}
          >
            <MountainIcon size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minWidth: 0 }}>
              <div
                style={{
                  color: 'var(--color-on-surface)',
                  fontSize: 'var(--font-body-m-size)',
                  lineHeight: 'var(--font-body-m-line)',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {mountain.name}
              </div>
              <span
                style={{
                  color: 'var(--color-success)',
                  background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-primary) 26%, transparent)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '2px 6px',
                  fontSize: 9,
                  lineHeight: 'var(--font-label-s-line)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                最匹配
              </span>
            </div>
            <div
              style={{
                marginTop: 3,
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
              }}
            >
              距轨迹最高点约 {formatDistance(mountain.distanceMeters)}
            </div>
          </div>
          <div style={{ textAlign: 'right', color: 'var(--color-success)' }}>
            <div style={{ fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)', fontWeight: 700 }}>
              自动匹配
            </div>
          </div>
        </button>
      ) : null}

      <button
        type="button"
        onClick={onManual}
        style={{
          marginTop: 14,
          width: '100%',
          height: 48,
          background: 'color-mix(in srgb, var(--color-on-surface) 2%, transparent)',
          border: '1px dashed var(--color-outline)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-on-surface-variant)',
          font: 'inherit',
          fontSize: 'var(--font-label-m-size)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <SearchIcon size={14} />
        都不是，自己找
      </button>
    </ImportScreen>
  )
}

function RidgeIllustration() {
  return (
    <svg width="180" height="64" viewBox="0 0 180 64" style={{ display: 'block', margin: '0 auto' }} aria-hidden="true" focusable="false">
      <path
        d="M0 56 L36 30 L60 42 L92 14 L120 36 L148 24 L180 44"
        stroke="var(--color-outline)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="92" cy="14" r="7" fill="none" stroke="color-mix(in srgb, var(--color-on-surface) 10%, transparent)" strokeWidth="1" />
      <circle cx="92" cy="14" r="3" fill="var(--color-on-surface-variant)" />
    </svg>
  )
}

function NoMatchOption({
  icon,
  title,
  sub,
  green = false,
  onClick,
}: {
  icon: ReactNode
  title: string
  sub: string
  green?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: 14,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: green
          ? 'linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 8%, transparent), color-mix(in srgb, var(--color-primary) 2%, transparent))'
          : 'var(--color-surface-variant)',
        border: green
          ? '1px solid color-mix(in srgb, var(--color-primary) 26%, transparent)'
          : '1px solid var(--color-outline)',
        borderRadius: 14,
        display: 'grid',
        gridTemplateColumns: '38px minmax(0, 1fr) auto',
        gap: 'var(--space-3)',
        alignItems: 'center',
        color: 'inherit',
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: green
            ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
            : 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
          border: green
            ? '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)'
            : '1px solid var(--color-outline)',
          color: green ? 'var(--color-success)' : 'var(--color-on-surface)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
            fontWeight: 700,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 3,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          {sub}
        </div>
      </div>
      <div style={{ color: 'var(--color-on-surface-variant)', display: 'grid', placeItems: 'center' }}>
        <ChevronIcon />
      </div>
    </button>
  )
}

function ImportNoMatch({
  confirmError,
  confirmAuthRequired,
  onBack,
  onStash,
  onSearch,
  onLogin,
}: {
  confirmError: string | null
  confirmAuthRequired: boolean
  onBack: () => void
  onStash: () => void
  onSearch: () => void
  onLogin: () => void
}) {
  return (
    <ImportScreen step="no_match" title="还没找到对应的山" onBack={onBack}>
      <div
        style={{
          paddingInline: 'var(--space-1)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 1.7,
        }}
      >
        你的轨迹完整保存好了。
        <br />
        只是暂时没匹配到收录的山峰 — 这没关系，后续也可以再补充关联。
      </div>

      <div style={{ padding: '18px var(--space-3) var(--space-1)', textAlign: 'center' }}>
        <RidgeIllustration />
      </div>

      <ConfirmErrorNotice error={confirmError} authRequired={confirmAuthRequired} onLogin={onLogin} />

      <div style={{ display: 'grid', gap: 10, marginTop: 'var(--space-5)' }}>
        <NoMatchOption
          green
          icon={<ArchiveIcon size={18} />}
          title="作为未收录山行保存"
          sub="进入档案 · 之后可以补充关联"
          onClick={onStash}
        />
        <NoMatchOption
          icon={<SearchIcon size={18} />}
          title="手动搜索关联山峰"
          sub="你比系统更清楚自己去了哪"
          onClick={onSearch}
        />
      </div>
    </ImportScreen>
  )
}

function ConfirmingScreen() {
  return (
    <div
      data-import-step="confirming"
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        position: 'relative',
        background: 'var(--color-surface)',
        overflowX: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <header style={{ padding: 'var(--space-1) var(--space-4) 14px' }}>
        <button
          type="button"
          aria-label="正在生成活动记录"
          disabled
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-pill)',
            background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
            border: '1px solid var(--color-outline)',
            color: 'var(--color-on-surface-variant)',
            opacity: 0.42,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <BackIcon size={16} />
        </button>
      </header>
      <main
        style={{
          display: 'grid',
          placeItems: 'center',
          padding: '0 var(--space-4) var(--space-12)',
          textAlign: 'center',
        }}
      >
        <div>
          <div
            className="import-spinner"
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-pill)',
              border: '2px solid color-mix(in srgb, var(--color-on-surface) 8%, transparent)',
              borderTopColor: 'var(--color-success)',
              margin: '0 auto',
            }}
          />
          <div
            style={{
              marginTop: 'var(--space-4)',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 'var(--font-body-m-line)',
            }}
          >
            正在生成活动记录…
          </div>
        </div>
      </main>
    </div>
  )
}

function MiniResult({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 10, lineHeight: 'var(--font-label-s-line)' }}>{label}</div>
      <div style={{ marginTop: 2, color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 'var(--font-label-m-line)', fontWeight: 700 }}>
        {value}
      </div>
    </div>
  )
}

function NextAction({
  icon,
  label,
  sub,
  primary = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  sub: string
  primary?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 14,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: primary
          ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
          : 'var(--color-surface-variant)',
        border: primary
          ? '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)'
          : '1px solid var(--color-outline)',
        borderRadius: 14,
        color: 'inherit',
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: primary
            ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
            : 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
          border: primary
            ? '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)'
            : '1px solid var(--color-outline)',
          color: primary ? 'var(--color-success)' : 'var(--color-on-surface)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </div>
      <div style={{ marginTop: 10, color: 'var(--color-on-surface)', fontSize: 'var(--font-label-m-size)', lineHeight: 'var(--font-label-m-line)', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ marginTop: 3, color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>
        {sub}
      </div>
    </button>
  )
}

function ImportSuccess({
  result,
  confirmResult,
  onShare,
  onView,
  onAddPhoto,
  onWriteNote,
}: {
  result: ImportedTrackData | null
  confirmResult: ConfirmResult | null
  onShare: () => void
  onView: () => void
  onAddPhoto: () => void
  onWriteNote: () => void
}) {
  const mountainName = result?.suggestedMountain?.name ?? '未关联山峰'
  const dateLabel = formatActivityDate(result?.startTime)

  return (
    <div
      data-import-step="success"
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        position: 'relative',
        background: 'var(--color-surface)',
        overflowX: 'hidden',
        padding: 'var(--space-10) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ textAlign: 'center', paddingInline: 'var(--space-2)' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-pill)',
            background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-primary) 32%, transparent)',
            color: 'var(--color-success)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto',
          }}
        >
          <CheckIcon size={30} />
        </div>
        <div
          style={{
            marginTop: 18,
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-headline-m-size)',
            lineHeight: 'var(--font-headline-m-line)',
            fontWeight: 700,
          }}
        >
          已带回档案
        </div>
        <div
          style={{
            marginTop: 'var(--space-2)',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 1.65,
          }}
        >
          {mountainName} · {dateLabel}
          <br />
          这次山行已成为你档案里的一条记录
        </div>
      </div>

      <div
        style={{
          marginTop: 'var(--space-6)',
          background: 'var(--color-surface-variant)',
          border: '1px solid var(--color-outline)',
          borderRadius: 14,
          padding: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--color-on-surface)', fontSize: 'var(--font-body-m-size)', lineHeight: 'var(--font-body-m-line)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mountainName}
            </div>
            <div style={{ marginTop: 3, color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>
              {confirmResult?.checkinId ? `活动 ${confirmResult.checkinId.slice(0, 8)}` : '活动已生成'}
            </div>
          </div>
          <div style={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)', fontSize: 18, lineHeight: 'var(--font-title-l-line)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {formatElevationCompact(result?.maxElevation)}
          </div>
        </div>
        <div
          style={{
            marginTop: 'var(--space-3)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-outline)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-2)',
          }}
        >
          <MiniResult label="距离" value={formatDistance(result?.distanceMeters)} />
          <MiniResult label="时长" value={formatDuration(result?.durationSeconds)} />
          <MiniResult label="爬升" value={formatElevation(result?.elevationGainMeters)} />
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-5)', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        接下来
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 'var(--space-2)' }}>
        <NextAction icon={<CameraIcon size={16} />} label="补照片" sub="登顶 / 路上" onClick={onAddPhoto} />
        <NextAction icon={<PenIcon size={16} />} label="写一句话" sub="留下这次的感受" onClick={onWriteNote} />
        <NextAction primary icon={<ShareIcon size={16} />} label="生成分享" sub="海拔卡 / 朋友圈" onClick={onShare} />
        <NextAction icon={<EyeIcon size={16} />} label="查看活动" sub="进入完整记录" onClick={onView} />
      </div>
    </div>
  )
}

export default function ImportClient() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState<ImportStep>('entry')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ImportedTrackData | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseErrorKind, setParseErrorKind] = useState<ParseErrorKind | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const [authRequired, setAuthRequired] = useState(false)
  const [selectedMountainId, setSelectedMountainId] = useState<string | null>(null)
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmAuthRequired, setConfirmAuthRequired] = useState(false)

  useEffect(() => {
    if (step !== 'upload_parsing') return

    const timer = window.setInterval(() => {
      setParseProgress((current) => {
        if (current >= 86) return current
        return Math.min(86, current + (current < 48 ? 6 : 3))
      })
    }, 180)

    return () => window.clearInterval(timer)
  }, [step])

  function openFilePicker() {
    inputRef.current?.click()
  }

  function clearInputValue() {
    if (inputRef.current) inputRef.current.value = ''
  }

  function clearFileAndResult() {
    setFile(null)
    setParseResult(null)
    setParseError(null)
    setParseErrorKind(null)
    setParseProgress(0)
    setAuthRequired(false)
    setSelectedMountainId(null)
    setConfirmResult(null)
    setConfirmError(null)
    setConfirmAuthRequired(false)
    clearInputValue()
  }

  function chooseFile(nextFile: File) {
    setFile(nextFile)
    setParseResult(null)
    setParseError(null)
    setParseErrorKind(null)
    setParseProgress(0)
    setAuthRequired(false)
    setSelectedMountainId(null)
    setConfirmResult(null)
    setConfirmError(null)
    setConfirmAuthRequired(false)

    const validationError = validateFile(nextFile)
    if (validationError) {
      setParseError(validationError.message)
      setParseErrorKind(validationError.kind)
      setStep('upload_error')
      return
    }

    setStep('upload_selected')
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.currentTarget.files?.[0]
    if (nextFile) {
      chooseFile(nextFile)
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    const nextFile = event.dataTransfer.files?.[0]
    if (nextFile) {
      chooseFile(nextFile)
    }
  }

  async function startParsing() {
    if (!file) return

    const validationError = validateFile(file)
    if (validationError) {
      setParseError(validationError.message)
      setParseErrorKind(validationError.kind)
      setStep('upload_error')
      return
    }

    setParseResult(null)
    setParseError(null)
    setParseErrorKind(null)
    setAuthRequired(false)
    setParseProgress(8)
    setStep('upload_parsing')

    const startedAt = Date.now()
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/import/parse', {
        method: 'POST',
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as ParseResponse | null
      const remainingDelay = Math.max(0, PARSING_MIN_DURATION_MS - (Date.now() - startedAt))
      if (remainingDelay > 0) {
        await wait(remainingDelay)
      }

      if (response.status === 401) {
        setAuthRequired(true)
        setParseError('登录后即可解析并保存这条轨迹。')
        setParseErrorKind('auth')
        setStep('upload_error')
        return
      }

      if (!response.ok || !payload?.ok || !payload.parsedData) {
        setParseError(payload?.error ?? '轨迹文件解析失败，请换一个文件重试。')
        setParseErrorKind(getResponseErrorKind(response.status))
        setStep('upload_error')
        return
      }

      setParseProgress(100)
      setParseResult(payload.parsedData)
      setSelectedMountainId(payload.parsedData.suggestedMountain?.id ?? null)
      setStep('preview')
    } catch {
      setParseError('网络暂时不可用，请稍后重试。')
      setParseErrorKind('network')
      setStep('upload_error')
    }
  }

  async function handleConfirm(mountainId?: string) {
    if (!parseResult) return

    const returnStep: ImportStep = mountainId ? 'match' : 'no_match'
    setConfirmError(null)
    setConfirmAuthRequired(false)
    setStep('confirming')

    try {
      const response = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsedData: parseResult,
          mountainId: mountainId || null,
          source: 'track_import',
        }),
      })
      const payload = (await response.json().catch(() => null)) as ConfirmResponse | null

      if (response.status === 401) {
        setConfirmAuthRequired(true)
        setConfirmError('登录后即可生成活动记录。')
        setStep(returnStep)
        return
      }

      if (!response.ok || !payload?.ok || !payload.checkinId) {
        setConfirmError(payload?.error ?? '活动记录暂时没有生成成功，请再试一次。')
        setStep(returnStep)
        return
      }

      setConfirmResult({ checkinId: payload.checkinId })
      setStep('success')
    } catch {
      setConfirmError('网络暂时不可用，请稍后重试。')
      setStep(returnStep)
    }
  }

  function handleBack() {
    if (step === 'entry') {
      router.back()
      return
    }

    if (step === 'upload_empty') {
      clearFileAndResult()
      setStep('entry')
      return
    }

    if (step === 'upload_selected') {
      clearFileAndResult()
      setStep('upload_empty')
      return
    }

    if (step === 'upload_error') {
      clearFileAndResult()
      setStep('upload_empty')
      return
    }

    if (step === 'preview') {
      setStep(file ? 'upload_selected' : 'upload_empty')
      setConfirmError(null)
      setConfirmAuthRequired(false)
      return
    }

    if (step === 'match' || step === 'no_match') {
      setConfirmError(null)
      setConfirmAuthRequired(false)
      setStep('preview')
      return
    }
  }

  function pickAnotherFile() {
    clearFileAndResult()
    setStep('upload_empty')
    window.setTimeout(openFilePicker, 0)
  }

  function renderStep() {
    if (step === 'entry') {
      return (
        <ImportEntry
          onBack={handleBack}
          onUpload={() => setStep('upload_empty')}
          onHelp={() => {
            console.log('Import help will be connected in a later batch.')
          }}
        />
      )
    }

    if (step === 'upload_empty') {
      return <ImportUploadEmpty onBack={handleBack} onPick={openFilePicker} onDrop={handleDrop} />
    }

    if (step === 'upload_selected' && file) {
      return (
        <ImportUploadSelected
          file={file}
          onBack={handleBack}
          onContinue={() => void startParsing()}
          onRemove={() => {
            clearFileAndResult()
            setStep('upload_empty')
          }}
        />
      )
    }

    if (step === 'upload_parsing' && file) {
      return <ImportUploadParsing file={file} progress={parseProgress} onBack={handleBack} />
    }

    if (step === 'upload_error') {
      return (
        <ImportUploadError
          file={file}
          error={parseError ?? '请确认文件来自运动 App 或手表导出的轨迹记录。'}
          errorKind={parseErrorKind}
          authRequired={authRequired}
          onBack={handleBack}
          onRetry={() => void startParsing()}
          onPickAnother={pickAnotherFile}
          onLogin={() => router.push(buildLoginHref())}
        />
      )
    }

    if (step === 'preview') {
      if (!parseResult) {
        return <ImportUploadEmpty onBack={handleBack} onPick={openFilePicker} onDrop={handleDrop} />
      }

      return (
        <ImportPreview
          result={parseResult}
          onBack={handleBack}
          onContinue={() => {
            setConfirmError(null)
            setConfirmAuthRequired(false)
            if (parseResult.suggestedMountain?.id) {
              setSelectedMountainId(parseResult.suggestedMountain.id)
              setStep('match')
              return
            }
            setStep('no_match')
          }}
        />
      )
    }

    if (step === 'match' && parseResult) {
      const suggestedMountainId = parseResult.suggestedMountain?.id ?? null
      return (
        <ImportMatch
          result={parseResult}
          selectedMountainId={selectedMountainId}
          confirmError={confirmError}
          confirmAuthRequired={confirmAuthRequired}
          onSelect={setSelectedMountainId}
          onBack={handleBack}
          onManual={() => {
            setConfirmError(null)
            setConfirmAuthRequired(false)
            setSelectedMountainId(null)
            setStep('no_match')
          }}
          onConfirm={() => {
            const mountainId = selectedMountainId ?? suggestedMountainId
            if (mountainId) {
              void handleConfirm(mountainId)
            }
          }}
          onLogin={() => router.push(buildLoginHref())}
        />
      )
    }

    if (step === 'no_match') {
      return (
        <ImportNoMatch
          confirmError={confirmError}
          confirmAuthRequired={confirmAuthRequired}
          onBack={handleBack}
          onStash={() => void handleConfirm()}
          onSearch={() => {
            console.log('Manual mountain search will be connected in a later batch.')
            void handleConfirm()
          }}
          onLogin={() => router.push(buildLoginHref())}
        />
      )
    }

    if (step === 'confirming') {
      return <ConfirmingScreen />
    }

    if (step === 'success') {
      return (
        <ImportSuccess
          result={parseResult}
          confirmResult={confirmResult}
          onShare={() => {
            console.log('Share editor will be connected in a later batch.')
          }}
          onView={() => {
            if (confirmResult?.checkinId) {
              router.push(`/activity/${confirmResult.checkinId}`)
              return
            }
            router.push('/profile')
          }}
          onAddPhoto={() => {
            console.log('Photo attachment will be connected in a later batch.')
          }}
          onWriteNote={() => {
            console.log('Note editor will be connected in a later batch.')
          }}
        />
      )
    }

    return <ImportUploadEmpty onBack={handleBack} onPick={openFilePicker} onDrop={handleDrop} />
  }

  return (
    <>
      <style>
        {`
          .import-drop-zone:focus-visible {
            outline: var(--space-1) solid color-mix(in srgb, var(--color-primary) 32%, transparent);
            outline-offset: var(--space-1);
          }
          .import-common-issues {
            margin-top: 14px;
          }
          .import-spinner {
            animation: import-spin 880ms linear infinite;
          }
          @keyframes import-spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
      <input
        ref={inputRef}
        aria-label="轨迹文件"
        type="file"
        accept=".gpx,.kml,.fit"
        onChange={handleFileInput}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />
      {renderStep()}
    </>
  )
}
