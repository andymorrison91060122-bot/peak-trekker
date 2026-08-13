import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseKml } from '../../src/lib/import/kml-parser.ts'
import { haversineMeters } from '../../src/lib/import/track-stats.ts'
import { simplifyPolyline } from '../../src/lib/polyline-simplify.ts'
import { applyRouteMapModePromotions } from './route-mode-promotions.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PACKAGE_ROOT = path.join(REPO_ROOT, 'data/mountains/route-geometry')
const SOURCE_PATHS = Object.freeze({
  manifest: path.join(PACKAGE_ROOT, 'source-manifest.json'),
  geometries: path.join(PACKAGE_ROOT, 'source-route-geometries.jsonl'),
})

const PRODUCT_APPROVED_MISSING_COORDINATE_KEYS = new Set([
  'bogeda-feng',
  'kongur-feng',
  'kongur-jiubie-feng',
  'kawagebo',
  'namchabarwa',
  'nyainqentanglha',
  'qiaogeli-feng-k2',
])

const PRODUCT_REJECTED_OFF_TARGET_RECORD_IDS = new Set([
  'recvs3JMSstTPJ',
  'recvs3JMSsmbMA',
  'recvs3JMSsuOML',
  'recvs3JMSrtdDS',
  'recvs3JNBgmhLM',
  'recvs3JMSrZ4J8',
  'recvs3JMSrFAP2',
  'recvs3JMSrdUS2',
])

const PRODUCT_ALREADY_PRESENT_RECORD_IDS = new Set([
  'recvs3JMSshQyQ',
  'recvs3JMSsyywV',
])

const SIMPLIFY_EPSILON_DEGREES = 0.00003
const MAX_SIMPLIFIED_POINTS = 1600

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    )
  }
  return value
}

function stableJson(value, indent = 0) {
  return JSON.stringify(stableValue(value), null, indent)
}

function stableJsonl(rows) {
  return `${rows.map((row) => stableJson(row)).join('\n')}\n`
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readJsonl(filePath) {
  const body = fs.readFileSync(filePath, 'utf8').trim()
  return body ? body.split('\n').map((line) => JSON.parse(line)) : []
}

function normalizeName(value) {
  return String(value ?? '').replace(/[\s\u3000]/g, '').trim()
}

function baseName(value) {
  return normalizeName(value).replace(/[（(][^）)]*[）)]/g, '')
}

function normalizeProvince(value) {
  return normalizeName(value)
    .replace(/维吾尔自治区$/, '')
    .replace(/壮族自治区$/, '')
    .replace(/回族自治区$/, '')
    .replace(/自治区$/, '')
    .replace(/[省市]$/, '')
}

function isCoordinate(row) {
  return row?.gps?.present === true
    && row.gps.latitude !== null
    && row.gps.longitude !== null
    && Number.isFinite(Number(row.gps.latitude))
    && Number.isFinite(Number(row.gps.longitude))
}

function resolveCanonical(candidate, canonicalRows) {
  if (candidate.canonical_key) {
    const direct = canonicalRows.find((row) => row.effective_canonical_key === candidate.canonical_key)
    assert(direct, `missing canonical key: ${candidate.canonical_key}`)
    return { canonical: direct, resolution: 'existing_canonical_key' }
  }

  const name = baseName(candidate.mountain_name)
  const province = normalizeProvince(candidate.region)
  const matches = canonicalRows.filter((row) => (
    [row.primary_name, ...(row.aliases ?? [])].some((alias) => baseName(alias) === name)
    && (row.provinces ?? []).some((item) => normalizeProvince(item) === province)
  ))
  assert.equal(
    matches.length,
    1,
    `province disambiguation must resolve exactly one canonical: ${candidate.mountain_name} / ${candidate.region}`,
  )
  return { canonical: matches[0], resolution: 'province_name_disambiguation' }
}

function toRawPosition(point) {
  assert(Number.isFinite(point.latitude), 'non-finite latitude')
  assert(Number.isFinite(point.longitude), 'non-finite longitude')
  const base = [point.longitude, point.latitude]
  return Number.isFinite(point.elevation) ? [...base, point.elevation] : base
}

function capPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points
  const step = Math.ceil((points.length - 1) / (maxPoints - 1))
  const capped = points.filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0)
  if (capped.at(-1) !== points.at(-1)) capped.push(points.at(-1))
  return capped
}

function normalizeGeometry(trackPoints) {
  assert(trackPoints.length >= 2, 'route must have at least two points')
  const simplified = simplifyPolyline(trackPoints, {
    epsilon: SIMPLIFY_EPSILON_DEGREES,
    project: (point) => ({ x: point.longitude, y: point.latitude }),
  })
  const capped = capPoints(simplified, MAX_SIMPLIFIED_POINTS)
  assert(capped.length >= 2, 'simplification removed route')
  return {
    type: 'MultiLineString',
    coordinates: [capped.map(toRawPosition)],
  }
}

function bboxFor(trackPoints) {
  const latitudes = trackPoints.map((point) => point.latitude)
  const longitudes = trackPoints.map((point) => point.longitude)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)
  const centerLat = (minLat + maxLat) / 2
  const centerLon = (minLon + maxLon) / 2
  const widthKm = haversineMeters(centerLat, minLon, centerLat, maxLon) / 1000
  const heightKm = haversineMeters(minLat, centerLon, maxLat, centerLon) / 1000
  return {
    min_lat: minLat,
    max_lat: maxLat,
    min_lon: minLon,
    max_lon: maxLon,
    width_km: Number(widthKm.toFixed(6)),
    height_km: Number(heightKm.toFixed(6)),
    fit_square_km_with_20pct_margin: Number((Math.max(widthKm, heightKm) * 1.2).toFixed(6)),
  }
}

function geographicCheck(trackPoints, canonical) {
  if (!isCoordinate(canonical)) {
    return {
      status: 'product_approved_missing_canonical_coordinate',
      reason: 'canonical_coordinate_missing_product_approved_distance_not_run',
      min_point_distance_km: null,
      threshold_km: null,
      reference: {
        coordinate: null,
        effective_canonical_key: canonical.effective_canonical_key,
        primary_name: canonical.primary_name,
        provinces: canonical.provinces,
        target_kind: canonical.entity_type === 'route_corridor' ? 'route_corridor' : 'mountain',
      },
    }
  }

  const thresholdKm = canonical.entity_type === 'route_corridor' ? 150 : 60
  const minPointDistanceM = Math.min(...trackPoints.map((point) => (
    haversineMeters(point.latitude, point.longitude, canonical.gps.latitude, canonical.gps.longitude)
  )))
  return {
    status: minPointDistanceM <= thresholdKm * 1000 ? 'parsed_geo_match' : 'parsed_geo_mismatch',
    reason: minPointDistanceM <= thresholdKm * 1000
      ? 'regional_reference_within_threshold'
      : 'regional_reference_outside_threshold',
    min_point_distance_km: Number((minPointDistanceM / 1000).toFixed(2)),
    threshold_km: thresholdKm,
    reference: {
      coordinate: {
        latitude: canonical.gps.latitude,
        longitude: canonical.gps.longitude,
      },
      effective_canonical_key: canonical.effective_canonical_key,
      primary_name: canonical.primary_name,
      provinces: canonical.provinces,
      target_kind: canonical.entity_type === 'route_corridor' ? 'route_corridor' : 'mountain',
    },
  }
}

function productDecision(candidate, resolution, check) {
  if (PRODUCT_APPROVED_MISSING_COORDINATE_KEYS.has(candidate.canonical_key)) {
    return {
      decision: 'product_approved_missing_canonical_coordinate',
      distance_check: 'not_run_missing_canonical_coordinate',
    }
  }
  if (candidate.category === 'duplicate_in_base') {
    return {
      decision: 'product_approved_shared_content_sha_multi_mountain',
      distance_check: 'parsed_geo_match',
    }
  }
  if (resolution === 'province_name_disambiguation') {
    return {
      decision: 'product_approved_province_disambiguation',
      distance_check: check.status,
    }
  }
  return {
    decision: 'parsed_geo_match',
    distance_check: check.status,
  }
}

