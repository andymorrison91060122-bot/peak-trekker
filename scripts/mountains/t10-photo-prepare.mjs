import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import {
  assertNoSensitiveMaterial,
  buildStoragePath,
  detectImageMime,
  extensionForMime,
  retryDelayMs,
  sha256,
  sha256File,
  sleep,
  T10_COMPRESSION_TARGET_BYTES,
  T10_MANIFEST_SHA256,
  T10_MAX_BYTES,
  validatePhotoManifest,
  writeJsonAtomic,
  writeJsonlAtomic,
} from './t10-photo-lib.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PHOTO_ROOT = path.join(REPO_ROOT, 'data/mountains/photos')
const MANIFEST_PATH = path.join(PHOTO_ROOT, 'feishu-photo-manifest.json')
const SOURCE_DESCRIPTOR_PATH = path.join(
  PHOTO_ROOT,
  't10-selected-source-descriptors.json'
)
const ASSET_SIDECAR_PATH = path.join(PHOTO_ROOT, 't10-photo-assets.jsonl')
const PREPARE_SUMMARY_PATH = path.join(PHOTO_ROOT, 't10-prepare-summary.json')
const WORK_ROOT = path.join(REPO_ROOT, 'output/t10-photo-work')
const SOURCE_ROOT = path.join(WORK_ROOT, 'source')
const PREPARED_ROOT = path.join(WORK_ROOT, 'prepared')
const FEISHU_BASE = 'https://open.feishu.cn/open-apis'

function curlConfigValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function curlRequest({ url, method = 'GET', headers = [], body = null, timeout = 60 }) {
  const marker = '\n__T10_CURL_HTTP_STATUS__:'
  const config = [
    `url = ${curlConfigValue(url)}`,
    `request = ${curlConfigValue(method)}`,
    ...headers.map((header) => `header = ${curlConfigValue(header)}`),
    ...(body === null ? [] : [`data = ${curlConfigValue(body)}`]),
  ].join('\n')
  const result = spawnSync(
    'curl',
    [
      '--http1.1',
      '--silent',
      '--show-error',
      '--max-time',
      String(timeout),
      '--config',
      '-',
      '--write-out',
      `${marker}%{http_code}`,
    ],
    {
      input: config,
      encoding: null,
      maxBuffer: 32 * 1024 * 1024,
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Feishu curl transport failed (${result.status})`)
  }
  const output = result.stdout
  const markerBuffer = Buffer.from(marker)
  const markerIndex = output.lastIndexOf(markerBuffer)
  assert.notEqual(markerIndex, -1, 'Feishu curl status marker missing')
  return {
    status: Number(output.subarray(markerIndex + markerBuffer.length).toString()),
    body: output.subarray(0, markerIndex),
  }
}

function freezeSourceDescriptors() {
  const sourceStatePath =
    process.env.T10_FEISHU_STATE_PATH ?? '/tmp/feishu_state.json'
  assert(fs.existsSync(sourceStatePath), 'Feishu source descriptor input is required')
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const sourceRows = JSON.parse(fs.readFileSync(sourceStatePath, 'utf8'))
  assert.equal(sourceRows.length, manifest.length)
  const rows = manifest.map((mountain, index) => {
    const source = sourceRows[index]
    assert.equal(
      source.name,
      mountain.name,
      `source descriptor order mismatch at ${mountain.effective_canonical_key}`
    )
    return {
      effective_canonical_key: mountain.effective_canonical_key,
      name: mountain.name,
      source_descriptor: source.src,
    }
  })
  const payload = {
    schema_version: 't10-selected-source-descriptors-v1',
    source_state_sha256: sha256File(sourceStatePath),
    source_manifest_sha256: sha256File(MANIFEST_PATH),
    rows,
  }
  assertNoSensitiveMaterial(payload)
  writeJsonAtomic(SOURCE_DESCRIPTOR_PATH, payload)
  return {
    rows: rows.length,
    sidecar_sha256: sha256File(SOURCE_DESCRIPTOR_PATH),
  }
}

function readSourceDescriptors() {
  assert(
    fs.existsSync(SOURCE_DESCRIPTOR_PATH),
    'freeze T10 selected source descriptors before downloading'
  )
  const payload = JSON.parse(fs.readFileSync(SOURCE_DESCRIPTOR_PATH, 'utf8'))
  assert.equal(payload.schema_version, 't10-selected-source-descriptors-v1')
  assert.equal(payload.source_manifest_sha256, T10_MANIFEST_SHA256)
  assert.equal(payload.rows.length, 359)
  return payload.rows.map((row) => ({
    effective_canonical_key: row.effective_canonical_key,
    name: row.name,
    src: row.source_descriptor,
  }))
}

function sourcePath(asset) {
  return path.join(
    SOURCE_ROOT,
    asset.effective_canonical_key,
    `${String(asset.order).padStart(2, '0')}.bin`
  )
}

function preparedPath(asset, mime) {
  return path.join(
    PREPARED_ROOT,
    asset.effective_canonical_key,
    `${String(asset.order).padStart(2, '0')}.${extensionForMime(mime)}`
  )
}

function safeProgress(asset, message) {
  process.stderr.write(
    `[${asset.effective_canonical_key}#${asset.order}] ${message}\n`
  )
}

export class FeishuMediaClient {
  constructor(appId, appSecret) {
    assert(appId, 'FEISHU_APP_ID is required')
    assert(appSecret, 'FEISHU_APP_SECRET is required')
    this.appId = appId
    this.appSecret = appSecret
    this.token = null
    this.expiresAt = 0
    this.transport = process.env.T10_FEISHU_TRANSPORT ?? 'fetch'
  }

  async refreshToken() {
    if (this.transport === 'curl') {
      const response = curlRequest({
        url: `${FEISHU_BASE}/auth/v3/tenant_access_token/internal`,
        method: 'POST',
        headers: ['content-type: application/json'],
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret,
        }),
        timeout: 20,
      })
      const payload = JSON.parse(response.body.toString('utf8'))
      assert.equal(response.status, 200, `Feishu token HTTP ${response.status}`)
      assert.equal(payload.code ?? 0, 0, `Feishu token error ${payload.code}`)
      assert.equal(typeof payload.tenant_access_token, 'string')
      this.token = payload.tenant_access_token
      this.expiresAt = Date.now() + Math.max(60, payload.expire ?? 7200) * 1000
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(
        `${FEISHU_BASE}/auth/v3/tenant_access_token/internal`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            app_id: this.appId,
            app_secret: this.appSecret,
          }),
          signal: controller.signal,
        }
      )
      const payload = await response.json()
      assert.equal(response.ok, true, `Feishu token HTTP ${response.status}`)
      assert.equal(payload.code ?? 0, 0, `Feishu token error ${payload.code}`)
      assert.equal(typeof payload.tenant_access_token, 'string')
      this.token = payload.tenant_access_token
      this.expiresAt = Date.now() + Math.max(60, payload.expire ?? 7200) * 1000
    } finally {
      clearTimeout(timer)
    }
  }

  async ensureToken() {
    if (!this.token || Date.now() >= this.expiresAt - 5 * 60_000) {
      await this.refreshToken()
    }
  }

  async download(asset) {
    let refreshedAfter401 = false
    let lastError = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.ensureToken()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60_000)
      let response
      try {
        if (this.transport === 'curl') {
          const curlResponse = curlRequest({
            url: `${FEISHU_BASE}/drive/v1/medias/${encodeURIComponent(asset.file_token)}/download`,
            headers: [`authorization: Bearer ${this.token}`],
            timeout: 60,
          })
          if (curlResponse.status === 200) return curlResponse.body
          if (curlResponse.status === 401 && !refreshedAfter401) {
            refreshedAfter401 = true
            await this.refreshToken()
            continue
          }
          if (curlResponse.status !== 429 && curlResponse.status < 500) {
            throw new Error(`Feishu media HTTP ${curlResponse.status}`)
          }
          lastError = new Error(
            `Feishu media transient HTTP ${curlResponse.status}`
          )
          if (attempt < 4) await sleep(retryDelayMs(null, attempt))
          continue
        }
        response = await fetch(
          `${FEISHU_BASE}/drive/v1/medias/${encodeURIComponent(asset.file_token)}/download`,
          {
            headers: { authorization: `Bearer ${this.token}` },
            signal: controller.signal,
          }
        )
        if (response.ok) return Buffer.from(await response.arrayBuffer())
        if (response.status === 401 && !refreshedAfter401) {
          refreshedAfter401 = true
          await this.refreshToken()
          continue
        }
        if (response.status !== 429 && response.status < 500) {
          throw new Error(`Feishu media HTTP ${response.status}`)
        }
        lastError = new Error(`Feishu media transient HTTP ${response.status}`)
      } catch (error) {
        lastError = error
      } finally {
        clearTimeout(timer)
      }
      if (attempt < 4) await sleep(retryDelayMs(response, attempt))
    }
    throw new Error(
      `Feishu download failed for ${asset.effective_canonical_key}#${asset.order}: ${lastError?.message ?? 'unknown error'}`
    )
  }
}

