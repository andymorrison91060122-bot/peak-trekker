'use client'

import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import IconButton from '@/components/ui/IconButton'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { BackIcon, CheckIcon } from '@/components/ui/Icons'
import {
  createEmptyScreenshotRouteCalibration,
  focusViewportFromBounds,
  mergeSolvedSegments,
  resolveSegment,
  solveLivewireCalibration,
  type CalibrationControlPoint,
  type ScreenshotRouteCalibration,
  type ScreenshotRouteSegment,
  type UnitPoint,
} from '@/lib/screenshot-track/calibration'
import { SCREENSHOT_ROUTE_SHAPE_LIMITS } from '@/lib/screenshot-route-shape'

const SAMPLE_MAX_SIDE = 720
const ROUTE_COLOR = '#6ee7a1'
const LOCK_RETURN_DELAY_MS = 2100
const ZOOM_LEVELS = [1, 1.5, 2, 2.5, 3] as const
const PREVIEW_ASPECT_RATIO = 16 / 10

type WorkerMessage =
  | {
      type: 'ready'
      requestId: number
      version: number
      width: number
      height: number
    }
  | {
      type: 'result'
      requestId: number
      version: number
      result: ReturnType<typeof solveLivewireCalibration>
    }
  | {
      type: 'error'
      requestId: number
      version: number
      message: string
    }

type LoadedImage = {
  src: string
  element: HTMLImageElement
  width: number
  height: number
}

type ViewportState = {
  zoom: number
  centerX: number
  centerY: number
}

type PointerSnapshot = {
  clientX: number
  clientY: number
}

type PinchState = {
  distance: number
  zoom: number
  centerX: number
  centerY: number
}

type PanState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startCenterX: number
  startCenterY: number
  panning: boolean
}

type ScreenshotRouteCalibrationSectionProps = {
  imagePreview: string | null
  calibration: ScreenshotRouteCalibration
  onCalibrationChange: (calibration: ScreenshotRouteCalibration) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function createControlPoint(x: number, y: number): CalibrationControlPoint {
  return {
    id: `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
  }
}

function samePoint(a: UnitPoint, b: UnitPoint) {
  return Math.abs(a.x - b.x) < 0.000001 && Math.abs(a.y - b.y) < 0.000001
}

function provisionalSegment(from: CalibrationControlPoint, to: CalibrationControlPoint, width: number, height: number): ScreenshotRouteSegment {
  const directLengthPx = Math.hypot((to.x - from.x) * width, (to.y - from.y) * height)
  return {
    id: `${from.id}_${to.id}`,
    fromId: from.id,
    toId: to.id,
    from,
    to,
    points: [from, to],
    status: 'low_evidence_straight',
    resolution: 'unresolved',
    metrics: {
      meanEvidence: 0,
      lowEvidenceRatio: 1,
      longestLowRunPx: 0,
      pathLengthPx: Number(directLengthPx.toFixed(1)),
      directLengthPx: Number(directLengthPx.toFixed(1)),
      detourRatio: 1,
      maxCorridorDistancePx: 0,
      corridorPixels: 0,
    },
    cost: null,
    expanded: 0,
    rejectionReasons: [],
    elapsedMs: 0,
  }
}

function buildImmediateSegments(points: CalibrationControlPoint[], currentSegments: ScreenshotRouteSegment[], width: number, height: number) {
  if (points.length < 2) return []
  const currentById = new Map(currentSegments.map((segment) => [segment.id, segment]))
  const nextSegments: ScreenshotRouteSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!
    const to = points[index + 1]!
    const id = `${from.id}_${to.id}`
    const current = currentById.get(id)
    if (current && samePoint(current.from, from) && samePoint(current.to, to)) {
      nextSegments.push(current)
    } else {
      nextSegments.push(provisionalSegment(from, to, width, height))
    }
  }
  return nextSegments
}

type PreviewRoi = {
  x: number
  y: number
  width: number
  height: number
}

function clampRoi(roi: PreviewRoi, width: number, height: number): PreviewRoi {
  const roiWidth = clamp(roi.width, Math.min(width, 1), width)
  const roiHeight = clamp(roi.height, Math.min(height, 1), height)
  return {
    x: clamp(roi.x, 0, Math.max(0, width - roiWidth)),
    y: clamp(roi.y, 0, Math.max(0, height - roiHeight)),
    width: roiWidth,
    height: roiHeight,
  }
}

function expandRoiToAspect(roi: PreviewRoi, width: number, height: number, aspect = PREVIEW_ASPECT_RATIO): PreviewRoi {
  let next = clampRoi(roi, width, height)
  const currentAspect = next.width / Math.max(1, next.height)
  if (currentAspect < aspect) {
    const targetWidth = Math.min(width, next.height * aspect)
    next = { ...next, x: next.x + next.width / 2 - targetWidth / 2, width: targetWidth }
  } else if (currentAspect > aspect) {
    const targetHeight = Math.min(height, next.width / aspect)
    next = { ...next, y: next.y + next.height / 2 - targetHeight / 2, height: targetHeight }
  }
  return clampRoi(next, width, height)
}

function routeBounds(segments: ScreenshotRouteSegment[]) {
  const points = drawableSegments(segments).flatMap((segment) => (
    segment.points.length >= 2 ? segment.points : [segment.from, segment.to]
  ))
  if (points.length === 0) return null
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: 1, minY: 1, maxX: 0, maxY: 0 },
  )
}

function previewRoiForCalibration(calibration: ScreenshotRouteCalibration, width: number, height: number): PreviewRoi {
  const bounds = routeBounds(calibration.segments)
  if (bounds) {
    const routeWidth = Math.max(0.08, bounds.maxX - bounds.minX)
    const routeHeight = Math.max(0.08, bounds.maxY - bounds.minY)
    const pad = Math.max(routeWidth, routeHeight, 0.18) * 0.22
    return expandRoiToAspect({
      x: (bounds.minX - pad) * width,
      y: (bounds.minY - pad) * height,
      width: (routeWidth + pad * 2) * width,
      height: (routeHeight + pad * 2) * height,
    }, width, height)
  }

  const top = height * 0.05
  const bottom = height * 0.62
  return expandRoiToAspect({
    x: 0,
    y: top,
    width,
    height: Math.max(1, bottom - top),
  }, width, height)
}

function routeCenter(calibration: ScreenshotRouteCalibration) {
  const bounds = routeBounds(calibration.segments)
  if (!bounds) return { x: 0.5, y: 0.5 }
  return {
    x: clamp((bounds.minX + bounds.maxX) / 2, 0, 1),
    y: clamp((bounds.minY + bounds.maxY) / 2, 0, 1),
  }
}

function zoomStep(value: number, direction: 1 | -1) {
  const currentIndex = ZOOM_LEVELS.reduce((bestIndex, level, index) => (
    Math.abs(level - value) < Math.abs(ZOOM_LEVELS[bestIndex]! - value) ? index : bestIndex
  ), 0)
  return ZOOM_LEVELS[clamp(currentIndex + direction, 0, ZOOM_LEVELS.length - 1)]!
}

function pathFromUnitPoints(points: UnitPoint[], width: number, height: number) {
  if (points.length === 0) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x * width).toFixed(2)} ${(point.y * height).toFixed(2)}`)
    .join(' ')
}

function directPath(segment: ScreenshotRouteSegment, width: number, height: number) {
  return pathFromUnitPoints([segment.from, segment.to], width, height)
}

function getPointerUnit(event: ReactPointerEvent<SVGSVGElement | SVGCircleElement>, width: number, height: number) {
  const svg = event.currentTarget instanceof SVGSVGElement
    ? event.currentTarget
    : event.currentTarget.ownerSVGElement
  if (svg) {
    const matrix = svg.getScreenCTM()
    if (matrix) {
      const point = svg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const viewBoxPoint = point.matrixTransform(matrix.inverse())
      return {
        x: clamp(viewBoxPoint.x / Math.max(1, width), 0, 1),
        y: clamp(viewBoxPoint.y / Math.max(1, height), 0, 1),
      }
    }
  }

  const rect = svg?.getBoundingClientRect()
  if (!rect) return { x: 0.5, y: 0.5 }
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  }
}

