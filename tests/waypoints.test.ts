import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_WAYPOINTS_PER_TYPE,
  WAYPOINT_TYPES,
  WAYPOINT_TYPE_KEYS,
  parseWaypointCoordinateInput,
  parseWaypointCoordinatePatch,
  type Waypoint,
  type WaypointInput,
  type WaypointType,
} from '../src/lib/waypoints.ts'

const validWaypointTypes: WaypointType[] = [
  'viewpoint',
  'supply',
  'turnaround',
  'campsite',
  'danger',
  'transport',
]

const validWaypointInputs: WaypointInput[] = validWaypointTypes.map((type) => ({
  type,
  name: `${type}-name`,
  latitude: null,
  longitude: null,
}))

const waypointWithCoordinates: Waypoint = {
  id: 'waypoint-with-coordinates',
  mountain_id: 'mountain-id',
  type: 'viewpoint',
  name: 'viewpoint-name',
  description: '',
  elevation: 1800,
  latitude: 34.1234567,
  longitude: 110.7654321,
  sort_order: 0,
  created_at: '2026-06-19T00:00:00.000Z',
}

// @ts-expect-error invalid waypoint type should be rejected by TypeScript
const invalidWaypointInput: WaypointInput = { type: 'invalid', name: 'bad' }

void validWaypointInputs
void invalidWaypointInput
void waypointWithCoordinates

test('WAYPOINT_TYPES exposes the six agreed waypoint categories', () => {
  assert.deepEqual(Object.keys(WAYPOINT_TYPES), [
    'viewpoint',
    'supply',
    'turnaround',
    'campsite',
    'danger',
    'transport',
  ])
})

test('WAYPOINT_TYPE_KEYS keeps the six waypoint type keys in order', () => {
  assert.equal(WAYPOINT_TYPE_KEYS.length, 6)
  assert.deepEqual(WAYPOINT_TYPE_KEYS, validWaypointTypes)
})

test('MAX_WAYPOINTS_PER_TYPE is capped at 10', () => {
  assert.equal(MAX_WAYPOINTS_PER_TYPE, 10)
})

test('WaypointInput accepts the six legal waypoint types', () => {
  assert.equal(validWaypointInputs.length, 6)
  assert.equal(validWaypointInputs.every((input) => WAYPOINT_TYPE_KEYS.includes(input.type)), true)
})

test('Waypoint type carries nullable latitude and longitude', () => {
  assert.equal(waypointWithCoordinates.latitude, 34.1234567)
  assert.equal(waypointWithCoordinates.longitude, 110.7654321)
})

test('waypoint coordinate parser accepts valid, null, and blank values', () => {
  assert.equal(parseWaypointCoordinateInput('latitude', 34.1234567), 34.1234567)
  assert.equal(parseWaypointCoordinateInput('longitude', '110.7654321'), 110.7654321)
  assert.equal(parseWaypointCoordinateInput('latitude', null), null)
  assert.equal(parseWaypointCoordinateInput('longitude', ''), null)
  assert.equal(parseWaypointCoordinateInput('latitude', '  '), null)
})

test('waypoint coordinate parser rejects out-of-range or non-finite values', () => {
  assert.equal(parseWaypointCoordinateInput('latitude', 90.0000001), undefined)
  assert.equal(parseWaypointCoordinateInput('latitude', -90.0000001), undefined)
  assert.equal(parseWaypointCoordinateInput('longitude', 180.0000001), undefined)
  assert.equal(parseWaypointCoordinateInput('longitude', -180.0000001), undefined)
  assert.equal(parseWaypointCoordinateInput('longitude', 'not-a-coordinate'), undefined)
  assert.equal(parseWaypointCoordinateInput('latitude', true), undefined)
})

test('waypoint coordinate patch preserves omitted versus null coordinates', () => {
  assert.deepEqual(parseWaypointCoordinatePatch({}, 'latitude'), { ok: true, patch: {} })
  assert.deepEqual(parseWaypointCoordinatePatch({ latitude: null }, 'latitude'), {
    ok: true,
    patch: { latitude: null },
  })
  assert.deepEqual(parseWaypointCoordinatePatch({ longitude: 110.7654321 }, 'longitude'), {
    ok: true,
    patch: { longitude: 110.7654321 },
  })
  assert.deepEqual(parseWaypointCoordinatePatch({ latitude: 91 }, 'latitude'), { ok: false })
})
