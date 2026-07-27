import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import {
  assertNoSensitiveMaterial,
  sha256File,
  stableJson,
  writeJsonAtomic,
  writeJsonlAtomic,
} from './t10-photo-lib.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DATA_ROOT = path.join(REPO_ROOT, 'data/mountains')
const DECISION_PATH = path.join(DATA_ROOT, 't11-quality-decisions.jsonl')
const SNAPSHOT_PATH = path.join(DATA_ROOT, 't11-activation-snapshot.json')
const CHECKPOINT_PATH = path.join(DATA_ROOT, 't11-activation-checkpoint.json')
const SUMMARY_PATH = path.join(DATA_ROOT, 't11-activation-summary.json')

const FROZEN_SHA256 = Object.freeze({
  effective_canonicals:
    '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  entity_semantics:
    '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
  effective_canonical_enrichment:
    'b3f43ef40e009c35ee1ca96aed9d55038afe4eb76a39b9c7bb37f2e4404cfee5',
  t13_final_coordinate:
    'eada39739bc96daeee2352df81b3eaac5896b424a27ea17e8bef507579b78375',
})

const FROZEN_PATHS = Object.freeze({
  effective_canonicals: path.join(
    DATA_ROOT,
    'ledger/effective_canonicals.jsonl'
  ),
  entity_semantics: path.join(
    DATA_ROOT,
    'ledger/entity-semantics.jsonl'
  ),
  effective_canonical_enrichment: path.join(
    DATA_ROOT,
    'ledger/effective-canonical-enrichment.jsonl'
  ),
  t13_final_coordinate: path.join(
    DATA_ROOT,
    'coordinate-fix/t13-final-coordinate.jsonl'
  ),
})

const ROW_COLUMNS = [
  'id',
  'effective_canonical_key',
  'name',
  'difficulty',
  'access_status',
  'is_active',
  'is_readable',
  'quality_tier',
  'altitude',
  'cover_image',
  'description',
  'risk_note',
  'route_note',
  'summit_radius_m',
].join(',')

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(url, 'NEXT_PUBLIC_SUPABASE_URL is required')
  assert(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function assertFrozenInputs() {
  for (const [name, expected] of Object.entries(FROZEN_SHA256)) {
    assert.equal(sha256File(FROZEN_PATHS[name]), expected)
  }
}

async function selectAllCanonicalRows(supabase) {
  const rows = []
  for (let from = 0; ; from += 200) {
    const { data, error } = await supabase
      .from('mountains')
      .select(ROW_COLUMNS)
      .not('effective_canonical_key', 'is', null)
      .order('effective_canonical_key')
      .range(from, from + 199)
    if (error) throw error
    rows.push(...data)
    if (data.length < 200) break
  }
  return rows
}

async function selectWaypointCounts(supabase) {
  const counts = new Map()
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('mountain_waypoints')
      .select('mountain_id')
      .range(from, from + 499)
    if (error) throw error
    for (const row of data) {
      counts.set(row.mountain_id, (counts.get(row.mountain_id) ?? 0) + 1)
    }
    if (data.length < 500) break
  }
  return counts
}

