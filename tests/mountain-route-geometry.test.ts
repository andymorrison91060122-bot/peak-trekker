import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRouteTraceViewModel,
  normalizeApprovedRouteGeometry,
  routeGeometryToFeature,
} from '../src/lib/mountain-route-geometry.ts'

const approvedRow = {
  id: 'geometry-1',
  mountain_id: 'mountain-1',
  simplified_geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [75.1, 42.1, 2100],
        [75.4, 42.3, 2500],
      ],
      [
        [75.6, 42.5, 2800],
        [76.2, 42.9, 3300],
      ],
    ],
  },
  bbox: [75.1, 42.1, 76.2, 42.9],
  display_mode: 'trace_only',
  review_status: 'approved',
  point_count: 4,
  segment_count: 2,
} as const

test('normalizes approved WGS84 MultiLineString without joining disconnected segments', () => {
  const geometry = normalizeApprovedRouteGeometry(approvedRow)

  assert.ok(geometry)
  assert.equal(geometry.lines.length, 2)
  assert.equal(geometry.lines[0].length, 2)
  assert.equal(geometry.lines[1].length, 2)
  assert.deepEqual(geometry.bbox, [75.1, 42.1, 76.2, 42.9])

  const feature = routeGeometryToFeature(geometry)
  assert.equal(feature.geometry.type, 'MultiLineString')
  assert.equal(feature.geometry.coordinates.length, 2)
})

test('rejects pending, malformed, and out-of-range geometry instead of inventing a route', () => {
  assert.equal(normalizeApprovedRouteGeometry({ ...approvedRow, review_status: 'pending' }), null)
  assert.equal(
    normalizeApprovedRouteGeometry({
      ...approvedRow,
      simplified_geometry: {
        type: 'MultiLineString',
        coordinates: [[[181, 42.1], [75.4, 42.3]]],
      },
    }),
    null,
  )
  assert.equal(
    normalizeApprovedRouteGeometry({
      ...approvedRow,
      simplified_geometry: {
        type: 'MultiLineString',
        coordinates: [[[75.1, 42.1]]],
      },
    }),
    null,
  )
})

test('projects the full long-distance route into a stable SVG frame', () => {
  const geometry = normalizeApprovedRouteGeometry(approvedRow)
  assert.ok(geometry)

  const view = buildRouteTraceViewModel(geometry, {
    width: 320,
    height: 220,
    padding: 18,
  })

  assert.equal(view.paths.length, 2)
  assert.equal(view.sourcePointCount, 4)
  assert.equal(view.start.x >= 18 && view.start.x <= 302, true)
  assert.equal(view.start.y >= 18 && view.start.y <= 202, true)
  assert.equal(view.end.x >= 18 && view.end.x <= 302, true)
  assert.equal(view.end.y >= 18 && view.end.y <= 202, true)
  assert.equal(view.paths.every((path) => path.startsWith('M ')), true)
})
