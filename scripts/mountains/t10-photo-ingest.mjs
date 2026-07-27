import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import {
  assertNoSensitiveMaterial,
  detectImageMime,
  hasCompleteRecoveredAttribution,
  isCommerciallyIncompatibleLicense,
  readJsonl,
  sha256,
  sha256File,
  stableJson,
  T10_BUCKET,
  T10_CACHE_CONTROL,
  T10_MANIFEST_SHA256,
  writeJsonAtomic,
} from './t10-photo-lib.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PHOTO_ROOT = path.join(REPO_ROOT, 'data/mountains/photos')
const WORK_ROOT = path.join(REPO_ROOT, 'output/t10-photo-work')
const PREPARED_ROOT = path.join(WORK_ROOT, 'prepared')
const ASSET_PATH = path.join(PHOTO_ROOT, 't10-photo-assets.jsonl')
const ATTRIBUTION_PATH = path.join(PHOTO_ROOT, 't10-image-attribution.jsonl')
const SOURCE_MANIFEST_PATH = path.join(
  PHOTO_ROOT,
  'feishu-photo-manifest.json'
)
const SOURCE_DESCRIPTOR_PATH = path.join(
  PHOTO_ROOT,
  't10-selected-source-descriptors.json'
)
const ROUTE_OVERRIDE_PATH = path.join(
  REPO_ROOT,
  'data/mountains/d10-route-note-overrides.json'
)
const SNAPSHOT_PATH = path.join(
  PHOTO_ROOT,
  't10-db-image-snapshot.json'
)
const CHECKPOINT_PATH = path.join(
  PHOTO_ROOT,
  't10-ingest-checkpoint.json'
)
const SUMMARY_PATH = path.join(PHOTO_ROOT, 't10-ingest-summary.json')

