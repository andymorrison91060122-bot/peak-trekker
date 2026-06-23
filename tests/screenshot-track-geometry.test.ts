import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPosterPreviewSegments,
  calculatePosterPreviewDelta,
  createEmptyScreenshotRouteCalibration,
  resolveSegment,
  solveLivewireCalibration,
  type ScreenshotRouteSegment,
} from '../src/lib/screenshot-track/calibration.ts'
import {
  buildAnchorColorModel,
  buildAnchorEvidenceField,
  encodeUnitPointsToPseudoTrackPoints,
  findLocalLivewireSegment,
  type ScoreField,
  type UnitPoint,
} from '../src/lib/screenshot-track/geometry.ts'
import { clamp, normalizeBboxPoints } from '../src/lib/screenshot-track/math.ts'
import {
  buildPersistableScreenshotRouteShape,
  measureScreenshotRouteShape,
  SCREENSHOT_ROUTE_SHAPE_LIMITS,
  validateScreenshotRouteShape,
} from '../src/lib/screenshot-route-shape.ts'
import { buildShareTrackPreview } from '../src/lib/share-track-preview.ts'

test('screenshot-track math clamp preserves existing NaN propagation semantics', () => {
  assert.equal(clamp(-0.4, 0, 1), 0)
  assert.equal(clamp(1.4, 0, 1), 1)
  assert.equal(clamp(0.42, 0, 1), 0.42)
  assert.equal(Number.isNaN(clamp(Number.NaN, 0, 1)), true)
})

test('bbox normalizer preserves caller-specific minimum extent', () => {
  const tiny = [
    { x: 0.2, y: 0.2 },
    { x: 0.2000002, y: 0.2000002 },
  ]
  const geometryScale = normalizeBboxPoints(tiny, 0.0000001)
  const posterScale = normalizeBboxPoints(tiny, 0.000001)

  assert.ok(Math.abs(geometryScale[1]!.x - 1) < 0.000001)
  assert.ok(Math.abs(geometryScale[1]!.y - 1) < 0.000001)
  assert.ok(Math.abs(posterScale[1]!.x - 0.2) < 0.000001)
  assert.ok(Math.abs(posterScale[1]!.y - 0.2) < 0.000001)
})

test('pseudo track encoding avoids the 0,0 filter and preserves visible shape', () => {
  const points = [
    { x: 0, y: 1 },
    { x: 0.25, y: 0.2 },
    { x: 0.8, y: 0.4 },
    { x: 1, y: 0 },
  ]

  const encoded = encodeUnitPointsToPseudoTrackPoints(points)
  assert.equal(encoded.some((point) => point.latitude === 0 && point.longitude === 0), false)

  const preview = buildShareTrackPreview(encoded, Math.max(1, points.length))
  assert.equal(preview?.pointCount, points.length)
  assert.ok(preview, 'expected pseudo track points to render a preview')

  const normalizedEditor = normalizeBboxPoints(points, 0.0000001)
  const deltas = normalizedEditor.map((point, index) => {
    const rendered = preview.points[index]!
    return Math.hypot(point.x - rendered.x, point.y - rendered.y)
  })
  const maxDelta = Math.max(...deltas)
  assert.ok(maxDelta < 0.001, `expected WYSIWYG max delta < 0.001, got ${maxDelta}`)
})

test('local livewire reports unsupported long low-evidence gaps through the public segment result', () => {
  const width = 100
  const height = 30
  const evidence = new Float32Array(width * height)
  const index = (x: number, y: number) => y * width + x

  for (let x = 4; x < 96; x += 1) {
    if (x >= 35 && x <= 65) continue
    for (let y = 13; y <= 16; y += 1) evidence[index(x, y)] = 0.9
  }

  const field: ScoreField = { width, height, evidence }
  const result = findLocalLivewireSegment({
    field,
    start: { x: 5, y: 14 },
    end: { x: 94, y: 14 },
    snapRadius: 4,
    corridorWidth: 12,
  })

  assert.notEqual(result.status, 'snapped')
  assert.ok(result.rejectionReasons.includes('long_low_evidence_run'))
})

