import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertNoSensitiveMaterial,
  buildStoragePath,
  detectImageMime,
  hasCompleteRecoveredAttribution,
  ILLUSTRATIVE_REPRESENTATIVE_KEYS,
  isApprovedCommercialLicenseId,
  isCommerciallyIncompatibleLicense,
  normalizeLicenseId,
  sanitizeStorageBasename,
  sha256File,
  sourceTypeForField,
  T10_MANIFEST_SHA256,
  validatePhotoManifest,
} from '../scripts/mountains/t10-photo-lib.mjs'
import {
  uniqueCandidateAttributions,
} from '../scripts/mountains/t10-photo-attribution.mjs'
import {
  assertFrozenRollbackEvidence,
  assertInputBinding,
  assertStagePrerequisites,
  fetchWithBoundedRetry,
  isMissingPublicObjectResponse,
  verifyPublicObject,
} from '../scripts/mountains/t10-photo-ingest.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'data/mountains/photos/feishu-photo-manifest.json'
)

test('T10 manifest is frozen and reproduces the 359/519 baseline', () => {
  assert.equal(sha256File(MANIFEST_PATH), T10_MANIFEST_SHA256)
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const result = validatePhotoManifest(manifest)
  assert.deepEqual(result.summary, {
    mountains: 359,
    images: 519,
    single_image_mountains: 218,
    double_image_mountains: 122,
    triple_image_mountains: 19,
    user_supplied_mountains: 149,
    user_supplied_images: 200,
    representative_mountains: 10,
    representative_images: 11,
  })
  assert.equal(
    new Set(result.assets.map((asset) => asset.file_token)).size,
    519
  )
})

test('pending storage reconciliation accepts only Supabase object-not-found responses', async () => {
  assert.equal(
    await isMissingPublicObjectResponse(
      new Response(
        JSON.stringify({
          statusCode: '404',
          error: 'not_found',
          message: 'Object not found',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    ),
    true
  )
  assert.equal(
    await isMissingPublicObjectResponse(
      new Response(
        JSON.stringify({
          statusCode: '400',
          error: 'bad_request',
          message: 'Invalid path',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    ),
    false
  )
  assert.equal(
    await isMissingPublicObjectResponse(new Response('', { status: 404 })),
    true
  )
})

test('public object verification retries transient failures and checks bytes', async () => {
  const body = Buffer.from('verified-image-bytes')
  const asset = {
    storage_path: 'catalog/example/01-image.jpg',
    stored_sha256:
      '8c12d9ffecb303a3b0f8301e49bbe1e4c648fe1a2fcb2155473d304d9f43b017',
    stored_size_bytes: body.length,
    stored_mime: 'image/jpeg',
  }
  let attempts = 0
  const result = await verifyPublicObject(
    asset,
    'https://example.test/storage/object.jpg',
    {
      fetchImpl: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('temporary transport failure')
        if (attempts === 2) {
          return new Response('retry', {
            status: 503,
            headers: { 'retry-after': '0' },
          })
        }
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(body.length),
          },
        })
      },
      sleepImpl: async () => {},
    }
  )
  assert.equal(result, true)
  assert.equal(attempts, 3)
})

test('bounded public fetch does not retry non-transient client errors', async () => {
  let attempts = 0
  const response = await fetchWithBoundedRetry(
    'https://example.test/bad-request',
    {
      fetchImpl: async () => {
        attempts += 1
        return new Response('bad request', { status: 400 })
      },
      sleepImpl: async () => {},
    }
  )
  assert.equal(response.status, 400)
  assert.equal(attempts, 1)
})

test('source descriptors bind by manifest order, not duplicate mountain names', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const sourceRows = manifest.map((row) => ({
    effective_canonical_key: row.effective_canonical_key,
    name: row.name,
    src: row.images
      .map((image, index) => `${index + 1}·${row.effective_canonical_key}`)
      .join(' | '),
  }))
  const result = validatePhotoManifest(manifest, sourceRows)
  const duplicatedName = result.assets.filter(
    (asset) => asset.mountain_name === '大明山' && asset.order === 1
  )
  assert.equal(duplicatedName.length, 2)
  assert.notEqual(duplicatedName[0].source_type, duplicatedName[1].source_type)

  const swapped = [...sourceRows]
  swapped[0] = {
    ...swapped[0],
    name: 'wrong mountain',
  }
  assert.throws(
    () => validatePhotoManifest(manifest, swapped),
    /source descriptor identity mismatch/
  )
})

test('source type parser uses the selected candidate index', () => {
  const descriptor =
    '1·词条图 2693×2022 | 2·Flickr/CC 1024×768 | 5·地貌代表 8000×6000'
  assert.equal(sourceTypeForField(descriptor, '候选1'), '词条图')
  assert.equal(sourceTypeForField(descriptor, '候选2'), 'Flickr/CC')
  assert.equal(sourceTypeForField(descriptor, '候选5'), '地貌代表')
  assert.equal(sourceTypeForField(descriptor, '自备图'), 'user_supplied')
})

test('representative-image identity is pinned to the selected source rows', () => {
  assert.deepEqual(
    [...ILLUSTRATIVE_REPRESENTATIVE_KEYS].sort(),
    [
      'baima-jian',
      'baishan-zu',
      'baizhang-ling',
      'dabieshan-bodao-feng',
      'dahong-shan',
      'daming-shan-guangxi',
      'dushu-jian',
      'fenghuang-shan-guangdong',
      'gang-shan-liaoning',
      'huabo-shan',
    ]
  )
  assert.equal(
    ILLUSTRATIVE_REPRESENTATIVE_KEYS.has('daming-shan-zhejiang'),
    false
  )
})

test('storage path sanitization covers Unicode and filename edge cases', () => {
  assert.equal(sanitizeStorageBasename('黄山 主图.JPG'), '黄山-主图')
  assert.equal(sanitizeStorageBasename(''), 'image')
  assert.equal(sanitizeStorageBasename('README'), 'readme')
  assert.equal(sanitizeStorageBasename('peak.final.edit.jpeg'), 'peak-final-edit')
  assert.equal(sanitizeStorageBasename('  a?#% b.png  '), 'a-b')
  assert.equal(
    buildStoragePath('huangshan', 1, '黄山 主图.JPG', 'image/webp'),
    'catalog/huangshan/01-黄山-主图.webp'
  )
  assert.notEqual(
    buildStoragePath('huangshan', 1, 'same.jpg', 'image/jpeg'),
    buildStoragePath('huangshan', 2, 'same.jpg', 'image/jpeg')
  )
})

test('magic bytes identify only supported image types', () => {
  assert.equal(
    detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xdb])),
    'image/jpeg'
  )
  assert.equal(
    detectImageMime(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ),
    'image/png'
  )
  assert.equal(
    detectImageMime(Buffer.from('RIFF0000WEBP', 'ascii')),
    'image/webp'
  )
  assert.equal(detectImageMime(Buffer.from('not-an-image')), null)
})