const SNAPSHOT_COLUMNS = [
  'effective_canonical_key',
  'cover_image',
  'gallery_images',
  'image_is_illustrative',
  'image_license_manifest',
  'route_note',
  'is_active',
  'is_readable',
].join(',')

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(url, 'NEXT_PUBLIC_SUPABASE_URL is required')
  assert(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function preparedPath(asset) {
  const extension = asset.storage_path.split('.').pop()
  return path.join(
    PREPARED_ROOT,
    asset.effective_canonical_key,
    `${String(asset.order).padStart(2, '0')}.${extension}`
  )
}

function loadRouteOverrides() {
  const payload = JSON.parse(fs.readFileSync(ROUTE_OVERRIDE_PATH, 'utf8'))
  assert.equal(payload.schema_version, 'd10-route-note-overrides-v1')
  assert.equal(payload.rows.length, 9)
  return new Map(
    payload.rows.map((row) => [row.effective_canonical_key, row.route_note])
  )
}

function loadInputs() {
  const assets = readJsonl(ASSET_PATH)
  const attribution = readJsonl(ATTRIBUTION_PATH)
  assert.equal(sha256File(SOURCE_MANIFEST_PATH), T10_MANIFEST_SHA256)
  assert.equal(assets.length, 519)
  assert.equal(attribution.length, 519)
  assert.equal(
    new Set(assets.map((asset) => asset.storage_path)).size,
    519
  )
  const attributionByPath = new Map(
    attribution.map((row) => [row.storage_path, row])
  )
  assert.equal(attributionByPath.size, 519)
  assert.deepEqual(
    [...new Set(assets.map((asset) => asset.storage_path))].sort(),
    [...attributionByPath.keys()].sort()
  )
  const assetsByKey = groupAssets(assets)
  for (const [key, rows] of assetsByKey) {
    assert.deepEqual(
      rows.map((row) => row.order),
      Array.from({ length: rows.length }, (_, index) => index + 1),
      `non-contiguous image order for ${key}`
    )
  }
  for (const asset of assets) {
    const row = attributionByPath.get(asset.storage_path)
    assert(row, `missing attribution for ${asset.storage_path}`)
    assert.equal(row.file_sha256, asset.stored_sha256)
    assert.equal(
      isCommerciallyIncompatibleLicense(row.license_id),
      false,
      `incompatible license for ${asset.storage_path}`
    )
    if (row.review_status === 'recovered_exact'
      || row.review_status === 'approved_by_user') {
      assert.equal(
        hasCompleteRecoveredAttribution(row),
        true,
        `incomplete recovered attribution for ${asset.storage_path}`
      )
    } else {
      assert.equal(row.review_status, 'unresolved_license_backtrace')
      assert.equal(row.license_id, null)
    }
    const localPath = preparedPath(asset)
    assert(fs.existsSync(localPath), `missing prepared file ${asset.storage_path}`)
    const buffer = fs.readFileSync(localPath)
    assert.equal(buffer.length, asset.stored_size_bytes)
    assert.equal(sha256(buffer), asset.stored_sha256)
    assert.equal(detectImageMime(buffer), asset.stored_mime)
  }
  assertNoSensitiveMaterial(assets)
  assertNoSensitiveMaterial(attribution)
  const inputBinding = {
    source_manifest_sha256: sha256File(SOURCE_MANIFEST_PATH),
    source_descriptor_sha256: sha256File(SOURCE_DESCRIPTOR_PATH),
    asset_sidecar_sha256: sha256File(ASSET_PATH),
    attribution_sidecar_sha256: sha256File(ATTRIBUTION_PATH),
    route_override_sha256: sha256File(ROUTE_OVERRIDE_PATH),
  }
  return {
    assets,
    attributionByPath,
    routeOverrides: loadRouteOverrides(),
    inputBinding,
  }
}

async function selectCanonicalRows(supabase) {
  const { data, error } = await supabase
    .from('mountains')
    .select(SNAPSHOT_COLUMNS)
    .not('effective_canonical_key', 'is', null)
    .order('effective_canonical_key')
    .range(0, 999)
  if (error) throw error
  assert.equal(data.length, 359)
  return data
}

async function listStorageFolder(bucket, prefix = '') {
  const files = []
  let offset = 0
  while (true) {
    const { data, error } = await bucket.list(prefix, {
      limit: 1_000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw error
    for (const entry of data) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) {
        files.push({
          path: objectPath,
          id: entry.id,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
          last_accessed_at: entry.last_accessed_at,
          metadata: entry.metadata,
        })
      } else {
        files.push(...await listStorageFolder(bucket, objectPath))
      }
    }
    if (data.length < 1_000) break
    offset += data.length
  }
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en-US'))
}

async function createSnapshot(supabase, inputs) {
  assert.equal(fs.existsSync(SNAPSHOT_PATH), false, 'snapshot already exists')
  const rows = await selectCanonicalRows(supabase)
  assert.equal(
    rows.filter((row) => !row.is_active && !row.is_readable).length,
    344
  )
  assert.equal(
    rows.filter((row) => row.is_active || row.is_readable).length,
    15
  )
  const storageObjects = await listStorageFolder(
    supabase.storage.from(T10_BUCKET)
  )
  const snapshot = {
    schema_version: 't10-db-image-snapshot-v1',
    input_binding: inputs.inputBinding,
    rows,
    storage_objects: storageObjects,
  }
  assertNoSensitiveMaterial(snapshot)
  writeJsonAtomic(SNAPSHOT_PATH, snapshot)
  return snapshot
}

function readSnapshot(expectedInputBinding = null) {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
  assert.equal(snapshot.schema_version, 't10-db-image-snapshot-v1')
  if (expectedInputBinding) {
    assertInputBinding(
      snapshot.input_binding,
      expectedInputBinding,
      'T10 input after snapshot'
    )
  }
  assert.equal(snapshot.rows.length, 359)
  assert.equal(Array.isArray(snapshot.storage_objects), true)
  return snapshot
}

function emptyCheckpoint(inputBinding) {
  return {
    schema_version: 't10-ingest-checkpoint-v1',
    input_binding: inputBinding,
    completed_keys: [],
    created_storage_paths: [],
    preexisting_matching_storage_paths: [],
    verified_storage_paths: [],
    storage_intents: {},
    db_intents: {},
    rows_after: {},
    stage_history: [],
  }
}

function readCheckpoint(expectedInputBinding = null) {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    assert(expectedInputBinding, 'checkpoint does not exist')
    return emptyCheckpoint(expectedInputBinding)
  }
  const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'))
  assert.equal(checkpoint.schema_version, 't10-ingest-checkpoint-v1')
  if (expectedInputBinding) {
    assertInputBinding(
      checkpoint.input_binding,
      expectedInputBinding,
      'T10 input after checkpoint'
    )
  }
  assert.equal(typeof checkpoint.storage_intents, 'object')
  assert.equal(typeof checkpoint.db_intents, 'object')
  return checkpoint
}

function saveCheckpoint(checkpoint) {
  assertNoSensitiveMaterial(checkpoint)
  writeJsonAtomic(CHECKPOINT_PATH, checkpoint)
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right)
}