function candidateDisposition(candidate) {
  if (PRODUCT_ALREADY_PRESENT_RECORD_IDS.has(candidate.record_id)) return 'skip_existing'
  if (PRODUCT_REJECTED_OFF_TARGET_RECORD_IDS.has(candidate.record_id)) return 'reject_off_target'
  if (candidate.category === 'new_valid' || candidate.category === 'duplicate_in_base' || candidate.category === 'mountain_unresolved') return 'admit'
  if (candidate.reason === 'missing_canonical_coordinate' && PRODUCT_APPROVED_MISSING_COORDINATE_KEYS.has(candidate.canonical_key)) return 'admit'
  return 'reject_unapproved'
}

function sourceRow({ candidate, canonical, resolution, bytes }) {
  const actualSha = sha256(bytes)
  assert.equal(actualSha, candidate.sha256, `attachment SHA mismatch: ${candidate.record_id}`)
  const parsed = parseKml(bytes.toString('utf8'), candidate.source_name)
  const trackPoints = parsed.trackPoints
  const automaticCheck = geographicCheck(trackPoints, canonical)
  const decision = productDecision(candidate, resolution, automaticCheck)
  const isManual = decision.decision === 'product_approved_missing_canonical_coordinate'
  const isProvinceOverride = resolution === 'province_name_disambiguation'
    && automaticCheck.status === 'parsed_geo_mismatch'
  const check = isProvinceOverride
    ? {
        ...automaticCheck,
        status: 'product_approved_province_disambiguation',
        automatic_status: 'parsed_geo_mismatch',
        reason: 'product_approved_province_name_mapping_after_automatic_distance_screen',
      }
    : automaticCheck
  assert(
    isManual || isProvinceOverride || check.status === 'parsed_geo_match',
    `rejected geographic candidate: ${candidate.record_id}`,
  )

  const geometry = normalizeGeometry(trackPoints)
  const normalizedGeometry = {
    type: 'MultiLineString',
    coordinates: [trackPoints.map(toRawPosition)],
  }
  return {
    bbox: bboxFor(trackPoints),
    display_mode: 'map_candidate',
    end: toRawPosition(trackPoints.at(-1)),
    file_token: candidate.file_token,
    geography_check: check,
    mountain_name: candidate.mountain_name,
    normalized_geometry_sha256: sha256(stableJson(normalizedGeometry)),
    point_count: trackPoints.length,
    product_metrics_untouched: ['distance', 'duration', 'difficulty', 'route_note'],
    route_name: candidate.route_name,
    segment_count: 1,
    simplified_geometry: geometry,
    simplified_geometry_sha256: sha256(stableJson(geometry)),
    simplified_point_count: geometry.coordinates[0].length,
    source_file_bytes: bytes.length,
    source_file_sha256: actualSha,
    source_name: candidate.source_name,
    source_record_id: candidate.record_id,
    start: toRawPosition(trackPoints[0]),
    terminal_status: isManual
      ? 'product_approved_missing_canonical_coordinate'
      : isProvinceOverride
        ? 'product_approved_province_disambiguation'
        : 'parsed_geo_match',
    admission: {
      base_record_id: candidate.record_id,
      base_status: '已上传',
      decision: decision.decision,
      distance_check: decision.distance_check,
      file_token: candidate.file_token,
      source_filename: candidate.source_name,
      content_sha256: actualSha,
      ...(resolution === 'province_name_disambiguation' ? {
        province_disambiguation: {
          base_name: baseName(candidate.mountain_name),
          base_region: candidate.region,
          canonical_name: canonical.primary_name,
          canonical_provinces: canonical.provinces,
        },
      } : {}),
    },
  }
}

export function buildRouteGeometryAdmission({
  candidates,
  canonicalRows,
  existingSourceRows,
  readAttachment,
}) {
  const existingPairs = new Set(existingSourceRows.map((row) => (
    `${row.geography_check.reference.effective_canonical_key}:${row.source_file_sha256}`
  )))
  const admitted = []
  const rejected = []

  for (const candidate of [...candidates].sort((left, right) => left.record_id.localeCompare(right.record_id, 'en'))) {
    const disposition = candidateDisposition(candidate)
    if (disposition !== 'admit') {
      rejected.push({ record_id: candidate.record_id, disposition })
      continue
    }
    const { canonical, resolution } = resolveCanonical(candidate, canonicalRows)
    const bytes = readAttachment(candidate)
    const row = sourceRow({ candidate, canonical, resolution, bytes })
    const pair = `${canonical.effective_canonical_key}:${row.source_file_sha256}`
    assert(!existingPairs.has(pair), `duplicate geometry source pair: ${pair}`)
    existingPairs.add(pair)
    admitted.push(row)
  }

  return {
    admitted: admitted.sort((left, right) => (
      left.geography_check.reference.effective_canonical_key.localeCompare(
        right.geography_check.reference.effective_canonical_key,
        'en',
      ) || left.source_record_id.localeCompare(right.source_record_id, 'en')
    )),
    rejected,
  }
}