test('multi-anchor color model covers a gradient route better than one seed', () => {
  const width = 90
  const height = 30
  const rgba = new Uint8ClampedArray(width * height * 4)
  const index = (x: number, y: number) => (y * width + x) * 4

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = index(x, y)
      rgba[offset] = 22
      rgba[offset + 1] = 28
      rgba[offset + 2] = 24
      rgba[offset + 3] = 255
    }
  }
  for (let x = 10; x <= 80; x += 1) {
    for (let y = 13; y <= 16; y += 1) {
      const offset = index(x, y)
      const t = (x - 10) / 70
      rgba[offset] = Math.round(238 * (1 - t) + 55 * t)
      rgba[offset + 1] = Math.round(72 * (1 - t) + 225 * t)
      rgba[offset + 2] = Math.round(72 * (1 - t) + 120 * t)
      rgba[offset + 3] = 255
    }
  }

  const colorModel = buildAnchorColorModel({
    rgba,
    width,
    height,
    anchors: [
      { x: 12, y: 14 },
      { x: 78, y: 14 },
    ],
    sampleRadius: 5,
  })
  const field = buildAnchorEvidenceField({ rgba, width, height, colorModel })
  const leftScore = field.evidence[14 * width + 12]!
  const rightScore = field.evidence[14 * width + 78]!

  assert.equal(colorModel.centers.length, 2)
  assert.ok(leftScore > 0.55, `expected left gradient score > .55, got ${leftScore}`)
  assert.ok(rightScore > 0.55, `expected right gradient score > .55, got ${rightScore}`)
})

test('local livewire stays inside the anchor corridor instead of chasing an off-corridor lure', () => {
  const width = 120
  const height = 70
  const evidence = new Float32Array(width * height)
  const index = (x: number, y: number) => y * width + x

  for (let x = 10; x <= 110; x += 1) {
    evidence[index(x, 34)] = 0.72
    evidence[index(x, 35)] = 0.72
    evidence[index(x, 8)] = 0.98
    evidence[index(x, 9)] = 0.98
  }

  const field: ScoreField = { width, height, evidence }
  const result = findLocalLivewireSegment({
    field,
    start: { x: 10, y: 35 },
    end: { x: 110, y: 35 },
    corridorWidth: 10,
    snapRadius: 3,
  })

  assert.equal(result.status, 'snapped')
  const maxOffCorridor = Math.max(...result.path.map((point) => Math.abs(point.y - 35)))
  assert.ok(maxOffCorridor <= 10, `expected path to remain in corridor, max offset ${maxOffCorridor}`)
})

test('local livewire marks low evidence as a user decision instead of a snapped route', () => {
  const width = 96
  const height = 48
  const evidence = new Float32Array(width * height)
  const field: ScoreField = { width, height, evidence }
  const result = findLocalLivewireSegment({
    field,
    start: { x: 12, y: 24 },
    end: { x: 84, y: 24 },
    corridorWidth: 14,
    snapRadius: 2,
  })

  assert.notEqual(result.status, 'snapped')
  assert.ok(['needs_more_anchor', 'honest_gap', 'low_evidence_straight'].includes(result.status))
})

function fakeSegment(id: string, points: UnitPoint[], status: ScreenshotRouteSegment['status']): ScreenshotRouteSegment {
  return {
    id,
    fromId: `${id}-from`,
    toId: `${id}-to`,
    from: points[0] ?? { x: 0, y: 0 },
    to: points.at(-1) ?? { x: 1, y: 1 },
    points,
    status,
    resolution: status === 'snapped' ? 'snapped' : 'unresolved',
    metrics: {
      meanEvidence: status === 'snapped' ? 0.8 : 0.2,
      lowEvidenceRatio: status === 'snapped' ? 0.05 : 0.8,
      longestLowRunPx: status === 'snapped' ? 2 : 80,
      pathLengthPx: 10,
      directLengthPx: 10,
      detourRatio: 1,
      maxCorridorDistancePx: 2,
      corridorPixels: 100,
    },
    cost: 1,
    expanded: 12,
    rejectionReasons: status === 'snapped' ? [] : ['mean_evidence_low'],
    elapsedMs: 1,
  }
}

