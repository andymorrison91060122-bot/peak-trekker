import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mountainDetailClient = readFileSync('src/app/(flow)/mountain/[id]/MountainDetailClient.tsx', 'utf8')
const mountainDetailPage = readFileSync('src/app/(flow)/mountain/[id]/page.tsx', 'utf8')

function sourceSlice(start: string, end: string) {
  const startIndex = mountainDetailClient.indexOf(start)
  const endIndex = mountainDetailClient.indexOf(end, startIndex)

  assert.notEqual(startIndex, -1, `Missing slice start: ${start}`)
  assert.notEqual(endIndex, -1, `Missing slice end: ${end}`)

  return mountainDetailClient.slice(startIndex, endIndex)
}

const routeReferenceSection = sourceSlice('function RouteReferenceSection', 'function FeaturedSection')
const waypointSection = sourceSlice('function WaypointSection', 'function RouteTraceCard')

test('detail server fetches only one approved route geometry for the mountain', () => {
  assert.match(mountainDetailPage, /\.from\('mountain_route_geometries'\)/)
  assert.match(mountainDetailPage, /\.eq\('mountain_id', id\)/)
  assert.match(mountainDetailPage, /\.eq\('review_status', 'approved'\)/)
  assert.match(mountainDetailPage, /\.maybeSingle\(\)/)
  assert.match(mountainDetailPage, /routeGeometry=\{routeGeometry\}/)
})

test('visual route fixtures are available only behind the explicit QA helper flag', () => {
  assert.match(mountainDetailPage, /process\.env\.ENABLE_QA_TEST_HELPERS === 'true'/)
  assert.match(mountainDetailPage, /routeGeometryFixture/)
  assert.match(mountainDetailPage, /buildRouteGeometryQaFixture\(id, routeGeometryFixture\)/)
})

test('route reference without approved geometry stays honest even when a basemap asset exists', () => {
  assert.doesNotMatch(mountainDetailClient, /暂无关键点位/)
  assert.doesNotMatch(mountainDetailClient, /function RouteSummitOnlyStrip/)
  assert.match(routeReferenceSection, /if \(!routeGeometry\) return <RouteUnavailable \/>/)
  assert.match(mountainDetailClient, /<SectionHeader title="路线参考" right="未收录" \/>/)
  assert.doesNotMatch(mountainDetailClient, /暂无 · 不可用/)
})

test('every approved geometry renders its full trace shape without depending on a basemap', () => {
  assert.match(routeReferenceSection, /<RouteTraceCard geometry=\{routeGeometry\} \/>/)
  assert.match(mountainDetailClient, /轨迹形状示意，不是导航地图/)
  assert.match(mountainDetailClient, /data-testid="mountain-route-trace-shape"/)
  assert.doesNotMatch(mountainDetailClient, /function RoutePmtilesCard|function addRouteMapLayers|PmtilesSnapshotMap/)
})

test('route reference never connects waypoints or a summit point into fake geometry', () => {
  assert.doesNotMatch(mountainDetailClient, /function RouteWaypointStrip/)
  assert.doesNotMatch(mountainDetailClient, /getRouteOverlayPoints/)
  assert.doesNotMatch(mountainDetailClient, /coordinateWaypoints|summitCoordinate|getWaypointCoordinate/)
})

test('waypoint detail section remains the separate point list below the route card', () => {
  assert.match(waypointSection, /<SectionHeader title="关键点位与风险" \/>/)
  assert.match(mountainDetailClient, /waypoints\.length > 0 \? <WaypointSection waypoints=\{waypoints\} \/> : null/)
})
