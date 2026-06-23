import { clamp } from './math.ts'

export type UnitPoint = {
  x: number
  y: number
}

export type PixelPoint = {
  x: number
  y: number
}

export type PseudoTrackPoint = {
  latitude: number
  longitude: number
}

export type ScoreField = {
  width: number
  height: number
  evidence: Float32Array
}

type AstarResult = {
  points: PixelPoint[]
  cost: number
  expanded: number
}

export type AnchorColorCenter = {
  h: number
  s: number
  v: number
  anchorIndex: number
  sampleCount: number
}

export type AnchorColorModel = {
  centers: AnchorColorCenter[]
  totalSamples: number
  skippedAnchors: number[]
}

export type LivewireSegmentStatus = 'snapped' | 'low_evidence_straight' | 'needs_more_anchor' | 'honest_gap'

export type LivewireSegmentMetrics = {
  meanEvidence: number
  lowEvidenceRatio: number
  longestLowRunPx: number
  pathLengthPx: number
  directLengthPx: number
  detourRatio: number
  maxCorridorDistancePx: number
  corridorPixels: number
}

export type LivewireSegmentResult = {
  status: LivewireSegmentStatus
  path: PixelPoint[]
  metrics: LivewireSegmentMetrics
  cost: number | null
  expanded: number
  rejectionReasons: string[]
}

const DEFAULT_PSEUDO_COORDINATE_EPSILON = 0.0001

function distancePointToSegment(point: PixelPoint, a: PixelPoint, b: PixelPoint) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy || 1
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1)
  const px = a.x + dx * t
  const py = a.y + dy * t
  return Math.hypot(point.x - px, point.y - py)
}

function normalizeHueDelta(a: number, b: number) {
  const delta = Math.abs(a - b) % 360
  return Math.min(delta, 360 - delta) / 180
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0

  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }

  return {
    h,
    s: max === 0 ? 0 : d / max,
    v: max,
  }
}

function pixelIndex(width: number, x: number, y: number) {
  return y * width + x
}

export function unitToPixel(point: UnitPoint, width: number, height: number): PixelPoint {
  return {
    x: clamp(point.x, 0, 1) * Math.max(0, width - 1),
    y: clamp(point.y, 0, 1) * Math.max(0, height - 1),
  }
}

export function pixelToUnit(point: PixelPoint, width: number, height: number): UnitPoint {
  return {
    x: width <= 1 ? 0 : clamp(point.x / (width - 1), 0, 1),
    y: height <= 1 ? 0 : clamp(point.y / (height - 1), 0, 1),
  }
}

export function encodeUnitPointsToPseudoTrackPoints(
  points: UnitPoint[],
  epsilon = DEFAULT_PSEUDO_COORDINATE_EPSILON,
): PseudoTrackPoint[] {
  const safeEpsilon = clamp(epsilon, 0.000001, 0.05)
  const scale = 1 - safeEpsilon * 2

  return points.map((point) => ({
    longitude: safeEpsilon + clamp(point.x, 0, 1) * scale,
    latitude: safeEpsilon + (1 - clamp(point.y, 0, 1)) * scale,
  }))
}

function pathLength(points: PixelPoint[]) {
  let length = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    length += Math.hypot(current.x - previous.x, current.y - previous.y)
  }
  return length
}

function collectAnchorSamples({
  rgba,
  width,
  height,
  anchor,
  anchorIndex,
  sampleRadius,
}: {
  rgba: Uint8ClampedArray | Buffer
  width: number
  height: number
  anchor: PixelPoint
  anchorIndex: number
  sampleRadius: number
}) {
  const samples: Array<{ h: number; s: number; v: number; anchorIndex: number }> = []
  const cx = Math.round(anchor.x)
  const cy = Math.round(anchor.y)
  const innerRadius = Math.max(1, Math.round(sampleRadius * 0.25))

  for (let y = Math.max(0, cy - sampleRadius); y <= Math.min(height - 1, cy + sampleRadius); y += 1) {
    for (let x = Math.max(0, cx - sampleRadius); x <= Math.min(width - 1, cx + sampleRadius); x += 1) {
      const dist = Math.hypot(x - cx, y - cy)
      if (dist > sampleRadius || dist < innerRadius) continue
      const offset = pixelIndex(width, x, y) * 4
      const hsv = rgbToHsv(Number(rgba[offset]), Number(rgba[offset + 1]), Number(rgba[offset + 2]))
      if (hsv.s < 0.18 || hsv.v < 0.18) continue
      samples.push({ ...hsv, anchorIndex })
    }
  }

  return samples
}

