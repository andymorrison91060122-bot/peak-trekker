import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DATA_ROOT = path.join(REPO_ROOT, 'data/mountains/route-geometry')
const PLAN_PATH = path.join(DATA_ROOT, 'route-ingest-plan.json')
const SNAPSHOT_PATH = path.join(DATA_ROOT, 'route-production-snapshot.json')
const PREFLIGHT_PATH = path.join(DATA_ROOT, 'route-production-preflight.json')
const REVIEW_PATH = path.join(DATA_ROOT, 'route-production-preflight.md')
const BLOCKERS_PATH = path.join(
  DATA_ROOT,
  'route-production-preflight-blockers.csv',
)

const EXPECTED_PLAN_SHA256 =
  '5108ad5f99ab9e084170e0ef6c19c54ea0f1f9120122f96dbab636b363a74505'
const EXPECTED_MIGRATION_SHA256 =
  'e9becd44ea6c44fa3167b3dc1ec4aa758c156c30bc3500b253b26cbec77250e9'
const LEGACY_ROUTE_KEYS = Object.freeze([
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
])
const HUTIAOXIA_ID = '9bef8995-54c4-5e7a-8b38-4342bb818faf'
const GANGRENBOQI_ID = '137df8c2-10cd-5705-b65a-60a904744246'
const PROJECT_REF = 'mngofocdsmqrqimsdyzf'
const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  'anon_key',
  'authorization',
  'cookie',
  'cookies',
  'jwt',
  'password',
  'service_role',
  'service_role_key',
  'signed_url',
  'token',
])

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath))
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, stableValue(value[key])]),
  )
}

export function buildStableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function readAndAssertPlan(filePath = PLAN_PATH) {
  const actual = fileSha256(filePath)
  assert.equal(actual, EXPECTED_PLAN_SHA256, 'Stage 4 plan SHA drift')
  const plan = readJson(filePath)
  assert.equal(plan.apply_supported, false)
  assert.equal(
    plan.preconditions.stage2_migration.sha256,
    EXPECTED_MIGRATION_SHA256,
  )
  assert.equal(
    plan.preconditions.production_target_snapshot.status,
    'required_before_apply',
  )
  return plan
}

export function assertSafeSnapshot(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertSafeSnapshot(entry, [...trail, String(index)]),
    )
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase()
    assert(
      !FORBIDDEN_SNAPSHOT_KEYS.has(normalized),
      `forbidden snapshot key: ${key}`,
    )
    assertSafeSnapshot(child, [...trail, key])
  }
}

function geometryKeyBySourceSha(plan) {
  const keyBySha = new Map()
  for (const row of plan.operations.private_track_uploads) {
    const current = keyBySha.get(row.source_file_sha256)
    assert(
      !current || current === row.effective_canonical_key,
      `track SHA maps to multiple canonical keys: ${row.source_file_sha256}`,
    )
    keyBySha.set(row.source_file_sha256, row.effective_canonical_key)
  }
  return keyBySha
}