function renderImageToSample(image: LoadedImage) {
  const scale = Math.min(1, SAMPLE_MAX_SIDE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.fillStyle = '#08090a'
  context.fillRect(0, 0, width, height)
  context.drawImage(image.element, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

function useLoadedImage(src: string | null) {
  const [image, setImage] = useState<LoadedImage | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    const next = new Image()
    next.onload = () => {
      if (cancelled) return
      setImage({
        src,
        element: next,
        width: next.naturalWidth || next.width,
        height: next.naturalHeight || next.height,
      })
    }
    next.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  return image?.src === src ? image : null
}

function unresolvedSegment(calibration: ScreenshotRouteCalibration) {
  return calibration.segments.find((segment) => segment.resolution === 'unresolved') ?? null
}

function genuineBreakSegment(calibration: ScreenshotRouteCalibration) {
  return calibration.segments.find((segment) => (
    segment.resolution === 'unresolved' &&
    segment.status === 'honest_gap' &&
    segment.rejectionReasons.includes('physical_break_high_confidence')
  )) ?? null
}

function drawableSegments(segments: ScreenshotRouteSegment[]) {
  return segments.filter((segment) => segment.resolution !== 'accepted_gap' && (segment.points.length > 0 || segment.resolution === 'unresolved'))
}

function confirmUserShapeSegments(segments: ScreenshotRouteSegment[]) {
  return segments.map((segment) => (
    segment.resolution === 'unresolved' ? resolveSegment(segment, 'user_confirmed_shape') : segment
  ))
}

function ToolGlyph({ children }: { children: ReactNode }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

function EyeGlyph({ hidden }: { hidden?: boolean }) {
  return (
    <ToolGlyph>
      <path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      {hidden ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
    </ToolGlyph>
  )
}

function RetraceGlyph() {
  return (
    <ToolGlyph>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </ToolGlyph>
  )
}

function ZoomGlyph() {
  return (
    <ToolGlyph>
      <circle cx="10.5" cy="10.5" r="5.7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 15l4.5 4.5M10.5 8v5M8 10.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </ToolGlyph>
  )
}

function ZoomOutGlyph() {
  return (
    <ToolGlyph>
      <circle cx="10.5" cy="10.5" r="5.7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 15l4.5 4.5M8 10.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </ToolGlyph>
  )
}

function EditorToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        border: active ? '1px solid var(--color-success)' : '1px solid var(--color-outline)',
        background: active ? 'var(--color-success)' : 'rgba(255,255,255,.05)',
        color: active ? '#08120d' : 'var(--color-on-surface)',
        cursor: 'pointer',
        backdropFilter: 'blur(14px)',
        display: 'grid',
        placeItems: 'center',
        padding: 0,
        transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
      }}
    >
      {children}
    </button>
  )
}

function CoachCopy({
  calibration,
  solving,
  locked,
}: {
  calibration: ScreenshotRouteCalibration
  solving: boolean
  locked: boolean
}) {
  if (locked) {
    return {
      title: '路线已锁定',
      body: '线条已经整理好，正在返回确认页。',
      action: null,
    }
  }

  if (calibration.controlPoints.length === 0) {
    return {
      title: '轻点路线起点',
      body: '在截图里的真实轨迹上点一下起点，再点终点。系统只帮你吸线，你来确认形状。',
      action: '从起点开始',
    }
  }

  if (calibration.controlPoints.length === 1) {
    return {
      title: '再点一个终点',
      body: '有了起点后，再点线路终点。需要转弯处可以继续补点。',
      action: '继续点选',
    }
  }

  const unresolved = unresolvedSegment(calibration)
  if (unresolved) {
    if (unresolved.status === 'needs_more_anchor') {
      return {
        title: '在这一段加个点',
        body: '也可以直接确认当前形状。补一个点时，线会重新整理得更贴近截图。',
        action: '加个点',
      }
    }
    if (unresolved.status === 'honest_gap') {
      return {
        title: '保留当前形状',
        body: '这条线由你点出的路线决定。确认后会整理成干净的品牌绿线。',
        action: null,
      }
    }
    return {
      title: '继续塑形',
      body: '绿线会优先贴近截图轨迹；证据弱的地方会保持你点出的清晰连接。',
      action: null,
    }
  }

  return {
    title: solving ? '正在吸附' : '线条已整理好',
    body: solving ? '正在把相邻控制点之间的线吸到截图轨迹上。' : '确认后会整理成一条干净的品牌绿线，截图本身只作校准底图。',
    action: null,
  }
}

function CalibrationLineLayer({
  segments,
  locked,
  width,
  height,
  zoom,
}: {
  segments: ScreenshotRouteSegment[]
  locked: boolean
  width: number
  height: number
  zoom: number
}) {
  const minDim = Math.min(width, height)
  const baseStroke = clamp(minDim * 0.013, 9, 20) / Math.max(1, zoom)
  return (
    <g>
      {segments.map((segment) => {
        if (segment.resolution === 'accepted_gap') return null

        const unresolved = segment.resolution === 'unresolved'
        const d = unresolved ? directPath(segment, width, height) : pathFromUnitPoints(segment.points, width, height)
        if (!d) return null
        const strokeWidth = unresolved ? baseStroke * 0.84 : locked ? baseStroke * 1.25 : baseStroke

        return (
          <g key={segment.id}>
            <path
              data-route-line="true"
              data-route-line-stroke-width={strokeWidth}
              d={d}
              fill="none"
              stroke={ROUTE_COLOR}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={unresolved ? '12 8' : undefined}
              opacity={unresolved ? 0.82 : 0.96}
              filter="url(#routeGlow)"
              style={{
                transition: 'opacity 180ms ease, stroke-width 220ms ease',
              }}
            />
          </g>
        )
      })}
    </g>
  )
}

function ControlPointsLayer({
  points,
  activeId,
  locked,
  width,
  height,
  zoom,
  cssPxToSvgUnit,
  onPointerDown,
}: {
  points: CalibrationControlPoint[]
  activeId: string | null
  locked: boolean
  width: number
  height: number
  zoom: number
  cssPxToSvgUnit: number
  onPointerDown: (event: ReactPointerEvent<SVGCircleElement>, id: string) => void
}) {
  if (locked) return null
  const minDim = Math.min(width, height)
  const pointRadius = clamp(minDim * 0.023, 17, 34) / Math.max(1, zoom)
  const activeRadius = pointRadius * 1.28
  const strokeWidth = 3 / Math.max(1, zoom)
  const activeStrokeWidth = 4 / Math.max(1, zoom)
  const hitRadius = Math.max(22 * cssPxToSvgUnit, activeRadius + 8 / Math.max(1, zoom))

  return (
    <g>
      {points.map((point, index) => {
        const isEnd = index === points.length - 1 && points.length > 1
        const isActive = activeId === point.id
        return (
          <g key={point.id}>
            <circle
              data-route-control-point="true"
              data-route-control-point-index={index}
              cx={point.x * width}
              cy={point.y * height}
              r={isActive ? activeRadius : pointRadius}
              fill={isEnd ? ROUTE_COLOR : '#0b0f0d'}
              stroke={ROUTE_COLOR}
              strokeWidth={isActive ? activeStrokeWidth : strokeWidth}
              pointerEvents="none"
              style={{
                transition: 'r 140ms ease, filter 180ms ease',
              }}
            />
            {!isEnd ? (
              <circle
                cx={point.x * width}
                cy={point.y * height}
                r={Math.max(4 / Math.max(1, zoom), pointRadius * 0.32)}
                fill={ROUTE_COLOR}
                pointerEvents="none"
              />
            ) : null}
            <circle
              data-route-control-point-hit="true"
              data-route-control-point-hit-index={index}
              cx={point.x * width}
              cy={point.y * height}
              r={hitRadius}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'grab' }}
              onPointerDown={(event) => onPointerDown(event, point.id)}
            />
          </g>
        )
      })}
    </g>
  )
}

