import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import {
  assertNoSensitiveMaterial,
  buildStoragePath,
  detectImageMime,
  extensionForMime,
  readJsonl,
  sha256,
  sha256File,
  stableJson,
  T10_BUCKET,
  T10_CACHE_CONTROL,
  T10_MANIFEST_SHA256,
  writeJsonAtomic,
  writeJsonlAtomic,
} from './t10-photo-lib.mjs'
import {
  compressIfNeeded,
  FeishuMediaClient,
  verifyDecodable,
} from './t10-photo-prepare.mjs'
import {
  fetchWithBoundedRetry,
  isMissingPublicObjectResponse,
  verifyPublicObject,
} from './t10-photo-ingest.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PHOTO_ROOT = path.join(REPO_ROOT, 'data/mountains/photos')
const MANIFEST_PATH = path.join(PHOTO_ROOT, 'feishu-photo-manifest.json')
const BASELINE_ASSET_PATH = path.join(PHOTO_ROOT, 't10-photo-assets.jsonl')
const ASSET_PATH = path.join(
  PHOTO_ROOT,
  't10-replacement-20260728-assets.jsonl'
)
const SNAPSHOT_PATH = path.join(
  PHOTO_ROOT,
  't10-replacement-20260728-snapshot.json'
)
const CHECKPOINT_PATH = path.join(
  PHOTO_ROOT,
  't10-replacement-20260728-checkpoint.json'
)
const SUMMARY_PATH = path.join(
  PHOTO_ROOT,
  't10-replacement-20260728-summary.json'
)
const WORK_ROOT = path.join(
  REPO_ROOT,
  'output/t10-photo-replacement-20260728'
)
const SOURCE_ROOT = path.join(WORK_ROOT, 'source')
const PREPARED_ROOT = path.join(WORK_ROOT, 'prepared')

export const REPLACEMENT_COUNTS = Object.freeze({
  emeishan: 2,
  'gongga-shan': 1,
  huashan: 2,
  kawagebo: 1,
  'muztagata-feng': 2,
  songshan: 2,
  'yandangshan-zhejiang': 2,
  huangshan: 2,
  'shennong-ding': 2,
  wudangshan: 2,
  'zhangjiajie-tianmen-shan': 1,
})

const TARGET_KEYS = Object.freeze(Object.keys(REPLACEMENT_COUNTS))
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
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function sourcePath(asset) {
  return path.join(
    SOURCE_ROOT,
    asset.effective_canonical_key,
    `${String(asset.order).padStart(2, '0')}.bin`
  )
}

function preparedPath(asset) {
  return path.join(
    PREPARED_ROOT,
    asset.effective_canonical_key,
    `${String(asset.order).padStart(2, '0')}.${extensionForMime(
      asset.stored_mime
    )}`
  )
}

function manifestTargets() {
  assert.equal(sha256File(MANIFEST_PATH), T10_MANIFEST_SHA256)
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const byKey = new Map(
    manifest.map((row) => [row.effective_canonical_key, row])
  )
  const targets = TARGET_KEYS.map((key) => {
    const row = byKey.get(key)
    assert(row, `manifest target missing: ${key}`)
    assert.equal(row.images.length, REPLACEMENT_COUNTS[key])
    assert.equal(
      row.images.every((image) => image.field === '自备图'),
      true,
      `${key}: replacement must use only user-supplied images`
    )
    return row
  })
  assert.equal(
    targets.reduce((sum, row) => sum + row.images.length, 0),
    19
  )
  return targets
}

function sidecarBinding() {
  return {
    source_manifest_sha256: sha256File(MANIFEST_PATH),
    replacement_asset_sha256: sha256File(ASSET_PATH),
  }
}

function assertBinding(actual, expected) {
  assert.equal(stableJson(actual), stableJson(expected), 'replacement binding changed')
}

