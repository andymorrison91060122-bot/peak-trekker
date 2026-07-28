import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
  deriveExploreMountainThumbnailUrl,
  EXPLORE_THUMBNAIL_BUCKET,
  EXPLORE_THUMBNAIL_VERSION,
} from '../../src/lib/explore-thumbnail-runtime.js'

export { EXPLORE_THUMBNAIL_BUCKET, EXPLORE_THUMBNAIL_VERSION }
export const EXPLORE_THUMBNAIL_WIDTH = 960
export const EXPLORE_THUMBNAIL_HEIGHT = 520
export const EXPLORE_THUMBNAIL_QUALITY = 78
export const EXPLORE_THUMBNAIL_CACHE_CONTROL = '31536000'

const PUBLIC_STORAGE_PREFIX = '/storage/v1/object/public/'
const CANONICAL_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    )
  }
  return value
}

export function stableJson(value, indent = 0) {
  return JSON.stringify(stableValue(value), null, indent)
}

export function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, `${stableJson(value, 2)}\n`)
  fs.renameSync(tempPath, filePath)
}

function sanitizeThumbnailBasename(sourceBasename) {
  const withoutExtension = sourceBasename.replace(/\.[^.]+$/, '')
  const safe = withoutExtension
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  assert(safe, `source cover basename cannot produce a thumbnail name: ${sourceBasename}`)
  return safe
}

export function parseMountainCoverPublicUrl(
  publicUrl,
  { expectedBaseUrl, expectedCanonicalKey },
) {
  assert.match(expectedCanonicalKey, CANONICAL_KEY_PATTERN)
  const resolved = new URL(publicUrl)
  const expected = new URL(expectedBaseUrl)
  assert.equal(resolved.origin, expected.origin, `unexpected Storage origin: ${resolved.origin}`)
  assert.equal(resolved.search, '', `cover URL must not contain query parameters: ${publicUrl}`)
  assert.equal(resolved.hash, '', `cover URL must not contain a fragment: ${publicUrl}`)
  assert(
    resolved.pathname.startsWith(PUBLIC_STORAGE_PREFIX),
    `cover URL is not a public Storage URL: ${publicUrl}`,
  )

  const encodedStoragePath = resolved.pathname.slice(PUBLIC_STORAGE_PREFIX.length)
  const segments = encodedStoragePath.split('/').map((segment) => decodeURIComponent(segment))
  assert.equal(segments[0], EXPLORE_THUMBNAIL_BUCKET, `unexpected Storage bucket: ${segments[0]}`)
  const objectSegments = segments.slice(1)
  assert.equal(objectSegments.length, 3, `cover object path must have three segments: ${publicUrl}`)
  assert.equal(objectSegments[0], 'catalog', `cover object must live under catalog/: ${publicUrl}`)
  assert.equal(
    objectSegments[1],
    expectedCanonicalKey,
    `cover canonical path mismatch for ${expectedCanonicalKey}: ${publicUrl}`,
  )
  assert(
    objectSegments.every((segment) => segment && segment !== '.' && segment !== '..'),
    `unsafe cover object path: ${publicUrl}`,
  )
  const basename = objectSegments[2]
  assert(
    !basename.startsWith(`${EXPLORE_THUMBNAIL_VERSION}-`),
    `thumbnail URL cannot be used as a source cover: ${publicUrl}`,
  )

  return {
    bucket: EXPLORE_THUMBNAIL_BUCKET,
    objectPath: objectSegments.join('/'),
    basename,
  }
}

