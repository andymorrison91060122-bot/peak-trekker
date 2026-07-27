import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  buildRouteReference,
  buildS3aReports,
  roundAltitudeHalfUp,
} from '../scripts/mountains/s3a-r5-report.mjs'
import {
  buildImportBatchSql,
  buildImportBatches,
  buildImportPlan,
  buildLegacyBindingSql,
  buildLegacyReconciliationSql,
  IMPORT_BATCH_SIZE,
  LEGACY_RETAINED,
  LEGACY_REUSE_BY_CANONICAL_KEY,
} from '../scripts/mountains/s3a-import.mjs'
import {
  gateReasons,
} from '../scripts/mountains/t11-quality-activation.mjs'

const migrationA = fs.readFileSync(
  'supabase/migrations/20260726170147_s3a_mountain_import_prep_r5.sql',
  'utf8'
)
const migrationB = fs.readFileSync(
  'supabase/migrations/20260727165934_s3a_mountain_activation_guard_r5.sql',
  'utf8'
)
const activationRouteNoteMigration = fs.readFileSync(
  'supabase/migrations/20260728090000_s3a_activation_route_note_and_altitude_provenance.sql',
  'utf8'
)
const importConfirmRoute = fs.readFileSync('src/app/api/import/confirm/route.ts', 'utf8')
const trekVerifyHelpers = fs.readFileSync('src/lib/trek-verify-helpers.ts', 'utf8')
const trekActionsRoute = fs.readFileSync('src/app/api/trek/actions/route.ts', 'utf8')
const weatherRoute = fs.readFileSync('src/app/api/weather/[mountainId]/route.ts', 'utf8')

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split(/\n/).map((line) => JSON.parse(line))
}

test('altitude integer display uses deterministic half-up rounding and keeps exact numeric separately', () => {
  assert.equal(roundAltitudeHalfUp(241.2), 241)
  assert.equal(roundAltitudeHalfUp(1856.7), 1857)
  assert.equal(roundAltitudeHalfUp(1135.5), 1136)
  assert.equal(roundAltitudeHalfUp(0.5), 1)
  assert.equal(roundAltitudeHalfUp(null), null)

  const report = buildS3aReports()
  assert.equal(report.decimal_altitude_count, 124)
  assert.equal(report.decimal_altitudes.find((row) => row.effective_canonical_key === 'taishan')?.altitude_integer, 1533)
  assert.equal(report.decimal_altitudes.find((row) => row.effective_canonical_key === 'taishan')?.altitude_m_exact, 1532.7)
})

test('frozen sidecar hashes and authoritative access distribution stay pinned', () => {
  const report = buildS3aReports()
  assert.equal(report.frozen_hashes_match, true)
  assert.deepEqual(report.access_status_distribution, {
    open: 347,
    pilgrimage_only: 1,
    unknown: 4,
    closed: 7,
  })
})

test('migration is fail-closed and separates readable history from active listing', () => {
  assert.match(migrationA, /ADD COLUMN IF NOT EXISTS is_readable BOOLEAN NOT NULL DEFAULT false/)
  assert.match(migrationA, /UPDATE public\.mountains\s+SET is_readable = true/)
  assert.match(migrationA, /ALTER COLUMN is_active SET DEFAULT false/)
  assert.match(migrationA, /ADD COLUMN IF NOT EXISTS summit_radius_m INTEGER/)
  assert.match(migrationA, /DROP POLICY IF EXISTS mountains_select ON public\.mountains/)
  assert.match(migrationA, /CREATE POLICY mountains_select[\s\S]*USING \(is_readable = true\)/)
  assert.doesNotMatch(migrationA, /enforce_mountain_activation_ready/)
  assert.doesNotMatch(migrationA, /mountains_activation_ready_guard/)
})

test('activation guard is a continuous invariant, not a one-column update hook', () => {
  assert.match(migrationB, /CREATE OR REPLACE FUNCTION public\.enforce_mountain_activation_ready\(\)/)
  assert.match(migrationB, /IF NEW\.is_active = true THEN/)
  assert.match(migrationB, /NEW\.is_readable IS DISTINCT FROM true/)
  assert.match(migrationB, /NEW\.altitude IS NULL/)
  assert.match(migrationB, /NULLIF\(BTRIM\(NEW\.cover_image\), ''\) IS NULL/)
  assert.match(migrationB, /NULLIF\(BTRIM\(NEW\.description\), ''\) IS NULL/)
  assert.match(migrationB, /NULLIF\(BTRIM\(NEW\.risk_note\), ''\) IS NULL/)
  assert.match(migrationB, /BEFORE INSERT OR UPDATE ON public\.mountains/)
  assert.doesNotMatch(migrationB, /BEFORE INSERT OR UPDATE OF is_active/)
  assert.doesNotMatch(migrationB, /legacy.*exempt/i)
})

