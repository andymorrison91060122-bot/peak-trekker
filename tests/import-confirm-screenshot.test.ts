import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeScreenshotData,
  SCREENSHOT_MAX_DURATION_SECONDS,
  SCREENSHOT_MAX_PACE_MIN_PER_KM,
  SCREENSHOT_MIN_PACE_MIN_PER_KM,
} from '../src/lib/import/screenshot-confirm-data.ts'

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

test('drops disabled or overflow duration instead of writing impossible values', () => {
  const result = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    durationSeconds: SCREENSHOT_MAX_DURATION_SECONDS + 1,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.durationSeconds, undefined)
})

test('drops implausible screenshot altitude and gain values', () => {
  const result = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    maxElevation: 1_265_439,
    elevationGainMeters: 35_000,
    elevationLossMeters: -12,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
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

test('normalizes screenshot pace while dropping out-of-range values', () => {
  const valid = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    paceMinPerKm: 7.15,
  })

  assert.equal(valid.ok, true)
  if (!valid.ok) return
  assert.equal(valid.data.paceMinPerKm, 7.15)

  const tooFast = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    paceMinPerKm: SCREENSHOT_MIN_PACE_MIN_PER_KM - 0.01,
  })
  assert.equal(tooFast.ok, true)
  if (!tooFast.ok) return
  assert.equal(tooFast.data.paceMinPerKm, undefined)

  const tooSlow = normalizeScreenshotData({
    format: 'screenshot',
    distanceMeters: 5900,
    paceMinPerKm: SCREENSHOT_MAX_PACE_MIN_PER_KM + 0.01,
  })
  assert.equal(tooSlow.ok, true)
  if (!tooSlow.ok) return
  assert.equal(tooSlow.data.paceMinPerKm, undefined)
})

test('requires a valid screenshot distance for confirm', () => {
  assert.deepEqual(normalizeScreenshotData({ format: 'screenshot' }), { ok: false, reason: 'invalid' })
  assert.deepEqual(normalizeScreenshotData({ format: 'screenshot', distanceMeters: 1_500_000 }), {
    ok: false,
    reason: 'invalid',
  })
})
