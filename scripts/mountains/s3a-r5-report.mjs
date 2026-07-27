import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

export const LEDGER_DIR = path.join(REPO_ROOT, 'data/mountains/ledger')
export const PHOTO_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'data/mountains/photos/feishu-photo-manifest.json'
)

export const FROZEN_SHA256 = {
  'effective_canonicals.jsonl': '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  'entity-semantics.jsonl': '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
  'effective-canonical-enrichment.jsonl': 'b3f43ef40e009c35ee1ca96aed9d55038afe4eb76a39b9c7bb37f2e4404cfee5',
}

const LEGACY_MOUNTAINS = [
  { id: '9d7abd84-3eac-4472-8ba5-4c4ee6bab226', name: '五台山', canonicalKey: 'wutaishan', altitude: 3061, province: '山西', provinceCode: 'SX', latitude: 39.0333, longitude: 113.5667, description: '佛教圣地，五峰耸立', difficulty: 'intermediate', minLicense: 'basic', coverImage: null, galleryImages: [] },
  { id: '216508c9-ffca-4164-8010-534d8650ee64', name: '华山', canonicalKey: 'huashan', altitude: 2154, province: '陕西', provinceCode: 'SN', latitude: 34.4869, longitude: 110.0877, description: '奇险天下第一山，险峻绝伦', difficulty: 'intermediate', minLicense: 'none', coverImage: null, galleryImages: [] },
  { id: 'f52bd0d3-2331-4404-b522-aaca38dff872', name: '峨眉山', canonicalKey: 'emeishan', altitude: 3099, province: '四川', provinceCode: 'SC', latitude: 29.5997, longitude: 103.3328, description: '佛教名山，云雾缭绕', difficulty: 'intermediate', minLicense: 'basic', coverImage: null, galleryImages: [] },
  { id: 'c3455346-3f62-4d4b-9ccc-ac83e9babdfc', name: '嵩山', canonicalKey: 'songshan', altitude: 1512, province: '河南', provinceCode: 'HA', latitude: 34.4847, longitude: 113.0556, description: '五岳中岳，少林圣地', difficulty: 'beginner', minLicense: 'none', coverImage: null, galleryImages: [] },
  { id: '44d40dcd-f1d0-47af-98bb-154505a72fa5', name: '张家界天门山', canonicalKey: 'zhangjiajie-tianmen-shan', altitude: 1518, province: '湖南', provinceCode: 'HN', latitude: 29.1311, longitude: 110.4776, description: '天门洞奇观，玻璃栈道', difficulty: 'beginner', minLicense: 'none', coverImage: null, galleryImages: [] },
  { id: '1c250ea9-7c86-4322-9f10-f17e72430f4c', name: '慕士塔格峰', canonicalKey: 'muztagata-feng', altitude: 7546, province: '新疆', provinceCode: 'XJ', latitude: 38.2769, longitude: 75.1136, description: '冰山之父，帕米尔高原雄峰', difficulty: 'expert', minLicense: 'advanced', coverImage: null, galleryImages: [] },
  { id: '4d1a818b-8038-49d1-a173-a58e8c76801c', name: '武当山', canonicalKey: 'wudangshan', altitude: 1612, province: '湖北', provinceCode: 'HB', latitude: 32.4003, longitude: 111.0044, description: '道教圣地，武当武术发源地', difficulty: 'beginner', minLicense: 'none', coverImage: null, galleryImages: [] },
  { id: '11e9d0e9-8355-41b4-bc15-0b7e99d43c96', name: '泰山', canonicalKey: 'taishan', altitude: 1545, province: '山东', provinceCode: 'SD', latitude: 36.2557, longitude: 117.1006, description: '五岳之首，中华文明的象征', difficulty: 'beginner', minLicense: 'none', coverImage: null, galleryImages: [] },
  { id: 'a470ba81-6504-4f7f-b76b-fa01919197f3', name: '玉龙雪山', canonicalKey: 'yulong-xueshan', altitude: 5596, province: '云南', provinceCode: 'YN', latitude: 27.1167, longitude: 100.2333, description: '丽江的守护神山，终年积雪', difficulty: 'advanced', minLicense: 'intermediate', coverImage: null, galleryImages: [] },
  { id: 'b733089f-cc28-43f1-a87a-d691f24134c8', name: '神农顶', canonicalKey: 'shennong-ding', altitude: 3105, province: '湖北', provinceCode: 'HB', latitude: 31.4431, longitude: 110.3275, description: '华中屋脊，神农架最高峰', difficulty: 'intermediate', minLicense: 'basic', coverImage: null, galleryImages: [] },
  { id: '9c8848e9-6e18-4883-b8da-475699c7c856', name: '雁荡山', canonicalKey: 'yandangshan-zhejiang', altitude: 1150, province: '浙江', provinceCode: 'ZJ', latitude: 28.3667, longitude: 121.0667, description: '东南第一山，奇峰异石', difficulty: 'beginner', minLicense: 'none', coverImage: null, galleryImages: [] },
  { id: '404add39-6b3f-4180-988e-4d67e09993b3', name: '黄山', canonicalKey: 'huangshan', altitude: 1864, province: '安徽', provinceCode: 'AH', latitude: 30.1301, longitude: 118.1553, description: '天下第一奇山，云海松石令人叹为观止', difficulty: 'beginner', minLicense: 'none', coverImage: null, galleryImages: [] },
]

