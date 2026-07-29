import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildRouteIngestPlan,
  buildStablePlanBody,
  assertFrozenSha,
} from '../scripts/mountains/import-route-data.mjs'

const ATTACHMENTS_ROOT = process.env.P2_ROUTE_ATTACHMENTS_ROOT
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-ingest-test-'))
const integrationTest = ATTACHMENTS_ROOT ? test : test.skip
const planPromise = ATTACHMENTS_ROOT
  ? buildRouteIngestPlan({
      attachmentsRoot: ATTACHMENTS_ROOT,
      scratchDir,
    })
  : null

function getPlan() {
  assert(planPromise, 'P2_ROUTE_ATTACHMENTS_ROOT is required for integration tests')
  return planPromise
}

integrationTest('builds the exact zero-write Stage 4 operation closure', async () => {
  const plan = await getPlan()

  assert.equal(plan.mode, 'dry_run_only')
  assert.equal(plan.operations.mountain_inserts.length, 11)
  assert.equal(plan.operations.geometry_inserts.length, 74)
  assert.equal(plan.operations.private_track_uploads.length, 74)
  assert.equal(plan.operations.cover_original_uploads.length, 15)
  assert.equal(plan.operations.cover_thumbnail_uploads.length, 15)
  assert.equal(plan.holds.blocked_content.length, 1)
  assert.equal(plan.holds.held_covers.length, 1)
  assert.equal(plan.holds.existing_entity_updates.length, 1)
  assert.equal(plan.operations.existing_entity_updates.length, 1)
  assert.equal(plan.side_effects.database_writes, 0)
  assert.equal(plan.side_effects.storage_writes, 0)
  assert.equal(plan.side_effects.migration_applied, false)
  assert.equal(plan.preconditions.stage2_migration.status, 'required_not_applied')
  assert.equal(plan.preconditions.stage2_migration.apply_in_this_stage, false)
  assert.equal(
    plan.preconditions.production_target_snapshot.status,
    'required_before_apply',
  )
  assert.equal(plan.apply_supported, false)
})

integrationTest('verifies all private KML objects from actual bytes without public URLs', async () => {
  const plan = await getPlan()
  const paths = new Set()

  for (const row of plan.operations.private_track_uploads) {
    assert.equal(row.bucket, 'mountain-route-source')
    assert.equal(row.visibility, 'private')
    assert.equal(row.upsert, false)
    assert.equal(row.verified_bytes > 0, true)
    assert.match(row.verified_sha256, /^[a-f0-9]{64}$/)
    assert.equal(row.verified_sha256, row.source_file_sha256)
    assert.equal(row.public_url, null)
    assert.equal(row.source_relative_path.startsWith('attachments/tracks/'), true)
    assert.equal(paths.has(row.object_path), false)
    paths.add(row.object_path)
  }
})

integrationTest('maps geometry to the Stage 2 database columns and recomputed facts', async () => {
  const plan = await getPlan()
  const ids = new Set()
  const parentIds = new Set()
  const displayModes = { map: 0, trace_only: 0 }

  for (const row of plan.operations.geometry_inserts) {
    assert.deepEqual(Object.keys(row).sort(), [
      'bbox',
      'display_mode',
      'id',
      'mountain_id',
      'point_count',
      'review_status',
      'segment_count',
      'simplified_geometry',
      'source_field_name',
      'source_file_name',
      'source_file_sha256',
      'source_record_id',
    ])
    assert.equal(row.simplified_geometry.type, 'MultiLineString')
    assert.equal(row.bbox.length, 4)
    assert.equal(row.review_status, 'approved')
    assert.equal(row.source_field_name, '轨迹文件')
    assert.equal(row.point_count >= 2, true)
    assert.equal(row.segment_count, row.simplified_geometry.coordinates.length)
    assert.equal(ids.has(row.id), false)
    ids.add(row.id)
    assert.equal(parentIds.has(row.mountain_id), false)
    parentIds.add(row.mountain_id)
    displayModes[row.display_mode] += 1
  }
  assert.deepEqual(displayModes, { map: 70, trace_only: 4 })

  const newIds = new Set(
    plan.operations.mountain_inserts.map((row) => row.id),
  )
  assert.equal(
    [...parentIds].filter((id) => newIds.has(id)).length,
    9,
  )
  assert.equal(
    [...parentIds].filter((id) => !newIds.has(id)).length,
    65,
  )
})