export function deriveExploreThumbnail(
  publicUrl,
  { expectedBaseUrl, expectedCanonicalKey },
) {
  const parsed = parseMountainCoverPublicUrl(publicUrl, {
    expectedBaseUrl,
    expectedCanonicalKey,
  })
  const targetBasename =
    `${EXPLORE_THUMBNAIL_VERSION}-${sanitizeThumbnailBasename(parsed.basename)}.webp`
  const thumbnailObjectPath = `catalog/${expectedCanonicalKey}/${targetBasename}`
  const base = new URL(expectedBaseUrl)
  const thumbnailPublicUrl =
    `${base.origin}${PUBLIC_STORAGE_PREFIX}${EXPLORE_THUMBNAIL_BUCKET}/${thumbnailObjectPath}`
  assert.equal(
    thumbnailPublicUrl,
    deriveExploreMountainThumbnailUrl(publicUrl, expectedBaseUrl),
    `generator/runtime thumbnail derivation drift for ${expectedCanonicalKey}`,
  )

  return {
    ...parsed,
    thumbnailObjectPath,
    thumbnailPublicUrl,
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeCheckpointRows(rows, label) {
  if (Array.isArray(rows)) return rows
  assert(rows && typeof rows === 'object', `${label} rows must be an object or array`)
  return Object.values(rows)
}

export function buildFinalCoverInventory({
  repoRoot,
  baselineRows,
  replacementCheckpointRows,
  syncCheckpointRows,
  expectedCount = 359,
  expectedBaseUrl,
}) {
  const photosRoot = repoRoot ? path.join(repoRoot, 'data/mountains/photos') : null
  const baseline = normalizeCheckpointRows(
    baselineRows
      ?? readJson(path.join(photosRoot, 't10-ingest-checkpoint.json')).rows_after,
    'baseline checkpoint',
  )
  const replacements = normalizeCheckpointRows(
    replacementCheckpointRows
      ?? readJson(
        path.join(photosRoot, 't10-replacement-20260728-checkpoint.json'),
      ).rows_after,
    'replacement checkpoint',
  )
  const sync = normalizeCheckpointRows(
    syncCheckpointRows
      ?? readJson(path.join(photosRoot, 't11-image-sync-checkpoint.json')).rows_after,
    'sync checkpoint',
  )

  const rowsByKey = new Map()
  for (const [layer, rows] of [
    ['baseline', baseline],
    ['replacement', replacements],
    ['sync', sync],
  ]) {
    assert(Array.isArray(rows), `${layer} rows must be an array`)
    const seenInLayer = new Set()
    for (const row of rows) {
      const key = row.effective_canonical_key
      assert.match(key, CANONICAL_KEY_PATTERN)
      assert(!seenInLayer.has(key), `duplicate ${layer} key: ${key}`)
      seenInLayer.add(key)
      if (layer !== 'baseline') {
        assert(rowsByKey.has(key), `${layer} key does not exist in the baseline: ${key}`)
      }
      rowsByKey.set(key, row)
    }
  }
  assert.equal(rowsByKey.size, expectedCount, `final cover inventory must contain ${expectedCount} keys`)

  return [...rowsByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, row]) => {
      assert.equal(typeof row.cover_image, 'string', `missing cover image for ${key}`)
      const derived = deriveExploreThumbnail(row.cover_image, {
        expectedBaseUrl,
        expectedCanonicalKey: key,
      })
      return {
        effective_canonical_key: key,
        source_url: row.cover_image,
        source_object_path: derived.objectPath,
        bucket: derived.bucket,
        thumbnail_object_path: derived.thumbnailObjectPath,
        thumbnail_public_url: derived.thumbnailPublicUrl,
      }
    })
}

export async function auditRuntimeThumbnailClosure(
  inventory,
  {
    expectedBaseUrl,
    fetcher = fetch,
    concurrency = 8,
  },
) {
  assert(Array.isArray(inventory), 'runtime thumbnail inventory must be an array')
  assert(Number.isInteger(concurrency) && concurrency > 0, 'concurrency must be positive')
  const results = new Array(inventory.length)
  let cursor = 0

  async function worker() {
    while (cursor < inventory.length) {
      const index = cursor
      cursor += 1
      const entry = inventory[index]
      const thumbnailUrl = deriveExploreMountainThumbnailUrl(
        entry.source_url,
        expectedBaseUrl,
      )
      assert(
        thumbnailUrl,
        `runtime thumbnail derivation failed for ${entry.effective_canonical_key}`,
      )
      const response = await fetcher(thumbnailUrl, entry)
      const contentType = response.headers.get('content-type')?.split(';')[0] ?? null
      const passed = response.status === 200 && contentType === 'image/webp'
      results[index] = {
        effective_canonical_key: entry.effective_canonical_key,
        source_url: entry.source_url,
        thumbnail_url: thumbnailUrl,
        http_status: response.status,
        content_type: contentType,
        passed,
      }
      if (response.body) await response.body.cancel().catch(() => {})
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(inventory.length, 1)) },
      () => worker(),
    ),
  )
  const failures = results.filter((result) => !result.passed)
  return {
    checked_count: results.length,
    passed_count: results.length - failures.length,
    failed_count: failures.length,
    failures,
    results,
  }
}

export async function verifyExistingThumbnail(buffer, expected, metadataReader) {
  assert.equal(sha256(buffer), expected.stored_sha256, 'thumbnail SHA mismatch')
  assert.equal(buffer.length, expected.stored_size_bytes, 'thumbnail byte length mismatch')
  const metadata = await metadataReader(buffer)
  assert.equal(metadata.format, 'webp', 'thumbnail MIME mismatch')
  assert.equal(
    `${metadata.width}x${metadata.height}`,
    `${expected.stored_width}x${expected.stored_height}`,
    'thumbnail dimensions mismatch',
  )
}

export async function isMissingPublicObjectResponse(response) {
  if (response.status === 404) return true
  if (response.status !== 400) return false
  const payload = await response.clone().json().catch(() => null)
  return (
    payload?.statusCode === '404'
    && payload?.error === 'not_found'
    && payload?.message === 'Object not found'
  )
}