export function buildAnchorColorModel({
  rgba,
  width,
  height,
  anchors,
  sampleRadius = 10,
  minSamplesPerAnchor = 6,
}: {
  rgba: Uint8ClampedArray | Buffer
  width: number
  height: number
  anchors: PixelPoint[]
  sampleRadius?: number
  minSamplesPerAnchor?: number
}): AnchorColorModel {
  const centers: AnchorColorCenter[] = []
  const skippedAnchors: number[] = []
  let totalSamples = 0

  for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex += 1) {
    const anchor = anchors[anchorIndex]!
    const samples = collectAnchorSamples({ rgba, width, height, anchor, anchorIndex, sampleRadius })
    if (samples.length < minSamplesPerAnchor) {
      skippedAnchors.push(anchorIndex)
      continue
    }

    totalSamples += samples.length
    centers.push({
      h: samples.reduce((sum, item) => sum + item.h, 0) / samples.length,
      s: samples.reduce((sum, item) => sum + item.s, 0) / samples.length,
      v: samples.reduce((sum, item) => sum + item.v, 0) / samples.length,
      anchorIndex,
      sampleCount: samples.length,
    })
  }

  if (centers.length === 0 && anchors.length > 0) {
    for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex += 1) {
      const anchor = anchors[anchorIndex]!
      const x = Math.round(clamp(anchor.x, 0, width - 1))
      const y = Math.round(clamp(anchor.y, 0, height - 1))
      const offset = pixelIndex(width, x, y) * 4
      const hsv = rgbToHsv(Number(rgba[offset]), Number(rgba[offset + 1]), Number(rgba[offset + 2]))
      centers.push({ ...hsv, anchorIndex, sampleCount: 1 })
      totalSamples += 1
    }
    skippedAnchors.length = 0
  }

  return { centers, totalSamples, skippedAnchors }
}

function scorePixelAgainstCenters(hsv: { h: number; s: number; v: number }, centers: AnchorColorCenter[]) {
  if (centers.length === 0) return 0
  let best = 0
  for (const center of centers) {
    const hue = normalizeHueDelta(hsv.h, center.h)
    const sat = Math.abs(hsv.s - center.s)
    const val = Math.abs(hsv.v - center.v)
    const colorScore = Math.exp(-(hue * hue * 18 + sat * sat * 3.2 + val * val * 2.2))
    const saturationBoost = clamp((hsv.s - 0.08) / 0.4, 0, 1)
    best = Math.max(best, colorScore * (0.45 + saturationBoost * 0.55))
  }
  return clamp(best, 0, 1)
}

export function buildAnchorEvidenceField({
  rgba,
  width,
  height,
  colorModel,
}: {
  rgba: Uint8ClampedArray | Buffer
  width: number
  height: number
  colorModel: AnchorColorModel
}): ScoreField {
  const evidence = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelIndex(width, x, y) * 4
      const hsv = rgbToHsv(Number(rgba[offset]), Number(rgba[offset + 1]), Number(rgba[offset + 2]))
      evidence[pixelIndex(width, x, y)] = scorePixelAgainstCenters(hsv, colorModel.centers)
    }
  }
  return { width, height, evidence }
}

function buildCorridorMask({
  width,
  height,
  start,
  end,
  corridorWidth,
}: {
  width: number
  height: number
  start: PixelPoint
  end: PixelPoint
  corridorWidth: number
}) {
  const mask = new Uint8Array(width * height)
  let corridorPixels = 0
  const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - corridorWidth - 2))
  const maxX = Math.min(width - 1, Math.ceil(Math.max(start.x, end.x) + corridorWidth + 2))
  const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - corridorWidth - 2))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(start.y, end.y) + corridorWidth + 2))

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (distancePointToSegment({ x, y }, start, end) > corridorWidth) continue
      mask[pixelIndex(width, x, y)] = 1
      corridorPixels += 1
    }
  }

  return { mask, corridorPixels }
}

