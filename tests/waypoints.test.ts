import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_WAYPOINTS_PER_TYPE,
  WAYPOINT_TYPES,
  WAYPOINT_TYPE_KEYS,
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
}))

// @ts-expect-error invalid waypoint type should be rejected by TypeScript
const invalidWaypointInput: WaypointInput = { type: 'invalid', name: 'bad' }

void validWaypointInputs
void invalidWaypointInput

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
