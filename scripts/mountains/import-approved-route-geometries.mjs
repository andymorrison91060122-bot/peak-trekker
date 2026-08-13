import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'
import { ROUTE_MAP_MODE_PROMOTIONS } from './route-mode-promotions.mjs'

export const MAP_MODE_PROMOTIONS = new Map(
  ROUTE_MAP_MODE_PROMOTIONS.map((entry) => [entry.geometryId, entry]),
)

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DEFAULT_INPUT = path.join(
  REPO_ROOT,
  'data/mountains/route-geometry/route-geometry-import.jsonl',
)
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'output/route-geometry-import/summary.json',
)
const BUCKET = 'mountain-route-source'
const SELECT_COLUMNS = [
  'id',
  'mountain_id',
  'source_record_id',
  'source_field_name',
  'source_file_name',
  'source_file_sha256',
  'simplified_geometry',
  'bbox',
  'display_mode',
  'review_status',
  'point_count',
  'segment_count',
].join(',')

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  )
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tempPath, filePath)
}

function countPoints(geometry) {
  return geometry.coordinates.reduce((sum, segment) => sum + segment.length, 0)
}

function assertAdmissionRow(row) {
  assert(row.source_admission, `row is not an incremental admission: ${row.id}`)
  assert.equal(row.geometry_review_status, 'pending')
  assert.equal(row.geometry?.type, 'MultiLineString')
  assert(Array.isArray(row.geometry.coordinates))
  assert.equal(row.geometry.coordinates.length, row.segment_count)
  assert.equal(countPoints(row.geometry), row.point_count)
  assert.match(row.source_file_sha256, /^[0-9a-f]{64}$/)
  assert.equal(row.source_admission.content_sha256, row.source_file_sha256)
  assert.equal(row.source_admission.file_token, row.source_file_token)
  assert.equal(row.source_admission.base_record_id, row.source_record_id)
  for (const value of [
    row.bbox.min_longitude,
    row.bbox.min_latitude,
    row.bbox.max_longitude,
    row.bbox.max_latitude,
  ]) {
    assert(Number.isFinite(value), `invalid bbox for ${row.id}`)
  }
}

export function loadIncrementalAdmissionRows(filePath = DEFAULT_INPUT) {
  const rows = readJsonl(filePath).filter((row) => row.source_admission)
  rows.forEach(assertAdmissionRow)
  assert.equal(rows.length, 122, 'incremental admission closure changed')
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length)
  assert.equal(new Set(rows.map((row) => row.mountain_id)).size, rows.length)
  return rows.sort((left, right) => left.id.localeCompare(right.id))
}

export function buildApprovedGeometryPayload(row) {
  assertAdmissionRow(row)
  return {
    bbox: [
      row.bbox.min_longitude,
      row.bbox.min_latitude,
      row.bbox.max_longitude,
      row.bbox.max_latitude,
    ],
    display_mode: row.display_mode,
    id: row.id,
    mountain_id: row.mountain_id,
    point_count: row.point_count,
    review_status: 'approved',
    segment_count: row.segment_count,
    simplified_geometry: row.geometry,
    source_field_name: '轨迹文件',
    source_file_name: row.source_file_name,
    source_file_sha256: row.source_file_sha256,
    source_record_id: row.source_record_id,
  }
}

export function buildModePromotionExpectedPayload(row) {
  assert.equal(row.geometry_review_status, 'pending')
  assert.equal(row.geometry?.type, 'MultiLineString')
  assert.equal(row.geometry.coordinates.length, row.segment_count)
  assert.equal(countPoints(row.geometry), row.point_count)
  assert.match(row.source_file_sha256, /^[0-9a-f]{64}$/)
  return {
    bbox: [
      row.bbox.min_longitude,
      row.bbox.min_latitude,
      row.bbox.max_longitude,
      row.bbox.max_latitude,
    ],
    display_mode: row.display_mode,
    id: row.id,
    mountain_id: row.mountain_id,
    point_count: row.point_count,
    review_status: 'approved',
    segment_count: row.segment_count,
    simplified_geometry: row.geometry,
    source_field_name: '轨迹文件',
    source_file_name: row.source_file_name,
    source_file_sha256: row.source_file_sha256,
    source_record_id: row.source_record_id,
  }
}