test('calibration debug resolution keeps accepted gaps disconnected and user-confirmed shape drawable', () => {
  const snapped = fakeSegment('s0', [{ x: 0.1, y: 0.7 }, { x: 0.4, y: 0.3 }], 'snapped')
  const unresolved = fakeSegment('s1', [{ x: 0.4, y: 0.3 }, { x: 0.8, y: 0.4 }], 'needs_more_anchor')

  const userConfirmedShape = resolveSegment(unresolved, 'user_confirmed_shape')
  assert.deepEqual(userConfirmedShape.points, unresolved.points)

  const acceptedGap = resolveSegment(unresolved, 'accepted_gap')
  assert.deepEqual(acceptedGap.points, [])
  const posterSegments = buildPosterPreviewSegments([snapped, acceptedGap])
  assert.equal(posterSegments.length, 1)
  assert.equal(posterSegments[0]?.segmentId, 's0')
})

test('persistable screenshot route shape is normalized and excludes unresolved/gap bridges', () => {
  const base = createEmptyScreenshotRouteCalibration()
  const snapped = fakeSegment('s0', [{ x: 0.1, y: 0.7 }, { x: 0.4, y: 0.3 }], 'snapped')
  const unresolved = fakeSegment('s1', [{ x: 0.4, y: 0.3 }, { x: 0.8, y: 0.4 }], 'needs_more_anchor')
  const acceptedGap = resolveSegment(fakeSegment('s2', [{ x: 0.8, y: 0.4 }, { x: 0.9, y: 0.6 }], 'honest_gap'), 'accepted_gap')
  const shape = buildPersistableScreenshotRouteShape({
    ...base,
    controlPoints: [{ id: 'a', x: 0.1, y: 0.7 }, { id: 'b', x: 0.4, y: 0.3 }, { id: 'c', x: 0.8, y: 0.4 }],
    segments: [snapped, unresolved, acceptedGap],
    imageSize: { width: 1080, height: 1920, sampleWidth: 405, sampleHeight: 720 },
  })

  assert.equal(shape?.coordinateSpace, 'normalized_screenshot')
  assert.equal(shape?.segments[1]?.resolution, 'user_confirmed_shape')
  assert.deepEqual(shape?.segments[2]?.points, [])
  const validated = validateScreenshotRouteShape(shape)
  assert.equal(validated.ok, true)
})

test('accepted-gap-only calibration intentionally persists as text-only shape', () => {
  const base = createEmptyScreenshotRouteCalibration()
  const acceptedGap = resolveSegment(
    fakeSegment('s0', [{ x: 0.2, y: 0.7 }, { x: 0.8, y: 0.3 }], 'honest_gap'),
    'accepted_gap'
  )
  const shape = buildPersistableScreenshotRouteShape({
    ...base,
    controlPoints: [{ id: 'a', x: 0.2, y: 0.7 }, { id: 'b', x: 0.8, y: 0.3 }],
    segments: [acceptedGap],
    imageSize: { width: 1080, height: 1920, sampleWidth: 405, sampleHeight: 720 },
  })

  assert.equal(shape, null)
  assert.deepEqual(validateScreenshotRouteShape(shape), { ok: true, shape: null })
})

function denseUnitLine(from: UnitPoint, to: UnitPoint, count: number, phase = 0): UnitPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1)
    const wiggle = Math.sin(t * Math.PI * 8 + phase) * 0.012
    return {
      x: Math.max(0, Math.min(1, from.x + (to.x - from.x) * t + wiggle)),
      y: Math.max(0, Math.min(1, from.y + (to.y - from.y) * t + wiggle * 0.55)),
    }
  })
}

test('persistable screenshot route shape simplifies dense livewire points before validation', () => {
  const base = createEmptyScreenshotRouteCalibration()
  const controlPoints = Array.from({ length: 46 }, (_, index) => ({
    id: `cp_${index}`,
    x: 0.08 + 0.84 * (index / 45),
    y: 0.48 + Math.sin(index * 0.72) * 0.32,
  }))
  const segments = controlPoints.slice(0, -1).map((from, index) => {
    const to = controlPoints[index + 1]!
    return fakeSegment(`seg_${index}`, denseUnitLine(from, to, 1400, index), 'snapped')
  })

  const shape = buildPersistableScreenshotRouteShape({
    ...base,
    controlPoints,
    segments,
    imageSize: { width: 1080, height: 1920, sampleWidth: 405, sampleHeight: 720 },
  })
  const metrics = measureScreenshotRouteShape(shape)
  const validated = validateScreenshotRouteShape(shape)

  assert.equal(validated.ok, true)
  assert.ok(shape, 'expected a persisted shape for a dense user-traced route')
  assert.equal(metrics.controlPoints, 46)
  assert.equal(metrics.segments, 45)
  assert.ok(metrics.segments > 20, `expected realistic manual tracing to exceed the old 20-segment cap, got ${metrics.segments}`)
  assert.ok(metrics.serializedByteSize <= SCREENSHOT_ROUTE_SHAPE_LIMITS.maxBytes, `expected compressed payload <= ${SCREENSHOT_ROUTE_SHAPE_LIMITS.maxBytes}, got ${metrics.serializedByteSize}`)
  assert.ok(metrics.maxPointsPerSegment < 1400, `expected dense livewire points to be simplified, got ${metrics.maxPointsPerSegment}`)
  assert.ok(metrics.totalPoints > metrics.segments * 2, 'expected simplified shape to preserve intermediate geometry, not collapse to straight endpoints only')
})