test('license normalization rejects every commercial NC or ND variant', () => {
  assert.equal(normalizeLicenseId('CC BY-SA 4.0'), 'cc-by-sa-4.0')
  assert.equal(normalizeLicenseId('CC BY 2.0'), 'cc-by-2.0')
  assert.equal(normalizeLicenseId('CC0'), 'cc0')
  assert.equal(normalizeLicenseId('Public Domain Mark'), 'pdm')
  assert.equal(
    isCommerciallyIncompatibleLicense('attribution-noncommercial'),
    true
  )
  assert.equal(
    isCommerciallyIncompatibleLicense('attribution-no-derivatives'),
    true
  )
  for (const value of [
    'CC BY-NC 4.0',
    'CC BY-NC-SA 3.0',
    'CC BY-ND 2.0',
    'CC BY-NC-ND 4.0',
  ]) {
    assert.equal(
      isCommerciallyIncompatibleLicense(normalizeLicenseId(value)),
      true,
      value
    )
  }
})

test('only explicit commercial licenses with complete attribution are recoverable', () => {
  assert.equal(isApprovedCommercialLicenseId('cc-by-sa-4.0'), true)
  assert.equal(isApprovedCommercialLicenseId('copyrighted-free-use'), false)
  assert.equal(
    hasCompleteRecoveredAttribution({
      provider: 'wikimedia_commons',
      source_url: 'https://commons.wikimedia.org/wiki/File:Peak.jpg',
      author: 'Photographer',
      license_id: 'cc-by-sa-4.0',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution_text: 'Photographer · CC BY-SA 4.0',
    }),
    true
  )
  assert.equal(
    hasCompleteRecoveredAttribution({
      provider: 'wikimedia_commons',
      source_url: 'https://commons.wikimedia.org/wiki/File:Peak.jpg',
      author: null,
      license_id: 'cc-by-sa-4.0',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution_text: null,
    }),
    false
  )
})

test('conflicting candidate-manifest attribution is retained as ambiguous', () => {
  const common = {
    src: 'openverse',
    full: 'https://example.com/image.jpg',
    author: 'A',
    license: 'BY 2.0',
  }
  assert.equal(uniqueCandidateAttributions([common, { ...common }]).length, 1)
  assert.equal(
    uniqueCandidateAttributions([
      common,
      { ...common, author: 'B', license: 'BY-SA 2.0' },
    ]).length,
    2
  )
})

test('durable sidecars reject credential and authenticated-media material', () => {
  assert.doesNotThrow(() =>
    assertNoSensitiveMaterial({ storage_path: 'catalog/key/01-image.jpg' })
  )
  for (const value of [
    { file_token: 'masked' },
    { tenant_access_token: 'masked' },
    { app_secret: 'masked' },
    { authorization: 'masked' },
    { appSecret: 'masked' },
    { FEISHU_APP_SECRET: 'masked' },
    { value: 'https://open.feishu.cn/open-apis/drive/v1/medias/masked' },
  ]) {
    assert.throws(() => assertNoSensitiveMaterial(value), /sensitive material/)
  }
  assert.throws(
    () => assertNoSensitiveMaterial({ harmless: 'actual-secret' }, ['actual-secret']),
    /configured secret material/
  )
})

