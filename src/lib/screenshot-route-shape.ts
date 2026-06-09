import type {
  CalibrationControlPoint,
  CalibrationSegmentResolution,
  ScreenshotRouteCalibration,
  ScreenshotRouteSegment,
  UnitPoint,
} from './screenshot-track/calibration.ts'

export const SCREENSHOT_ROUTE_SHAPE_LIMITS = {
  maxBytes: 256 * 1024,
  maxControlPoints: 80,
  maxSegments: 200,
  maxPointsPerSegment: 2000,
  maxImageDimension: 16000,
} as const

const ROUTE_SHAPE_STORAGE_TARGET_BYTES = Math.floor(SCREENSHOT_ROUTE_SHAPE_LIMITS.maxBytes * 0.88)
const ROUTE_SHAPE_SIMPLIFY_START_EPSILON_PX = 1.5
const ROUTE_SHAPE_SIMPLIFY_MAX_EPSILON_PX = 12
const ROUTE_SHAPE_INITIAL_POINTS_PER_SEGMENT = 240
const ROUTE_SHAPE_MIN_POINTS_PER_SEGMENT = 24

export type PersistedScreenshotRouteResolution = Exclude<CalibrationSegmentResolution, 'unresolved'>

export type PersistedScreenshotRouteShape = {
  schemaVersion: 1
  kind: 'screenshot_route_shape'
  coordinateSpace: 'normalized_screenshot'
  source: 'user_seeded_livewire'
  image: {
    width: number
    height: number
  }
  controlPoints: Array<CalibrationControlPoint>
  segments: Array<{
    id: string
    fromId: string
    toId: string
    resolution: PersistedScreenshotRouteResolution
    points: UnitPoint[]
  }>
  createdAt: string
}

export type ScreenshotRouteShapeValidationResult =
  | { ok: true; shape: PersistedScreenshotRouteShape | null }
  | { ok: false; error: string }

export type ScreenshotRouteShapeMetrics = {
  controlPoints: number
  segments: number
  maxPointsPerSegment: number
  totalPoints: number
  serializedByteSize: number
}

function finiteUnit(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 && numberValue <= 1 ? numberValue : null
}

function safeId(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized ? normalized.slice(0, 80) : fallback
}

function normalizePoint(value: unknown): UnitPoint | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const x = finiteUnit(record.x)
  const y = finiteUnit(record.y)
  return x === null || y === null ? null : { x, y }
}

function serializedByteSize(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

export function measureScreenshotRouteShape(value: PersistedScreenshotRouteShape | null): ScreenshotRouteShapeMetrics {
  if (!value) {
    return {
      controlPoints: 0,
      segments: 0,
      maxPointsPerSegment: 0,
      totalPoints: 0,
      serializedByteSize: serializedByteSize(value),
    }
  }

  let maxPointsPerSegment = 0
  let totalPoints = 0
  for (const segment of value.segments) {
    const count = segment.points.length
    if (count > maxPointsPerSegment) maxPointsPerSegment = count
    totalPoints += count
  }
  return {
    controlPoints: value.controlPoints.length,
    segments: value.segments.length,
    maxPointsPerSegment,
    totalPoints,
    serializedByteSize: serializedByteSize(value),
  }
}

function normalizeResolution(value: unknown): PersistedScreenshotRouteResolution | null {
  return value === 'snapped' || value === 'user_confirmed_shape' || value === 'accepted_gap' ? value : null
}

function segmentDrawablePoints(segment: ScreenshotRouteSegment) {
  if (segment.resolution === 'accepted_gap') return []
  if (segment.points.length >= 2) return segment.points
  return [segment.from, segment.to]
}

function pointDistanceToSegmentPx(point: UnitPoint, start: UnitPoint, end: UnitPoint, width: number, height: number) {
  const px = point.x * width
  const py = point.y * height
  const ax = start.x * width
  const ay = start.y * height
  const bx = end.x * width
  const by = end.y * height
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function douglasPeucker(points: UnitPoint[], epsilonPx: number, width: number, height: number): UnitPoint[] {
  if (points.length <= 2) return points

  let maxDistance = 0
  let maxIndex = 0
  const first = points[0]!
  const last = points[points.length - 1]!
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointDistanceToSegmentPx(points[index]!, first, last, width, height)
    if (distance > maxDistance) {
      maxDistance = distance
      maxIndex = index
    }
  }

  if (maxDistance <= epsilonPx) return [first, last]

  const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilonPx, width, height)
  const right = douglasPeucker(points.slice(maxIndex), epsilonPx, width, height)
  return [...left.slice(0, -1), ...right]
}

