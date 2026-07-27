import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import {
  assertNoSensitiveMaterial,
  buildStoragePath,
  detectImageMime,
  sha256,
  sha256File,
  stableJson,
  T10_BUCKET,
  T10_CACHE_CONTROL,
  T10_MANIFEST_SHA256,
  writeJsonAtomic,
  writeJsonlAtomic,
} from './t10-photo-lib.mjs'
import { verifyDecodable } from './t10-photo-prepare.mjs'
import {
  fetchWithBoundedRetry,
  isMissingPublicObjectResponse,
  verifyPublicObject,
} from './t10-photo-ingest.mjs'
import {
  markReplacementStorageRolledBack,
  markReplacementStorageVerified,
  prepareReplacementStorageIntent,
  recordReplacementStorageExistence,
} from './t10-photo-replacement-20260728.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PHOTO_ROOT = path.join(REPO_ROOT, 'data/mountains/photos')
const MANIFEST_PATH = path.join(PHOTO_ROOT, 'feishu-photo-manifest.json')
const ASSET_PATH = path.join(PHOTO_ROOT, 't11-image-sync-assets.jsonl')
const SNAPSHOT_PATH = path.join(PHOTO_ROOT, 't11-image-sync-snapshot.json')
const CHECKPOINT_PATH = path.join(PHOTO_ROOT, 't11-image-sync-checkpoint.json')
const SUMMARY_PATH = path.join(PHOTO_ROOT, 't11-image-sync-summary.json')
const SOURCE_ROOT = path.join(
  REPO_ROOT,
  'output/t11-image-sync-source-proxy'
)

export const T11_IMAGE_TARGETS = Object.freeze([
  {
    effective_canonical_key: 'gongga-jiazi-feng',
    mountain_name: '贡嘎嘉子峰',
    selection: '用自备图',
    field: '自备图',
    filename: 'image.png',
    is_illustrative: true,
  },
  {
    effective_canonical_key: 'gongga-riwuqie-feng',
    mountain_name: '贡嘎日乌且峰',
    selection: '用自备图',
    field: '自备图',
    filename: 'image.png',
    is_illustrative: true,
  },
  {
    effective_canonical_key: 'gongga-xiaogongga-feng',
    mountain_name: '贡嘎小贡嘎峰',
    selection: '用自备图',
    field: '自备图',
    filename: 'image.png',
    is_illustrative: true,
  },
  {
    effective_canonical_key: 'gongyu-yan',
    mountain_name: '公盂岩',
    selection: '候选2',
    field: '候选2',
    filename: 'gongyu-yan_7.jpg',
    is_illustrative: false,
  },
])