function nonblank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function gateReasons(row) {
  const reasons = []
  if (!nonblank(row.cover_image)) reasons.push('cover_image_missing')
  if (!nonblank(row.description)) reasons.push('description_missing')
  if (!nonblank(row.risk_note)) reasons.push('risk_note_missing')
  if (!nonblank(row.route_note)) reasons.push('route_note_missing')
  if (!Number.isFinite(row.altitude)) reasons.push('altitude_missing')
  return reasons
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const key = String(row[field] ?? 'null')
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function readDecisions() {
  return fs
    .readFileSync(DECISION_PATH, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
}

function evidenceBinding() {
  return {
    decision_sha256: sha256File(DECISION_PATH),
    frozen_sha256: FROZEN_SHA256,
  }
}

async function buildPlan() {
  assertFrozenInputs()
  const supabase = createAdminClient()
  const [rows, waypointCounts] = await Promise.all([
    selectAllCanonicalRows(supabase),
    selectWaypointCounts(supabase),
  ])
  assert.equal(rows.length, 359)
  const decisions = rows.map((row) => {
    const contentBlockers = gateReasons(row)
    const d11Excluded = row.summit_radius_m === null
    const waypointCount = waypointCounts.get(row.id) ?? 0
    let qualityBand
    let qualityTier
    if (contentBlockers.length > 0 || d11Excluded) {
      qualityBand = 'C'
      qualityTier = 'blocked'
    } else if (waypointCount > 0) {
      qualityBand = 'A'
      qualityTier = 'ready'
    } else {
      qualityBand = 'B'
      qualityTier = 'needs_review'
    }
    let activationDecision
    if (contentBlockers.length > 0) {
      activationDecision = 'excluded_content_gate'
    } else if (d11Excluded) {
      activationDecision = 'excluded_d11_coordinate'
    } else if (row.is_active && row.is_readable) {
      activationDecision = 'already_active'
    } else {
      activationDecision = 'activate'
    }
    return {
      schema_version: 't11-quality-decision-v1',
      effective_canonical_key: row.effective_canonical_key,
      id: row.id,
      name: row.name,
      difficulty: row.difficulty,
      access_status: row.access_status,
      waypoint_count: waypointCount,
      quality_band: qualityBand,
      quality_tier: qualityTier,
      activation_decision: activationDecision,
      content_gate_passed: contentBlockers.length === 0,
      content_blockers: contentBlockers,
      d11_coordinate_excluded: d11Excluded,
    }
  })
  assert.equal(
    decisions.filter((row) => row.activation_decision === 'already_active')
      .length,
    15
  )
  assert.equal(
    decisions.filter((row) => row.activation_decision === 'activate').length,
    327
  )
  assert.equal(
    decisions.filter(
      (row) => row.activation_decision === 'excluded_d11_coordinate'
    ).length,
    17
  )
  assert.equal(
    decisions.filter(
      (row) => row.activation_decision === 'excluded_content_gate'
    ).length,
    0
  )
  writeJsonlAtomic(DECISION_PATH, decisions)
  const snapshot = {
    schema_version: 't11-activation-snapshot-v1',
    input_binding: evidenceBinding(),
    rows: rows.map((row) => ({
      id: row.id,
      effective_canonical_key: row.effective_canonical_key,
      is_active: row.is_active,
      is_readable: row.is_readable,
      quality_tier: row.quality_tier,
    })),
  }
  assertNoSensitiveMaterial(snapshot)
  writeJsonAtomic(SNAPSHOT_PATH, snapshot)
  writeJsonAtomic(CHECKPOINT_PATH, {
    schema_version: 't11-activation-checkpoint-v1',
    input_binding: snapshot.input_binding,
    quality_applied: false,
    completed_keys: [],
    stages: [],
  })
  return {
    rows: decisions.length,
    quality_bands: countBy(decisions, 'quality_band'),
    quality_tiers: countBy(decisions, 'quality_tier'),
    activation_decisions: countBy(decisions, 'activation_decision'),
    decision_sha256: sha256File(DECISION_PATH),
  }
}

function loadFrozenEvidence() {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
  const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'))
  assert.equal(snapshot.schema_version, 't11-activation-snapshot-v1')
  assert.equal(checkpoint.schema_version, 't11-activation-checkpoint-v1')
  assert.equal(stableJson(snapshot.input_binding), stableJson(evidenceBinding()))
  assert.equal(
    stableJson(checkpoint.input_binding),
    stableJson(snapshot.input_binding)
  )
  assert.equal(snapshot.rows.length, 359)
  return { snapshot, checkpoint }
}

function saveCheckpoint(checkpoint) {
  assertNoSensitiveMaterial(checkpoint)
  writeJsonAtomic(CHECKPOINT_PATH, checkpoint)
}

function chunked(rows, size = 80) {
  const chunks = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

async function updateQualityTier(supabase, rows, qualityTier) {
  for (const rowsChunk of chunked(rows)) {
    const keys = rowsChunk.map((row) => row.effective_canonical_key)
    const { data, error } = await supabase
      .from('mountains')
      .update({ quality_tier: qualityTier })
      .in('effective_canonical_key', keys)
      .select('effective_canonical_key,quality_tier')
    if (error) throw error
    assert.equal(data.length, keys.length)
    assert.equal(data.every((row) => row.quality_tier === qualityTier), true)
  }
}

async function applyQuality() {
  const decisions = readDecisions()
  const { snapshot, checkpoint } = loadFrozenEvidence()
  assert.equal(checkpoint.quality_applied, false)
  const supabase = createAdminClient()
  const current = await selectAllCanonicalRows(supabase)
  const currentByKey = new Map(
    current.map((row) => [row.effective_canonical_key, row])
  )
  for (const before of snapshot.rows) {
    const row = currentByKey.get(before.effective_canonical_key)
    assert(row)
    assert.equal(row.is_active, before.is_active)
    assert.equal(row.is_readable, before.is_readable)
  }
  for (const qualityTier of ['ready', 'needs_review', 'blocked']) {
    await updateQualityTier(
      supabase,
      decisions.filter((row) => row.quality_tier === qualityTier),
      qualityTier
    )
  }
  checkpoint.quality_applied = true
  saveCheckpoint(checkpoint)
  return { quality_tiers: countBy(decisions, 'quality_tier') }
}

function stageKeys(decisions, stageName) {
  const candidates = decisions
    .filter((row) => row.activation_decision === 'activate')
    .map((row) => row.effective_canonical_key)
    .sort((left, right) => left.localeCompare(right, 'en-US'))
  if (stageName === 'one') return candidates.slice(0, 1)
  if (stageName === 'twenty') return candidates.slice(1, 20)
  if (stageName === 'remaining') return candidates.slice(20)
  throw new Error(`unknown activation stage: ${stageName}`)
}

function expectedPreviousStages(stageName) {
  if (stageName === 'one') return []
  if (stageName === 'twenty') return ['one']
  if (stageName === 'remaining') return ['one', 'twenty']
  return []
}

async function activateStage(stageName) {
  const decisions = readDecisions()
  const { checkpoint } = loadFrozenEvidence()
  assert.equal(checkpoint.quality_applied, true)
  for (const previous of expectedPreviousStages(stageName)) {
    assert.equal(
      checkpoint.stages.some(
        (stage) => stage.name === previous && stage.status === 'complete'
      ),
      true,
      `stage ${previous} is not complete`
    )
  }
  assert.equal(
    checkpoint.stages.some((stage) => stage.name === stageName),
    false,
    `stage ${stageName} already exists`
  )
  const keys = stageKeys(decisions, stageName)
  const stage = { name: stageName, status: 'pending', keys, completed_keys: [] }
  checkpoint.stages.push(stage)
  saveCheckpoint(checkpoint)
  const supabase = createAdminClient()
  for (const keysChunk of chunked(keys, 80)) {
    const { data: before, error: beforeError } = await supabase
      .from('mountains')
      .select('effective_canonical_key,is_active,is_readable,quality_tier')
      .in('effective_canonical_key', keysChunk)
    if (beforeError) throw beforeError
    assert.equal(before.length, keysChunk.length)
    assert.equal(
      before.every(
        (row) =>
          row.is_active === false
          && row.is_readable === false
          && ['ready', 'needs_review'].includes(row.quality_tier)
      ),
      true
    )
    const { data, error } = await supabase
      .from('mountains')
      .update({ is_active: true, is_readable: true })
      .in('effective_canonical_key', keysChunk)
      .eq('is_active', false)
      .eq('is_readable', false)
      .select('effective_canonical_key,is_active,is_readable,quality_tier')
    if (error) throw error
    assert.equal(data.length, keysChunk.length)
    assert.equal(
      data.every((row) => row.is_active && row.is_readable),
      true
    )
    stage.completed_keys.push(...keysChunk)
    saveCheckpoint(checkpoint)
  }
  stage.status = 'complete'
  saveCheckpoint(checkpoint)
  return {
    stage: stageName,
    activated: keys.length,
    first_key: keys[0],
    last_key: keys.at(-1),
  }
}

async function rollbackLastStage() {
  const { checkpoint } = loadFrozenEvidence()
  const stage = checkpoint.stages.at(-1)
  assert(stage, 'no activation stage to roll back')
  const supabase = createAdminClient()
  for (const keysChunk of chunked(stage.completed_keys, 80)) {
    const { data, error } = await supabase
      .from('mountains')
      .update({ is_active: false, is_readable: false })
      .in('effective_canonical_key', keysChunk)
      .select('effective_canonical_key,is_active,is_readable')
    if (error) throw error
    assert.equal(data.length, keysChunk.length)
    assert.equal(
      data.every((row) => !row.is_active && !row.is_readable),
      true
    )
  }
  stage.status = 'rolled_back'
  saveCheckpoint(checkpoint)
  return { stage: stage.name, rolled_back: stage.completed_keys.length }
}

async function verifyFinal() {
  assertFrozenInputs()
  const decisions = readDecisions()
  const { checkpoint } = loadFrozenEvidence()
  assert.equal(
    ['one', 'twenty', 'remaining'].every((name) =>
      checkpoint.stages.some(
        (stage) => stage.name === name && stage.status === 'complete'
      )
    ),
    true
  )
  const supabase = createAdminClient()
  const canonicalRows = await selectAllCanonicalRows(supabase)
  const { data: allRows, error } = await supabase
    .from('mountains')
    .select('effective_canonical_key,difficulty,access_status,is_active,is_readable,quality_tier')
    .order('name')
    .range(0, 999)
  if (error) throw error
  const activeCanonical = canonicalRows.filter((row) => row.is_active)
  const readableCanonical = canonicalRows.filter((row) => row.is_readable)
  const activeAll = allRows.filter((row) => row.is_active)
  const readableAll = allRows.filter((row) => row.is_readable)
  assert.equal(activeCanonical.length, 342)
  assert.equal(readableCanonical.length, 342)
  assert.equal(activeAll.length, 342)
  assert.equal(readableAll.length, 345)
  const excluded = decisions.filter(
    (row) => row.activation_decision.startsWith('excluded_')
  )
  const summary = {
    schema_version: 't11-activation-summary-v1',
    active_total: activeAll.length,
    readable_total: readableAll.length,
    active_canonical: activeCanonical.length,
    readable_canonical: readableCanonical.length,
    difficulty_distribution: countBy(activeCanonical, 'difficulty'),
    access_status_distribution: countBy(activeCanonical, 'access_status'),
    quality_tier_distribution: countBy(canonicalRows, 'quality_tier'),
    excluded_count: excluded.length,
    excluded: excluded.map((row) => ({
      effective_canonical_key: row.effective_canonical_key,
      name: row.name,
      reason: row.activation_decision,
    })),
    frozen_sha256: FROZEN_SHA256,
    migration_b_expected: true,
  }
  writeJsonAtomic(SUMMARY_PATH, summary)
  return summary
}

async function main() {
  const command = process.argv[2]
  if (command === '--plan') return buildPlan()
  if (command === '--apply-quality') return applyQuality()
  if (command === '--activate-one') return activateStage('one')
  if (command === '--activate-twenty') return activateStage('twenty')
  if (command === '--activate-remaining') return activateStage('remaining')
  if (command === '--rollback-last-stage') return rollbackLastStage()
  if (command === '--verify') return verifyFinal()
  throw new Error(
    'usage: --plan | --apply-quality | --activate-one | --activate-twenty | --activate-remaining | --rollback-last-stage | --verify'
  )
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