export async function verifyDecodable(buffer, expectedMime) {
  assert.equal(detectImageMime(buffer), expectedMime)
  const pipeline = sharp(buffer, { failOn: 'error' })
  const metadata = await pipeline.metadata()
  assert(Number.isInteger(metadata.width) && metadata.width > 0)
  assert(Number.isInteger(metadata.height) && metadata.height > 0)
  await pipeline.stats()
  return {
    width: metadata.width,
    height: metadata.height,
  }
}

export async function compressIfNeeded(buffer, sourceMime, sourceDimensions) {
  if (buffer.length <= T10_MAX_BYTES) {
    return {
      buffer,
      mime: sourceMime,
      dimensions: sourceDimensions,
      compression: {
        applied: false,
        quality: null,
      },
    }
  }

  for (let quality = 90; quality >= 80; quality -= 2) {
    const candidate = await sharp(buffer, { failOn: 'error' })
      .webp({ quality, effort: 6 })
      .toBuffer()
    const dimensions = await verifyDecodable(candidate, 'image/webp')
    assert.equal(dimensions.width, sourceDimensions.width)
    assert.equal(dimensions.height, sourceDimensions.height)
    if (candidate.length <= T10_COMPRESSION_TARGET_BYTES) {
      return {
        buffer: candidate,
        mime: 'image/webp',
        dimensions,
        compression: {
          applied: true,
          quality,
        },
      }
    }
  }
  throw new Error(
    `image remains above 8MiB without resizing (${buffer.length} bytes)`
  )
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

async function prepareAsset(client, asset) {
  const sourceFile = sourcePath(asset)
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true })
  let sourceBuffer
  if (fs.existsSync(sourceFile)) {
    sourceBuffer = fs.readFileSync(sourceFile)
    safeProgress(asset, 'source cache hit')
  } else {
    sourceBuffer = await client.download(asset)
    fs.writeFileSync(sourceFile, sourceBuffer)
    safeProgress(asset, `downloaded ${sourceBuffer.length} bytes`)
  }
  assert.equal(
    sourceBuffer.length,
    asset.manifest_declared_size,
    `Feishu byte size mismatch for ${asset.effective_canonical_key}#${asset.order}`
  )

  const sourceMime = detectImageMime(sourceBuffer)
  assert(sourceMime, `unsupported magic bytes for ${asset.effective_canonical_key}#${asset.order}`)
  const sourceDimensions = await verifyDecodable(sourceBuffer, sourceMime)
  const stored = await compressIfNeeded(
    sourceBuffer,
    sourceMime,
    sourceDimensions
  )
  const outputFile = preparedPath(asset, stored.mime)
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, stored.buffer)
  const storagePath = buildStoragePath(
    asset.effective_canonical_key,
    asset.order,
    asset.original_name,
    stored.mime
  )
  return {
    effective_canonical_key: asset.effective_canonical_key,
    mountain_name: asset.mountain_name,
    order: asset.order,
    field: asset.field,
    original_name: asset.original_name,
    source_type: asset.source_type,
    is_user_supplied: asset.is_user_supplied,
    is_illustrative: asset.is_illustrative,
    manifest_declared_size: asset.manifest_declared_size,
    original_mime: sourceMime,
    original_size_bytes: sourceBuffer.length,
    original_sha256: sha256(sourceBuffer),
    original_width: sourceDimensions.width,
    original_height: sourceDimensions.height,
    stored_mime: stored.mime,
    stored_size_bytes: stored.buffer.length,
    stored_sha256: sha256(stored.buffer),
    stored_width: stored.dimensions.width,
    stored_height: stored.dimensions.height,
    compression: stored.compression,
    storage_path: storagePath,
  }
}