function measureSegmentMetrics({
  field,
  points,
  start,
  end,
  corridorPixels,
  lowThreshold,
}: {
  field: ScoreField
  points: PixelPoint[]
  start: PixelPoint
  end: PixelPoint
  corridorPixels: number
  lowThreshold: number
}): LivewireSegmentMetrics {
  if (points.length === 0) {
    return {
      meanEvidence: 0,
      lowEvidenceRatio: 1,
      longestLowRunPx: 0,
      pathLengthPx: 0,
      directLengthPx: Math.hypot(end.x - start.x, end.y - start.y),
      detourRatio: Infinity,
      maxCorridorDistancePx: 0,
      corridorPixels,
    }
  }

  let sum = 0
  let low = 0
  let currentRun = 0
  let longestLowRunPx = 0
  let maxCorridorDistancePx = 0
  for (const point of points) {
    const x = Math.round(clamp(point.x, 0, field.width - 1))
    const y = Math.round(clamp(point.y, 0, field.height - 1))
    const evidence = field.evidence[pixelIndex(field.width, x, y)]!
    sum += evidence
    maxCorridorDistancePx = Math.max(maxCorridorDistancePx, distancePointToSegment({ x, y }, start, end))
    if (evidence < lowThreshold) {
      low += 1
      currentRun += 1
      longestLowRunPx = Math.max(longestLowRunPx, currentRun)
    } else {
      currentRun = 0
    }
  }

  const directLengthPx = Math.hypot(end.x - start.x, end.y - start.y)
  const segmentPathLength = pathLength(points)
  return {
    meanEvidence: sum / points.length,
    lowEvidenceRatio: low / points.length,
    longestLowRunPx,
    pathLengthPx: segmentPathLength,
    directLengthPx,
    detourRatio: segmentPathLength / Math.max(1, directLengthPx),
    maxCorridorDistancePx,
    corridorPixels,
  }
}

export function findLocalLivewireSegment({
  field,
  start,
  end,
  corridorWidth = 36,
  snapRadius = 16,
  lowThreshold = 0.34,
}: {
  field: ScoreField
  start: PixelPoint
  end: PixelPoint
  corridorWidth?: number
  snapRadius?: number
  lowThreshold?: number
}): LivewireSegmentResult {
  const result = findAstarPath({
    field,
    start,
    end,
    snapRadius,
    corridorWidth: Math.max(1, corridorWidth * 0.45),
    hardCorridorWidth: corridorWidth,
  })
  const corridor = buildCorridorMask({ width: field.width, height: field.height, start, end, corridorWidth })
  const path = result?.points ?? []
  const metrics = measureSegmentMetrics({
    field,
    points: path,
    start,
    end,
    corridorPixels: corridor.corridorPixels,
    lowThreshold,
  })
  const rejectionReasons = [
    ...(path.length === 0 ? ['astar_no_path'] : []),
    ...(metrics.meanEvidence < 0.44 ? ['mean_evidence_low'] : []),
    ...(metrics.lowEvidenceRatio > 0.42 ? ['low_evidence_ratio'] : []),
    ...(metrics.longestLowRunPx > Math.max(18, Math.round(Math.min(field.width, field.height) * 0.055)) ? ['long_low_evidence_run'] : []),
    ...(metrics.detourRatio > 1.9 ? ['detour_high'] : []),
    ...(metrics.maxCorridorDistancePx > corridorWidth + 0.5 ? ['outside_corridor'] : []),
  ]
  const directLength = metrics.directLengthPx
  let status: LivewireSegmentStatus = 'snapped'

  if (path.length === 0) {
    status = directLength <= 70 ? 'low_evidence_straight' : 'needs_more_anchor'
  } else if (metrics.meanEvidence < 0.18 || metrics.lowEvidenceRatio > 0.76) {
    status = 'honest_gap'
  } else if (rejectionReasons.length === 0) {
    status = 'snapped'
  } else if (directLength <= 74 && metrics.detourRatio <= 1.25 && metrics.lowEvidenceRatio <= 0.62) {
    status = 'low_evidence_straight'
  } else if (metrics.longestLowRunPx > Math.max(32, Math.round(Math.min(field.width, field.height) * 0.095))) {
    status = 'honest_gap'
  } else {
    status = 'needs_more_anchor'
  }

  return {
    status,
    path,
    metrics,
    cost: result?.cost ?? null,
    expanded: result?.expanded ?? 0,
    rejectionReasons,
  }
}

class MinHeap<T> {
  private readonly items: Array<{ item: T; priority: number }> = []

  get size() {
    return this.items.length
  }

  push(item: T, priority: number) {
    this.items.push({ item, priority })
    this.bubbleUp(this.items.length - 1)
  }

  pop(): T | null {
    if (this.items.length === 0) return null
    const root = this.items[0]!
    const tail = this.items.pop()!
    if (this.items.length > 0) {
      this.items[0] = tail
      this.bubbleDown(0)
    }
    return root.item
  }