function attachmentManifestEntry(row) {
  const key = row.geography_check.reference.effective_canonical_key
  return {
    kind: 'track',
    record_id: row.source_record_id,
    field: '轨迹文件',
    file_token: row.file_token,
    source_name: row.source_name,
    mountain_name: row.mountain_name,
    route_name: row.route_name,
    relative_path: `attachments/tracks/${key}/${row.source_record_id}-${row.source_name}`,
    bytes: row.source_file_bytes,
    sha256: row.source_file_sha256,
    admitted_at: '2026-08-13',
  }
}

function updateManifest(manifest, rows) {
  const existingByToken = new Map(manifest.attachments.map((row) => [row.file_token, row]))
  const added = []
  for (const row of rows) {
    if (!existingByToken.has(row.file_token)) {
      const attachment = attachmentManifestEntry(row)
      existingByToken.set(row.file_token, attachment)
      added.push(attachment)
    }
  }
  const attachments = [
    ...manifest.attachments,
    ...added.sort((left, right) => left.file_token.localeCompare(right.file_token, 'en')),
  ]
  const tracks = attachments.filter((row) => row.kind === 'track')
  const covers = attachments.filter((row) => row.kind === 'cover')
  const routeGeometries = rows
  const sourceProducts = {
    ...manifest.source_products,
    route_geometries: {
      ...manifest.source_products.route_geometries,
      rows: routeGeometries.length,
      sha256: sha256(stableJsonl(routeGeometries)),
    },
  }
  return {
    ...manifest,
    attachment_counts: {
      total: attachments.length,
      unique_paths: new Set(attachments.map((row) => row.relative_path)).size,
      tracks: tracks.length,
      covers: covers.length,
      total_bytes: attachments.reduce((sum, row) => sum + row.bytes, 0),
    },
    attachments,
    source_products: sourceProducts,
    incremental_admission: {
      schema_version: 'route-geometry-incremental-admission-v1',
      source: 'Feishu Base 轨迹清单 / 已上传 / 轨迹文件',
      admission_date: '2026-08-13',
      geometry_rows_added: 122,
      attachment_tokens_added: 121,
      decisions: {
        parsed_geo_match: 102,
        product_approved_shared_content_sha_multi_mountain: 4,
        product_approved_province_disambiguation: 9,
        product_approved_missing_canonical_coordinate: 7,
        already_present_not_reimported: 2,
        off_target_not_admitted: 8,
      },
      dedupe_key: 'effective_canonical_key + source_file_sha256',
      missing_coordinate_policy: 'product_approved_missing_canonical_coordinate; distance check not run; no canonical coordinate fabricated',
    },
  }
}

function writeAtomic(filePath, body) {
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, body)
  fs.renameSync(tempPath, filePath)
}