integrationTest('verifies ready covers and runtime-compatible deterministic thumbnails', async () => {
  const plan = await getPlan()
  const originalPaths = new Set()
  const thumbnailPaths = new Set()
  const readyCoverKeys = new Set(
    plan.operations.cover_original_uploads.map(
      (row) => row.effective_canonical_key,
    ),
  )

  assert.equal(readyCoverKeys.size, 11)
  assert.equal(plan.operations.cover_original_uploads.every((row) => (
    row.mime_type.startsWith('image/')
    && row.width > 0
    && row.height > 0
    && row.upsert === false
  )), true)

  for (const row of plan.operations.cover_thumbnail_uploads) {
    assert.equal(row.mime_type, 'image/webp')
    assert.equal(row.width, 960)
    assert.equal(row.height, 520)
    assert.equal(row.quality, 78)
    assert.equal(row.upsert, false)
    assert.match(row.sha256, /^[a-f0-9]{64}$/)
    assert.match(row.object_path, /\/thumb-v1-/)
    assert.equal(thumbnailPaths.has(row.object_path), false)
    thumbnailPaths.add(row.object_path)
  }
  for (const row of plan.operations.cover_original_uploads) {
    assert.equal(originalPaths.has(row.object_path), false)
    originalPaths.add(row.object_path)
  }
})

integrationTest('produces exact inactive route-corridor mountain payloads', async () => {
  const plan = await getPlan()
  const byKey = new Map(plan.operations.mountain_inserts.map((row) => [
    row.effective_canonical_key,
    row,
  ]))

  assert.equal(byKey.has('langta-ancient-trail-route'), false)
  for (const row of plan.operations.mountain_inserts) {
    assert.equal(row.entity_type, 'route_corridor')
    assert.equal(row.name.length > 0, true)
    assert.match(row.province_code, /^[A-Z]{2}$/)
    assert.equal(row.provinces.length, row.province_codes.length)
    assert.equal(row.min_license.length > 0, true)
    assert.equal(row.coordinate_kind, 'area')
    assert.equal(row.coordinate_status, 'resolved')
    assert.equal(row.altitude, null)
    assert.equal(row.altitude_m_exact, null)
    assert.equal(row.length_km, null)
    assert.equal(row.estimated_duration_minutes, null)
    assert.equal(row.weather_enabled, false)
    assert.equal(row.is_active, false)
    assert.equal(row.is_readable, false)
    assert.equal(row.cover_image, row.image_license_manifest[0].public_url)
    assert.deepEqual(
      row.gallery_images,
      row.image_license_manifest.slice(1).map((image) => image.public_url),
    )
    assert.equal(row.image_is_illustrative, false)
    assert.equal(row.semantic_review_status, 'needs_review')
    assert.equal(row.route_reference.length, 1)
    assert.equal('distance_km_range' in row.route_reference[0], true)
    assert.deepEqual(Object.keys(row.source_payload_hashes).sort(), [
      'route_content_import_sha256',
      'route_content_source_sha256',
      'stage3_source_manifest_sha256',
    ])
    const expectedPayloadSha = crypto
      .createHash('sha256')
      .update(JSON.stringify(Object.fromEntries(
        Object.entries({
          effective_canonical_key: row.effective_canonical_key,
          ...row.source_payload_hashes,
        }).sort(([left], [right]) => left.localeCompare(right, 'en')),
      )))
      .digest('hex')
    assert.equal(row.source_payload_sha256, expectedPayloadSha)
  }

  assert.equal(byKey.get('aotai-traverse-route').route_highpoint_m, 3771.2)
  assert.equal(byKey.get('bogeda-grand-loop-route').route_highpoint_m, null)

  const geometryKeys = new Set(
    plan.operations.private_track_uploads.map(
      (row) => row.effective_canonical_key,
    ),
  )
  for (const key of [
    'aotai-traverse-route',
    'bogeda-grand-loop-route',
    'langta-ancient-trail-route',
  ]) {
    assert.equal(geometryKeys.has(key), false)
  }
})