  private bubbleUp(index: number) {
    let current = index
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2)
      if (this.items[parent]!.priority <= this.items[current]!.priority) break
      ;[this.items[parent], this.items[current]] = [this.items[current]!, this.items[parent]!]
      current = parent
    }
  }

  private bubbleDown(index: number) {
    let current = index
    while (true) {
      const left = current * 2 + 1
      const right = current * 2 + 2
      let smallest = current
      if (left < this.items.length && this.items[left]!.priority < this.items[smallest]!.priority) smallest = left
      if (right < this.items.length && this.items[right]!.priority < this.items[smallest]!.priority) smallest = right
      if (smallest === current) break
      ;[this.items[current], this.items[smallest]] = [this.items[smallest]!, this.items[current]!]
      current = smallest
    }
  }
}

function snapToEvidence(field: ScoreField, point: PixelPoint, radius: number) {
  let best = {
    point: {
      x: Math.round(clamp(point.x, 0, field.width - 1)),
      y: Math.round(clamp(point.y, 0, field.height - 1)),
    },
    score: -Infinity,
  }
  const cx = Math.round(point.x)
  const cy = Math.round(point.y)
  for (let y = Math.max(0, cy - radius); y <= Math.min(field.height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(field.width - 1, cx + radius); x += 1) {
      const dist = Math.hypot(x - point.x, y - point.y)
      if (dist > radius) continue
      const score = field.evidence[pixelIndex(field.width, x, y)]! - dist / Math.max(1, radius) * 0.18
      if (score > best.score) best = { point: { x, y }, score }
    }
  }
  return best.point
}

function findAstarPath({
  field,
  start,
  end,
  snapRadius = 24,
  corridorWidth = 42,
  hardCorridorWidth,
}: {
  field: ScoreField
  start: PixelPoint
  end: PixelPoint
  snapRadius?: number
  corridorWidth?: number
  hardCorridorWidth?: number
}): AstarResult | null {
  const startPoint = snapToEvidence(field, start, snapRadius)
  const endPoint = snapToEvidence(field, end, snapRadius)
  const startIndex = pixelIndex(field.width, startPoint.x, startPoint.y)
  const endIndex = pixelIndex(field.width, endPoint.x, endPoint.y)
  const open = new MinHeap<number>()
  const gScore = new Float32Array(field.width * field.height)
  const cameFrom = new Int32Array(field.width * field.height)
  const closed = new Uint8Array(field.width * field.height)
  gScore.fill(Number.POSITIVE_INFINITY)
  cameFrom.fill(-1)
  gScore[startIndex] = 0
  open.push(startIndex, Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y))

  const neighbors = [
    [-1, -1, Math.SQRT2],
    [0, -1, 1],
    [1, -1, Math.SQRT2],
    [-1, 0, 1],
    [1, 0, 1],
    [-1, 1, Math.SQRT2],
    [0, 1, 1],
    [1, 1, Math.SQRT2],
  ] as const
  let expanded = 0

  while (open.size > 0) {
    const current = open.pop()!
    if (closed[current]) continue
    if (current === endIndex) {
      const points: PixelPoint[] = []
      let cursor = current
      while (cursor >= 0) {
        points.push({ x: cursor % field.width, y: Math.floor(cursor / field.width) })
        cursor = cameFrom[cursor]!
      }
      points.reverse()
      return { points, cost: gScore[current]!, expanded }
    }
    closed[current] = 1
    expanded += 1

    const x = current % field.width
    const y = Math.floor(current / field.width)
    for (const [dx, dy, step] of neighbors) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= field.width || ny >= field.height) continue
      const nextIndex = pixelIndex(field.width, nx, ny)
      if (closed[nextIndex]) continue
      const evidence = field.evidence[nextIndex]!
      const corridorDistance = distancePointToSegment({ x: nx, y: ny }, startPoint, endPoint)
      if (hardCorridorWidth !== undefined && corridorDistance > hardCorridorWidth) continue
      const corridorPenalty = Math.max(0, corridorDistance - corridorWidth) / Math.max(1, corridorWidth)
      const stepCost = step * (1 + Math.pow(1 - evidence, 2) * 7 + corridorPenalty * 3.5)
      const nextScore = gScore[current]! + stepCost
      if (nextScore >= gScore[nextIndex]!) continue
      cameFrom[nextIndex] = current
      gScore[nextIndex] = nextScore
      const heuristic = Math.hypot(endPoint.x - nx, endPoint.y - ny)
      open.push(nextIndex, nextScore + heuristic)
    }
  }

  return null
}
