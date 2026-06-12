import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { resolveMeasuredShareAltitude } from '@/lib/share-data'
import {
  isScreenshotRecognitionSource,
  resolveCheckinSource,
  type CheckinSource,
} from '@/lib/trek-utils'
import { getMountainPosterBackgroundImage } from '@/lib/mountain-media'
import { parseCommunityPostPayload } from '@/lib/community'
import { getRandomQuote, IN_PROGRESS_QUOTES, SUMMIT_QUOTES } from '@/lib/sharing-quotes'
import type { ShareAnchorPosition, ShareCardTemplate, ShareRenderMode } from '@/types'

const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1920
const VALID_TEMPLATES: ShareCardTemplate[] = ['trek_snapshot', 'summit_card', 'activity_summary']
const VALID_RENDER_MODES: ShareRenderMode[] = ['photo_composite', 'overlay_only', 'classic_card']

type PreviewBackground = 'none' | 'checker' | 'scenic'

type PosterModel = {
  template: ShareCardTemplate
  mountainName: string
  altitude?: number
  province: string
  username: string
  checkinDate: string
  note: string
  source: CheckinSource
  renderMode: ShareRenderMode
  anchorPosition: ShareAnchorPosition
  previewBackground: PreviewBackground
  coverImageHref?: string | null
  quoteOverride?: { text: string; author: string } | null
  isDemo?: boolean
  metrics?: {
    distanceKm?: number | null
    ascentM?: number | null
    durationSec?: number | null
    pace?: string | null
  } | null
  metricOverrides?: {
    distanceKm?: number | null
    ascentM?: number | null
    durationSec?: number | null
    pace?: string | null
  } | null
}

type TemplateContent = {
  eyebrow: string
  headline?: string
  headlineLabel?: string
  quote: { text: string; author: string }
  spotlight?: { label: string; value: string }
  metrics: Array<{ label: string; value: string }>
  footer: string
  note: string
  routeLabel: string
}

const CLASSIC_QUOTE_SECTION_GAP = 24
const CLASSIC_QUOTE_AUTHOR_GAP = 8
const CLASSIC_QUOTE_FOOTER_GAP = 16
const CLASSIC_QUOTE_AUTHOR_FONT_SIZE = 18
const CLASSIC_QUOTE_AUTHOR_LINE_HEIGHT = 24
const CLASSIC_QUOTE_PANEL_BOTTOM_PADDING = 44
const CLASSIC_QUOTE_PANEL_INNER_TOP_PADDING = 28
const CLASSIC_QUOTE_LABEL_HEIGHT = 21
const CLASSIC_QUOTE_INNER_GAP = 10
const CLASSIC_QUOTE_FOOTER_BRAND_HEIGHT = 20
const CLASSIC_QUOTE_SUMMIT_PANEL_BOTTOM_Y = 1740
const CLASSIC_QUOTE_STORY_PANEL_BOTTOM_Y = 1776
const CLASSIC_QUOTE_SUMMIT_REGION_MAX_HEIGHT = 480
const CLASSIC_QUOTE_STORY_REGION_MAX_HEIGHT = 420
const CLASSIC_QUOTE_MIN_FONT_SIZE = 24
const CLASSIC_QUOTE_MIN_LINE_HEIGHT = 32

type PosterQuote = {
  text: string
  author: string
}

type QuoteTypography = {
  fontSize: number
  lineHeight: number
  maxCharsPerLine: number
}

type ClassicQuoteLayout = {
  lines: string[]
  renderedText: string
  typography: QuoteTypography
  overflowMode: 'fit' | 'truncated'
  contentHeight: number
}

function formatDurationFromSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }

  return `${seconds}s`
}

