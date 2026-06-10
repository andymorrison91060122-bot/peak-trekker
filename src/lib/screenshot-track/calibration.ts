import {
  buildAnchorColorModel,
  buildAnchorEvidenceField,
  findLocalLivewireSegment,
  pixelToUnit,
  unitToPixel,
  type AnchorColorModel,
  type LivewireSegmentStatus,
  type ScoreField,
  type UnitPoint,
} from './geometry.ts'
import type { ShareTrackPreview } from '../share-track-preview.ts'

export type { UnitPoint } from './geometry.ts'

export type CalibrationSegmentResolution = 'snapped' | 'user_confirmed_shape' | 'accepted_gap' | 'unresolved'

export type CalibrationControlPoint = UnitPoint & {
  id: string
}

export type ScreenshotRouteSegment = {
  id: string
  fromId: string
  toId: string
  from: UnitPoint
  to: UnitPoint
  points: UnitPoint[]
  status: LivewireSegmentStatus
  resolution: CalibrationSegmentResolution
  metrics: {
    meanEvidence: number
    lowEvidenceRatio: number
    longestLowRunPx: number
    pathLengthPx: number
    directLengthPx: number
    detourRatio: number
    maxCorridorDistancePx: number
    corridorPixels: number
  }
  cost: number | null
  expanded: number
  rejectionReasons: string[]
  elapsedMs: number
}

export type ScreenshotRouteCalibration = {
  status: 'empty' | 'editing' | 'ready'
  controlPoints: CalibrationControlPoint[]
  segments: ScreenshotRouteSegment[]
  imageSize: {
    width: number
    height: number
    sampleWidth: number
    sampleHeight: number
  } | null
  worker: {
    supported: boolean
    fallback: boolean
    requestId: number
    version: number
    staleResultsDropped: number
  }
  colorModel: {
    centers: Array<{
      h: number
      s: number
      v: number
      anchorIndex: number
      sampleCount: number
    }>
    totalSamples: number
    skippedAnchors: number[]
  } | null
  updatedAt: number | null
}

export type LivewireSolveInput = {
  rgba: Uint8ClampedArray | Buffer
  width: number
  height: number
  controlPoints: CalibrationControlPoint[]
}

export type LivewireSolveResult = {
  segments: ScreenshotRouteSegment[]
  colorModel: ScreenshotRouteCalibration['colorModel']
  imageSize: {
    width: number
    height: number
    sampleWidth: number
    sampleHeight: number
  }
  elapsedMs: number
}