function capPoints(points: UnitPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points
  if (maxPoints <= 2) return [points[0]!, points[points.length - 1]!]

  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round((index * (points.length - 1)) / (maxPoints - 1))
    return points[sourceIndex]!
  })
}

function simplifyPointsForStorage({
  points,
  epsilonPx,
  maxPoints,
  width,
  height,
}: {
  points: UnitPoint[]
  epsilonPx: number
  maxPoints: number
  width: number
  height: number
}) {
  const simplified = douglasPeucker(points, epsilonPx, width, height)
  return capPoints(simplified, maxPoints)
}

function clampUnitPoint(point: UnitPoint): UnitPoint {
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  }
}

function buildShapeWithCompression({
  calibration,
  epsilonPx,
  maxPointsPerSegment,
}: {
  calibration: ScreenshotRouteCalibration
  epsilonPx: number
  maxPointsPerSegment: number
}): PersistedScreenshotRouteShape | null {
  if (calibration.controlPoints.length < 2 || !calibration.imageSize) return null

  const imageWidth = Math.round(calibration.imageSize.width)
  const imageHeight = Math.round(calibration.imageSize.height)
  const segments = calibration.segments.flatMap((segment) => {
    const resolution = segment.resolution === 'unresolved' ? 'user_confirmed_shape' : segment.resolution
    const rawPoints = resolution === 'accepted_gap' ? [] : segmentDrawablePoints({ ...segment, resolution }).map(clampUnitPoint)
    const points = resolution === 'accepted_gap'
      ? []
      : simplifyPointsForStorage({
          points: rawPoints,
          epsilonPx,
          maxPoints: maxPointsPerSegment,
          width: imageWidth,
          height: imageHeight,
        })
    if (resolution !== 'accepted_gap' && points.length < 2) return []
    return [{
      id: segment.id,
      fromId: segment.fromId,
      toId: segment.toId,
      resolution,
      points,
    }]
  })

  const hasDrawable = segments.some((segment) => segment.resolution !== 'accepted_gap' && segment.points.length >= 2)
  if (!hasDrawable) return null

  return {
    schemaVersion: 1,
    kind: 'screenshot_route_shape',
    coordinateSpace: 'normalized_screenshot',
    source: 'user_seeded_livewire',
    image: {
      width: imageWidth,
      height: imageHeight,
    },
    controlPoints: calibration.controlPoints.map((point) => ({
      id: point.id,
      ...clampUnitPoint(point),
    })),
    segments,
    createdAt: new Date().toISOString(),
  }
}

export function buildPersistableScreenshotRouteShape(
  calibration: ScreenshotRouteCalibration,
): PersistedScreenshotRouteShape | null {
  let epsilonPx = ROUTE_SHAPE_SIMPLIFY_START_EPSILON_PX
  let maxPointsPerSegment = ROUTE_SHAPE_INITIAL_POINTS_PER_SEGMENT
  let bestShape: PersistedScreenshotRouteShape | null = null

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const shape = buildShapeWithCompression({ calibration, epsilonPx, maxPointsPerSegment })
    if (!shape) return null
    bestShape = shape
    const metrics = measureScreenshotRouteShape(shape)
    if (
      metrics.serializedByteSize <= ROUTE_SHAPE_STORAGE_TARGET_BYTES &&
      metrics.segments <= SCREENSHOT_ROUTE_SHAPE_LIMITS.maxSegments &&
      metrics.maxPointsPerSegment <= SCREENSHOT_ROUTE_SHAPE_LIMITS.maxPointsPerSegment
    ) {
      return shape
    }

    if (epsilonPx < ROUTE_SHAPE_SIMPLIFY_MAX_EPSILON_PX) {
      epsilonPx = Math.min(ROUTE_SHAPE_SIMPLIFY_MAX_EPSILON_PX, epsilonPx * 1.55)
    } else {
      maxPointsPerSegment = Math.max(ROUTE_SHAPE_MIN_POINTS_PER_SEGMENT, Math.floor(maxPointsPerSegment * 0.72))
    }
  }

  return bestShape
}

