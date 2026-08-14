import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadTrackPreview() {
  return import(`../src/lib/share-track-preview.${sourceExtension}`)
}

async function loadPolylineSimplifier() {
  return import(`../src/lib/polyline-simplify.${sourceExtension}`)
}

async function loadRouteMotion() {
  return import(`../src/lib/share-route-motion.${sourceExtension}`)
}

function assertPointClose(
  actual: { x: number; y: number } | undefined,
  expected: { x: number; y: number },
  message: string,
) {
  assert.ok(actual, `${message}: missing point`)
  assert.ok(Math.abs(actual.x - expected.x) < 0.01, `${message}: x ${actual.x} should be close to ${expected.x}`)
  assert.ok(Math.abs(actual.y - expected.y) < 0.01, `${message}: y ${actual.y} should be close to ${expected.y}`)
}

function makeScreenshotShape({
  image = { width: 1080, height: 1920 },
  points,
  resolution = 'snapped',
}: {
  image?: { width: number; height: number }
  points: Array<{ x: number; y: number }>
  resolution?: 'snapped' | 'user_confirmed_shape'
}) {
  return {
    schemaVersion: 1,
    kind: 'screenshot_route_shape',
    coordinateSpace: 'normalized_screenshot',
    source: 'user_seeded_livewire',
    image,
    controlPoints: points.map((point, index) => ({ id: `p-${index}`, ...point })),
    segments: [
      {
        id: 'seg',
        fromId: 'p-0',
        toId: `p-${points.length - 1}`,
        resolution,
        points,
      },
    ],
    createdAt: '2026-06-10T00:00:00.000Z',
  }
}

