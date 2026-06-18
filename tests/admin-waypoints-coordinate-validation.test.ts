import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const adminWaypointsRoute = readFileSync('src/app/api/admin/waypoints/route.ts', 'utf8')

test('admin waypoint route validates latitude and longitude through the shared parser', () => {
  assert.match(adminWaypointsRoute, /parseWaypointCoordinatePatch/)
  assert.match(adminWaypointsRoute, /parseWaypointCoordinatePatch\(input,\s*'latitude'\)/)
  assert.match(adminWaypointsRoute, /parseWaypointCoordinatePatch\(input,\s*'longitude'\)/)
  assert.match(adminWaypointsRoute, /parseWaypointCoordinatePatch\(updates,\s*'latitude'\)/)
  assert.match(adminWaypointsRoute, /parseWaypointCoordinatePatch\(updates,\s*'longitude'\)/)
})

test('admin waypoint route rejects invalid coordinate patches as invalid params', () => {
  assert.match(adminWaypointsRoute, /if \(!latitude\.ok\) return null/)
  assert.match(adminWaypointsRoute, /if \(!longitude\.ok\) return null/)
  assert.match(adminWaypointsRoute, /return NextResponse\.json\(\{ error: 'invalid params' \}, \{ status: 400 \}\)/)
})
