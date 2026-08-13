import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  assertStorageObjectMatches,
  buildApprovedGeometryPayload,
  loadIncrementalAdmissionRows,
  verifyAdmissionAttachment,
} from '../scripts/mountains/import-approved-route-geometries.mjs'

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
      metadata: { size: row.source_file_bytes },
      user_metadata: { sha256: row.source_file_sha256 },
    }),
  )
  assert.throws(
    () =>
      assertStorageObjectMatches(row, {
        metadata: { size: row.source_file_bytes },
        user_metadata: { sha256: '0'.repeat(64) },
      }),
    /storage SHA collision/,
  )
})
