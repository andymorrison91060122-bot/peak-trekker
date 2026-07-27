import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertNoSensitiveMaterial,
  hasCompleteRecoveredAttribution,
  isCommerciallyIncompatibleLicense,
  licenseUrlForId,
  normalizeLicenseId,
  readJsonl,
  retryDelayMs,
  sha256,
  sleep,
  stableJson,
  writeJsonAtomic,
  writeJsonlAtomic,
} from './t10-photo-lib.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PHOTO_ROOT = path.join(REPO_ROOT, 'data/mountains/photos')
const ASSET_PATH = path.join(PHOTO_ROOT, 't10-photo-assets.jsonl')
const ATTRIBUTION_PATH = path.join(PHOTO_ROOT, 't10-image-attribution.jsonl')
const UNRESOLVED_PATH = path.join(
  PHOTO_ROOT,
  't10-attribution-unresolved.jsonl'
)
const SUMMARY_PATH = path.join(PHOTO_ROOT, 't10-attribution-summary.json')
const DEFAULT_SCRATCH_ROOT =
  '/private/tmp/claude-501/-Users-liuhongyuan-Desktop-peak-trekker--claude-worktrees-focused-chandrasekhar-097d5c/ef576c10-7f1c-47b5-acd7-6969aa3d4348/scratchpad'

function walkFiles(root) {
  const files = []
  if (!fs.existsSync(root)) return files
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const resolved = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(resolved)
      else files.push(resolved)
    }
  }
  return files
}

function candidateFileNames(candidate) {
  const names = new Set()
  if (candidate.file) names.add(candidate.file)
  if (candidate.cid) {
    for (const extension of ['jpg', 'jpeg', 'png', 'webp']) {
      names.add(`${candidate.cid}.${extension}`)
    }
  }
  return names
}

function candidateAttributionFingerprint(candidate) {
  return stableJson({
    src: candidate.src ?? null,
    title: candidate.title ?? null,
    full: candidate.full ?? null,
    thumb: candidate.thumb ?? null,
    page: candidate.page ?? null,
    author: candidate.author ?? null,
    license: candidate.license ?? null,
  })
}

export function uniqueCandidateAttributions(candidates) {
  return [
    ...new Map(
      candidates.map((candidate) => [
        candidateAttributionFingerprint(candidate),
        candidate,
      ])
    ).values(),
  ]
}

function loadCandidateMetadata(scratchRoot) {
  const manifestFiles = walkFiles(scratchRoot).filter((filePath) =>
    /manifest.*\.jsonl$/i.test(path.basename(filePath))
  )
  const hashIndex = new Map()
  const digestByPath = new Map()
  for (const manifestFile of manifestFiles) {
    const manifestRoot = path.dirname(manifestFile)
    for (const line of fs.readFileSync(manifestFile, 'utf8').trim().split('\n')) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      for (const candidate of row.candidates ?? []) {
        const candidatePaths = [...candidateFileNames(candidate)]
          .map((filename) => path.join(manifestRoot, row.key, filename))
          .filter((filePath) => fs.existsSync(filePath))
        if (!candidatePaths.length) continue
        const imageFile = candidatePaths[0]
        let digest = digestByPath.get(imageFile)
        if (!digest) {
          digest = sha256(fs.readFileSync(imageFile))
          digestByPath.set(imageFile, digest)
        }
        const entries = hashIndex.get(digest) ?? []
        entries.push({
          ...candidate,
          effective_canonical_key: row.key,
          mountain_name: row.name,
          manifest_file: path.relative(scratchRoot, manifestFile),
          matched_local_file: path.relative(scratchRoot, imageFile),
        })
        hashIndex.set(digest, entries)
      }
    }
  }
  return hashIndex
}

async function fetchWithRetry(
  url,
  options = {},
  { attempts = 2, timeoutMs = 10_000 } = {}
) {
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'user-agent': 'PeakTrekker-T10-Attribution/1.0',
          ...(options.headers ?? {}),
        },
        signal: controller.signal,
      })
      if (response.ok) return response
      if (response.status !== 429 && response.status < 500) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timer)
    }
    if (attempt < attempts - 1) await sleep(retryDelayMs(response, attempt))
  }
  throw lastError ?? new Error('network request failed')
}

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '').trim() || null
}

