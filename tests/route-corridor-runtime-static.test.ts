import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const migration = read('../supabase/migrations/20260730110000_p2_route_corridor_runtime.sql')
const types = read('../src/types/index.ts')
const routeDisplay = read('../src/lib/mountain-route-display.ts')
const verifyHelpers = read('../src/lib/trek-verify-helpers.ts')
const trekActions = read('../src/app/api/trek/actions/route.ts')
const trekClient = read('../src/app/(flow)/trek/TrekClient.tsx')
const trekReferenceMap = read('../src/components/map/TrekReferenceMap.tsx')
const detailPage = read('../src/app/(flow)/mountain/[id]/page.tsx')
const detailClient = read('../src/app/(flow)/mountain/[id]/MountainDetailClient.tsx')
const exploreClient = read('../src/app/(main)/explore/ExploreClient.tsx')
const exploreCard = read('../src/components/ui/ExploreMountainCard.tsx')

const LEGACY_ROUTE_KEYS = [
  'duku-gonglu-route',
  'huangshan-xihai-route',
  'huihang-gudao-route',
  'hutiaoxia-gaolu-route',
  'nanhuang-gudao-route',
  'tianmushan-qijian-route',
  'wangmangling-xiyaigou-route',
  'weizhou-volcanic-landform-route',
  'xiata-gudao-route',
  'yubeng-route',
] as const

test('migration adds the two-value entity contract and exactly backfills ten legacy routes', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'mountain'/)
  assert.match(migration, /entity_type IN \('mountain', 'route_corridor'\)/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS aliases TEXT\[\]/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS route_highpoint_m NUMERIC\(7, 1\)/)
  assert.match(migration, /access_status IN \('open', 'restricted', 'closed', 'pilgrimage_only', 'unknown'\)/)

  for (const key of LEGACY_ROUTE_KEYS) {
    assert.equal(migration.match(new RegExp(`'${key}'`, 'g'))?.length, 1, `${key} should occur once in the exact whitelist`)
  }
  assert.match(migration, /expected_count[\s\S]*10/)
  assert.match(migration, /actual_route_count[\s\S]*10/)
  assert.match(migration, /effective_canonical_key = 'gangrenboqi-cluster'[\s\S]*entity_type IS DISTINCT FROM 'mountain'/)
  assert.doesNotMatch(
    migration.match(/legacy_route_keys TEXT\[\][\s\S]*?;\n/)?.[0] ?? '',
    /gangrenboqi-cluster/,
  )
})

test('migration stores reviewed simplified geometry without exposing a raw object path', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mountain_route_geometries/)
  assert.match(migration, /simplified_geometry JSONB NOT NULL/)
  assert.match(migration, /simplified_geometry->>'type' = 'MultiLineString'/)
  assert.match(migration, /display_mode IN \('map', 'trace_only'\)/)
  assert.match(migration, /review_status IN \('pending', 'approved', 'rejected'\)/)
  assert.match(migration, /source_file_sha256/)
  assert.doesNotMatch(migration, /storage_(?:object_)?path|raw_object_path/)
  assert.match(migration, /mountain_route_geometries\.review_status = 'approved'/)
  assert.match(migration, /mountain\.is_readable = true/)
})

test('activation guard requires shared content but altitude only for mountains', () => {
  assert.match(migration, /NEW\.entity_type = 'mountain' AND NEW\.altitude IS NULL/)
  assert.match(migration, /NEW\.is_readable IS DISTINCT FROM true/)
  assert.match(migration, /NULLIF\(BTRIM\(NEW\.cover_image\), ''\) IS NULL/)
  assert.match(migration, /NULLIF\(BTRIM\(NEW\.description\), ''\) IS NULL/)
  assert.match(migration, /NULLIF\(BTRIM\(NEW\.risk_note\), ''\) IS NULL/)
  assert.match(migration, /NULLIF\(BTRIM\(NEW\.route_note\), ''\) IS NULL/)
})

