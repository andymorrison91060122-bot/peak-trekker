import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const T10_BASELINE_MANIFEST_SHA256 =
  '57fd2927eef49617963c56448df4511c631a9eabdaf0a40aee5e6309437aaf88'
export const T10_MANIFEST_SHA256 =
  '6dafe46780262cd404af0dee8e1c50a3e2fde50068f27c628273ccebc5e392ff'
export const T10_BUCKET = 'mountain-media'
export const T10_CACHE_CONTROL = '31536000'
export const T10_MAX_BYTES = 8 * 1024 * 1024
export const T10_COMPRESSION_TARGET_BYTES = T10_MAX_BYTES - 64 * 1024

export const ILLUSTRATIVE_REPRESENTATIVE_KEYS = new Set([
  'fenghuang-shan-guangdong',
  'dabieshan-bodao-feng',
  'daming-shan-guangxi',
  'dahong-shan',
  'gang-shan-liaoning',
  'dushu-jian',
  'baima-jian',
  'baizhang-ling',
  'baishan-zu',
  'huabo-shan',
])

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
})

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath))
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
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

export function writeJsonlAtomic(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  const body = rows.map((row) => stableJson(row)).join('\n')
  fs.writeFileSync(tempPath, body ? `${body}\n` : '')
  fs.renameSync(tempPath, filePath)
}

export function readJsonl(filePath) {
  const body = fs.readFileSync(filePath, 'utf8').trim()
  return body ? body.split('\n').map((line) => JSON.parse(line)) : []
}