function RouteEntryCard({
  imagePreview,
  image,
  calibration,
  onOpen,
}: {
  imagePreview: string | null
  image: LoadedImage | null
  calibration: ScreenshotRouteCalibration
  onOpen: () => void
}) {
  const hasUserLine = drawableSegments(calibration.segments).length > 0
  const previewWidth = calibration.imageSize?.width ?? image?.width ?? 9
  const previewHeight = calibration.imageSize?.height ?? image?.height ?? 16
  const previewRoi = previewRoiForCalibration(calibration, previewWidth, previewHeight)
  const previewZoom = Math.max(1, previewWidth / previewRoi.width, previewHeight / previewRoi.height)
  const previewViewBox = `${previewRoi.x.toFixed(2)} ${previewRoi.y.toFixed(2)} ${previewRoi.width.toFixed(2)} ${previewRoi.height.toFixed(2)}`

  return (
    <section
      data-screenshot-route-calibration="true"
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
        padding: 'var(--space-4)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-m-size)',
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 700,
            }}
          >
            截图路线 · 可校准
          </h2>
          <p
            style={{
              margin: 'var(--space-1) 0 0',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 1.45,
            }}
          >
            调整轨迹线路，符合你的真实徒步轨迹
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          style={{
            appearance: 'none',
            border: '1px solid color-mix(in srgb, var(--color-success) 42%, transparent)',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
            color: 'var(--color-success)',
            minHeight: 40,
            padding: '0 14px',
            fontSize: 'var(--font-label-m-size)',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          校准轨迹
        </button>
      </div>

      <button
        type="button"
        onClick={onOpen}
        style={{
          appearance: 'none',
          width: '100%',
          marginTop: 'var(--space-3)',
          padding: 0,
          border: '1px solid var(--color-outline)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          overflow: 'hidden',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ position: 'relative', aspectRatio: `${PREVIEW_ASPECT_RATIO}`, maxHeight: 260, background: 'var(--color-surface-elevated)' }}>
          {imagePreview ? (
            <svg
              viewBox={previewViewBox}
              preserveAspectRatio="xMidYMid slice"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              aria-hidden="true"
            >
              <defs>
                <filter id="routeGlowCard" x="-35%" y="-35%" width="170%" height="170%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect x={previewRoi.x} y={previewRoi.y} width={previewRoi.width} height={previewRoi.height} fill="#08090a" />
              <image
                href={imagePreview}
                x={0}
                y={0}
                width={previewWidth}
                height={previewHeight}
                opacity="0.34"
                style={{ filter: 'saturate(.38) brightness(.42) contrast(.82)' }}
              />
              {hasUserLine ? (
                <g filter="url(#routeGlowCard)">
                  <CalibrationLineLayer segments={calibration.segments} locked={false} width={previewWidth} height={previewHeight} zoom={previewZoom} />
                </g>
              ) : null}
            </svg>
          ) : null}
          <div
            style={{
              position: 'absolute',
              left: 12,
              bottom: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-label-s-size)',
              fontWeight: 700,
              background: 'rgba(8,10,12,.62)',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 'var(--radius-sm)',
              padding: '7px 9px',
              backdropFilter: 'blur(10px)',
            }}
          >
            <ZoomGlyph />
            <span>点击查看完整截图轨迹</span>
          </div>
        </div>
      </button>
    </section>
  )
}

function HonestGapSheet({
  onConnect,
  onKeepGap,
}: {
  onConnect: () => void
  onKeepGap: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9,
        display: 'flex',
        alignItems: 'flex-end',
        background: 'rgba(8,10,12,.5)',
        backdropFilter: 'blur(2px)',
        animation: 'calibrationFadeUp 180ms ease both',
      }}
      onClick={onConnect}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--color-surface)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderTop: '1px solid var(--color-outline)',
          padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 22px)',
          boxShadow: '0 -16px 40px rgba(0,0,0,.4)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ width: 38, height: 4, borderRadius: 99, background: 'var(--color-outline)', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-on-surface)' }}>这段轨迹是断开的</div>
        <div style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginTop: 8 }}>
          有一段没有足够的轨迹信息 · 我们不会替你猜一条连线。可以保留这个断点，也可以回去自己连接。
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <SecondaryButton onClick={onConnect}>去连接</SecondaryButton>
          <PrimaryButton onClick={onKeepGap} style={{ flex: 1 }}>保留断点，继续</PrimaryButton>
        </div>
      </div>
    </div>
  )
}