export function verifyAdmissionAttachment(row, attachmentsRoot) {
  assert(path.isAbsolute(attachmentsRoot), 'attachments root must be absolute')
  const filePath = path.join(attachmentsRoot, `${row.source_file_token}.kml`)
  assert(fs.existsSync(filePath), `missing attachment: ${row.source_file_token}`)
  const buffer = fs.readFileSync(filePath)
  assert.equal(
    buffer.length,
    row.source_file_bytes,
    `attachment byte mismatch: ${row.source_file_token}`,
  )
  assert.equal(
    sha256(buffer),
    row.source_file_sha256,
    `attachment SHA mismatch: ${row.source_file_token}`,
  )
  return { buffer, filePath }
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(url, 'NEXT_PUBLIC_SUPABASE_URL is required')
  assert(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function fetchRowsByIds(supabase, ids) {
  const result = []
  for (let index = 0; index < ids.length; index += 40) {
    const { data, error } = await supabase
      .from('mountain_route_geometries')
      .select(SELECT_COLUMNS)
      .in('id', ids.slice(index, index + 40))
    if (error) throw error
    result.push(...data)
  }
  return result
}

async function fetchMountainCanonicals(supabase, mountainIds) {
  const { data, error } = await supabase
    .from('mountains')
    .select('id,effective_canonical_key')
    .in('id', mountainIds)
  if (error) throw error
  return data
}

async function fetchApprovedByMountainIds(supabase, mountainIds) {
  const result = []
  for (let index = 0; index < mountainIds.length; index += 40) {
    const { data, error } = await supabase
      .from('mountain_route_geometries')
      .select('id,mountain_id,source_file_sha256,review_status')
      .eq('review_status', 'approved')
      .in('mountain_id', mountainIds.slice(index, index + 40))
    if (error) throw error
    result.push(...data)
  }
  return result
}

function assertExistingMatches(row, existing) {
  const expected = buildApprovedGeometryPayload(row)
  assert.equal(
    stableJson(existing),
    stableJson(expected),
    `existing geometry differs: ${row.id}`,
  )
}

function assertModePromotionRowMatches(sourceRow, currentRow, allowedModes) {
  const expected = buildModePromotionExpectedPayload(sourceRow)
  assert.equal(expected.display_mode, 'map', `source mode is not map: ${sourceRow.id}`)
  assert(
    allowedModes.includes(currentRow.display_mode),
    `invalid current display mode: ${sourceRow.id}`,
  )
  const { display_mode: expectedMode, ...expectedFields } = expected
  const { display_mode: currentMode, ...currentFields } = currentRow
  assert.equal(
    stableJson(currentFields),
    stableJson(expectedFields),
    `mode promotion field drift: ${sourceRow.id}`,
  )
  return { currentMode, expectedMode }
}

export function buildModePromotionPlan(sourceRows, currentRows) {
  assert.equal(sourceRows.length, MAP_MODE_PROMOTIONS.size, 'mode promotion source closure changed')
  assert.equal(currentRows.length, MAP_MODE_PROMOTIONS.size, 'mode promotion production closure changed')
  const currentById = new Map(currentRows.map((row) => [row.id, row]))
  return [...sourceRows]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((sourceRow) => {
      const promotion = MAP_MODE_PROMOTIONS.get(sourceRow.id)
      assert(promotion, `unauthorized mode promotion: ${sourceRow.id}`)
      assert.equal(sourceRow.mountain_id, promotion.mountainId)
      assert.equal(
        sourceRow.geography_check?.reference?.effective_canonical_key,
        promotion.effectiveCanonicalKey,
        `promotion source canonical drift: ${sourceRow.id}`,
      )
      assert.equal(
        sourceRow.source_file_sha256,
        promotion.sourceFileSha256,
        `promotion source SHA drift: ${sourceRow.id}`,
      )
      const currentRow = currentById.get(sourceRow.id)
      assert(currentRow, `missing production geometry: ${sourceRow.id}`)
      const modes = assertModePromotionRowMatches(
        sourceRow,
        currentRow,
        ['trace_only', 'map'],
      )
      return {
        id: sourceRow.id,
        mountainId: sourceRow.mountain_id,
        currentDisplayMode: modes.currentMode,
        expectedDisplayMode: modes.expectedMode,
      }
    })
}

export function assertModePromotionMountainCanonicals(currentMountains) {
  assert.equal(
    currentMountains.length,
    MAP_MODE_PROMOTIONS.size,
    'mode promotion production mountain closure changed',
  )
  assert.equal(
    new Set(currentMountains.map((mountain) => mountain.id)).size,
    currentMountains.length,
    'mode promotion production mountain IDs must be unique',
  )

  const mountainsById = new Map(currentMountains.map((mountain) => [mountain.id, mountain]))
  for (const promotion of MAP_MODE_PROMOTIONS.values()) {
    const mountain = mountainsById.get(promotion.mountainId)
    assert(mountain, `missing production mountain for promotion: ${promotion.mountainId}`)
    assert.equal(
      mountain.effective_canonical_key,
      promotion.effectiveCanonicalKey,
      `promotion mountain canonical drift: ${promotion.mountainId}`,
    )
  }
}

async function runModePromotions({ apply, inputPath, outputPath }) {
  const sourceRows = readJsonl(inputPath).filter((row) => MAP_MODE_PROMOTIONS.has(row.id))
  const supabase = createAdminClient()
  const currentMountains = await fetchMountainCanonicals(
    supabase,
    [...MAP_MODE_PROMOTIONS.values()].map((promotion) => promotion.mountainId),
  )
  assertModePromotionMountainCanonicals(currentMountains)
  const currentRows = await fetchRowsByIds(supabase, [...MAP_MODE_PROMOTIONS.keys()])
  const plan = buildModePromotionPlan(sourceRows, currentRows)
  const summary = {
    schema_version: 'approved-route-mode-promotion-v1',
    mode: apply ? 'apply' : 'check',
    total: plan.length,
    pending: plan.filter((entry) => entry.currentDisplayMode === 'trace_only').length,
    already_map: plan.filter((entry) => entry.currentDisplayMode === 'map').length,
    updated: 0,
    verified_map: 0,
  }
  if (apply) {
    for (const entry of plan) {
      if (entry.currentDisplayMode === 'map') continue
      const { data, error } = await supabase
        .from('mountain_route_geometries')
        .update({ display_mode: 'map' })
        .eq('id', entry.id)
        .eq('mountain_id', entry.mountainId)
        .eq('review_status', 'approved')
        .eq('display_mode', 'trace_only')
        .select(SELECT_COLUMNS)
        .single()
      if (error) throw error
      assertModePromotionRowMatches(
        sourceRows.find((row) => row.id === entry.id),
        data,
        ['map'],
      )
      summary.updated += 1
      writeJsonAtomic(outputPath, summary)
    }
  }
  const verifiedRows = await fetchRowsByIds(supabase, [...MAP_MODE_PROMOTIONS.keys()])
  for (const row of sourceRows) {
    const current = verifiedRows.find((candidate) => candidate.id === row.id)
    assertModePromotionRowMatches(row, current, apply ? ['map'] : ['trace_only', 'map'])
  }
  summary.verified_map = verifiedRows.filter((row) => row.display_mode === 'map').length
  writeJsonAtomic(outputPath, summary)
  process.stdout.write(`${JSON.stringify(summary)}\n`)
}

async function findStorageObject(bucket, objectPath) {
  const { data, error } = await bucket.info(objectPath)
  if (!error) return data
  if (Number(error.statusCode ?? error.status) === 404) return null
  throw error
}

export function assertStorageObjectMatches(row, object) {
  const bytes = Number(object.size)
  const digest = object.metadata?.sha256
  assert.equal(bytes, row.source_file_bytes, `storage byte collision: ${row.id}`)
  assert.equal(digest, row.source_file_sha256, `storage SHA collision: ${row.id}`)
}

async function uploadSourceIfNeeded(supabase, row, buffer) {
  const bucket = supabase.storage.from(BUCKET)
  const current = await findStorageObject(bucket, row.source_object_path)
  if (current) {
    assertStorageObjectMatches(row, current)
    return 'reused'
  }
  const { error } = await bucket.upload(row.source_object_path, buffer, {
    cacheControl: '31536000',
    contentType: 'application/vnd.google-earth.kml+xml',
    metadata: { sha256: row.source_file_sha256 },
    upsert: false,
  })
  if (error) throw error
  const uploaded = await findStorageObject(bucket, row.source_object_path)
  assert(uploaded, `uploaded object missing: ${row.source_object_path}`)
  assertStorageObjectMatches(row, uploaded)
  return 'uploaded'
}

async function preflight(supabase, rows) {
  const ids = rows.map((row) => row.id)
  const mountainIds = rows.map((row) => row.mountain_id)
  const existing = await fetchRowsByIds(supabase, ids)
  const existingById = new Map(existing.map((row) => [row.id, row]))
  for (const row of rows) {
    const current = existingById.get(row.id)
    if (current) assertExistingMatches(row, current)
  }
  const approved = await fetchApprovedByMountainIds(supabase, mountainIds)
  for (const current of approved) {
    const row = rows.find((candidate) => candidate.mountain_id === current.mountain_id)
    assert(row, `unexpected approved geometry: ${current.id}`)
    assert.equal(current.id, row.id, `approved mountain collision: ${row.mountain_id}`)
    assert.equal(current.source_file_sha256, row.source_file_sha256)
  }
  return { existingById }
}

async function run({ apply, attachmentsRoot, inputPath, outputPath }) {
  const rows = loadIncrementalAdmissionRows(inputPath)
  const attachments = new Map(
    rows.map((row) => [row.id, verifyAdmissionAttachment(row, attachmentsRoot)]),
  )
  const supabase = createAdminClient()
  const { existingById } = await preflight(supabase, rows)
  const summary = {
    schema_version: 'approved-route-geometry-import-v1',
    mode: apply ? 'apply' : 'check',
    total: rows.length,
    already_approved: existingById.size,
    inserted: 0,
    uploaded: 0,
    reused_storage: 0,
    verified_approved: 0,
  }

  if (apply) {
    for (const row of rows) {
      if (existingById.has(row.id)) continue
      const storageResult = await uploadSourceIfNeeded(
        supabase,
        row,
        attachments.get(row.id).buffer,
      )
      summary[storageResult === 'uploaded' ? 'uploaded' : 'reused_storage'] += 1
      const { error } = await supabase
        .from('mountain_route_geometries')
        .insert(buildApprovedGeometryPayload(row))
      if (error) throw error
      summary.inserted += 1
      writeJsonAtomic(outputPath, summary)
    }
  }

  const verified = await fetchRowsByIds(supabase, rows.map((row) => row.id))
  const verifiedById = new Map(verified.map((row) => [row.id, row]))
  for (const row of rows) {
    const current = verifiedById.get(row.id)
    if (current) assertExistingMatches(row, current)
  }
  summary.verified_approved = verified.length
  assert.equal(
    verified.length,
    apply ? rows.length : existingById.size,
    'approved geometry verification closure mismatch',
  )
  writeJsonAtomic(outputPath, summary)
  process.stdout.write(`${JSON.stringify(summary)}\n`)
}

function parseCli(argv) {
  const valueAfter = (name) => {
    const index = argv.indexOf(name)
    return index === -1 ? null : argv[index + 1]
  }
  const attachmentsRoot = valueAfter('--attachments-root')
  const modePromotion = argv.includes('--promote-map-modes')
  if (!modePromotion) assert(attachmentsRoot, '--attachments-root is required')
  return {
    apply: argv.includes('--apply'),
    attachmentsRoot: attachmentsRoot ? path.resolve(attachmentsRoot) : null,
    inputPath: path.resolve(valueAfter('--input') ?? DEFAULT_INPUT),
    modePromotion,
    outputPath: path.resolve(valueAfter('--output') ?? DEFAULT_OUTPUT),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseCli(process.argv.slice(2))
  const command = options.modePromotion ? runModePromotions : run
  command(options).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
