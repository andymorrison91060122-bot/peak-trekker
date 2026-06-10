import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeScreenshotData,
  SCREENSHOT_MAX_DURATION_SECONDS,
} from '../src/lib/import/screenshot-confirm-data.ts'
import { validateScreenshotEditableFields } from '../src/lib/screenshot-field-validation.ts'

test('normalizes screenshot confirm data with optional duration and altitude omitted', () => {
  const result = normalizeScreenshotData({
    format: 'screenshot',
    fileName: 'taishan.png',
    location: '泰山',
    distanceMeters: 5900,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.distanceMeters, 5900)
  assert.equal(result.data.durationSeconds, undefined)
  assert.equal(result.data.maxElevation, undefined)
})

test('accepts two-decimal screenshot distance and stores integer meters', () => {
  const result = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 10_320,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.distanceMeters, 10_320)
})

test('drops overflow duration instead of rejecting the whole screenshot confirm', () => {
  const result = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    durationSeconds: SCREENSHOT_MAX_DURATION_SECONDS + 1,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.distanceMeters, 5900)
  assert.equal(result.data.durationSeconds, undefined)
})

test('drops implausible optional screenshot altitude and gain values', () => {
  const result = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    maxElevation: 1_265_439,
    elevationGainMeters: 35_000,
    elevationLossMeters: -12,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.distanceMeters, 5900)
  assert.equal(result.data.maxElevation, undefined)
  assert.equal(result.data.elevationGainMeters, undefined)
  assert.equal(result.data.elevationLossMeters, undefined)
})

test('keeps long but valid route-planning distances', () => {
  const result = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 823_590,
    durationSeconds: 44 * 3600 + 6 * 60 + 42,
    elevationGainMeters: 5523,
    speedKmh: 18.7,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.distanceMeters, 823_590)
  assert.equal(result.data.durationSeconds, 158802)
  assert.equal(result.data.elevationGainMeters, 5523)
  assert.equal(result.data.speedKmh, 18.7)
})

test('normalizes screenshot pace while dropping impossible server values', () => {
  const valid = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    paceMinPerKm: 7.15,
  })

  assert.equal(valid.ok, true)
  if (!valid.ok) return
  assert.equal(valid.data.paceMinPerKm, 7.15)

  const impossible = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    paceMinPerKm: 120,
  })
  assert.equal(impossible.ok, true)
  if (!impossible.ok) return
  assert.equal(impossible.data.paceMinPerKm, undefined)

  const tooFast = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    paceMinPerKm: 0.5,
  })
  assert.equal(tooFast.ok, true)
  if (!tooFast.ok) return
  assert.equal(tooFast.data.paceMinPerKm, undefined)
})

test('requires a valid screenshot distance for confirm', () => {
  assert.deepEqual(normalizeScreenshotData({ format: 'screenshot' }), { ok: false, reason: 'invalid' })
  assert.deepEqual(normalizeScreenshotData({ format: 'screenshot', distanceMeters: 0 }), { ok: false, reason: 'invalid' })
  assert.deepEqual(normalizeScreenshotData({ format: 'screenshot', distanceMeters: -100 }), { ok: false, reason: 'invalid' })
  assert.deepEqual(normalizeScreenshotData({ format: 'screenshot', distanceMeters: 1_500_000 }), {
    ok: false,
    reason: 'invalid',
  })
})

test('editable validation accepts 10.32 and reports optional drops as non-blocking field notes', () => {
  const result = validateScreenshotEditableFields({
    fields: {
      elevation: '99999',
      distance: '10.32',
      duration: '120:00:00',
      elevationGain: '',
      elevationLoss: '',
      date: '',
      location: '',
      speed: '',
      pace: '7:99',
    },
    toggles: {
      elevation: true,
      distance: true,
      duration: true,
      elevationGain: false,
      elevationLoss: false,
      date: false,
      location: false,
      speed: false,
      pace: true,
    },
    fileName: 'coros-629.png',
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.parsedData.distanceMeters, 10_320)
  assert.equal(result.parsedData.maxElevation, undefined)
  assert.equal(result.parsedData.durationSeconds, undefined)
  assert.equal(result.parsedData.paceMinPerKm, undefined)
  assert.match(result.errors.elevation ?? '', /本次不会保存该字段/)
  assert.match(result.errors.duration ?? '', /本次不会保存该字段/)
  assert.match(result.errors.pace ?? '', /本次不会保存该字段/)
})