export function assertInputBinding(actual, expected, label = 'T10 input') {
  assert.equal(
    sameJson(actual, expected),
    true,
    `${label} sidecars changed`
  )
}

export function assertFrozenRollbackEvidence(snapshot, checkpoint) {
  assert.equal(snapshot.schema_version, 't10-db-image-snapshot-v1')
  assert.equal(checkpoint.schema_version, 't10-ingest-checkpoint-v1')
  assert.equal(snapshot.rows.length, 359)
  assert.equal(Array.isArray(snapshot.storage_objects), true)
  assert.equal(Array.isArray(checkpoint.completed_keys), true)
  assert.equal(Array.isArray(checkpoint.created_storage_paths), true)
  assert.equal(typeof checkpoint.storage_intents, 'object')
  assert.equal(typeof checkpoint.db_intents, 'object')
  assertInputBinding(
    checkpoint.input_binding,
    snapshot.input_binding,
    'frozen snapshot/checkpoint'
  )
  const snapshotKeys = new Set(
    snapshot.rows.map((row) => row.effective_canonical_key)
  )
  for (const key of [
    ...checkpoint.completed_keys,
    ...Object.keys(checkpoint.db_intents),
  ]) {
    assert(snapshotKeys.has(key), `rollback key missing from snapshot: ${key}`)
  }
  const snapshotStoragePaths = new Set(
    snapshot.storage_objects.map((object) => object.path)
  )
  for (const storagePath of checkpoint.created_storage_paths) {
    const intent = checkpoint.storage_intents[storagePath]
    assert(intent, `created object missing storage intent: ${storagePath}`)
    assert.equal(intent.existed_before, false)
    assert.equal(snapshotStoragePaths.has(storagePath), false)
  }
  return { snapshot, checkpoint }
}

function readFrozenRollbackEvidence() {
  assert(fs.existsSync(SNAPSHOT_PATH), 'rollback snapshot does not exist')
  assert(fs.existsSync(CHECKPOINT_PATH), 'rollback checkpoint does not exist')
  return assertFrozenRollbackEvidence(
    readSnapshot(),
    readCheckpoint()
  )
}

async function assertFlagsUnchanged(supabase, snapshot) {
  const current = await selectCanonicalRows(supabase)
  const beforeByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  for (const row of current) {
    const before = beforeByKey.get(row.effective_canonical_key)
    assert(before)
    assert.equal(
      row.is_active,
      before.is_active,
      `is_active changed for ${row.effective_canonical_key}`
    )
    assert.equal(
      row.is_readable,
      before.is_readable,
      `is_readable changed for ${row.effective_canonical_key}`
    )
  }
  return current
}

function groupAssets(assets) {
  const grouped = new Map()
  for (const asset of assets) {
    const rows = grouped.get(asset.effective_canonical_key) ?? []
    rows.push(asset)
    grouped.set(asset.effective_canonical_key, rows)
  }
  for (const rows of grouped.values()) rows.sort((a, b) => a.order - b.order)
  assert.equal(grouped.size, 359)
  return grouped
}

function orderedKeys(snapshot) {
  const hidden = snapshot.rows
    .filter((row) => !row.is_active && !row.is_readable)
    .map((row) => row.effective_canonical_key)
    .sort()
  const visible = snapshot.rows
    .filter((row) => row.is_active || row.is_readable)
    .map((row) => row.effective_canonical_key)
    .sort()
  assert.equal(hidden.length, 344)
  assert.equal(visible.length, 15)
  return [...hidden, ...visible]
}

export async function isMissingPublicObjectResponse(response) {
  if (response.status === 404) return true
  if (response.status !== 400) return false
  try {
    const body = await response.clone().json()
    return String(body?.statusCode) === '404'
      && body?.error === 'not_found'
      && body?.message === 'Object not found'
  } catch {
    return false
  }
}

function retryDelayMs(response, attempt) {
  const retryAfter = response?.headers?.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 30_000)
    }
    const dateMs = Date.parse(retryAfter)
    if (Number.isFinite(dateMs)) {
      return Math.min(Math.max(0, dateMs - Date.now()), 30_000)
    }
  }
  return Math.min(1_000 * (2 ** attempt), 8_000)
}

function isRetryableResponse(response) {
  return [408, 425, 429].includes(response.status) || response.status >= 500
}