function deriveDemoMetrics(
  altitude: number,
  overrides?: PosterModel['metricOverrides']
) {
  const derivedDistanceKm = Number(Math.max(4.2, Math.min(26, altitude / 260)).toFixed(1))
  const distanceKm = typeof overrides?.distanceKm === 'number'
    ? Number(Math.max(0, overrides.distanceKm).toFixed(1))
    : derivedDistanceKm
  const ascentM = typeof overrides?.ascentM === 'number'
    ? Math.max(0, Math.round(overrides.ascentM))
    : Math.max(320, Math.round(altitude * 0.68))
  const descentM = Math.max(220, Math.round(ascentM * 0.84))
  const fallbackHours = Math.max(2, Math.min(12, Math.round(altitude / 650)))
  const fallbackMinutes = Math.max(0, Math.min(55, Math.round((distanceKm % 1) * 60)))
  const durationSec =
    typeof overrides?.durationSec === 'number'
      ? Math.max(0, Math.round(overrides.durationSec))
      : fallbackHours * 3600 + fallbackMinutes * 60
  const duration = formatDurationFromSeconds(durationSec)

  return {
    distanceKm,
    ascentM,
    descentM,
    durationSec,
    duration,
    pace:
      overrides?.pace?.trim() ||
      `${String(Math.max(7, 14 - Math.floor(distanceKm / 2))).padStart(2, '0')}:20/km`,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function positiveNumber(value: unknown) {
  return isFiniteNumber(value) && value > 0 ? value : undefined
}

function formatDistanceKm(value: number) {
  return Number(value.toFixed(1)).toLocaleString()
}

function formatAltitudeMeters(value: number) {
  return Math.round(value).toLocaleString()
}

function formatPaceFromDuration(durationSec?: number, distanceKm?: number) {
  const safeDurationSec = positiveNumber(durationSec)
  const safeDistanceKm = positiveNumber(distanceKm)
  if (safeDurationSec == null || safeDistanceKm == null) return undefined
  const secondsPerKm = Math.max(1, Math.round(safeDurationSec / safeDistanceKm))
  const minutes = Math.floor(secondsPerKm / 60)
  const seconds = secondsPerKm % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`
}

function resolvePosterMetrics(model: PosterModel) {
  if (model.isDemo) {
    return deriveDemoMetrics(model.altitude ?? 6250, model.metricOverrides)
  }

  const distanceKm = positiveNumber(model.metrics?.distanceKm)
  const ascentM = positiveNumber(model.metrics?.ascentM)
  const durationSec = positiveNumber(model.metrics?.durationSec)
  const pace = model.metrics?.pace?.trim() || formatPaceFromDuration(durationSec, distanceKm)

  return {
    distanceKm,
    ascentM: typeof ascentM === 'number' ? Math.round(ascentM) : undefined,
    descentM: undefined,
    durationSec,
    duration: typeof durationSec === 'number' ? formatDurationFromSeconds(durationSec) : undefined,
    pace,
  }
}

function escapeSvg(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value
}

function getQuotePool(template: ShareCardTemplate) {
  return template === 'trek_snapshot' ? IN_PROGRESS_QUOTES : SUMMIT_QUOTES
}

function getAllQuotePool() {
  return [...IN_PROGRESS_QUOTES, ...SUMMIT_QUOTES]
}

function resolveQuotePool(template: ShareCardTemplate, poolMode: 'template' | 'all') {
  return poolMode === 'all' ? getAllQuotePool() : getQuotePool(template)
}

function normalizeQuoteIndex(value: string | null, template: ShareCardTemplate, poolMode: 'template' | 'all' = 'template') {
  if (value == null) return null
  const parsed = Number.parseInt(value, 10)
  const pool = resolveQuotePool(template, poolMode)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= pool.length) {
    return null
  }
  return parsed
}

function resolvePosterQuote(template: ShareCardTemplate, quoteIndex: number | null, poolMode: 'template' | 'all' = 'template') {
  if (typeof quoteIndex === 'number') {
    const pool = resolveQuotePool(template, poolMode)
    return pool[quoteIndex] ?? pool[0]
  }

  return getRandomQuote(template !== 'trek_snapshot')
}

function resolveQuoteTypography(text: string): QuoteTypography {
  const length = Array.from(text).length
  if (length < 20) {
    return { fontSize: 40, lineHeight: 52, maxCharsPerLine: 18 }
  }
  if (length <= 40) {
    return { fontSize: 34, lineHeight: 46, maxCharsPerLine: 20 }
  }
  return { fontSize: 28, lineHeight: 38, maxCharsPerLine: 24 }
}

function splitQuoteLines(text: string, maxCharsPerLine: number, maxLines: number) {
  const chars = Array.from(text.trim())
  if (chars.length <= maxCharsPerLine) return [chars.join('')]

  const lines: string[] = []
  let cursor = 0

  while (cursor < chars.length && lines.length < maxLines) {
    const remainingChars = chars.length - cursor
    const remainingLines = maxLines - lines.length
    const nextLineLength = Math.min(
      remainingChars,
      Math.max(maxCharsPerLine, Math.ceil(remainingChars / remainingLines))
    )
    lines.push(chars.slice(cursor, cursor + nextLineLength).join(''))
    cursor += nextLineLength
  }

  return lines
}

function buildQuoteTypographyCandidates(text: string) {
  const preferred = resolveQuoteTypography(text)
  const candidates: QuoteTypography[] = [
    preferred,
    { fontSize: 28, lineHeight: 38, maxCharsPerLine: 24 },
    { fontSize: CLASSIC_QUOTE_MIN_FONT_SIZE, lineHeight: CLASSIC_QUOTE_MIN_LINE_HEIGHT, maxCharsPerLine: 26 },
  ]

  return candidates.filter(
    (candidate, index, pool) =>
      pool.findIndex(
        (current) =>
          current.fontSize === candidate.fontSize &&
          current.lineHeight === candidate.lineHeight &&
          current.maxCharsPerLine === candidate.maxCharsPerLine
      ) === index
  )
}

function fitClassicQuoteLayout(text: string, maxHeight: number): ClassicQuoteLayout {
  const normalizedText = text.trim()

  for (const candidate of buildQuoteTypographyCandidates(normalizedText)) {
    const lines = splitQuoteLines(normalizedText, candidate.maxCharsPerLine, 3)
    const quoteHeight = candidate.fontSize + (lines.length - 1) * candidate.lineHeight
    const contentHeight = quoteHeight + CLASSIC_QUOTE_AUTHOR_GAP + CLASSIC_QUOTE_AUTHOR_LINE_HEIGHT

    if (contentHeight <= maxHeight) {
      return {
        lines,
        renderedText: normalizedText,
        typography: candidate,
        overflowMode: 'fit',
        contentHeight,
      }
    }
  }

  const fallbackTypography = buildQuoteTypographyCandidates(normalizedText).at(-1) ?? {
    fontSize: CLASSIC_QUOTE_MIN_FONT_SIZE,
    lineHeight: CLASSIC_QUOTE_MIN_LINE_HEIGHT,
    maxCharsPerLine: 26,
  }
  const maxChars = fallbackTypography.maxCharsPerLine * 3
  const chars = Array.from(normalizedText)
  const truncatedText =
    chars.length > maxChars
      ? `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`
      : normalizedText
  const lines = splitQuoteLines(truncatedText, fallbackTypography.maxCharsPerLine, 3)
  const quoteHeight = fallbackTypography.fontSize + (lines.length - 1) * fallbackTypography.lineHeight
  const contentHeight = quoteHeight + CLASSIC_QUOTE_AUTHOR_GAP + CLASSIC_QUOTE_AUTHOR_LINE_HEIGHT

  return {
    lines,
    renderedText: truncatedText,
    typography: fallbackTypography,
    overflowMode: truncatedText === normalizedText ? 'fit' : 'truncated',
    contentHeight,
  }
}

function buildClassicQuoteRegion({
  template,
  panelX,
  panelY,
  panelWidth,
  panelBottomY,
  panelRadius,
  panelFill,
  panelStroke,
  textX,
  dataBottomY,
  maxRegionHeight,
  quote,
  label,
  anchor,
}: {
  template: ShareCardTemplate
  panelX: number
  panelY: number
  panelWidth: number
  panelBottomY: number
  panelRadius: number
  panelFill: string
  panelStroke: string
  textX: number
  dataBottomY: number
  maxRegionHeight: number
  quote: PosterQuote
  label?: string
  anchor: 'top' | 'bottom'
}) {
  const topInset = label
    ? CLASSIC_QUOTE_PANEL_INNER_TOP_PADDING + CLASSIC_QUOTE_LABEL_HEIGHT + CLASSIC_QUOTE_INNER_GAP
    : CLASSIC_QUOTE_PANEL_INNER_TOP_PADDING
  const availableContentHeight = Math.min(
    maxRegionHeight,
    Math.max(
      CLASSIC_QUOTE_AUTHOR_LINE_HEIGHT + CLASSIC_QUOTE_AUTHOR_GAP + CLASSIC_QUOTE_MIN_FONT_SIZE,
      panelBottomY -
        CLASSIC_QUOTE_PANEL_BOTTOM_PADDING -
        CLASSIC_QUOTE_FOOTER_BRAND_HEIGHT -
        CLASSIC_QUOTE_FOOTER_GAP -
        topInset -
        panelY
    )
  )
  const layout = fitClassicQuoteLayout(quote.text, availableContentHeight)
  const quoteHeight =
    layout.typography.fontSize + (layout.lines.length - 1) * layout.typography.lineHeight
  const requiredHeight =
    topInset +
    quoteHeight +
    CLASSIC_QUOTE_AUTHOR_GAP +
    CLASSIC_QUOTE_AUTHOR_LINE_HEIGHT +
    CLASSIC_QUOTE_FOOTER_GAP +
    CLASSIC_QUOTE_FOOTER_BRAND_HEIGHT +
    CLASSIC_QUOTE_PANEL_BOTTOM_PADDING
  const resolvedPanelY =
    anchor === 'bottom'
      ? Math.max(dataBottomY + CLASSIC_QUOTE_SECTION_GAP, panelBottomY - requiredHeight)
      : panelY
  const contentTopY = resolvedPanelY + topInset
  const labelY = label ? resolvedPanelY + CLASSIC_QUOTE_PANEL_INNER_TOP_PADDING : null
  const quoteStartY = contentTopY
  const authorY = quoteStartY + quoteHeight + CLASSIC_QUOTE_AUTHOR_GAP
  const footerY = authorY + CLASSIC_QUOTE_AUTHOR_LINE_HEIGHT + CLASSIC_QUOTE_FOOTER_GAP
  const resolvedPanelBottomY =
    anchor === 'top'
      ? Math.min(panelBottomY, footerY + CLASSIC_QUOTE_FOOTER_BRAND_HEIGHT + CLASSIC_QUOTE_PANEL_BOTTOM_PADDING)
      : panelBottomY
  const regionBottomY = authorY + CLASSIC_QUOTE_AUTHOR_LINE_HEIGHT
  const panelHeight = resolvedPanelBottomY - resolvedPanelY

  const quoteLinesMarkup = layout.lines
    .map(
      (line, index) =>
        `<text data-quote-line-index="${index}" x="${textX}" y="${quoteStartY + index * layout.typography.lineHeight}" dominant-baseline="text-before-edge" font-family="Manrope, sans-serif" font-size="${layout.typography.fontSize}" font-weight="700" fill="#F5F7F8">${escapeSvg(line)}</text>`
    )
    .join('')

  return {
    footerY,
    panelBottomY: resolvedPanelBottomY,
    markup: `
      <g
        data-poster-template="${template}"
        data-full-quote="${escapeSvg(quote.text)}"
        data-rendered-quote="${escapeSvg(layout.renderedText)}"
        data-quote-author="${escapeSvg(quote.author)}"
        data-quote-line-count="${layout.lines.length}"
        data-quote-author-gap="${CLASSIC_QUOTE_AUTHOR_GAP}"
        data-author-footer-gap="${CLASSIC_QUOTE_FOOTER_GAP}"
        data-quote-end-y="${quoteStartY + quoteHeight}"
        data-author-y="${authorY}"
        data-footer-y="${footerY}"
        data-footer-brand-y="${footerY}"
        data-data-block-bottom-y="${dataBottomY}"
        data-quote-region-top-y="${resolvedPanelY}"
        data-quote-region-bottom-y="${resolvedPanelBottomY}"
        data-quote-region-height="${panelHeight}"
        data-quote-content-top-y="${quoteStartY}"
        data-quote-content-bottom-y="${regionBottomY}"
        data-quote-content-height="${layout.contentHeight}"
        data-quote-max-height="${availableContentHeight}"
        data-bottom-gap="${POSTER_HEIGHT - resolvedPanelBottomY}"
        data-quote-overflow-mode="${layout.overflowMode}"
      >
        <rect data-quote-panel="true" x="${panelX}" y="${resolvedPanelY}" width="${panelWidth}" height="${panelHeight}" rx="${panelRadius}" fill="${panelFill}" stroke="${panelStroke}" />
        ${label && labelY ? `<text data-quote-label="true" x="${textX}" y="${labelY}" dominant-baseline="text-before-edge" font-family="IBM Plex Mono, monospace" font-size="18" fill="#7EF0B4">${escapeSvg(label)}</text>` : ''}
        ${quoteLinesMarkup}
        <text data-quote-author-text="true" x="${textX}" y="${authorY}" dominant-baseline="text-before-edge" font-family="IBM Plex Mono, monospace" font-size="${CLASSIC_QUOTE_AUTHOR_FONT_SIZE}" fill="rgba(245,247,248,0.66)">${escapeSvg(`— ${quote.author}`)}</text>
      </g>
    `,
  }
}

function formatDateParts(checkinDate: string) {
  const date = new Date(checkinDate)
  if (Number.isNaN(date.getTime())) {
    return {
      dateLabel: '2026.03.19',
      timeLabel: '06:18',
    }
  }

  return {
    dateLabel: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
    timeLabel: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  }
}

function normalizeTemplate(value: string | null): ShareCardTemplate {
  return VALID_TEMPLATES.includes(value as ShareCardTemplate) ? (value as ShareCardTemplate) : 'summit_card'
}

function normalizeRenderMode(value: string | null): ShareRenderMode {
  return VALID_RENDER_MODES.includes(value as ShareRenderMode) ? (value as ShareRenderMode) : 'classic_card'
}

function normalizeAnchorPosition(value: string | null): ShareAnchorPosition {
  return value === 'bottom' ? 'bottom' : 'top'
}

function normalizePreviewBackground(value: string | null): PreviewBackground {
  if (value === 'checker' || value === 'scenic') return value
  return 'none'
}

function toAsciiFilenameSegment(value: string | null | undefined, fallback: string) {
  const normalized = (value ?? '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return normalized || fallback
}

async function renderPngResponse({
  svg,
  cacheControl,
  contentDisposition,
}: {
  svg: string
  cacheControl: string
  contentDisposition?: string
}) {
  try {
    const sharp = (await import('sharp')).default
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const body = Uint8Array.from(png)

    return new Response(body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': cacheControl,
        ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
      },
    })
  } catch (error) {
    console.error('[api/poster] png render failed', error)
    return NextResponse.json(
      { error: 'poster_png_render_failed' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }
}

function headlineFontSize(headline: string) {
  if (headline.length > 14) return 110
  if (headline.length > 11) return 126
  return 144
}

function compactHeadlineFontSize(headline: string) {
  if (headline.length > 14) return 94
  if (headline.length > 11) return 102
  return 112
}

function buildTemplateContent(model: PosterModel): TemplateContent {
  const metrics = resolvePosterMetrics(model)
  const { dateLabel, timeLabel } = formatDateParts(model.checkinDate)
  const cleanNote = truncateText(model.note || '', 66)
  const cleanProvince = truncateText(model.province || '', 18)
  const isHistoricalRecord = model.source === 'historical_photo'
  const isUploadedRecord = model.source === 'track_import' || isScreenshotRecognitionSource(model.source)
  const altitudeLabel = isFiniteNumber(model.altitude) ? `${formatAltitudeMeters(model.altitude)} m` : undefined
  const quote = model.quoteOverride ?? getRandomQuote(model.template !== 'trek_snapshot')
  const noteFallback = {
    trek_snapshot: '途中快照已存档，关键状态清楚可读，适合叠到当下的真实照片上。',
    summit_card: isHistoricalRecord
      ? '这次补签记录已整理成可分享的山行卡片。'
      : isUploadedRecord
        ? '这次上传记录已整理成可分享的山行卡片。'
      : '登顶已完成核验，仪式感和可信证明都被浓缩进这一张卡里。',
    activity_summary: '整段活动已汇总完成，适合做一次完整的活动分享与留档。',
  }[model.template]

  if (model.template === 'trek_snapshot') {
    return {
      eyebrow: 'TREK SNAPSHOT',
      headline: altitudeLabel,
      headlineLabel: altitudeLabel ? '最高海拔' : undefined,
      quote,
      metrics: [
        ...(typeof metrics.distanceKm === 'number'
          ? [{ label: '累计距离', value: `${formatDistanceKm(metrics.distanceKm)} km` }]
          : []),
        ...(typeof metrics.ascentM === 'number'
          ? [{ label: '累计爬升', value: `${metrics.ascentM.toLocaleString()} m` }]
          : []),
        ...(metrics.duration
          ? [{ label: '已记录时长', value: metrics.duration }]
          : model.isDemo
            ? [{ label: '本地时间', value: timeLabel }]
            : []),
      ],
      footer: `${dateLabel} · ${cleanProvince || '当前位置'}`,
      note: cleanNote || noteFallback,
      routeLabel: metrics.duration ? '当前进度' : '途中过线',
    }
  }

  if (model.template === 'activity_summary') {
    return {
      eyebrow: 'ACTIVITY SUMMARY',
      headline: typeof metrics.distanceKm === 'number' ? `${formatDistanceKm(metrics.distanceKm)} km` : undefined,
      headlineLabel: typeof metrics.distanceKm === 'number' ? 'TOTAL DISTANCE' : undefined,
      quote,
      metrics: [
        ...(typeof metrics.ascentM === 'number'
          ? [{ label: '累计爬升', value: `${metrics.ascentM.toLocaleString()} m` }]
          : []),
        ...(metrics.duration ? [{ label: '运动时长', value: metrics.duration }] : []),
        ...(altitudeLabel ? [{ label: '最高海拔', value: altitudeLabel }] : []),
        ...(metrics.pace ? [{ label: '平均配速', value: metrics.pace }] : []),
      ],
      footer: `${dateLabel} · ${truncateText(model.username, 18)}`,
      note: cleanNote || noteFallback,
      routeLabel: '活动轨迹',
    }
  }

  if (isHistoricalRecord) {
    return {
      eyebrow: 'PHOTO RECORD',
      headline: altitudeLabel,
      headlineLabel: altitudeLabel ? '最高海拔' : undefined,
      quote,
      spotlight: { label: '记录时间', value: timeLabel },
      metrics: [
        { label: '记录方式', value: '照片补签' },
        { label: '记录地点', value: cleanProvince || '历史记录' },
      ],
      footer: `${dateLabel} · ${cleanProvince || '历史记录'}`,
      note: cleanNote || noteFallback,
      routeLabel: '照片记录摘要',
    }
  }

  if (isUploadedRecord) {
    return {
      eyebrow: 'UPLOADED RECORD',
      headline: altitudeLabel,
      headlineLabel: altitudeLabel ? '最高海拔' : undefined,
      quote,
      spotlight: { label: '记录时间', value: timeLabel },
      metrics: [
        { label: '记录方式', value: '上传数据' },
        { label: '记录地点', value: cleanProvince || '上传记录' },
      ],
      footer: `${dateLabel} · ${cleanProvince || '上传记录'}`,
      note: cleanNote || noteFallback,
      routeLabel: '上传轨迹摘要',
    }
  }

  return {
    eyebrow: '峰顶荣誉卡',
    headline: altitudeLabel,
    headlineLabel: altitudeLabel ? '最高海拔' : undefined,
    quote,
    spotlight: { label: '登顶时间', value: timeLabel },
    metrics: [
      ...(typeof metrics.ascentM === 'number'
        ? [{ label: '累计爬升', value: `${metrics.ascentM.toLocaleString()} m` }]
        : []),
      ...(metrics.duration ? [{ label: '活动时长', value: metrics.duration }] : []),
    ],
    footer: `${dateLabel} · ${cleanProvince || '山顶已核验'}`,
    note: cleanNote || noteFallback,
    routeLabel: '登顶轨迹证明',
  }
}

function svgShell(content: string, background: PreviewBackground | 'classic') {
  const backdrop = background === 'classic'
    ? `
      <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#classicBg)" />
      <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#classicGlow)" />
    `
    : background === 'checker'
      ? `
        <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="#14181B" />
        <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#checkerboard)" opacity="0.9" />
      `
      : background === 'scenic'
        ? `
          <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#photoSky)" />
          <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#photoVignette)" />
          <circle cx="870" cy="318" r="164" fill="rgba(255,244,206,0.72)" />
          <path d="M0 1200 C120 1090 250 950 390 910 C490 880 562 926 660 884 C760 842 872 706 1080 760 L1080 1920 L0 1920 Z" fill="rgba(35,44,47,0.62)" />
          <path d="M0 1338 C156 1218 302 1130 442 1132 C582 1136 676 1248 788 1248 C902 1248 1002 1168 1080 1118 L1080 1920 L0 1920 Z" fill="rgba(23,29,31,0.84)" />
          <path d="M0 1458 C140 1398 266 1338 398 1370 C536 1402 634 1510 754 1510 C878 1510 976 1424 1080 1362 L1080 1920 L0 1920 Z" fill="rgba(14,18,20,0.92)" />
        `
        : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">
    <defs>
      <linearGradient id="classicBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#20252A" />
        <stop offset="55%" stop-color="#171B1F" />
        <stop offset="100%" stop-color="#121416" />
      </linearGradient>
      <radialGradient id="classicGlow" cx="72%" cy="14%" r="82%">
        <stop offset="0%" stop-color="rgba(110,231,161,0.18)" />
        <stop offset="45%" stop-color="rgba(110,231,161,0.06)" />
        <stop offset="100%" stop-color="rgba(110,231,161,0)" />
      </radialGradient>
      <linearGradient id="glassFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(17,20,22,0.36)" />
        <stop offset="100%" stop-color="rgba(17,20,22,0.16)" />
      </linearGradient>
      <linearGradient id="panelFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(28,32,36,0.92)" />
        <stop offset="100%" stop-color="rgba(16,18,20,0.96)" />
      </linearGradient>
      <linearGradient id="scrimTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(10,12,14,0.66)" />
        <stop offset="60%" stop-color="rgba(10,12,14,0.18)" />
        <stop offset="100%" stop-color="rgba(10,12,14,0)" />
      </linearGradient>
      <linearGradient id="scrimBottom" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(10,12,14,0.72)" />
        <stop offset="56%" stop-color="rgba(10,12,14,0.18)" />
        <stop offset="100%" stop-color="rgba(10,12,14,0)" />
      </linearGradient>
      <linearGradient id="photoSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#304B57" />
        <stop offset="44%" stop-color="#547A78" />
        <stop offset="72%" stop-color="#D8B56B" />
        <stop offset="100%" stop-color="#705637" />
      </linearGradient>
      <linearGradient id="photoVignette" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0.14)" />
        <stop offset="70%" stop-color="rgba(0,0,0,0)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.28)" />
      </linearGradient>
      <linearGradient id="coverTopScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(8,11,12,0.68)" />
        <stop offset="50%" stop-color="rgba(8,11,12,0.22)" />
        <stop offset="100%" stop-color="rgba(8,11,12,0)" />
      </linearGradient>
      <linearGradient id="coverBottomScrim" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(7,9,10,0.92)" />
        <stop offset="54%" stop-color="rgba(7,9,10,0.36)" />
        <stop offset="100%" stop-color="rgba(7,9,10,0.02)" />
      </linearGradient>
      <linearGradient id="panelGlassStrong" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(18,20,22,0.62)" />
        <stop offset="100%" stop-color="rgba(18,20,22,0.28)" />
      </linearGradient>
      <linearGradient id="highlightLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#7EF0B4" />
        <stop offset="100%" stop-color="#2FCC6A" />
      </linearGradient>
      <pattern id="checkerboard" width="64" height="64" patternUnits="userSpaceOnUse">
        <rect width="64" height="64" fill="#1A1F23" />
        <rect width="32" height="32" fill="#22282D" />
        <rect x="32" y="32" width="32" height="32" fill="#22282D" />
      </pattern>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="28" flood-color="rgba(5,8,10,0.45)" />
      </filter>
      <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="rgba(0,0,0,0.36)" />
      </filter>
    </defs>
    ${backdrop}
    ${content}
  </svg>`
}

function buildBrandLockup({ x, y, compact = false }: { x: number; y: number; compact?: boolean }) {
  const iconSize = compact ? 44 : 52
  const wordmarkSize = compact ? 27 : 31
  const textX = x + iconSize + 18
  const baseline = y + Math.round(iconSize * 0.68)

  return `
    <g filter="url(#shadow)">
      <rect
        x="${x}"
        y="${y}"
        width="${iconSize}"
        height="${iconSize}"
        rx="${compact ? 16 : 18}"
        fill="rgba(22,28,30,0.64)"
        stroke="rgba(126,240,180,0.26)"
      />
      <path d="M${x + 10} ${y + iconSize - 12} L${x + 22} ${y + 12} C${x + 23} ${y + 10}, ${x + 26} ${y + 10}, ${x + 27} ${y + 12} L${x + 42} ${y + iconSize - 12}" fill="none" stroke="url(#highlightLine)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M${x + 18} ${y + iconSize - 12} L${x + 27} ${y + 27} C${x + 28} ${y + 24}, ${x + 32} ${y + 24}, ${x + 33} ${y + 27} L${x + 38} ${y + iconSize - 12}" fill="none" stroke="#F5F7F8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      <text x="${textX}" y="${baseline}" font-family="Manrope, sans-serif" font-size="${wordmarkSize}" font-weight="800" fill="#F5F7F8">Peak Trekker</text>
    </g>
  `
}

function buildVerificationBadge({
  x,
  y,
  template,
  source,
}: {
  x: number
  y: number
  template: ShareCardTemplate
  source: CheckinSource
}) {
  const isInProgress = template === 'trek_snapshot'
  const isGpsVerified = source === 'realtime_gps'
  const isHistoricalPhoto = source === 'historical_photo'
  const toneStroke = isInProgress
    ? 'rgba(126,240,180,0.72)'
    : isGpsVerified
      ? 'rgba(126,240,180,0.34)'
      : 'rgba(245,247,248,0.18)'
  const toneFill = isInProgress
    ? '#7EF0B4'
    : isGpsVerified
      ? 'rgba(14,26,22,0.64)'
      : 'rgba(26,28,30,0.64)'
  const toneText = isInProgress ? '#0E1A16' : isGpsVerified ? '#7EF0B4' : '#D9DDE1'
  const secondaryText = isInProgress ? 'rgba(14,26,22,0.74)' : 'rgba(245,247,248,0.62)'
  const iconRingFill = isInProgress ? 'rgba(14,26,22,0.12)' : 'rgba(255,255,255,0.04)'
  const iconAccent = isInProgress ? '#0E1A16' : toneText
  const iconCheck = isInProgress ? '#0E1A16' : '#F5F7F8'
  const secondaryLabel = isInProgress
    ? 'IN PROGRESS'
    : isGpsVerified
      ? 'Certified Summit'
      : isHistoricalPhoto
        ? 'Historical Entry'
        : 'Uploaded Record'
  const primaryLabel = isInProgress
    ? '记录中'
    : isGpsVerified
      ? 'GPS VERIFIED'
      : isHistoricalPhoto
        ? 'PHOTO RECORD'
        : 'UPLOADED'

  return `
    <g filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="324" height="88" rx="34" fill="${toneFill}" stroke="${toneStroke}" />
      <circle cx="${x + 46}" cy="${y + 44}" r="24" fill="${iconRingFill}" stroke="${toneStroke}" />
      <path d="M${x + 34} ${y + 53} L${x + 45} ${y + 31} C${x + 46} ${y + 29}, ${x + 49} ${y + 29}, ${x + 50} ${y + 31} L${x + 61} ${y + 53}" fill="none" stroke="${iconAccent}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M${x + 39} ${y + 48} L${x + 45} ${y + 54} L${x + 55} ${y + 39}" fill="none" stroke="${iconCheck}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      <text x="${x + 82}" y="${y + 34}" font-family="IBM Plex Mono, monospace" font-size="15" fill="${secondaryText}">${secondaryLabel}</text>
      <text x="${x + 82}" y="${y + 63}" font-family="Manrope, sans-serif" font-size="27" font-weight="800" fill="${toneText}">${primaryLabel}</text>
    </g>
  `
}

function buildSummitHonorLockup({ x, y }: { x: number; y: number }) {
  return `
    <g filter="url(#shadow)">
      <text x="${x}" y="${y}" font-family="IBM Plex Mono, monospace" font-size="18" fill="#7EF0B4">SUMMIT VERIFIED</text>
      <rect x="${x}" y="${y + 18}" width="164" height="50" rx="25" fill="rgba(20,44,34,0.58)" stroke="rgba(126,240,180,0.24)" />
      <circle cx="${x + 24}" cy="${y + 43}" r="8" fill="#7EF0B4" />
      <text x="${x + 42}" y="${y + 51}" font-family="Manrope, sans-serif" font-size="26" font-weight="800" fill="#F5F7F8">登顶成功</text>
    </g>
  `
}

function buildHistoricalRecordLockup({ x, y }: { x: number; y: number }) {
  return `
    <g filter="url(#shadow)">
      <text x="${x}" y="${y}" font-family="IBM Plex Mono, monospace" font-size="18" fill="#D9DDE1">PHOTO RECORD</text>
      <rect x="${x}" y="${y + 18}" width="164" height="50" rx="25" fill="rgba(38,42,46,0.58)" stroke="rgba(217,221,225,0.24)" />
      <circle cx="${x + 24}" cy="${y + 43}" r="8" fill="#D9DDE1" />
      <text x="${x + 42}" y="${y + 51}" font-family="Manrope, sans-serif" font-size="26" font-weight="800" fill="#F5F7F8">历史补签</text>
    </g>
  `
}

function buildUploadedRecordLockup({ x, y }: { x: number; y: number }) {
  return `
    <g filter="url(#shadow)">
      <text x="${x}" y="${y}" font-family="IBM Plex Mono, monospace" font-size="18" fill="#D9DDE1">UPLOADED</text>
      <rect x="${x}" y="${y + 18}" width="164" height="50" rx="25" fill="rgba(38,42,46,0.58)" stroke="rgba(217,221,225,0.24)" />
      <circle cx="${x + 24}" cy="${y + 43}" r="8" fill="#D9DDE1" />
      <text x="${x + 42}" y="${y + 51}" font-family="Manrope, sans-serif" font-size="26" font-weight="800" fill="#F5F7F8">上传数据</text>
    </g>
  `
}

function buildFooterBrandSignature({ x, y }: { x: number; y: number }) {
  return `
    <g opacity="0.92" data-footer-brand="true" data-footer-brand-y="${y}">
      <text x="${x}" y="${y}" dominant-baseline="text-before-edge" font-family="IBM Plex Mono, monospace" font-size="17" fill="#7EF0B4">PEAK TREKKER</text>
      <text x="${x + 160}" y="${y}" dominant-baseline="text-before-edge" font-family="IBM Plex Mono, monospace" font-size="17" fill="rgba(245,247,248,0.54)">MOUNTAIN STORY</text>
    </g>
  `
}

function buildFallbackClassicBackground() {
  return `
    <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#photoSky)" />
    <rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#photoVignette)" />
    <circle cx="870" cy="298" r="176" fill="rgba(255,244,206,0.62)" />
    <path d="M0 1210 C116 1086 238 976 390 928 C508 890 590 930 684 890 C800 840 930 716 1080 762 L1080 1920 L0 1920 Z" fill="rgba(40,52,54,0.54)" />
    <path d="M0 1390 C124 1268 284 1148 454 1158 C618 1168 738 1308 878 1294 C954 1286 1014 1248 1080 1194 L1080 1920 L0 1920 Z" fill="rgba(23,31,33,0.82)" />
    <path d="M0 1548 C150 1420 312 1364 470 1398 C634 1434 742 1566 888 1570 C966 1572 1024 1542 1080 1504 L1080 1920 L0 1920 Z" fill="rgba(12,16,18,0.9)" />
    <rect width="${POSTER_WIDTH}" height="620" fill="url(#coverTopScrim)" />
    <rect y="${POSTER_HEIGHT - 860}" width="${POSTER_WIDTH}" height="860" fill="url(#coverBottomScrim)" />
  `
}

function buildClassicBackgroundArt(model: PosterModel) {
  if (model.coverImageHref) {
    return `
      <image href="${escapeSvg(model.coverImageHref)}" x="0" y="0" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" preserveAspectRatio="xMidYMid slice" />
      <rect width="${POSTER_WIDTH}" height="680" fill="url(#coverTopScrim)" />
      <rect y="${POSTER_HEIGHT - 980}" width="${POSTER_WIDTH}" height="980" fill="url(#coverBottomScrim)" />
    `
  }

  return buildFallbackClassicBackground()
}

function buildRouteModule({
  x,
  y,
  width,
  height,
  label,
  transparent,
  caption,
}: {
  x: number
  y: number
  width: number
  height: number
  label: string
  transparent: boolean
  caption?: string
}) {
  const startX = x + 44
  const startY = y + height - 76
  const midX = x + width * 0.38
  const midY = y + height * 0.46
  const peakX = x + width * 0.74
  const peakY = y + height * 0.32
  const endX = x + width - 48
  const endY = y + 84

  return `
    <g filter="url(#shadow)">
      <rect
        x="${x}"
        y="${y}"
        width="${width}"
        height="${height}"
        rx="28"
        fill="${transparent ? 'url(#glassFill)' : 'rgba(255,255,255,0.04)'}"
        stroke="rgba(255,255,255,0.12)"
      />
      <text x="${x + 28}" y="${y + 40}" font-family="IBM Plex Mono, monospace" font-size="20" fill="#D9DDE1">${escapeSvg(label)}</text>
      <path
        d="M ${startX} ${startY}
           C ${x + 124} ${y + height - 152}, ${midX - 40} ${midY + 68}, ${midX} ${midY}
           S ${peakX - 80} ${peakY - 52}, ${peakX} ${peakY}
           S ${endX - 40} ${endY + 44}, ${endX} ${endY}"
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        stroke-width="18"
        stroke-linecap="round"
      />
      <path
        d="M ${startX} ${startY}
           C ${x + 124} ${y + height - 152}, ${midX - 40} ${midY + 68}, ${midX} ${midY}
           S ${peakX - 80} ${peakY - 52}, ${peakX} ${peakY}
           S ${endX - 40} ${endY + 44}, ${endX} ${endY}"
        fill="none"
        stroke="#69E3A1"
        stroke-width="8"
        stroke-linecap="round"
      />
      <circle cx="${startX}" cy="${startY}" r="12" fill="#F5F7F8" />
      <circle cx="${endX}" cy="${endY}" r="14" fill="#22C55E" />
      ${caption ? `<text x="${x + 28}" y="${y + height - 22}" font-family="IBM Plex Mono, monospace" font-size="16" fill="rgba(245,247,248,0.58)">${escapeSvg(caption)}</text>` : ''}
    </g>
  `
}

function buildOverlayMetrics(metrics: TemplateContent['metrics'], x: number, y: number) {
  const visibleMetrics = metrics.slice(0, 3)
  return visibleMetrics
    .map((metric, index) => {
      const cardY = y + index * 104
      return `
        <g filter="url(#shadow)">
          <rect x="${x}" y="${cardY}" width="344" height="84" rx="24" fill="url(#glassFill)" stroke="rgba(255,255,255,0.12)" />
          <text x="${x + 24}" y="${cardY + 36}" font-family="IBM Plex Mono, monospace" font-size="18" fill="rgba(245,247,248,0.74)">${escapeSvg(metric.label)}</text>
          <text x="${x + 24}" y="${cardY + 64}" font-family="Manrope, sans-serif" font-size="30" font-weight="700" fill="#F5F7F8">${escapeSvg(metric.value)}</text>
        </g>
      `
    })
    .join('')
}

function buildCompactMetricChips(metrics: TemplateContent['metrics'], x: number, y: number, width: number) {
  return metrics
    .slice(0, 2)
    .map((metric, index) => {
      const chipWidth = (width - 16) / 2
      const chipX = x + index * (chipWidth + 16)
      return `
        <g filter="url(#shadow)">
          <rect x="${chipX}" y="${y}" width="${chipWidth}" height="84" rx="24" fill="url(#glassFill)" stroke="rgba(255,255,255,0.12)" />
          <text x="${chipX + 22}" y="${y + 34}" font-family="IBM Plex Mono, monospace" font-size="17" fill="rgba(245,247,248,0.72)">${escapeSvg(metric.label)}</text>
          <text x="${chipX + 22}" y="${y + 62}" font-family="Manrope, sans-serif" font-size="28" font-weight="700" fill="#F5F7F8">${escapeSvg(metric.value)}</text>
        </g>
      `
    })
    .join('')
}

function buildMetricProofCard({
  x,
  y,
  width,
  height,
  label,
  headline,
  caption,
  transparent,
}: {
  x: number
  y: number
  width: number
  height: number
  label: string
  headline: string
  caption: string
  transparent: boolean
}) {
  const headlineSize = compactHeadlineFontSize(headline)
  const centerX = x + width / 2
  const headlineY = y + 144

  return `
    <g filter="url(#shadow)">
      <rect
        x="${x}"
        y="${y}"
        width="${width}"
        height="${height}"
        rx="28"
        fill="${transparent ? 'url(#glassFill)' : 'rgba(255,255,255,0.04)'}"
        stroke="rgba(255,255,255,0.12)"
      />
      <text x="${x + 28}" y="${y + 40}" font-family="IBM Plex Mono, monospace" font-size="20" fill="#D9DDE1">${escapeSvg(label)}</text>
      <text x="${centerX}" y="${headlineY}" text-anchor="middle" font-family="Manrope, sans-serif" font-size="${headlineSize}" font-weight="800" fill="#F5F7F8">${escapeSvg(headline)}</text>
      <text x="${x + 28}" y="${y + height - 22}" font-family="IBM Plex Mono, monospace" font-size="16" fill="rgba(245,247,248,0.58)">${escapeSvg(caption)}</text>
    </g>
  `
}

function buildClassicMetrics(metrics: TemplateContent['metrics'], x: number, y: number) {
  return metrics
    .slice(0, 4)
    .map((metric, index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      const cardX = x + column * 240
      const cardY = y + row * 128
      return `
        <rect x="${cardX}" y="${cardY}" width="216" height="108" rx="26" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" />
        <text x="${cardX + 24}" y="${cardY + 38}" font-family="IBM Plex Mono, monospace" font-size="18" fill="rgba(245,247,248,0.72)">${escapeSvg(metric.label)}</text>
        <text x="${cardX + 24}" y="${cardY + 76}" font-family="Manrope, sans-serif" font-size="34" font-weight="700" fill="#F5F7F8">${escapeSvg(metric.value)}</text>
      `
    })
    .join('')
}

function buildOverlaySVG(model: PosterModel) {
  const content = buildTemplateContent(model)
  const title = truncateText(model.mountainName, 14)
  const province = truncateText(model.province || '中国山地', 18)
  const isHistoricalSummitCard = model.template === 'summit_card' && model.source === 'historical_photo'
  const isUploadedSummitCard = model.template === 'summit_card' && (model.source === 'track_import' || isScreenshotRecognitionSource(model.source))
  const previewBackground = model.previewBackground === 'none'
    ? (model.renderMode === 'photo_composite' ? 'scenic' : 'none')
    : model.previewBackground
  const topAnchored = model.anchorPosition === 'top'
  const contentTop = topAnchored ? 88 : 936
  const scrim = topAnchored
    ? `<rect width="${POSTER_WIDTH}" height="980" fill="url(#scrimTop)" />`
    : `<rect y="860" width="${POSTER_WIDTH}" height="1060" fill="url(#scrimBottom)" />`

  if (model.template === 'summit_card') {
    const badgeX = POSTER_WIDTH - 80 - 324
    const hasHero = Boolean(content.headline && content.headlineLabel)
    const titleY = contentTop + 186
    const provinceY = contentTop + 236
    const honorY = contentTop + 280
    const headlineY = contentTop + 560
    const headlineLabelY = contentTop + 616
    const cardY = hasHero ? contentTop + 692 : contentTop + 448
    const cardWidth = 448
    const cardHeight = 272
    const leftCardX = 72
    const rightCardX = 560

    return svgShell(`
      ${scrim}
      ${buildBrandLockup({ x: 80, y: contentTop, compact: true })}
      ${buildVerificationBadge({ x: badgeX, y: contentTop, template: model.template, source: model.source })}

      <g filter="url(#textShadow)">
        <text x="80" y="${titleY}" font-family="Manrope, sans-serif" font-size="92" font-weight="800" fill="#F5F7F8">${escapeSvg(title)}</text>
        <text x="80" y="${provinceY}" font-family="Manrope, sans-serif" font-size="34" fill="rgba(245,247,248,0.84)">${escapeSvg(province)}</text>
        ${isHistoricalSummitCard
          ? buildHistoricalRecordLockup({ x: 80, y: honorY })
          : isUploadedSummitCard
            ? buildUploadedRecordLockup({ x: 80, y: honorY })
            : buildSummitHonorLockup({ x: 80, y: honorY })}
        ${hasHero
          ? `<text x="80" y="${headlineY}" font-family="Manrope, sans-serif" font-size="188" font-weight="800" fill="#F5F7F8">${escapeSvg(content.headline ?? '')}</text>
        <text x="80" y="${headlineLabelY}" font-family="IBM Plex Mono, monospace" font-size="28" fill="rgba(245,247,248,0.76)">${escapeSvg(content.headlineLabel ?? '')}</text>`
          : ''}
      </g>

      <g filter="url(#shadow)">
        <rect x="${leftCardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="30" fill="url(#panelGlassStrong)" stroke="rgba(126,240,180,0.2)" />
        <text x="${leftCardX + 34}" y="${cardY + 44}" font-family="IBM Plex Mono, monospace" font-size="20" fill="rgba(245,247,248,0.64)">${content.spotlight?.label ?? '登顶时间'}</text>
        <text x="${leftCardX + 34}" y="${cardY + 124}" font-family="Manrope, sans-serif" font-size="78" font-weight="800" fill="#F5F7F8">${escapeSvg(content.spotlight?.value ?? '')}</text>
        <text x="${leftCardX + 34}" y="${cardY + 192}" font-family="IBM Plex Mono, monospace" font-size="22" fill="rgba(245,247,248,0.74)">${escapeSvg(content.footer)}</text>
      </g>

      ${buildRouteModule({
        x: rightCardX,
        y: cardY,
        width: cardWidth,
        height: cardHeight,
        label: content.routeLabel,
        transparent: true,
        caption: isHistoricalSummitCard ? 'Photo Record' : isUploadedSummitCard ? 'Uploaded Record' : 'Peak Route',
      })}
    `, previewBackground)
  }

  if (model.renderMode === 'photo_composite' || model.renderMode === 'overlay_only') {
    const hasHero = Boolean(content.headline && content.headlineLabel)
    const badgeX = POSTER_WIDTH - 80 - 324
    const titleY = contentTop + 146
    const provinceY = contentTop + 190
    const heroCardY = contentTop + 236
    const heroCardX = 72
    const heroCardWidth = 452
    const heroCardHeight = 240
    const routeCardX = 556
    const routeCardWidth = 452
    const routeCardHeight = 240
    const supportRowY = heroCardY + heroCardHeight + 24
    const footerY = supportRowY + 128

    return svgShell(`
      ${scrim}
      ${buildBrandLockup({ x: 80, y: contentTop, compact: true })}
      ${buildVerificationBadge({ x: badgeX, y: contentTop, template: model.template, source: model.source })}

      <g filter="url(#textShadow)">
        <text x="80" y="${titleY}" font-family="Manrope, sans-serif" font-size="74" font-weight="800" fill="#F5F7F8">${escapeSvg(title)}</text>
        <text x="80" y="${provinceY}" font-family="Manrope, sans-serif" font-size="28" fill="rgba(245,247,248,0.82)">${escapeSvg(province)}</text>
      </g>

      ${hasHero ? buildMetricProofCard({
        x: heroCardX,
        y: heroCardY,
        width: heroCardWidth,
        height: heroCardHeight,
        label: content.eyebrow,
        headline: content.headline ?? '',
        caption: content.headlineLabel ?? '',
        transparent: true,
      }) : ''}

      ${buildRouteModule({
        x: hasHero ? routeCardX : heroCardX,
        y: heroCardY,
        width: hasHero ? routeCardWidth : heroCardWidth + 32 + routeCardWidth,
        height: routeCardHeight,
        label: content.routeLabel,
        transparent: true,
        caption: 'ROUTE PROOF',
      })}

      ${buildCompactMetricChips(content.metrics, heroCardX, supportRowY, heroCardWidth)}

      <g filter="url(#textShadow)">
        <text x="${heroCardX}" y="${footerY}" font-family="IBM Plex Mono, monospace" font-size="18" fill="rgba(245,247,248,0.68)">${escapeSvg(content.footer)}</text>
      </g>
    `, previewBackground)
  }

  const hasHero = Boolean(content.headline && content.headlineLabel)
  const headlineSize = hasHero ? headlineFontSize(content.headline ?? '') : 0
  const headlineY = contentTop + 320
  const panelY = hasHero ? contentTop + 452 : contentTop + 292

  return svgShell(`
    ${scrim}
    ${buildBrandLockup({ x: 80, y: contentTop, compact: true })}
    ${buildVerificationBadge({ x: POSTER_WIDTH - 80 - 324, y: contentTop, template: model.template, source: model.source })}

    <g filter="url(#textShadow)">
      <text x="80" y="${contentTop + 138}" font-family="Manrope, sans-serif" font-size="76" font-weight="800" fill="#F5F7F8">${escapeSvg(title)}</text>
      <text x="80" y="${contentTop + 182}" font-family="Manrope, sans-serif" font-size="28" fill="rgba(245,247,248,0.82)">${escapeSvg(province)}</text>
      <text x="80" y="${contentTop + 232}" font-family="IBM Plex Mono, monospace" font-size="19" fill="#7EF0B4">${content.eyebrow}</text>
      ${hasHero
        ? `<text x="80" y="${headlineY}" font-family="Manrope, sans-serif" font-size="${headlineSize}" font-weight="800" fill="#F5F7F8">${escapeSvg(content.headline ?? '')}</text>
      <text x="80" y="${headlineY + 44}" font-family="IBM Plex Mono, monospace" font-size="22" fill="rgba(245,247,248,0.72)">${escapeSvg(content.headlineLabel ?? '')}</text>`
        : ''}
    </g>

    ${buildOverlayMetrics(content.metrics, 80, panelY)}
    ${buildRouteModule({
      x: 486,
      y: panelY,
      width: 514,
      height: 286,
      label: content.routeLabel,
      transparent: true,
    })}

    <g filter="url(#textShadow)">
      <text x="80" y="${panelY + 352}" font-family="Manrope, sans-serif" font-size="25" fill="#F5F7F8">${escapeSvg(truncateText(content.note, 42))}</text>
      <text x="80" y="${panelY + 396}" font-family="IBM Plex Mono, monospace" font-size="20" fill="rgba(245,247,248,0.66)">${escapeSvg(content.footer)}</text>
    </g>
  `, previewBackground)
}

function buildClassicSVG(model: PosterModel) {
  const content = buildTemplateContent(model)
  const title = truncateText(model.mountainName, 14)
  const province = truncateText(model.province || '中国山地', 18)
  const hasHero = Boolean(content.headline && content.headlineLabel)
  const headlineSize = hasHero
    ? model.template === 'summit_card'
      ? 188
      : headlineFontSize(content.headline ?? '')
    : 0
  const isHistoricalSummitCard = model.template === 'summit_card' && model.source === 'historical_photo'
  const isUploadedSummitCard = model.template === 'summit_card' && (model.source === 'track_import' || isScreenshotRecognitionSource(model.source))

  if (model.template === 'summit_card') {
    const infoCardY = hasHero ? 764 : 548
    const metricCardY = hasHero ? 1158 : 944
    const metricCardHeight = 112
    const visibleMetricCount = Math.min(content.metrics.length, 4)
    const metricRowCount = Math.ceil(visibleMetricCount / 2)
    const metricsBottomY = metricRowCount > 0
      ? metricCardY + (metricRowCount - 1) * 128 + metricCardHeight
      : metricCardY
    const quoteRegion = buildClassicQuoteRegion({
      template: model.template,
      panelX: 92,
      panelY: metricsBottomY + CLASSIC_QUOTE_SECTION_GAP,
      panelWidth: 896,
      panelBottomY: CLASSIC_QUOTE_SUMMIT_PANEL_BOTTOM_Y,
      panelRadius: 34,
      panelFill: 'rgba(255,255,255,0.03)',
      panelStroke: 'rgba(255,255,255,0.08)',
      textX: 124,
      dataBottomY: metricsBottomY,
      maxRegionHeight: CLASSIC_QUOTE_SUMMIT_REGION_MAX_HEIGHT,
      quote: content.quote,
      anchor: 'top',
    })

    return svgShell(`
      ${buildClassicBackgroundArt(model)}
      ${buildBrandLockup({ x: 84, y: 84 })}
      ${buildVerificationBadge({ x: 672, y: 90, template: model.template, source: model.source })}

      <g filter="url(#textShadow)">
        <text x="84" y="256" font-family="Manrope, sans-serif" font-size="92" font-weight="800" fill="#F5F7F8">${escapeSvg(title)}</text>
        <text x="84" y="308" font-family="Manrope, sans-serif" font-size="34" fill="rgba(245,247,248,0.84)">${escapeSvg(province)}</text>
        ${isHistoricalSummitCard
          ? buildHistoricalRecordLockup({ x: 84, y: 354 })
          : isUploadedSummitCard
            ? buildUploadedRecordLockup({ x: 84, y: 354 })
            : buildSummitHonorLockup({ x: 84, y: 354 })}
        ${hasHero
          ? `<text x="84" y="632" font-family="Manrope, sans-serif" font-size="${headlineSize + 14}" font-weight="800" fill="#F5F7F8">${escapeSvg(content.headline ?? '')}</text>
        <text x="84" y="688" font-family="IBM Plex Mono, monospace" font-size="28" fill="rgba(245,247,248,0.74)">${escapeSvg(content.headlineLabel ?? '')}</text>`
          : ''}
      </g>

      <g filter="url(#shadow)">
        <rect x="72" y="${infoCardY}" width="452" height="292" rx="34" fill="rgba(18,20,22,0.58)" stroke="rgba(126,240,180,0.22)" />
        <text x="106" y="${infoCardY + 46}" font-family="IBM Plex Mono, monospace" font-size="20" fill="rgba(245,247,248,0.66)">${content.spotlight?.label ?? '登顶时间'}</text>
        <text x="106" y="${infoCardY + 136}" font-family="Manrope, sans-serif" font-size="92" font-weight="800" fill="#F5F7F8">${escapeSvg(content.spotlight?.value ?? '')}</text>
        <text x="106" y="${infoCardY + 208}" font-family="IBM Plex Mono, monospace" font-size="22" fill="rgba(245,247,248,0.72)">${escapeSvg(content.footer)}</text>
      </g>

      ${buildRouteModule({
        x: 556,
        y: infoCardY,
        width: 452,
        height: 292,
        label: content.routeLabel,
        transparent: false,
        caption: isHistoricalSummitCard ? 'Photo Record' : isUploadedSummitCard ? 'Uploaded Record' : 'Peak Route',
      })}

      ${buildClassicMetrics(content.metrics, 92, metricCardY)}

      ${quoteRegion.markup}
      ${buildFooterBrandSignature({ x: 124, y: quoteRegion.footerY })}
    `, 'classic')
  }

  const routeBlockBottomY = 1054 + 266
  const storyRegion = buildClassicQuoteRegion({
    template: model.template,
    panelX: 92,
    panelY: routeBlockBottomY + CLASSIC_QUOTE_SECTION_GAP,
    panelWidth: 868,
    panelBottomY: CLASSIC_QUOTE_STORY_PANEL_BOTTOM_Y,
    panelRadius: 34,
    panelFill: 'rgba(255,255,255,0.03)',
    panelStroke: 'rgba(255,255,255,0.08)',
    textX: 124,
    dataBottomY: routeBlockBottomY,
    maxRegionHeight: CLASSIC_QUOTE_STORY_REGION_MAX_HEIGHT,
    quote: content.quote,
    label: 'SHARE STORY',
    anchor: 'bottom',
  })

  return svgShell(`
      ${buildClassicBackgroundArt(model)}
      ${buildBrandLockup({ x: 84, y: 84 })}
    ${buildVerificationBadge({ x: 672, y: 90, template: model.template, source: model.source })}

    <g filter="url(#textShadow)">
      <text x="84" y="246" font-family="Manrope, sans-serif" font-size="78" font-weight="800" fill="#F5F7F8">${escapeSvg(title)}</text>
      <text x="84" y="294" font-family="Manrope, sans-serif" font-size="30" fill="rgba(245,247,248,0.78)">${escapeSvg(province)}</text>
      <text x="84" y="350" font-family="IBM Plex Mono, monospace" font-size="19" fill="#7EF0B4">${content.eyebrow}</text>
      ${hasHero
        ? `<text x="84" y="528" font-family="Manrope, sans-serif" font-size="${headlineSize}" font-weight="800" fill="#F5F7F8">${escapeSvg(content.headline ?? '')}</text>
      <text x="84" y="578" font-family="IBM Plex Mono, monospace" font-size="24" fill="rgba(245,247,248,0.72)">${escapeSvg(content.headlineLabel ?? '')}</text>`
        : ''}
    </g>

    <g filter="url(#shadow)">
      <rect x="56" y="980" width="968" height="836" rx="42" fill="rgba(14,16,18,0.66)" stroke="rgba(255,255,255,0.08)" />
    </g>

    ${buildClassicMetrics(content.metrics, 92, 1054)}
    ${buildRouteModule({
      x: 600,
      y: 1054,
      width: 360,
      height: 266,
      label: content.routeLabel,
      transparent: false,
    })}

    ${storyRegion.markup}
    ${buildFooterBrandSignature({ x: 124, y: storyRegion.footerY })}
  `, 'classic')
}

function buildPosterSVG(model: PosterModel) {
  if (model.renderMode === 'classic_card') {
    return buildClassicSVG(model)
  }

  return buildOverlaySVG(model)
}

async function resolveCoverImageHref(coverImage: string | null | undefined, origin: string) {
  if (!coverImage) return null
  if (coverImage.startsWith('data:image/')) return coverImage

  const source = coverImage.startsWith('http://') || coverImage.startsWith('https://')
    ? coverImage
    : coverImage.startsWith('/')
      ? `${origin}${coverImage}`
      : null

  if (!source) return null

  try {
    const response = await fetch(source, { cache: 'force-cache' })
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function parseNumericSearchParam(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDemoAltitudeSearchParam(value: string | null) {
  if (value === 'none' || value === 'null' || value === 'absent') return undefined
  return parseNumericSearchParam(value) ?? 6250
}

function parseBooleanSearchParam(value: string | null, fallback: boolean) {
  if (value == null) return fallback
  if (value === '1' || value.toLowerCase() === 'true') return true
  if (value === '0' || value.toLowerCase() === 'false') return false
  return fallback
}

function parseDemoSource(value: string | null, verified: boolean): CheckinSource {
  if (
    value === 'realtime_gps' ||
    value === 'historical_photo' ||
    value === 'track_import' ||
    isScreenshotRecognitionSource(value)
  ) {
    return value
  }

  return verified ? 'realtime_gps' : 'historical_photo'
}

type PosterTrekSessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  ascent_m: number | null
  max_altitude_m: number | null
}

const POSTER_TREK_SESSION_SELECT = 'id, started_at, ended_at, distance_m, ascent_m, max_altitude_m'

async function fetchPosterTrekSession(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  sessionId: string,
) {
  const result = await supabase
    .from('trek_sessions')
    .select(POSTER_TREK_SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle()

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    return null
  }

  return (result.data ?? null) as PosterTrekSessionRow | null
}

function secondsBetween(startedAt?: string | null, endedAt?: string | null) {
  if (!startedAt || !endedAt) return undefined
  const started = new Date(startedAt).getTime()
  const ended = new Date(endedAt).getTime()
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) return undefined
  return Math.round((ended - started) / 1000)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const checkinId = searchParams.get('checkinId')
  const template = normalizeTemplate(searchParams.get('template'))
  const renderMode = normalizeRenderMode(searchParams.get('renderMode'))
  const anchorPosition = normalizeAnchorPosition(searchParams.get('anchorPosition'))
  const previewBackground = normalizePreviewBackground(searchParams.get('previewBackground'))
  const quotePoolMode: 'template' | 'all' =
    checkinId === 'demo' && searchParams.get('quotePool') === 'all' ? 'all' : 'template'
  const quoteIndex = normalizeQuoteIndex(searchParams.get('quoteIndex'), template, quotePoolMode)

  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId required' }, { status: 400 })
  }

  const asSvg = searchParams.get('format') === 'svg'

  if (checkinId === 'demo') {
    const demoAltitude = parseDemoAltitudeSearchParam(searchParams.get('altitude'))
    const demoVerified = parseBooleanSearchParam(searchParams.get('verified'), true)
    const demoSource = parseDemoSource(searchParams.get('source'), demoVerified)
    const svg = buildPosterSVG({
      template,
      mountainName: searchParams.get('mountainName') || '四姑娘山',
      altitude: demoAltitude,
      province: searchParams.get('province') || '四川',
      username: searchParams.get('username') || 'PeakTrekker',
      checkinDate: searchParams.get('checkinDate') || new Date().toISOString(),
      note: searchParams.get('note') || '山顶风很大，但这次活动完整记录下来了。',
      source: demoSource,
      renderMode,
      anchorPosition,
      previewBackground,
      coverImageHref: null,
      quoteOverride: resolvePosterQuote(template, quoteIndex, quotePoolMode),
      isDemo: true,
      metricOverrides: {
        distanceKm: parseNumericSearchParam(searchParams.get('distanceKm')),
        ascentM: parseNumericSearchParam(searchParams.get('ascentM')),
        durationSec: parseNumericSearchParam(searchParams.get('durationSec')),
        pace: searchParams.get('pace'),
      },
    })

    if (asSvg) {
      return new NextResponse(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
      })
    }

    return renderPngResponse({
      svg,
      cacheControl: 'no-store',
    })
  }

  const supabase = await createSupabaseServerClient()
  const adminSupabase = createSupabaseAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const checkinSelectVariants = [
    `
      id, user_id, type, source, note, created_at, session_id,
      distance_meters, duration_seconds, elevation_gain_meters, max_elevation_meters,
      mountains(name, province, cover_image, gallery_images, route_preview_image, route_preview_image_url),
      profiles(username)
    `,
    `
      id, user_id, type, source, note, created_at, session_id,
      distance_meters, duration_seconds, elevation_gain_meters, max_elevation_meters,
      mountains(name, province, cover_image),
      profiles(username)
    `,
    `
      id, user_id, type, note, created_at,
      mountains(name, province, cover_image),
      profiles(username)
    `,
  ]

  const checkinResult =
    (await (async () => {
      let lastResult:
        | {
            data: Record<string, unknown> | null
            error: { message?: string | null } | null
          }
        | null = null

      for (const selectClause of checkinSelectVariants) {
        const result = await adminSupabase
          .from('checkins')
          .select(selectClause)
          .eq('id', checkinId)
          .single()

        lastResult = result as {
          data: Record<string, unknown> | null
          error: { message?: string | null } | null
        }

        if (!result.error || !isSchemaCompatibilityErrorMessage(result.error.message)) {
          return result
        }
      }

      return lastResult ?? { data: null, error: null }
    })()) as {
      data: Record<string, unknown> | null
      error: { message?: string | null } | null
    }

  const checkin = checkinResult.data as (Record<string, unknown> & {
    user_id: string
    type: string
    note: string | null
    created_at: string
    session_id?: string | null
    distance_meters?: number | null
    duration_seconds?: number | null
    elevation_gain_meters?: number | null
    max_elevation_meters?: number | null
    mountains: unknown
    profiles: unknown
    source?: string | null
  }) | null
  const error = checkinResult.error

  if (error || !checkin) {
    return NextResponse.json({ error: 'Checkin not found' }, { status: 404 })
  }

  const mountain = checkin.mountains as {
    name?: string
    province?: string
    cover_image?: string | null
    gallery_images?: string[] | null
    route_preview_image?: string | null
    route_preview_image_url?: string | null
  } | null
  const profile = checkin.profiles as { username?: string } | null
  const source = resolveCheckinSource({
    source: checkin.source ?? null,
    type: checkin.type,
  })
  const mountainName = mountain?.name ?? '未知山峰'
  const isOwner = Boolean(user?.id && checkin.user_id === user.id)
  if (!isOwner) {
    const { data: publicPosts } = await adminSupabase
      .from('posts')
      .select('content')
      .eq('checkin_id', checkinId)
      .order('created_at', { ascending: false })
      .limit(10)
    const hasPublicPost = ((publicPosts ?? []) as Array<{ content: string | null }>).some((post) => {
      const parsed = parseCommunityPostPayload({
        content: post.content,
        checkinId,
        sourceType: source,
        mountainName,
      })
      return parsed.status === 'published' && parsed.visibility === 'public'
    })

    if (!hasPublicPost) {
      return NextResponse.json({ error: 'Checkin not found' }, { status: 404 })
    }
  }
  const session = checkin.session_id
    ? await fetchPosterTrekSession(adminSupabase, checkin.session_id)
    : null
  const measuredAltitude = resolveMeasuredShareAltitude(checkin.max_elevation_meters, session?.max_altitude_m)
  const distanceMeters = positiveNumber(checkin.distance_meters) ?? positiveNumber(session?.distance_m)
  const durationSeconds =
    positiveNumber(checkin.duration_seconds) ??
    secondsBetween(session?.started_at, session?.ended_at)
  const elevationGain = positiveNumber(checkin.elevation_gain_meters) ?? positiveNumber(session?.ascent_m)

  const coverImageHref = renderMode === 'classic_card'
    ? await resolveCoverImageHref(getMountainPosterBackgroundImage(mountain ?? {}) ?? null, request.nextUrl.origin)
    : null

  const svg = buildPosterSVG({
    template,
    mountainName,
    altitude: measuredAltitude,
    province: mountain?.province ?? '',
    username: profile?.username ?? '登山者',
    checkinDate: checkin.created_at,
    note: checkin.note ?? '',
    source,
    renderMode,
    anchorPosition,
    previewBackground,
    coverImageHref,
    metrics: {
      distanceKm: typeof distanceMeters === 'number' ? distanceMeters / 1000 : undefined,
      ascentM: elevationGain,
      durationSec: durationSeconds,
    },
  })

  if (asSvg) {
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }

  return renderPngResponse({
    svg,
    cacheControl: 'public, max-age=86400',
    contentDisposition: `attachment; filename="peak-trekker-${toAsciiFilenameSegment(mountain?.name, 'activity')}-${renderMode}.png"`,
  })
}
