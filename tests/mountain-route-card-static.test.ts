import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mountainDetailClient = readFileSync('src/app/(flow)/mountain/[id]/MountainDetailClient.tsx', 'utf8')

function sourceSlice(start: string, end: string) {
  const startIndex = mountainDetailClient.indexOf(start)
  const endIndex = mountainDetailClient.indexOf(end, startIndex)

  assert.notEqual(startIndex, -1, `Missing slice start: ${start}`)
  assert.notEqual(endIndex, -1, `Missing slice end: ${end}`)

  return mountainDetailClient.slice(startIndex, endIndex)
}

const routeMapLayers = sourceSlice('function addRouteMapLayers', 'function RoutePmtilesCard')
const routePmtilesCard = sourceSlice('function RoutePmtilesCard', 'function RouteReferenceSection')
const waypointSection = sourceSlice('function WaypointSection', 'function buildWaypointRouteSegments')

test('route reference no-waypoint state keeps the card quiet and map-only', () => {
  assert.doesNotMatch(mountainDetailClient, /暂无关键点位/)
  assert.doesNotMatch(mountainDetailClient, /function RouteSummitOnlyStrip/)
  assert.doesNotMatch(routePmtilesCard, /<RouteSummitOnlyStrip/)
  assert.match(routePmtilesCard, /ariaLabel=\{hasWaypointRoute \? '真实离线底图上的路线参考图' : '真实离线底图上的山峰位置参考图'\}/)
  assert.match(routePmtilesCard, /padding: '14px'/)
})

test('route reference has-waypoint state keeps map labels and safety copy without bottom chips', () => {
  assert.match(routePmtilesCard, /const hasWaypointRoute = waypoints\.length >= 2/)
  assert.doesNotMatch(mountainDetailClient, /function RouteWaypointStrip/)
  assert.doesNotMatch(mountainDetailClient, /getRouteOverlayPoints/)
  assert.doesNotMatch(routePmtilesCard, /<RouteWaypointStrip/)
  assert.match(routePmtilesCard, /仅作路线示意 · 不是导航地图，山区请以现场判断为准/)
  assert.match(routeMapLayers, /if \(coordinateWaypoints\.length < 2\) return/)
  assert.match(routeMapLayers, /label: waypoint\.elevation === null \? waypoint\.name : `\$\{waypoint\.name\} · \$\{formatInteger\(waypoint\.elevation\)\}m`/)
})

test('waypoint detail section remains the separate point list below the route card', () => {
  assert.match(waypointSection, /<SectionHeader title="关键点位与风险" \/>/)
  assert.match(mountainDetailClient, /displayWaypoints\.length > 0 \? <WaypointSection waypoints=\{displayWaypoints\} \/> : null/)
})