export async function prepareT10Assets() {
  assert.equal(sha256File(MANIFEST_PATH), T10_MANIFEST_SHA256)
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const sourceRows = readSourceDescriptors()
  const validated = validatePhotoManifest(manifest, sourceRows)
  if (sourceRows.length) {
    const representativeAssets = validated.assets.filter(
      (asset) => asset.source_type === '地貌代表'
    )
    assert.equal(representativeAssets.length, 11)
    assert.equal(
      new Set(
        representativeAssets.map((asset) => asset.effective_canonical_key)
      ).size,
      10
    )
    assert.equal(
      representativeAssets.every((asset) => asset.is_illustrative),
      true
    )
    assert.equal(
      validated.assets
        .filter((asset) => !asset.is_user_supplied && asset.is_illustrative)
        .every((asset) => asset.source_type === '地貌代表'),
      true
    )
  }
  const client = new FeishuMediaClient(
    process.env.FEISHU_APP_ID,
    process.env.FEISHU_APP_SECRET
  )
  const rows = await mapConcurrent(validated.assets, 4, (asset) =>
    prepareAsset(client, asset)
  )
  rows.sort((a, b) =>
    a.effective_canonical_key.localeCompare(b.effective_canonical_key, 'en-US')
    || a.order - b.order
  )
  assert.equal(
    new Set(rows.map((row) => row.storage_path)).size,
    validated.assets.length
  )
  assert.equal(rows.every((row) => row.stored_size_bytes <= T10_MAX_BYTES), true)
  const credentialValues = [
    process.env.FEISHU_APP_ID,
    process.env.FEISHU_APP_SECRET,
    client.token,
  ]
  assertNoSensitiveMaterial(rows, credentialValues)
  writeJsonlAtomic(ASSET_SIDECAR_PATH, rows)
  const compressed = rows
    .filter((row) => row.compression.applied)
    .map((row) => ({
      effective_canonical_key: row.effective_canonical_key,
      order: row.order,
      original_size_bytes: row.original_size_bytes,
      stored_size_bytes: row.stored_size_bytes,
      original_sha256: row.original_sha256,
      stored_sha256: row.stored_sha256,
      quality: row.compression.quality,
    }))
  const summary = {
    schema_version: 't10-prepare-summary-v1',
    manifest_sha256: T10_MANIFEST_SHA256,
    source_descriptor_sha256: sha256File(SOURCE_DESCRIPTOR_PATH),
    ...validated.summary,
    compressed,
    asset_sidecar_sha256: sha256File(ASSET_SIDECAR_PATH),
  }
  assertNoSensitiveMaterial(summary, credentialValues)
  writeJsonAtomic(PREPARE_SUMMARY_PATH, summary)
  return summary
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const operation = process.argv[2] === '--freeze-source-descriptors'
    ? Promise.resolve(freezeSourceDescriptors())
    : prepareT10Assets()
  operation
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