function commonsTitle(candidate) {
  if (String(candidate.title ?? '').startsWith('File:')) return candidate.title
  try {
    const url = new URL(candidate.full ?? candidate.thumb)
    const filename = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    return filename ? `File:${filename}` : null
  } catch {
    return null
  }
}

async function enrichCommons(candidate) {
  const title = commonsTitle(candidate)
  if (!title) return null
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    titles: title,
  })
  const response = await fetchWithRetry(
    `https://commons.wikimedia.org/w/api.php?${query}`
  )
  if (!response.ok) return null
  const payload = await response.json()
  const page = Object.values(payload.query?.pages ?? {})[0]
  const info = page?.imageinfo?.[0]
  if (!info) return null
  const ext = info.extmetadata ?? {}
  const licenseId = normalizeLicenseId(
    ext.LicenseShortName?.value ?? candidate.license
  )
  return {
    provider: 'wikimedia_commons',
    source_url: info.descriptionurl ?? candidate.full ?? candidate.thumb ?? null,
    author: stripHtml(ext.Artist?.value) ?? candidate.author ?? null,
    license_id: licenseId,
    license_url:
      ext.LicenseUrl?.value
      || licenseUrlForId(licenseId),
    attribution_text: stripHtml(ext.Credit?.value)
      || [candidate.author, ext.LicenseShortName?.value].filter(Boolean).join(' · ')
      || null,
    asset_urls: [
      info.url,
      candidate.full,
      candidate.thumb,
    ].filter(Boolean),
  }
}

function openverseId(candidate) {
  for (const value of [candidate.full, candidate.thumb]) {
    const match = String(value ?? '').match(
      /api\.openverse\.org\/v1\/images\/([a-f0-9-]+)/
    )
    if (match) return match[1]
  }
  return null
}

async function enrichOpenverse(candidate) {
  const id = openverseId(candidate)
  if (!id) return null
  const response = await fetchWithRetry(
    `https://api.openverse.org/v1/images/${id}/`
  )
  if (!response.ok) return null
  const payload = await response.json()
  const licenseId = normalizeLicenseId(
    [payload.license, payload.license_version].filter(Boolean).join(' ')
  )
  return {
    provider: 'openverse_flickr',
    source_url: payload.foreign_landing_url ?? candidate.page ?? null,
    author: payload.creator ?? candidate.author ?? null,
    license_id: licenseId,
    license_url: payload.license_url ?? licenseUrlForId(licenseId),
    attribution_text:
      [payload.creator ?? candidate.author, payload.license, payload.license_version]
        .filter(Boolean)
        .join(' · ')
      || null,
    asset_urls: [
      payload.url,
      payload.thumbnail,
      candidate.full,
      candidate.thumb,
    ].filter(Boolean),
  }
}

async function enrichCandidate(candidate) {
  if (candidate.src === 'openverse') return enrichOpenverse(candidate)
  if (candidate.src === 'pexels') {
    return {
      provider: 'pexels',
      source_url: candidate.page ?? candidate.full ?? null,
      author: candidate.author ?? null,
      license_id: 'pexels',
      license_url: licenseUrlForId('pexels'),
      attribution_text: candidate.author ? `${candidate.author} · Pexels` : null,
      asset_urls: [candidate.full, candidate.thumb].filter(Boolean),
    }
  }
  if (
    /wikimedia\.org|wikipedia\.org/i.test(
      `${candidate.full ?? ''} ${candidate.thumb ?? ''}`
    )
  ) {
    return enrichCommons(candidate)
  }
  return null
}

async function sourceBytesMatch(asset, attribution) {
  for (const url of attribution.asset_urls ?? []) {
    const response = await fetchWithRetry(
      url,
      {},
      { attempts: 1, timeoutMs: 10_000 }
    )
    if (!response.ok) continue
    const buffer = Buffer.from(await response.arrayBuffer())
    if (sha256(buffer) === asset.original_sha256) return true
  }
  return false
}

function durableAttribution(attribution) {
  const durable = { ...attribution }
  delete durable.asset_urls
  return durable
}