export function applyRouteGeometryAdmission({ classificationPath, attachmentsRoot }) {
  const classification = readJson(classificationPath)
  const canonicalRows = readJsonl(path.join(REPO_ROOT, 'data/mountains/ledger/effective_canonicals.jsonl'))
  const existingSourceRows = readJsonl(SOURCE_PATHS.geometries)
  const result = buildRouteGeometryAdmission({
    candidates: classification.classifications,
    canonicalRows,
    existingSourceRows,
    readAttachment: (candidate) => fs.readFileSync(path.join(attachmentsRoot, `${candidate.file_token}.kml`)),
  })
  assert.equal(result.admitted.length, 122, 'approved admission closure must be exactly 122')
  assert.deepEqual(
    Object.fromEntries(result.rejected.reduce((groups, row) => {
      groups.set(row.disposition, (groups.get(row.disposition) ?? 0) + 1)
      return groups
    }, new Map())),
    { reject_off_target: 8, skip_existing: 2 },
  )

  const rows = applyRouteMapModePromotions([
    ...existingSourceRows,
    ...result.admitted,
  ]).sort((left, right) => (
    left.geography_check.reference.effective_canonical_key.localeCompare(
      right.geography_check.reference.effective_canonical_key,
      'en',
    ) || left.source_record_id.localeCompare(right.source_record_id, 'en')
  ))
  const manifest = updateManifest(readJson(SOURCE_PATHS.manifest), rows)
  writeAtomic(SOURCE_PATHS.geometries, stableJsonl(rows))
  writeAtomic(SOURCE_PATHS.manifest, `${JSON.stringify(manifest, null, 2)}\n`)
  return { ...result, rows, manifest }
}

export function checkRouteGeometryAdmission({ classificationPath, attachmentsRoot }) {
  const classification = readJson(classificationPath)
  const canonicalRows = readJsonl(path.join(REPO_ROOT, 'data/mountains/ledger/effective_canonicals.jsonl'))
  const manifest = readJson(SOURCE_PATHS.manifest)
  const sourceRows = readJsonl(SOURCE_PATHS.geometries)
  const legacyRows = sourceRows.filter((row) => !row.admission)
  const incrementalRows = sourceRows.filter((row) => row.admission)
  const expected = buildRouteGeometryAdmission({
    candidates: classification.classifications,
    canonicalRows,
    existingSourceRows: legacyRows,
    readAttachment: (candidate) => fs.readFileSync(path.join(attachmentsRoot, `${candidate.file_token}.kml`)),
  })
  assert.equal(expected.admitted.length, 122)
  const expectedRows = applyRouteMapModePromotions([...legacyRows, ...expected.admitted])
  const expectedIncrementalRows = expectedRows.filter((row) => row.admission)
  assert.equal(
    stableJsonl(incrementalRows),
    stableJsonl(expectedIncrementalRows),
    'incremental source geometry drift',
  )

  const rows = expectedRows.sort((left, right) => (
    left.geography_check.reference.effective_canonical_key.localeCompare(
      right.geography_check.reference.effective_canonical_key,
      'en',
    ) || left.source_record_id.localeCompare(right.source_record_id, 'en')
  ))
  assert.equal(fs.readFileSync(SOURCE_PATHS.geometries, 'utf8'), stableJsonl(rows), 'source geometry serialization drift')
  assert.equal(manifest.source_products.route_geometries.rows, rows.length)
  assert.equal(manifest.source_products.route_geometries.sha256, sha256(stableJsonl(rows)))
  assert.equal(manifest.attachments.length, 213)
  assert.equal(manifest.incremental_admission?.geometry_rows_added, expected.admitted.length)
  return {
    admitted: expected.admitted.length,
    skipped_existing: expected.rejected.filter((row) => row.disposition === 'skip_existing').length,
    rejected_off_target: expected.rejected.filter((row) => row.disposition === 'reject_off_target').length,
    source_geometry_rows: rows.length,
    source_geometry_sha256: manifest.source_products.route_geometries.sha256,
    manifest_sha256: sha256(fs.readFileSync(SOURCE_PATHS.manifest)),
  }
}

function cliOptions(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--check') {
      values.set(key, true)
      continue
    }
    values.set(key, argv[index + 1])
    index += 1
  }
  return values
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const options = cliOptions(process.argv.slice(2))
  const classificationPath = options.get('--classification')
  const attachmentsRoot = options.get('--attachments-root')
  assert(classificationPath, '--classification is required')
  assert(attachmentsRoot, '--attachments-root is required')
  const result = options.has('--check')
    ? checkRouteGeometryAdmission({ classificationPath, attachmentsRoot })
    : applyRouteGeometryAdmission({ classificationPath, attachmentsRoot })
  console.log(JSON.stringify(
    options.has('--check')
      ? result
      : {
          admitted: result.admitted.length,
          rejected: result.rejected,
          source_geometry_rows: result.rows.length,
          attachment_count: result.manifest.attachments.length,
        },
    null,
    2,
  ))
}
