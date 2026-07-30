import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeTrekTrackPoints,
  normalizeAppendTrackPoint,
  summarizeTrekTrackPoints,
  TREK_APPEND_BATCH_LIMIT,
  TREK_SESSION_POINT_HARD_LIMIT,
} from '../src/lib/trek-track-metrics.ts'
import type { TrackPoint } from '../src/lib/trek-utils.ts'

const baseTs = 1_720_000_000_000

function point(index: number, overrides: Partial<TrackPoint> = {}): TrackPoint {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    lat: 30 + index * 0.0001,
    lng: 120 + index * 0.0001,
    accuracy: 8,
    altitude: 100 + index,
    ts: baseTs + index * 1000,
    captureSeq: index,
    ...overrides,
  }
}

test('append point limits are pinned for client and server parity', () => {
  assert.equal(TREK_APPEND_BATCH_LIMIT, 500)
  assert.equal(TREK_SESSION_POINT_HARD_LIMIT, 30_000)
})

test('normalizeAppendTrackPoint rejects malformed ids and unsafe coordinates', () => {
  assert.equal(normalizeAppendTrackPoint({ ...point(1), id: 'bad-id' }), null)
  assert.equal(normalizeAppendTrackPoint({ ...point(1), lat: 91 }), null)
  assert.equal(normalizeAppendTrackPoint({ ...point(1), lng: -181 }), null)
  assert.equal(normalizeAppendTrackPoint({ ...point(1), accuracy: -1 }), null)
  assert.equal(normalizeAppendTrackPoint({ ...point(1), captureSeq: -1 }), null)
  assert.deepEqual(normalizeAppendTrackPoint(point(1)), point(1))
  assert.equal(
    normalizeAppendTrackPoint({ ...point(1), id: '00000000-0000-4000-8000-0000000000AB' })?.id,
    '00000000-0000-4000-8000-0000000000ab'
  )
})

test('mergeTrekTrackPoints is deterministic for replay, duplicate, and out-of-order batches', () => {
  const existing = [point(1), point(3)]
  const incoming = [point(2), point(3), point(4), point(2)].reverse()

  const first = mergeTrekTrackPoints({ existingPoints: existing, incomingPoints: incoming })
  const replay = mergeTrekTrackPoints({ existingPoints: first.points, incomingPoints: incoming })

  assert.deepEqual(first.points.map((item) => item.id), [
    point(1).id,
    point(2).id,
    point(3).id,
    point(4).id,
  ])
  assert.deepEqual(replay.points, first.points)
  assert.deepEqual(replay.summary, first.summary)
  assert.deepEqual(replay.rejectedIds, [])
  assert.deepEqual(new Set(first.acceptedIds), new Set([point(2).id!, point(3).id!, point(4).id!]))
})

test('legacy id-less prefix stays stored and never dedups incoming ids', () => {
  const legacy: TrackPoint = {
    lat: 30,
    lng: 120,
    accuracy: 12,
    altitude: 100,
    ts: baseTs,
  }
  const result = mergeTrekTrackPoints({
    existingPoints: [legacy],
    incomingPoints: [point(1), point(2)],
  })

  assert.equal(result.points[0]?.id, undefined)
  assert.deepEqual(result.acceptedIds, [point(1).id, point(2).id])
  assert.equal(result.summary.pointCount, 3)
  assert.equal(result.summary.ascentM, 0)
})

test('captureSeq gives deterministic order when timestamps roll backward', () => {
  const first = point(1, { ts: baseTs + 2000, captureSeq: 1 })
  const second = point(2, { ts: baseTs + 1000, captureSeq: 2 })
  const result = mergeTrekTrackPoints({ existingPoints: [], incomingPoints: [first, second] })

  assert.deepEqual(result.points.map((item) => item.id), [second.id, first.id])
  assert.deepEqual(result.summary, summarizeTrekTrackPoints(result.points))
})