export function validateScreenshotRouteShape(value: unknown): ScreenshotRouteShapeValidationResult {
  if (value === null || value === undefined) return { ok: true, shape: null }
  if (!value || typeof value !== 'object') return { ok: false, error: 'routeShape invalid' }
  if (serializedByteSize(value) > SCREENSHOT_ROUTE_SHAPE_LIMITS.maxBytes) {
    return { ok: false, error: 'routeShape too large' }
  }

  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== 1 ||
    record.kind !== 'screenshot_route_shape' ||
    record.coordinateSpace !== 'normalized_screenshot' ||
    record.source !== 'user_seeded_livewire'
  ) {
    return { ok: false, error: 'routeShape invalid' }
  }

  const image = record.image as Record<string, unknown> | null
  const width = Number(image?.width)
  const height = Number(image?.height)
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > SCREENSHOT_ROUTE_SHAPE_LIMITS.maxImageDimension ||
    height > SCREENSHOT_ROUTE_SHAPE_LIMITS.maxImageDimension
  ) {
    return { ok: false, error: 'routeShape image invalid' }
  }

  if (!Array.isArray(record.controlPoints) || record.controlPoints.length > SCREENSHOT_ROUTE_SHAPE_LIMITS.maxControlPoints) {
    return { ok: false, error: 'routeShape controlPoints invalid' }
  }

  const controlPoints = record.controlPoints.map((point, index) => {
    const normalized = normalizePoint(point)
    if (!normalized) return null
    return {
      id: safeId((point as Record<string, unknown>).id, `cp_${index}`),
      ...normalized,
    }
  })
  if (controlPoints.some((point) => point === null)) return { ok: false, error: 'routeShape controlPoints invalid' }

  if (!Array.isArray(record.segments) || record.segments.length > SCREENSHOT_ROUTE_SHAPE_LIMITS.maxSegments) {
    return { ok: false, error: 'routeShape segments invalid' }
  }

  const segments = record.segments.map((segment, index) => {
    if (!segment || typeof segment !== 'object') return null
    const raw = segment as Record<string, unknown>
    const resolution = normalizeResolution(raw.resolution)
    if (!resolution) return null
    const rawPoints = Array.isArray(raw.points) ? raw.points : []
    if (rawPoints.length > SCREENSHOT_ROUTE_SHAPE_LIMITS.maxPointsPerSegment) return null
    if (resolution !== 'accepted_gap' && rawPoints.length < 2) return null
    const points = rawPoints.map(normalizePoint)
    if (points.some((point) => point === null)) return null
    return {
      id: safeId(raw.id, `seg_${index}`),
      fromId: safeId(raw.fromId, `from_${index}`),
      toId: safeId(raw.toId, `to_${index}`),
      resolution,
      points: points as UnitPoint[],
    }
  })
  if (segments.some((segment) => segment === null)) return { ok: false, error: 'routeShape segments invalid' }

  const hasDrawable = segments.some((segment) => segment?.resolution !== 'accepted_gap' && (segment?.points.length ?? 0) >= 2)
  if (!hasDrawable) return { ok: true, shape: null }

  const createdAt = typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
    ? new Date(record.createdAt).toISOString()
    : new Date().toISOString()

  return {
    ok: true,
    shape: {
      schemaVersion: 1,
      kind: 'screenshot_route_shape',
      coordinateSpace: 'normalized_screenshot',
      source: 'user_seeded_livewire',
      image: { width: Math.round(width), height: Math.round(height) },
      controlPoints: controlPoints as CalibrationControlPoint[],
      segments: segments as PersistedScreenshotRouteShape['segments'],
      createdAt,
    },
  }
}
