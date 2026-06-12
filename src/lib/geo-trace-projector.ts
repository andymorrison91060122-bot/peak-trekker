export type GeoTracePoint = {
  lat: number
  lng: number
}

export type GeoTraceFrame = {
  x?: number
  y?: number
  width: number
  height: number
  padding?: number
}

export type GeoTraceProjectedPoint<TPoint extends GeoTracePoint = GeoTracePoint> = TPoint & {
  x: number
  y: number
}

export type GeoTraceProjectorMeta = {
  validBoundsPointCount: number
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  midLat: number
  lngScale: number
  latRange: number
  lngRange: number
  effectiveLngRange: number
  range: number
  scale: number
  offsetX: number
  offsetY: number
  frame: Required<GeoTraceFrame>
}

export type GeoTraceProjector = {
  projectPoint: <TPoint extends GeoTracePoint>(point: TPoint) => GeoTraceProjectedPoint<TPoint>
  projectPoints: <TPoint extends GeoTracePoint>(points: TPoint[]) => GeoTraceProjectedPoint<TPoint>[]
  buildPath: <TPoint extends GeoTracePoint>(points: TPoint[]) => string | null
  meta: GeoTraceProjectorMeta
}

const COORDINATE_EPSILON = 0.0000001

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

function formatCoord(value: number) {
  return Number(value.toFixed(2))
}

export function isValidGeoTracePoint(point: GeoTracePoint | null | undefined) {
  return Boolean(
    point &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      point.lat >= -90 &&
      point.lat <= 90 &&
      point.lng >= -180 &&
      point.lng <= 180 &&
      !(point.lat === 0 && point.lng === 0),
  )
}

export function createGeoTraceProjector(boundsPoints: GeoTracePoint[], frame: GeoTraceFrame): GeoTraceProjector {
  const safeFrame = {
    x: frame.x ?? 0,
    y: frame.y ?? 0,
    width: Math.max(1, frame.width),
    height: Math.max(1, frame.height),
    padding: Math.max(0, Math.min(frame.padding ?? 0, Math.min(Math.max(1, frame.width), Math.max(1, frame.height)) / 2)),
  }
  const validBoundsPoints = boundsPoints.filter(isValidGeoTracePoint)
  const fallbackPoint = validBoundsPoints[0] ?? { lat: 0, lng: 0 }
  let minLat = fallbackPoint.lat
  let maxLat = fallbackPoint.lat
  let minLng = fallbackPoint.lng
  let maxLng = fallbackPoint.lng

  for (const point of validBoundsPoints) {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }

  const latRange = maxLat - minLat
  const lngRange = maxLng - minLng
  const midLat = (minLat + maxLat) / 2
  const lngScale = Math.max(Math.cos((midLat * Math.PI) / 180), 0.1)
  const effectiveLngRange = lngRange * lngScale
  const range = Math.max(latRange, effectiveLngRange, COORDINATE_EPSILON)
  const innerWidth = Math.max(1, safeFrame.width - safeFrame.padding * 2)
  const innerHeight = Math.max(1, safeFrame.height - safeFrame.padding * 2)
  const scale = Math.min(innerWidth, innerHeight)
  const offsetX = (innerWidth - scale) / 2
  const offsetY = (innerHeight - scale) / 2

  const meta: GeoTraceProjectorMeta = {
    validBoundsPointCount: validBoundsPoints.length,
    minLat,
    maxLat,
    minLng,
    maxLng,
    midLat,
    lngScale,
    latRange,
    lngRange,
    effectiveLngRange,
    range,
    scale,
    offsetX,
    offsetY,
    frame: safeFrame,
  }

  function projectPoint<TPoint extends GeoTracePoint>(point: TPoint): GeoTraceProjectedPoint<TPoint> {
    if (!isValidGeoTracePoint(point)) {
      return {
        ...point,
        x: formatCoord(safeFrame.x + safeFrame.width / 2),
        y: formatCoord(safeFrame.y + safeFrame.height / 2),
      }
    }

    const xUnit = (((point.lng - minLng) * lngScale) + (range - effectiveLngRange) / 2) / range
    const yUnit = ((maxLat - point.lat) + (range - latRange) / 2) / range

    return {
      ...point,
      x: formatCoord(safeFrame.x + safeFrame.padding + offsetX + clampUnit(xUnit) * scale),
      y: formatCoord(safeFrame.y + safeFrame.padding + offsetY + clampUnit(yUnit) * scale),
    }
  }

  function projectPoints<TPoint extends GeoTracePoint>(points: TPoint[]) {
    return points.filter(isValidGeoTracePoint).map(projectPoint)
  }

  function buildPath<TPoint extends GeoTracePoint>(points: TPoint[]) {
    const projected = projectPoints(points)
    if (projected.length < 2) return null
    return projected.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  }

  return {
    projectPoint,
    projectPoints,
    buildPath,
    meta,
  }
}
