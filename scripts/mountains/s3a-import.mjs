import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildRouteReference, roundAltitudeHalfUp } from './s3a-r5-report.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DATA_ROOT = path.join(REPO_ROOT, 'data/mountains')
const LEDGER_ROOT = path.join(DATA_ROOT, 'ledger')
const T13_ROOT = path.join(DATA_ROOT, 'coordinate-fix')

const FROZEN_SHA256 = Object.freeze({
  effective_canonicals: '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  entity_semantics: '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
  effective_canonical_enrichment: 'b3f43ef40e009c35ee1ca96aed9d55038afe4eb76a39b9c7bb37f2e4404cfee5',
  t13_final_coordinate: 'eada39739bc96daeee2352df81b3eaac5896b424a27ea17e8bef507579b78375',
  photo_baseline_assets: '306d309e72630ef124a7e62863bb4c5e40fc4493dd9949d74ac1d0e166e496ae',
})

const DATA_PATHS = Object.freeze({
  effective_canonicals: path.join(LEDGER_ROOT, 'effective_canonicals.jsonl'),
  entity_semantics: path.join(LEDGER_ROOT, 'entity-semantics.jsonl'),
  effective_canonical_enrichment: path.join(
    LEDGER_ROOT,
    'effective-canonical-enrichment.jsonl'
  ),
  t13_final_coordinate: path.join(T13_ROOT, 't13-final-coordinate.jsonl'),
  t13_final_import_overrides: path.join(T13_ROOT, 't13-final-import-overrides.json'),
  photo_baseline_assets: path.join(
    DATA_ROOT,
    'photos/t10-photo-assets.jsonl'
  ),
  d10_route_note_overrides: path.join(DATA_ROOT, 'd10-route-note-overrides.json'),
  t11_altitude_overrides: path.join(DATA_ROOT, 't11-altitude-overrides.json'),
})

export const LEGACY_REUSE_BY_CANONICAL_KEY = Object.freeze({
  wutaishan: '9d7abd84-3eac-4472-8ba5-4c4ee6bab226',
  huashan: '216508c9-ffca-4164-8010-534d8650ee64',
  emeishan: 'f52bd0d3-2331-4404-b522-aaca38dff872',
  songshan: 'c3455346-3f62-4d4b-9ccc-ac83e9babdfc',
  'zhangjiajie-tianmen-shan': '44d40dcd-f1d0-47af-98bb-154505a72fa5',
  'muztagata-feng': '1c250ea9-7c86-4322-9f10-f17e72430f4c',
  'huanggang-shan': 'd5374798-ed2d-44b5-b338-b11cc8e207b7',
  wudangshan: '4d1a818b-8038-49d1-a173-a58e8c76801c',
  taishan: '11e9d0e9-8355-41b4-bc15-0b7e99d43c96',
  'yulong-xueshan': 'a470ba81-6504-4f7f-b76b-fa01919197f3',
  'shennong-ding': 'b733089f-cc28-43f1-a87a-d691f24134c8',
  kawagebo: '39da9919-3efd-4523-b5a2-2bf9ba6a9eaa',
  'gongga-shan': '67bf0560-1e07-457b-9afa-b113d8b99661',
  'yandangshan-zhejiang': '9c8848e9-6e18-4883-b8da-475699c7c856',
  huangshan: '404add39-6b3f-4180-988e-4d67e09993b3',
})

export const LEGACY_RETAINED = Object.freeze([
  {
    id: '5d3abbe4-7e4c-4a29-8257-ec8d6c2234b9',
    name: '四姑娘山',
    reason: 'legacy_mountain_group_not_a_single_canonical_summit',
    field_review_status: {
      identity: 'needs_review',
    },
  },
  {
    id: 'a82c819e-8f53-4a78-a58c-dd2242d87af2',
    name: '长白山天池',
    reason: 'legacy_lake_entity_not_the_canonical_summit',
    field_review_status: {
      identity: 'needs_review',
    },
  },
  {
    id: '674b2a19-344e-4052-9ebf-62f4e6faeea9',
    name: '莲花山',
    reason: 'legacy_identity_and_content_proven_false',
    field_review_status: {
      identity: 'blocked',
      altitude: 'needs_review',
      latitude: 'needs_review',
      longitude: 'needs_review',
      description: 'needs_review',
    },
  },
])

