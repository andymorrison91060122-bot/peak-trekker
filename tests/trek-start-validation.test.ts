import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkTrekStartDistance,
  formatTrekStartDistanceKm,
  TREK_START_DISTANCE_THRESHOLD_METERS,
} from '../src/lib/trek-start-validation.ts'

const huashan = {
  latitude: 34.4869,
  longitude: 110.0877,
}

test('checkTrekStartDistance accepts same summit point', () => {
  const result = checkTrekStartDistance({ lat: 34.4869, lng: 110.0877 }, huashan)

  assert.equal(result.valid, true)
  assert.equal(result.thresholdMeters, TREK_START_DISTANCE_THRESHOLD_METERS)
  assert.ok(result.distanceMeters !== null && result.distanceMeters < 1)
})

test('checkTrekStartDistance accepts nearby approach within 100km', () => {
  const result = checkTrekStartDistance({ lat: 34.55, lng: 110.02 }, huashan)

  assert.equal(result.valid, true)
  assert.ok(result.distanceMeters !== null && result.distanceMeters < TREK_START_DISTANCE_THRESHOLD_METERS)
})

test('checkTrekStartDistance blocks far-away mountain targets', () => {
  const wudangApprox = { latitude: 32.399, longitude: 111.003 }
  const result = checkTrekStartDistance({ lat: huashan.latitude, lng: huashan.longitude }, wudangApprox)

  assert.equal(result.valid, false)
  assert.ok(result.distanceMeters !== null && result.distanceMeters > TREK_START_DISTANCE_THRESHOLD_METERS)
})

test('checkTrekStartDistance handles invalid coordinates defensively', () => {
  const result = checkTrekStartDistance({ lat: Number.NaN, lng: 110.0877 }, huashan)

  assert.equal(result.valid, false)
  assert.equal(result.distanceMeters, null)
})

test('formatTrekStartDistanceKm formats one decimal kilometer value', () => {
  assert.equal(formatTrekStartDistanceKm(1652208), '1652.2 km')
  assert.equal(formatTrekStartDistanceKm(null), '未知距离')
})