export async function fetchWithBoundedRetry(
  url,
  {
    fetchImpl = fetch,
    sleepImpl = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
    maxAttempts = 5,
    timeoutMs = 30_000,
  } = {}
) {
  assert.equal(Number.isInteger(maxAttempts) && maxAttempts >= 1, true)
  let lastError = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!isRetryableResponse(response) || attempt === maxAttempts - 1) {
        return response
      }
      await sleepImpl(retryDelayMs(response, attempt))
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts - 1) throw error
      await sleepImpl(retryDelayMs(null, attempt))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError ?? new Error('public object verification exhausted retries')
}

export async function verifyPublicObject(
  asset,
  publicUrl,
  {
    allowMissing = false,
    fetchImpl = fetch,
    sleepImpl,
  } = {}
) {
  const url = new URL(publicUrl)
  url.searchParams.set('t10_verify', asset.stored_sha256.slice(0, 16))
  const response = await fetchWithBoundedRetry(url, {
    fetchImpl,
    sleepImpl,
  })
  if (allowMissing && await isMissingPublicObjectResponse(response)) return false
  assert.equal(response.status, 200, `public GET failed ${asset.storage_path}`)
  const contentType = response.headers.get('content-type')?.split(';')[0]
  assert.equal(contentType, asset.stored_mime, `content-type ${asset.storage_path}`)
  const contentLength = response.headers.get('content-length')
  assert(contentLength, `missing content-length ${asset.storage_path}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  assert.equal(buffer.length, asset.stored_size_bytes)
  assert.equal(Number(contentLength), buffer.length)
  assert.equal(sha256(buffer), asset.stored_sha256)
  return true
}

function isAlreadyExistsError(error) {
  return error
    && (
      error.statusCode === '409'
      || error.status === 409
      || /already exists/i.test(error.message ?? '')
    )
}

function publicUrlForAsset(supabase, asset) {
  return supabase.storage
    .from(T10_BUCKET)
    .getPublicUrl(asset.storage_path)
    .data.publicUrl
}

function setStorageIntent(asset, snapshotStoragePaths, checkpoint) {
  const existing = checkpoint.storage_intents[asset.storage_path]
  if (existing) {
    assert.equal(existing.expected_sha256, asset.stored_sha256)
    return existing
  }
  const intent = {
    status: 'pending',
    existed_before: snapshotStoragePaths.has(asset.storage_path),
    expected_sha256: asset.stored_sha256,
    expected_size_bytes: asset.stored_size_bytes,
    expected_mime: asset.stored_mime,
  }
  checkpoint.storage_intents[asset.storage_path] = intent
  saveCheckpoint(checkpoint)
  return intent
}

function markStorageVerified(asset, intent, checkpoint) {
  intent.status = 'verified'
  if (intent.existed_before) {
    checkpoint.preexisting_matching_storage_paths.push(asset.storage_path)
  } else {
    checkpoint.created_storage_paths.push(asset.storage_path)
  }
  checkpoint.verified_storage_paths.push(asset.storage_path)
  checkpoint.created_storage_paths = [...new Set(checkpoint.created_storage_paths)]
  checkpoint.preexisting_matching_storage_paths = [
    ...new Set(checkpoint.preexisting_matching_storage_paths),
  ]
  checkpoint.verified_storage_paths = [...new Set(checkpoint.verified_storage_paths)]
  saveCheckpoint(checkpoint)
}

async function reconcileStorageIntents(
  supabase,
  assetsByPath,
  snapshotStoragePaths,
  checkpoint
) {
  for (const [storagePath, intent] of Object.entries(
    checkpoint.storage_intents
  )) {
    const asset = assetsByPath.get(storagePath)
    assert(asset, `storage intent is not in current sidecar: ${storagePath}`)
    assert.equal(
      intent.existed_before,
      snapshotStoragePaths.has(storagePath)
    )
    if (intent.status === 'verified') continue
    if (intent.status === 'rolled_back') continue
    assert.equal(intent.status, 'pending')
    const exists = await verifyPublicObject(
      asset,
      publicUrlForAsset(supabase, asset),
      { allowMissing: true }
    )
    if (!exists) {
      delete checkpoint.storage_intents[storagePath]
      saveCheckpoint(checkpoint)
      continue
    }
    markStorageVerified(asset, intent, checkpoint)
  }
}

async function uploadAsset(
  supabase,
  asset,
  snapshotStoragePaths,
  checkpoint
) {
  const buffer = fs.readFileSync(preparedPath(asset))
  const bucket = supabase.storage.from(T10_BUCKET)
  const intent = setStorageIntent(asset, snapshotStoragePaths, checkpoint)
  const publicUrl = publicUrlForAsset(supabase, asset)
  if (intent.status === 'verified') return publicUrl
  const { error } = await bucket.upload(asset.storage_path, buffer, {
    contentType: asset.stored_mime,
    cacheControl: T10_CACHE_CONTROL,
    upsert: false,
  })
  if (error && !isAlreadyExistsError(error)) throw error
  await verifyPublicObject(asset, publicUrl)
  markStorageVerified(asset, intent, checkpoint)
  return publicUrl
}

function buildLicenseEntry(asset, attribution, publicUrl) {
  return {
    order: asset.order,
    filename: asset.original_name,
    storage_path: asset.storage_path,
    public_url: publicUrl,
    provider: attribution.provider,
    source_url: attribution.source_url,
    author: attribution.author,
    license_id: attribution.license_id,
    license_url: attribution.license_url,
    attribution_text: attribution.attribution_text,
    is_illustrative: asset.is_illustrative,
    review_status: attribution.review_status,
    file_sha256: asset.stored_sha256,
    original_file_sha256: asset.original_sha256,
    original_size_bytes: asset.original_size_bytes,
    stored_size_bytes: asset.stored_size_bytes,
    mime_type: asset.stored_mime,
    width: asset.stored_width,
    height: asset.stored_height,
    compressed: asset.compression.applied,
  }
}

function buildMountainPatch(
  key,
  assets,
  publicUrls,
  attributionByPath,
  routeOverrides
) {
  const licenseManifest = assets.map((asset, index) =>
    buildLicenseEntry(
      asset,
      attributionByPath.get(asset.storage_path),
      publicUrls[index]
    )
  )
  const patch = {
    cover_image: publicUrls[0],
    gallery_images: publicUrls.slice(1),
    image_is_illustrative: assets.some((asset) => asset.is_illustrative),
    image_license_manifest: licenseManifest,
  }
  if (routeOverrides.has(key)) patch.route_note = routeOverrides.get(key)
  return patch
}

function rowMatchesPatch(row, patch, before) {
  if (!row || !before) return false
  if (row.is_active !== before.is_active) return false
  if (row.is_readable !== before.is_readable) return false
  return Object.entries(patch).every(
    ([field, expected]) => sameJson(row[field], expected)
  )
}

function rowMatchesSnapshot(row, before) {
  if (!row || !before) return false
  return [
    'cover_image',
    'gallery_images',
    'image_is_illustrative',
    'image_license_manifest',
    'route_note',
    'is_active',
    'is_readable',
  ].every((field) => sameJson(row[field], before[field]))
}

async function updateMountain(
  supabase,
  key,
  patch,
  snapshotByKey
) {
  const { data, error } = await supabase
    .from('mountains')
    .update(patch)
    .eq('effective_canonical_key', key)
    .select(SNAPSHOT_COLUMNS)
    .single()
  if (error) throw error
  const before = snapshotByKey.get(key)
  assert.equal(rowMatchesPatch(data, patch, before), true)
  return data
}

function targetKeysForStage(stage, allKeys) {
  if (stage === '1') return allKeys.slice(0, 1)
  if (stage === '20') return allKeys.slice(0, 20)
  if (stage === 'all') return allKeys
  throw new Error(`unknown stage: ${stage}`)
}

export function assertStagePrerequisites(stage, checkpoint) {
  function assertAppliedCount(expected) {
    assert.equal(
      checkpoint.completed_keys.length >= expected,
      true,
      `fewer than ${expected} completed DB keys`
    )
    assert.equal(
      checkpoint.completed_keys
        .slice(0, expected)
        .every((key) => checkpoint.db_intents[key]?.status === 'applied'),
      true,
      `fewer than ${expected} applied DB intents`
    )
  }
  const completedStages = new Map(
    checkpoint.stage_history.map((entry) => [entry.stage, entry])
  )
  if (stage === '1') {
    assert.equal(completedStages.has('20'), false)
    assert.equal(completedStages.has('all'), false)
    return
  }
  const stageOne = completedStages.get('1')
  assert(stageOne, 'stage 1 must complete before a larger T10 stage')
  assert.equal(stageOne.target_count, 1)
  assert.equal(stageOne.completed_total, 1)
  assertAppliedCount(1)
  if (stage === '20') {
    assert.equal(completedStages.has('all'), false)
    return
  }
  const stageTwenty = completedStages.get('20')
  assert(stageTwenty, 'stage 20 must complete before the full T10 stage')
  assert.equal(stageTwenty.target_count, 20)
  assert.equal(stageTwenty.completed_total, 20)
  assertAppliedCount(20)
}

function buildPatchForKey(supabase, key, grouped, inputs) {
  const assets = grouped.get(key)
  assert(assets, `missing assets for ${key}`)
  const publicUrls = assets.map((asset) =>
    publicUrlForAsset(supabase, asset)
  )
  return {
    assets,
    publicUrls,
    patch: buildMountainPatch(
      key,
      assets,
      publicUrls,
      inputs.attributionByPath,
      inputs.routeOverrides
    ),
  }
}

async function reconcileDbIntents(
  supabase,
  inputs,
  grouped,
  snapshotByKey,
  currentByKey,
  checkpoint
) {
  for (const [key, intent] of Object.entries(checkpoint.db_intents)) {
    if (intent.status === 'applied' || intent.status === 'rolled_back') continue
    assert.equal(intent.status, 'pending')
    const { patch } = buildPatchForKey(supabase, key, grouped, inputs)
    assert.equal(
      intent.expected_patch_sha256,
      sha256(stableJson(patch)),
      `DB intent patch changed for ${key}`
    )
    const current = currentByKey.get(key)
    const before = snapshotByKey.get(key)
    if (rowMatchesPatch(current, patch, before)) {
      intent.status = 'applied'
      checkpoint.completed_keys.push(key)
      checkpoint.completed_keys = [...new Set(checkpoint.completed_keys)]
      checkpoint.rows_after[key] = current
      saveCheckpoint(checkpoint)
      continue
    }
    if (rowMatchesSnapshot(current, before)) {
      delete checkpoint.db_intents[key]
      saveCheckpoint(checkpoint)
      continue
    }
    throw new Error(`pending DB intent drift for ${key}`)
  }
}

async function runStage(stage) {
  const supabase = createAdminClient()
  const inputs = loadInputs()
  const snapshot = readSnapshot(inputs.inputBinding)
  const currentBefore = await assertFlagsUnchanged(supabase, snapshot)
  const checkpoint = readCheckpoint(inputs.inputBinding)
  assertStagePrerequisites(stage, checkpoint)
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  const currentByKey = new Map(
    currentBefore.map((row) => [row.effective_canonical_key, row])
  )
  const grouped = groupAssets(inputs.assets)
  const assetsByPath = new Map(
    inputs.assets.map((asset) => [asset.storage_path, asset])
  )
  const snapshotStoragePaths = new Set(
    snapshot.storage_objects.map((object) => object.path)
  )
  await reconcileStorageIntents(
    supabase,
    assetsByPath,
    snapshotStoragePaths,
    checkpoint
  )
  await reconcileDbIntents(
    supabase,
    inputs,
    grouped,
    snapshotByKey,
    currentByKey,
    checkpoint
  )
  const completed = new Set(checkpoint.completed_keys)
  for (const key of completed) {
    const expected = checkpoint.rows_after[key]
    assert(expected, `missing rows_after checkpoint for ${key}`)
    const current = currentByKey.get(key)
    for (const field of [
      'cover_image',
      'gallery_images',
      'image_is_illustrative',
      'image_license_manifest',
      'route_note',
    ]) {
      assert.equal(
        sameJson(current[field], expected[field]),
        true,
        `completed row drift for ${key}.${field}`
      )
    }
  }
  const allKeys = orderedKeys(snapshot)
  const targetKeys = targetKeysForStage(stage, allKeys)
  for (const [index, key] of targetKeys.entries()) {
    if (completed.has(key)) continue
    const assets = grouped.get(key)
    const publicUrls = []
    process.stderr.write(`[T10 ${stage} ${index + 1}/${targetKeys.length}] ${key}\n`)
    for (const asset of assets) {
      publicUrls.push(
        await uploadAsset(
          supabase,
          asset,
          snapshotStoragePaths,
          checkpoint
        )
      )
    }
    const patch = buildMountainPatch(
      key,
      assets,
      publicUrls,
      inputs.attributionByPath,
      inputs.routeOverrides
    )
    checkpoint.db_intents[key] = {
      status: 'pending',
      expected_patch_sha256: sha256(stableJson(patch)),
    }
    saveCheckpoint(checkpoint)
    const row = await updateMountain(
      supabase,
      key,
      patch,
      snapshotByKey
    )
    checkpoint.db_intents[key].status = 'applied'
    checkpoint.completed_keys.push(key)
    checkpoint.completed_keys = [...new Set(checkpoint.completed_keys)]
    checkpoint.rows_after[key] = row
    saveCheckpoint(checkpoint)
    completed.add(key)
  }
  assert.equal(
    targetKeys.every((key) => checkpoint.completed_keys.includes(key)),
    true
  )
  if (!checkpoint.stage_history.some((entry) => entry.stage === stage)) {
    checkpoint.stage_history.push({
      stage,
      target_count: targetKeys.length,
      completed_total: targetKeys.length,
    })
  }
  saveCheckpoint(checkpoint)
  await assertFlagsUnchanged(supabase, snapshot)
  return {
    stage,
    target_count: targetKeys.length,
    completed_total: checkpoint.completed_keys.length,
    visible_rows_processed:
      checkpoint.completed_keys.filter(
        (key) => snapshotByKey.get(key).is_active || snapshotByKey.get(key).is_readable
      ).length,
  }
}

async function rollbackDatabase(supabase, snapshot, checkpoint) {
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  const rollbackKeys = [
    ...new Set([
      ...checkpoint.completed_keys,
      ...Object.entries(checkpoint.db_intents)
        .filter(([, intent]) => intent.status !== 'rolled_back')
        .map(([key]) => key),
    ]),
  ].reverse()
  for (const key of rollbackKeys) {
    const before = snapshotByKey.get(key)
    const { data, error } = await supabase
      .from('mountains')
      .update({
        cover_image: before.cover_image,
        gallery_images: before.gallery_images,
        image_is_illustrative: before.image_is_illustrative,
        image_license_manifest: before.image_license_manifest,
        route_note: before.route_note,
      })
      .eq('effective_canonical_key', key)
      .select(SNAPSHOT_COLUMNS)
      .single()
    if (error) throw error
    assert.equal(data.is_active, before.is_active)
    assert.equal(data.is_readable, before.is_readable)
    if (checkpoint.db_intents[key]) {
      checkpoint.db_intents[key].status = 'rolled_back'
    }
    checkpoint.completed_keys = checkpoint.completed_keys.filter(
      (completedKey) => completedKey !== key
    )
    delete checkpoint.rows_after[key]
    saveCheckpoint(checkpoint)
  }
  checkpoint.stage_history = []
  saveCheckpoint(checkpoint)
  return { rolled_back_rows: rollbackKeys.length }
}

async function rollbackStorage(supabase, snapshot, checkpoint) {
  const snapshotStoragePaths = new Set(
    snapshot.storage_objects.map((object) => object.path)
  )
  const currentRows = await selectCanonicalRows(supabase)
  const currentByKey = new Map(
    currentRows.map((row) => [row.effective_canonical_key, row])
  )
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  for (const key of Object.keys(checkpoint.db_intents)) {
    assert.equal(
      rowMatchesSnapshot(currentByKey.get(key), snapshotByKey.get(key)),
      true,
      `restore DB snapshot before deleting Storage objects for ${key}`
    )
  }
  const created = [
    ...new Set([
      ...checkpoint.created_storage_paths,
      ...Object.entries(checkpoint.storage_intents)
        .filter(
          ([storagePath, intent]) =>
            intent.status !== 'rolled_back'
            && !intent.existed_before
            && !snapshotStoragePaths.has(storagePath)
        )
        .map(([storagePath]) => storagePath),
    ]),
  ]
  for (let index = 0; index < created.length; index += 100) {
    const { error } = await supabase.storage
      .from(T10_BUCKET)
      .remove(created.slice(index, index + 100))
    if (error) throw error
  }
  for (const storagePath of created) {
    if (checkpoint.storage_intents[storagePath]) {
      checkpoint.storage_intents[storagePath].status = 'rolled_back'
    }
  }
  checkpoint.created_storage_paths = checkpoint.created_storage_paths.filter(
    (storagePath) => !created.includes(storagePath)
  )
  checkpoint.verified_storage_paths = checkpoint.verified_storage_paths.filter(
    (storagePath) => !created.includes(storagePath)
  )
  saveCheckpoint(checkpoint)
  return { removed_objects: created.length }
}

async function rollbackAll() {
  const supabase = createAdminClient()
  const { snapshot, checkpoint } = readFrozenRollbackEvidence()
  const database = await rollbackDatabase(supabase, snapshot, checkpoint)
  const storage = await rollbackStorage(supabase, snapshot, checkpoint)
  return { database, storage }
}

async function verifyPublicAssets(supabase, assets, concurrency = 6) {
  let nextIndex = 0
  let verified = 0
  let verifiedBytes = 0
  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= assets.length) return
      const asset = assets[index]
      await verifyPublicObject(asset, publicUrlForAsset(supabase, asset))
      verified += 1
      verifiedBytes += asset.stored_size_bytes
      if (verified % 25 === 0 || verified === assets.length) {
        process.stderr.write(
          `[T10 verify ${verified}/${assets.length}] public bytes verified\n`
        )
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, assets.length) },
      () => worker()
    )
  )
  return {
    storage_paths_download_verified: verified,
    storage_bytes_download_verified: verifiedBytes,
  }
}

async function verifyFinal() {
  const supabase = createAdminClient()
  const inputs = loadInputs()
  const snapshot = readSnapshot(inputs.inputBinding)
  const rows = await assertFlagsUnchanged(supabase, snapshot)
  const checkpoint = readCheckpoint(inputs.inputBinding)
  assert.equal(checkpoint.completed_keys.length, 359)
  assert.equal(
    Object.values(checkpoint.storage_intents).every(
      (intent) => intent.status === 'verified'
    ),
    true
  )
  assert.equal(
    Object.values(checkpoint.db_intents).every(
      (intent) => intent.status === 'applied'
    ),
    true
  )
  const covers = rows.filter((row) => row.cover_image).length
  const galleryRows = rows.filter((row) => row.gallery_images.length > 0).length
  const galleryImages = rows.reduce(
    (sum, row) => sum + row.gallery_images.length,
    0
  )
  const licenseEntries = rows.reduce(
    (sum, row) => sum + row.image_license_manifest.length,
    0
  )
  const illustrativeRows = rows.filter((row) => row.image_is_illustrative).length
  assert.equal(covers, 359)
  assert.equal(galleryRows, 141)
  assert.equal(galleryImages, 160)
  assert.equal(licenseEntries, 519)
  assert.equal(illustrativeRows, 159)
  const grouped = groupAssets(inputs.assets)
  const rowsByKey = new Map(
    rows.map((row) => [row.effective_canonical_key, row])
  )
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  for (const key of grouped.keys()) {
    const { patch } = buildPatchForKey(supabase, key, grouped, inputs)
    assert.equal(
      rowMatchesPatch(rowsByKey.get(key), patch, snapshotByKey.get(key)),
      true,
      `final DB row does not match bound sidecars for ${key}`
    )
  }
  const routeOverrides = inputs.routeOverrides
  for (const row of rows.filter((candidate) =>
    routeOverrides.has(candidate.effective_canonical_key)
  )) {
    assert.equal(row.route_note, routeOverrides.get(row.effective_canonical_key))
  }
  assert.equal(
    checkpoint.verified_storage_paths.length,
    519
  )
  assert.deepEqual(
    [...checkpoint.verified_storage_paths].sort(),
    inputs.assets.map((asset) => asset.storage_path).sort()
  )
  const publicObjectEvidence = await verifyPublicAssets(
    supabase,
    inputs.assets
  )
  assert.equal(publicObjectEvidence.storage_paths_download_verified, 519)
  const summary = {
    schema_version: 't10-ingest-summary-v1',
    canonical_rows: rows.length,
    covers,
    gallery_rows: galleryRows,
    gallery_images: galleryImages,
    license_entries: licenseEntries,
    illustrative_rows: illustrativeRows,
    d10_route_notes: routeOverrides.size,
    storage_paths_verified: checkpoint.verified_storage_paths.length,
    ...publicObjectEvidence,
    storage_expected_paths_download_verified: true,
    storage_catalog_exact_match: null,
    storage_catalog_exact_match_note:
      'not re-enumerated; expected sidecar paths were downloaded and byte-verified',
    preexisting_storage_objects_unchanged: snapshot.storage_objects.length,
    created_storage_paths: checkpoint.created_storage_paths.length,
    preexisting_matching_storage_paths:
      checkpoint.preexisting_matching_storage_paths.length,
    flags_unchanged: true,
  }
  writeJsonAtomic(SUMMARY_PATH, summary)
  return summary
}

async function main() {
  const command = process.argv[2]
  if (command === '--snapshot') {
    const inputs = loadInputs()
    return createSnapshot(createAdminClient(), inputs).then((snapshot) => ({
      snapshot_rows: snapshot.rows.length,
      storage_objects_before: snapshot.storage_objects.length,
    }))
  }
  if (command?.startsWith('--stage=')) {
    return runStage(command.slice('--stage='.length))
  }
  if (command === '--verify') return verifyFinal()
  if (command === '--rollback') return rollbackAll()
  throw new Error(
    'usage: --snapshot | --stage=1 | --stage=20 | --stage=all | --verify | --rollback'
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
