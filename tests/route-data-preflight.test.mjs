import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  assertSafeSnapshot,
  buildExpectedTargets,
  buildProductionPreflight,
  buildReadOnlySql,
  buildStableJson,
  readAndAssertPlan,
} from '../scripts/mountains/preflight-route-data.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const PLAN_PATH = path.join(
  ROOT,
  'data/mountains/route-geometry/route-ingest-plan.json',
)
const SCRIPT_PATH = path.join(
  ROOT,
  'scripts/mountains/preflight-route-data.mjs',
)

const plan = readAndAssertPlan(PLAN_PATH)
const targets = buildExpectedTargets(plan)
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
]

function mountainRow(id, key, overrides = {}) {
  return {
    id,
    effective_canonical_key: key,
    name: key,
    altitude: 1000,
    entity_type: null,
    aliases: null,
    length_km: null,
    weather_enabled: null,
    is_active: true,
    is_readable: true,
    access_status: 'open',
    ...overrides,
  }
}

function completeSnapshot(overrides = {}) {
  const mountains = targets.existing_geometry_parents.map((row) =>
    mountainRow(row.id, row.effective_canonical_key),
  )
  const hutiaoxiaIndex = mountains.findIndex(
    (row) => row.effective_canonical_key === 'hutiaoxia-gaolu-route',
  )
  assert.notEqual(hutiaoxiaIndex, -1)
  mountains[hutiaoxiaIndex] = mountainRow(
    '9bef8995-54c4-5e7a-8b38-4342bb818faf',
    'hutiaoxia-gaolu-route',
    {
      aliases: ['虎跳峡高路徒步线'],
      length_km: 22,
    },
  )
  const gangrenboqiIndex = mountains.findIndex(
    (row) => row.effective_canonical_key === 'gangrenboqi-cluster',
  )
  assert.notEqual(gangrenboqiIndex, -1)
  mountains[gangrenboqiIndex] = mountainRow(
    '137df8c2-10cd-5705-b65a-60a904744246',
    'gangrenboqi-cluster',
    {
      access_status: 'pilgrimage_only',
      altitude: 4000,
      name: '冈仁波齐周边山峰',
    },
  )
  const presentKeys = new Set(
    mountains.map((row) => row.effective_canonical_key),
  )
  for (const [index, key] of LEGACY_ROUTE_KEYS.entries()) {
    if (presentKeys.has(key)) continue
    mountains.push(
      mountainRow(
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        key,
      ),
    )
  }

  return {
    schema_version: 'route-production-snapshot-v1',
    captured_at: '2026-07-30T00:00:00.000Z',
    project_ref: 'fixture',
    plan_sha256:
      '5108ad5f99ab9e084170e0ef6c19c54ea0f1f9120122f96dbab636b363a74505',
    migration_sha256:
      'e9becd44ea6c44fa3167b3dc1ec4aa758c156c30bc3500b253b26cbec77250e9',
    read_metrics: {
      database_queries: 1,
      object_downloads: 0,
      storage_object_rows: 0,
    },
    schema: {
      mountains_columns: [
        'aliases',
        'effective_canonical_key',
        'entity_type',
        'is_active',
        'is_readable',
        'length_km',
        'weather_enabled',
      ],
      route_geometry: {
        columns: [],
        exists: false,
        policies: [],
        rls_enabled: null,
      },
      migration_ledger: {
        applied: false,
        rows: [],
      },
    },
    mountains,
    storage: {
      buckets: [
        { id: 'mountain-media', public: true },
      ],
      objects: [],
    },
    ...overrides,
  }
}

test('binds the exact Stage 4 plan and derives 65/11/104 targets', () => {
  assert.equal(targets.existing_geometry_parents.length, 65)
  assert.equal(targets.new_route_identities.length, 11)
  assert.equal(targets.storage_objects.length, 104)
  assert.equal(targets.storage_objects.filter((row) => row.bucket === 'mountain-route-source').length, 74)
  assert.equal(targets.storage_objects.filter((row) => row.bucket === 'mountain-media').length, 30)
})