export function buildExpectedTargets(plan) {
  const newRouteIds = new Set(
    plan.operations.mountain_inserts.map((row) => row.id),
  )
  const keyBySha = geometryKeyBySourceSha(plan)
  const existingById = new Map()
  for (const row of plan.operations.geometry_inserts) {
    if (newRouteIds.has(row.mountain_id)) continue
    const effectiveCanonicalKey = keyBySha.get(row.source_file_sha256)
    assert(
      effectiveCanonicalKey,
      `missing canonical key for geometry source ${row.source_file_sha256}`,
    )
    const candidate = {
      effective_canonical_key: effectiveCanonicalKey,
      id: row.mountain_id,
    }
    const current = existingById.get(row.mountain_id)
    if (current) {
      assert.deepEqual(current, candidate)
    } else {
      existingById.set(row.mountain_id, candidate)
    }
  }

  const storageObjects = [
    ...plan.operations.private_track_uploads.map((row) => ({
      bucket: row.bucket,
      expected_sha256: row.verified_sha256,
      object_path: row.object_path,
    })),
    ...plan.operations.cover_original_uploads.map((row) => ({
      bucket: row.bucket,
      expected_sha256: row.sha256,
      object_path: row.object_path,
    })),
    ...plan.operations.cover_thumbnail_uploads.map((row) => ({
      bucket: row.bucket,
      expected_sha256: row.sha256,
      object_path: row.object_path,
    })),
  ].sort((left, right) =>
    compareText(
      `${left.bucket}/${left.object_path}`,
      `${right.bucket}/${right.object_path}`,
    ),
  )
  const storageKeys = new Set(
    storageObjects.map((row) => `${row.bucket}/${row.object_path}`),
  )
  assert.equal(storageKeys.size, storageObjects.length)

  const targets = {
    existing_geometry_parents: [...existingById.values()].sort((left, right) =>
      compareText(left.effective_canonical_key, right.effective_canonical_key),
    ),
    new_route_identities: plan.operations.mountain_inserts
      .map((row) => ({
        effective_canonical_key: row.effective_canonical_key,
        id: row.id,
      }))
      .sort((left, right) =>
        compareText(left.effective_canonical_key, right.effective_canonical_key),
      ),
    storage_objects: storageObjects,
  }
  assert.equal(targets.existing_geometry_parents.length, 65)
  assert.equal(targets.new_route_identities.length, 11)
  assert.equal(targets.storage_objects.length, 104)
  return targets
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlTextArray(values) {
  return `ARRAY[${[...new Set(values)]
    .sort(compareText)
    .map(sqlLiteral)
    .join(', ')}]::text[]`
}

export function buildReadOnlySql(plan) {
  const targets = buildExpectedTargets(plan)
  const relevantIds = [
    ...targets.existing_geometry_parents.map((row) => row.id),
    ...targets.new_route_identities.map((row) => row.id),
    HUTIAOXIA_ID,
    GANGRENBOQI_ID,
  ]
  const relevantKeys = [
    ...targets.existing_geometry_parents.map(
      (row) => row.effective_canonical_key,
    ),
    ...targets.new_route_identities.map(
      (row) => row.effective_canonical_key,
    ),
    ...LEGACY_ROUTE_KEYS,
    'gangrenboqi-cluster',
    'hutiaoxia-gaolu-route',
  ]
  const plannedStorage = JSON.stringify(
    targets.storage_objects.map((row) => ({
      bucket_id: row.bucket,
      name: row.object_path,
    })),
  )

  return `WITH planned_storage AS (
  SELECT item.bucket_id, item.name
  FROM jsonb_to_recordset(${sqlLiteral(plannedStorage)}::jsonb)
    AS item(bucket_id text, name text)
),
target_mountains AS (
  SELECT jsonb_build_object(
    'access_status', to_jsonb(m) -> 'access_status',
    'aliases', to_jsonb(m) -> 'aliases',
    'altitude', to_jsonb(m) -> 'altitude',
    'effective_canonical_key', m.effective_canonical_key,
    'entity_type', to_jsonb(m) -> 'entity_type',
    'id', m.id::text,
    'is_active', m.is_active,
    'is_readable', m.is_readable,
    'length_km', to_jsonb(m) -> 'length_km',
    'name', m.name,
    'weather_enabled', to_jsonb(m) -> 'weather_enabled'
  ) AS row
  FROM public.mountains AS m
  WHERE m.id::text = ANY(${sqlTextArray(relevantIds)})
     OR m.effective_canonical_key = ANY(${sqlTextArray(relevantKeys)})
),
mountain_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'mountains'
    AND column_name = ANY(ARRAY[
      'aliases',
      'entity_type',
      'is_active',
      'is_readable',
      'length_km',
      'weather_enabled'
    ]::text[])
),
route_geometry_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'mountain_route_geometries'
),
planned_buckets AS (
  SELECT DISTINCT bucket_id
  FROM planned_storage
),
storage_buckets AS (
  SELECT jsonb_build_object('id', b.id, 'public', b.public) AS row
  FROM storage.buckets AS b
  INNER JOIN planned_buckets AS planned ON planned.bucket_id = b.id
),
storage_objects AS (
  SELECT jsonb_build_object(
    'bucket_id', object.bucket_id,
    'name', object.name,
    'sha256', NULL
  ) AS row
  FROM storage.objects AS object
  INNER JOIN planned_storage AS planned
    ON planned.bucket_id = object.bucket_id
   AND planned.name = object.name
)
SELECT jsonb_build_object(
  'captured_at', clock_timestamp(),
  'mountains', COALESCE(
    (SELECT jsonb_agg(row ORDER BY row ->> 'effective_canonical_key', row ->> 'id')
     FROM target_mountains),
    '[]'::jsonb
  ),
  'project_ref', ${sqlLiteral(PROJECT_REF)},
  'read_metrics', jsonb_build_object(
    'database_queries', 1,
    'planned_storage_paths_checked', ${targets.storage_objects.length},
    'storage_object_downloads', 0
  ),
  'schema', jsonb_build_object(
    'migration_ledger', jsonb_build_object(
      'applied', EXISTS (
        SELECT 1
        FROM supabase_migrations.schema_migrations
        WHERE version = '20260730110000'
      )
    ),
    'mountains_columns', COALESCE(
      (SELECT jsonb_agg(column_name ORDER BY column_name) FROM mountain_columns),
      '[]'::jsonb
    ),
    'route_geometry', jsonb_build_object(
      'columns', COALESCE(
        (SELECT jsonb_agg(column_name ORDER BY column_name)
         FROM route_geometry_columns),
        '[]'::jsonb
      ),
      'exists', to_regclass('public.mountain_route_geometries') IS NOT NULL,
      'policies', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'cmd', cmd,
          'name', policyname,
          'roles', roles
        ) ORDER BY policyname)
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'mountain_route_geometries'),
        '[]'::jsonb
      ),
      'rls_enabled', COALESCE(
        (SELECT relrowsecurity
         FROM pg_class
         WHERE oid = to_regclass('public.mountain_route_geometries')),
        false
      )
    )
  ),
  'storage', jsonb_build_object(
    'buckets', COALESCE(
      (SELECT jsonb_agg(row ORDER BY row ->> 'id') FROM storage_buckets),
      '[]'::jsonb
    ),
    'objects', COALESCE(
      (SELECT jsonb_agg(row ORDER BY row ->> 'bucket_id', row ->> 'name')
       FROM storage_objects),
      '[]'::jsonb
    )
  )
) AS capture;
`
}

function rowByIdOrKey(rows, target) {
  return rows.filter(
    (row) =>
      row.id === target.id
      || row.effective_canonical_key === target.effective_canonical_key,
  )
}

function buildIdentityClosure(plan, snapshot, blockers) {
  const targets = buildExpectedTargets(plan)
  const mountainRows = snapshot.mountains
  assert(Array.isArray(mountainRows), 'snapshot mountains must be an array')

  const parentResults = targets.existing_geometry_parents.map((target) => {
    const matches = rowByIdOrKey(mountainRows, target)
    const exact =
      matches.length === 1
      && matches[0].id === target.id
      && matches[0].effective_canonical_key === target.effective_canonical_key
    return {
      ...target,
      actual: matches.map((row) => ({
        effective_canonical_key: row.effective_canonical_key,
        id: row.id,
      })),
      status: exact ? 'matched' : 'mismatched',
    }
  })
  const mismatchedParents = parentResults.filter(
    (row) => row.status !== 'matched',
  )
  if (mismatchedParents.length) {
    blockers.push({
      code: 'existing_parent_identity_drift',
      count: mismatchedParents.length,
      detail: 'Existing geometry parent id/key closure differs from Stage 4.',
    })
  }

  const newResults = targets.new_route_identities.map((target) => {
    const matches = rowByIdOrKey(mountainRows, target)
    return {
      ...target,
      actual: matches.map((row) => ({
        effective_canonical_key: row.effective_canonical_key,
        id: row.id,
      })),
      status: matches.length === 0 ? 'absent' : 'present',
    }
  })
  const presentNew = newResults.filter((row) => row.status === 'present')
  if (presentNew.length) {
    blockers.push({
      code: 'new_route_identity_collision',
      count: presentNew.length,
      detail: 'A planned deterministic id or canonical key already exists.',
    })
  }

  return {
    existing_geometry_parents: {
      expected: parentResults.length,
      matched: parentResults.length - mismatchedParents.length,
      mismatched: mismatchedParents.length,
      rows: parentResults,
    },
    new_route_identities: {
      expected: newResults.length,
      absent: newResults.length - presentNew.length,
      present: presentNew.length,
      rows: newResults,
    },
  }
}

function buildHutiaoxia(snapshot, blockers) {
  const matches = rowByIdOrKey(snapshot.mountains, {
    effective_canonical_key: 'hutiaoxia-gaolu-route',
    id: HUTIAOXIA_ID,
  })
  const exact =
    matches.length === 1
    && matches[0].id === HUTIAOXIA_ID
    && matches[0].effective_canonical_key === 'hutiaoxia-gaolu-route'
    && Object.hasOwn(matches[0], 'aliases')
    && Object.hasOwn(matches[0], 'length_km')
  if (!exact) {
    blockers.push({
      code: 'hutiaoxia_expected_current_incomplete',
      count: 1,
      detail: 'Hutiaoxia id/key/aliases/length expected-current is incomplete.',
    })
  }
  return exact
    ? {
        expected_current: {
          aliases: matches[0].aliases,
          effective_canonical_key: matches[0].effective_canonical_key,
          id: matches[0].id,
          length_km: matches[0].length_km,
        },
        status: 'expected_current_complete',
      }
    : {
        actual: matches,
        expected_current: null,
        status: 'incomplete',
      }
}

function buildSchemaClosure(snapshot, blockers) {
  const schema = snapshot.schema
  assert(schema && typeof schema === 'object', 'snapshot schema missing')
  assert(
    Array.isArray(schema.mountains_columns),
    'mountains column evidence missing',
  )
  assert.equal(
    typeof schema.route_geometry?.exists,
    'boolean',
    'route geometry table state missing',
  )
  assert.equal(
    typeof schema.migration_ledger?.applied,
    'boolean',
    'migration ledger state missing',
  )

  const requiredMountainColumns = [
    'aliases',
    'entity_type',
    'is_active',
    'is_readable',
    'length_km',
    'weather_enabled',
  ]
  const missingColumns = requiredMountainColumns.filter(
    (column) => !schema.mountains_columns.includes(column),
  )
  const migrationApplied = schema.migration_ledger.applied
  if (migrationApplied && missingColumns.length) {
    blockers.push({
      code: 'applied_migration_schema_incomplete',
      count: missingColumns.length,
      detail: `Applied migration is missing columns: ${missingColumns.join(', ')}`,
    })
  }
  if (migrationApplied && !schema.route_geometry.exists) {
    blockers.push({
      code: 'applied_migration_geometry_table_missing',
      count: 1,
      detail: 'Migration ledger is applied but route geometry table is missing.',
    })
  }

  return {
    missing_mountain_columns: missingColumns,
    mountains_contract:
      missingColumns.length === 0 ? 'present' : 'missing_pre_migration',
    route_geometry_rls: schema.route_geometry.rls_enabled,
    route_geometry_table: schema.route_geometry.exists
      ? 'present'
      : 'missing_pre_migration',
    stage2_migration: migrationApplied ? 'applied' : 'not_applied',
  }
}

function buildStorageClosure(plan, snapshot, blockers) {
  const targets = buildExpectedTargets(plan).storage_objects
  assert(Array.isArray(snapshot.storage?.buckets), 'storage buckets missing')
  assert(Array.isArray(snapshot.storage?.objects), 'storage objects missing')
  const bucketById = new Map(
    snapshot.storage.buckets.map((row) => [row.id, row]),
  )
  const objectByKey = new Map()
  for (const row of snapshot.storage.objects) {
    const key = `${row.bucket_id}/${row.name}`
    assert(!objectByKey.has(key), `duplicate storage snapshot object: ${key}`)
    objectByKey.set(key, row)
  }

  const rows = targets.map((target) => {
    const bucket = bucketById.get(target.bucket)
    if (!bucket) return { ...target, status: 'bucket_missing' }
    const object = objectByKey.get(`${target.bucket}/${target.object_path}`)
    if (!object) return { ...target, status: 'absent' }
    if (!/^[a-f0-9]{64}$/.test(String(object.sha256 ?? ''))) {
      return { ...target, actual_sha256: null, status: 'sha_evidence_missing' }
    }
    return {
      ...target,
      actual_sha256: object.sha256,
      status:
        object.sha256 === target.expected_sha256
          ? 'same_sha'
          : 'different_sha',
    }
  })
  const counts = Object.fromEntries(
    [
      'absent',
      'bucket_missing',
      'different_sha',
      'same_sha',
      'sha_evidence_missing',
    ].map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ]),
  )
  if (counts.different_sha) {
    blockers.push({
      code: 'storage_sha_collision',
      count: counts.different_sha,
      detail: 'A planned Storage path exists with different bytes.',
    })
  }
  if (counts.sha_evidence_missing) {
    blockers.push({
      code: 'storage_existing_object_sha_missing',
      count: counts.sha_evidence_missing,
      detail: 'An existing planned Storage object was not downloaded for SHA.',
    })
  }
  assert.equal(
    Object.values(counts).reduce((total, value) => total + value, 0),
    targets.length,
  )
  return {
    ...counts,
    planned: targets.length,
    rows,
  }
}

