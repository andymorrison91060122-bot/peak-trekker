import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const sourceExtension = 'ts'

async function loadProjector() {
  return import(`../src/lib/geo-trace-projector.${sourceExtension}`)
}

async function loadGpxParser() {
  return import(`../src/lib/import/gpx-parser.${sourceExtension}`)
}

function bounds(points: Array<{ x: number; y: number }>) {
  const first = points[0]!
  let minX = first.x
  let maxX = first.x
  let minY = first.y
  let maxY = first.y
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
  }
}

function ratio(points: Array<{ x: number; y: number }>) {
  const box = bounds(points)
  return box.height <= 0 ? 0 : box.width / box.height
}

describe('geo trace projector', () => {
  test('preserves portrait traces with centered letterbox instead of stretching to the frame', async () => {
    const { createGeoTraceProjector } = await loadProjector()
    const points = [
      { lat: 34.62, lng: 110.01 },
      { lat: 34.54, lng: 110.03 },
      { lat: 34.42, lng: 110.05 },
      { lat: 34.34, lng: 110.06 },
    ]
    const projector = createGeoTraceProjector(points, { width: 343, height: 343, padding: 38 })
    const projected = projector.projectPoints(points)
    const box = bounds(projected)

    assert.ok(box.height > box.width * 2.5, `expected portrait shape, got ${box.width}x${box.height}`)
    assert.ok(box.width < projector.meta.scale, 'portrait trace should letterbox horizontally')
  })

  test('preserves landscape traces with centered letterbox instead of stretching vertically', async () => {
    const { createGeoTraceProjector } = await loadProjector()
    const points = [
      { lat: 30.01, lng: 100.0 },
      { lat: 30.03, lng: 100.4 },
      { lat: 30.04, lng: 100.9 },
      { lat: 30.06, lng: 101.3 },
    ]
    const projector = createGeoTraceProjector(points, { width: 320, height: 190, padding: 22 })
    const projected = projector.projectPoints(points)
    const box = bounds(projected)

    assert.ok(box.width > box.height * 10, `expected landscape shape, got ${box.width}x${box.height}`)
    assert.ok(box.height < projector.meta.scale, 'landscape trace should letterbox vertically')
  })

  test('handles degenerate tracks without NaN coordinates', async () => {
    const { createGeoTraceProjector } = await loadProjector()
    const points = [
      { lat: 31.2, lng: 120.4 },
      { lat: 31.2, lng: 120.4 },
    ]
    const projector = createGeoTraceProjector(points, { width: 200, height: 200, padding: 20 })
    const projected = projector.projectPoints(points)

    assert.deepEqual(projected.map((point) => ({ x: point.x, y: point.y })), [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ])
    assert.equal(projector.buildPath(points), 'M 100 100 L 100 100')
  })

  test('uses one projector for line and markers so relative positions do not drift', async () => {
    const { createGeoTraceProjector } = await loadProjector()
    const track = [
      { lat: 34.48, lng: 110.08 },
      { lat: 34.5, lng: 110.09 },
      { lat: 34.52, lng: 110.1 },
    ]
    const current = { lat: 34.51, lng: 110.095, label: 'current' }
    const summit = { lat: 34.53, lng: 110.105, label: 'summit' }
    const projector = createGeoTraceProjector([...track, current, summit], { width: 343, height: 343, padding: 38 })
    const projectedTrack = projector.projectPoints(track)
    const projectedCurrent = projector.projectPoint(current)
    const projectedSummit = projector.projectPoint(summit)

    assert.ok(projectedCurrent.x > projectedTrack[1]!.x, 'current marker should stay east of the middle track point')
    assert.ok(projectedCurrent.y < projectedTrack[1]!.y, 'current marker should stay north of the middle track point')
    assert.ok(projectedSummit.x > projectedCurrent.x, 'summit marker should stay east of current marker')
    assert.ok(projectedSummit.y < projectedCurrent.y, 'summit marker should stay north of current marker')
  })

  test('projects the FU-83 GPX fixture at portrait ratio instead of the frame ratio', async () => {
    const [{ createGeoTraceProjector }, { parseGpx }] = await Promise.all([loadProjector(), loadGpxParser()])
    const gpx = readFileSync(join(process.cwd(), 'tests/fixtures/gpx/fu83-portrait-49609d3c.gpx'), 'utf8')
    const parsed = parseGpx(gpx, 'fu83-portrait-49609d3c.gpx')
    const track = parsed.trackPoints.map((point) => ({ lat: point.latitude, lng: point.longitude }))
    const projector = createGeoTraceProjector(track, { width: 343, height: 343, padding: 38 })
    const projected = projector.projectPoints(track)
    const projectedRatio = ratio(projected)

    assert.ok(projectedRatio > 0.52 && projectedRatio < 0.68, `expected ~0.60 W/H, got ${projectedRatio}`)
    assert.notEqual(projectedRatio.toFixed(2), '1.00', 'portrait GPX must not stretch to the square frame')
  })

  test('pins touched render surfaces to aspect-safe frame/viewBox correspondence', () => {
    const activityRouteMap = readFileSync(join(process.cwd(), 'src/components/activity/ActivityRouteMap.tsx'), 'utf8')
    const trekReferenceMap = readFileSync(join(process.cwd(), 'src/components/map/TrekReferenceMap.tsx'), 'utf8')
    const communityDetail = readFileSync(join(process.cwd(), 'src/app/(flow)/community/[postId]/CommunityDetailClient.tsx'), 'utf8')

    for (const [name, source] of [
      ['ActivityRouteMap', activityRouteMap],
      ['TrekReferenceMap', trekReferenceMap],
      ['CommunityDetailClient', communityDetail],
    ] as const) {
      assert.equal(source.includes('preserveAspectRatio="none"'), false, `${name} must not stretch SVG traces`)
    }

    assert.match(activityRouteMap, /viewBox="0 0 343 343"/)
    assert.match(activityRouteMap, /aspectRatio:\s*'1 \/ 1'/)
    assert.equal(activityRouteMap.includes('normalizeBboxTrace'), false)
    assert.equal(activityRouteMap.includes('normalizeVisualTrace'), false)
    assert.match(communityDetail, /const width = 320/)
    assert.match(communityDetail, /const height = 190/)
    assert.match(communityDetail, /<svg viewBox="0 0 320 190"/)
    assert.equal(
      existsSync(join(process.cwd(), 'src/components/community/CommunityRouteVisualization.tsx')),
      false,
      'dead CommunityRouteVisualization component should be deleted',
    )
  })
})