test('accepts exact identities, absent new rows, complete Hutiaoxia CAS, and explicit pre-migration state', () => {
  const result = buildProductionPreflight({
    plan,
    snapshot: completeSnapshot(),
  })

  assert.equal(result.identity.existing_geometry_parents.matched, 65)
  assert.equal(result.identity.new_route_identities.absent, 11)
  assert.equal(result.hutiaoxia.status, 'expected_current_complete')
  assert.equal(result.schema.stage2_migration, 'not_applied')
  assert.equal(result.schema.route_geometry_table, 'missing_pre_migration')
  assert.equal(result.storage.planned, 104)
  assert.equal(result.storage.absent, 30)
  assert.equal(result.storage.bucket_missing, 74)
  assert.equal(result.storage.different_sha, 0)
  assert.equal(result.ready_for_separate_apply_plan, true)
})

test('identity drift or an existing new deterministic identity is a hard blocker', () => {
  const snapshot = completeSnapshot()
  snapshot.mountains[0].effective_canonical_key = 'wrong-key'
  snapshot.mountains.push(
    mountainRow(
      targets.new_route_identities[0].id,
      targets.new_route_identities[0].effective_canonical_key,
    ),
  )
  const result = buildProductionPreflight({ plan, snapshot })

  assert.equal(result.ready_for_separate_apply_plan, false)
  assert.equal(result.identity.existing_geometry_parents.mismatched, 1)
  assert.equal(result.identity.new_route_identities.present, 1)
  assert.equal(result.blockers.some((row) => row.code === 'existing_parent_identity_drift'), true)
  assert.equal(result.blockers.some((row) => row.code === 'new_route_identity_collision'), true)
})

test('different object SHA is a hard blocker while same SHA is reusable', () => {
  const snapshot = completeSnapshot()
  const [same, different] = targets.storage_objects
  snapshot.storage.buckets.push({ id: 'mountain-route-source', public: false })
  snapshot.storage.objects = [
    { bucket_id: same.bucket, name: same.object_path, sha256: same.expected_sha256 },
    { bucket_id: different.bucket, name: different.object_path, sha256: 'f'.repeat(64) },
  ]
  snapshot.read_metrics.object_downloads = 2
  snapshot.read_metrics.storage_object_rows = 2

  const result = buildProductionPreflight({ plan, snapshot })
  assert.equal(result.storage.same_sha, 1)
  assert.equal(result.storage.different_sha, 1)
  assert.equal(result.ready_for_separate_apply_plan, false)
  assert.equal(result.blockers.some((row) => row.code === 'storage_sha_collision'), true)
})

test('snapshot rejects secrets and mutation-shaped fields', () => {
  assert.throws(
    () => assertSafeSnapshot({ authorization: 'Bearer secret' }),
    /forbidden snapshot key: authorization/,
  )
  assert.throws(
    () => assertSafeSnapshot({ service_role_key: 'secret' }),
    /forbidden snapshot key: service_role_key/,
  )
})

test('two independent derived builds are byte-identical and omit captured_at', () => {
  const snapshot = completeSnapshot()
  const first = buildStableJson(buildProductionPreflight({ plan, snapshot }))
  const second = buildStableJson(buildProductionPreflight({
    plan: JSON.parse(JSON.stringify(plan)),
    snapshot: JSON.parse(JSON.stringify(snapshot)),
  }))
  assert.equal(first, second)
  assert.equal(first.includes('captured_at'), false)
})

test('preflight source contains no database or Storage mutation API', () => {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8')
  assert.doesNotMatch(
    source,
    /\b(?:supabase|storage|client)\.(?:insert|update|upsert|delete|remove|upload|createBucket|emptyBucket|rpc)\s*\(/,
  )
  assert.doesNotMatch(
    source,
    /\b(?:INSERT\s+INTO|UPDATE\s+(?:public|storage)\.|DELETE\s+FROM|TRUNCATE\s+|DROP\s+(?:TABLE|SCHEMA))\b/i,
  )
})

test('generated production query is one read-only batch over all 104 paths', () => {
  const sql = buildReadOnlySql(plan)
  assert.match(sql, /^WITH planned_storage AS \(/)
  assert.match(sql, /SELECT jsonb_build_object\(/)
  assert.match(sql, /'planned_storage_paths_checked', 104/)
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT\s+INTO|UPDATE\s+(?:public|storage)\.|DELETE\s+FROM|TRUNCATE\s+|DROP\s+(?:TABLE|SCHEMA))\b/i,
  )
})