function selectMountainSummary(snapshot, id, key) {
  const matches = rowByIdOrKey(snapshot.mountains, {
    effective_canonical_key: key,
    id,
  })
  return matches.length === 1 ? matches[0] : null
}

export function buildProductionPreflight({ plan, snapshot }) {
  assertSafeSnapshot(snapshot)
  assert.equal(snapshot.schema_version, 'route-production-snapshot-v1')
  assert.equal(snapshot.plan_sha256, EXPECTED_PLAN_SHA256)
  assert.equal(snapshot.migration_sha256, EXPECTED_MIGRATION_SHA256)
  assert.equal(snapshot.read_metrics?.database_queries, 1)

  const blockers = []
  const identity = buildIdentityClosure(plan, snapshot, blockers)
  const hutiaoxia = buildHutiaoxia(snapshot, blockers)
  const schema = buildSchemaClosure(snapshot, blockers)
  const storage = buildStorageClosure(plan, snapshot, blockers)
  const legacyRoutes = LEGACY_ROUTE_KEYS.map((key) => {
    const row = snapshot.mountains.find(
      (mountain) => mountain.effective_canonical_key === key,
    )
    return {
      effective_canonical_key: key,
      entity_type: row?.entity_type ?? null,
      found: Boolean(row),
      id: row?.id ?? null,
      weather_enabled: row?.weather_enabled ?? null,
    }
  })
  const missingLegacy = legacyRoutes.filter((row) => !row.found)
  if (missingLegacy.length) {
    blockers.push({
      code: 'legacy_route_identity_missing',
      count: missingLegacy.length,
      detail: 'One or more exact legacy route keys are absent.',
    })
  }

  const requiredActions = []
  if (schema.stage2_migration === 'not_applied') {
    requiredActions.push('review_and_apply_stage2_migration_separately')
  }
  if (storage.bucket_missing) {
    requiredActions.push('create_missing_storage_bucket_separately')
  }

  const normalizedBlockers = blockers.sort((left, right) =>
    compareText(left.code, right.code),
  )
  return {
    blockers: normalizedBlockers,
    gangrenboqi: {
      held: true,
      production_current: selectMountainSummary(
        snapshot,
        GANGRENBOQI_ID,
        'gangrenboqi-cluster',
      ),
    },
    hutiaoxia,
    identity,
    input: {
      migration_sha256: EXPECTED_MIGRATION_SHA256,
      plan_sha256: EXPECTED_PLAN_SHA256,
      snapshot_sha256: sha256(buildStableJson(snapshot)),
    },
    legacy_routes: legacyRoutes,
    read_metrics: snapshot.read_metrics,
    ready_for_separate_apply_plan: normalizedBlockers.length === 0,
    required_actions: requiredActions,
    schema,
    schema_version: 'route-production-preflight-v1',
    storage,
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function buildBlockersCsv(preflight) {
  const columns = ['code', 'count', 'detail']
  return `${[
    columns.map(csvCell).join(','),
    ...preflight.blockers.map((row) =>
      columns.map((column) => csvCell(row[column])).join(','),
    ),
  ].join('\n')}\n`
}

function buildReview(preflight) {
  const identity = preflight.identity
  const storage = preflight.storage
  return `# Stage 5 Route Production Read-Only Preflight

## Decision

- Ready for separate apply plan: ${preflight.ready_for_separate_apply_plan}
- This stage performed read-only capture only. It did not apply a migration or write Database, Storage, or Feishu.
- Stage 4 remains \`apply_supported=false\`.

## Identity Closure

- Existing geometry parents: ${identity.existing_geometry_parents.matched}/${identity.existing_geometry_parents.expected} matched; ${identity.existing_geometry_parents.mismatched} drift.
- New deterministic route identities absent: ${identity.new_route_identities.absent}/${identity.new_route_identities.expected}; ${identity.new_route_identities.present} collision.
- Hutiaoxia expected-current: ${preflight.hutiaoxia.status}.
- Gangrenboqi remains held; no product field is changed.

## Schema And Ledger

- Stage 2 migration: ${preflight.schema.stage2_migration}.
- Mountains runtime contract: ${preflight.schema.mountains_contract}.
- Route geometry table: ${preflight.schema.route_geometry_table}.
- Route geometry RLS: ${String(preflight.schema.route_geometry_rls)}.

## Storage Closure

- Planned paths: ${storage.planned}.
- Absent: ${storage.absent}.
- Bucket missing: ${storage.bucket_missing}.
- Existing same SHA: ${storage.same_sha}.
- Existing different SHA: ${storage.different_sha}.
- Existing without SHA evidence: ${storage.sha_evidence_missing}.

## Required Separate Actions

${preflight.required_actions.length
    ? preflight.required_actions.map((action) => `- ${action}`).join('\n')
    : '- None.'}

## Blockers

${preflight.blockers.length
    ? preflight.blockers.map((row) => `- ${row.code}: ${row.count} - ${row.detail}`).join('\n')
    : '- None.'}
`
}

function atomicWrite(filePath, body) {
  const temporaryPath = `${filePath}.tmp`
  fs.writeFileSync(temporaryPath, body)
  fs.renameSync(temporaryPath, filePath)
}

function writeDerived(preflight, outputRoot = DATA_ROOT) {
  atomicWrite(
    path.join(outputRoot, path.basename(PREFLIGHT_PATH)),
    buildStableJson(preflight),
  )
  atomicWrite(
    path.join(outputRoot, path.basename(REVIEW_PATH)),
    buildReview(preflight),
  )
  atomicWrite(
    path.join(outputRoot, path.basename(BLOCKERS_PATH)),
    buildBlockersCsv(preflight),
  )
}

function expectedDerived(preflight) {
  return new Map([
    [PREFLIGHT_PATH, buildStableJson(preflight)],
    [REVIEW_PATH, buildReview(preflight)],
    [BLOCKERS_PATH, buildBlockersCsv(preflight)],
  ])
}

function checkDerived(preflight) {
  for (const [filePath, expected] of expectedDerived(preflight)) {
    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      expected,
      `derived artifact drift: ${filePath}`,
    )
  }
}

function sanitizeCapture(raw) {
  const snapshot = {
    captured_at: raw.captured_at,
    migration_sha256: EXPECTED_MIGRATION_SHA256,
    mountains: raw.mountains,
    plan_sha256: EXPECTED_PLAN_SHA256,
    project_ref: raw.project_ref,
    read_metrics: raw.read_metrics,
    schema: raw.schema,
    schema_version: 'route-production-snapshot-v1',
    storage: raw.storage,
  }
  assertSafeSnapshot(snapshot)
  return snapshot
}

function parseCli(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag)
    return index === -1 ? null : argv[index + 1]
  }
  return {
    input: valueAfter('--input'),
    mode: argv.includes('--capture')
      ? 'capture'
      : argv.includes('--sql')
        ? 'sql'
      : argv.includes('--check')
        ? 'check'
        : argv.includes('--derive')
          ? 'derive'
          : null,
    outputRoot: valueAfter('--output-root'),
  }
}