test('drift-rejected new points are dropped and returned as rejectedIds', () => {
  const normal = point(1)
  const drift = point(2, {
    lat: 35,
    lng: 125,
    accuracy: 80,
    ts: normal.ts + 1000,
  })
  const result = mergeTrekTrackPoints({
    existingPoints: [normal],
    incomingPoints: [drift],
  })

  assert.deepEqual(result.acceptedIds, [])
  assert.deepEqual(result.rejectedIds, [drift.id])
  assert.deepEqual(result.points, [normal])
})

test('mixed valid and invalid incoming points still merge valid points', () => {
  const valid = point(1)
  const invalid = point(2, { accuracy: 15_000 })
  const result = mergeTrekTrackPoints({
    existingPoints: [],
    incomingPoints: [valid, invalid],
  })

  assert.deepEqual(result.points, [valid])
  assert.deepEqual(result.acceptedIds, [valid.id])
  assert.deepEqual(result.rejectedIds, [])
  assert.equal(result.summary.distanceM, 0)
})

test('stationary jitter does not accumulate distance', () => {
  const points = [
    point(0, { lat: 30, lng: 120, accuracy: 8, ts: baseTs }),
    point(1, { lat: 30.00002, lng: 120.00001, accuracy: 8, ts: baseTs + 15_000 }),
    point(2, { lat: 29.99998, lng: 119.99999, accuracy: 8, ts: baseTs + 30_000 }),
    point(3, { lat: 30.00001, lng: 120.00002, accuracy: 8, ts: baseTs + 60_000 }),
  ]

  const summary = summarizeTrekTrackPoints(points)

  assert.equal(summary.distanceM, 0)
  assert.equal(summary.pointCount, 4)
})

test('slow real walking accumulates after crossing the anchor deadband', () => {
  const points = Array.from({ length: 11 }, (_, index) =>
    point(index, {
      lat: 30 + index * 0.000027,
      lng: 120,
      accuracy: 8,
      ts: baseTs + index * 10_000,
      altitude: 100,
    })
  )

  const summary = summarizeTrekTrackPoints(points)

  assert.ok(summary.distanceM >= 24)
  assert.ok(summary.distanceM <= 34)
  assert.equal(summary.pointCount, 11)
})

test('poor-accuracy samples do not create movement', () => {
  const points = [
    point(0, { lat: 30, lng: 120, accuracy: 8 }),
    point(1, { lat: 30.0003, lng: 120, accuracy: 120 }),
  ]

  assert.equal(summarizeTrekTrackPoints(points).distanceM, 0)
})

test('leading poor-accuracy point does not block later trusted movement recovery', () => {
  const points = [
    point(0, { lat: 30, lng: 120, accuracy: 120, ts: baseTs, altitude: 100 }),
    point(1, { lat: 30, lng: 120, accuracy: 8, ts: baseTs + 10_000, altitude: 100 }),
    point(2, { lat: 30.00012, lng: 120, accuracy: 8, ts: baseTs + 20_000, altitude: 106 }),
  ]

  const summary = summarizeTrekTrackPoints(points)

  assert.ok(summary.distanceM > 0)
  assert.ok(summary.distanceM < 20)
  assert.equal(summary.ascentM, 6)
  assert.equal(summary.pointCount, 3)
})

test('merge preserves accepted raw points even when sub-deadband movement does not affect metrics', () => {
  const origin = point(0, { lat: 30, lng: 120, accuracy: 8, ts: baseTs })
  const jitter = point(1, { lat: 30.00002, lng: 120.00001, accuracy: 8, ts: baseTs + 15_000 })
  const stride = point(2, { lat: 30.00011, lng: 120, accuracy: 8, ts: baseTs + 30_000 })

  const result = mergeTrekTrackPoints({
    existingPoints: [],
    incomingPoints: [origin, jitter, stride],
  })

  assert.equal(result.points.length, 3)
  assert.deepEqual(result.rejectedIds, [])
  assert.ok(result.summary.distanceM > 0)
  assert.ok(result.summary.distanceM < 20)
})