const ILLUSTRATIVE_REPRESENTATIVE_KEYS = new Set([
  'fenghuang-shan',
  'dabieshan-bodao-feng',
  'daming-shan-zhejiang',
  'dahong-shan',
  'gang-shan',
  'dushu-jian',
  'baima-jian',
  'baizhang-ling',
  'baishan-zu',
  'huabo-shan',
])

function readJsonl(fileName) {
  return fs.readFileSync(path.join(LEDGER_DIR, fileName), 'utf8').trim().split(/\n/).map((line) => JSON.parse(line))
}

export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

export function roundAltitudeHalfUp(value) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric >= 0) return Math.floor(numeric + 0.5)
  return Math.ceil(numeric - 0.5)
}

export function buildRouteReference(length) {
  if (!length || !Array.isArray(length.routes)) return []
  return length.routes.map((route) => ({
    route_label: route.route_label ?? null,
    semantic: route.semantic ?? null,
    km: typeof route.km === 'number' ? route.km : null,
    aspect: route.aspect ?? null,
    source_candidate_keys: Array.isArray(route.source_candidate_keys) ? route.source_candidate_keys : [],
    source_raws: Array.isArray(route.source_raws) ? route.source_raws : [],
    correction: route.correction ?? null,
  }))
}

function distanceMeters(a, b) {
  const radius = 6371000
  const toRad = (degrees) => (degrees * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function loadPhotoManifest() {
  const records = Object.values(JSON.parse(fs.readFileSync(PHOTO_MANIFEST_PATH, 'utf8')))
  const byKey = new Map()
  for (const record of records) {
    byKey.set(record.effective_canonical_key, {
      selected: record.selected ?? [],
      images: (record.images ?? []).map((image, index) => ({
        order: index + 1,
        field: image.field,
        name: image.name,
        size: image.size,
        provider: image.field === '自备图' ? 'user_supplied' : 'candidate_backfill_required',
        license_id: image.field === '自备图' ? 'user_owned' : null,
        is_illustrative: image.field === '自备图' ? true : ILLUSTRATIVE_REPRESENTATIVE_KEYS.has(record.effective_canonical_key),
        review_status: image.field === '自备图' ? 'approved_by_user' : 'pending_license_backtrace',
      })),
    })
  }
  return byKey
}

function hasNeedsReviewClaim(enrichment) {
  return (enrichment.intro_added_claims ?? []).some((claim) => claim.basis === 'needs_review')
}

function buildSourcePayloadSha(canonical, semantics, enrichment) {
  return sha256Json({
    effective_canonical_key: canonical.effective_canonical_key,
    canonical,
    semantics,
    enrichment,
  })
}

export function buildS3aReports() {
  const canonicals = readJsonl('effective_canonicals.jsonl')
  const semanticsRows = readJsonl('entity-semantics.jsonl')
  const enrichmentRows = readJsonl('effective-canonical-enrichment.jsonl')
  const photoByKey = loadPhotoManifest()

  const byKey = {
    canonical: new Map(canonicals.map((row) => [row.effective_canonical_key, row])),
    semantics: new Map(semanticsRows.map((row) => [row.effective_canonical_key, row])),
    enrichment: new Map(enrichmentRows.map((row) => [row.effective_canonical_key, row])),
  }

  const frozenHashes = Object.fromEntries(
    Object.entries(FROZEN_SHA256).map(([fileName]) => [fileName, sha256File(path.join(LEDGER_DIR, fileName))])
  )

  const accessStatusDistribution = enrichmentRows.reduce((acc, row) => {
    acc[row.access_status] = (acc[row.access_status] ?? 0) + 1
    return acc
  }, {})

  const decimalAltitudeRows = enrichmentRows
    .filter((row) => Number.isFinite(row.altitude?.effective_m) && !Number.isInteger(row.altitude.effective_m))
    .map((row) => ({
      effective_canonical_key: row.effective_canonical_key,
      name: row.primary_name,
      altitude_m_exact: row.altitude.effective_m,
      altitude_integer: roundAltitudeHalfUp(row.altitude.effective_m),
      delta_m: Number((roundAltitudeHalfUp(row.altitude.effective_m) - row.altitude.effective_m).toFixed(1)),
    }))

  const p04IdentityDiff = LEGACY_MOUNTAINS.map((legacy) => {
    const canonical = byKey.canonical.get(legacy.canonicalKey)
    const semantics = byKey.semantics.get(legacy.canonicalKey)
    const enrichment = byKey.enrichment.get(legacy.canonicalKey)
    const photos = photoByKey.get(legacy.canonicalKey)
    const exactAltitude = enrichment?.altitude?.effective_m ?? null

    return {
      existing_id: legacy.id,
      effective_canonical_key: legacy.canonicalKey,
      field_diff: {
        name: { before: legacy.name, after: enrichment?.primary_name ?? canonical?.primary_name ?? null, classification: 'unchanged' },
        altitude: {
          before: legacy.altitude,
          after: roundAltitudeHalfUp(exactAltitude),
          exact_after: exactAltitude,
          classification: exactAltitude === legacy.altitude ? 'unchanged_or_exact_same' : 'precision_rounding',
        },
        province: { before: legacy.province, after: legacy.province, classification: 'unchanged' },
        province_code: { before: legacy.provinceCode, after: legacy.provinceCode, classification: 'unchanged' },
        latitude: { before: legacy.latitude, after: enrichment?.coordinate?.effective?.latitude ?? null, classification: 'pending_coordinate_policy' },
        longitude: { before: legacy.longitude, after: enrichment?.coordinate?.effective?.longitude ?? null, classification: 'pending_coordinate_policy' },
        description: { before: legacy.description, after: enrichment?.intro ?? null, classification: 'content_replacement' },
        difficulty: {
          before: legacy.difficulty,
          after: enrichment?.difficulty?.product_enum ?? null,
          classification: legacy.difficulty === enrichment?.difficulty?.product_enum ? 'unchanged' : 'requires_product_signoff',
        },
        min_license: {
          before: legacy.minLicense,
          after: enrichment?.min_license?.value ?? null,
          classification: legacy.minLicense === enrichment?.min_license?.value ? 'unchanged' : 'requires_product_signoff',
        },
        cover_image: {
          before: legacy.coverImage,
          after: photos?.images?.[0] ? `pending_public_url:${photos.images[0].name}` : null,
          classification: photos?.images?.[0] ? 'first_fill_pending_t10_storage_url' : 'missing',
        },
        gallery_images: {
          before: legacy.galleryImages,
          after: (photos?.images ?? []).slice(1).map((image) => `pending_public_url:${image.name}`),
          classification: photos?.images?.length ? 'first_fill_pending_t10_storage_url' : 'missing',
        },
      },
      review_persistence: {
        intro_has_needs_review_claim: hasNeedsReviewClaim(enrichment),
        semantic_review_status: semantics?.semantic_status ?? null,
        source_payload_sha256: buildSourcePayloadSha(canonical, semantics, enrichment),
      },
    }
  })

  const allowedCoordinateSourceClasses = new Set(['authority_reference', 'curated_canonical'])
  const coordinateBlocked = p04IdentityDiff.flatMap((row) => {
    const enrichment = byKey.enrichment.get(row.effective_canonical_key)
    const before = {
      latitude: row.field_diff.latitude.before,
      longitude: row.field_diff.longitude.before,
    }
    const after = {
      latitude: row.field_diff.latitude.after,
      longitude: row.field_diff.longitude.after,
    }
    const displacementM = Number(distanceMeters(before, after).toFixed(1))
    const changed = displacementM > 0.1
    const sourceClass = enrichment?.coordinate?.source_class ?? null
    const allowedBySourceClass = allowedCoordinateSourceClasses.has(sourceClass)
    const allowedByDistance = displacementM < 1000
    if (!changed || (allowedBySourceClass && allowedByDistance)) return []
    return [{
      effective_canonical_key: row.effective_canonical_key,
      name: row.field_diff.name.before,
      before,
      sidecar_effective: after,
      displacement_m: displacementM,
      source_class: sourceClass,
      blocked_reason: !allowedBySourceClass
        ? 'source_class_not_authority_or_curated'
        : 'displacement_not_under_1km',
    }]
  })

  const difficultyBlocked = p04IdentityDiff.flatMap((row) => {
    const diffChanged = row.field_diff.difficulty.before !== row.field_diff.difficulty.after
    const licenseChanged = row.field_diff.min_license.before !== row.field_diff.min_license.after
    if (!diffChanged && !licenseChanged) return []
    return [{
      effective_canonical_key: row.effective_canonical_key,
      name: row.field_diff.name.before,
      difficulty_before: row.field_diff.difficulty.before,
      difficulty_after: row.field_diff.difficulty.after,
      min_license_before: row.field_diff.min_license.before,
      min_license_after: row.field_diff.min_license.after,
      blocked_reason: 'difficulty_or_license_change_requires_product_signoff',
    }]
  })

  const introNeedsReview = enrichmentRows.filter(hasNeedsReviewClaim).map((row) => row.effective_canonical_key)
  const semanticNeedsReview = semanticsRows
    .filter((row) => row.semantic_status === 'needs_review')
    .map((row) => row.effective_canonical_key)

  return {
    generated_at: new Date().toISOString(),
    frozen_hashes: frozenHashes,
    frozen_hashes_match: Object.entries(FROZEN_SHA256).every(([fileName, expected]) => frozenHashes[fileName] === expected),
    access_status_distribution: accessStatusDistribution,
    access_status_distribution_expected: { open: 347, closed: 7, pilgrimage_only: 1, unknown: 4 },
    decimal_altitude_count: decimalAltitudeRows.length,
    decimal_altitudes: decimalAltitudeRows,
    p04_identity_diff: p04IdentityDiff,
    coordinate_blocked: coordinateBlocked,
    difficulty_blocked: difficultyBlocked,
    review_status_design: {
      columns: [
        'intro_has_needs_review_claim BOOLEAN',
        'intro_review_claims JSONB',
        'semantic_review_status TEXT',
        'source_payload_sha256 TEXT',
        'source_payload_hashes JSONB',
      ],
      intro_needs_review_count: introNeedsReview.length,
      intro_needs_review_keys: introNeedsReview,
      semantic_needs_review_count: semanticNeedsReview.length,
      semantic_needs_review_keys: semanticNeedsReview,
      t11_rule: 'T11 activation must treat intro_has_needs_review_claim=true or semantic_review_status=needs_review as not auto-ready.',
    },
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function writeMarkdown(filePath, report) {
  const lines = [
    '# S3-A R5 Import Prep Report',
    '',
    'No production writes, no migration apply, no true import.',
    '',
    `- frozen_hashes_match: ${report.frozen_hashes_match}`,
    `- access_status_distribution: ${JSON.stringify(report.access_status_distribution)}`,
    `- decimal_altitude_count: ${report.decimal_altitude_count}`,
    `- P0-4 exact identity rows: ${report.p04_identity_diff.length}`,
    `- coordinate blocked rows: ${report.coordinate_blocked.length}`,
    `- difficulty/license blocked rows: ${report.difficulty_blocked.length}`,
    `- intro needs_review rows: ${report.review_status_design.intro_needs_review_count}`,
    `- semantic needs_review rows: ${report.review_status_design.semantic_needs_review_count}`,
    '',
    '## Outputs',
    '',
    '- altitude-rounding-124.json',
    '- p0-4-12-row-field-diff.json',
    '- coordinate-difficulty-blocked.json',
    '- review-status-provenance-design.json',
    '',
    '## Notes',
    '',
    '- Image file_token values are intentionally excluded from all outputs.',
    '- cover_image/gallery_images use pending_public_url placeholders until the T10 storage dry-run maps files to public URLs.',
    '- Coordinate overwrite is blocked unless source_class is authority_reference or curated_canonical and displacement is under 1km with a reviewed reason.',
    '- Difficulty/min_license changes are blocked pending explicit product signoff.',
  ]
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`)
}

export function writeS3aReport(outputDir) {
  const report = buildS3aReports()
  writeJson(path.join(outputDir, 'altitude-rounding-124.json'), {
    count: report.decimal_altitude_count,
    rows: report.decimal_altitudes,
  })
  writeJson(path.join(outputDir, 'p0-4-12-row-field-diff.json'), {
    count: report.p04_identity_diff.length,
    rows: report.p04_identity_diff,
  })
  writeJson(path.join(outputDir, 'coordinate-difficulty-blocked.json'), {
    coordinate_blocked_count: report.coordinate_blocked.length,
    coordinate_blocked: report.coordinate_blocked,
    difficulty_blocked_count: report.difficulty_blocked.length,
    difficulty_blocked: report.difficulty_blocked,
  })
  writeJson(path.join(outputDir, 'review-status-provenance-design.json'), report.review_status_design)
  writeMarkdown(path.join(outputDir, 's3a-r5-summary.md'), report)
  return report
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isCli) {
  const outputDir = process.argv[2] ?? path.resolve('output/s3a-r5-import-prep')
  const report = writeS3aReport(outputDir)
  console.log(JSON.stringify({
    outputDir,
    frozen_hashes_match: report.frozen_hashes_match,
    access_status_distribution: report.access_status_distribution,
    decimal_altitude_count: report.decimal_altitude_count,
    p04_identity_diff_count: report.p04_identity_diff.length,
    coordinate_blocked_count: report.coordinate_blocked.length,
    difficulty_blocked_count: report.difficulty_blocked.length,
  }, null, 2))
}