async function main() {
  const options = parseCli(process.argv.slice(2))
  assert(options.mode, 'use --sql, --capture, --derive, or --check')
  const plan = readAndAssertPlan()

  if (options.mode === 'sql') {
    process.stdout.write(buildReadOnlySql(plan))
    return
  }

  if (options.mode === 'capture') {
    assert(options.input, '--input is required for capture')
    const snapshot = sanitizeCapture(readJson(path.resolve(options.input)))
    atomicWrite(SNAPSHOT_PATH, buildStableJson(snapshot))
    const preflight = buildProductionPreflight({ plan, snapshot })
    writeDerived(preflight)
    process.stdout.write(`${JSON.stringify({
      blockers: preflight.blockers.length,
      ready_for_separate_apply_plan:
        preflight.ready_for_separate_apply_plan,
    })}\n`)
    return
  }

  const snapshot = readJson(SNAPSHOT_PATH)
  const preflight = buildProductionPreflight({ plan, snapshot })
  if (options.mode === 'check') {
    checkDerived(preflight)
  } else {
    assert(options.outputRoot, '--output-root is required for derive')
    fs.mkdirSync(path.resolve(options.outputRoot), { recursive: true })
    writeDerived(preflight, path.resolve(options.outputRoot))
  }
  process.stdout.write(`${JSON.stringify({
    mode: options.mode,
    ready_for_separate_apply_plan: preflight.ready_for_separate_apply_plan,
  })}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
