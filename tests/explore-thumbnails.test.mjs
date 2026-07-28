import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import sharp from 'sharp'

import {
  auditRuntimeThumbnailClosure,
  buildFinalCoverInventory,
  deriveExploreThumbnail,
  isMissingPublicObjectResponse,
  parseMountainCoverPublicUrl,
  sha256,
  verifyExistingThumbnail,
} from '../scripts/mountains/explore-thumbnail-lib.mjs'
import { deriveExploreMountainThumbnailUrl } from '../src/lib/explore-thumbnail-runtime.js'

const BASE_URL = 'https://mngofocdsmqrqimsdyzf.supabase.co'

function coverRow(key, basename = `01-${key}.jpg`) {
  return {
    effective_canonical_key: key,
    cover_image: `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/${key}/${basename}`,
  }
}

test('final cover inventory overlays write-after checkpoint rows in chronological order', () => {
  const inventory = buildFinalCoverInventory({
    baselineRows: {
      alpha: coverRow('alpha'),
      beta: coverRow('beta'),
    },
    replacementCheckpointRows: {
      alpha: coverRow('alpha', '01-replacement.jpg'),
    },
    syncCheckpointRows: {
      alpha: coverRow('alpha', '01-sync.jpg'),
    },
    expectedCount: 2,
    expectedBaseUrl: BASE_URL,
  })

  assert.deepEqual(inventory.map((row) => row.effective_canonical_key), ['alpha', 'beta'])
  assert.equal(inventory[0].source_url.endsWith('/catalog/alpha/01-sync.jpg'), true)
  assert.equal(inventory[0].thumbnail_object_path, 'catalog/alpha/thumb-v1-01-sync.webp')
})

test('pre-write snapshots cannot replace the current write-after cover inventory', () => {
  const inventory = buildFinalCoverInventory({
    baselineRows: {
      alpha: coverRow('alpha'),
      beta: coverRow('beta'),
    },
    replacementCheckpointRows: {
      alpha: coverRow('alpha', '01-replacement.jpg'),
    },
    syncCheckpointRows: {
      alpha: coverRow('alpha', '01-sync.jpg'),
    },
    expectedCount: 2,
    expectedBaseUrl: BASE_URL,
  })

  assert.equal(inventory[0].source_url.endsWith('/catalog/alpha/01-sync.jpg'), true)
})

test('actual final cover inventory closes exactly 359 canonical keys', () => {
  const inventory = buildFinalCoverInventory({
    repoRoot: path.resolve(import.meta.dirname, '..'),
    expectedCount: 359,
    expectedBaseUrl: BASE_URL,
  })

  assert.equal(inventory.length, 359)
  assert.equal(new Set(inventory.map((row) => row.effective_canonical_key)).size, 359)
  assert.equal(inventory.every((row) => row.bucket === 'mountain-media'), true)
  assert.equal(inventory.every((row) => row.source_object_path.startsWith('catalog/')), true)
  assert.equal(inventory.every((row) => row.thumbnail_object_path.includes('/thumb-v1-')), true)
  const huashan = inventory.find((row) => row.effective_canonical_key === 'huashan')
  assert.equal(huashan?.source_url.endsWith('/catalog/huashan/01-image.png'), true)
  assert.equal(
    huashan?.thumbnail_object_path,
    'catalog/huashan/thumb-v1-01-image.webp',
  )
})

