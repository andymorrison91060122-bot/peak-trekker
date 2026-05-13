export type ShareTrackPreviewPoint = {
  x: number
  y: number
}

export type ShareTrackPreview = {
  points: ShareTrackPreviewPoint[]
  pointCount: number
  hasAltitude: boolean
}

export type ShareTrackFrame = {
  x?: number
  y?: number
  width: number
  height: number
  padding?: number
}

export type ShareTrackPath = {
  d: string
  start: ShareTrackPreviewPoint
  end: ShareTrackPreviewPoint
}

type ParsedTrackPoint = {
  lat: number
  lng: number
  altitude: number | null
}

const DEFAULT_MAX_POINTS = 96
const COORDINATE_EPSILON = 0.0000001

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

export function buildShareTrackPreview(rawTrackPoints: unknown, maxPoints = DEFAULT_MAX_POINTS): ShareTrackPreview | null {
  if (!Array.isArray(rawTrackPoints)) return null

  const parsed = rawTrackPoints.flatMap((point) => {
    const parsedPoint = parseTrackPoint(point)
    return parsedPoint ? [parsedPoint] : []
  })
  const deduped = parsed.filter((point, index) => index === 0 || !isSameCoordinate(point, parsed[index - 1]!))

  if (deduped.length < 2) return null

  const safeMaxPoints = Math.max(2, Math.floor(maxPoints))
  const sampled = sampleTrackPoints(deduped, safeMaxPoints)
  const lats = sampled.map((point) => point.lat)
  const lngs = sampled.map((point) => point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng

  return {
    points: sampled.map((point) => ({
      x: lngRange <= COORDINATE_EPSILON ? 0.5 : (point.lng - minLng) / lngRange,
      y: latRange <= COORDINATE_EPSILON ? 0.5 : (maxLat - point.lat) / latRange,
    })),
    pointCount: deduped.length,
    hasAltitude: deduped.some((point) => point.altitude !== null),
  }
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

function formatCoord(value: number) {
  return Number(value.toFixed(2))
}

function projectPoint(point: ShareTrackPreviewPoint, frame: Required<ShareTrackFrame>): ShareTrackPreviewPoint {
  return {
    x: formatCoord(frame.x + frame.padding + clampUnit(point.x) * (frame.width - frame.padding * 2)),
    y: formatCoord(frame.y + frame.padding + clampUnit(point.y) * (frame.height - frame.padding * 2)),
  }
}

export function buildShareTrackPath(
  preview: ShareTrackPreview | null | undefined,
  frame: ShareTrackFrame,
): ShareTrackPath | null {
  if (!preview || preview.points.length < 2) return null

  const safePadding = Math.max(0, Math.min(frame.padding ?? Math.min(frame.width, frame.height) * 0.1, Math.min(frame.width, frame.height) / 2))
  const resolvedFrame = {
    x: frame.x ?? 0,
    y: frame.y ?? 0,
    width: frame.width,
    height: frame.height,
    padding: safePadding,
  }

  if (resolvedFrame.width <= 0 || resolvedFrame.height <= 0) return null

  const points = preview.points.map((point) => projectPoint(point, resolvedFrame))
  const start = points[0]!
  const end = points.at(-1)!

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
    }
  }

  return {
    d: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
    start,
    end,
  }
}
