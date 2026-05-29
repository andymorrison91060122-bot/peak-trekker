import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadTrackPreview() {
  return import(`../src/lib/share-track-preview.${sourceExtension}`)
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

describe('share track preview projection', () => {
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
})