async function prepare() {
  const targets = manifestTargets()
  const baselinePaths = new Set(
    readJsonl(BASELINE_ASSET_PATH).map((asset) => asset.storage_path)
  )
  const client = new FeishuMediaClient(
    process.env.FEISHU_APP_ID,
    process.env.FEISHU_APP_SECRET
  )
  const assets = []
  for (const mountain of targets) {
    for (const [index, image] of mountain.images.entries()) {
      const order = index + 1
      const sourceAsset = {
        effective_canonical_key: mountain.effective_canonical_key,
        mountain_name: mountain.name,
        order,
        file_token: image.file_token,
      }
      const rawPath = sourcePath(sourceAsset)
      fs.mkdirSync(path.dirname(rawPath), { recursive: true })
      let raw
      if (fs.existsSync(rawPath)) {
        raw = fs.readFileSync(rawPath)
      } else {
        raw = await client.download(sourceAsset)
        fs.writeFileSync(rawPath, raw)
      }
      assert.equal(
        raw.length,
        image.size,
        `${mountain.effective_canonical_key}#${order}: Feishu size changed`
      )
      const originalMime = detectImageMime(raw)
      assert(originalMime, `${mountain.effective_canonical_key}#${order}: bad magic bytes`)
      const originalDimensions = await verifyDecodable(raw, originalMime)
      const stored = await compressIfNeeded(
        raw,
        originalMime,
        originalDimensions
      )
      const storagePath = buildStoragePath(
        mountain.effective_canonical_key,
        order,
        image.name,
        stored.mime
      )
      assert.equal(
        baselinePaths.has(storagePath),
        false,
        `replacement path collides with baseline object: ${storagePath}`
      )
      const row = {
        schema_version: 't10-photo-replacement-asset-v1',
        effective_canonical_key: mountain.effective_canonical_key,
        mountain_name: mountain.name,
        order,
        original_name: image.name,
        provider: 'user_supplied',
        license_id: 'user_owned',
        attribution_text: null,
        review_status: 'approved_by_user',
        image_is_illustrative: true,
        original_mime: originalMime,
        original_size_bytes: raw.length,
        original_sha256: sha256(raw),
        original_width: originalDimensions.width,
        original_height: originalDimensions.height,
        stored_mime: stored.mime,
        stored_size_bytes: stored.buffer.length,
        stored_sha256: sha256(stored.buffer),
        stored_width: stored.dimensions.width,
        stored_height: stored.dimensions.height,
        compression: stored.compression,
        storage_path: storagePath,
      }
      const outputPath = path.join(
        PREPARED_ROOT,
        row.effective_canonical_key,
        `${String(order).padStart(2, '0')}.${extensionForMime(row.stored_mime)}`
      )
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, stored.buffer)
      assets.push(row)
      process.stderr.write(
        `[T10 replacement prepare ${assets.length}/19] ${mountain.effective_canonical_key}#${order}\n`
      )
    }
  }
  assert.equal(assets.length, 19)
  assert.equal(new Set(assets.map((asset) => asset.storage_path)).size, 19)
  assertNoSensitiveMaterial(assets, [
    process.env.FEISHU_APP_ID,
    process.env.FEISHU_APP_SECRET,
    client.token,
  ])
  writeJsonlAtomic(ASSET_PATH, assets)
  return {
    assets: assets.length,
    mountains: new Set(
      assets.map((asset) => asset.effective_canonical_key)
    ).size,
    asset_sha256: sha256File(ASSET_PATH),
    compressed: assets
      .filter((asset) => asset.compression.applied)
      .map((asset) => ({
        effective_canonical_key: asset.effective_canonical_key,
        order: asset.order,
        original_size_bytes: asset.original_size_bytes,
        stored_size_bytes: asset.stored_size_bytes,
      })),
  }
}