test('Mountain and route display contracts are entity-aware and include restricted', () => {
  assert.match(types, /export type MountainEntityType = 'mountain' \| 'route_corridor'/)
  assert.match(types, /export type Mountain = \{[\s\S]*?altitude: number \| null/)
  assert.match(types, /entity_type\?: MountainEntityType/)
  assert.match(types, /aliases\?: string\[\] \| null/)
  assert.match(types, /route_highpoint_m\?: number \| null/)
  assert.match(types, /access_status\?: 'open' \| 'restricted' \| 'closed' \| 'unknown' \| 'pilgrimage_only' \| null/)
  assert.match(routeDisplay, /getMountainAccessDisplay\([\s\S]*entityType/)
  assert.match(routeDisplay, /entityType === 'route_corridor'/)
  assert.match(routeDisplay, /ctaLabel: '参考路线仅供查看'/)
})

test('route corridors disable weather storage and never render mountain weather', () => {
  assert.match(
    migration,
    /SET entity_type = 'route_corridor',\s*weather_enabled = false/,
  )
  assert.match(migration, /actual_weather_disabled_count INTEGER/)
  assert.match(
    migration,
    /effective_canonical_key = ANY\(legacy_route_keys\)[\s\S]*entity_type = 'route_corridor'[\s\S]*weather_enabled = false/,
  )
  assert.match(
    detailClient,
    /function hasMountainWeatherTarget\([\s\S]*?mountain\.entity_type !== 'route_corridor'[\s\S]*?typeof mountain\.altitude === 'number'/,
  )
  assert.match(
    detailClient,
    /const weatherMountain = hasMountainWeatherTarget\(mountain\) \? mountain : null[\s\S]*?\{weatherMountain \? \([\s\S]*?<WeatherSection mountain=\{weatherMountain\} \/>[\s\S]*?\) : null\}/,
  )
})

test('all verification selectors and queries fail closed to mountain entities', () => {
  assert.match(verifyHelpers, /MOUNTAIN_VERIFY_SELECT_FULL = '[^']*entity_type[^']*'/)
  assert.match(verifyHelpers, /MOUNTAIN_VERIFY_SELECT_FALLBACK = '[^']*entity_type[^']*'/)
  assert.equal(verifyHelpers.match(/\.eq\('entity_type', 'mountain'\)/g)?.length, 4)

  const listBlock = trekActions.match(/if \(action === 'list_active_mountains'\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  const startBlock = trekActions.match(/if \(action === 'start_trek_session'\) \{[\s\S]*?if \(action === 'append_trek_point'/)?.[0] ?? ''
  const historicalBlock = trekActions.match(/if \(action === 'submit_historical_checkin'\) \{[\s\S]*?if \(action === 'generate_share_card'\)/)?.[0] ?? ''

  assert.match(listBlock, /\.eq\('entity_type', 'mountain'\)/)
  assert.match(startBlock, /\.select\('id, entity_type'\)[\s\S]*\.eq\('entity_type', 'mountain'\)/)
  assert.match(historicalBlock, /\.select\('id, entity_type'\)[\s\S]*\.eq\('entity_type', 'mountain'\)/)
  assert.match(
    trekClient,
    /function isTrekMountain\([\s\S]*mountain\.entity_type !== 'route_corridor'[\s\S]*typeof mountain\.altitude === 'number'[\s\S]*Number\.isFinite\(mountain\.altitude\)/,
  )
  assert.match(
    trekClient,
    /setMountains\(activeMountains\.filter\(isTrekMountain\)\)/,
  )
  assert.doesNotMatch(trekClient, /mountain\.altitude!/)
  assert.match(
    trekReferenceMap,
    /function formatSummitLabel\(altitude: number \| null\)[\s\S]*: '顶峰'/,
  )
})

test('detail runtime removes hand-written routes and shows the honest no-geometry state', () => {
  const forbidden = /mountain-route-segments|buildFu47bMockWaypoints|routeMockEnabled|fu47bRouteMock|地图服务没有响应|没有缓存到底图/
  assert.doesNotMatch(detailPage, forbidden)
  assert.doesNotMatch(detailClient, forbidden)
  assert.match(detailClient, /title="暂未收录参考轨迹"/)
  assert.match(detailClient, /copy="可先查看路线说明与风险提示，具体行程请使用专业户外导航工具。"/)
  assert.match(detailClient, /getMountainAccessDisplay\(mountain\.access_status, mountain\.entity_type\)/)
  assert.match(detailPage, /mountain_route_geometries/)
  assert.match(detailClient, /routeGeometry/)
})

test('route corridor copy and altitude display never masquerade as a mountain summit', () => {
  assert.match(detailClient, /getMountainDisplayAltitude\(mountain\)/)
  assert.match(detailClient, /mountain\.entity_type === 'route_corridor' \? '线路最高海拔 m' : '海拔 m'/)
  assert.match(detailClient, /mountain\.entity_type === 'route_corridor' \? '路线核心数据' : '山峰核心数据'/)
  assert.match(detailClient, /mountain\.entity_type === 'route_corridor' \? '这条路线适不适合你' : '这座山适不适合你'/)
  assert.match(detailClient, /entityType === 'route_corridor' \? '路线简介' : '山峰简介'/)
  assert.match(exploreClient, /getMountainDisplayAltitude\(mountain\)/)
  assert.match(exploreCard, /getMountainDisplayAltitude\(mountain\)/)
  assert.doesNotMatch(exploreCard, /mountain\.altitude\.toLocaleString/)
})