const LEGACY_COORDINATE_SNAPSHOTS = Object.freeze({
  '9d7abd84-3eac-4472-8ba5-4c4ee6bab226': [39.0333, 113.5667],
  '216508c9-ffca-4164-8010-534d8650ee64': [34.4869, 110.0877],
  '5d3abbe4-7e4c-4a29-8257-ec8d6c2234b9': [31.05, 102.9833],
  'f52bd0d3-2331-4404-b522-aaca38dff872': [29.5997, 103.3328],
  'c3455346-3f62-4d4b-9ccc-ac83e9babdfc': [34.4847, 113.0556],
  '44d40dcd-f1d0-47af-98bb-154505a72fa5': [29.1311, 110.4776],
  '1c250ea9-7c86-4322-9f10-f17e72430f4c': [38.2769, 75.1136],
  '39da9919-3efd-4523-b5a2-2bf9ba6a9eaa': [28.4333, 98.6167],
  'd5374798-ed2d-44b5-b338-b11cc8e207b7': [27.7269, 118.0369],
  '4d1a818b-8038-49d1-a173-a58e8c76801c': [32.4003, 111.0044],
  '11e9d0e9-8355-41b4-bc15-0b7e99d43c96': [36.2557, 117.1006],
  'a470ba81-6504-4f7f-b76b-fa01919197f3': [27.1167, 100.2333],
  'b733089f-cc28-43f1-a87a-d691f24134c8': [31.4431, 110.3275],
  '674b2a19-344e-4052-9ebf-62f4e6faeea9': [23.5833, 113.9333],
  '67bf0560-1e07-457b-9afa-b113d8b99661': [29.5942, 101.8764],
  'a82c819e-8f53-4a78-a58c-dd2242d87af2': [42.0069, 128.0644],
  '9c8848e9-6e18-4883-b8da-475699c7c856': [28.3667, 121.0667],
  '404add39-6b3f-4180-988e-4d67e09993b3': [30.1301, 118.1553],
})

const PROVINCE_MAP = Object.freeze({
  北京市: ['北京', 'BJ'],
  天津市: ['天津', 'TJ'],
  河北省: ['河北', 'HE'],
  山西省: ['山西', 'SX'],
  内蒙古自治区: ['内蒙古', 'NM'],
  辽宁省: ['辽宁', 'LN'],
  吉林省: ['吉林', 'JL'],
  黑龙江省: ['黑龙江', 'HL'],
  上海市: ['上海', 'SH'],
  江苏省: ['江苏', 'JS'],
  浙江省: ['浙江', 'ZJ'],
  安徽省: ['安徽', 'AH'],
  福建省: ['福建', 'FJ'],
  江西省: ['江西', 'JX'],
  山东省: ['山东', 'SD'],
  河南省: ['河南', 'HA'],
  湖北省: ['湖北', 'HB'],
  湖南省: ['湖南', 'HN'],
  广东省: ['广东', 'GD'],
  广西壮族自治区: ['广西', 'GX'],
  海南省: ['海南', 'HI'],
  重庆市: ['重庆', 'CQ'],
  四川省: ['四川', 'SC'],
  贵州省: ['贵州', 'GZ'],
  云南省: ['云南', 'YN'],
  西藏自治区: ['西藏', 'XZ'],
  陕西省: ['陕西', 'SN'],
  甘肃省: ['甘肃', 'GS'],
  青海省: ['青海', 'QH'],
  宁夏回族自治区: ['宁夏', 'NX'],
  新疆维吾尔自治区: ['新疆', 'XJ'],
})

const ILLUSTRATIVE_REPRESENTATIVE_KEYS = new Set([
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split(/\n/).map((line) => JSON.parse(line))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath))
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    )
  }
  return value
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function payloadSha(value) {
  return sha256(stableJson(value))
}