function loadAssets() {
  const assets = readJsonl(ASSET_PATH)
  assert.equal(assets.length, 19)
  assert.equal(new Set(assets.map((asset) => asset.storage_path)).size, 19)
  assert.equal(
    new Set(assets.map((asset) => asset.effective_canonical_key)).size,
    11
  )
  for (const asset of assets) {
    const buffer = fs.readFileSync(preparedPath(asset))
    assert.equal(buffer.length, asset.stored_size_bytes)
    assert.equal(sha256(buffer), asset.stored_sha256)
    assert.equal(detectImageMime(buffer), asset.stored_mime)
  }
  return assets
}

async function selectRows(supabase, keys = TARGET_KEYS) {
  const { data, error } = await supabase
    .from('mountains')
    .select(ROW_COLUMNS)
    .in('effective_canonical_key', keys)
    .order('effective_canonical_key')
  if (error) throw error
  assert.equal(data.length, keys.length)
  return data
}

async function snapshot() {
  assert.equal(fs.existsSync(SNAPSHOT_PATH), false, 'replacement snapshot exists')
  assert.equal(fs.existsSync(CHECKPOINT_PATH), false, 'replacement checkpoint exists')
  const assets = loadAssets()
  const supabase = createAdminClient()
  const rows = await selectRows(supabase)
  assert.equal(rows.every((row) => row.is_active && row.is_readable), true)
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
  assert.equal(oldLinkedObjects.length, 18)
  assert.equal(
    oldLinkedObjects.every(
      (row) =>
        row.storage_path
        && row.public_url
        && row.stored_sha256
        && Number.isInteger(row.stored_size_bytes)
        && row.stored_mime
    ),
    true
  )
  const payload = {
    schema_version: 't10-photo-replacement-snapshot-v1',
    input_binding: sidecarBinding(),
    rows,
    old_linked_objects: oldLinkedObjects,
  }
  assertNoSensitiveMaterial(payload)
  writeJsonAtomic(SNAPSHOT_PATH, payload)
  const checkpoint = {
    schema_version: 't10-photo-replacement-checkpoint-v1',
    input_binding: payload.input_binding,
    completed_keys: [],
    storage_intents: {},
    db_intents: {},
    created_storage_paths: [],
    preexisting_matching_storage_paths: [],
    rows_after: {},
  }
  writeJsonAtomic(CHECKPOINT_PATH, checkpoint)
  return {
    rows: rows.length,
    old_linked_objects: oldLinkedObjects.length,
    visible_rows: rows.filter((row) => row.is_active && row.is_readable).length,
  }
}

