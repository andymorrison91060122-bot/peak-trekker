import {
  createGeoTraceProjector,
  isValidGeoTracePoint,
  type GeoTraceFrame,
  type GeoTracePoint,
  type GeoTraceProjectedPoint,
} from './geo-trace-projector.ts'

export type MountainRouteDisplayMode = 'map' | 'trace_only'

export type MountainRoutePoint = GeoTracePoint & {
  elevation: number | null
}

export type MountainRouteGeometry = {
  id: string
  mountainId: string
  displayMode: MountainRouteDisplayMode
  bbox: readonly [number, number, number, number]
  lines: MountainRoutePoint[][]
  pointCount: number
  segmentCount: number
}

export type MountainRouteTraceViewModel = {
  paths: string[]
  start: GeoTraceProjectedPoint<MountainRoutePoint>
  end: GeoTraceProjectedPoint<MountainRoutePoint>
  sourcePointCount: number
}

type MountainRouteGeometryRow = {
  id?: unknown
  mountain_id?: unknown
  simplified_geometry?: unknown
  display_mode?: unknown
  review_status?: unknown
  point_count?: unknown
  segment_count?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePoint(value: unknown): MountainRoutePoint | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const [lng, lat, elevation] = value
  const point = {
    lng: typeof lng === 'number' ? lng : Number.NaN,
    lat: typeof lat === 'number' ? lat : Number.NaN,
    elevation: typeof elevation === 'number' && Number.isFinite(elevation) ? elevation : null,
  }
  return isValidGeoTracePoint(point) ? point : null
}

function buildBbox(lines: MountainRoutePoint[][]) {
  const points = lines.flat()
  return [
    Math.min(...points.map((point) => point.lng)),
    Math.min(...points.map((point) => point.lat)),
    Math.max(...points.map((point) => point.lng)),
    Math.max(...points.map((point) => point.lat)),
  ] as const
}

export function normalizeApprovedRouteGeometry(row: MountainRouteGeometryRow | null | undefined): MountainRouteGeometry | null {
  if (!row || row.review_status !== 'approved') return null
  if (typeof row.id !== 'string' || typeof row.mountain_id !== 'string') return null
  if (row.display_mode !== 'map' && row.display_mode !== 'trace_only') return null
  if (!isRecord(row.simplified_geometry) || row.simplified_geometry.type !== 'MultiLineString') return null

  const rawLines = row.simplified_geometry.coordinates
  if (!Array.isArray(rawLines) || rawLines.length === 0) return null

  const lines: MountainRoutePoint[][] = []
  for (const rawLine of rawLines) {
    if (!Array.isArray(rawLine) || rawLine.length < 2) return null
    const line = rawLine.map(normalizePoint)
    if (line.some((point) => point === null)) return null
    lines.push(line as MountainRoutePoint[])
  }

  const pointCount = lines.reduce((sum, line) => sum + line.length, 0)
  if (typeof row.point_count === 'number' && row.point_count !== pointCount) return null
  if (typeof row.segment_count === 'number' && row.segment_count !== lines.length) return null

  return {
    id: row.id,
    mountainId: row.mountain_id,
    displayMode: row.display_mode,
    bbox: buildBbox(lines),
    lines,
    pointCount,
    segmentCount: lines.length,
  }
}

export function routeGeometryToFeature(geometry: MountainRouteGeometry): GeoJSON.Feature<GeoJSON.MultiLineString> {
  return {
    type: 'Feature',
    geometry: {
      type: 'MultiLineString',
      coordinates: geometry.lines.map((line) =>
        line.map((point) =>
          point.elevation === null
            ? [point.lng, point.lat]
            : [point.lng, point.lat, point.elevation],
        ),
      ),
    },
    properties: {},
  }
}

export function buildRouteTraceViewModel(
  geometry: MountainRouteGeometry,
  frame: GeoTraceFrame,
): MountainRouteTraceViewModel {
  const points = geometry.lines.flat()
  const projector = createGeoTraceProjector(points, frame)
  const paths = geometry.lines.flatMap((line) => {
    const path = projector.buildPath(line)
    return path ? [path] : []
  })

  return {
    paths,
    start: projector.projectPoint(points[0]),
    end: projector.projectPoint(points[points.length - 1]),
    sourcePointCount: points.length,
  }
}