function deterministicMountainId(canonicalKey) {
  const bytes = crypto
    .createHash('sha256')
    .update(`peak-trekker:s3a:mountain:${canonicalKey}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function normalizeProvince(fullName) {
  const mapping = PROVINCE_MAP[fullName]
  assert(mapping, `missing province mapping for ${fullName}`)
  return {
    full_name: fullName,
    display_name: mapping[0],
    code: mapping[1],
  }
}

function sanitizePhotoManifest(record) {
  const images = (record?.images ?? []).map((image, index) => {
    const userSupplied = image.field === '自备图'
    return {
      order: index + 1,
      filename: image.name,
      provider: userSupplied ? 'user_supplied' : 'candidate_backfill_required',
      source_url: null,
      author: null,
      license_id: userSupplied ? 'user_owned' : null,
      license_url: null,
      attribution_text: null,
      is_illustrative: userSupplied
        || ILLUSTRATIVE_REPRESENTATIVE_KEYS.has(record.effective_canonical_key),
      review_status: userSupplied ? 'approved_by_user' : 'pending_license_backtrace',
      file_sha256: null,
    }
  })
  return {
    images,
    is_illustrative: images.some((image) => image.is_illustrative),
  }
}

function semanticReviewStatus(value) {
  if (value === 'confirmed') return 'approved'
  if (value === 'needs_review') return 'needs_review'
  return 'unknown'
}

function buildCoordinateFields(t13, enrichment) {
  const accepted = Number.isFinite(t13.latitude) && Number.isFinite(t13.longitude)
  const fallback = enrichment.coordinate?.effective
  const latitude = accepted ? t13.latitude : fallback?.latitude
  const longitude = accepted ? t13.longitude : fallback?.longitude
  assert(Number.isFinite(latitude), `missing import latitude for ${t13.effective_canonical_key}`)
  assert(Number.isFinite(longitude), `missing import longitude for ${t13.effective_canonical_key}`)

  return {
    latitude,
    longitude,
    coordinate_kind: accepted ? t13.coordinate_kind : 'seed',
    coordinate_precision_decimals:
      t13.precision_decimals ?? t13.seed_precision_decimals ?? null,
    coordinate_status: t13.status,
    coordinate_source: accepted ? t13.primary_source : 'frozen_seed',
    coordinate_source_url: accepted ? t13.source_link : null,
    coordinate_provenance: {
      datum: 'WGS-84',
      coordinate_kind: accepted ? t13.coordinate_kind : 'seed',
      status: t13.status,
      source_count: accepted ? t13.source_count : 0,
      primary_source: accepted ? t13.primary_source : 'frozen_seed',
      source_link: accepted ? t13.source_link : null,
      source_ids: accepted
        ? (t13.sources ?? []).map((source) => ({
            provider: source.provider ?? null,
            source_id: source.source_id ?? null,
            source_link: source.source_link ?? null,
          }))
        : [],
      original_displacement_km: t13.original_displacement_km,
      radius_bucket: t13.radius_bucket,
      unresolved_reasons: t13.unresolved_reasons ?? [],
    },
    summit_radius_m: t13.summit_radius_m,
  }
}

function buildFieldReviewStatus(enrichment, semantics, t13, altitudeOverride) {
  const status = {
    altitude: enrichment.altitude?.status ?? 'unknown',
    coordinate: t13.status,
    intro: (enrichment.intro_added_claims ?? []).some((claim) => claim.basis === 'needs_review')
      ? 'needs_review'
      : 'approved',
    semantics: semanticReviewStatus(semantics.semantic_status),
  }
  if (altitudeOverride) {
    status.altitude = 'approved'
    status.altitude_resolution = {
      provenance_label: altitudeOverride.provenance_label,
      source_url: altitudeOverride.source_url,
      resolution: altitudeOverride.resolution,
      conflict_values_m: altitudeOverride.conflict_values_m,
    }
  }
  return status
}

function buildRow({
  canonical,
  semantics,
  enrichment,
  t13,
  photo,
  altitudeOverride,
  routeNoteOverride,
}) {
  const key = canonical.effective_canonical_key
  const provinces = canonical.provinces.map(normalizeProvince)
  assert(provinces.length > 0, `missing province for ${key}`)
  const photoFields = sanitizePhotoManifest(photo)
  const exactAltitude = altitudeOverride?.altitude_m_exact
    ?? enrichment.altitude?.effective_m
    ?? null
  const altitude = altitudeOverride?.altitude_display_m
    ?? roundAltitudeHalfUp(exactAltitude)
  const coordinate = buildCoordinateFields(t13, enrichment)
  const sourcePayloadHashes = {
    canonical: payloadSha(canonical),
    semantics: payloadSha(semantics),
    enrichment: payloadSha(enrichment),
    t13_coordinate: payloadSha(t13),
  }
  const sourcePayloadSha = payloadSha({
    effective_canonical_key: key,
    ...sourcePayloadHashes,
  })

  return {
    id: LEGACY_REUSE_BY_CANONICAL_KEY[key] ?? deterministicMountainId(key),
    effective_canonical_key: key,
    name: enrichment.primary_name ?? canonical.primary_name,
    altitude,
    altitude_m_exact: exactAltitude,
    province: provinces[0].display_name,
    province_code: provinces[0].code,
    provinces: provinces.map((province) => province.full_name),
    province_codes: provinces.map((province) => province.code),
    difficulty: enrichment.difficulty?.product_enum ?? null,
    min_license: enrichment.min_license?.value ?? null,
    ...coordinate,
    description: enrichment.intro ?? null,
    cover_image: null,
    gallery_images: [],
    route_preview_image: null,
    checkin_count: 0,
    is_active: false,
    is_readable: false,
    weather_priority_tier: 'C',
    weather_enabled: true,
    weather_zone_id: null,
    length_km: enrichment.length?.length_km ?? null,
    estimated_duration_minutes: enrichment.estimated_duration_min ?? null,
    route_reference: buildRouteReference(enrichment.length),
    access_status: enrichment.access_status,
    closed_basis: enrichment.closed_basis ?? null,
    access_source: enrichment.access_source ?? null,
    access_note: enrichment.access_note ?? null,
    risk_note: enrichment.risk_note ?? null,
    route_note: routeNoteOverride ?? enrichment.route_note ?? null,
    image_is_illustrative: photoFields.is_illustrative,
    image_license_manifest: photoFields.images,
    quality_tier: null,
    intro_has_needs_review_claim: (enrichment.intro_added_claims ?? [])
      .some((claim) => claim.basis === 'needs_review'),
    intro_review_claims: enrichment.intro_added_claims ?? [],
    semantic_review_status: semanticReviewStatus(semantics.semantic_status),
    source_payload_sha256: sourcePayloadSha,
    source_payload_hashes: sourcePayloadHashes,
    field_review_status: buildFieldReviewStatus(
      enrichment,
      semantics,
      t13,
      altitudeOverride
    ),
  }
}

function countBy(rows, selector) {
  return rows.reduce((counts, row) => {
    const key = selector(row)
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function assertFrozenInputs() {
  for (const [name, expected] of Object.entries(FROZEN_SHA256)) {
    const actual = sha256File(DATA_PATHS[name])
    assert.equal(actual, expected, `frozen SHA mismatch for ${name}`)
  }
}

export function buildImportPlan() {
  assertFrozenInputs()

  const canonicals = readJsonl(DATA_PATHS.effective_canonicals)
  const semantics = readJsonl(DATA_PATHS.entity_semantics)
  const enrichment = readJsonl(DATA_PATHS.effective_canonical_enrichment)
  const t13 = readJsonl(DATA_PATHS.t13_final_coordinate)
  const importOverrides = readJson(DATA_PATHS.t13_final_import_overrides)
  const photoAssets = readJsonl(DATA_PATHS.photo_baseline_assets)
  const routeNoteOverrides = readJson(DATA_PATHS.d10_route_note_overrides)
  const t11AltitudeOverrides = readJson(DATA_PATHS.t11_altitude_overrides)

  const mapByKey = (rows) => new Map(
    rows.map((row) => [row.effective_canonical_key, row])
  )
  const semanticsByKey = mapByKey(semantics)
  const enrichmentByKey = mapByKey(enrichment)
  const t13ByKey = mapByKey(t13)
  const photoByKey = new Map()
  for (const asset of photoAssets) {
    const row = photoByKey.get(asset.effective_canonical_key) ?? {
      effective_canonical_key: asset.effective_canonical_key,
      images: [],
    }
    row.images.push({
      field: asset.field,
      name: asset.original_name,
      order: asset.order,
    })
    photoByKey.set(asset.effective_canonical_key, row)
  }
  for (const row of photoByKey.values()) {
    row.images.sort((left, right) => left.order - right.order)
  }
  assert.equal(routeNoteOverrides.schema_version, 'd10-route-note-overrides-v1')
  assert.equal(routeNoteOverrides.rows.length, 9)
  const routeNoteOverrideByKey = mapByKey(routeNoteOverrides.rows)
  assert.equal(routeNoteOverrideByKey.size, 9)
  assert.equal(
    t11AltitudeOverrides.schema_version,
    't11-altitude-overrides-v1'
  )
  assert.equal(t11AltitudeOverrides.rows.length, 5)
  const altitudeOverrideRows = [
    ...importOverrides.field_overrides
      .filter((row) => row.field === 'altitude')
      .map((row) => ({
        ...row,
        provenance_label: 'T13 approved import override',
        source_url: null,
        resolution: row.reason ?? 'approved_import_override',
        conflict_values_m: [],
      })),
    ...t11AltitudeOverrides.rows,
  ]
  const altitudeOverrideByKey = new Map(
    altitudeOverrideRows.map((row) => [row.effective_canonical_key, row])
  )

  assert.equal(canonicals.length, 359)
  assert.equal(semanticsByKey.size, 359)
  assert.equal(enrichmentByKey.size, 359)
  assert.equal(t13ByKey.size, 359)
  assert.equal(photoByKey.size, 359)

  const rows = [...canonicals]
    .sort((a, b) => a.effective_canonical_key.localeCompare(
      b.effective_canonical_key,
      'en-US'
    ))
    .map((canonical) => {
      const key = canonical.effective_canonical_key
      const semanticsRow = semanticsByKey.get(key)
      const enrichmentRow = enrichmentByKey.get(key)
      const t13Row = t13ByKey.get(key)
      const photo = photoByKey.get(key)
      assert(semanticsRow, `missing semantics for ${key}`)
      assert(enrichmentRow, `missing enrichment for ${key}`)
      assert(t13Row, `missing T13 coordinate for ${key}`)
      assert(photo, `missing photo manifest for ${key}`)
      if (routeNoteOverrideByKey.has(key)) {
        assert.equal(enrichmentRow.route_note, null, `D10 source route_note must be null for ${key}`)
      }
      return buildRow({
        canonical,
        semantics: semanticsRow,
        enrichment: enrichmentRow,
        t13: t13Row,
        photo,
        altitudeOverride: altitudeOverrideByKey.get(key),
        routeNoteOverride: routeNoteOverrideByKey.get(key)?.route_note,
      })
    })

  const reusedLegacyRows = rows.filter(
    (row) => LEGACY_REUSE_BY_CANONICAL_KEY[row.effective_canonical_key]
  )
  const deterministicRows = rows.filter(
    (row) => !LEGACY_REUSE_BY_CANONICAL_KEY[row.effective_canonical_key]
  )
  const accessStatusDistribution = countBy(rows, (row) => row.access_status)
  const radiusBucketCounts = countBy(t13, (row) => row.radius_bucket)

  assert.equal(reusedLegacyRows.length, 15)
  assert.equal(deterministicRows.length, 344)
  assert.equal(new Set(rows.map((row) => row.id)).size, 359)
  assert.deepEqual(accessStatusDistribution, {
    open: 347,
    pilgrimage_only: 1,
    unknown: 4,
    closed: 7,
  })
  assert.deepEqual(radiusBucketCounts, {
    summit_4dp_or_more: 160,
    area: 67,
    seed_3dp_or_more: 7,
    seed_2dp: 26,
    seed_1dp: 82,
    seed_0dp_inactive: 17,
  })
  assert.equal(rows.every((row) => row.is_active === false), true)
  assert.equal(rows.every((row) => row.is_readable === false), true)
  assert.equal(rows.filter((row) => row.summit_radius_m === null).length, 17)
  assert.equal(rows.filter((row) => row.altitude === null).length, 0)
  assert.equal(rows.filter((row) => row.image_is_illustrative).length, 159)

  return {
    schema_version: 's3a-import-plan-v1',
    frozen_sha256: FROZEN_SHA256,
    summary: {
      canonical_rows: 359,
      reused_legacy_rows: 15,
      deterministic_new_rows: 344,
      retained_legacy_rows: 3,
      expected_final_mountain_rows: 362,
    },
    access_status_distribution: accessStatusDistribution,
    radius_bucket_counts: radiusBucketCounts,
    legacy_reuse_by_canonical_key: LEGACY_REUSE_BY_CANONICAL_KEY,
    legacy_retained: LEGACY_RETAINED,
    legacy_coordinate_snapshots: LEGACY_COORDINATE_SNAPSHOTS,
    rows,
  }
}

export const IMPORT_BATCH_SIZE = 20

const IMPORT_COLUMN_DEFINITIONS = Object.freeze([
  ['id', 'UUID'],
  ['effective_canonical_key', 'TEXT'],
  ['name', 'TEXT'],
  ['altitude', 'INTEGER'],
  ['altitude_m_exact', 'NUMERIC'],
  ['province', 'TEXT'],
  ['province_code', 'TEXT'],
  ['provinces', 'TEXT[]'],
  ['province_codes', 'TEXT[]'],
  ['difficulty', 'TEXT'],
  ['min_license', 'TEXT'],
  ['latitude', 'NUMERIC'],
  ['longitude', 'NUMERIC'],
  ['description', 'TEXT'],
  ['cover_image', 'TEXT'],
  ['gallery_images', 'JSONB'],
  ['route_preview_image', 'TEXT'],
  ['checkin_count', 'INTEGER'],
  ['is_active', 'BOOLEAN'],
  ['is_readable', 'BOOLEAN'],
  ['weather_priority_tier', 'TEXT'],
  ['weather_enabled', 'BOOLEAN'],
  ['weather_zone_id', 'TEXT'],
  ['length_km', 'NUMERIC'],
  ['estimated_duration_minutes', 'INTEGER'],
  ['route_reference', 'JSONB'],
  ['access_status', 'TEXT'],
  ['closed_basis', 'TEXT'],
  ['access_source', 'TEXT'],
  ['access_note', 'TEXT'],
  ['risk_note', 'TEXT'],
  ['route_note', 'TEXT'],
  ['image_is_illustrative', 'BOOLEAN'],
  ['image_license_manifest', 'JSONB'],
  ['quality_tier', 'TEXT'],
  ['intro_has_needs_review_claim', 'BOOLEAN'],
  ['intro_review_claims', 'JSONB'],
  ['semantic_review_status', 'TEXT'],
  ['source_payload_sha256', 'TEXT'],
  ['source_payload_hashes', 'JSONB'],
  ['field_review_status', 'JSONB'],
  ['coordinate_kind', 'TEXT'],
  ['coordinate_precision_decimals', 'SMALLINT'],
  ['coordinate_status', 'TEXT'],
  ['coordinate_source', 'TEXT'],
  ['coordinate_source_url', 'TEXT'],
  ['coordinate_provenance', 'JSONB'],
  ['summit_radius_m', 'INTEGER'],
])

const IMPORT_COLUMNS = IMPORT_COLUMN_DEFINITIONS.map(([name]) => name)
const IMPORT_COLUMN_LIST = IMPORT_COLUMNS.map((name) => `  ${name}`).join(',\n')
const IMPORT_ROW_SQL_SCHEMA = IMPORT_COLUMN_DEFINITIONS
  .map(([name, type]) => `  ${name} ${type}`)
  .join(',\n')

function dollarQuotedJson(value, label) {
  const safeLabel = label.toLowerCase().replaceAll(/[^a-z0-9_]/g, '_')
  assert.match(safeLabel, /^[a-z][a-z0-9_]*$/)
  const tag = `$s3aimp_${safeLabel}$`
  const json = JSON.stringify(value)
  assert.equal(json.includes(tag), false, `dollar tag occurs in ${label} payload`)
  return {
    tag,
    json,
    sql: `${tag}${json}${tag}::jsonb`,
  }
}

function chunkRows(rows, size) {
  assert(Number.isInteger(size) && size > 0)
  const chunks = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

export function buildImportBatches(
  plan = buildImportPlan(),
  batchSize = IMPORT_BATCH_SIZE
) {
  assert(batchSize >= 20 && batchSize <= 40)
  const deterministicRows = plan.rows.filter(
    (row) => !LEGACY_REUSE_BY_CANONICAL_KEY[row.effective_canonical_key]
  )
  assert(deterministicRows.length >= 20)
  return {
    probe_one: deterministicRows.slice(0, 1),
    probe_twenty: deterministicRows.slice(0, 20),
    full_batches: chunkRows(plan.rows, batchSize),
  }
}

export function buildImportBatchSql(rows, label) {
  assert(rows.length > 0 && rows.length <= 40)
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length)
  assert.equal(
    new Set(rows.map((row) => row.effective_canonical_key)).size,
    rows.length
  )
  assert.equal(rows.every((row) => row.is_active === false), true)
  assert.equal(rows.every((row) => row.is_readable === false), true)

  const safeLabel = label.toLowerCase().replaceAll(/[^a-z0-9_]/g, '_')
  const payload = dollarQuotedJson(rows, safeLabel)
  const expectedRows = rows.length

  return `WITH payload AS (
  SELECT *
  FROM jsonb_to_recordset(${payload.sql}) AS x(
${IMPORT_ROW_SQL_SCHEMA}
  )
),
upserted AS (
  INSERT INTO public.mountains AS m (
${IMPORT_COLUMN_LIST}
  )
  SELECT
${IMPORT_COLUMN_LIST}
  FROM payload
  ON CONFLICT (effective_canonical_key)
    WHERE effective_canonical_key IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    altitude = EXCLUDED.altitude,
    altitude_m_exact = EXCLUDED.altitude_m_exact,
    province = m.province,
    province_code = m.province_code,
    provinces = EXCLUDED.provinces,
    province_codes = EXCLUDED.province_codes,
    difficulty = m.difficulty,
    min_license = m.min_license,
    latitude = m.latitude,
    longitude = m.longitude,
    description = EXCLUDED.description,
    cover_image = COALESCE(m.cover_image, EXCLUDED.cover_image),
    gallery_images = CASE
      WHEN jsonb_array_length(COALESCE(m.gallery_images, '[]'::jsonb)) > 0
        THEN m.gallery_images
      ELSE EXCLUDED.gallery_images
    END,
    route_preview_image = COALESCE(m.route_preview_image, EXCLUDED.route_preview_image),
    checkin_count = m.checkin_count,
    is_active = m.is_active,
    is_readable = m.is_readable,
    weather_priority_tier = m.weather_priority_tier,
    weather_enabled = m.weather_enabled,
    weather_zone_id = m.weather_zone_id,
    length_km = EXCLUDED.length_km,
    estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
    route_reference = EXCLUDED.route_reference,
    access_status = EXCLUDED.access_status,
    closed_basis = EXCLUDED.closed_basis,
    access_source = EXCLUDED.access_source,
    access_note = EXCLUDED.access_note,
    risk_note = EXCLUDED.risk_note,
    route_note = EXCLUDED.route_note,
    image_is_illustrative = EXCLUDED.image_is_illustrative,
    image_license_manifest = CASE
      WHEN jsonb_array_length(COALESCE(m.image_license_manifest, '[]'::jsonb)) > 0
        THEN m.image_license_manifest
      ELSE EXCLUDED.image_license_manifest
    END,
    quality_tier = EXCLUDED.quality_tier,
    intro_has_needs_review_claim = EXCLUDED.intro_has_needs_review_claim,
    intro_review_claims = EXCLUDED.intro_review_claims,
    semantic_review_status = EXCLUDED.semantic_review_status,
    source_payload_sha256 = EXCLUDED.source_payload_sha256,
    source_payload_hashes = EXCLUDED.source_payload_hashes,
    field_review_status = EXCLUDED.field_review_status,
    coordinate_kind = EXCLUDED.coordinate_kind,
    coordinate_precision_decimals = EXCLUDED.coordinate_precision_decimals,
    coordinate_status = EXCLUDED.coordinate_status,
    coordinate_source = EXCLUDED.coordinate_source,
    coordinate_source_url = EXCLUDED.coordinate_source_url,
    coordinate_provenance = EXCLUDED.coordinate_provenance,
    summit_radius_m = EXCLUDED.summit_radius_m
  WHERE m.id = EXCLUDED.id
  RETURNING id, effective_canonical_key, is_active, is_readable
)
SELECT jsonb_build_object(
  'batch_label', '${safeLabel}',
  'expected_rows', ${expectedRows},
  'affected_rows', (SELECT count(*) FROM upserted),
  'all_incoming_false_false', (
    SELECT bool_and(is_active = false AND is_readable = false)
    FROM payload
  ),
  'returned_keys', (
    SELECT jsonb_agg(effective_canonical_key ORDER BY effective_canonical_key)
    FROM upserted
  )
) AS s3a_batch_result;
`
}

export function buildLegacyBindingSql() {
  const rows = Object.entries(LEGACY_REUSE_BY_CANONICAL_KEY)
    .map(([effectiveCanonicalKey, id]) => ({
      id,
      effective_canonical_key: effectiveCanonicalKey,
    }))
    .sort((a, b) => a.effective_canonical_key.localeCompare(
      b.effective_canonical_key,
      'en-US'
    ))
  const payload = dollarQuotedJson(rows, 'legacy_bindings')

  return `WITH binding AS (
  SELECT *
  FROM jsonb_to_recordset(${payload.sql}) AS x(
    id UUID,
    effective_canonical_key TEXT
  )
),
updated AS (
  UPDATE public.mountains AS m
  SET effective_canonical_key = binding.effective_canonical_key
  FROM binding
  WHERE m.id = binding.id
    AND (
      m.effective_canonical_key IS NULL
      OR m.effective_canonical_key = binding.effective_canonical_key
    )
  RETURNING m.id, m.effective_canonical_key
)
SELECT jsonb_build_object(
  'expected_rows', 15,
  'affected_rows', (SELECT count(*) FROM updated),
  'bound_keys', (
    SELECT jsonb_agg(effective_canonical_key ORDER BY effective_canonical_key)
    FROM updated
  )
) AS s3a_legacy_binding_result;
`
}

function sqlUuidList(ids) {
  return ids.map((id) => `'${id}'::uuid`).join(', ')
}

function legacyCoordinateValues() {
  return Object.entries(LEGACY_COORDINATE_SNAPSHOTS)
    .map(([id, [latitude, longitude]]) => (
      `('${id}'::uuid, ${latitude}::numeric, ${longitude}::numeric)`
    ))
    .join(',\n      ')
}

export function buildLegacyReconciliationSql() {
  const legacyIds = Object.keys(LEGACY_COORDINATE_SNAPSHOTS)
  const reuseIds = Object.values(LEGACY_REUSE_BY_CANONICAL_KEY)
  const retainedIds = LEGACY_RETAINED.map((row) => row.id)
  const retainedPayload = dollarQuotedJson(
    LEGACY_RETAINED.map((row) => ({
      id: row.id,
      field_review_status: row.field_review_status,
      reason: row.reason,
    })),
    'retained_legacy'
  )

  return `BEGIN;

UPDATE public.mountains
SET is_active = true,
    is_readable = true
WHERE id IN (${sqlUuidList(reuseIds)})
  AND effective_canonical_key IS NOT NULL;

WITH retained AS (
  SELECT *
  FROM jsonb_to_recordset(${retainedPayload.sql}) AS x(
    id UUID,
    field_review_status JSONB,
    reason TEXT
  )
)
UPDATE public.mountains AS m
SET is_active = false,
    is_readable = true,
    quality_tier = 'blocked',
    semantic_review_status = 'blocked',
    field_review_status = retained.field_review_status
FROM retained
WHERE m.id = retained.id;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.mountains) <> 362 THEN
    RAISE EXCEPTION 'expected 362 total mountains after reconciliation';
  END IF;
  IF (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
  ) <> 359 THEN
    RAISE EXCEPTION 'expected 359 canonical rows after reconciliation';
  END IF;
  IF (
    SELECT count(*) FROM public.mountains
    WHERE id NOT IN (${sqlUuidList(legacyIds)})
      AND is_active = false
      AND is_readable = false
  ) <> 344 THEN
    RAISE EXCEPTION 'expected 344 hidden deterministic rows after reconciliation';
  END IF;
  IF (
    SELECT count(*) FROM public.mountains
    WHERE id IN (${sqlUuidList(reuseIds)})
      AND is_active = true
      AND is_readable = true
  ) <> 15 THEN
    RAISE EXCEPTION 'expected 15 reused legacy rows to retain active/readable state';
  END IF;
  IF (
    SELECT count(*) FROM public.mountains
    WHERE id IN (${sqlUuidList(retainedIds)})
      AND is_active = false
      AND is_readable = true
      AND effective_canonical_key IS NULL
  ) <> 3 THEN
    RAISE EXCEPTION 'expected 3 retained legacy rows to be readable but unlistable';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
      ${legacyCoordinateValues()}
    ) AS before_row(id, latitude, longitude)
    JOIN public.mountains current_row USING (id)
    WHERE current_row.latitude IS DISTINCT FROM before_row.latitude
       OR current_row.longitude IS DISTINCT FROM before_row.longitude
  ) THEN
    RAISE EXCEPTION 'legacy latitude/longitude changed';
  END IF;
  IF (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
      AND summit_radius_m IS NULL
  ) <> 17 THEN
    RAISE EXCEPTION 'expected 17 canonical rows with NULL summit radius';
  END IF;
  IF (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
      AND altitude IS NULL
  ) <> 5 THEN
    RAISE EXCEPTION 'expected 5 canonical rows with honest NULL altitude';
  END IF;
  IF (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
      AND image_is_illustrative = true
  ) <> 159 THEN
    RAISE EXCEPTION 'expected 159 illustrative canonical rows';
  END IF;
  IF (
    SELECT jsonb_object_agg(access_status, count_value)
    FROM (
      SELECT access_status, count(*) AS count_value
      FROM public.mountains
      WHERE effective_canonical_key IS NOT NULL
      GROUP BY access_status
    ) distribution
  ) <> '{"closed":7,"open":347,"pilgrimage_only":1,"unknown":4}'::jsonb THEN
    RAISE EXCEPTION 'authoritative access_status distribution mismatch';
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'before_mountains', 18,
  'after_mountains', (SELECT count(*) FROM public.mountains),
  'delta_mountains', (SELECT count(*) - 18 FROM public.mountains),
  'canonical_rows', (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
  ),
  'new_hidden_rows', (
    SELECT count(*) FROM public.mountains
    WHERE id NOT IN (${sqlUuidList(legacyIds)})
      AND is_active = false
      AND is_readable = false
  ),
  'reused_legacy_active_readable', (
    SELECT count(*) FROM public.mountains
    WHERE id IN (${sqlUuidList(reuseIds)})
      AND is_active = true
      AND is_readable = true
  ),
  'retained_legacy_readable_unlistable', (
    SELECT count(*) FROM public.mountains
    WHERE id IN (${sqlUuidList(retainedIds)})
      AND is_active = false
      AND is_readable = true
      AND effective_canonical_key IS NULL
  ),
  'null_summit_radius', (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
      AND summit_radius_m IS NULL
  ),
  'null_altitude', (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
      AND altitude IS NULL
  ),
  'illustrative_rows', (
    SELECT count(*) FROM public.mountains
    WHERE effective_canonical_key IS NOT NULL
      AND image_is_illustrative = true
  ),
  'legacy_coordinates_preserved', NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
      ${legacyCoordinateValues()}
    ) AS before_row(id, latitude, longitude)
    JOIN public.mountains current_row USING (id)
    WHERE current_row.latitude IS DISTINCT FROM before_row.latitude
       OR current_row.longitude IS DISTINCT FROM before_row.longitude
  )
) AS s3a_import_result;