export default function ScreenshotRouteCalibrationSection({
  imagePreview,
  calibration,
  onCalibrationChange,
}: ScreenshotRouteCalibrationSectionProps) {
  const image = useLoadedImage(imagePreview)
  const [editorOpen, setEditorOpen] = useState(false)
  const [activePointId, setActivePointId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [solving, setSolving] = useState(false)
  const [breakSegmentId, setBreakSegmentId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<ViewportState>({ zoom: 1, centerX: 0.5, centerY: 0.5 })
  const [showBasemap, setShowBasemap] = useState(true)
  const [dragClient, setDragClient] = useState<{ x: number; y: number } | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const versionRef = useRef(0)
  const draggingPointRef = useRef<string | null>(null)
  const pointersRef = useRef(new Map<number, PointerSnapshot>())
  const pinchRef = useRef<PinchState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const pendingTapRef = useRef<{ pointerId: number; x: number; y: number; unit: UnitPoint } | null>(null)
  const fallbackImageDataRef = useRef<ImageData | null>(null)
  const calibrationRef = useRef(calibration)
  const lockTimerRef = useRef<number | null>(null)
  const editorSvgRef = useRef<SVGSVGElement | null>(null)
  const [editorCssPxToSvgUnit, setEditorCssPxToSvgUnit] = useState<number | null>(null)

  const contentWidth = Math.max(1, image?.width ?? calibration.imageSize?.width ?? 1)
  const contentHeight = Math.max(1, image?.height ?? calibration.imageSize?.height ?? 1)
  const viewWidth = contentWidth / viewport.zoom
  const viewHeight = contentHeight / viewport.zoom
  const viewX = clamp(viewport.centerX * contentWidth - viewWidth / 2, 0, Math.max(0, contentWidth - viewWidth))
  const viewY = clamp(viewport.centerY * contentHeight - viewHeight / 2, 0, Math.max(0, contentHeight - viewHeight))
  const editorViewBox = `${viewX} ${viewY} ${viewWidth} ${viewHeight}`
  const fallbackCssPxToSvgUnit = viewWidth / 375
  const cssPxToSvgUnit = editorCssPxToSvgUnit ?? fallbackCssPxToSvgUnit
  const currentUnresolvedSegment = unresolvedSegment(calibration)
  const activePoint = activePointId ? calibration.controlPoints.find((point) => point.id === activePointId) ?? null : null
  const coach = CoachCopy({ calibration, solving, locked })
  const showCoachPanel = calibration.controlPoints.length < 2 || Boolean(message)
  const footerHint = calibration.controlPoints.length < 2
    ? '轻点起点与终点，系统会按你给的点吸线'
    : currentUnresolvedSegment
      ? '可继续补点，也可以确认当前形状'
      : '确认后整理路线，返回文字确认页'

  function normalizeViewport(next: ViewportState): ViewportState {
    const zoom = clamp(next.zoom, 1, 3)
    const centerMin = 1 / (2 * zoom)
    const centerMax = 1 - centerMin
    return {
      zoom,
      centerX: clamp(next.centerX, centerMin, centerMax),
      centerY: clamp(next.centerY, centerMin, centerMax),
    }
  }

  function setZoomByButton(direction: 1 | -1) {
    const center = routeCenter(calibrationRef.current)
    setViewport((current) => normalizeViewport({
      zoom: zoomStep(current.zoom, direction),
      centerX: center.x,
      centerY: center.y,
    }))
  }

  function openEditor() {
    const bounds = routeBounds(calibrationRef.current.segments)
    setViewport(normalizeViewport(focusViewportFromBounds(bounds)))
    setEditorOpen(true)
  }

  useEffect(() => {
    calibrationRef.current = calibration
  }, [calibration])

  useEffect(() => {
    if (!editorOpen) return
    const svg = editorSvgRef.current
    if (!svg) return

    let frame = 0
    const measure = () => {
      const matrix = svg.getScreenCTM()
      let next = fallbackCssPxToSvgUnit
      if (matrix) {
        const scaleX = Math.hypot(matrix.a, matrix.b)
        const scaleY = Math.hypot(matrix.c, matrix.d)
        const scale = Math.max(0.001, Math.min(scaleX, scaleY))
        next = 1 / scale
      } else {
        const rect = svg.getBoundingClientRect()
        const scale = Math.min(
          rect.width / Math.max(1, viewWidth),
          rect.height / Math.max(1, viewHeight),
        )
        if (Number.isFinite(scale) && scale > 0) next = 1 / scale
      }
      setEditorCssPxToSvgUnit((current) => (
        current !== null && Math.abs(current - next) < 0.001 ? current : next
      ))
    }
    const scheduleMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }

    scheduleMeasure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null
    observer?.observe(svg)
    window.addEventListener('resize', scheduleMeasure)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [editorOpen, fallbackCssPxToSvgUnit, viewHeight, viewWidth])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS !== 'true') return
    const showHonestGapSheet = () => {
      setBreakSegmentId('__qa_honest_gap_evidence__')
    }
    window.addEventListener('peak-trekker:route-calibration-show-honest-gap', showHonestGapSheet)
    return () => {
      window.removeEventListener('peak-trekker:route-calibration-show-honest-gap', showHonestGapSheet)
    }
  }, [])

  function patchCalibration(patch: Partial<ScreenshotRouteCalibration>) {
    const current = calibrationRef.current
    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    }
    calibrationRef.current = next
    onCalibrationChange(next)
  }

  function initWorker(nextImageData: ImageData) {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    versionRef.current += 1
    const version = versionRef.current
    fallbackImageDataRef.current = new ImageData(new Uint8ClampedArray(nextImageData.data), nextImageData.width, nextImageData.height)

    if (typeof Worker === 'undefined') {
      patchCalibration({
        imageSize: { width: image?.width ?? 0, height: image?.height ?? 0, sampleWidth: nextImageData.width, sampleHeight: nextImageData.height },
        worker: {
          ...calibration.worker,
          supported: false,
          fallback: true,
          requestId,
          version,
        },
      })
      return
    }

    workerRef.current?.terminate()
    const worker = new Worker(new URL('./track-calibration.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const payload = event.data
      if (payload.requestId < requestIdRef.current || payload.version !== versionRef.current) {
        const current = calibrationRef.current
        const next = {
          ...current,
          worker: {
            ...current.worker,
            staleResultsDropped: current.worker.staleResultsDropped + 1,
          },
        }
        calibrationRef.current = next
        onCalibrationChange(next)
        return
      }
      if (payload.type === 'ready') {
        patchCalibration({
          imageSize: {
            width: image?.width ?? 0,
            height: image?.height ?? 0,
            sampleWidth: payload.width,
            sampleHeight: payload.height,
          },
          worker: {
            supported: true,
            fallback: false,
            requestId,
            version,
            staleResultsDropped: calibrationRef.current.worker.staleResultsDropped,
          },
        })
      } else if (payload.type === 'result') {
        setSolving(false)
        const current = calibrationRef.current
        const next = {
          ...current,
          status: payload.result.segments.length > 0 ? 'editing' : current.status,
          segments: mergeSolvedSegments(current.segments, payload.result.segments),
          imageSize: payload.result.imageSize,
          colorModel: payload.result.colorModel,
          worker: {
            ...current.worker,
            requestId: payload.requestId,
            version: payload.version,
          },
          updatedAt: Date.now(),
        }
        calibrationRef.current = next
        onCalibrationChange(next)
      } else {
        setSolving(false)
        setMessage(payload.message)
      }
    }
    worker.postMessage(
      {
        type: 'init',
        requestId,
        version,
        width: nextImageData.width,
        height: nextImageData.height,
        rgbaBuffer: nextImageData.data.buffer,
      },
      [nextImageData.data.buffer],
    )
  }

  useEffect(() => {
    if (!image) return
    const imageData = renderImageToSample(image)
    if (!imageData) return
    initWorker(imageData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  function solveSegments(nextPoints: CalibrationControlPoint[]) {
    const width = calibrationRef.current.imageSize?.sampleWidth ?? contentWidth
    const height = calibrationRef.current.imageSize?.sampleHeight ?? contentHeight
    const immediateSegments = buildImmediateSegments(nextPoints, calibrationRef.current.segments, width, height)
    patchCalibration({
      controlPoints: nextPoints,
      status: nextPoints.length === 0 ? 'empty' : 'editing',
      segments: immediateSegments,
    })
    if (nextPoints.length < 2) return
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const version = versionRef.current
    setSolving(true)
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'solve',
        requestId,
        version,
        controlPoints: nextPoints,
      })
      return
    }

    const imageData = fallbackImageDataRef.current
    if (!imageData) return
    const startedAt = performance.now()
    window.setTimeout(() => {
      const result = solveLivewireCalibration({
        rgba: imageData.data,
        width: imageData.width,
        height: imageData.height,
        controlPoints: nextPoints,
      })
      setSolving(false)
      const current = calibrationRef.current
      const next = {
        ...current,
        controlPoints: nextPoints,
        segments: mergeSolvedSegments(current.segments, result.segments),
        imageSize: result.imageSize,
        colorModel: result.colorModel,
        worker: {
          ...current.worker,
          supported: false,
          fallback: true,
          requestId,
          version,
        },
        updatedAt: Date.now(),
      }
      calibrationRef.current = next
      onCalibrationChange(next)
      setMessage(`受限模式 · 主线程计算 ${Math.round(performance.now() - startedAt)}ms`)
    }, 0)
  }

  function updatePoint(pointId: string, unit: UnitPoint) {
    const nextPoints = calibrationRef.current.controlPoints.map((point) => (
      point.id === pointId ? { ...point, x: unit.x, y: unit.y } : point
    ))
    solveSegments(nextPoints)
  }

  function addPoint(unit: UnitPoint) {
    if (locked) return
    const currentCount = calibrationRef.current.controlPoints.length
    if (currentCount >= SCREENSHOT_ROUTE_SHAPE_LIMITS.maxControlPoints) {
      setMessage('点太多了。请清空后少点重描，或回到确认页选择仅保存文字数据。')
      return
    }
    const nextPoints = [...calibrationRef.current.controlPoints, createControlPoint(unit.x, unit.y)]
    if (nextPoints.length < 2) {
      setMessage('再点一个终点，就能开始吸附。')
    } else if (nextPoints.length >= SCREENSHOT_ROUTE_SHAPE_LIMITS.maxControlPoints - 5) {
      setMessage('点已经很多了。必要时清空后少点重描，或只保存文字数据。')
    } else {
      setMessage(null)
    }
    solveSegments(nextPoints)
  }

  function clearCalibration() {
    setLocked(false)
    setBreakSegmentId(null)
    const next = {
      ...createEmptyScreenshotRouteCalibration(),
      worker: {
        ...calibrationRef.current.worker,
        requestId: requestIdRef.current,
        version: versionRef.current,
      },
    }
    calibrationRef.current = next
    onCalibrationChange(next)
    setMessage('已清空，可以重新点选路线。')
  }

  function pointerDistance(a: PointerSnapshot, b: PointerSnapshot) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  function startPinchIfNeeded() {
    const points = [...pointersRef.current.values()]
    if (points.length < 2) return
    const [a, b] = points
    if (!a || !b) return
    pendingTapRef.current = null
    panRef.current = null
    pinchRef.current = {
      distance: Math.max(1, pointerDistance(a, b)),
      zoom: viewport.zoom,
      centerX: viewport.centerX,
      centerY: viewport.centerY,
    }
    setMessage(null)
    setDragClient(null)
  }

  function onSvgPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic test pointers may not be capturable; real touch pointers still are.
    }
    if (pointersRef.current.size >= 2) {
      startPinchIfNeeded()
      return
    }
    const unit = getPointerUnit(event, contentWidth, contentHeight)
    pendingTapRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, unit }
    panRef.current = viewport.zoom > 1
      ? {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startCenterX: viewport.centerX,
          startCenterY: viewport.centerY,
          panning: false,
        }
      : null
  }

  function onSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()]
      const [a, b] = points
      if (a && b) {
        const distance = Math.max(1, pointerDistance(a, b))
        const nextZoom = clamp(pinch.zoom * (distance / pinch.distance), 1, 3)
        setViewport((current) => normalizeViewport({
          centerX: current.centerX,
          centerY: current.centerY,
          zoom: nextZoom,
        }))
      }
      return
    }
    const activeId = draggingPointRef.current
    if (activeId) {
      updatePoint(activeId, getPointerUnit(event, contentWidth, contentHeight))
      const rect = event.currentTarget.getBoundingClientRect()
      setDragClient({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      pendingTapRef.current = null
      return
    }

    const pan = panRef.current
    if (pan && pan.pointerId === event.pointerId && viewport.zoom > 1) {
      const deltaX = event.clientX - pan.startClientX
      const deltaY = event.clientY - pan.startClientY
      if (!pan.panning && Math.hypot(deltaX, deltaY) > 10) {
        panRef.current = { ...pan, panning: true }
        pendingTapRef.current = null
      }
      if (panRef.current?.panning) {
        const rect = event.currentTarget.getBoundingClientRect()
        const centerDeltaX = (deltaX / Math.max(1, rect.width)) / viewport.zoom
        const centerDeltaY = (deltaY / Math.max(1, rect.height)) / viewport.zoom
        setViewport((current) => normalizeViewport({
          zoom: current.zoom,
          centerX: pan.startCenterX - centerDeltaX,
          centerY: pan.startCenterY - centerDeltaY,
        }))
      }
    }
  }

  function onSvgPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const pendingTap = pendingTapRef.current
    if (
      pendingTap &&
      pendingTap.pointerId === event.pointerId &&
      !draggingPointRef.current &&
      !pinchRef.current &&
      Math.hypot(event.clientX - pendingTap.x, event.clientY - pendingTap.y) <= 10
    ) {
      addPoint(pendingTap.unit)
    }
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    pendingTapRef.current = null
    draggingPointRef.current = null
    panRef.current = null
    setActivePointId(null)
    setDragClient(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer may already be released by the browser.
    }
  }

  function onPointPointerDown(event: ReactPointerEvent<SVGCircleElement>, id: string) {
    event.stopPropagation()
    draggingPointRef.current = id
    setActivePointId(id)
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (rect) setDragClient({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    pendingTapRef.current = null
    panRef.current = null
    try {
      event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic test pointers may not be capturable; real touch pointers still are.
    }
  }

  function closeEditor() {
    setEditorOpen(false)
    setLocked(false)
    setBreakSegmentId(null)
    if (lockTimerRef.current !== null) {
      window.clearTimeout(lockTimerRef.current)
      lockTimerRef.current = null
    }
  }

  function runLock() {
    setBreakSegmentId(null)
    setViewport({ zoom: 1, centerX: 0.5, centerY: 0.5 })
    setLocked(true)
    patchCalibration({
      status: 'ready',
      segments: confirmUserShapeSegments(calibrationRef.current.segments),
    })
    if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current)
    lockTimerRef.current = window.setTimeout(() => {
      closeEditor()
    }, LOCK_RETURN_DELAY_MS)
  }

  function requestLock() {
    if (calibrationRef.current.controlPoints.length < 2) return
    const breakSegment = genuineBreakSegment(calibrationRef.current)
    if (breakSegment) {
      setBreakSegmentId(breakSegment.id)
      return
    }
    runLock()
  }

  function keepBreakAndContinue() {
    const current = calibrationRef.current
    const next = {
      ...current,
      segments: current.segments.map((segment) => (
        segment.id === breakSegmentId ? resolveSegment(segment, 'accepted_gap') : segment
      )),
      updatedAt: Date.now(),
    }
    calibrationRef.current = next
    onCalibrationChange(next)
    setBreakSegmentId(null)
    window.setTimeout(runLock, 0)
  }

  return (
    <>
      <RouteEntryCard imagePreview={imagePreview} image={image} calibration={calibration} onOpen={openEditor} />

      {editorOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="校准轨迹"
          data-route-calibration-editor="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'var(--color-surface)',
            color: 'var(--color-on-surface)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <style>{`
            @keyframes calibrationFadeUp {
              from { transform: translateY(10px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes routePulse {
              0% { transform: scale(.7); opacity: .38; }
              65% { transform: scale(1.7); opacity: 0; }
              100% { transform: scale(1.7); opacity: 0; }
            }
            @keyframes routeCapBloom {
              0% { transform: scale(.9); opacity: .18; }
              45% { transform: scale(2.4); opacity: .34; }
              100% { transform: scale(3.6); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-route-calibration-editor="true"] * {
                animation-duration: .01ms !important;
                transition-duration: .01ms !important;
              }
            }
          `}</style>
          <header
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 7,
              flexShrink: 0,
              padding: 'calc(env(safe-area-inset-top, 0px) + 8px) var(--space-3) var(--space-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              opacity: locked ? 0 : 1,
              pointerEvents: 'none',
              transition: 'opacity 420ms ease',
            }}
          >
            <IconButton icon={<BackIcon size={20} />} ariaLabel="返回确认页" onClick={closeEditor} style={{ pointerEvents: locked ? 'none' : 'auto' }} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <div style={{ color: 'var(--color-on-surface)', fontSize: 'var(--font-title-m-size)', fontWeight: 800 }}>校准轨迹</div>
            </div>
            <button
              type="button"
              aria-label="帮助"
              onClick={() => setMessage('底图是你上传的截图，只用于对齐，不会进入分享图。')}
              style={{
                pointerEvents: locked ? 'none' : 'auto',
                width: 42,
                height: 42,
                borderRadius: 12,
                border: '1px solid var(--color-outline)',
                background: 'rgba(255,255,255,.04)',
                color: 'var(--color-on-surface)',
                fontSize: 17,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ?
            </button>
          </header>

          <main style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <svg
              ref={editorSvgRef}
              data-route-editor-canvas="true"
              data-route-content-width={contentWidth}
              data-route-content-height={contentHeight}
              viewBox={editorViewBox}
              width="100%"
              height="100%"
              style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerCancel={onSvgPointerUp}
            >
              <defs>
                <filter id="routeGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation={locked ? '7' : '5.4'} result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect x={0} y={0} width={contentWidth} height={contentHeight} fill="#08090a" />
              {imagePreview ? (
                <image
                  href={imagePreview}
                  x={0}
                  y={0}
                  width={contentWidth}
                  height={contentHeight}
                  opacity={showBasemap ? (locked ? '0.12' : '0.34') : '0.06'}
                  style={{ filter: locked ? 'saturate(.35) brightness(.32)' : 'saturate(.42) brightness(.48) contrast(.86)', transition: 'opacity 420ms ease, filter 420ms ease' }}
                />
              ) : null}
              <CalibrationLineLayer
                segments={calibration.segments}
                locked={locked}
                width={contentWidth}
                height={contentHeight}
                zoom={viewport.zoom}
              />
              <ControlPointsLayer
                points={calibration.controlPoints}
                activeId={activePointId}
                locked={locked}
                width={contentWidth}
                height={contentHeight}
                zoom={viewport.zoom}
                cssPxToSvgUnit={cssPxToSvgUnit}
                onPointerDown={onPointPointerDown}
              />
              {locked && drawableSegments(calibration.segments).at(-1)?.points.at(-1) ? (
                (() => {
                  const point = drawableSegments(calibration.segments).at(-1)!.points.at(-1)!
                  return (
                    <g>
                      <circle
                        cx={point.x * contentWidth}
                        cy={point.y * contentHeight}
                        r="18"
                        fill="none"
                        stroke={ROUTE_COLOR}
                        strokeWidth="4"
                        opacity=".38"
                        style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'routeCapBloom 1100ms ease-out both' }}
                      />
                    </g>
                  )
                })()
              ) : null}
            </svg>

            {dragClient && activePoint && imagePreview && !locked ? (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: clamp(dragClient.x - 52, 8, 9999),
                  top: Math.max(8, dragClient.y - 132),
                  width: 104,
                  height: 104,
                  borderRadius: 999,
                  border: '2px solid color-mix(in srgb, var(--color-success) 82%, white)',
                  overflow: 'hidden',
                  boxShadow: '0 18px 38px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.5) inset',
                  zIndex: 5,
                  pointerEvents: 'none',
                  background: 'var(--color-surface)',
                }}
              >
                <svg
                  viewBox={`${clamp(activePoint.x * contentWidth - contentWidth * 0.08, 0, Math.max(0, contentWidth - contentWidth * 0.16))} ${clamp(activePoint.y * contentHeight - contentHeight * 0.08, 0, Math.max(0, contentHeight - contentHeight * 0.16))} ${contentWidth * 0.16} ${contentHeight * 0.16}`}
                  width="104"
                  height="104"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <image href={imagePreview} x={0} y={0} width={contentWidth} height={contentHeight} opacity=".42" style={{ filter: 'saturate(.5) brightness(.56)' }} />
                  <CalibrationLineLayer segments={calibration.segments} locked={false} width={contentWidth} height={contentHeight} zoom={6.25} />
                  <circle cx={activePoint.x * contentWidth} cy={activePoint.y * contentHeight} r={Math.max(10, Math.min(contentWidth, contentHeight) * 0.01)} fill="#08120d" stroke={ROUTE_COLOR} strokeWidth="4" />
                </svg>
              </div>
            ) : null}

            {!locked ? (
              <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 4 }}>
                <EditorToolButton label={showBasemap ? '隐藏底图' : '显示底图'} active={!showBasemap} onClick={() => setShowBasemap((value) => !value)}>
                  <EyeGlyph hidden={!showBasemap} />
                </EditorToolButton>
                <EditorToolButton label="清空重描" onClick={clearCalibration}>
                  <RetraceGlyph />
                </EditorToolButton>
                <EditorToolButton label="放大底图" active={viewport.zoom > 1} onClick={() => setZoomByButton(1)}>
                  <ZoomGlyph />
                </EditorToolButton>
                <EditorToolButton label="缩小底图" active={viewport.zoom > 1} onClick={() => setZoomByButton(-1)}>
                  <ZoomOutGlyph />
                </EditorToolButton>
              </div>
            ) : null}

            {!locked && !breakSegmentId && showCoachPanel && (
              <div
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: 'calc(env(safe-area-inset-bottom,0px) + 88px)',
                  zIndex: 5,
                  animation: 'calibrationFadeUp 260ms ease both',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-outline)',
                    borderRadius: 16,
                    padding: '14px 16px',
                    boxShadow: '0 14px 36px rgba(0,0,0,.45)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        background: 'color-mix(in srgb, var(--color-success) 14%, transparent)',
                        color: 'var(--color-success)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <CheckIcon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--color-on-surface)' }}>{coach.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', lineHeight: 1.55, marginTop: 5 }}>{coach.body}</div>
                    </div>
                    {coach.action ? (
                      <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 800, whiteSpace: 'nowrap' }}>{coach.action}</span>
                    ) : null}
                  </div>
                  {message ? (
                    <div
                      role="status"
                      style={{
                        marginTop: 10,
                        color: 'var(--color-on-surface)',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-outline)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        fontSize: 'var(--font-label-s-size)',
                        lineHeight: 1.45,
                      }}
                    >
                      {message}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {locked ? (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 'calc(env(safe-area-inset-bottom,0px) + 40px)',
                  display: 'flex',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  zIndex: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'calibrationFadeUp 500ms 650ms both' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: ROUTE_COLOR, boxShadow: `0 0 10px ${ROUTE_COLOR}` }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-on-surface)', letterSpacing: '.04em' }}>已锁定</span>
                </div>
              </div>
            ) : null}

            {breakSegmentId ? (
              <HonestGapSheet
                onConnect={() => {
                  setBreakSegmentId(null)
                  setMessage('在断开的附近轻点补一个点，系统会重新吸附这一段。')
                }}
                onKeepGap={keepBreakAndContinue}
              />
            ) : null}
          </main>

          {!locked && !breakSegmentId ? (
            <footer
              style={{
                flexShrink: 0,
                padding: '12px 16px calc(env(safe-area-inset-bottom,0px) + 24px)',
                borderTop: '1px solid color-mix(in srgb, var(--color-outline) 72%, transparent)',
                background: 'rgba(18,20,22,.92)',
                backdropFilter: 'blur(16px)',
                display: 'grid',
                gap: 9,
              }}
            >
              <PrimaryButton onClick={requestLock} disabled={calibration.controlPoints.length < 2}>
                确认轨迹
              </PrimaryButton>
              <div style={{ textAlign: 'center', color: 'var(--color-on-surface-variant)', fontSize: 11, lineHeight: 1.4 }}>
                {footerHint}
              </div>
            </footer>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
