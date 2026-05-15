import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadTrackPreview() {
  return import(`../src/lib/share-track-preview.${sourceExtension}`)
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
    assert.deepEqual(preview?.points[0], { x: 0, y: 1 })
    assert.deepEqual(preview?.points.at(-1), { x: 1, y: 0 })
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
    assert.deepEqual(path?.start, { x: 8, y: 72 })
    assert.deepEqual(path?.end, { x: 112, y: 8 })
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
    assert.deepEqual(preview?.points.at(-1), { x: 1, y: 0 })
  })
})