COMMIT;
`
}

function buildArtifactFiles() {
  const plan = buildImportPlan()
  const execution = buildImportBatches(plan)
  const sqlFiles = new Map([
    ['probe-001.sql', buildImportBatchSql(execution.probe_one, 'probe-001')],
    ['probe-020.sql', buildImportBatchSql(execution.probe_twenty, 'probe-020')],
    ['legacy-bindings.sql', buildLegacyBindingSql()],
    ['legacy-reconciliation.sql', buildLegacyReconciliationSql()],
  ])
  execution.full_batches.forEach((rows, index) => {
    const number = String(index + 1).padStart(3, '0')
    sqlFiles.set(
      `batches/batch-${number}.sql`,
      buildImportBatchSql(rows, `batch-${number}`)
    )
  })
  const sqlManifest = [...sqlFiles.entries()].map(([file, sql]) => ({
    file,
    rows: file === 'probe-001.sql'
      ? 1
      : file === 'probe-020.sql'
        ? 20
        : file.startsWith('batches/')
          ? execution.full_batches[Number(file.match(/(\d{3})/)?.[1]) - 1].length
          : null,
    bytes: Buffer.byteLength(sql),
    sha256: sha256(sql),
  }))
  const summary = {
    schema_version: plan.schema_version,
    summary: plan.summary,
    access_status_distribution: plan.access_status_distribution,
    radius_bucket_counts: plan.radius_bucket_counts,
    payload_sha256: sha256(JSON.stringify(plan.rows)),
    all_payload_is_active_false: plan.rows.every((row) => row.is_active === false),
    all_payload_is_readable_false: plan.rows.every((row) => row.is_readable === false),
    null_summit_radius_count: plan.rows.filter((row) => row.summit_radius_m === null).length,
    batch_size: IMPORT_BATCH_SIZE,
    full_batch_count: execution.full_batches.length,
    sql_manifest: sqlManifest,
  }
  return {
    plan,
    files: new Map([
      ['import-plan.json', `${JSON.stringify(plan, null, 2)}\n`],
      ['dry-run-summary.json', `${JSON.stringify(summary, null, 2)}\n`],
      ...sqlFiles,
    ]),
    summary,
  }
}

function writeDeterministicArtifacts(outputDir) {
  const artifacts = buildArtifactFiles()
  fs.rmSync(outputDir, { recursive: true, force: true })
  for (const [relativePath, content] of artifacts.files) {
    const filePath = path.join(outputDir, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
  }
  return artifacts
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const mode = process.argv[2] ?? '--write'
  const outputDir = path.resolve(
    process.argv[3] ?? 'output/s3a-r5-import'
  )
  if (mode === '--write') {
    const { plan, summary } = writeDeterministicArtifacts(outputDir)
    console.log(JSON.stringify({
      output_dir: outputDir,
      summary: plan.summary,
      access_status_distribution: plan.access_status_distribution,
      radius_bucket_counts: plan.radius_bucket_counts,
      payload_sha256: summary.payload_sha256,
      batch_size: summary.batch_size,
      full_batch_count: summary.full_batch_count,
      max_sql_bytes: Math.max(...summary.sql_manifest.map((file) => file.bytes)),
    }, null, 2))
  } else if (mode === '--check') {
    const artifacts = buildArtifactFiles()
    const expectedFiles = [...artifacts.files.keys()].sort()
    const actualFiles = fs.readdirSync(outputDir, { recursive: true })
      .filter((relativePath) => fs.statSync(path.join(outputDir, relativePath)).isFile())
      .sort()
    assert.deepEqual(actualFiles, expectedFiles)
    for (const [relativePath, expected] of artifacts.files) {
      assert.equal(fs.readFileSync(path.join(outputDir, relativePath), 'utf8'), expected)
    }
    console.log(JSON.stringify({
      checked: true,
      output_dir: outputDir,
      payload_sha256: artifacts.summary.payload_sha256,
      batch_size: artifacts.summary.batch_size,
      full_batch_count: artifacts.summary.full_batch_count,
    }, null, 2))
  } else {
    throw new Error(`unknown mode: ${mode}`)
  }
}
