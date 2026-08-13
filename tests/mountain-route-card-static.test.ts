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

test('registered PMTiles assets render in Detail while trace-only, missing, and failed maps retain the SVG fallback', () => {
  assert.match(mountainDetailClient, /import PmtilesSnapshotMap from '@\/components\/map\/PmtilesSnapshotMap'/)
  assert.match(mountainDetailClient, /import \{ getMountainPmtilesAsset \} from '@\/lib\/map\/map-assets'/)
  assert.match(mountainDetailClient, /routeGeometryToFeature,/)
  assert.match(routeReferenceSection, /<RouteMapCard geometry=\{routeGeometry\} \/>/)
  assert.match(mountainDetailClient, /function resolveMountainPmtilesAsset[\s\S]*?return getMountainPmtilesAsset\(mountainId\)/)
  assert.match(mountainDetailClient, /function RouteMapCard\(/)
  assert.match(mountainDetailClient, /const asset = resolveMountainPmtilesAsset\(geometry\.mountainId\)/)
  assert.match(mountainDetailClient, /geometry\.displayMode === 'trace_only' \|\| !asset \|\| mapFailed/)
  assert.match(mountainDetailClient, /onError=\{\(\) => setMapFailed\(true\)\}/)
  assert.match(mountainDetailClient, /routeGeometryToFeature\(geometry\)/)
  assert.match(mountainDetailClient, /'line-color': '#7ef0b4'/)
  assert.match(mountainDetailClient, /'line-width': 3\.2/)
  assert.match(mountainDetailClient, /'line-opacity': 0\.94/)
  assert.match(mountainDetailClient, /'line-cap': 'round'/)
  assert.match(mountainDetailClient, /'line-join': 'round'/)
  assert.match(mountainDetailClient, /circle-radius': \['match', \['get', 'endpoint'\], 'start', 5\.5, 7\]/)
  assert.match(mountainDetailClient, /circle-stroke-color': '#07130f'/)
  assert.match(mountainDetailClient, /circle-stroke-width': 1\.8/)
})

test('route reference copy states its decision-support boundary in both render paths', () => {
  assert.equal((mountainDetailClient.match(/right="仅供决策参考"/g) ?? []).length, 2)
  assert.doesNotMatch(mountainDetailClient, /right="完整轨迹"/)
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
