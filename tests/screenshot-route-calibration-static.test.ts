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
  assert.match(visibleMarker, /transition: 'r var\(--motion-press\) var\(--ease-standard\), opacity var\(--motion-press\) var\(--ease-standard\), filter var\(--motion-fast\) var\(--ease-standard\)'/)
  assert.match(hitCircle, /r=\{hitRadius\}/)
  assert.match(hitCircle, /pointerEvents="all"/)
  assert.doesNotMatch(hitCircle, /opacity=\{inactiveDragOpacity\}|opacity=/)
})

test('route entry copy follows hasUserLine while first-step coaching follows control point count', () => {
  const entryCard = calibrationEditor.match(/function RouteEntryCard[\s\S]*?function HonestGapSheet/)?.[0] ?? ''
  const coachCopy = calibrationEditor.match(/function CoachCopy[\s\S]*?function RouteEntryCard/)?.[0] ?? ''

  assert.match(entryCard, /const hasUserLine = drawableSegments\(calibration\.segments\)\.length > 0/)
  assert.match(entryCard, /hasUserLine \? '轨迹已补上' : '为这条记录补上轨迹'/)
  assert.match(entryCard, /hasUserLine[\s\S]*'检查线路，需要时继续补点或调整。'[\s\S]*'沿截图中的路线点出关键位置，系统会辅助贴合线条。'/)
  assert.match(entryCard, /hasUserLine \? '继续调整' : '开始描绘'/)
  assert.match(entryCard, /hasUserLine \? '查看并调整已描绘轨迹' : '点开截图，开始描绘轨迹'/)
  assert.match(coachCopy, /calibration\.controlPoints\.length === 0/)
  assert.match(coachCopy, /在截图中的路线起点点一下，再点终点。系统会辅助贴合线条，路线由你确认。/)
  assert.match(calibrationEditor, /aria-label="描绘轨迹"/)
  assert.match(calibrationEditor, />描绘轨迹<\/div>/)
  assert.match(calibrationEditor, /轻点起点与终点，系统会辅助贴合线条/)
})