function loadFrozenEvidence() {
  const snapshotPayload = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
  const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'))
  assert.equal(
    snapshotPayload.schema_version,
    't10-photo-replacement-snapshot-v1'
  )
  assert.equal(
    checkpoint.schema_version,
    't10-photo-replacement-checkpoint-v1'
  )
  assertBinding(snapshotPayload.input_binding, sidecarBinding())
  assertBinding(checkpoint.input_binding, snapshotPayload.input_binding)
  assert.equal(snapshotPayload.rows.length, 11)
  assert.equal(snapshotPayload.old_linked_objects.length, 18)
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
    order: asset.order,
    filename: asset.original_name,
    storage_path: asset.storage_path,
    public_url: publicUrl,
    provider: 'user_supplied',
    source_url: null,
    author: null,
    license_id: 'user_owned',
    license_url: null,
    attribution_text: null,
    is_illustrative: true,
    review_status: 'approved_by_user',
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

function patchForAssets(supabase, assets) {
  const urls = assets.map((asset) => publicUrlForAsset(supabase, asset))
  return {
    cover_image: urls[0],
    gallery_images: urls.slice(1),
    image_is_illustrative: true,
    image_license_manifest: assets.map((asset, index) =>
      licenseEntry(asset, urls[index])
    ),
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
  if (!existingIntent) {
    checkpoint.storage_intents[asset.storage_path] = {
      status: 'pending',
      expected_sha256: asset.stored_sha256,
      expected_size_bytes: asset.stored_size_bytes,
      expected_mime: asset.stored_mime,
    }
    saveCheckpoint(checkpoint)
  }
  const publicUrl = publicUrlForAsset(supabase, asset)
  const response = await fetchWithBoundedRetry(
    `${publicUrl}?t10_replacement_probe=${asset.stored_sha256.slice(0, 16)}`,
  )
  const missing = await isMissingPublicObjectResponse(response)
  let created = false
  if (!missing) {
    assert.equal(response.status, 200, `existing object unreadable: ${asset.storage_path}`)
    await verifyPublicObject(asset, publicUrl)
  } else {
    const buffer = fs.readFileSync(preparedPath(asset))
    const { error } = await supabase.storage
      .from(T10_BUCKET)
      .upload(asset.storage_path, buffer, {
        contentType: asset.stored_mime,
        cacheControl: T10_CACHE_CONTROL,
        upsert: false,
      })
    if (error && !isAlreadyExists(error)) throw error
    await verifyPublicObject(asset, publicUrl)
    created = !error
  }
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
  checkpoint.storage_intents[asset.storage_path].status = 'verified'
  saveCheckpoint(checkpoint)
}

async function applyReplacement() {
  const assets = loadAssets()
  const { snapshot, checkpoint } = loadFrozenEvidence()
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  const grouped = new Map()
  for (const asset of assets) {
    const rows = grouped.get(asset.effective_canonical_key) ?? []
    rows.push(asset)
    grouped.set(asset.effective_canonical_key, rows)
  }
  for (const rows of grouped.values()) rows.sort((a, b) => a.order - b.order)
  const supabase = createAdminClient()
  for (const [index, key] of TARGET_KEYS.entries()) {
    const before = snapshotByKey.get(key)
    assert(before?.is_active && before?.is_readable)
    const keyAssets = grouped.get(key)
    const patch = patchForAssets(supabase, keyAssets)
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
    for (const asset of keyAssets) {
      await ensureStorageObject(supabase, asset, checkpoint)
    }
    checkpoint.db_intents[key] = {
      status: 'pending',
      expected_patch_sha256: sha256(stableJson(patch)),
    }
    saveCheckpoint(checkpoint)
    const { data, error } = await supabase
      .from('mountains')
      .update(patch)
      .eq('effective_canonical_key', key)
      .eq('is_active', before.is_active)
      .eq('is_readable', before.is_readable)
      .select(ROW_COLUMNS)
      .single()
    if (error) throw error
    assert.equal(rowMatchesPatch(data, before, patch), true)
    checkpoint.db_intents[key].status = 'applied'
    checkpoint.completed_keys.push(key)
    checkpoint.rows_after[key] = data
    saveCheckpoint(checkpoint)
    process.stderr.write(
      `[T10 replacement apply ${index + 1}/11] ${key} verified\n`
    )
  }
  return {
    completed_keys: checkpoint.completed_keys.length,
    created_storage_paths: checkpoint.created_storage_paths.length,
    preexisting_matching_storage_paths:
      checkpoint.preexisting_matching_storage_paths.length,
  }
}

async function verifyOldLinkedObjects(snapshot) {
  let verified = 0
  for (const object of snapshot.old_linked_objects) {
    await verifyPublicObject(
      {
        storage_path: object.storage_path,
        stored_sha256: object.stored_sha256,
        stored_size_bytes: object.stored_size_bytes,
        stored_mime: object.stored_mime,
      },
      object.public_url
    )
    verified += 1
  }
  return verified
}

async function verifyFinal() {
  const assets = loadAssets()
  const { snapshot, checkpoint } = loadFrozenEvidence()
  assert.equal(checkpoint.completed_keys.length, 11)
  const supabase = createAdminClient()
  const rows = await selectRows(supabase)
  const snapshotByKey = new Map(
    snapshot.rows.map((row) => [row.effective_canonical_key, row])
  )
  const grouped = new Map()
  for (const asset of assets) {
    const rowsForKey = grouped.get(asset.effective_canonical_key) ?? []
    rowsForKey.push(asset)
    grouped.set(asset.effective_canonical_key, rowsForKey)
  }
  let replacementBytes = 0
  for (const key of TARGET_KEYS) {
    const keyAssets = grouped.get(key).sort((a, b) => a.order - b.order)
    const patch = patchForAssets(supabase, keyAssets)
    const row = rows.find((candidate) => candidate.effective_canonical_key === key)
    assert.equal(rowMatchesPatch(row, snapshotByKey.get(key), patch), true)
    for (const asset of keyAssets) {
      await verifyPublicObject(asset, publicUrlForAsset(supabase, asset))
      replacementBytes += asset.stored_size_bytes
    }
  }
  const oldLinkedObjectsVerified = await verifyOldLinkedObjects(snapshot)
  const { data: allRows, error } = await supabase
    .from('mountains')
    .select(ROW_COLUMNS)
    .not('effective_canonical_key', 'is', null)
    .order('effective_canonical_key')
    .range(0, 999)
  if (error) throw error
  assert.equal(allRows.length, 359)
  const covers = allRows.filter((row) => row.cover_image).length
  const galleryRows = allRows.filter((row) => row.gallery_images.length > 0).length
  const galleryImages = allRows.reduce(
    (sum, row) => sum + row.gallery_images.length,
    0
  )
  const illustrativeRows = allRows.filter(
    (row) => row.image_is_illustrative
  ).length
  const visibleRows = allRows.filter(
    (row) => row.is_active || row.is_readable
  )
  assert.equal(visibleRows.length, 15)
  const unresolvedVisible = visibleRows.flatMap((row) =>
    row.image_license_manifest
      .filter(
        (image) =>
          image.provider !== 'user_supplied'
          || image.license_id !== 'user_owned'
          || image.attribution_text !== null
          || image.review_status !== 'approved_by_user'
      )
      .map((image) => ({
        effective_canonical_key: row.effective_canonical_key,
        storage_path: image.storage_path,
      }))
  )
  assert.equal(covers, 359)
  assert.equal(galleryRows, 142)
  assert.equal(galleryImages, 161)
  assert.equal(illustrativeRows, 170)
  assert.deepEqual(unresolvedVisible, [])
  assert.equal(
    rows.every((row) => {
      const before = snapshotByKey.get(row.effective_canonical_key)
      return row.is_active === before.is_active
        && row.is_readable === before.is_readable
    }),
    true
  )
  const summary = {
    schema_version: 't10-photo-replacement-summary-v1',
    manifest_sha256: T10_MANIFEST_SHA256,
    replaced_mountains: 11,
    replacement_images: 19,
    replacement_bytes_verified: replacementBytes,
    old_linked_objects_retained_and_verified: oldLinkedObjectsVerified,
    covers,
    gallery_rows: galleryRows,
    gallery_images: galleryImages,
    illustrative_rows: illustrativeRows,
    visible_rows: visibleRows.length,
    visible_unresolved_attribution_images: unresolvedVisible.length,
    visible_unresolved_attribution_mountains: 0,
    flags_unchanged: true,
  }
  writeJsonAtomic(SUMMARY_PATH, summary)
  return summary
}

async function rollback() {
  const { snapshot, checkpoint } = loadFrozenEvidence()
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
  for (let index = 0; index < checkpoint.created_storage_paths.length; index += 100) {
    const paths = checkpoint.created_storage_paths.slice(index, index + 100)
    const { error } = await supabase.storage.from(T10_BUCKET).remove(paths)
    if (error) throw error
  }
  const removed = checkpoint.created_storage_paths.length
  checkpoint.created_storage_paths = []
  saveCheckpoint(checkpoint)
  return { restored_rows: 11, removed_new_objects: removed }
}

async function main() {
  const command = process.argv[2]
  if (command === '--prepare') return prepare()
  if (command === '--snapshot') return snapshot()
  if (command === '--apply') return applyReplacement()
  if (command === '--verify') return verifyFinal()
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