async function verifiedCandidateAttribution(asset, candidate) {
  const attribution = await enrichCandidate(candidate)
  if (!attribution?.license_id || !attribution.source_url) return null
  if (isCommerciallyIncompatibleLicense(attribution.license_id)) {
    throw new Error(
      `commercially incompatible license for ${asset.effective_canonical_key}#${asset.order}: ${attribution.license_id}`
    )
  }
  if (!hasCompleteRecoveredAttribution(attribution)) return null
  if (!await sourceBytesMatch(asset, attribution)) return null
  return durableAttribution(attribution)
}

async function requeryCommons(asset) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: asset.mountain_name,
    gsrnamespace: '6',
    gsrlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(asset.original_width),
  })
  const response = await fetchWithRetry(
    `https://commons.wikimedia.org/w/api.php?${params}`
  )
  if (!response.ok) return null
  const payload = await response.json()
  for (const page of Object.values(payload.query?.pages ?? {})) {
    const info = page.imageinfo?.[0]
    if (!info) continue
    const dimensionMatches =
      (info.width === asset.original_width
        && info.height === asset.original_height)
      || (info.thumbwidth === asset.original_width
        && info.thumbheight === asset.original_height)
    if (!dimensionMatches) continue
    for (const url of [info.url, info.thumburl].filter(Boolean)) {
      const candidateResponse = await fetchWithRetry(
        url,
        {},
        { attempts: 1, timeoutMs: 10_000 }
      )
      if (!candidateResponse.ok) continue
      const buffer = Buffer.from(await candidateResponse.arrayBuffer())
      if (sha256(buffer) !== asset.original_sha256) continue
      const ext = info.extmetadata ?? {}
      const licenseId = normalizeLicenseId(ext.LicenseShortName?.value)
      return {
        provider: 'wikimedia_commons',
        source_url: info.descriptionurl ?? url,
        author: stripHtml(ext.Artist?.value),
        license_id: licenseId,
        license_url: ext.LicenseUrl?.value || licenseUrlForId(licenseId),
        attribution_text:
          stripHtml(ext.Credit?.value)
          || [stripHtml(ext.Artist?.value), ext.LicenseShortName?.value]
            .filter(Boolean)
            .join(' · ')
          || null,
        recovery_method: 'commons_name_requery_exact_sha256',
      }
    }
  }
  return null
}

async function requeryOpenverse(asset) {
  const params = new URLSearchParams({
    q: asset.mountain_name,
    page_size: '20',
  })
  const response = await fetchWithRetry(
    `https://api.openverse.org/v1/images/?${params}`
  )
  if (!response.ok) return null
  const payload = await response.json()
  for (const result of payload.results ?? []) {
    if (
      result.width !== asset.original_width
      || result.height !== asset.original_height
    ) {
      continue
    }
    for (const url of [result.thumbnail, result.url].filter(Boolean)) {
      const candidateResponse = await fetchWithRetry(
        url,
        {},
        { attempts: 1, timeoutMs: 10_000 }
      )
      if (!candidateResponse.ok) continue
      const buffer = Buffer.from(await candidateResponse.arrayBuffer())
      if (sha256(buffer) !== asset.original_sha256) continue
      const licenseId = normalizeLicenseId(
        [result.license, result.license_version].filter(Boolean).join(' ')
      )
      return {
        provider: 'openverse_flickr',
        source_url: result.foreign_landing_url ?? url,
        author: result.creator ?? null,
        license_id: licenseId,
        license_url: result.license_url ?? licenseUrlForId(licenseId),
        attribution_text:
          [result.creator, result.license, result.license_version]
            .filter(Boolean)
            .join(' · ')
          || null,
        recovery_method: 'openverse_name_requery_exact_sha256',
      }
    }
  }
  return null
}

