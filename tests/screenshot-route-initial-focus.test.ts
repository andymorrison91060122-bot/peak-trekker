import test from 'node:test'
import assert from 'node:assert/strict'
import { focusViewportFromBounds } from '../src/lib/screenshot-track/calibration.ts'

test('route focus falls back to whole image without bounds', () => {
  assert.deepEqual(focusViewportFromBounds(null), { zoom: 1, centerX: 0.5, centerY: 0.5 })
})

test('route focus treats single-point bounds as whole image', () => {
  assert.deepEqual(focusViewportFromBounds({ minX: 0.32, minY: 0.18, maxX: 0.32, maxY: 0.18 }), {
    zoom: 1,
    centerX: 0.5,
    centerY: 0.5,
  })
})

test('route focus treats start-equals-end extents as whole image', () => {
  assert.deepEqual(focusViewportFromBounds({ minX: 0.4, minY: 0.4, maxX: 0.42, maxY: 0.42 }), {
    zoom: 1,
    centerX: 0.5,
    centerY: 0.5,
  })
})

test('route focus zooms compact routes to 2x and centers on the midpoint', () => {
  assert.deepEqual(focusViewportFromBounds({ minX: 0.35, minY: 0.12, maxX: 0.55, maxY: 0.32 }), {
    zoom: 2,
    centerX: 0.45,
    centerY: 0.22,
  })
})

test('route focus zooms a route with a 0.30 long axis to 2x', () => {
  assert.deepEqual(focusViewportFromBounds({ minX: 0.2, minY: 0.1, maxX: 0.5, maxY: 0.22 }), {
    zoom: 2,
    centerX: 0.35,
    centerY: 0.16,
  })
})

test('route focus keeps large routes with long axis near 0.42 at whole image', () => {
  assert.deepEqual(focusViewportFromBounds({ minX: 0.12, minY: 0.3, maxX: 0.55, maxY: 0.38 }), {
    zoom: 1,
    centerX: 0.5,
    centerY: 0.5,
  })
})

test('route focus keeps routes filling most of the image at whole image', () => {
  assert.deepEqual(focusViewportFromBounds({ minX: 0.05, minY: 0.04, maxX: 0.95, maxY: 0.94 }), {
    zoom: 1,
    centerX: 0.5,
    centerY: 0.5,
  })
})

test('route focus returns pre-normalize midpoint for compact corner routes', () => {
  assert.deepEqual(focusViewportFromBounds({ minX: 0.05, minY: 0.05, maxX: 0.25, maxY: 0.25 }), {
    zoom: 2,
    centerX: 0.15,
    centerY: 0.15,
  })
})