export function detectImageMime(buffer) {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return 'image/png'
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export function extensionForMime(mime) {
  const extension = MIME_EXTENSIONS[mime]
  assert(extension, `unsupported image MIME: ${mime}`)
  return extension
}

export function sanitizeStorageBasename(filename) {
  const normalized = String(filename ?? '').normalize('NFKC').trim()
  const basename = normalized.replace(/\.[^.]*$/, '')
  const safe = basename
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return safe || 'image'
}

export function buildStoragePath(canonicalKey, order, originalName, mime) {
  assert.match(canonicalKey, /^[a-z0-9][a-z0-9-]*$/)
  assert(Number.isInteger(order) && order >= 1 && order <= 99)
  return [
    'catalog',
    canonicalKey,
    `${String(order).padStart(2, '0')}-${sanitizeStorageBasename(originalName)}.${extensionForMime(mime)}`,
  ].join('/')
}

function selectedCandidateIndex(field) {
  const match = String(field ?? '').match(/^候选(\d+)$/)
  return match ? Number(match[1]) : null
}

export function sourceTypeForField(sourceDescriptor, field) {
  const index = selectedCandidateIndex(field)
  if (!index) return field === '自备图' ? 'user_supplied' : 'unknown'
  const prefix = `${index}·`
  const segment = String(sourceDescriptor ?? '')
    .split('|')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
  return segment?.slice(prefix.length).trim().replace(/\s+\d+×\d+$/, '') || 'unknown'
}

export function validatePhotoManifest(manifest, sourceRows = []) {
  assert.equal(Array.isArray(manifest), true)
  assert.equal(manifest.length, 359)
  if (sourceRows.length) assert.equal(sourceRows.length, manifest.length)
  const sourceByKey = new Map(
    sourceRows.map((row) => [row.effective_canonical_key, row])
  )
  if (sourceRows.length) assert.equal(sourceByKey.size, manifest.length)
  const keys = new Set()
  const tokens = new Set()
  const assets = []
  const imageCounts = new Map()

  for (const mountain of manifest) {
    assert.match(mountain.effective_canonical_key, /^[a-z0-9][a-z0-9-]*$/)
    assert.equal(keys.has(mountain.effective_canonical_key), false)
    keys.add(mountain.effective_canonical_key)
    assert(mountain.images.length >= 1 && mountain.images.length <= 3)
    imageCounts.set(
      mountain.images.length,
      (imageCounts.get(mountain.images.length) ?? 0) + 1
    )
    const sourceRow = sourceByKey.get(mountain.effective_canonical_key)
    if (sourceRow) {
      assert.equal(
        sourceRow.name,
        mountain.name,
        `source descriptor identity mismatch at ${mountain.effective_canonical_key}`
      )
    }
    mountain.images.forEach((image, index) => {
      assert.equal(typeof image.file_token, 'string')
      assert.equal(image.file_token.length > 0, true)
      assert.equal(tokens.has(image.file_token), false)
      tokens.add(image.file_token)
      const isUserSupplied = image.field === '自备图'
      assets.push({
        effective_canonical_key: mountain.effective_canonical_key,
        mountain_name: mountain.name,
        order: index + 1,
        field: image.field,
        original_name: image.name,
        manifest_declared_size: image.size,
        file_token: image.file_token,
        source_type: sourceTypeForField(sourceRow?.src, image.field),
        is_user_supplied: isUserSupplied,
        is_illustrative:
          isUserSupplied
          || ILLUSTRATIVE_REPRESENTATIVE_KEYS.has(
            mountain.effective_canonical_key
          ),
      })
    })
  }

  const userSupplied = assets.filter((asset) => asset.is_user_supplied)
  const representative = assets.filter(
    (asset) =>
      !asset.is_user_supplied
      && ILLUSTRATIVE_REPRESENTATIVE_KEYS.has(asset.effective_canonical_key)
  )
  assert.equal(representative.length, 11)
  assert.equal(
    new Set(representative.map((asset) => asset.effective_canonical_key)).size,
    10
  )
  return {
    assets,
    summary: {
      mountains: manifest.length,
      images: assets.length,
      single_image_mountains: imageCounts.get(1),
      double_image_mountains: imageCounts.get(2),
      triple_image_mountains: imageCounts.get(3),
      user_supplied_mountains:
        new Set(
          userSupplied.map((asset) => asset.effective_canonical_key)
        ).size,
      user_supplied_images: userSupplied.length,
      representative_mountains: 10,
      representative_images: representative.length,
    },
  }
}

export function normalizeLicenseId(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (/public domain|pdm/.test(normalized)) return 'pdm'
  if (/cc0/.test(normalized)) return 'cc0'
  if (/pexels/.test(normalized)) return 'pexels'
  const version = normalized.match(/\b([1-4]\.[0-9])\b/)?.[1] ?? null
  const jurisdiction = normalized.match(/\b(jp|tw)\b/)?.[1] ?? null
  const suffix = [
    version,
    jurisdiction,
  ].filter(Boolean).map((part) => `-${part}`).join('')
  if (/by[- ]nc[- ]nd|cc[- ]by[- ]nc[- ]nd/.test(normalized)) return `cc-by-nc-nd${suffix}`
  if (/by[- ]nc[- ]sa|cc[- ]by[- ]nc[- ]sa/.test(normalized)) return `cc-by-nc-sa${suffix}`
  if (/by[- ]nc|cc[- ]by[- ]nc/.test(normalized)) return `cc-by-nc${suffix}`
  if (/by[- ]nd|cc[- ]by[- ]nd/.test(normalized)) return `cc-by-nd${suffix}`
  if (/by[- ]sa|cc[- ]by[- ]sa/.test(normalized)) return `cc-by-sa${suffix}`
  if (/(^|\s)by($|\s)|cc[- ]by/.test(normalized)) return `cc-by${suffix}`
  return normalized.replace(/\s+/g, '-')
}

export function licenseUrlForId(licenseId) {
  if (!licenseId) return null
  if (licenseId === 'pdm') {
    return 'https://creativecommons.org/publicdomain/mark/1.0/'
  }
  if (licenseId === 'cc0') {
    return 'https://creativecommons.org/publicdomain/zero/1.0/'
  }
  if (licenseId === 'pexels') return 'https://www.pexels.com/license/'
  const match = licenseId.match(
    /^cc-(by(?:-nc)?(?:-nd|-sa)?)-([1-4]\.[0-9])(?:-(jp|tw))?$/
  )
  return match
    ? `https://creativecommons.org/licenses/${match[1]}/${match[2]}/${match[3] ? `${match[3]}/` : ''}`
    : null
}

export function isCommerciallyIncompatibleLicense(licenseId) {
  if (typeof licenseId !== 'string') return false
  const normalized = licenseId.toLowerCase()
  return normalized.includes('-nc')
    || normalized.includes('-nd')
    || /non[- ]?commercial/.test(normalized)
    || /no[- ]?derivatives?/.test(normalized)
}

export function isApprovedCommercialLicenseId(licenseId) {
  return [
    'user_owned',
    'pdm',
    'cc0',
    'pexels',
  ].includes(licenseId)
    || /^cc-by(?:-sa)?-[1-4]\.[0-9](?:-(?:jp|tw))?$/.test(
      String(licenseId ?? '')
    )
}

export function hasCompleteRecoveredAttribution(attribution) {
  if (!isApprovedCommercialLicenseId(attribution.license_id)) return false
  if (attribution.license_id === 'user_owned') {
    return attribution.provider === 'user_supplied'
      && attribution.attribution_text === null
  }
  if (!attribution.source_url || !attribution.license_url) return false
  if (/^cc-by/.test(attribution.license_id)) {
    return Boolean(attribution.author && attribution.attribution_text)
  }
  return true
}

function normalizedSensitiveKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function assertNoSensitiveMaterial(value, secretValues = []) {
  const forbiddenKeys = new Set([
    'filetoken',
    'tenantaccesstoken',
    'appsecret',
    'authorization',
    'feishuappsecret',
    'supabaseservicerolekey',
  ])
  function visit(current) {
    if (Array.isArray(current)) {
      current.forEach(visit)
      return
    }
    if (!current || typeof current !== 'object') return
    for (const [key, nested] of Object.entries(current)) {
      assert.equal(
        forbiddenKeys.has(normalizedSensitiveKey(key)),
        false,
        `sensitive material found in key: ${key}`
      )
      visit(nested)
    }
  }
  visit(value)
  const serialized = JSON.stringify(value)
  for (const forbidden of [
    '/drive/v1/medias/',
    'bearer ',
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(forbidden),
      false,
      `sensitive material found: ${forbidden}`
    )
  }
  for (const secret of secretValues.filter(
    (candidate) => typeof candidate === 'string' && candidate.length >= 8
  )) {
    assert.equal(
      serialized.includes(secret),
      false,
      'configured secret material found'
    )
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function retryDelayMs(response, attempt) {
  const retryAfter = response?.headers?.get?.('retry-after')
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1000, 60_000)
  }
  return [1_000, 2_000, 4_000, 8_000][Math.min(attempt, 3)]
}