export type PosterPreviewSegment = {
  segmentId: string
  resolution: CalibrationSegmentResolution
  preview: ShareTrackPreview
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function segmentResolutionForStatus(status: LivewireSegmentStatus): CalibrationSegmentResolution {
  return status === 'snapped' ? 'snapped' : 'unresolved'
}

function directUnitLine(from: UnitPoint, to: UnitPoint): UnitPoint[] {
  return [from, to]
}

function metricSnapshot(segment: ReturnType<typeof findLocalLivewireSegment>['metrics']) {
  return {
    meanEvidence: Number(segment.meanEvidence.toFixed(4)),
    lowEvidenceRatio: Number(segment.lowEvidenceRatio.toFixed(4)),
    longestLowRunPx: Number(segment.longestLowRunPx.toFixed(1)),
    pathLengthPx: Number(segment.pathLengthPx.toFixed(1)),
    directLengthPx: Number(segment.directLengthPx.toFixed(1)),
    detourRatio: Number(segment.detourRatio.toFixed(4)),
    maxCorridorDistancePx: Number(segment.maxCorridorDistancePx.toFixed(1)),
    corridorPixels: segment.corridorPixels,
  }
}

function serializeColorModel(colorModel: AnchorColorModel): ScreenshotRouteCalibration['colorModel'] {
  return {
    centers: colorModel.centers.map((center) => ({
      h: Number(center.h.toFixed(2)),
      s: Number(center.s.toFixed(4)),
      v: Number(center.v.toFixed(4)),
      anchorIndex: center.anchorIndex,
      sampleCount: center.sampleCount,
    })),
    totalSamples: colorModel.totalSamples,
    skippedAnchors: [...colorModel.skippedAnchors],
  }
}

export function createEmptyScreenshotRouteCalibration(): ScreenshotRouteCalibration {
  return {
    status: 'empty',
    controlPoints: [],
    segments: [],
    imageSize: null,
    worker: {
      supported: typeof Worker !== 'undefined',
      fallback: false,
      requestId: 0,
      version: 0,
      staleResultsDropped: 0,
    },
    colorModel: null,
    updatedAt: null,
  }
}

export function resolveSegment(
  segment: ScreenshotRouteSegment,
  resolution: Exclude<CalibrationSegmentResolution, 'unresolved'>,
): ScreenshotRouteSegment {
  if (resolution === 'accepted_gap') {
    return {
      ...segment,
      points: [],
      resolution,
    }
  }

  if (resolution === 'user_confirmed_shape' && segment.points.length < 2) {
    return {
      ...segment,
      points: directUnitLine(segment.from, segment.to),
      resolution,
    }
  }

  return {
    ...segment,
    resolution,
  }
}

export function solveLivewireCalibration({
  rgba,
  width,
  height,
  controlPoints,
}: LivewireSolveInput): LivewireSolveResult {
  const startedAt = performance.now()
  if (controlPoints.length < 2) {
    return {
      segments: [],
      colorModel: null,
      imageSize: { width, height, sampleWidth: width, sampleHeight: height },
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    }
  }

  const pixelAnchors = controlPoints.map((point) => unitToPixel(point, width, height))
  const colorModel = buildAnchorColorModel({
    rgba,
    width,
    height,
    anchors: pixelAnchors,
    sampleRadius: Math.round(clamp(Math.min(width, height) * 0.025, 7, 14)),
    minSamplesPerAnchor: 4,
  })
  const field = buildAnchorEvidenceField({ rgba, width, height, colorModel })
  const minDim = Math.min(width, height)
  const segments: ScreenshotRouteSegment[] = []

  for (let index = 0; index < controlPoints.length - 1; index += 1) {
    const from = controlPoints[index]!
    const to = controlPoints[index + 1]!
    const start = pixelAnchors[index]!
    const end = pixelAnchors[index + 1]!
    const directLength = Math.hypot(end.x - start.x, end.y - start.y)
    const corridorWidth = Math.round(clamp(directLength * 0.18, Math.max(18, minDim * 0.045), Math.max(30, minDim * 0.12)))
    const snapRadius = Math.round(clamp(minDim * 0.028, 7, 18))
    const segmentStartedAt = performance.now()
    const result = findLocalLivewireSegment({
      field,
      start,
      end,
      corridorWidth,
      snapRadius,
    })
    const pathPoints =
      result.status === 'snapped'
        ? result.path.map((point) => pixelToUnit(point, width, height))
        : result.status === 'low_evidence_straight' || result.status === 'needs_more_anchor'
          ? directUnitLine(from, to)
          : []

    segments.push({
      id: `${from.id}_${to.id}`,
      fromId: from.id,
      toId: to.id,
      from,
      to,
      points: pathPoints,
      status: result.status,
      resolution: segmentResolutionForStatus(result.status),
      metrics: metricSnapshot(result.metrics),
      cost: result.cost === null ? null : Number(result.cost.toFixed(2)),
      expanded: result.expanded,
      rejectionReasons: result.rejectionReasons,
      elapsedMs: Number((performance.now() - segmentStartedAt).toFixed(1)),
    })
  }

  return {
    segments,
    colorModel: serializeColorModel(colorModel),
    imageSize: { width, height, sampleWidth: width, sampleHeight: height },
    elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
  }
}

export function mergeSolvedSegments(
  currentSegments: ScreenshotRouteSegment[],
  solvedSegments: ScreenshotRouteSegment[],
): ScreenshotRouteSegment[] {
  const resolutionById = new Map(currentSegments.map((segment) => [segment.id, segment.resolution]))
  return solvedSegments.map((segment) => {
    const previousResolution = resolutionById.get(segment.id)
    if (!previousResolution || previousResolution === 'unresolved') {
      return segment
    }
    return resolveSegment(segment, previousResolution)
  })
}

export function buildPosterPreviewSegments(segments: ScreenshotRouteSegment[]): PosterPreviewSegment[] {
  const drawable = segments
    .filter((segment) => segment.resolution !== 'accepted_gap')
    .filter((segment) => segment.resolution === 'snapped' || segment.resolution === 'user_confirmed_shape')
    .filter((segment) => segment.points.length > 0)

  const allPoints = drawable.flatMap((segment) => segment.points)
  if (allPoints.length === 0) return []

  const minX = Math.min(...allPoints.map((point) => point.x))
  const maxX = Math.max(...allPoints.map((point) => point.x))
  const minY = Math.min(...allPoints.map((point) => point.y))
  const maxY = Math.max(...allPoints.map((point) => point.y))
  const width = Math.max(maxX - minX, 0.000001)
  const height = Math.max(maxY - minY, 0.000001)
  const range = Math.max(width, height)
  const offsetX = (range - width) / 2
  const offsetY = (range - height) / 2

  return drawable.map((segment) => ({
    segmentId: segment.id,
    resolution: segment.resolution,
    preview: {
      points: segment.points.map((point) => ({
        x: (point.x - minX + offsetX) / range,
        y: (point.y - minY + offsetY) / range,
      })),
      pointCount: segment.points.length,
      hasAltitude: false,
    },
  }))
}

export function calculatePosterPreviewDelta(segments: ScreenshotRouteSegment[]) {
  const previews = buildPosterPreviewSegments(segments)
  const drawable = segments
    .filter((segment) => segment.resolution !== 'accepted_gap')
    .filter((segment) => segment.resolution === 'snapped' || segment.resolution === 'user_confirmed_shape')
    .filter((segment) => segment.points.length > 0)
  const previewBySegmentId = new Map(previews.map((preview) => [preview.segmentId, preview.preview.points]))
  const allPoints = drawable.flatMap((segment) => segment.points)
  if (allPoints.length === 0) return { maxDelta: 0, meanDelta: 0 }

  const minX = Math.min(...allPoints.map((point) => point.x))
  const maxX = Math.max(...allPoints.map((point) => point.x))
  const minY = Math.min(...allPoints.map((point) => point.y))
  const maxY = Math.max(...allPoints.map((point) => point.y))
  const width = Math.max(maxX - minX, 0.000001)
  const height = Math.max(maxY - minY, 0.000001)
  const range = Math.max(width, height)
  const offsetX = (range - width) / 2
  const offsetY = (range - height) / 2
  const deltas: number[] = []

  for (const segment of drawable) {
    const previewPoints = previewBySegmentId.get(segment.id) ?? []
    segment.points.forEach((point, index) => {
      const normalized = {
        x: (point.x - minX + offsetX) / range,
        y: (point.y - minY + offsetY) / range,
      }
      const previewPoint = previewPoints[index]
      if (!previewPoint) return
      deltas.push(Math.hypot(previewPoint.x - normalized.x, previewPoint.y - normalized.y))
    })
  }

  if (deltas.length === 0) return { maxDelta: 0, meanDelta: 0 }
  return {
    maxDelta: Math.max(...deltas),
    meanDelta: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
  }
}

export function fieldFromEvidence(field: ScoreField) {
  return field
}