test('activation guard has a row-level precheck before trigger creation', () => {
  const precheck = migrationB.match(/DO \$\$[\s\S]*?DROP TRIGGER IF EXISTS mountains_activation_ready_guard/)?.[0] ?? ''
  assert.match(precheck, /jsonb_agg/)
  assert.match(precheck, /WHERE is_active = true/)
  assert.match(precheck, /RAISE EXCEPTION 'mountains_activation_ready_guard precheck failed/)
})

test('forward activation guard requires route_note and pins all five altitude provenance URLs', () => {
  assert.match(
    activationRouteNoteMigration,
    /NULLIF\(BTRIM\(NEW\.route_note\), ''\) IS NULL/
  )
  assert.match(
    activationRouteNoteMigration,
    /mountains_activation_route_note_guard precheck failed/
  )
  assert.match(
    activationRouteNoteMigration,
    /GET DIAGNOSTICS updated_count = ROW_COUNT/
  )
  assert.equal(
    activationRouteNoteMigration.match(
      /https:\/\/www\.forestry\.gov\.cn\/c\/www\/kjkjxw\/529581\.jhtml/g
    )?.length,
    3
  )
  assert.match(
    activationRouteNoteMigration,
    /https:\/\/ydyl\.gansu\.gov\.cn\/gsydyl\/gjjl\/llssl\/202311\/t20231128_15845\.html/
  )
  assert.match(
    activationRouteNoteMigration,
    /https:\/\/hyj\.gxzf\.gov\.cn\/zwgk_66846\/hygl\/t7663494\.shtml/
  )
})

test('direct-id creation and service routes require is_active=true', () => {
  assert.equal(importConfirmRoute.match(/\.eq\('is_active', true\)/g)?.length, 2)
  assert.equal(trekVerifyHelpers.match(/\.eq\('is_active', true\)/g)?.length, 4)
  assert.match(trekActionsRoute, /\.from\('mountains'\)[\s\S]*\.select\('id'\)[\s\S]*\.eq\('id', mountainId\)[\s\S]*\.eq\('is_active', true\)[\s\S]*\.single\(\)/)
  assert.match(weatherRoute, /\.from\('mountains'\)[\s\S]*\.eq\('id', mountainId\)[\s\S]*\.eq\('is_active', true\)[\s\S]*\.maybeSingle\(\)/)
})

test('route_reference preserves per-route payloads and does not invent a representative route', () => {
  const enrichment = readJsonl('data/mountains/ledger/effective-canonical-enrichment.jsonl')
  const byKey = new Map(enrichment.map((row) => [row.effective_canonical_key, row]))
  const perRouteOnlyKeys = [
    'helan-shan',
    'huanggang-shan',
    'lue-shan',
    'wuling-shan',
    'yubeng-route',
    'yuzhu-feng',
  ]

  for (const key of perRouteOnlyKeys) {
    const row = byKey.get(key)
    assert.equal(row.length.resolution, 'per_route_only')
    assert.equal(row.length.length_km, null)
    assert.equal(row.length.selected_route ?? null, null)
    assert.ok(buildRouteReference(row.length).length >= 1)
  }

  const multiRouteRows = enrichment.filter((row) => (row.length?.routes ?? []).length > 1)
  assert.equal(multiRouteRows.length, 9)
  for (const row of multiRouteRows) {
    assert.deepEqual(buildRouteReference(row.length), row.length.routes.map((route) => ({
      route_label: route.route_label ?? null,
      semantic: route.semantic ?? null,
      km: typeof route.km === 'number' ? route.km : null,
      aspect: route.aspect ?? null,
      source_candidate_keys: Array.isArray(route.source_candidate_keys) ? route.source_candidate_keys : [],
      source_raws: Array.isArray(route.source_raws) ? route.source_raws : [],
      correction: route.correction ?? null,
    })))
  }

  const tiantangzhai = byKey.get('tiantang-zhai')
  assert.deepEqual(
    tiantangzhai.length.routes.map((route) => [route.route_label, route.km]),
    [
      ['天堂寨未核入口线', 10],
      ['天堂寨未核入口线', 10],
    ]
  )
})

test('review provenance fields capture intro and semantic needs-review states for T11', () => {
  const report = buildS3aReports()
  assert.ok(report.review_status_design.intro_needs_review_keys.includes('muztagata-feng'))
  assert.ok(report.review_status_design.intro_needs_review_keys.includes('yulong-xueshan'))
  assert.ok(report.review_status_design.semantic_needs_review_keys.includes('zhangjiajie-tianmen-shan'))
  assert.ok(report.review_status_design.semantic_needs_review_keys.includes('shennong-ding'))
  assert.equal(report.review_status_design.t11_rule.includes('not auto-ready'), true)
  assert.match(report.p04_identity_diff[0].review_persistence.source_payload_sha256, /^[a-f0-9]{64}$/)
})

test('coordinate and difficulty changes are blocked unless separately approved', () => {
  const report = buildS3aReports()
  assert.equal(report.p04_identity_diff.length, 12)
  assert.equal(report.coordinate_blocked.length, 11)
  assert.equal(report.coordinate_blocked.some((row) => row.effective_canonical_key === 'muztagata-feng'), false)
  assert.deepEqual(report.difficulty_blocked.map((row) => row.effective_canonical_key).sort(), ['emeishan', 'huashan'])
})

test('import plan closes 359 canonicals over 15 reused and 344 deterministic ids', () => {
  const plan = buildImportPlan()
  assert.equal(plan.rows.length, 359)
  assert.equal(new Set(plan.rows.map((row) => row.effective_canonical_key)).size, 359)
  assert.equal(new Set(plan.rows.map((row) => row.id)).size, 359)
  assert.equal(Object.keys(LEGACY_REUSE_BY_CANONICAL_KEY).length, 15)
  assert.equal(LEGACY_RETAINED.length, 3)
  assert.deepEqual(plan.summary, {
    canonical_rows: 359,
    reused_legacy_rows: 15,
    deterministic_new_rows: 344,
    retained_legacy_rows: 3,
    expected_final_mountain_rows: 362,
  })
  assert.equal(plan.rows.every((row) => row.is_active === false), true)
  assert.equal(plan.rows.every((row) => row.is_readable === false), true)
})

test('import rows use T13 coordinates/radii with honest seed fallback and pinned buckets', () => {
  const plan = buildImportPlan()
  assert.equal(plan.rows.every((row) => Number.isFinite(row.latitude)), true)
  assert.equal(plan.rows.every((row) => Number.isFinite(row.longitude)), true)
  assert.equal(plan.rows.filter((row) => row.summit_radius_m === null).length, 17)
  assert.deepEqual(plan.radius_bucket_counts, {
    summit_4dp_or_more: 160,
    area: 67,
    seed_3dp_or_more: 7,
    seed_2dp: 26,
    seed_1dp: 82,
    seed_0dp_inactive: 17,
  })

  const aerjin = plan.rows.find((row) => row.effective_canonical_key === 'aerjin-shan')
  assert.equal(aerjin.coordinate_status, 'unresolved')
  assert.equal(aerjin.coordinate_kind, 'seed')
  assert.equal(aerjin.latitude, 39.35)
  assert.equal(aerjin.longitude, 94.1)
  assert.equal(aerjin.summit_radius_m, 15000)

  const xuedou = plan.rows.find((row) => row.effective_canonical_key === 'xuedou-shan')
  assert.equal(xuedou.altitude, 972)
  assert.equal(xuedou.altitude_m_exact, 971.7)
})

test('import payload is source-faithful, sanitized, and preserves approved access distribution', () => {
  const plan = buildImportPlan()
  assert.deepEqual(plan.access_status_distribution, {
    open: 347,
    closed: 7,
    pilgrimage_only: 1,
    unknown: 4,
  })
  const serialized = JSON.stringify(plan.rows)
  assert.equal(serialized.includes('file_token'), false)
  assert.equal(serialized.includes('/private/tmp'), false)
  assert.equal(serialized.includes('source-cache'), false)
  assert.equal(plan.rows.filter((row) => row.altitude === null).length, 0)
  const t11AltitudeExpected = {
    'aerjin-shan': [5798, 5798],
    'weizhou-volcanic-landform-route': [80, 79.6],
    'yading-xiannairi': [5999, 5998.5],
    'yading-xianuoduoji': [5951, 5951.3],
    'yading-yangmaiyong': [6033, 6033],
  }
  const altitudeSources = {
    'aerjin-shan':
      'https://ydyl.gansu.gov.cn/gsydyl/gjjl/llssl/202311/t20231128_15845.html',
    'weizhou-volcanic-landform-route':
      'https://hyj.gxzf.gov.cn/zwgk_66846/hygl/t7663494.shtml',
    'yading-xiannairi':
      'https://www.forestry.gov.cn/c/www/kjkjxw/529581.jhtml',
    'yading-xianuoduoji':
      'https://www.forestry.gov.cn/c/www/kjkjxw/529581.jhtml',
    'yading-yangmaiyong':
      'https://www.forestry.gov.cn/c/www/kjkjxw/529581.jhtml',
  }
  for (const [key, [display, exact]] of Object.entries(t11AltitudeExpected)) {
    const row = plan.rows.find(
      (candidate) => candidate.effective_canonical_key === key
    )
    assert.equal(row.altitude, display)
    assert.equal(row.altitude_m_exact, exact)
    assert.equal(row.field_review_status.altitude, 'approved')
    assert.equal(
      row.field_review_status.altitude_resolution.source_url,
      altitudeSources[key]
    )
    assert.deepEqual(
      row.field_review_status.altitude_resolution.conflict_values_m,
      JSON.parse(
        fs.readFileSync(
          'data/mountains/t11-altitude-overrides.json',
          'utf8'
        )
      ).rows.find(
        (override) => override.effective_canonical_key === key
      ).conflict_values_m
    )
  }
})

test('D10 supplies exactly nine honest no-public-route notes without inventing routes', () => {
  const plan = buildImportPlan()
  const keys = [
    'kawagebo',
    'namchabarwa',
    'nianbaoyuze',
    'nyainqentanglha',
    'yading-xiannairi',
    'yading-xianuoduoji',
    'yading-yangmaiyong',
    'yala-xueshan',
    'yulong-xueshan',
  ]
  const rows = plan.rows.filter((row) => keys.includes(row.effective_canonical_key))
  assert.equal(rows.length, 9)
  assert.equal(rows.every((row) => row.route_note?.includes('公开攀登路线')), true)
  assert.equal(
    rows.every((row) => !/(入口|公里|km|环线|大本营)/i.test(row.route_note)),
    true
  )
  assert.equal(
    plan.rows.filter((row) => row.route_note?.includes('公开攀登路线')).length,
    9
  )
})

test('import execution is staged as one row, twenty rows, then 18 bounded full batches', () => {
  const plan = buildImportPlan()
  const execution = buildImportBatches(plan)
  assert.equal(IMPORT_BATCH_SIZE, 20)
  assert.equal(execution.probe_one.length, 1)
  assert.equal(execution.probe_twenty.length, 20)
  assert.equal(execution.probe_twenty[0].id, execution.probe_one[0].id)
  assert.equal(
    execution.probe_twenty.every(
      (row) => !LEGACY_REUSE_BY_CANONICAL_KEY[row.effective_canonical_key]
    ),
    true
  )
  assert.equal(execution.full_batches.length, 18)
  assert.deepEqual(
    execution.full_batches.map((rows) => rows.length),
    [...Array(17).fill(20), 19]
  )
  assert.deepEqual(
    execution.full_batches.flat().map((row) => row.effective_canonical_key),
    plan.rows.map((row) => row.effective_canonical_key)
  )
})

test('each batch uses an isolated dollar-quoted recordset and canonical-key upsert', () => {
  const execution = buildImportBatches(buildImportPlan())
  const sqlStatements = execution.full_batches.map((rows, index) => (
    buildImportBatchSql(rows, `batch-${String(index + 1).padStart(3, '0')}`)
  ))
  const tags = sqlStatements.map((sql) => {
    const match = sql.match(/jsonb_to_recordset\((\$[a-z0-9_]+\$)(\[[\s\S]*\])\1::jsonb\)/)
    assert.ok(match)
    const [, tag, json] = match
    assert.equal(json.includes(tag), false)
    assert.equal(JSON.parse(json).length <= IMPORT_BATCH_SIZE, true)
    assert.equal(Buffer.byteLength(json) < 100_000, true)
    return tag
  })

  assert.equal(new Set(tags).size, sqlStatements.length)
  for (const sql of sqlStatements) {
    assert.equal((sql.match(/jsonb_to_recordset/g) ?? []).length, 1)
    assert.match(
      sql,
      /ON CONFLICT \(effective_canonical_key\)\s+WHERE effective_canonical_key IS NOT NULL\s+DO UPDATE/
    )
    assert.doesNotMatch(sql, /ON CONFLICT \(id\)/)
    assert.match(sql, /latitude = m\.latitude/)
    assert.match(sql, /longitude = m\.longitude/)
    assert.match(sql, /province = m\.province/)
    assert.match(sql, /difficulty = m\.difficulty/)
    assert.match(sql, /min_license = m\.min_license/)
    assert.match(sql, /is_active = m\.is_active/)
    assert.match(sql, /is_readable = m\.is_readable/)
    assert.match(
      sql,
      /image_license_manifest = CASE\s+WHEN jsonb_array_length\(COALESCE\(m\.image_license_manifest, '\[\]'::jsonb\)\) > 0\s+THEN m\.image_license_manifest\s+ELSE EXCLUDED\.image_license_manifest\s+END/
    )
    assert.match(sql, /WHERE m\.id = EXCLUDED\.id/)
    assert.doesNotMatch(sql, /enforce_mountain_activation_ready/)
    assert.doesNotMatch(sql, /CREATE TRIGGER/)
  }
})

test('legacy binding and reconciliation are exact-id, idempotent, and preserve coordinates', () => {
  const bindingSql = buildLegacyBindingSql()
  const reconciliationSql = buildLegacyReconciliationSql()

  assert.match(bindingSql, /jsonb_to_recordset/)
  assert.match(bindingSql, /UPDATE public\.mountains AS m/)
  assert.match(bindingSql, /m\.id = binding\.id/)
  assert.match(bindingSql, /expected_rows.*15/)
  for (const [key, id] of Object.entries(LEGACY_REUSE_BY_CANONICAL_KEY)) {
    assert.match(bindingSql, new RegExp(key))
    assert.match(bindingSql, new RegExp(id))
  }

  assert.match(reconciliationSql, /SET is_active = true,\s+is_readable = true/)
  assert.match(reconciliationSql, /SET is_active = false,\s+is_readable = true/)
  assert.match(reconciliationSql, /expected 362 total mountains after reconciliation/)
  assert.match(reconciliationSql, /legacy latitude\/longitude changed/)
  assert.match(reconciliationSql, /before_mountains.*18/)
  assert.match(reconciliationSql, /after_mountains/)
  assert.match(reconciliationSql, /delta_mountains/)
  assert.doesNotMatch(reconciliationSql, /enforce_mountain_activation_ready/)
  assert.doesNotMatch(reconciliationSql, /CREATE TRIGGER/)
})

test('T11 content gate is mechanical and activation remains staged 1 -> 20 -> remaining', () => {
  assert.deepEqual(
    gateReasons({
      cover_image: 'cover',
      description: 'description',
      risk_note: 'risk',
      route_note: 'route',
      altitude: 1234,
    }),
    []
  )
  assert.deepEqual(
    gateReasons({
      cover_image: ' ',
      description: null,
      risk_note: '',
      route_note: undefined,
      altitude: null,
    }),
    [
      'cover_image_missing',
      'description_missing',
      'risk_note_missing',
      'route_note_missing',
      'altitude_missing',
    ]
  )
  const source = fs.readFileSync(
    'scripts/mountains/t11-quality-activation.mjs',
    'utf8'
  )
  assert.match(source, /if \(stageName === 'one'\) return candidates\.slice\(0, 1\)/)
  assert.match(source, /if \(stageName === 'twenty'\) return candidates\.slice\(1, 20\)/)
  assert.match(source, /if \(stageName === 'remaining'\) return candidates\.slice\(20\)/)
  assert.match(source, /row\.summit_radius_m === null/)
  assert.doesNotMatch(source, /summit_radius_m\\s*:/)
})