const TARGET_KEYS = T11_IMAGE_TARGETS.map(
  (target) => target.effective_canonical_key
)
const ROW_COLUMNS = [
  'id',
  'effective_canonical_key',
  'cover_image',
  'gallery_images',
  'image_is_illustrative',
  'image_license_manifest',
  'is_active',
  'is_readable',
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

function selectedManifestRows() {
  assert.equal(sha256File(MANIFEST_PATH), T10_MANIFEST_SHA256)
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const byKey = new Map(
    manifest.map((row) => [row.effective_canonical_key, row])
  )
  return T11_IMAGE_TARGETS.map((target) => {
    const row = byKey.get(target.effective_canonical_key)
    assert(row, `manifest target missing: ${target.effective_canonical_key}`)
    assert.deepEqual(row.selected, [target.selection])
    assert.equal(row.images.length, 1)
    assert.equal(row.images[0].field, target.field)
    assert.equal(row.images[0].name, target.filename)
    return { target, manifest: row }
  })
}

function inputBinding() {
  return {
    manifest_sha256: sha256File(MANIFEST_PATH),
    asset_sha256: sha256File(ASSET_PATH),
  }
}

function assertBinding(actual, expected) {
  assert.equal(stableJson(actual), stableJson(expected), 'T11 image binding changed')
}

function sourcePath(target) {
  return path.join(
    SOURCE_ROOT,
    target.effective_canonical_key,
    target.filename
  )
}

function attributionFor(target) {
  if (target.is_illustrative) {
    return {
      provider: 'user_supplied',
      source_url: null,
      author: null,
      license_id: 'user_owned',
      license_url: null,
      attribution_text: null,
      review_status: 'approved_by_user',
    }
  }
  return {
    provider: 'candidate_unknown',
    source_url: null,
    author: null,
    license_id: null,
    license_url: null,
    attribution_text: null,
    review_status: 'unresolved_license_backtrace',
    source_type: '名搜',
    recovery_method: 'exact_sha256_not_recovered',
  }
}

async function prepare() {
  const rows = []
  for (const { target, manifest } of selectedManifestRows()) {
    const filePath = sourcePath(target)
    const buffer = fs.readFileSync(filePath)
    assert.equal(buffer.length, manifest.images[0].size)
    const mime = detectImageMime(buffer)
    assert(mime, `${target.effective_canonical_key}: unsupported magic bytes`)
    const dimensions = await verifyDecodable(buffer, mime)
    const storagePath = buildStoragePath(
      target.effective_canonical_key,
      1,
      target.filename,
      mime
    )
    const asset = {
      schema_version: 't11-image-sync-asset-v1',
      effective_canonical_key: target.effective_canonical_key,
      mountain_name: target.mountain_name,
      order: 1,
      field: target.field,
      original_name: target.filename,
      original_size_bytes: buffer.length,
      original_sha256: sha256(buffer),
      original_mime: mime,
      stored_size_bytes: buffer.length,
      stored_sha256: sha256(buffer),
      stored_mime: mime,
      stored_width: dimensions.width,
      stored_height: dimensions.height,
      storage_path: storagePath,
      image_is_illustrative: target.is_illustrative,
      ...attributionFor(target),
    }
    assertNoSensitiveMaterial(asset)
    rows.push(asset)
  }
  writeJsonlAtomic(ASSET_PATH, rows)
  return {
    assets: rows.length,
    manifest_sha256: T10_MANIFEST_SHA256,
    asset_sha256: sha256File(ASSET_PATH),
  }
}

function loadAssets() {
  return fs
    .readFileSync(ASSET_PATH, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
}

async function selectRows(supabase, keys = TARGET_KEYS) {
  const { data, error } = await supabase
    .from('mountains')
    .select(ROW_COLUMNS)
    .in('effective_canonical_key', keys)
    .order('effective_canonical_key')
  if (error) throw error
  return data
}

async function snapshot() {
  const assets = loadAssets()
  assert.equal(assets.length, 4)
  const supabase = createAdminClient()
  const rows = await selectRows(supabase)
  assert.equal(rows.length, 4)
  assert.equal(
    rows.every((row) => !row.is_active && !row.is_readable),
    true
  )
  const oldLinkedObjects = rows.flatMap((row) =>
    row.image_license_manifest.map((image) => ({
      effective_canonical_key: row.effective_canonical_key,
      storage_path: image.storage_path,
      public_url: image.public_url,
      stored_sha256: image.file_sha256,
      stored_size_bytes: image.stored_size_bytes,
      stored_mime: image.mime_type,
    }))
  )
  assert.equal(oldLinkedObjects.length, 8)
  const payload = {
    schema_version: 't11-image-sync-snapshot-v1',
    input_binding: inputBinding(),
    rows,
    old_linked_objects: oldLinkedObjects,
  }
  assertNoSensitiveMaterial(payload)
  writeJsonAtomic(SNAPSHOT_PATH, payload)
  writeJsonAtomic(CHECKPOINT_PATH, {
    schema_version: 't11-image-sync-checkpoint-v1',
    input_binding: payload.input_binding,
    completed_keys: [],
    storage_intents: {},
    db_intents: {},
    created_storage_paths: [],
    preexisting_matching_storage_paths: [],
    rows_after: {},
  })
  return {
    rows: rows.length,
    old_linked_objects: oldLinkedObjects.length,
    inactive_unreadable: rows.length,
  }
}

function loadFrozenEvidence({ bindCurrentSidecars = true } = {}) {
  const snapshotPayload = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
  const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'))
  assert.equal(snapshotPayload.schema_version, 't11-image-sync-snapshot-v1')
  assert.equal(checkpoint.schema_version, 't11-image-sync-checkpoint-v1')
  if (bindCurrentSidecars) {
    assertBinding(snapshotPayload.input_binding, inputBinding())
  }
  assertBinding(checkpoint.input_binding, snapshotPayload.input_binding)
  assert.equal(snapshotPayload.rows.length, 4)
  return { snapshot: snapshotPayload, checkpoint }
}

function saveCheckpoint(checkpoint) {
  assertNoSensitiveMaterial(checkpoint)
  writeJsonAtomic(CHECKPOINT_PATH, checkpoint)
}

function publicUrlForAsset(supabase, asset) {
  return supabase.storage
    .from(T10_BUCKET)
    .getPublicUrl(asset.storage_path)
    .data.publicUrl
}

function isAlreadyExists(error) {
  return error
    && (
      error.statusCode === '409'
      || error.status === 409
      || /already exists/i.test(error.message ?? '')
    )
}

function licenseEntry(asset, publicUrl) {
  return {
    order: 1,
    filename: asset.original_name,
    storage_path: asset.storage_path,
    public_url: publicUrl,
    provider: asset.provider,
    source_url: asset.source_url,
    author: asset.author,
    license_id: asset.license_id,
    license_url: asset.license_url,
    attribution_text: asset.attribution_text,
    is_illustrative: asset.image_is_illustrative,
    review_status: asset.review_status,
    source_type: asset.source_type ?? null,
    recovery_method: asset.recovery_method ?? null,
    file_sha256: asset.stored_sha256,
    original_file_sha256: asset.original_sha256,
    original_size_bytes: asset.original_size_bytes,
    stored_size_bytes: asset.stored_size_bytes,
    mime_type: asset.stored_mime,
    width: asset.stored_width,
    height: asset.stored_height,
    compressed: false,
  }
}

function patchForAsset(supabase, asset) {
  const publicUrl = publicUrlForAsset(supabase, asset)
  return {
    cover_image: publicUrl,
    gallery_images: [],
    image_is_illustrative: asset.image_is_illustrative,
    image_license_manifest: [licenseEntry(asset, publicUrl)],
  }
}

function rowMatchesPatch(row, before, patch) {
  return row
    && row.is_active === before.is_active
    && row.is_readable === before.is_readable
    && Object.entries(patch).every(
      ([field, value]) => stableJson(row[field]) === stableJson(value)
    )
}

async function ensureStorageObject(supabase, asset, checkpoint) {
  const existingIntent = checkpoint.storage_intents[asset.storage_path]
  if (existingIntent?.status === 'verified') return
  prepareReplacementStorageIntent(checkpoint, asset)
  saveCheckpoint(checkpoint)
  const publicUrl = publicUrlForAsset(supabase, asset)
  const response = await fetchWithBoundedRetry(
    `${publicUrl}?t11_image_probe=${asset.stored_sha256.slice(0, 16)}`
  )
  const missing = await isMissingPublicObjectResponse(response)
  recordReplacementStorageExistence(checkpoint, asset.storage_path, !missing)
  saveCheckpoint(checkpoint)
  let created = false
  if (missing) {
    const buffer = fs.readFileSync(
      path.join(
        SOURCE_ROOT,
        asset.effective_canonical_key,
        asset.original_name
      )
    )
    const { error } = await supabase.storage
      .from(T10_BUCKET)
      .upload(asset.storage_path, buffer, {
        contentType: asset.stored_mime,
        cacheControl: T10_CACHE_CONTROL,
        upsert: false,
      })
    if (error && !isAlreadyExists(error)) throw error
    if (isAlreadyExists(error)) {
      checkpoint.storage_intents[asset.storage_path].existed_before = true
      saveCheckpoint(checkpoint)
    } else {
      created = true
    }
  } else {
    assert.equal(response.status, 200)
  }
  await verifyPublicObject(asset, publicUrl)
  if (created) {
    checkpoint.created_storage_paths.push(asset.storage_path)
  } else {
    checkpoint.preexisting_matching_storage_paths.push(asset.storage_path)
  }
  checkpoint.created_storage_paths = [
    ...new Set(checkpoint.created_storage_paths),
  ]
  checkpoint.preexisting_matching_storage_paths = [
    ...new Set(checkpoint.preexisting_matching_storage_paths),
  ]
  markReplacementStorageVerified(checkpoint, asset.storage_path)
  saveCheckpoint(checkpoint)
}

async function applySync() {
  const assets = loadAssets()
  const { snapshot, checkpoint } = loadFrozenEvidence()
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  const assetByKey = new Map(
    assets.map((asset) => [asset.effective_canonical_key, asset])
  )
  const supabase = createAdminClient()
  for (const [index, key] of TARGET_KEYS.entries()) {
    const before = snapshotByKey.get(key)
    const asset = assetByKey.get(key)
    assert(before && asset)
    const patch = patchForAsset(supabase, asset)
    const current = (await selectRows(supabase, [key]))[0]
    if (checkpoint.completed_keys.includes(key)) {
      assert.equal(rowMatchesPatch(current, before, patch), true)
      continue
    }
    assert.equal(
      stableJson({
        cover_image: current.cover_image,
        gallery_images: current.gallery_images,
        image_is_illustrative: current.image_is_illustrative,
        image_license_manifest: current.image_license_manifest,
        is_active: current.is_active,
        is_readable: current.is_readable,
      }),
      stableJson({
        cover_image: before.cover_image,
        gallery_images: before.gallery_images,
        image_is_illustrative: before.image_is_illustrative,
        image_license_manifest: before.image_license_manifest,
        is_active: before.is_active,
        is_readable: before.is_readable,
      }),
      `${key}: row changed since snapshot`
    )
    await ensureStorageObject(supabase, asset, checkpoint)
    checkpoint.db_intents[key] = {
      status: 'pending',
      expected_patch_sha256: sha256(stableJson(patch)),
    }
    saveCheckpoint(checkpoint)
    const { data, error } = await supabase
      .from('mountains')
      .update(patch)
      .eq('effective_canonical_key', key)
      .eq('is_active', false)
      .eq('is_readable', false)
      .select(ROW_COLUMNS)
      .single()
    if (error) throw error
    assert.equal(rowMatchesPatch(data, before, patch), true)
    checkpoint.db_intents[key].status = 'applied'
    checkpoint.completed_keys.push(key)
    checkpoint.rows_after[key] = data
    saveCheckpoint(checkpoint)
    process.stderr.write(`[T11 image ${index + 1}/4] ${key} verified\n`)
  }
  return {
    completed_keys: checkpoint.completed_keys.length,
    created_storage_paths: checkpoint.created_storage_paths.length,
    flags_unchanged: true,
  }
}

async function verify() {
  const assets = loadAssets()
  const { snapshot, checkpoint } = loadFrozenEvidence()
  assert.equal(checkpoint.completed_keys.length, 4)
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  const supabase = createAdminClient()
  const rows = await selectRows(supabase)
  for (const asset of assets) {
    const row = rows.find(
      (candidate) =>
        candidate.effective_canonical_key === asset.effective_canonical_key
    )
    const patch = patchForAsset(supabase, asset)
    assert.equal(
      rowMatchesPatch(
        row,
        snapshotByKey.get(asset.effective_canonical_key),
        patch
      ),
      true
    )
    await verifyPublicObject(asset, publicUrlForAsset(supabase, asset))
  }
  const { data: allRows, error } = await supabase
    .from('mountains')
    .select(ROW_COLUMNS)
    .not('effective_canonical_key', 'is', null)
    .order('effective_canonical_key')
    .range(0, 999)
  if (error) throw error
  const summary = {
    schema_version: 't11-image-sync-summary-v1',
    targets: rows.length,
    covers: allRows.filter((row) => row.cover_image).length,
    gallery_rows: allRows.filter((row) => row.gallery_images.length > 0).length,
    gallery_images: allRows.reduce(
      (sum, row) => sum + row.gallery_images.length,
      0
    ),
    illustrative_rows: allRows.filter(
      (row) => row.image_is_illustrative
    ).length,
    flags_unchanged: rows.every((row) => {
      const before = snapshotByKey.get(row.effective_canonical_key)
      return row.is_active === before.is_active
        && row.is_readable === before.is_readable
    }),
  }
  assert.deepEqual(summary, {
    schema_version: 't11-image-sync-summary-v1',
    targets: 4,
    covers: 359,
    gallery_rows: 138,
    gallery_images: 157,
    illustrative_rows: 173,
    flags_unchanged: true,
  })
  writeJsonAtomic(SUMMARY_PATH, summary)
  return summary
}

async function rollback() {
  const { snapshot, checkpoint } = loadFrozenEvidence({
    bindCurrentSidecars: false,
  })
  const supabase = createAdminClient()
  for (const before of [...snapshot.rows].reverse()) {
    if (
      !checkpoint.completed_keys.includes(before.effective_canonical_key)
      && !checkpoint.db_intents[before.effective_canonical_key]
    ) {
      continue
    }
    const { data, error } = await supabase
      .from('mountains')
      .update({
        cover_image: before.cover_image,
        gallery_images: before.gallery_images,
        image_is_illustrative: before.image_is_illustrative,
        image_license_manifest: before.image_license_manifest,
      })
      .eq('effective_canonical_key', before.effective_canonical_key)
      .eq('is_active', before.is_active)
      .eq('is_readable', before.is_readable)
      .select(ROW_COLUMNS)
      .single()
    if (error) throw error
    assert.equal(data.is_active, before.is_active)
    assert.equal(data.is_readable, before.is_readable)
    checkpoint.completed_keys = checkpoint.completed_keys.filter(
      (key) => key !== before.effective_canonical_key
    )
    if (checkpoint.db_intents[before.effective_canonical_key]) {
      checkpoint.db_intents[before.effective_canonical_key].status =
        'rolled_back'
    }
    delete checkpoint.rows_after[before.effective_canonical_key]
    saveCheckpoint(checkpoint)
  }
  const storagePaths = Object.entries(checkpoint.storage_intents)
    .filter(
      ([, intent]) =>
        intent.existed_before === false
        && intent.status !== 'rolled_back'
    )
    .map(([storagePath]) => storagePath)
  if (storagePaths.length > 0) {
    const { error } = await supabase.storage.from(T10_BUCKET).remove(storagePaths)
    if (error) throw error
  }
  markReplacementStorageRolledBack(checkpoint, storagePaths)
  saveCheckpoint(checkpoint)
  return { restored_rows: 4, removed_new_objects: storagePaths.length }
}

async function main() {
  const command = process.argv[2]
  if (command === '--prepare') return prepare()
  if (command === '--snapshot') return snapshot()
  if (command === '--apply') return applySync()
  if (command === '--verify') return verify()
  if (command === '--rollback') return rollback()
  throw new Error('usage: --prepare | --snapshot | --apply | --verify | --rollback')
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
