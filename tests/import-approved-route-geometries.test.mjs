import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  MAP_MODE_PROMOTIONS,
  buildModePromotionPlan,
  buildModePromotionExpectedPayload,
  assertStorageObjectMatches,
  buildApprovedGeometryPayload,
  loadIncrementalAdmissionRows,
  verifyAdmissionAttachment,
} from '../scripts/mountains/import-approved-route-geometries.mjs'
import * as routeGeometryImporter from '../scripts/mountains/import-approved-route-geometries.mjs'
import { applyRouteMapModePromotions } from '../scripts/mountains/route-mode-promotions.mjs'

const SOURCE_PATH = 'data/mountains/route-geometry/route-geometry-import.jsonl'

test('formal importer selects only incremental admitted rows', () => {
  const rows = loadIncrementalAdmissionRows(SOURCE_PATH)

  assert.equal(rows.length, 122)
  assert.equal(rows.every((row) => row.geometry_review_status === 'pending'), true)
  assert.equal(rows.every((row) => row.source_admission), true)
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length)
  assert.equal(new Set(rows.map((row) => row.mountain_id)).size, rows.length)
})

test('approved payload is explicit and excludes source-package-only fields', () => {
  const [row] = loadIncrementalAdmissionRows(SOURCE_PATH)
  const payload = buildApprovedGeometryPayload(row)

  assert.deepEqual(Object.keys(payload).sort(), [
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
  assert.equal(payload.review_status, 'approved')
  assert.equal(payload.source_field_name, '轨迹文件')
  assert.deepEqual(payload.bbox, [
    row.bbox.min_longitude,
    row.bbox.min_latitude,
    row.bbox.max_longitude,
    row.bbox.max_latitude,
  ])
})

test('attachment verification rejects byte or sha drift', () => {
  const [row] = loadIncrementalAdmissionRows(SOURCE_PATH)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-admission-'))
  const filePath = path.join(root, `${row.source_file_token}.kml`)
  fs.writeFileSync(filePath, '<kml />')

  assert.throws(
    () => verifyAdmissionAttachment(row, root),
    /attachment byte mismatch/,
  )
})

test('storage collision check reads bytes and custom sha from their real metadata fields', () => {
  const [row] = loadIncrementalAdmissionRows(SOURCE_PATH)

  assert.doesNotThrow(() =>
    assertStorageObjectMatches(row, {
      size: row.source_file_bytes,
      metadata: { sha256: row.source_file_sha256 },
    }),
  )
  assert.throws(
    () =>
      assertStorageObjectMatches(row, {
        size: row.source_file_bytes,
        metadata: { sha256: '0'.repeat(64) },
      }),
    /storage SHA collision/,
  )
})

test('formal importer promotes exactly four approved geometries without accepting field drift', () => {
  const sourceRows = fs.readFileSync(SOURCE_PATH, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((row) => MAP_MODE_PROMOTIONS.has(row.id))
  assert.equal(sourceRows.length, 4)
  assert.equal(sourceRows.every((row) => row.display_mode === 'map'), true)

  const currentRows = sourceRows.map((row) => ({
    ...buildModePromotionExpectedPayload(row),
    display_mode: 'trace_only',
  }))
  const plan = buildModePromotionPlan(sourceRows, currentRows)
  assert.deepEqual(plan.map((entry) => entry.id), [...MAP_MODE_PROMOTIONS.keys()].sort())
  assert.equal(plan.every((entry) => (
    entry.currentDisplayMode === 'trace_only' && entry.expectedDisplayMode === 'map'
  )), true)

  assert.throws(
    () => buildModePromotionPlan(sourceRows, currentRows.map((row, index) => (
      index === 0 ? { ...row, point_count: row.point_count + 1 } : row
    ))),
    /mode promotion field drift/,
  )
})

test('formal importer rejects a frozen source canonical drift before promotion', () => {
  const sourceRows = fs.readFileSync(SOURCE_PATH, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((row) => MAP_MODE_PROMOTIONS.has(row.id))
  const currentRows = sourceRows.map((row) => ({
    ...buildModePromotionExpectedPayload(row),
    display_mode: 'trace_only',
  }))
  const [first, ...rest] = sourceRows

  assert.throws(
    () => buildModePromotionPlan([
      {
        ...first,
        geography_check: {
          ...first.geography_check,
          reference: {
            ...first.geography_check.reference,
            effective_canonical_key: 'drifted-canonical-key',
          },
        },
      },
      ...rest,
    ], currentRows),
    /promotion source canonical drift/,
  )
})

test('formal importer rejects a frozen source SHA drift before promotion', () => {
  const sourceRows = fs.readFileSync(SOURCE_PATH, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((row) => MAP_MODE_PROMOTIONS.has(row.id))
  const currentRows = sourceRows.map((row) => ({
    ...buildModePromotionExpectedPayload(row),
    display_mode: 'trace_only',
  }))
  const [first, ...rest] = sourceRows

  assert.throws(
    () => buildModePromotionPlan([
      { ...first, source_file_sha256: '0'.repeat(64) },
      ...rest,
    ], currentRows),
    /promotion source SHA drift/,
  )
})

test('formal importer rejects a frozen production mountain canonical drift', () => {
  const assertModePromotionMountainCanonicals =
    routeGeometryImporter.assertModePromotionMountainCanonicals
  assert.equal(typeof assertModePromotionMountainCanonicals, 'function')

  const currentMountains = [...MAP_MODE_PROMOTIONS.values()].map((promotion) => ({
    id: promotion.mountainId,
    effective_canonical_key: promotion.effectiveCanonicalKey,
  }))

  assert.throws(
    () => assertModePromotionMountainCanonicals(currentMountains.map((row, index) => (
      index === 0
        ? { ...row, effective_canonical_key: 'drifted-production-canonical-key' }
        : row
    ))),
    /promotion mountain canonical drift/,
  )
})

test('source admission promotes only the four frozen geometry IDs', () => {
  const sourceRows = fs.readFileSync(SOURCE_PATH, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((row) => MAP_MODE_PROMOTIONS.has(row.id))
    .map((row) => ({ ...row, display_mode: 'trace_only_candidate' }))
  const collision = {
    ...sourceRows[0],
    id: '00000000-0000-0000-0000-000000000000',
    mountain_id: '11111111-1111-1111-1111-111111111111',
  }

  const promoted = applyRouteMapModePromotions([...sourceRows, collision])
  const promotedById = new Map(promoted.map((row) => [row.id, row]))

  assert.equal(
    sourceRows.every((row) => promotedById.get(row.id).display_mode === 'map_candidate'),
    true,
  )
  assert.equal(promotedById.get(collision.id).display_mode, 'trace_only_candidate')
})