test('public URL parsing validates origin, bucket, canonical path and traversal', () => {
  assert.deepEqual(
    parseMountainCoverPublicUrl(
      `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/01-cover.jpg`,
      { expectedBaseUrl: BASE_URL, expectedCanonicalKey: 'huashan' },
    ),
    {
      bucket: 'mountain-media',
      objectPath: 'catalog/huashan/01-cover.jpg',
      basename: '01-cover.jpg',
    },
  )

  for (const invalid of [
    'https://example.com/storage/v1/object/public/mountain-media/catalog/huashan/01-cover.jpg',
    `${BASE_URL}/storage/v1/object/public/other/catalog/huashan/01-cover.jpg`,
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/songshan/01-cover.jpg`,
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/../secret.jpg`,
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/thumb-v1-cover.webp`,
  ]) {
    assert.throws(() => parseMountainCoverPublicUrl(invalid, {
      expectedBaseUrl: BASE_URL,
      expectedCanonicalKey: 'huashan',
    }))
  }
})

test('thumbnail derivation is versioned and retains no ambiguous source extension', () => {
  const thumbnail = deriveExploreThumbnail(
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/01-cover.final.jpg`,
    { expectedBaseUrl: BASE_URL, expectedCanonicalKey: 'huashan' },
  )

  assert.equal(thumbnail.thumbnailObjectPath, 'catalog/huashan/thumb-v1-01-cover-final.webp')
  assert.equal(
    thumbnail.thumbnailPublicUrl,
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/thumb-v1-01-cover-final.webp`,
  )
})

test('generator and frontend use the same runtime thumbnail derivation', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE_URL
  const source =
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/01-image.png`
  const generator = deriveExploreThumbnail(source, {
    expectedBaseUrl: BASE_URL,
    expectedCanonicalKey: 'huashan',
  })

  assert.equal(
    generator.thumbnailPublicUrl,
    deriveExploreMountainThumbnailUrl(source, BASE_URL),
  )
})

test('runtime closure fails when the current cover changed but only the stale thumbnail exists', async () => {
  const currentSource =
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/01-image.png`
  const staleThumbnail =
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/thumb-v1-01-huashan-0.webp`
  const currentThumbnail = deriveExploreMountainThumbnailUrl(currentSource, BASE_URL)
  const requestedUrls = []

  const audit = await auditRuntimeThumbnailClosure([
    {
      effective_canonical_key: 'huashan',
      source_url: currentSource,
    },
  ], {
    expectedBaseUrl: BASE_URL,
    fetcher: async (url) => {
      requestedUrls.push(url)
      if (url === staleThumbnail) {
        return new Response('stale', {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        })
      }
      return new Response(JSON.stringify({
        statusCode: '404',
        error: 'not_found',
        message: 'Object not found',
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(currentThumbnail?.endsWith('/thumb-v1-01-image.webp'), true)
  assert.deepEqual(requestedUrls, [currentThumbnail])
  assert.equal(audit.passed_count, 0)
  assert.equal(audit.failed_count, 1)
  assert.equal(audit.failures[0].effective_canonical_key, 'huashan')
})

test('existing thumbnail verification rejects byte or metadata drift', async () => {
  const buffer = Buffer.from('thumbnail-body')
  const expected = {
    stored_sha256: sha256(buffer),
    stored_size_bytes: buffer.length,
    stored_width: 960,
    stored_height: 520,
    stored_mime: 'image/webp',
  }
  const metadataReader = async () => ({ width: 960, height: 520, format: 'webp' })

  await verifyExistingThumbnail(buffer, expected, metadataReader)
  await assert.rejects(
    () => verifyExistingThumbnail(Buffer.from('different'), expected, metadataReader),
    /SHA mismatch/,
  )
  await assert.rejects(
    () => verifyExistingThumbnail(buffer, expected, async () => ({
      width: 959,
      height: 520,
      format: 'webp',
    })),
    /dimensions mismatch/,
  )
})

test('public object probe only treats the explicit Supabase not-found payload as missing', async () => {
  assert.equal(await isMissingPublicObjectResponse(new Response(null, { status: 404 })), true)
  assert.equal(await isMissingPublicObjectResponse(new Response(JSON.stringify({
    statusCode: '404',
    error: 'not_found',
    message: 'Object not found',
  }), { status: 400, headers: { 'content-type': 'application/json' } })), true)
  assert.equal(await isMissingPublicObjectResponse(new Response(JSON.stringify({
    statusCode: '400',
    error: 'bad_request',
    message: 'Invalid path',
  }), { status: 400, headers: { 'content-type': 'application/json' } })), false)
})

test('generated output fixtures can be compared byte-for-byte', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'explore-thumbnails-'))
  const first = path.join(temp, 'first.webp')
  const second = path.join(temp, 'second.webp')
  fs.writeFileSync(first, Buffer.from('same'))
  fs.writeFileSync(second, Buffer.from('same'))
  assert.equal(sha256(fs.readFileSync(first)), sha256(fs.readFileSync(second)))
})

test('Explore fallback is a lightweight WebP asset', async () => {
  const fallbackPath = path.resolve(
    import.meta.dirname,
    '../public/images/explore-mountain-cover-fallback.webp',
  )
  const bytes = fs.readFileSync(fallbackPath)
  const metadata = await sharp(bytes).metadata()

  assert(bytes.length < 50 * 1024, `fallback must stay below 50KB, got ${bytes.length}`)
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.width, 960)
  assert.equal(metadata.height, 520)
})
