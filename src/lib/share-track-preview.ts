import { simplifyPolyline } from './polyline-simplify.ts'
import { validateScreenshotRouteShape } from './screenshot-route-shape.ts'

export type ShareTrackPreviewPoint = {
  x: number
  y: number
}

export type ShareTrackPreview = {
  points: ShareTrackPreviewPoint[]
  segments?: ShareTrackPreviewPoint[][]
  pointCount: number
  hasAltitude: boolean
}

export type ShareTrackFrame = {
  x?: number
  y?: number
  width: number
  height: number
  padding?: number
  fitToContent?: boolean
  maxContentScale?: number
  minContentSpan?: number
}

export type ShareTrackBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export type ShareTrackPath = {
  d: string | null
  start: ShareTrackPreviewPoint
  end: ShareTrackPreviewPoint
  bounds: ShareTrackBounds
  projectedSegments: ShareTrackPreviewPoint[][]
}

export type ShareTrackRenderSegment = {
  index: number
  d: string
  start: ShareTrackPreviewPoint
  end: ShareTrackPreviewPoint
}

export type ShareTrackRender = ShareTrackPath & {
  segmentPaths: ShareTrackRenderSegment[]
  lineWidth: number
  glowWidth: number
  glowOpacity: number
  startRadius: number
  startStrokeWidth: number
  endRadius: number
  filterPadding: number
}

export type ShareTrackRenderStyle = {
  lineWidth?: number
  glowWidth?: number
  glowOpacity?: number
  startRadius?: number
  startStrokeWidth?: number
  endRadius?: number
  filterPadding?: number
  simplifyEpsilonPx?: number
}

type ParsedTrackPoint = {
  lat: number
  lng: number
  altitude: number | null
}

const DEFAULT_MAX_POINTS = 96
const COORDINATE_EPSILON = 0.0000001
const DEFAULT_MIN_CONTENT_SPAN = 0.18
const DEFAULT_MAX_CONTENT_SCALE = 4.5
const DEFAULT_SIMPLIFY_EPSILON_PX = 1.75
const SCREENSHOT_ROUTE_DEGENERATE_PIXEL_EPSILON = 1

export const SHARE_TRACK_CONTENT_FIT = {
  fitToContent: true,
  maxContentScale: DEFAULT_MAX_CONTENT_SCALE,
  minContentSpan: DEFAULT_MIN_CONTENT_SPAN,
} as const

export const SHARE_TRACK_RENDER_PROFILES = {
  shareEditorHero: {
    lineWidth: 4.2,
    glowWidth: 14,
    glowOpacity: 0.18,
    startRadius: 7,
    startStrokeWidth: 3,
    endRadius: 8,
  },
  posterMini: {
    lineWidth: 6,
    glowWidth: 18,
    glowOpacity: 0.18,
    startRadius: 7,
    startStrokeWidth: 4,
    endRadius: 8,
  },
  archiveMedallion: {
    lineWidth: 3.6,
    glowWidth: 15,
    glowOpacity: 0.14,
    startRadius: 5.8,
    startStrokeWidth: 2.8,
    endRadius: 6.8,
  },
  activityCard: {
    lineWidth: 8,
    glowWidth: 28,
    glowOpacity: 0.2,
    startRadius: 15,
    startStrokeWidth: 6,
    endRadius: 21,
  },
  activityScreenshotCard: {
    lineWidth: 3.4,
    glowWidth: 10,
    glowOpacity: 0.13,
    startRadius: 6,
    startStrokeWidth: 2.4,
    endRadius: 7.5,
  },
  verticalStory: {
    lineWidth: 12,
    glowWidth: 42,
    glowOpacity: 0.13,
    startRadius: 19,
    startStrokeWidth: 8,
    endRadius: 27,
  },
  posterTrail: ({ lineWidth = 8, glow = 10 }: { lineWidth?: number; glow?: number } = {}) => ({
    lineWidth,
    glowWidth: Math.max(lineWidth * 4, glow * 2.4),
    glowOpacity: 0.16,
    startRadius: Math.max(13, lineWidth * 2.35),
    startStrokeWidth: Math.max(5, lineWidth),
    endRadius: Math.max(18, lineWidth * 3.2),
  }),
} as const

function toFiniteNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseTrackPoint(value: unknown): ParsedTrackPoint | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const lat = toFiniteNumber(raw.lat) ?? toFiniteNumber(raw.latitude)
  const lng = toFiniteNumber(raw.lng) ?? toFiniteNumber(raw.lon) ?? toFiniteNumber(raw.longitude)
  const altitude =
    toFiniteNumber(raw.altitude) ??
    toFiniteNumber(raw.elevation) ??
    toFiniteNumber(raw.ele) ??
    null

  if (lat === null || lng === null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  if (lat === 0 && lng === 0) return null

  return { lat, lng, altitude }
}

function isSameCoordinate(a: ParsedTrackPoint, b: ParsedTrackPoint) {
  return Math.abs(a.lat - b.lat) < COORDINATE_EPSILON && Math.abs(a.lng - b.lng) < COORDINATE_EPSILON
}

function sampleTrackPoints(points: ParsedTrackPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points

  const step = Math.max(1, Math.ceil(points.length / maxPoints))
  const sampled = points.filter((_, index) => index % step === 0)
  const lastPoint = points.at(-1)!

  return isSameCoordinate(sampled.at(-1) ?? lastPoint, lastPoint) ? sampled : [...sampled, lastPoint]
}

function samplePreviewPoints(points: ShareTrackPreviewPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points
  if (maxPoints <= 2) return [points[0]!, points.at(-1)!]

  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round((index * (points.length - 1)) / (maxPoints - 1))
    return points[sourceIndex]!
  })
}

export function buildShareTrackPreview(rawTrackPoints: unknown, maxPoints = DEFAULT_MAX_POINTS): ShareTrackPreview | null {
  if (!Array.isArray(rawTrackPoints)) return null

  const parsed = rawTrackPoints.flatMap((point) => {
    const parsedPoint = parseTrackPoint(point)
    return parsedPoint ? [parsedPoint] : []
  })
  const deduped = parsed.filter((point, index) => index === 0 || !isSameCoordinate(point, parsed[index - 1]!))

  if (deduped.length < 1) return null

  const safeMaxPoints = Math.max(1, Math.floor(maxPoints))
  const sampled = sampleTrackPoints(deduped, safeMaxPoints)
  const lats = sampled.map((point) => point.lat)
  const lngs = sampled.map((point) => point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng
  const midLat = (minLat + maxLat) / 2
  const lngScale = Math.max(Math.cos((midLat * Math.PI) / 180), 0.1)
  const effLngRange = lngRange * lngScale
  const range = Math.max(latRange, effLngRange, COORDINATE_EPSILON)

  return {
    points: sampled.map((point) => ({
      x: (((point.lng - minLng) * lngScale) + (range - effLngRange) / 2) / range,
      y: ((maxLat - point.lat) + (range - latRange) / 2) / range,
    })),
    pointCount: deduped.length,
    hasAltitude: deduped.some((point) => point.altitude !== null),
  }
}

function pixelScreenshotPoint(point: ShareTrackPreviewPoint, width: number, height: number): ShareTrackPreviewPoint {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)

  return {
    x: clampUnit(point.x) * safeWidth,
    y: clampUnit(point.y) * safeHeight,
  }
}

function normalizeScreenshotPixelPoint(
  point: ShareTrackPreviewPoint,
  bounds: ShareTrackBounds,
  degenerateScale: number | null,
): ShareTrackPreviewPoint {
  if (degenerateScale !== null) {
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    return {
      x: 0.5 + (point.x - centerX) / degenerateScale,
      y: 0.5 + (point.y - centerY) / degenerateScale,
    }
  }

  const range = Math.max(bounds.width, bounds.height, COORDINATE_EPSILON)
  return {
    x: ((point.x - bounds.minX) + (range - bounds.width) / 2) / range,
    y: ((point.y - bounds.minY) + (range - bounds.height) / 2) / range,
  }
}