test('1 -> 20 -> all staging order is mechanically enforced', () => {
  const checkpoint = {
    stage_history: [],
    completed_keys: [],
    db_intents: {},
  }
  assert.doesNotThrow(() => assertStagePrerequisites('1', checkpoint))
  assert.throws(
    () => assertStagePrerequisites('20', checkpoint),
    /stage 1 must complete/
  )
  assert.throws(
    () => assertStagePrerequisites('all', checkpoint),
    /stage 1 must complete/
  )
  checkpoint.stage_history.push({
    stage: '1',
    target_count: 1,
    completed_total: 1,
  })
  checkpoint.completed_keys.push('key-01')
  checkpoint.db_intents['key-01'] = { status: 'applied' }
  assert.doesNotThrow(() => assertStagePrerequisites('20', checkpoint))
  assert.throws(
    () => assertStagePrerequisites('all', checkpoint),
    /stage 20 must complete/
  )
  checkpoint.stage_history.push({
    stage: '20',
    target_count: 20,
    completed_total: 20,
  })
  for (let index = 2; index <= 20; index += 1) {
    const key = `key-${String(index).padStart(2, '0')}`
    checkpoint.completed_keys.push(key)
    checkpoint.db_intents[key] = { status: 'applied' }
  }
  assert.doesNotThrow(() => assertStagePrerequisites('all', checkpoint))
  checkpoint.db_intents['key-20'].status = 'rolled_back'
  assert.throws(
    () => assertStagePrerequisites('all', checkpoint),
    /applied DB intents/
  )
})

test('snapshot/checkpoint hashes and write-ahead intents guard every side effect', () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/mountains/t10-photo-ingest.mjs'),
    'utf8'
  )
  for (const field of [
    'source_manifest_sha256',
    'source_descriptor_sha256',
    'asset_sidecar_sha256',
    'attribution_sidecar_sha256',
    'route_override_sha256',
  ]) {
    assert.match(source, new RegExp(field))
  }
  assert.equal(
    source.indexOf('setStorageIntent(asset')
      < source.indexOf('bucket.upload(asset.storage_path'),
    true
  )
  assert.doesNotMatch(source, /command === '--rollback-db'/)
  assert.doesNotMatch(source, /command === '--rollback-storage'/)
  assert.match(source, /if \(command === '--rollback'\) return rollbackAll\(\)/)
  assert.match(
    source,
    /restore DB snapshot before deleting Storage objects/
  )
  const rollbackSource = source.slice(
    source.indexOf('async function rollbackDatabase('),
    source.indexOf('async function verifyPublicAssets(')
  )
  assert.doesNotMatch(rollbackSource, /loadInputs\(/)
  assert.match(source, /storage_paths_download_verified/)
  assert.equal(
    source.indexOf('checkpoint.db_intents[key] =')
      < source.indexOf('const row = await updateMountain('),
    true
  )
  const binding = {
    source_manifest_sha256: 'a',
    source_descriptor_sha256: 'b',
    asset_sidecar_sha256: 'c',
    attribution_sidecar_sha256: 'd',
    route_override_sha256: 'e',
  }
  assert.doesNotThrow(() => assertInputBinding(binding, { ...binding }))
  for (const field of Object.keys(binding)) {
    assert.throws(
      () => assertInputBinding(
        binding,
        { ...binding, [field]: 'tampered' },
        field
      ),
      /sidecars changed/
    )
  }
})

test('rollback is bound to frozen snapshot/checkpoint, not current sidecars', () => {
  const frozenBinding = {
    source_manifest_sha256: 'old-manifest',
    source_descriptor_sha256: 'old-descriptors',
    asset_sidecar_sha256: 'old-assets',
    attribution_sidecar_sha256: 'old-attribution',
    route_override_sha256: 'old-routes',
  }
  const snapshot = {
    schema_version: 't10-db-image-snapshot-v1',
    input_binding: frozenBinding,
    rows: Array.from({ length: 359 }, (_, index) => ({
      effective_canonical_key: `key-${index}`,
    })),
    storage_objects: [],
  }
  const checkpoint = {
    schema_version: 't10-ingest-checkpoint-v1',
    input_binding: { ...frozenBinding },
    completed_keys: ['key-0'],
    created_storage_paths: ['catalog/key-0/01-image.jpg'],
    storage_intents: {
      'catalog/key-0/01-image.jpg': {
        existed_before: false,
      },
    },
    db_intents: {
      'key-0': { status: 'applied' },
    },
  }
  assert.doesNotThrow(() =>
    assertFrozenRollbackEvidence(snapshot, checkpoint)
  )
  assert.throws(
    () =>
      assertFrozenRollbackEvidence(snapshot, {
        ...checkpoint,
        input_binding: {
          ...frozenBinding,
          source_manifest_sha256: 'new-manifest',
        },
      }),
    /sidecars changed/
  )
})