test('screenshot route shape validator rejects oversized control point payloads', () => {
  const shape = {
    schemaVersion: 1,
    kind: 'screenshot_route_shape',
    coordinateSpace: 'normalized_screenshot',
    source: 'user_seeded_livewire',
    image: { width: 100, height: 100 },
    controlPoints: Array.from({ length: 81 }, (_, index) => ({ id: `p${index}`, x: 0.5, y: 0.5 })),
    segments: [{ id: 's0', fromId: 'p0', toId: 'p1', resolution: 'snapped', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] }],
    createdAt: new Date().toISOString(),
  }

  const result = validateScreenshotRouteShape(shape)
  assert.equal(result.ok, false)
})

test('route shape metrics handles very dense segments without spread range errors', () => {
  const shape = {
    schemaVersion: 1,
    kind: 'screenshot_route_shape',
    coordinateSpace: 'normalized_screenshot',
    source: 'user_seeded_livewire',
    image: { width: 100, height: 100 },
    controlPoints: [{ id: 'a', x: 0.1, y: 0.1 }, { id: 'b', x: 0.9, y: 0.9 }],
    segments: [{
      id: 's0',
      fromId: 'a',
      toId: 'b',
      resolution: 'snapped',
      points: Array.from({ length: 70_000 }, (_, index) => ({ x: index / 69_999, y: index / 69_999 })),
    }],
    createdAt: new Date().toISOString(),
  } as const

  const metrics = measureScreenshotRouteShape(shape)
  assert.equal(metrics.maxPointsPerSegment, 70_000)
  assert.equal(metrics.totalPoints, 70_000)
})

test('poster preview segments preserve editor shape across multiple drawn segments', () => {
  const segments = [
    fakeSegment('s0', [{ x: 0.1, y: 0.8 }, { x: 0.35, y: 0.3 }, { x: 0.55, y: 0.35 }], 'snapped'),
    resolveSegment(fakeSegment('s1', [{ x: 0.62, y: 0.4 }, { x: 0.85, y: 0.18 }], 'low_evidence_straight'), 'user_confirmed_shape'),
  ]

  const posterSegments = buildPosterPreviewSegments(segments)
  const delta = calculatePosterPreviewDelta(segments)
  assert.equal(posterSegments.length, 2)
  assert.ok(delta.maxDelta < 0.001, `expected multi-segment WYSIWYG delta < .001, got ${delta.maxDelta}`)
})

test('livewire solve result is structured-clone serializable for worker transport', () => {
  const width = 64
  const height = 32
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = 18
    rgba[index + 1] = 24
    rgba[index + 2] = 22
    rgba[index + 3] = 255
  }
  for (let x = 8; x < 56; x += 1) {
    const offset = (16 * width + x) * 4
    rgba[offset] = 110
    rgba[offset + 1] = 231
    rgba[offset + 2] = 161
    rgba[offset + 3] = 255
  }

  const result = solveLivewireCalibration({
    rgba,
    width,
    height,
    controlPoints: [
      { id: 'a', x: 8 / (width - 1), y: 16 / (height - 1) },
      { id: 'b', x: 55 / (width - 1), y: 16 / (height - 1) },
    ],
  })

  const cloned = structuredClone(result)
  assert.equal(cloned.segments.length, 1)
  assert.equal(typeof cloned.elapsedMs, 'number')
})