export function buildShareTrackPreviewFromScreenshotRouteShape(
  rawShape: unknown,
  maxPointsPerSegment = DEFAULT_MAX_POINTS,
): ShareTrackPreview | null {
  const validation = validateScreenshotRouteShape(rawShape)
  if (!validation.ok || !validation.shape) return null

  const safeMaxPoints = Math.max(2, Math.floor(maxPointsPerSegment))
  const imageWidth = validation.shape.image.width
  const imageHeight = validation.shape.image.height
  const pixelSegments = validation.shape.segments.flatMap((segment) => {
    if (segment.resolution === 'accepted_gap' || segment.points.length < 2) return []
    const pixels = segment.points.map((point) => pixelScreenshotPoint(point, imageWidth, imageHeight))
    return pixels.length >= 2 ? [pixels] : []
  })

  if (pixelSegments.length < 1) return null

  const routeBounds = getPointBounds(pixelSegments.flat())
  const routeDiagonal = Math.hypot(routeBounds.width, routeBounds.height)
  const degenerateScale = routeDiagonal <= SCREENSHOT_ROUTE_DEGENERATE_PIXEL_EPSILON
    ? Math.max(1, imageWidth, imageHeight)
    : null
  const drawableSegments = pixelSegments.flatMap((segment) => {
    const normalized = segment.map((point) => normalizeScreenshotPixelPoint(point, routeBounds, degenerateScale))
    const sampled = samplePreviewPoints(normalized, safeMaxPoints)
    return sampled.length >= 2 ? [sampled] : []
  })

  if (drawableSegments.length < 1) return null

  return {
    points: drawableSegments.flat(),
    segments: drawableSegments,
    pointCount: drawableSegments.reduce((sum, segment) => sum + segment.length, 0),
    hasAltitude: false,
  }
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

function formatCoord(value: number) {
  return Number(value.toFixed(2))
}

function pointsEqual(a: ShareTrackPreviewPoint, b: ShareTrackPreviewPoint) {
  return Math.abs(a.x - b.x) < COORDINATE_EPSILON && Math.abs(a.y - b.y) < COORDINATE_EPSILON
}

function projectPoint(point: ShareTrackPreviewPoint, frame: Required<ShareTrackFrame>): ShareTrackPreviewPoint {
  const innerWidth = frame.width - frame.padding * 2
  const innerHeight = frame.height - frame.padding * 2
  const scale = Math.min(innerWidth, innerHeight)
  const offsetX = (innerWidth - scale) / 2
  const offsetY = (innerHeight - scale) / 2

  return {
    x: formatCoord(frame.x + frame.padding + offsetX + clampUnit(point.x) * scale),
    y: formatCoord(frame.y + frame.padding + offsetY + clampUnit(point.y) * scale),
  }
}

function getPointBounds(points: ShareTrackPreviewPoint[]): ShareTrackBounds {
  const first = points[0] ?? { x: 0, y: 0 }
  let minX = first.x
  let minY = first.y
  let maxX = first.x
  let maxY = first.y

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function buildQuadraticPath(points: ShareTrackPreviewPoint[]) {
  const start = points[0]
  const end = points.at(-1)
  if (!start || !end) return null
  if (points.length === 1) return null
  if (points.length === 2) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy) || 1
    const curveOffset = Math.min(Math.hypot(dx, dy) * 0.16, 28)
    const control = {
      x: formatCoord((start.x + end.x) / 2 + (-dy / length) * curveOffset),
      y: formatCoord((start.y + end.y) / 2 + (dx / length) * curveOffset),
    }
    return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
  }

  const commands = [`M ${start.x} ${start.y}`]
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]!
    const p1 = points[index]!
    const p2 = points[index + 1]!
    const p3 = points[Math.min(points.length - 1, index + 2)]!
    const cp1 = {
      x: formatCoord(p1.x + (p2.x - p0.x) / 6),
      y: formatCoord(p1.y + (p2.y - p0.y) / 6),
    }
    const cp2 = {
      x: formatCoord(p2.x - (p3.x - p1.x) / 6),
      y: formatCoord(p2.y - (p3.y - p1.y) / 6),
    }
    commands.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`)
  }
  return commands.join(' ')
}

function fitPointToContent(point: ShareTrackPreviewPoint, bounds: ShareTrackBounds, frame: Required<ShareTrackFrame>) {
  if (!frame.fitToContent) return point

  const minContentSpan = Math.max(COORDINATE_EPSILON, frame.minContentSpan)
  const effectiveSpan = Math.max(bounds.width, bounds.height, minContentSpan)
  const scale = Math.min(1 / effectiveSpan, frame.maxContentScale)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  return {
    x: 0.5 + (point.x - centerX) * scale,
    y: 0.5 + (point.y - centerY) * scale,
  }
}

function buildProjectedSegmentPath(points: ShareTrackPreviewPoint[], frame: Required<ShareTrackFrame>, contentBounds: ShareTrackBounds | null) {
  const sourcePoints = contentBounds ? points.map((point) => fitPointToContent(point, contentBounds, frame)) : points
  const projected = sourcePoints.map((point) => projectPoint(point, frame))
  const start = projected[0]
  const end = projected.at(-1)

  if (!start || !end) return null
  if (projected.length === 1) return { d: null as string | null, start, end, projected }
  if (projected.length === 2) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy) || 1
    const curveOffset = Math.min(frame.width, frame.height) * 0.08
    const control = {
      x: formatCoord((start.x + end.x) / 2 + (-dy / length) * curveOffset),
      y: formatCoord((start.y + end.y) / 2 + (dx / length) * curveOffset),
    }

    return {
      d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
      start,
      end,
      projected: [start, control, end],
    }
  }

  return {
    d: projected.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
    start,
    end,
    projected,
  }
}

export function buildShareTrackPath(
  preview: ShareTrackPreview | null | undefined,
  frame: ShareTrackFrame,
): ShareTrackPath | null {
  if (!preview || preview.points.length < 1) return null

  const safePadding = Math.max(0, Math.min(frame.padding ?? Math.min(frame.width, frame.height) * 0.1, Math.min(frame.width, frame.height) / 2))
  const resolvedFrame = {
    x: frame.x ?? 0,
    y: frame.y ?? 0,
    width: frame.width,
    height: frame.height,
    padding: safePadding,
    fitToContent: frame.fitToContent ?? false,
    maxContentScale: Math.max(1, frame.maxContentScale ?? DEFAULT_MAX_CONTENT_SCALE),
    minContentSpan: Math.max(COORDINATE_EPSILON, frame.minContentSpan ?? DEFAULT_MIN_CONTENT_SPAN),
  }

  if (resolvedFrame.width <= 0 || resolvedFrame.height <= 0) return null

  const drawableSegments = preview.segments?.filter((segment) => segment.length >= 1) ?? null
  if (drawableSegments?.length) {
    const contentBounds = resolvedFrame.fitToContent ? getPointBounds(drawableSegments.flat()) : null
    const segmentPaths = drawableSegments.flatMap((segment) => {
      const path = buildProjectedSegmentPath(segment, resolvedFrame, contentBounds)
      return path ? [path] : []
    })

    if (!segmentPaths.length) return null
    const start = segmentPaths[0]!.start
    const end = segmentPaths.at(-1)!.end
    const pathData = segmentPaths.flatMap((path) => (path.d ? [path.d] : [])).join(' ')
    const bounds = getPointBounds(segmentPaths.flatMap((path) => path.projected))
    const projectedSegments = segmentPaths.map((path) => path.projected.filter((point, index, points) => {
      if (index === 0 || index === points.length - 1) return true
      return !pointsEqual(point, points[index - 1]!)
    }))

    return {
      d: pathData || null,
      start,
      end,
      bounds,
      projectedSegments,
    }
  }

  const contentBounds = resolvedFrame.fitToContent ? getPointBounds(preview.points) : null
  const points = preview.points
    .map((point) => (contentBounds ? fitPointToContent(point, contentBounds, resolvedFrame) : point))
    .map((point) => projectPoint(point, resolvedFrame))
  const start = points[0]!
  const end = points.at(-1)!
  const bounds = getPointBounds(points)

  if (points.length === 1) {
    return {
      d: null,
      start,
      end,
      bounds,
      projectedSegments: [[start]],
    }
  }

  if (points.length === 2) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy) || 1
    const curveOffset = Math.min(resolvedFrame.width, resolvedFrame.height) * 0.08
    const control = {
      x: formatCoord((start.x + end.x) / 2 + (-dy / length) * curveOffset),
      y: formatCoord((start.y + end.y) / 2 + (dx / length) * curveOffset),
    }

    return {
      d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
      start,
      end,
      bounds: getPointBounds([start, control, end]),
      projectedSegments: [[start, end]],
    }
  }

  return {
    d: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
    start,
    end,
    bounds,
    projectedSegments: [points],
  }
}

export function buildShareTrackRender(
  preview: ShareTrackPreview | null | undefined,
  frame: ShareTrackFrame,
  style: ShareTrackRenderStyle = {},
): ShareTrackRender | null {
  const route = buildShareTrackPath(preview, frame)
  if (!route) return null
  const epsilon = Math.max(0, style.simplifyEpsilonPx ?? DEFAULT_SIMPLIFY_EPSILON_PX)
  const projectedPoints = route.projectedSegments.flatMap((segment) => segment).filter((point, index, points) => (
    index === 0 || !pointsEqual(point, points[index - 1]!)
  ))
  const originalStart = projectedPoints[0]
  const originalEnd = projectedPoints.at(-1)
  const simplifiedPoints = simplifyPolyline(projectedPoints, {
    epsilon,
    project: (point) => point,
    distanceMode: 'line',
    degenerateEpsilon: COORDINATE_EPSILON,
  })
  const withExactStart = originalStart && simplifiedPoints[0] && !pointsEqual(simplifiedPoints[0], originalStart)
    ? [originalStart, ...simplifiedPoints.slice(1)]
    : simplifiedPoints
  const withExactEndpoints = originalEnd && withExactStart.at(-1) && !pointsEqual(withExactStart.at(-1)!, originalEnd)
    ? [...withExactStart.slice(0, -1), originalEnd]
    : withExactStart
  const d = buildQuadraticPath(withExactEndpoints)
  const segmentPaths = d && originalStart && originalEnd
    ? [{ index: 0, d, start: originalStart, end: originalEnd }]
    : []
  const renderBounds = getPointBounds(withExactEndpoints)

  const lineWidth = Math.max(1, style.lineWidth ?? 8)
  const glowWidth = Math.max(lineWidth, style.glowWidth ?? lineWidth * 4)
  const startRadius = Math.max(1, style.startRadius ?? lineWidth * 2.35)
  const startStrokeWidth = Math.max(1, style.startStrokeWidth ?? lineWidth)
  const endRadius = Math.max(1, style.endRadius ?? lineWidth * 3.2)

  return {
    ...route,
    d: d || null,
    bounds: renderBounds,
    projectedSegments: [withExactEndpoints],
    segmentPaths,
    lineWidth,
    glowWidth,
    glowOpacity: Math.max(0, Math.min(1, style.glowOpacity ?? 0.16)),
    startRadius,
    startStrokeWidth,
    endRadius,
    filterPadding: Math.max(0, style.filterPadding ?? glowWidth * 2),
  }
}