describe('share track preview projection', () => {
  test('preserves line-mode degenerate epsilon while segment mode keeps exact-zero fallback only', async () => {
    const { simplifyPolyline } = await loadPolylineSimplifier()
    const project = (point: { x: number; y: number }) => point

    const nearZeroLine = [
      { x: 0, y: 0 },
      { x: 0.8, y: 0 },
      { x: 1e-8, y: 0 },
    ]
    assert.deepEqual(
      simplifyPolyline(nearZeroLine, {
        epsilon: 0.5,
        project,
        distanceMode: 'line',
        degenerateEpsilon: 1e-7,
      }),
      nearZeroLine,
      'line mode should use the old near-degenerate fallback distance-to-start behavior',
    )

    const nearZeroSegment = [
      { x: 0, y: 0 },
      { x: 5e-9, y: 0 },
      { x: 1e-8, y: 0 },
    ]
    assert.deepEqual(
      simplifyPolyline(nearZeroSegment, {
        epsilon: 1e-9,
        project,
        distanceMode: 'segment',
        degenerateEpsilon: 1,
      }),
      [nearZeroSegment[0], nearZeroSegment[2]],
      'segment mode should ignore degenerateEpsilon and preserve exact-zero-only semantics',
    )
  })

  test('pins route render style profiles by field name', async () => {
    const { SHARE_TRACK_RENDER_PROFILES } = await loadTrackPreview()

    assert.deepEqual(SHARE_TRACK_RENDER_PROFILES.shareEditorHero, {
      lineWidth: 4.2,
      glowWidth: 14,
      glowOpacity: 0.18,
      startRadius: 7,
      startStrokeWidth: 3,
      endRadius: 8,
    })
    assert.deepEqual(SHARE_TRACK_RENDER_PROFILES.posterMini, {
      lineWidth: 6,
      glowWidth: 18,
      glowOpacity: 0.18,
      startRadius: 7,
      startStrokeWidth: 4,
      endRadius: 8,
    })
    assert.deepEqual(SHARE_TRACK_RENDER_PROFILES.archiveMedallion, {
      lineWidth: 3.6,
      glowWidth: 15,
      glowOpacity: 0.14,
      startRadius: 5.8,
      startStrokeWidth: 2.8,
      endRadius: 6.8,
    })
    assert.deepEqual(SHARE_TRACK_RENDER_PROFILES.activityCard, {
      lineWidth: 8,
      glowWidth: 28,
      glowOpacity: 0.2,
      startRadius: 15,
      startStrokeWidth: 6,
      endRadius: 21,
    })
    assert.deepEqual(SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard, {
      lineWidth: 3.4,
      glowWidth: 10,
      glowOpacity: 0.13,
      startRadius: 6,
      startStrokeWidth: 2.4,
      endRadius: 7.5,
    })
    assert.ok(SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard.lineWidth <= 4)
    assert.ok(SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard.startRadius <= 8)
    assert.ok(SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard.endRadius <= 8)
    assert.ok(SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard.glowWidth <= 14)
    assert.deepEqual(SHARE_TRACK_RENDER_PROFILES.verticalStory, {
      lineWidth: 12,
      glowWidth: 42,
      glowOpacity: 0.13,
      startRadius: 19,
      startStrokeWidth: 8,
      endRadius: 27,
    })
    assert.deepEqual(SHARE_TRACK_RENDER_PROFILES.posterTrail({ lineWidth: 8, glow: 10 }), {
      lineWidth: 8,
      glowWidth: 32,
      glowOpacity: 0.16,
      startRadius: 18.8,
      startStrokeWidth: 8,
      endRadius: 25.6,
    })
  })

  test('normalizes imported track points without exposing raw coordinates', async () => {
    const { buildShareTrackPreview } = await loadTrackPreview()

    const preview = buildShareTrackPreview([
      { lat: 36.101, lng: 117.083, ele: 439, time: '2026-05-12T08:00:00Z' },
      { lat: 36.112, lng: 117.091, ele: 790, time: '2026-05-12T09:00:00Z' },
      { lat: 36.125, lng: 117.106, ele: 1265, time: '2026-05-12T10:00:00Z' },
    ])

    assert.equal(preview?.pointCount, 3)
    assert.equal(preview?.hasAltitude, true)
    assertPointClose(preview?.points[0], { x: 0.1129, y: 1 }, 'first point should be latitude-corrected and centered')
    assertPointClose(preview?.points.at(-1), { x: 0.8871, y: 0 }, 'last point should be latitude-corrected and centered')
    assert.notDeepEqual(preview?.points[0], { x: 36.101, y: 117.083 })
  })

  test('accepts realtime GPS track point shape', async () => {
    const { buildShareTrackPreview } = await loadTrackPreview()

    const preview = buildShareTrackPreview([
      { lat: 35.1, lng: 110.1, altitude: 700, accuracy: 12, ts: 1000 },
      { lat: 35.3, lng: 110.2, altitude: 920, accuracy: 11, ts: 2000 },
      { lat: 35.4, lng: 110.45, altitude: 1200, accuracy: 10, ts: 3000 },
    ])

    assert.equal(preview?.pointCount, 3)
    assert.equal(preview?.hasAltitude, true)
    assert.equal(preview?.points.length, 3)
  })

  test('renders two point tracks as a gentle curve with markers', async () => {
    const { buildShareTrackPreview, buildShareTrackPath } = await loadTrackPreview()
    const preview = buildShareTrackPreview([
      { latitude: 30, longitude: 101, elevation: 500 },
      { latitude: 31, longitude: 102, elevation: 650 },
    ])

    const path = buildShareTrackPath(preview, { width: 120, height: 80, padding: 8 })

    assert.match(path?.d ?? '', /^M .* Q /)
    assertPointClose(path?.start, { x: 32.43, y: 72 }, 'two-point start should be centered in the wide axis')
    assertPointClose(path?.end, { x: 87.57, y: 8 }, 'two-point end should be centered in the wide axis')
  })

  test('filters invalid placeholder points and keeps valid southern hemisphere points', async () => {
    const { buildShareTrackPreview } = await loadTrackPreview()

    const preview = buildShareTrackPreview([
      { lat: 0, lng: 0, ele: 10 },
      { lat: 91, lng: 110, ele: 11 },
      { lat: -33.86, lng: 151.2, ele: 25 },
      { lat: -33.88, lng: 151.24, ele: 45 },
    ])

    assert.equal(preview?.pointCount, 2)
    assert.equal(preview?.hasAltitude, true)
    assert.equal(preview?.points.length, 2)
  })

  test('returns null for empty tracks', async () => {
    const { buildShareTrackPreview } = await loadTrackPreview()

    assert.equal(buildShareTrackPreview([]), null)
    assert.equal(buildShareTrackPreview([{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }]), null)
  })

  test('keeps a single valid point as a marker-only preview', async () => {
    const { buildShareTrackPreview, buildShareTrackPath } = await loadTrackPreview()

    const preview = buildShareTrackPreview([{ lat: 36, lng: 117, ele: 1100 }])
    const route = buildShareTrackPath(preview, { width: 120, height: 80, padding: 8 })

    assert.equal(preview?.pointCount, 1)
    assert.equal(preview?.hasAltitude, true)
    assert.deepEqual(preview?.points, [{ x: 0.5, y: 0.5 }])
    assert.equal(route?.d, null)
    assert.deepEqual(route?.start, { x: 60, y: 40 })
    assert.deepEqual(route?.end, { x: 60, y: 40 })
  })

  test('samples long tracks to the requested limit while preserving the end point', async () => {
    const { buildShareTrackPreview } = await loadTrackPreview()
    const rawPoints = Array.from({ length: 210 }, (_, index) => ({
      lat: 30 + index * 0.001,
      lng: 100 + index * 0.001,
      ele: 400 + index,
    }))

    const preview = buildShareTrackPreview(rawPoints, 24)

    assert.equal(preview?.pointCount, 210)
    assert.ok((preview?.points.length ?? 0) <= 25)
    assertPointClose(preview?.points.at(-1), { x: 0.9326, y: 0 }, 'sampled endpoint should preserve geographic aspect')
  })

  test('projects vertical story tracks into the square upper-middle frame', async () => {
    const { buildShareTrackPreview, buildShareTrackPath } = await loadTrackPreview()
    const preview = buildShareTrackPreview([
      { lat: 34.483, lng: 110.083, ele: 460 },
      { lat: 34.491, lng: 110.095, ele: 820 },
      { lat: 34.503, lng: 110.112, ele: 1410 },
      { lat: 34.512, lng: 110.124, ele: 1990 },
    ])

    const route = buildShareTrackPath(preview, {
      x: 230,
      y: 390,
      width: 620,
      height: 620,
      padding: 56,
    })

    assert.ok(route?.d)
    assert.match(route.d, /^M /)
    for (const point of [route.start, route.end]) {
      assert.ok(point.x >= 286 && point.x <= 794, `x ${point.x} should stay inside the square frame`)
      assert.ok(point.y >= 446 && point.y <= 954, `y ${point.y} should stay inside the square frame`)
    }
  })

  test('letterboxes wide tracks inside non-square frames instead of stretching vertically', async () => {
    const { buildShareTrackPreview, buildShareTrackPath } = await loadTrackPreview()
    const preview = buildShareTrackPreview([
      { lat: 30, lng: 100, ele: 100 },
      { lat: 30.1, lng: 101, ele: 200 },
      { lat: 30.2, lng: 102, ele: 300 },
    ])

    const route = buildShareTrackPath(preview, {
      x: 0,
      y: 0,
      width: 216,
      height: 290,
      padding: 10,
    })

    assert.ok(route?.d)
    assert.equal(route.d, 'M 10 156.33 L 108 145 L 206 133.67')
    assertPointClose(route.start, { x: 10, y: 156.33 }, 'wide route start should sit inside centered letterbox')
    assertPointClose(route.end, { x: 206, y: 133.67 }, 'wide route end should sit inside centered letterbox')

    const xSpan = route.end.x - route.start.x
    const ySpan = Math.abs(route.end.y - route.start.y)
    assert.ok(xSpan > 190, `expected wide route to use the short-edge scale, got x span ${xSpan}`)
    assert.ok(ySpan < 30, `expected wide route not to stretch vertically, got y span ${ySpan}`)
  })

  test('builds disconnected poster subpaths for screenshot accepted gaps without bridging', async () => {
    const { buildShareTrackPreviewFromScreenshotRouteShape, buildShareTrackRender } = await loadTrackPreview()
    const { buildRouteDrawPlan } = await loadRouteMotion()
    const shape = {
      schemaVersion: 1,
      kind: 'screenshot_route_shape',
      coordinateSpace: 'normalized_screenshot',
      source: 'user_seeded_livewire',
      image: { width: 1000, height: 1000 },
      controlPoints: [
        { id: 'a', x: 0.1, y: 0.1 },
        { id: 'b', x: 0.2, y: 0.2 },
        { id: 'c', x: 0.8, y: 0.8 },
        { id: 'd', x: 0.9, y: 0.9 },
      ],
      segments: [
        {
          id: 'seg-a-b',
          fromId: 'a',
          toId: 'b',
          resolution: 'snapped',
          points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
        },
        {
          id: 'seg-b-c',
          fromId: 'b',
          toId: 'c',
          resolution: 'accepted_gap',
          points: [],
        },
        {
          id: 'seg-c-d',
          fromId: 'c',
          toId: 'd',
          resolution: 'user_confirmed_shape',
          points: [{ x: 0.8, y: 0.8 }, { x: 0.9, y: 0.9 }],
        },
      ],
      createdAt: '2026-06-10T00:00:00.000Z',
    }

    const preview = buildShareTrackPreviewFromScreenshotRouteShape(shape)
    const route = buildShareTrackRender(preview, { width: 100, height: 100, padding: 0 })

    assert.equal(preview?.segments?.length, 2)
    assert.equal(preview?.pointCount, 4)
    assert.ok(route?.d)
    assert.equal([...route.d.matchAll(/\bM\b/g)].length, 2)
    assert.equal(route?.segmentPaths.length, 2, 'accepted-gap geometry must stay as two independently drawable paths')
    assert.equal(route?.segmentPaths[0]?.d.includes(route?.segmentPaths[1]?.d ?? ''), false, 'an accepted gap must not be joined into the first drawable segment')
    assert.doesNotMatch(route.d, /0 0 [LQC] 87.5 87.5/, 'no command may bridge from the first subpath toward the second across the accepted gap')
    assert.doesNotMatch(route.d, /12.5 12.5 [LQC] 87.5 87.5/, 'no command may bridge accepted-gap endpoints')

    const plan = buildRouteDrawPlan(route.segmentPaths.map((segment) => ({
      segmentIndex: segment.index,
      length: 100,
    })), 1)
    assert.deepEqual(plan.map((step) => step.segmentIndex), [0, 1])
    assert.equal(plan[0]?.end, plan[1]?.start, 'the second real subpath begins only after the first completes')
    assert.equal(route.segmentPaths[0]?.end.x === route.segmentPaths[1]?.start.x && route.segmentPaths[0]?.end.y === route.segmentPaths[1]?.start.y, false, 'ordered motion must not fabricate a connector across an accepted gap')
  })

  test('keeps three endpoint-contiguous screenshot segments independently drawable in route order', async () => {
    const { buildShareTrackPreviewFromScreenshotRouteShape, buildShareTrackRender } = await loadTrackPreview()
    const shape = {
      schemaVersion: 1,
      kind: 'screenshot_route_shape',
      coordinateSpace: 'normalized_screenshot',
      source: 'user_seeded_livewire',
      image: { width: 1000, height: 1000 },
      controlPoints: [
        { id: 'a', x: 0.12, y: 0.78 },
        { id: 'b', x: 0.32, y: 0.58 },
        { id: 'c', x: 0.56, y: 0.42 },
        { id: 'd', x: 0.82, y: 0.2 },
      ],
      segments: [
        { id: 'seg-a-b', fromId: 'a', toId: 'b', resolution: 'snapped', points: [{ x: 0.12, y: 0.78 }, { x: 0.22, y: 0.66 }, { x: 0.32, y: 0.58 }] },
        { id: 'seg-b-c', fromId: 'b', toId: 'c', resolution: 'user_confirmed_shape', points: [{ x: 0.32, y: 0.58 }, { x: 0.44, y: 0.49 }, { x: 0.56, y: 0.42 }] },
        { id: 'seg-c-d', fromId: 'c', toId: 'd', resolution: 'snapped', points: [{ x: 0.56, y: 0.42 }, { x: 0.7, y: 0.29 }, { x: 0.82, y: 0.2 }] },
      ],
      createdAt: '2026-08-15T00:00:00.000Z',
    }

    const route = buildShareTrackRender(
      buildShareTrackPreviewFromScreenshotRouteShape(shape),
      { width: 300, height: 420, padding: 24 },
    )

    assert.ok(route?.d)
    assert.equal([...route.d.matchAll(/\bM\b/g)].length, 3, 'aggregate compatibility path must still retain the three source segments')
    assert.equal(route?.segmentPaths.length, 3, 'each contiguous source segment needs its own drawable path for ordered GSAP drawing')
    assert.equal(route?.segmentPaths.map((segment) => segment.index).join(','), '0,1,2')
    assert.ok(route?.segmentPaths.every((segment) => !/\bM\b[\s\S]*\bM\b/.test(segment.d)), 'a drawable segment path cannot contain a second subpath front')
    assertPointClose(route?.segmentPaths[0]?.start, route!.start, 'first segment starts at the overall route start')
    assertPointClose(route?.segmentPaths.at(-1)?.end, route!.end, 'last segment ends at the overall route end')
  })

  test('assigns one advancing route front at a time while preserving the fixed total draw duration', async () => {
    const { buildRouteDrawPlan } = await loadRouteMotion()
    const plan = buildRouteDrawPlan([
      { segmentIndex: 0, length: 40 },
      { segmentIndex: 1, length: 80 },
      { segmentIndex: 2, length: 120 },
    ], 1.2)

    assert.deepEqual(plan.map((step) => step.segmentIndex), [0, 1, 2])
    assert.equal(plan[0]?.start, 0)
    assert.equal(plan[0]?.end, plan[1]?.start, 'the next segment cannot start before the current one is complete')
    assert.equal(plan[1]?.end, plan[2]?.start, 'there must be only one advancing segment front')
    assert.equal(plan.at(-1)?.end, 1.2, 'segment durations must sum to the existing fixed route duration')
    assert.deepEqual(plan.map((step) => step.duration), [0.2, 0.4, 0.6])
  })

  test('returns no screenshot share preview for null or accepted-gap-only shapes', async () => {
    const { buildShareTrackPreviewFromScreenshotRouteShape } = await loadTrackPreview()

    assert.equal(buildShareTrackPreviewFromScreenshotRouteShape(null), null)
    assert.equal(
      buildShareTrackPreviewFromScreenshotRouteShape({
        schemaVersion: 1,
        kind: 'screenshot_route_shape',
        coordinateSpace: 'normalized_screenshot',
        source: 'user_seeded_livewire',
        image: { width: 900, height: 1600 },
        controlPoints: [{ id: 'a', x: 0.2, y: 0.2 }, { id: 'b', x: 0.8, y: 0.8 }],
        segments: [
          {
            id: 'seg-a-b',
            fromId: 'a',
            toId: 'b',
            resolution: 'accepted_gap',
            points: [],
          },
        ],
        createdAt: '2026-06-10T00:00:00.000Z',
      }),
      null,
    )
  })

  test('fits a tiny-on-original long screenshot route by route bbox instead of original image ratio', async () => {
    const { buildShareTrackPreviewFromScreenshotRouteShape, buildShareTrackRender, SHARE_TRACK_CONTENT_FIT } = await loadTrackPreview()
    const frame = {
      width: 300,
      height: 300,
      padding: 36,
      ...SHARE_TRACK_CONTENT_FIT,
    }
    const style = {
      lineWidth: 8,
      glowWidth: 32,
      startRadius: 19,
      startStrokeWidth: 8,
      endRadius: 26,
    }

    const longScreenshotRoute = buildShareTrackRender(
      buildShareTrackPreviewFromScreenshotRouteShape(makeScreenshotShape({
        image: { width: 640, height: 4096 },
        points: [
          { x: 0.28, y: 0.045 },
          { x: 0.34, y: 0.052 },
          { x: 0.43, y: 0.064 },
          { x: 0.55, y: 0.072 },
          { x: 0.64, y: 0.085 },
        ],
      })),
      frame,
      style,
    )
    const regularRoute = buildShareTrackRender(
      buildShareTrackPreviewFromScreenshotRouteShape(makeScreenshotShape({
        points: [{ x: 0.1, y: 0.12 }, { x: 0.42, y: 0.36 }, { x: 0.9, y: 0.88 }],
      })),
      frame,
      style,
    )

    for (const route of [longScreenshotRoute, regularRoute]) {
      assert.ok(route)
      assert.ok(route.lineWidth >= 7 && route.lineWidth <= 9, `line width ${route.lineWidth} should stay in target px range`)
      assert.equal(route.glowWidth, 32)
      assert.equal(route.startRadius, 19)
      assert.equal(route.startStrokeWidth, 8)
      assert.equal(route.endRadius, 26)
    }

    assert.ok((longScreenshotRoute?.bounds.width ?? 0) >= 210, `long screenshot route should fill the fixed frame, got width ${longScreenshotRoute?.bounds.width}`)
    assert.ok((longScreenshotRoute?.bounds.height ?? 0) >= 140, `long screenshot route should keep restored route aspect, got height ${longScreenshotRoute?.bounds.height}`)
    assert.ok((longScreenshotRoute?.bounds.minX ?? 0) >= 36, `route should keep left padding, got ${longScreenshotRoute?.bounds.minX}`)
    assert.ok((300 - (longScreenshotRoute?.bounds.maxX ?? 300)) >= 36, `route should keep right padding, got ${longScreenshotRoute?.bounds.maxX}`)
    assert.ok((regularRoute?.bounds.maxX ?? 0) <= 264, `regular route should stay inside padded target frame, got ${regularRoute?.bounds.maxX}`)
  })

  test('restrains only truly near-degenerate screenshot route bboxes', async () => {
    const { buildShareTrackPreviewFromScreenshotRouteShape, buildShareTrackRender, SHARE_TRACK_CONTENT_FIT } = await loadTrackPreview()
    const route = buildShareTrackRender(
      buildShareTrackPreviewFromScreenshotRouteShape(makeScreenshotShape({
        image: { width: 640, height: 4096 },
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.5000001, y: 0.50000008 },
        ],
      })),
      { width: 300, height: 300, padding: 36, ...SHARE_TRACK_CONTENT_FIT },
      {
        lineWidth: 8,
        glowWidth: 32,
        startRadius: 19,
        startStrokeWidth: 8,
        endRadius: 26,
      },
    )

    assert.ok(route)
    assert.ok(route.bounds.width <= 4, `near-degenerate source-pixel route should not be magnified into a full trail, got width ${route.bounds.width}`)
    assert.ok(route.bounds.height <= 4, `near-degenerate source-pixel route should not be magnified into a full trail, got height ${route.bounds.height}`)
    assert.ok(route.start.x > 145 && route.start.x < 155, `near-degenerate start should stay near frame center, got ${route.start.x}`)
  })

  test('computes screenshot route bbox before per-segment sampling', async () => {
    const { buildShareTrackPreviewFromScreenshotRouteShape } = await loadTrackPreview()
    const points = Array.from({ length: 61 }, (_, index) => {
      if (index === 30) return { x: 0.9, y: 0.05 }
      const t = index / 60
      return { x: 0.2 + t * 0.08, y: 0.1 + t * 0.18 }
    })
    const preview = buildShareTrackPreviewFromScreenshotRouteShape(makeScreenshotShape({
      image: { width: 1000, height: 1000 },
      points,
    }), 10)

    assert.equal(preview?.segments?.length, 1)
    assert.equal(preview?.segments?.[0]?.length, 10)
    const sampledMaxX = Math.max(...(preview?.points.map((point) => point.x) ?? []))
    assert.ok(sampledMaxX < 0.25, `unsampled far boundary point should still define bbox scale; sampled max x ${sampledMaxX} would be much larger if bbox were sampled first`)
  })

  test('smooths noisy target-space polylines without moving endpoints or bridging gaps', async () => {
    const { buildShareTrackPreviewFromScreenshotRouteShape, buildShareTrackRender, SHARE_TRACK_CONTENT_FIT } = await loadTrackPreview()
    const noisySegment = Array.from({ length: 200 }, (_, index) => {
      const t = index / 199
      const jitter = index === 0 || index === 199 ? 0 : (index % 2 === 0 ? 0.0018 : -0.0018)
      return {
        x: 0.16 + t * 0.24 + jitter,
        y: 0.18 + t * 0.58 - jitter,
      }
    })
    const secondSegment = [
      { x: 0.66, y: 0.22 },
      { x: 0.72, y: 0.3 },
      { x: 0.79, y: 0.4 },
    ]
    const shape = {
      schemaVersion: 1,
      kind: 'screenshot_route_shape',
      coordinateSpace: 'normalized_screenshot',
      source: 'user_seeded_livewire',
      image: { width: 1080, height: 1920 },
      controlPoints: [
        { id: 'a', x: 0.16, y: 0.18 },
        { id: 'b', x: 0.4, y: 0.76 },
        { id: 'c', x: 0.66, y: 0.22 },
        { id: 'd', x: 0.79, y: 0.4 },
      ],
      segments: [
        {
          id: 'seg-a-b',
          fromId: 'a',
          toId: 'b',
          resolution: 'snapped',
          points: noisySegment,
        },
        {
          id: 'seg-b-c',
          fromId: 'b',
          toId: 'c',
          resolution: 'accepted_gap',
          points: [],
        },
        {
          id: 'seg-c-d',
          fromId: 'c',
          toId: 'd',
          resolution: 'user_confirmed_shape',
          points: secondSegment,
        },
      ],
      createdAt: '2026-06-10T00:00:00.000Z',
    }

    const preview = buildShareTrackPreviewFromScreenshotRouteShape(shape, 240)
    const route = buildShareTrackRender(preview, {
      width: 300,
      height: 420,
      padding: 48,
      ...SHARE_TRACK_CONTENT_FIT,
    }, {
      lineWidth: 8,
      simplifyEpsilonPx: 1.75,
    })

    assert.ok(route?.d)
    assert.equal(route.projectedSegments.length, 2)
    assert.ok(route.projectedSegments[0]!.length < 30, `expected noisy segment to simplify, got ${route.projectedSegments[0]!.length} points`)
    assert.match(route.d, /\b[QC]\b/, 'smoothed route should use curve commands')
    assert.doesNotMatch(route.d, /(?:\bL\b\s+[-0-9.]+\s+[-0-9.]+\s*){12,}/, 'smoothed route should not keep long runs of jittery line commands')
    assert.equal([...route.d.matchAll(/\bM\b/g)].length, 2, 'accepted gap should keep disconnected subpaths')
    assertPointClose(route.projectedSegments[0]![0], route.start, 'first endpoint should stay exact after smoothing')
    assertPointClose(route.projectedSegments.at(-1)!.at(-1), route.end, 'last endpoint should stay exact after smoothing')
  })
})
