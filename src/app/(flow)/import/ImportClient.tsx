'use client'

import type { CSSProperties, ChangeEvent, DragEvent, FocusEvent, PointerEvent, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import {
  checkImportMountainDistance,
  IMPORT_MOUNTAIN_DISTANCE_THRESHOLD_METERS,
  IMPORT_MOUNTAIN_OUT_OF_RANGE_MESSAGE,
} from '@/lib/import/mountain-distance-check'
import type { ImportedTrackData, MountainMatch } from '@/lib/import/types'
import type { MountainRequestInput } from '@/lib/mountain-requests'
import ArchiveCreationSuccess from '@/components/activity/ArchiveCreationSuccess'
import Card from '@/components/ui/Card'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import Spinner from '@/components/ui/Spinner'
import { useHelpSheet } from '@/components/help/useHelpSheet'
import { useAppToast } from '@/components/ui/AppToastProvider'
import { buildImprintSourceUrl, buildShareUrlForCheckin } from '@/lib/share-template-intent'
import { buildShareTrackPreview } from '@/lib/share-track-preview'
import type { ShareRenderTemplate } from '@/lib/share-templates/types'
import {
  ArchiveIcon,
  BackIcon,
  CheckIcon,
  MountainIcon,
  SearchIcon,
  ShareIcon,
  WarnIcon,
} from '@/components/ui/Icons'

const IMPORT_MAX_BYTES = 20 * 1024 * 1024
const SUPPORTED_FORMATS = ['gpx', 'kml', 'fit'] as const
const PARSING_MIN_DURATION_MS = 700
const PACE_WARNING_KMH = 15

gsap.registerPlugin(useGSAP)

type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

type ImportStep =
  | 'entry'
  | 'upload_empty'
  | 'upload_selected'
  | 'upload_parsing'
  | 'upload_error'
  | 'preview'
  | 'match'
  | 'select_mountain'
  | 'no_match'
  | 'confirming'
  | 'success'

type SupportedFormat = (typeof SUPPORTED_FORMATS)[number]
type ParseErrorKind = 'unsupported' | 'too_large' | 'auth' | 'file' | 'network'

type ImportDuplicateTrack = {
  existingCheckinId: string
  existingCreatedAt?: string | null
}

type ParseResponse = {
  ok?: boolean
  parsedData?: ImportedTrackData
  duplicateTrack?: ImportDuplicateTrack
  error?: string
}

type ConfirmResponse = {
  ok?: boolean
  checkinId?: string
  code?: string
  duplicateTrack?: ImportDuplicateTrack
  error?: string
}

type ConfirmResult = {
  checkinId: string
}

type SelectableMountain = {
  id: string
  name: string
  distanceMeters?: number
  referencePointSource?: MountainMatch['referencePointSource']
  altitude?: number | null
  province?: string | null
  latitude?: number | null
  longitude?: number | null
}

type MountainSelection =
  | { kind: 'mountain'; mountain: SelectableMountain }
  | { kind: 'unaffiliated' }

type MountainRequestCandidateContext = {
  mountain: SelectableMountain
  distanceMeters?: number | null
  referencePointSource?: MountainMatch['referencePointSource'] | null
}

type MountainSearchResponse = {
  ok?: boolean
  mountains?: Array<{
    id: string
    name: string
    altitude: number | null
    province: string | null
    latitude: number | null
    longitude: number | null
  }>
  error?: string
}

type MountainDistanceNotice =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }

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

function formatDistance(meters?: number | null) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return '--'
  return `${(meters / 1000).toFixed(1)} km`
}

function stripFileExtension(fileName?: string | null) {
  if (!fileName) return null
  const normalized = fileName.trim()
  if (!normalized) return null
  return normalized.replace(/\.[^.]+$/, '') || normalized
}

function getRepresentativeTrackPoint(result: ImportedTrackData) {
  const validPoints = result.trackPoints.filter((point) =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  )
  if (validPoints.length === 0) return null

  const pointsWithElevation = validPoints.filter((point) => typeof point.elevation === 'number' && Number.isFinite(point.elevation))
  if (pointsWithElevation.length > 0) {
    return pointsWithElevation.reduce((best, point) => ((point.elevation ?? -Infinity) > (best.elevation ?? -Infinity) ? point : best))
  }

  return validPoints[0] ?? null
}

function buildMountainRequestPayload(
  result: ImportedTrackData,
  requestSource: MountainRequestInput['requestSource'],
  candidate?: MountainRequestCandidateContext | null
): MountainRequestInput {
  const representativePoint = getRepresentativeTrackPoint(result)
  const candidateDistanceM = candidate?.distanceMeters ?? candidate?.mountain.distanceMeters ?? null
  const referencePointSource = candidate?.referencePointSource ?? candidate?.mountain.referencePointSource ?? null
  const trackName = result.name?.trim() || null
  const fileBaseName = stripFileExtension(result.fileName)

  return {
    requestSource,
    locationName: trackName ?? candidate?.mountain.name ?? fileBaseName,
    latitude: representativePoint?.latitude ?? null,
    longitude: representativePoint?.longitude ?? null,
    altitudeM: typeof representativePoint?.elevation === 'number' ? representativePoint.elevation : (result.maxElevation ?? null),
    province: candidate?.mountain.province ?? null,
    trackName,
    fileName: result.fileName,
    importFormat: result.format,
    candidateMountainId: candidate?.mountain.id ?? null,
    candidateMountainName: candidate?.mountain.name ?? null,
    candidateDistanceM,
    referencePointSource,
    trackContentHash: result.trackContentHash ?? null,
    context: {
      trackPointCount: result.trackPoints.length,
      distanceMeters: result.distanceMeters ?? null,
      durationSeconds: result.durationSeconds ?? null,
      maxElevation: result.maxElevation ?? null,
      minElevation: result.minElevation ?? null,
      elevationGainMeters: result.elevationGainMeters ?? null,
      requestSource,
    },
  }
}

function formatMountainDistanceValidation(distanceMeters?: number | null) {
  return `距离 ${formatDistance(distanceMeters)}`
}

function getMountainDistanceValidation(result: ImportedTrackData, mountain: SelectableMountain) {
  if (typeof mountain.distanceMeters === 'number' && Number.isFinite(mountain.distanceMeters)) {
    return {
      valid: mountain.distanceMeters <= IMPORT_MOUNTAIN_DISTANCE_THRESHOLD_METERS,
      distanceMeters: mountain.distanceMeters,
      thresholdMeters: IMPORT_MOUNTAIN_DISTANCE_THRESHOLD_METERS,
      referencePointSource: mountain.referencePointSource,
    }
  }

  const distanceCheck = checkImportMountainDistance(result.trackPoints, {
    latitude: mountain.latitude ?? null,
    longitude: mountain.longitude ?? null,
  })

  return {
    valid: distanceCheck.valid,
    distanceMeters: distanceCheck.distanceMeters,
    thresholdMeters: distanceCheck.thresholdMeters,
    referencePointSource: distanceCheck.referencePoint?.source,
  }
}

