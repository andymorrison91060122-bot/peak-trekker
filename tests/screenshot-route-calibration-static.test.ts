import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const calibrationEditor = readFileSync('src/app/(flow)/screenshot/ScreenshotRouteCalibrationSection.tsx', 'utf8')

test('route calibration drag release cancels stale rAF before final synchronous update', () => {
  const pointerUp = calibrationEditor.match(/function onSvgPointerUp[\s\S]*?function onPointPointerDown/)?.[0] ?? ''
  assert.match(pointerUp, /const activeDragId = draggingPointRef\.current/)
  assert.match(pointerUp, /cancelPendingDragUpdate\(\)[\s\S]*updatePoint\(activeDragId, getPointerUnit\(event, contentWidth, contentHeight\)\)/)
  assert.ok(
    pointerUp.indexOf('cancelPendingDragUpdate()') < pointerUp.indexOf('updatePoint(activeDragId'),
    'pending drag rAF must be canceled before the final release-position update',
  )
  assert.ok(
    pointerUp.indexOf('updatePoint(activeDragId') < pointerUp.indexOf('draggingPointRef.current = null'),
    'drag refs must clear only after the final release-position update',
  )
})

test('route calibration clears pending drag rAF on unmount, editor close, and clear', () => {
  const unmount = calibrationEditor.match(/useEffect\(\(\) => \{[\s\S]*?workerRef\.current = null[\s\S]*?\}, \[\]\)/)?.[0] ?? ''
  const clearCalibration = calibrationEditor.match(/function clearCalibration[\s\S]*?function pointerDistance/)?.[0] ?? ''
  const closeEditor = calibrationEditor.match(/function closeEditor[\s\S]*?function runLock/)?.[0] ?? ''

  assert.match(unmount, /cancelPendingDragUpdate\(\)/)
  assert.match(clearCalibration, /cancelPendingDragUpdate\(\)/)
  assert.match(closeEditor, /cancelPendingDragUpdate\(\)/)
})

test('route calibration dims only visible inactive markers and leaves hit circles interactive', () => {
  assert.match(calibrationEditor, /const inactiveDragOpacity = isDraggingAnotherPoint \? 0\.4 : 1/)

  const visibleMarker = calibrationEditor.match(/data-route-control-point="true"[\s\S]*?\/>/)?.[0] ?? ''
  const hitCircle = calibrationEditor.match(/data-route-control-point-hit="true"[\s\S]*?onPointerDown=\{\(event\) => onPointerDown\(event, point\.id\)\}/)?.[0] ?? ''

  assert.match(visibleMarker, /opacity=\{inactiveDragOpacity\}/)
  assert.match(visibleMarker, /transition: 'r 140ms ease, opacity 140ms ease, filter 180ms ease'/)
  assert.match(hitCircle, /r=\{hitRadius\}/)
  assert.match(hitCircle, /pointerEvents="all"/)
  assert.doesNotMatch(hitCircle, /opacity=\{inactiveDragOpacity\}|opacity=/)
})