integrationTest('holds Langta and Gangrenboqi while limiting Hutiaoxia to aliases', async () => {
  const plan = await getPlan()

  assert.deepEqual(
    plan.holds.blocked_content.map((row) => row.effective_canonical_key),
    ['langta-ancient-trail-route'],
  )
  assert.deepEqual(
    plan.holds.held_covers.map((row) => row.effective_canonical_key),
    ['langta-ancient-trail-route'],
  )
  assert.match(plan.holds.held_covers[0].verified_sha256, /^[a-f0-9]{64}$/)
  assert.equal(plan.holds.held_covers[0].verified_bytes > 0, true)
  assert.equal(
    plan.operations.private_track_uploads.some(
      (row) => row.effective_canonical_key === 'gangrenboqi-cluster',
    ),
    true,
  )
  assert.deepEqual(
    plan.holds.existing_entity_updates.map((row) => row.effective_canonical_key),
    ['gangrenboqi-cluster'],
  )
  assert.deepEqual(plan.operations.existing_entity_updates, [
    {
      effective_canonical_key: 'hutiaoxia-gaolu-route',
      id: '9bef8995-54c4-5e7a-8b38-4342bb818faf',
      provenance_only: {
        proposed_related_mountain_keys: ['yulong-xueshan', 'haba-xueshan'],
        retain_length_km: 22,
      },
      operation: 'merge_aliases',
      add_aliases: ['虎跳峡高路', '虎跳峡高线'],
      compare_and_swap: {
        expected_current_source: 'production_target_snapshot.hutiaoxia',
        fields: ['id', 'effective_canonical_key', 'aliases', 'length_km'],
        on_mismatch: 'hard_failure',
        required: true,
      },
    },
  ])
})

integrationTest('independent scratch builds are byte-identical and durable', async () => {
  const firstScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'route-ingest-first-'))
  const secondScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'route-ingest-second-'))
  const first = buildStablePlanBody(await buildRouteIngestPlan({
    attachmentsRoot: ATTACHMENTS_ROOT,
    scratchDir: firstScratch,
  }))
  const second = buildStablePlanBody(await buildRouteIngestPlan({
    attachmentsRoot: ATTACHMENTS_ROOT,
    scratchDir: secondScratch,
  }))

  assert.equal(first, second)
  assert.equal(first.includes('/private/tmp'), false)
  assert.equal(first.includes(firstScratch), false)
  assert.equal(first.includes(secondScratch), false)
  assert.equal(first.includes('retrieved_at'), false)
  assert.equal(first.includes('created_at'), false)
  assert.equal(first.includes('updated_at'), false)
})

test('frozen SHA guard rejects source-content and migration drift', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'route-ingest-sha-'))
  const driftedSource = path.join(scratch, 'source-route-content.jsonl')
  const driftedMigration = path.join(scratch, 'migration.sql')
  fs.writeFileSync(driftedSource, '{"drift":true}\n')
  fs.writeFileSync(driftedMigration, '-- drift\n')

  assert.throws(
    () => assertFrozenSha({
      expectedSha256: '0'.repeat(64),
      filePath: driftedSource,
      label: 'source-route-content.jsonl',
    }),
    /frozen input SHA mismatch: source-route-content\.jsonl/,
  )
  assert.throws(
    () => assertFrozenSha({
      expectedSha256: '0'.repeat(64),
      filePath: driftedMigration,
      label: 'Stage 2 migration',
    }),
    /frozen input SHA mismatch: Stage 2 migration/,
  )
})