async function resolveAsset(asset, localIndex) {
  if (asset.is_user_supplied) {
    return {
      provider: 'user_supplied',
      source_url: null,
      author: null,
      license_id: 'user_owned',
      license_url: null,
      attribution_text: null,
      review_status: 'approved_by_user',
      recovery_method: 'user_decision',
    }
  }

  const localCandidates = uniqueCandidateAttributions(
    localIndex.get(asset.original_sha256) ?? []
  )
  const verifiedLocal = []
  let recoveryErrorCount = 0
  for (const candidate of localCandidates) {
    try {
      const attribution = await verifiedCandidateAttribution(asset, candidate)
      if (attribution) verifiedLocal.push(attribution)
    } catch (error) {
      if (/commercially incompatible license/.test(error.message ?? '')) {
        throw error
      }
      recoveryErrorCount += 1
    }
  }
  const uniqueVerified = [
    ...new Map(
      verifiedLocal.map((attribution) => [
        stableJson(attribution),
        attribution,
      ])
    ).values(),
  ]
  if (uniqueVerified.length === 1) {
    return {
      ...uniqueVerified[0],
      review_status: 'recovered_exact',
      recovery_method: 'source_asset_exact_sha256',
    }
  }

  let requery = null
  try {
    requery = asset.source_type === 'Flickr/CC'
      ? await requeryOpenverse(asset)
      : await requeryCommons(asset)
  } catch {
    recoveryErrorCount += 1
  }
  if (requery?.license_id && isCommerciallyIncompatibleLicense(requery.license_id)) {
    throw new Error(
      `commercially incompatible license for ${asset.effective_canonical_key}#${asset.order}: ${requery.license_id}`
    )
  }
  if (requery?.source_url && hasCompleteRecoveredAttribution(requery)) {
    return {
      ...requery,
      review_status: 'recovered_exact',
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
    recovery_method: 'exact_sha256_not_recovered',
    recovery_error_count: recoveryErrorCount,
  }
}

function attributionRow(asset, attribution) {
  return {
    effective_canonical_key: asset.effective_canonical_key,
    mountain_name: asset.mountain_name,
    order: asset.order,
    original_name: asset.original_name,
    source_type: asset.source_type,
    storage_path: asset.storage_path,
    file_sha256: asset.stored_sha256,
    original_file_sha256: asset.original_sha256,
    is_illustrative: asset.is_illustrative,
    ...attribution,
  }
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

export async function recoverAttribution() {
  const assets = readJsonl(ASSET_PATH)
  const scratchRoot =
    process.env.T10_CANDIDATE_SCRATCH_ROOT ?? DEFAULT_SCRATCH_ROOT
  const localIndex = loadCandidateMetadata(scratchRoot)
  const rows = await mapConcurrent(assets, 12, async (asset, index) => {
    process.stderr.write(
      `[attribution ${index + 1}/${assets.length}] ${asset.effective_canonical_key}#${asset.order}\n`
    )
    return attributionRow(asset, await resolveAsset(asset, localIndex))
  })
  assert.equal(rows.length, assets.length)
  assertNoSensitiveMaterial(rows)
  const incompatible = rows.filter((row) =>
    isCommerciallyIncompatibleLicense(row.license_id)
  )
  if (incompatible.length) {
    const summary = incompatible.map((row) => ({
      effective_canonical_key: row.effective_canonical_key,
      order: row.order,
      license_id: row.license_id,
      source_url: row.source_url,
    }))
    throw new Error(`commercially incompatible licenses: ${JSON.stringify(summary)}`)
  }
  const unresolved = rows.filter(
    (row) => row.review_status === 'unresolved_license_backtrace'
  )
  writeJsonlAtomic(ATTRIBUTION_PATH, rows)
  writeJsonlAtomic(UNRESOLVED_PATH, unresolved)
  const recovered = rows.filter((row) => row.review_status === 'recovered_exact')
  const candidateCount = rows.filter((row) => row.provider !== 'user_supplied').length
  const sourceTypeDistribution = Object.fromEntries(
    [...new Set(unresolved.map((row) => row.source_type))]
      .sort()
      .map((sourceType) => [
        sourceType,
        unresolved.filter((row) => row.source_type === sourceType).length,
      ])
  )
  const summary = {
    schema_version: 't10-attribution-summary-v1',
    images: rows.length,
    user_supplied: rows.filter((row) => row.provider === 'user_supplied').length,
    candidate_images: candidateCount,
    recovered_exact: recovered.length,
    unresolved: unresolved.length,
    recovered_candidate_rate:
      candidateCount === 0 ? 0 : recovered.length / candidateCount,
    unresolved_mountains:
      new Set(unresolved.map((row) => row.effective_canonical_key)).size,
    unresolved_source_type_distribution: sourceTypeDistribution,
  }
  writeJsonAtomic(SUMMARY_PATH, summary)
  return summary
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  recoverAttribution()
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