function getOutOfRangeNotice(distanceMeters: number | null) {
  const distanceLabel = typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
    ? `${formatMountainDistanceValidation(distanceMeters)} > 20 公里。`
    : '无法确认这座山与轨迹的距离。'

  return `${distanceLabel}${IMPORT_MOUNTAIN_OUT_OF_RANGE_MESSAGE}`
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

function formatDuplicateDate(isoString?: string | null) {
  if (!isoString) return '之前'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '之前'
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd}`
}

function formatDateInputValue(isoString?: string) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatTimeInputValue(isoString?: string) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function buildLocalIso(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return null
  const date = new Date(`${dateValue}T${timeValue}:00`)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}

function getDurationSeconds(startIso: string, endIso: string) {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return Math.round((end - start) / 1000)
}

function getTimeAdvisories(startIso: string | null, endIso: string | null) {
  const now = Date.now()
  const fiveYearsAgo = new Date(now)
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
  const startMs = startIso ? Date.parse(startIso) : null
  const endMs = endIso ? Date.parse(endIso) : null

  return [
    startMs !== null && startMs < fiveYearsAgo.getTime() ? '时间较早，确认无误？' : '',
    ((startMs !== null && startMs > now) || (endMs !== null && endMs > now)) ? '时间在未来，确认无误？' : '',
  ].filter(Boolean)
}

function getAverageSpeedKmh(result: ImportedTrackData) {
  const distanceMeters = result.distanceMeters
  const durationSeconds = result.durationSeconds
  if (
    typeof distanceMeters !== 'number'
    || !Number.isFinite(distanceMeters)
    || distanceMeters <= 0
    || typeof durationSeconds !== 'number'
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) {
    return null
  }

  return (distanceMeters / 1000) / (durationSeconds / 3600)
}

function needsTimeFallback(result: ImportedTrackData) {
  return !result.startTime
    || !result.endTime
    || typeof result.durationSeconds !== 'number'
    || !Number.isFinite(result.durationSeconds)
}

function getSuggestedCandidates(result: ImportedTrackData) {
  const candidates = result.suggestedCandidates?.length
    ? result.suggestedCandidates
    : result.suggestedMountain
      ? [result.suggestedMountain]
      : []
  const seen = new Set<string>()

  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false
    seen.add(candidate.id)
    return true
  })
}

function toSelectableMountain(match: MountainMatch): SelectableMountain {
  return {
    id: match.id,
    name: match.name,
    distanceMeters: match.distanceMeters,
    referencePointSource: match.referencePointSource,
  }
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
  if (kind === 'unsupported') return '格式不支持'
  if (kind === 'too_large') return '文件过大'
  if (kind === 'auth') return '请先登录'
  if (kind === 'network') return '网络异常'
  return '检查文件'
}

function readImportPayloadError(payload: { error?: unknown } | null | undefined) {
  const raw = payload?.['error']
  return typeof raw === 'string' ? raw : undefined
}

function formatImportParseDisplayError(rawMessage: string | undefined, fileName: string, status: number) {
  if (rawMessage) console.warn('[import] parse failed', rawMessage)
  if (status === 415) return '仅支持 GPX、KML 或 FIT 轨迹文件。'
  if (status === 413) return '轨迹文件不能超过 20MB。'
  if (status === 401) return '登录后即可解析并保存这条轨迹。'
  if (status === 422) {
    return getFileExtension(fileName) === 'kml'
      ? '解析失败：这个 KML 文件中没有找到坐标数据。建议从原平台导出 GPX 格式重试。'
      : '这个文件中没有找到可用轨迹点，请换一个文件重试。'
  }
  return '轨迹文件解析失败，请换一个文件重试。'
}

function formatImportConfirmDisplayError(rawMessage: string | undefined, code: string | undefined) {
  if (rawMessage) console.warn('[import] confirm failed', { code, rawMessage })
  if (code === 'mountain_out_of_range') return IMPORT_MOUNTAIN_OUT_OF_RANGE_MESSAGE
  if (code === 'track_duplicate') return '这份轨迹已经上传过。'
  return '活动记录暂时没有生成成功，请再试一次。'
}

function formatStep(step: number) {
  return String(step).padStart(2, '0')
}

function getVisualStep(step: ImportStep) {
  if (step === 'entry') return 1
  if (step === 'preview') return 3
  if (step === 'match' || step === 'select_mountain' || step === 'no_match') return 4
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

function FlowHeader({
  step,
  total = 4,
  title,
  onBack,
  backDisabled = false,
  entryMotion = false,
}: {
  step: number
  total?: number
  title?: ReactNode
  onBack: () => void
  backDisabled?: boolean
  entryMotion?: boolean
}) {
  return (
    <header style={{ padding: 'var(--space-1) var(--space-4) 14px' }}>
      <div data-import-entry-motion={entryMotion ? 'header' : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          aria-label="返回"
          className="pt-pressable"
          onClick={onBack}
          disabled={backDisabled}
          onPointerDown={backDisabled ? undefined : markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
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
          data-import-entry-motion={entryMotion ? 'title' : undefined}
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
  const isEntryStep = step === 'entry'
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
      <FlowHeader step={getVisualStep(step)} title={title} onBack={onBack} backDisabled={backDisabled} entryMotion={isEntryStep} />
      <main
        className={isEntryStep ? undefined : 'pt-import-step-enter'}
        data-import-motion="step-panel"
        style={{ padding: 'var(--space-2) var(--space-4) 0', minWidth: 0 }}
      >
        {children}
      </main>
      {footer ? <CTAFooter>{footer}</CTAFooter> : null}
    </div>
  )
}

function FormatChip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'recommended' | 'neutral'
}) {
  return (
    <span
      data-import-entry-motion="format-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 30,
        padding: '6px var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        background: tone === 'recommended'
          ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
          : 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
        border: tone === 'recommended'
          ? '1px solid color-mix(in srgb, var(--color-success) 28%, transparent)'
          : '1px solid var(--color-outline)',
        color: tone === 'recommended' ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
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

function FormatGuideRow({
  badge,
  format,
  description,
  recommended = false,
}: {
  badge: string
  format: string
  description: string
  recommended?: boolean
}) {
  return (
    <div
      data-import-entry-motion="format-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '86px minmax(0, 1fr)',
        gap: 'var(--space-3)',
        alignItems: 'center',
      }}
    >
      <FormatChip tone={recommended ? 'recommended' : 'neutral'}>{badge}</FormatChip>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: recommended ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 700,
          }}
        >
          {format}
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
      className="import-drop-zone pt-pressable-hero"
      onClick={onPick}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
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
              className="pt-pressable"
              onClick={onRemove}
              onPointerDown={markPressFallback}
              onPointerUp={clearPressFallback}
              onPointerCancel={clearPressFallback}
              onPointerLeave={clearPressFallback}
              onBlur={clearPressFallback}
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
            transition: 'width var(--motion-fast) var(--ease-standard)',
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
          <PrimaryButton className="pt-pressable-hero" data-import-entry-motion="footer-primary" onClick={onUpload} style={{ width: '100%' }}>
            上传轨迹文件
          </PrimaryButton>
          <button
            data-import-entry-motion="footer-secondary"
            type="button"
            className="pt-pressable"
            onClick={onHelp}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
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
        data-import-entry-motion="description"
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

      <div data-import-entry-motion="format-card" style={{ marginTop: 22 }}>
        <Card>
          <div
            data-import-entry-motion="format-label"
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
          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 12 }}>
            <FormatGuideRow badge="推荐" format="GPX" description="数据最完整，优先从 App / 手表导出" recommended />
            <FormatGuideRow badge="可用" format="KML" description="缺时间数据时，导入后可以补填" />
            <FormatGuideRow badge="可用" format="FIT" description="Garmin / Coros 等手表常用格式" />
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
        data-import-entry-motion="process-label"
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
            data-import-entry-motion="process-row"
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
              data-import-entry-motion="process-number"
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
        <PrimaryButton className="pt-pressable-hero" onClick={onPick} style={{ width: '100%' }}>
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
        <PrimaryButton className="pt-pressable-hero" onClick={onContinue} style={{ width: '100%' }}>
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
            <PrimaryButton className="pt-pressable-hero" onClick={onLogin} style={{ width: '100%' }}>
              去登录
            </PrimaryButton>
          ) : (
            <PrimaryButton className="pt-pressable-hero" onClick={onPickAnother} style={{ width: '100%' }}>
              选择其他文件
            </PrimaryButton>
          )}
          <button
            type="button"
            className="pt-pressable"
            onClick={authRequired ? onPickAnother : onRetry}
            disabled={!file && !authRequired}
            onPointerDown={!file && !authRequired ? undefined : markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
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
  motionIndex,
}: {
  label: string
  value: string
  accent?: boolean
  motionIndex?: number
}) {
  return (
    <div
      data-import-l3-item={typeof motionIndex === 'number' ? 'stat' : undefined}
      style={{
        ...(typeof motionIndex === 'number' ? { '--motion-index': motionIndex } : null),
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
        minWidth: 0,
      } as CSSProperties}
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
          className="pt-pressable"
          onClick={onLogin}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
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

function DistanceValidationNotice({
  notice,
  onRequestMountain,
}: {
  notice: MountainDistanceNotice | null
  onRequestMountain?: () => void
}) {
  if (!notice) return null

  const isError = notice.tone === 'error'

  return (
    <div
      style={{
        marginTop: 'var(--space-3)',
        padding: '10px var(--space-3)',
        borderRadius: 'var(--radius-md)',
        color: isError ? 'var(--color-error)' : 'var(--color-success)',
        background: isError
          ? 'color-mix(in srgb, var(--color-error) 7%, transparent)'
          : 'color-mix(in srgb, var(--color-primary) 9%, transparent)',
        border: isError
          ? '1px solid color-mix(in srgb, var(--color-error) 26%, transparent)'
          : '1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)',
        fontSize: 'var(--font-label-s-size)',
        lineHeight: 1.6,
      }}
    >
      <div>{notice.message}</div>
      {isError && onRequestMountain ? (
        <button
          type="button"
          className="pt-pressable"
          onClick={onRequestMountain}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
          style={{
            marginTop: 'var(--space-2)',
            minHeight: 32,
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
          申请收录山峰
        </button>
      ) : null}
    </div>
  )
}

function ImportWarningCard({
  title,
  children,
  style,
}: {
  title: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        marginTop: 14,
        display: 'grid',
        gridTemplateColumns: '22px minmax(0, 1fr)',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        borderLeft: '3px solid var(--color-warning)',
        background: 'var(--color-surface-variant)',
        ...style,
      }}
    >
      <div style={{ color: 'var(--color-warning)', display: 'grid', placeItems: 'start center', paddingTop: 2 }}>
        <WarnIcon size={18} />
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
            marginTop: 4,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 1.65,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function TimeInputGroup({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
}: {
  label: string
  dateValue: string
  timeValue: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
}) {
  const inputStyle = {
    width: '100%',
    minWidth: 0,
    height: 40,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-outline)',
    background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
    color: 'var(--color-on-surface)',
    font: 'inherit',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    padding: '0 10px',
  }

  return (
    <div>
      <div
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 10,
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 0.85fr)',
          gap: 'var(--space-2)',
          marginTop: 6,
        }}
      >
        <input
          aria-label={`${label}日期`}
          type="date"
          value={dateValue}
          onChange={(event) => onDateChange(event.currentTarget.value)}
          style={inputStyle}
        />
        <input
          aria-label={`${label}时间`}
          type="time"
          value={timeValue}
          onChange={(event) => onTimeChange(event.currentTarget.value)}
          style={inputStyle}
        />
      </div>
    </div>
  )
}

function TimeFallbackEditor({
  result,
  onApply,
  onSkip,
}: {
  result: ImportedTrackData
  onApply: (nextResult: ImportedTrackData) => void
  onSkip: () => void
}) {
  const [startDate, setStartDate] = useState(formatDateInputValue(result.startTime))
  const [startTime, setStartTime] = useState(formatTimeInputValue(result.startTime))
  const [endDate, setEndDate] = useState(formatDateInputValue(result.endTime))
  const [endTime, setEndTime] = useState(formatTimeInputValue(result.endTime))
  const [advisoryMessages, setAdvisoryMessages] = useState<string[]>([])

  function refreshAdvisories(nextStartDate = startDate, nextStartTime = startTime, nextEndDate = endDate, nextEndTime = endTime) {
    setAdvisoryMessages(getTimeAdvisories(
      buildLocalIso(nextStartDate, nextStartTime),
      buildLocalIso(nextEndDate, nextEndTime)
    ))
  }

  const startIso = buildLocalIso(startDate, startTime)
  const endIso = buildLocalIso(endDate, endTime)
  const durationSeconds = startIso && endIso ? getDurationSeconds(startIso, endIso) : null
  const hasAnyInput = !!(startDate || startTime || endDate || endTime)
  const hasPartialInput = hasAnyInput && !(startDate && startTime && endDate && endTime)
  const canApply = !!startIso && !!endIso && durationSeconds !== null

  let validationMessage = ''
  if (hasPartialInput) validationMessage = '需要同时填写出发和结束时间'
  else if (startIso && endIso && durationSeconds === null) validationMessage = '结束时间必须晚于出发时间'

  return (
    <ImportWarningCard title="这个文件没有完整时间记录">
      <div>想给这次山行补上时间吗？留空也可以，时长会保持空白。</div>
      <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <TimeInputGroup
          label="出发时间"
          dateValue={startDate}
          timeValue={startTime}
          onDateChange={(value) => {
            setStartDate(value)
            refreshAdvisories(value, startTime, endDate, endTime)
          }}
          onTimeChange={(value) => {
            setStartTime(value)
            refreshAdvisories(startDate, value, endDate, endTime)
          }}
        />
        <TimeInputGroup
          label="结束时间"
          dateValue={endDate}
          timeValue={endTime}
          onDateChange={(value) => {
            setEndDate(value)
            refreshAdvisories(startDate, startTime, value, endTime)
          }}
          onTimeChange={(value) => {
            setEndTime(value)
            refreshAdvisories(startDate, startTime, endDate, value)
          }}
        />
      </div>
      {validationMessage ? (
        <div style={{ marginTop: 'var(--space-2)', color: 'var(--color-warning)', fontWeight: 700 }}>
          {validationMessage}
        </div>
      ) : null}
      {advisoryMessages.map((message) => (
        <div key={message} style={{ marginTop: 'var(--space-2)', color: 'var(--color-warning)' }}>
          {message}
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)',
        }}
      >
        <button
          type="button"
          className="pt-pressable"
          onClick={onSkip}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
          style={{
            height: 36,
            padding: '0 var(--space-3)',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-outline)',
            background: 'transparent',
            color: 'var(--color-on-surface)',
            font: 'inherit',
            fontSize: 'var(--font-label-s-size)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          跳过
        </button>
        <button
          type="button"
          disabled={!canApply}
          className="pt-pressable"
          onPointerDown={!canApply ? undefined : markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
          onClick={() => {
            if (!startIso || !endIso || durationSeconds === null) return
            onApply({
              ...result,
              startTime: startIso,
              endTime: endIso,
              durationSeconds,
            })
          }}
          style={{
            height: 36,
            padding: '0 var(--space-4)',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-primary)',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            font: 'inherit',
            fontSize: 'var(--font-label-s-size)',
            fontWeight: 800,
            cursor: canApply ? 'pointer' : 'not-allowed',
            opacity: canApply ? 1 : 0.42,
          }}
        >
          应用
        </button>
      </div>
    </ImportWarningCard>
  )
}

function ImportPreview({
  result,
  duplicateTrack,
  timeEditorSkipped,
  onBack,
  onContinue,
  onPickAnother,
  onViewDuplicate,
  onApplyTime,
  onSkipTime,
}: {
  result: ImportedTrackData
  duplicateTrack: ImportDuplicateTrack | null
  timeEditorSkipped: boolean
  onBack: () => void
  onContinue: () => void
  onPickAnother: () => void
  onViewDuplicate: (checkinId: string) => void
  onApplyTime: (nextResult: ImportedTrackData) => void
  onSkipTime: () => void
}) {
  const averageSpeedKmh = getAverageSpeedKmh(result)
  const shouldShowTimeEditor = !duplicateTrack && needsTimeFallback(result) && !timeEditorSkipped
  const shouldShowPaceWarning = typeof averageSpeedKmh === 'number' && averageSpeedKmh > PACE_WARNING_KMH
  const duplicateDateLabel = duplicateTrack ? formatDuplicateDate(duplicateTrack.existingCreatedAt) : ''

  return (
    <ImportScreen
      step="preview"
      title="解析完成"
      onBack={onBack}
      footer={(
        <>
          {duplicateTrack ? (
            <>
              <PrimaryButton className="pt-pressable-hero" onClick={() => onViewDuplicate(duplicateTrack.existingCheckinId)} style={{ width: '100%' }}>
                查看已存在活动
              </PrimaryButton>
              <button
                type="button"
                className="pt-pressable"
                onClick={onPickAnother}
                onPointerDown={markPressFallback}
                onPointerUp={clearPressFallback}
                onPointerCancel={clearPressFallback}
                onPointerLeave={clearPressFallback}
                onBlur={clearPressFallback}
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
                选择其他文件
              </button>
            </>
          ) : (
            <PrimaryButton className="pt-import-l3-cta pt-pressable-hero" onClick={onContinue} style={{ width: '100%' }}>
              继续
            </PrimaryButton>
          )}
        </>
      )}
    >
      {duplicateTrack ? (
        <ImportWarningCard
          title="这份轨迹已经上传过"
          style={{
            marginTop: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
          }}
        >
          该轨迹内容与 {duplicateDateLabel} 的一条活动记录一致。为防止重复留证，这里不会再生成新的活动。
        </ImportWarningCard>
      ) : null}

      <div
        data-import-l3-item="summary"
        style={{
          '--motion-index': 0,
          position: 'relative',
          background: 'var(--color-surface-variant)',
          border: '1px solid var(--color-outline)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        } as CSSProperties}
      >
        <span
          data-import-preview-glow="true"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)',
            boxShadow: '0 0 34px color-mix(in srgb, var(--color-primary) 30%, transparent), inset 0 0 24px color-mix(in srgb, var(--color-primary) 18%, transparent)',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
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
        <PreviewStatTile motionIndex={1} label="距离" value={formatDistance(result.distanceMeters)} />
        <PreviewStatTile motionIndex={2} label="时长" value={formatDuration(result.durationSeconds)} />
        <PreviewStatTile motionIndex={3} label="累计爬升" value={formatElevation(result.elevationGainMeters)} accent />
        <PreviewStatTile motionIndex={4} label="最高点" value={formatElevation(result.maxElevation)} accent />
      </div>

      {shouldShowPaceWarning ? (
        <ImportWarningCard title="数据可能存在异常">
          平均配速{' '}
          <span style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
            {averageSpeedKmh.toFixed(1)} km/h
          </span>{' '}
          高于一般徒步范围（建议 ≤ 15 km/h）。你可以继续提交，但建议先确认时间 / 距离是否准确。
        </ImportWarningCard>
      ) : null}

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

      {shouldShowTimeEditor ? (
        <TimeFallbackEditor result={result} onApply={onApplyTime} onSkip={onSkipTime} />
      ) : null}
    </ImportScreen>
  )
}

function ImportMatch({
  result,
  selectedMountainId,
  selectedMountainName,
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
  selectedMountainName: string | null
  confirmError: string | null
  confirmAuthRequired: boolean
  onSelect: (mountain: SelectableMountain) => void
  onBack: () => void
  onManual: () => void
  onConfirm: () => void
  onLogin: () => void
}) {
  const candidates = getSuggestedCandidates(result)
  const mountain = candidates.find((candidate) => candidate.id === selectedMountainId) ?? candidates[0] ?? null
  const selected = !!mountain?.id && selectedMountainId === mountain.id
  const extraCandidateCount = Math.max(0, candidates.length - 1)

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
          <PrimaryButton className="pt-pressable-hero" onClick={confirmAuthRequired ? onLogin : onConfirm} style={{ width: '100%' }} disabled={!mountain?.id}>
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
        根据轨迹的位置，系统找到了 5 公里内的高置信候选。请确认是哪一座。
      </p>

      {mountain ? (
        <button
          type="button"
          className="pt-pressable-card"
          onClick={() => onSelect(toSelectableMountain(mountain))}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
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
                {selectedMountainName ?? mountain.name}
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
              {formatMountainDistanceValidation(mountain.distanceMeters)}，自动匹配可信
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
        className="pt-pressable-card"
        onClick={onManual}
        onPointerDown={markPressFallback}
        onPointerUp={clearPressFallback}
        onPointerCancel={clearPressFallback}
        onPointerLeave={clearPressFallback}
        onBlur={clearPressFallback}
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
        {extraCandidateCount > 0 ? `还有 ${extraCandidateCount} 个候选 · 换一座山` : '换一座山'}
      </button>
    </ImportScreen>
  )
}

function ImportDetailMountainMatch({
  mountain,
  matched,
  confirmError,
  confirmAuthRequired,
  onBack,
  onPickAnother,
  onConfirm,
  onLogin,
}: {
  mountain: { id: string; name: string }
  matched: boolean
  confirmError: string | null
  confirmAuthRequired: boolean
  onBack: () => void
  onPickAnother: () => void
  onConfirm: () => void
  onLogin: () => void
}) {
  const mismatchMessage = '这条轨迹似乎不在当前山峰附近，请检查后重新导入。'
  const error = matched ? confirmError : mismatchMessage

  return (
    <ImportScreen
      step="match"
      title={matched ? '确认这次山行' : '轨迹与当前山峰不匹配'}
      onBack={onBack}
      footer={(
        <>
          {error ? (
            <p style={{ margin: '0 0 var(--space-2)', color: confirmAuthRequired ? 'var(--color-warning)' : 'var(--color-error)', fontSize: 'var(--font-label-s-size)', lineHeight: 1.5, textAlign: 'center' }}>
              {error}
            </p>
          ) : null}
          {matched ? (
            <PrimaryButton className="pt-pressable-hero" onClick={confirmAuthRequired ? onLogin : onConfirm} style={{ width: '100%' }}>
              {confirmAuthRequired ? '去登录' : '确认并保存'}
            </PrimaryButton>
          ) : (
            <SecondaryButton className="pt-pressable" onClick={onPickAnother} style={{ width: '100%' }}>重新选择轨迹</SecondaryButton>
          )}
        </>
      )}
    >
      <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-m-size)', lineHeight: 1.7 }}>
        这次导入将只关联到当前山峰。
      </p>
      <div
        data-testid="import-detail-mountain-context"
        style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', border: '1px solid var(--color-outline)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-variant)' }}
      >
        <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>当前山峰</div>
        <div style={{ marginTop: 4, color: 'var(--color-on-surface)', fontSize: 'var(--font-title-m-size)', lineHeight: 'var(--font-title-m-line)', fontWeight: 700 }}>{mountain.name}</div>
      </div>
    </ImportScreen>
  )
}

function MountainChoiceRow({
  selected,
  title,
  sub,
  icon,
  onClick,
}: {
  selected: boolean
  title: string
  sub: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="pt-pressable-card"
      onClick={onClick}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
      style={{
        width: '100%',
        minHeight: 56,
        textAlign: 'left',
        padding: '10px var(--space-3)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: selected
          ? 'color-mix(in srgb, var(--color-success) 9%, transparent)'
          : 'var(--color-surface-variant)',
        border: selected
          ? '1px solid color-mix(in srgb, var(--color-success) 36%, transparent)'
          : '1px solid var(--color-outline)',
        borderRadius: 'var(--radius-md)',
        display: 'grid',
        gridTemplateColumns: '20px 34px minmax(0, 1fr)',
        gap: 'var(--space-3)',
        alignItems: 'center',
        color: 'inherit',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 'var(--radius-pill)',
          border: selected ? '5px solid var(--color-success)' : '1.5px solid var(--color-on-surface-variant)',
          background: selected ? 'var(--color-surface)' : 'transparent',
        }}
      />
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 'var(--radius-sm)',
          display: 'grid',
          placeItems: 'center',
          color: selected ? 'var(--color-success)' : 'var(--color-on-surface)',
          background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
          border: '1px solid var(--color-outline)',
        }}
      >
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          {sub}
        </span>
      </span>
    </button>
  )
}

function ImportMountainSelection({
  result,
  initialSelectedMountainId,
  initialSearchOpen = false,
  confirmError,
  confirmAuthRequired,
  onBack,
  onCancel,
  onConfirm,
  onRequestMountain,
  onLogin,
}: {
  result: ImportedTrackData
  initialSelectedMountainId: string | null
  initialSearchOpen?: boolean
  confirmError: string | null
  confirmAuthRequired: boolean
  onBack: () => void
  onCancel: () => void
  onConfirm: (selection: MountainSelection) => void
  onRequestMountain: (payload?: MountainRequestInput) => void
  onLogin: () => void
}) {
  const candidates = getSuggestedCandidates(result).map(toSelectableMountain)
  const initialMountain = candidates.find((candidate) => candidate.id === initialSelectedMountainId) ?? candidates[0] ?? null
  const [selected, setSelected] = useState<MountainSelection | null>(
    initialMountain ? { kind: 'mountain', mountain: initialMountain } : null
  )
  const [searchOpen, setSearchOpen] = useState(initialSearchOpen || candidates.length === 0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SelectableMountain[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [distanceNotice, setDistanceNotice] = useState<MountainDistanceNotice | null>(null)
  const [requestCandidate, setRequestCandidate] = useState<MountainRequestCandidateContext | null>(null)

  useEffect(() => {
    if (!searchOpen) return

    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)

      try {
        const response = await fetch(`/api/mountains/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        const payload = (await response.json().catch(() => null)) as MountainSearchResponse | null

        if (response.status === 401) {
          setSearchResults([])
          setSearchError('登录后可以搜索山峰。')
          return
        }

        if (!response.ok || !payload?.ok) {
          setSearchResults([])
          setSearchError('山峰搜索暂时不可用，请稍后再试。')
          return
        }

        setSearchResults((payload.mountains ?? []).map((mountain) => ({
          id: mountain.id,
          name: mountain.name,
          altitude: mountain.altitude,
          province: mountain.province,
          latitude: mountain.latitude,
          longitude: mountain.longitude,
        })))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        setSearchResults([])
        setSearchError('网络暂时不可用，请稍后再试。')
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false)
        }
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [searchOpen, searchQuery])

  const selectedMountainId = selected?.kind === 'mountain' ? selected.mountain.id : null
  const selectedUnaffiliated = selected?.kind === 'unaffiliated'

  function selectMountain(mountain: SelectableMountain) {
    const validation = getMountainDistanceValidation(result, mountain)
    if (!validation.valid) {
      setSelected(null)
      setRequestCandidate({
        mountain,
        distanceMeters: validation.distanceMeters,
        referencePointSource: validation.referencePointSource,
      })
      setDistanceNotice({
        tone: 'error',
        message: getOutOfRangeNotice(validation.distanceMeters),
      })
      return
    }

    const nextMountain = {
      ...mountain,
      ...(typeof validation.distanceMeters === 'number' ? { distanceMeters: validation.distanceMeters } : {}),
    }

    setSelected({ kind: 'mountain', mountain: nextMountain })
    setRequestCandidate(null)
    if (typeof nextMountain.distanceMeters === 'number') {
      setDistanceNotice({
        tone: 'success',
        message: `${formatMountainDistanceValidation(nextMountain.distanceMeters)}，匹配合理`,
      })
    } else {
      setDistanceNotice(null)
    }
  }

  return (
    <ImportScreen
      step="select_mountain"
      title={(
        <>
          选择关联的山
        </>
      )}
      onBack={onBack}
      footer={(
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            className="pt-pressable"
            onClick={onCancel}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
            style={{
              height: 44,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-outline)',
              background: 'var(--color-surface-variant)',
              color: 'var(--color-on-surface)',
              font: 'inherit',
              fontSize: 'var(--font-label-m-size)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <PrimaryButton
            className="pt-pressable-hero"
            onClick={() => {
              if (selected) onConfirm(selected)
            }}
            disabled={!selected}
            style={{ width: '100%' }}
          >
            确认选择
          </PrimaryButton>
        </div>
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
        可以选择系统候选，也可以搜索其他山峰。没有合适的山时，先保存为未关联山行。
      </p>

      <ConfirmErrorNotice error={confirmError} authRequired={confirmAuthRequired} onLogin={onLogin} />
      <DistanceValidationNotice
        notice={distanceNotice}
        onRequestMountain={requestCandidate
          ? () => onRequestMountain(buildMountainRequestPayload(result, 'import_distance_blocked', requestCandidate))
          : onRequestMountain}
      />

      {candidates.length > 0 ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 'var(--space-4)' }}>
          {candidates.map((candidate) => (
            <MountainChoiceRow
              key={candidate.id}
              selected={selectedMountainId === candidate.id}
              title={candidate.name}
              sub={`${formatMountainDistanceValidation(candidate.distanceMeters)}，匹配合理`}
              icon={<MountainIcon size={17} />}
              onClick={() => selectMountain(candidate)}
            />
          ))}
          {candidates.length >= 5 ? (
            <div
              style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
                textAlign: 'center',
              }}
            >
              更多山峰请用搜索
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          marginTop: candidates.length > 0 ? 'var(--space-4)' : 'var(--space-5)',
          paddingTop: candidates.length > 0 ? 'var(--space-4)' : 0,
          borderTop: candidates.length > 0 ? '1px solid var(--color-outline)' : 'none',
        }}
      >
        <button
          type="button"
          className="pt-pressable-card"
          onClick={() => setSearchOpen((current) => !current)}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
          style={{
            width: '100%',
            minHeight: 48,
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-outline)',
            background: 'color-mix(in srgb, var(--color-on-surface) 2%, transparent)',
            color: 'var(--color-on-surface)',
            font: 'inherit',
            fontSize: 'var(--font-label-m-size)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <SearchIcon size={14} />
          搜索其他山峰
        </button>

        {searchOpen ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
	            <input
	              value={searchQuery}
	              onChange={(event) => {
	                setSearchQuery(event.currentTarget.value)
	                setDistanceNotice(null)
	              }}
              placeholder="输入山峰名称，至少 2 个字"
              aria-label="搜索山峰"
              style={{
                width: '100%',
                height: 44,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-outline)',
                background: 'var(--color-surface-variant)',
                color: 'var(--color-on-surface)',
                padding: '0 var(--space-3)',
                font: 'inherit',
                fontSize: 'var(--font-label-m-size)',
                outline: 'none',
              }}
            />

            {searchLoading ? (
              <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 1.6 }}>
                搜索中…
              </div>
            ) : null}
            {searchError ? (
              <div style={{ color: 'var(--color-warning)', fontSize: 'var(--font-label-s-size)', lineHeight: 1.6 }}>
                {searchError}
              </div>
            ) : null}
            {!searchLoading && !searchError && searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
              <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 1.6 }}>
                没有找到匹配的山峰
              </div>
            ) : null}
            {searchResults.map((mountain) => {
              const selectedDistance = selected?.kind === 'mountain' && selected.mountain.id === mountain.id
                ? selected.mountain.distanceMeters
                : undefined

              return (
                <MountainChoiceRow
                  key={mountain.id}
                  selected={selectedMountainId === mountain.id}
                  title={mountain.name}
                  sub={typeof selectedDistance === 'number'
                    ? `${formatMountainDistanceValidation(selectedDistance)}，匹配合理`
                    : [
                        mountain.province,
                        typeof mountain.altitude === 'number' ? `${mountain.altitude.toLocaleString('en-US')} m` : null,
                        '点击校验距离',
                      ].filter(Boolean).join(' · ') || '山峰资料'}
                  icon={<MountainIcon size={17} />}
                  onClick={() => selectMountain(mountain)}
                />
              )
            })}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-outline)' }}>
        <MountainChoiceRow
          selected={selectedUnaffiliated}
          title="保存为未关联山行"
          sub="先进入档案，之后可以补充关联"
          icon={<ArchiveIcon size={17} />}
          onClick={() => {
            setSelected({ kind: 'unaffiliated' })
            setDistanceNotice(null)
          }}
        />
      </div>
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
      className="pt-pressable-card"
      onClick={onClick}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
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
  onRequestMountain,
  onLogin,
}: {
  confirmError: string | null
  confirmAuthRequired: boolean
  onBack: () => void
  onStash: () => void
  onSearch: () => void
  onRequestMountain: () => void
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
        暂未匹配到山峰，可以选择不关联山峰先生成记录。
      </div>

      <div style={{ padding: '18px var(--space-3) var(--space-1)', textAlign: 'center' }}>
        <RidgeIllustration />
      </div>

      <ConfirmErrorNotice error={confirmError} authRequired={confirmAuthRequired} onLogin={onLogin} />

      <div style={{ display: 'grid', gap: 10, marginTop: 'var(--space-5)' }}>
        <NoMatchOption
          green
          icon={<ArchiveIcon size={18} />}
          title="保存为未关联山行"
          sub="进入档案 · 之后可以补充关联"
          onClick={onStash}
        />
        <NoMatchOption
          icon={<SearchIcon size={18} />}
          title="手动搜索关联山峰"
          sub="你比系统更清楚自己去了哪"
          onClick={onSearch}
        />
        <NoMatchOption
          icon={<MountainIcon size={18} />}
          title="申请收录山峰"
          sub="先查看说明 · 正式收录流程后续开放"
          onClick={onRequestMountain}
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
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Spinner size={44} />
          </div>
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

export default function ImportClient({
  initialTemplate = null,
  returnToImprint = false,
  initialMountainContext = null,
}: {
  initialTemplate?: ShareRenderTemplate | null
  returnToImprint?: boolean
  initialMountainContext?: { id: string; name: string } | null
}) {
  const router = useRouter()
  const motionScopeRef = useRef<HTMLDivElement | null>(null)
  const importMotionTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const { open: openHelpSheet } = useHelpSheet()
  const { showToast, clearToasts } = useAppToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStepState] = useState<ImportStep>('entry')
  const importStepRef = useRef<ImportStep>('entry')
  function setStep(nextStep: ImportStep) {
    importStepRef.current = nextStep
    setStepState(nextStep)
  }
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ImportedTrackData | null>(null)
  const [duplicateTrack, setDuplicateTrack] = useState<ImportDuplicateTrack | null>(null)
  const [timeEditorSkipped, setTimeEditorSkipped] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseErrorKind, setParseErrorKind] = useState<ParseErrorKind | null>(null)
  const [parseProgress, setParseProgress] = useState(0)
  const [authRequired, setAuthRequired] = useState(false)
  const isMountainContextLocked = Boolean(initialMountainContext)
  const [selectedMountainId, setSelectedMountainId] = useState<string | null>(() => initialMountainContext?.id ?? null)
  const [selectedMountainName, setSelectedMountainName] = useState<string | null>(() => initialMountainContext?.name ?? null)
  const [selectionSearchInitiallyOpen, setSelectionSearchInitiallyOpen] = useState(false)
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmAuthRequired, setConfirmAuthRequired] = useState(false)
  const importTrackPreview = useMemo(
    () => buildShareTrackPreview(parseResult?.trackPoints ?? []),
    [parseResult?.trackPoints]
  )

  useGSAP((_context, contextSafe) => {
    const root = motionScopeRef.current
    if (!root) return

    const setImportEntryTerminal = () => {
	      const entryTargets = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-entry-motion]'))
	      if (entryTargets.length > 0) {
	        gsap.set(entryTargets, {
	          autoAlpha: 1,
	          y: 0,
	          scale: 1,
	          clearProps: 'willChange',
	        })
	      }
	    }

    const terminalizeImportEntryIfActive = () => {
      if (importStepRef.current !== 'entry') return
      if (!root.querySelector('[data-import-entry-motion]')) return
      setImportEntryTerminal()
    }

	    const clearImportMotion = () => {
	      importMotionTimelineRef.current?.kill()
	      importMotionTimelineRef.current = null
	      const motionTargets = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-entry-motion], [data-import-l3-item], .pt-import-l3-cta, [data-import-preview-glow]'))
	      if (motionTargets.length > 0) {
	        gsap.set(motionTargets, {
	          clearProps: 'willChange,transform,opacity,visibility',
	        })
	      }
	      terminalizeImportEntryIfActive()
	    }

    const setImportPreviewTerminal = () => {
      const previewTargets = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-l3-item], .pt-import-l3-cta'))
      if (previewTargets.length > 0) gsap.set(previewTargets, { autoAlpha: 1, y: 0, scale: 1, clearProps: 'willChange' })
      const glow = root.querySelector('[data-import-preview-glow]')
      if (glow) gsap.set(glow, { autoAlpha: 0, clearProps: 'willChange' })
    }

    const makeContextSafe = contextSafe ?? ((callback: () => void) => callback)
    let mediaCleanup: (() => void) | null = null
    const runImportMotion = makeContextSafe(() => {
      clearImportMotion()
      mediaCleanup?.()
      mediaCleanup = null
      const mm = gsap.matchMedia()
      mm.add(
        {
          allowMotion: '(prefers-reduced-motion: no-preference)',
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (mediaContext) => {
	          clearImportMotion()
	          const reduceMotion = Boolean(mediaContext.conditions?.reduceMotion)
	          if (step === 'entry') {
	            if (reduceMotion) {
	              setImportEntryTerminal()
	              return () => clearImportMotion()
	            }
	            const enterDuration = parseMotionTokenSeconds(root, '--motion-enter', 320)
	            const fastDuration = parseMotionTokenSeconds(root, '--motion-fast', 180)
	            const pressDuration = parseMotionTokenSeconds(root, '--motion-press', 120)
	            const header = root.querySelector<HTMLElement>('[data-import-entry-motion="header"]')
	            const title = root.querySelector<HTMLElement>('[data-import-entry-motion="title"]')
	            const description = root.querySelector<HTMLElement>('[data-import-entry-motion="description"]')
	            const formatCard = root.querySelector<HTMLElement>('[data-import-entry-motion="format-card"]')
	            const formatRows = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-entry-motion="format-row"]'))
	            const formatBadges = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-entry-motion="format-badge"]'))
	            const processLabel = root.querySelector<HTMLElement>('[data-import-entry-motion="process-label"]')
	            const processRows = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-entry-motion="process-row"]'))
	            const processNumbers = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-entry-motion="process-number"]'))
	            const footerButtons = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-entry-motion="footer-primary"], [data-import-entry-motion="footer-secondary"]'))
	            const footerPrimary = root.querySelector<HTMLElement>('[data-import-entry-motion="footer-primary"]')
	            const timelineTargets = [header, title, description, formatCard, processLabel, footerPrimary, ...formatRows, ...formatBadges, ...processRows, ...processNumbers, ...footerButtons].filter(Boolean)
	            gsap.set(timelineTargets, { willChange: 'transform, opacity' })
	            const timeline = gsap.timeline({
	              defaults: { ease: 'power3.out' },
	              onComplete: () => {
	                setImportEntryTerminal()
	                gsap.set(timelineTargets, { clearProps: 'willChange' })
	              },
	              onInterrupt: terminalizeImportEntryIfActive,
	            })
	            timeline.addLabel('header', 0)
	            if (header) timeline.fromTo(header, { autoAlpha: 0 }, { autoAlpha: 1, duration: fastDuration }, 'header')
	            timeline.addLabel('title', 'header+=0.06')
	            if (title) timeline.fromTo(title, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: enterDuration }, 'title')
	            if (description) timeline.fromTo(description, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: Math.min(0.3, enterDuration) }, 'title+=0.1')
	            timeline.addLabel('formatCard', 'title+=0.2')
	            if (formatCard) timeline.fromTo(formatCard, { autoAlpha: 0, y: 20, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: enterDuration }, 'formatCard')
	            if (formatRows.length > 0) {
	              timeline.fromTo(formatRows, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: Math.min(0.28, enterDuration), stagger: 0.065 }, 'formatCard+=0.12')
	            }
	            if (formatBadges.length > 0) {
	              timeline.fromTo(formatBadges, { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: Math.max(0.18, pressDuration), stagger: 0.065, ease: 'back.out(1.4)' }, 'formatCard+=0.14')
	            }
	            timeline.addLabel('process', 'formatCard+=0.34')
	            if (processLabel) timeline.fromTo(processLabel, { autoAlpha: 0 }, { autoAlpha: 1, duration: fastDuration }, 'process')
	            if (processRows.length > 0) {
	              timeline.fromTo(processRows, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: Math.min(0.28, enterDuration), stagger: 0.075 }, 'process+=0.06')
	            }
	            if (processNumbers.length > 0) {
	              timeline.fromTo(processNumbers, { autoAlpha: 0.42 }, { autoAlpha: 1, duration: Math.min(0.2, fastDuration), stagger: 0.075 }, 'process+=0.08')
	            }
	            timeline.addLabel('footer', 'process+=0.32')
	            if (footerButtons.length > 0) {
	              timeline.fromTo(footerButtons, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: Math.min(0.28, enterDuration), stagger: 0.06 }, 'footer')
	            }
	            if (footerPrimary) {
	              timeline
	                .to(footerPrimary, { scale: 1.03, duration: Math.max(0.16, pressDuration), ease: 'back.out(1.4)' }, 'footer+=0.18')
	                .to(footerPrimary, { scale: 1, duration: Math.max(0.18, pressDuration), ease: 'power3.out' }, 'footer+=0.34')
	            }
	            importMotionTimelineRef.current = timeline
	            return () => clearImportMotion()
	          }

	          if (step === 'preview') {
            if (reduceMotion) {
              setImportPreviewTerminal()
              return () => clearImportMotion()
            }
            const ceremony = parseMotionTokenSeconds(root, '--motion-ceremony', 720)
            const items = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-import-l3-item]'))
            const cta = root.querySelector<HTMLElement>('.pt-import-l3-cta')
            const glow = root.querySelector<HTMLElement>('[data-import-preview-glow]')
            gsap.set(items, { autoAlpha: 0, y: 14, willChange: 'transform, opacity' })
            if (cta) gsap.set(cta, { scale: 1, willChange: 'transform, opacity' })
            if (glow) gsap.set(glow, { autoAlpha: 0, willChange: 'opacity' })
            const timeline = gsap.timeline({
              defaults: { ease: 'power3.out' },
              onComplete: () => {
                gsap.set([items, cta, glow].flat().filter(Boolean), { clearProps: 'willChange' })
              },
            })
            timeline.addLabel('summary', 0)
            if (items[0]) {
              timeline.to(items[0], { autoAlpha: 1, y: 0, duration: Math.min(0.3, ceremony * 0.42) }, 'summary')
            }
            timeline.addLabel('glow', 'summary+=0.08')
            if (glow) {
              timeline
                .to(glow, { autoAlpha: 0.72, duration: 0.2 }, 'glow')
                .to(glow, { autoAlpha: 0.18, duration: 0.28 }, 'glow+=0.2')
            }
            timeline.addLabel('metrics', 'summary+=0.18')
            if (items.length > 1) {
              timeline.to(items.slice(1), { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.055 }, 'metrics')
            }
            timeline.addLabel('cta', 'metrics+=0.26')
            if (cta) {
              timeline
                .to(cta, { scale: 1.04, autoAlpha: 1, duration: 0.16, ease: 'power2.out' }, 'cta')
                .to(cta, { scale: 1, duration: 0.2, ease: 'power3.out' }, 'cta+=0.16')
            }
            importMotionTimelineRef.current = timeline
            return () => clearImportMotion()
          }
          return () => clearImportMotion()
        },
        root,
      )
      mediaCleanup = () => {
        clearImportMotion()
        mm.revert()
      }
    })

    const frame = window.requestAnimationFrame(runImportMotion)
    return () => {
      window.cancelAnimationFrame(frame)
      mediaCleanup?.()
      mediaCleanup = null
      clearImportMotion()
    }
  }, { scope: motionScopeRef, dependencies: [step], revertOnUpdate: true })

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
    setDuplicateTrack(null)
    setTimeEditorSkipped(false)
    setParseError(null)
    setParseErrorKind(null)
    setParseProgress(0)
    setAuthRequired(false)
    setSelectedMountainId(initialMountainContext?.id ?? null)
    setSelectedMountainName(initialMountainContext?.name ?? null)
    setSelectionSearchInitiallyOpen(false)
    setConfirmResult(null)
    setConfirmError(null)
    setConfirmAuthRequired(false)
    clearInputValue()
  }

  function chooseFile(nextFile: File) {
    setFile(nextFile)
    setParseResult(null)
    setDuplicateTrack(null)
    setTimeEditorSkipped(false)
    setParseError(null)
    setParseErrorKind(null)
    setParseProgress(0)
    setAuthRequired(false)
    setSelectedMountainId(initialMountainContext?.id ?? null)
    setSelectedMountainName(initialMountainContext?.name ?? null)
    setSelectionSearchInitiallyOpen(false)
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
    setDuplicateTrack(null)
    setParseError(null)
    setParseErrorKind(null)
    setAuthRequired(false)
    setParseProgress(8)
    setStep('upload_parsing')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const [response] = await Promise.all([
        fetch('/api/import/parse', {
          method: 'POST',
          body: formData,
        }),
        wait(PARSING_MIN_DURATION_MS),
      ])
      const payload = (await response.json().catch(() => null)) as ParseResponse | null

      if (response.status === 401) {
        setAuthRequired(true)
        setParseError('登录后即可解析并保存这条轨迹。')
        setParseErrorKind('auth')
        setStep('upload_error')
        return
      }

      if (!response.ok || !payload?.ok || !payload.parsedData) {
        setParseError(formatImportParseDisplayError(readImportPayloadError(payload), file.name, response.status))
        setParseErrorKind(getResponseErrorKind(response.status))
        setStep('upload_error')
        return
      }

      setParseProgress(100)
      setParseResult(payload.parsedData)
      setDuplicateTrack(payload.duplicateTrack ?? null)
      setTimeEditorSkipped(false)
      setSelectedMountainId(initialMountainContext?.id ?? payload.parsedData.suggestedMountain?.id ?? null)
      setSelectedMountainName(initialMountainContext?.name ?? payload.parsedData.suggestedMountain?.name ?? null)
      setSelectionSearchInitiallyOpen(false)
      setStep('preview')
    } catch {
      setParseError('网络暂时不可用，请稍后重试。')
      setParseErrorKind('network')
      setStep('upload_error')
    }
  }

  async function handleConfirm(mountainId?: string | null, returnStepOverride?: ImportStep, mountainName?: string | null) {
    if (!parseResult) return

    const confirmedMountainId = initialMountainContext?.id ?? mountainId ?? null
    const contextMountainId = initialMountainContext?.id ?? null
    const returnStep: ImportStep = returnStepOverride ?? (confirmedMountainId ? 'match' : 'no_match')
    const confirmedMountainName = confirmedMountainId
      ? (initialMountainContext?.name ?? mountainName ?? selectedMountainName)
      : null
    setConfirmError(null)
    setConfirmAuthRequired(false)
    setStep('confirming')

    try {
      const response = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsedData: parseResult,
          mountainId: confirmedMountainId,
          contextMountainId,
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

      if (response.status === 409 && payload?.code === 'track_duplicate' && payload.duplicateTrack) {
        setDuplicateTrack(payload.duplicateTrack)
        setConfirmError(null)
        setStep('preview')
        return
      }

      if (!response.ok || !payload?.ok || !payload.checkinId) {
        setConfirmError(formatImportConfirmDisplayError(readImportPayloadError(payload), payload?.code))
        setStep(returnStep)
        return
      }

      setSelectedMountainId(confirmedMountainId)
      setSelectedMountainName(confirmedMountainName)
      setConfirmResult({ checkinId: payload.checkinId })
      setStep('success')
    } catch {
      setConfirmError('网络暂时不可用，请稍后重试。')
      setStep(returnStep)
    }
  }

  function handleBack() {
    if (step === 'entry') {
      if (returnToImprint) {
        router.replace(buildImprintSourceUrl(initialTemplate))
        return
      }
      router.replace('/explore')
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

    if (step === 'match' || step === 'select_mountain' || step === 'no_match') {
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

  async function submitMountainRequest(payload: MountainRequestInput) {
    const response = await fetch('/api/mountain-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? 'mountain request failed')
    }
  }

  async function handleRequestMountain(payload?: MountainRequestInput) {
    showToast({
      tone: 'info',
      message: '正在提交您的山峰反馈…',
      durationMs: 12000,
    })
    openHelpSheet('start.mountain-not-listed')

    if (!payload) {
      clearToasts()
      showToast({
        tone: 'success',
        message: '已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放',
        durationMs: 4200,
      })
      return
    }

    try {
      await submitMountainRequest(payload)
      clearToasts()
      showToast({
        tone: 'success',
        message: '已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放',
        durationMs: 4200,
      })
    } catch (error) {
      console.warn('[import] mountain request failed', error)
      clearToasts()
      showToast({
        tone: 'error',
        message: '申请暂时没写入，请稍后重试。',
        durationMs: 4200,
      })
    }
  }

  function renderStep() {
    if (step === 'entry') {
      return (
        <ImportEntry
          onBack={handleBack}
          onUpload={openFilePicker}
          onHelp={() => {
            openHelpSheet('import.export-gpx')
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
          onLogin={() => router.replace(buildLoginHref())}
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
          duplicateTrack={duplicateTrack}
          timeEditorSkipped={timeEditorSkipped}
          onBack={handleBack}
	          onContinue={() => {
	            setConfirmError(null)
	            setConfirmAuthRequired(false)
            if (isMountainContextLocked) {
              setSelectedMountainId(initialMountainContext.id)
              setSelectedMountainName(initialMountainContext.name)
              setSelectionSearchInitiallyOpen(false)
              setStep('match')
              return
            }
            const candidates = getSuggestedCandidates(parseResult)
	            const suggestedMountain = parseResult.suggestedMountain ?? null
	            if (suggestedMountain?.id) {
	              setSelectedMountainId(suggestedMountain.id)
	              setSelectedMountainName(suggestedMountain.name)
	              setSelectionSearchInitiallyOpen(false)
	              setStep('match')
	              return
	            }
	            if (candidates.length > 0) {
	              setSelectedMountainId(candidates[0]?.id ?? null)
	              setSelectedMountainName(candidates[0]?.name ?? null)
	              setSelectionSearchInitiallyOpen(false)
	              setStep('select_mountain')
	              return
	            }
	            setStep('no_match')
          }}
          onPickAnother={pickAnotherFile}
          onViewDuplicate={(checkinId) => {
            router.replace(`/activity/${checkinId}`)
          }}
          onApplyTime={(nextResult) => {
            setParseResult(nextResult)
            setTimeEditorSkipped(false)
          }}
          onSkipTime={() => setTimeEditorSkipped(true)}
        />
      )
    }

	    if (step === 'match' && parseResult) {
	      if (isMountainContextLocked && initialMountainContext) {
            const isCurrentMountainMatched = getSuggestedCandidates(parseResult)
              .some((candidate) => candidate.id === initialMountainContext.id)
            return (
              <ImportDetailMountainMatch
                mountain={initialMountainContext}
                matched={isCurrentMountainMatched}
                confirmError={confirmError}
                confirmAuthRequired={confirmAuthRequired}
                onBack={handleBack}
                onPickAnother={pickAnotherFile}
                onConfirm={() => void handleConfirm(initialMountainContext.id, 'match', initialMountainContext.name)}
                onLogin={() => router.replace(buildLoginHref())}
              />
            )
          }
	      const candidates = getSuggestedCandidates(parseResult)
	      const suggestedMountain = parseResult.suggestedMountain ?? null
	      const suggestedMountainId = suggestedMountain?.id ?? null
	      return (
        <ImportMatch
          result={parseResult}
          selectedMountainId={selectedMountainId}
          selectedMountainName={selectedMountainName}
          confirmError={confirmError}
          confirmAuthRequired={confirmAuthRequired}
          onSelect={(mountain) => {
            setSelectedMountainId(mountain.id)
            setSelectedMountainName(mountain.name)
          }}
	          onBack={handleBack}
          onManual={() => {
            setConfirmError(null)
            setConfirmAuthRequired(false)
            setSelectionSearchInitiallyOpen(false)
            setStep('select_mountain')
          }}
          onConfirm={() => {
            const mountainId = selectedMountainId ?? suggestedMountainId
            if (mountainId) {
              const mountainName = selectedMountainName ?? candidates.find((candidate) => candidate.id === mountainId)?.name ?? suggestedMountain?.name ?? null
              void handleConfirm(mountainId, 'match', mountainName)
            }
          }}
          onLogin={() => router.replace(buildLoginHref())}
        />
      )
    }

    if (step === 'select_mountain' && parseResult) {
      return (
        <ImportMountainSelection
          result={parseResult}
          initialSelectedMountainId={selectedMountainId}
          initialSearchOpen={selectionSearchInitiallyOpen}
          confirmError={confirmError}
          confirmAuthRequired={confirmAuthRequired}
          onBack={handleBack}
          onCancel={() => {
            setConfirmError(null)
            setConfirmAuthRequired(false)
            if (getSuggestedCandidates(parseResult).length > 0) {
              setStep('match')
              return
            }
            setStep('no_match')
          }}
          onConfirm={(selection) => {
            if (selection.kind === 'unaffiliated') {
              void handleConfirm(null, 'select_mountain', null)
              return
            }
            setSelectedMountainId(selection.mountain.id)
            setSelectedMountainName(selection.mountain.name)
            void handleConfirm(selection.mountain.id, 'select_mountain', selection.mountain.name)
          }}
          onRequestMountain={handleRequestMountain}
          onLogin={() => router.replace(buildLoginHref())}
        />
      )
    }

    if (step === 'no_match' && parseResult) {
      return (
        <ImportNoMatch
          confirmError={confirmError}
          confirmAuthRequired={confirmAuthRequired}
          onBack={handleBack}
          onStash={() => void handleConfirm(null, 'no_match', null)}
          onSearch={() => {
            setConfirmError(null)
            setConfirmAuthRequired(false)
            setSelectedMountainId(null)
            setSelectedMountainName(null)
            setSelectionSearchInitiallyOpen(true)
            setStep('select_mountain')
          }}
          onRequestMountain={() => handleRequestMountain(buildMountainRequestPayload(parseResult, 'import_no_match'))}
          onLogin={() => router.replace(buildLoginHref())}
        />
      )
    }

    if (step === 'confirming') {
      return <ConfirmingScreen />
    }

    if (step === 'success') {
      return (
        <div data-import-step="success">
          <ArchiveCreationSuccess
            title={selectedMountainName ?? parseResult?.suggestedMountain?.name ?? '未关联山峰'}
            values={[
              formatDistance(parseResult?.distanceMeters),
              formatDuration(parseResult?.durationSeconds),
              formatElevation(parseResult?.elevationGainMeters),
            ] as const}
            trackPreview={importTrackPreview}
            onShare={() => {
              const shareUrl = buildShareUrlForCheckin({
                checkinId: confirmResult?.checkinId,
                template: initialTemplate,
              })
              if (!shareUrl) {
                showToast({ key: 'action_blocked', message: '活动还没有生成，暂时无法进入分享。' })
                return
              }
              router.replace(shareUrl)
            }}
            onViewArchive={() => {
              if (confirmResult?.checkinId) {
                router.replace(`/activity/${confirmResult.checkinId}`)
                return
              }
              router.replace('/profile')
            }}
          />
        </div>
      )
    }

    return <ImportUploadEmpty onBack={handleBack} onPick={openFilePicker} onDrop={handleDrop} />
  }

  return (
    <div ref={motionScopeRef} data-import-motion-scope="true" style={{ display: 'contents' }}>
      <style>
        {`
          .import-drop-zone:focus-visible {
            outline: var(--space-1) solid color-mix(in srgb, var(--color-primary) 32%, transparent);
            outline-offset: var(--space-1);
          }
          .import-common-issues {
            margin-top: 14px;
          }
          .pt-import-step-enter {
            animation: pt-import-step-enter var(--motion-enter) var(--ease-out) both;
          }
          @keyframes pt-import-step-enter {
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
            .pt-import-step-enter {
              animation: none !important;
              opacity: 1 !important;
              transform: none !important;
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
    </div>
  )
}
