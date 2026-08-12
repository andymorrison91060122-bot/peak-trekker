import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildImportPlan,
} from './s3a-import.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PACKAGE_ROOT = path.join(REPO_ROOT, 'data/mountains/route-geometry')
const SOURCE_PATHS = Object.freeze({
  manifest: path.join(PACKAGE_ROOT, 'source-manifest.json'),
  geometries: path.join(PACKAGE_ROOT, 'source-route-geometries.jsonl'),
  covers: path.join(PACKAGE_ROOT, 'source-route-covers.jsonl'),
  content: path.join(PACKAGE_ROOT, 'source-route-content.jsonl'),
})
const OUTPUT_PATHS = Object.freeze({
  geometries: 'route-geometry-import.jsonl',
  content: 'route-content-import.jsonl',
  covers: 'route-cover-import.jsonl',
  updates: 'existing-entity-updates.jsonl',
  blockers: 'route-import-blockers.csv',
  summary: 'route-import-summary.json',
  review: 'route-import-review.md',
})
const EXPECTED_FROZEN_SHA256 = Object.freeze({
  effective_canonicals: '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  entity_semantics: '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
  enrichment: 'b3f43ef40e009c35ee1ca96aed9d55038afe4eb76a39b9c7bb37f2e4404cfee5',
})
const FROZEN_PATHS = Object.freeze({
  effective_canonicals: path.join(
    REPO_ROOT,
    'data/mountains/ledger/effective_canonicals.jsonl',
  ),
  entity_semantics: path.join(
    REPO_ROOT,
    'data/mountains/ledger/entity-semantics.jsonl',
  ),
  enrichment: path.join(
    REPO_ROOT,
    'data/mountains/ledger/effective-canonical-enrichment.jsonl',
  ),
})
const EXPECTED_COORDINATOR_MANIFEST_SHA256 =
  'c434e0042e83ece7be424f33916dca70b053a69f8d3fc902dbeb4d1af81caf84'
const CONTENT_STATUS = Object.freeze({
  READY: 'ready',
  BLOCKED: 'blocked',
})
const ACCEPTED_GEOGRAPHY_STATUSES = new Set([
  'parsed_geo_match',
  'product_approved_missing_canonical_coordinate',
  'product_approved_province_disambiguation',
])
const INCREMENTAL_ADMISSION_DECISIONS = Object.freeze({
  parsed_geo_match: 102,
  product_approved_shared_content_sha_multi_mountain: 4,
  product_approved_province_disambiguation: 9,
  product_approved_missing_canonical_coordinate: 7,
})
const NO_TRACK_KEYS = Object.freeze([
  'aotai-traverse-route',
  'bogeda-grand-loop-route',
  'langta-ancient-trail-route',
])
const EXISTING_ENTITY_IDS = Object.freeze({
  'gangrenboqi-cluster': '137df8c2-10cd-5705-b65a-60a904744246',
  'hutiaoxia-gaolu-route': '9bef8995-54c4-5e7a-8b38-4342bb818faf',
})

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
  return body ? body.split(/\n/).map((line) => JSON.parse(line)) : []
}

function uuidFromDigest(digest) {
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

export function deterministicMountainId(canonicalKey) {
  return uuidFromDigest(
    crypto
      .createHash('sha256')
      .update(`peak-trekker:s3a:mountain:${canonicalKey}`)
      .digest(),
  )
}

export function deterministicGeometryId(canonicalKey, sourceFileSha256) {
  assert.match(canonicalKey, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.match(sourceFileSha256, /^[a-f0-9]{64}$/)
  return uuidFromDigest(
    crypto
      .createHash('sha256')
      .update(`peak-trekker:p2:route-geometry:${canonicalKey}:${sourceFileSha256}`)
      .digest(),
  )
}

function normalizeCoordinate(position) {
  assert(Array.isArray(position) && position.length >= 2, 'invalid route coordinate')
  const longitude = Number(position[0])
  const latitude = Number(position[1])
  assert(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180)
  assert(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90)
  return [longitude, latitude]
}

export function recomputeGeometryFacts(geometry) {
  assert.equal(geometry?.type, 'MultiLineString')
  assert(Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0)
  let minLongitude = Infinity
  let minLatitude = Infinity
  let maxLongitude = -Infinity
  let maxLatitude = -Infinity
  let pointCount = 0

  for (const segment of geometry.coordinates) {
    assert(Array.isArray(segment) && segment.length >= 2, 'route segment is too short')
    for (const position of segment) {
      const [longitude, latitude] = normalizeCoordinate(position)
      minLongitude = Math.min(minLongitude, longitude)
      minLatitude = Math.min(minLatitude, latitude)
      maxLongitude = Math.max(maxLongitude, longitude)
      maxLatitude = Math.max(maxLatitude, latitude)
      pointCount += 1
    }
  }

  return {
    bbox: {
      max_latitude: maxLatitude,
      max_longitude: maxLongitude,
      min_latitude: minLatitude,
      min_longitude: minLongitude,
    },
    point_count: pointCount,
    segment_count: geometry.coordinates.length,
  }
}

function asciiCompare(left, right) {
  return String(left).localeCompare(String(right), 'en')
}

function assertUnique(rows, field, label) {
  const values = rows.map((row) => row[field])
  assert.equal(new Set(values).size, values.length, `${label} ${field} must be unique`)
}

function assertSourceClosure(manifest, geometries, covers, content) {
  assert.equal(
    manifest.coordinator_source_manifest_sha256,
    EXPECTED_COORDINATOR_MANIFEST_SHA256,
  )
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(manifest.frozen_inputs).map(([key, value]) => [
        key,
        value.sha256,
      ]),
    ),
    EXPECTED_FROZEN_SHA256,
  )
  for (const [key, expected] of Object.entries(EXPECTED_FROZEN_SHA256)) {
    assert.equal(sha256File(FROZEN_PATHS[key]), expected, `frozen input drift: ${key}`)
  }

  const sourceRows = {
    route_geometries: geometries,
    route_covers: covers,
    route_content: content,
  }
  const sourceFiles = {
    route_geometries: SOURCE_PATHS.geometries,
    route_covers: SOURCE_PATHS.covers,
    route_content: SOURCE_PATHS.content,
  }
  for (const [key, rows] of Object.entries(sourceRows)) {
    const expected = manifest.source_products[key]
    assert.equal(rows.length, expected.rows, `${key} row closure failed`)
    assert.equal(sha256File(sourceFiles[key]), expected.sha256, `${key} SHA drift`)
  }

  assert.equal(manifest.attachment_counts.total, manifest.attachments.length)
  assert.equal(
    manifest.attachment_counts.unique_paths,
    new Set(manifest.attachments.map((row) => row.relative_path)).size,
  )
  assert.equal(
    manifest.attachment_counts.tracks,
    manifest.attachments.filter((row) => row.kind === 'track').length,
  )
  assert.equal(
    manifest.attachment_counts.covers,
    manifest.attachments.filter((row) => row.kind === 'cover').length,
  )
  assert.equal(
    manifest.attachment_counts.total_bytes,
    manifest.attachments.reduce((total, row) => total + row.bytes, 0),
  )
  assertUnique(manifest.attachments, 'relative_path', 'attachment manifest')
  assertUnique(manifest.attachments, 'file_token', 'attachment manifest')

  assert.deepEqual(
    manifest.incremental_admission?.decisions,
    {
      ...INCREMENTAL_ADMISSION_DECISIONS,
      already_present_not_reimported: 2,
      off_target_not_admitted: 8,
    },
  )
  assert.equal(manifest.incremental_admission?.geometry_rows_added, 122)
  assert.equal(manifest.incremental_admission?.attachment_tokens_added, 121)

  const incrementalRows = geometries.filter((row) => row.admission)
  assert.equal(incrementalRows.length, 122)
  const observedDecisions = Object.fromEntries(
    Object.entries(INCREMENTAL_ADMISSION_DECISIONS).map(([decision]) => [
      decision,
      incrementalRows.filter((row) => row.admission.decision === decision).length,
    ]),
  )
  assert.deepEqual(observedDecisions, INCREMENTAL_ADMISSION_DECISIONS)
  const sourcePairs = new Set()
  for (const row of geometries) {
    assert(ACCEPTED_GEOGRAPHY_STATUSES.has(row.terminal_status), 'unsupported geometry terminal status')
    assert.equal(row.geography_check?.status, row.terminal_status)
    const pair = `${row.geography_check.reference.effective_canonical_key}:${row.source_file_sha256}`
    assert(!sourcePairs.has(pair), `duplicate geometry source pair: ${pair}`)
    sourcePairs.add(pair)
  }

  const attachmentsByToken = new Map(manifest.attachments.map((row) => [
    row.file_token,
    row,
  ]))
  for (const row of geometries) {
    const attachment = attachmentsByToken.get(row.file_token)
    assert(attachment, `missing track attachment: ${row.file_token}`)
    assert.equal(attachment.kind, 'track')
    assert.equal(attachment.source_name, row.source_name)
    assert.equal(attachment.bytes, row.source_file_bytes)
    assert.equal(attachment.sha256, row.source_file_sha256)
  }
  for (const row of covers) {
    const attachment = attachmentsByToken.get(row.file_token)
    assert(attachment, `missing cover attachment: ${row.file_token}`)
    assert.equal(attachment.kind, 'cover')
    assert.equal(attachment.source_name, row.source_name)
    assert.equal(attachment.bytes, row.source_file_bytes)
    assert.equal(attachment.sha256, row.source_file_sha256)
  }
}

function existingMountainIds() {
  return new Map(
    buildImportPlan().rows.map((row) => [row.effective_canonical_key, row.id]),
  )
}

function buildGeometryImports(sourceRows, contentKeys, parentIds) {
  return sourceRows
    .map((source) => {
      assert(ACCEPTED_GEOGRAPHY_STATUSES.has(source.terminal_status))
      assert.equal(source.geography_check?.status, source.terminal_status)
      const canonicalKey = source.geography_check.reference.effective_canonical_key
      assert(
        parentIds.has(canonicalKey) || contentKeys.has(canonicalKey),
        `geometry parent is outside existing/new closure: ${canonicalKey}`,
      )
      const mountainId = parentIds.get(canonicalKey)
        ?? deterministicMountainId(canonicalKey)
      const geometry = source.simplified_geometry
      const facts = recomputeGeometryFacts(geometry)
      assert.equal(facts.point_count, source.simplified_point_count)
      assert.equal(facts.segment_count, source.segment_count)
      const sourceExtension = path.extname(source.source_name).toLowerCase() || '.kml'
      const sourceObjectPath =
        `source/${canonicalKey}/${source.source_file_sha256}${sourceExtension}`

      return {
        bbox: facts.bbox,
        display_mode: source.display_mode === 'map_candidate' ? 'map' : 'trace_only',
        effective_canonical_key: canonicalKey,
        geography_check: source.geography_check,
        geometry,
        geometry_review_status: 'pending',
        id: deterministicGeometryId(canonicalKey, source.source_file_sha256),
        mountain_id: mountainId,
        point_count: facts.point_count,
        segment_count: facts.segment_count,
        source_bucket: 'mountain-route-source',
        ...(source.admission ? { source_admission: source.admission } : {}),
        source_file_bytes: source.source_file_bytes,
        source_file_name: source.source_name,
        source_file_sha256: source.source_file_sha256,
        source_file_token: source.file_token,
        source_object_path: sourceObjectPath,
        source_point_count: source.point_count,
        source_record_id: source.source_record_id,
        source_segment_count: source.segment_count,
      }
    })
    .sort((left, right) => (
      asciiCompare(left.effective_canonical_key, right.effective_canonical_key)
      || asciiCompare(left.id, right.id)
    ))
}

function bboxCenter(bbox) {
  return {
    datum: 'WGS84',
    latitude: (bbox.min_latitude + bbox.max_latitude) / 2,
    longitude: (bbox.min_longitude + bbox.max_longitude) / 2,
    coordinate_role: 'track_bbox_center_area',
    precision: 'route_area_reference',
    source_kind: 'parsed_track_bbox',
  }
}

function buildContentImports(sourceRows, geometryImports) {
  const geometryByKey = new Map(geometryImports.map((row) => [
    row.effective_canonical_key,
    row,
  ]))

  return sourceRows
    .map((source) => {
      const key = source.effective_canonical_key
      const geometry = geometryByKey.get(key)
      const coordinate = source.coordinate
        ? source.coordinate
        : geometry
          ? {
              ...bboxCenter(geometry.bbox),
              source_geometry_id: geometry.id,
              source_file_sha256: geometry.source_file_sha256,
              note: 'Area reference derived from the center of the reviewed track bbox; not a summit or trailhead.',
            }
          : null
      const blockerCodes = coordinate ? [] : ['missing_required_area_coordinate']
      const importStatus = blockerCodes.length === 0
        ? CONTENT_STATUS.READY
        : CONTENT_STATUS.BLOCKED

      return {
        access_evidence_status: source.access_evidence_status,
        access_note: source.access_note,
        access_status: source.access_status,
        aliases: [...source.aliases].sort(asciiCompare),
        altitude: null,
        altitude_m_exact: null,
        blocker_codes: blockerCodes,
        coordinate,
        difficulty: source.difficulty,
        effective_canonical_key: key,
        end_point: source.end_point,
        entity_type: 'route_corridor',
        id: deterministicMountainId(key),
        import_status: importStatus,
        intro: source.intro,
        is_active: false,
        is_readable: false,
        latitude: coordinate?.latitude ?? null,
        longitude: coordinate?.longitude ?? null,
        primary_name: source.primary_name,
        provinces: [...source.provinces].sort(asciiCompare),
        publication_recommendation: source.publication_recommendation,
        related_mountain_keys: [...source.related_mountain_keys].sort(asciiCompare),
        review_recommendation: source.review_recommendation,
        risk_note: source.risk_note,
        route_highpoint_m: source.route_highpoint_m,
        route_note: source.route_note,
        route_reference: [
          {
            distance_km_range: source.distance_km_range,
            duration_days_range: source.duration_days_range,
            end_point: source.end_point,
            route_label: source.primary_name,
            start_point: source.start_point,
          },
        ],
        start_point: source.start_point,
      }
    })
    .sort((left, right) => asciiCompare(
      left.effective_canonical_key,
      right.effective_canonical_key,
    ))
}

function extensionFor(sourceName) {
  const extension = path.extname(sourceName).toLowerCase()
  assert.match(extension, /^\.[a-z0-9]+$/, `unsafe cover extension: ${sourceName}`)
  return extension
}

function buildCoverImports(sourceRows, contentImports) {
  const keyByName = new Map(contentImports.map((row) => [
    row.primary_name,
    row.effective_canonical_key,
  ]))
  const selected = sourceRows.filter((row) => (
    row.selection_status === 'user_supplied_selected'
  ))
  assert.equal(selected.length, 16)

  const grouped = new Map()
  for (const source of selected) {
    const key = keyByName.get(source.mountain_name)
    assert(key, `selected cover has no new project: ${source.mountain_name}`)
    const group = grouped.get(key) ?? []
    group.push(source)
    grouped.set(key, group)
  }

  const rows = []
  for (const [key, group] of [...grouped.entries()].sort(([left], [right]) => (
    asciiCompare(left, right)
  ))) {
    group.sort((left, right) => (
      asciiCompare(left.source_file_sha256, right.source_file_sha256)
      || asciiCompare(left.file_token, right.file_token)
    ))
    group.forEach((source, index) => {
      const order = index + 1
      const extension = extensionFor(source.source_name)
      const basename =
        `${String(order).padStart(2, '0')}-user-supplied-${source.source_file_sha256.slice(0, 12)}${extension}`
      const storageObjectPath = `catalog/${key}/${basename}`
      const thumbnailBasename =
        `thumb-v1-${basename.replace(/\.[^.]+$/, '')}.webp`
      rows.push({
        effective_canonical_key: key,
        file_token: source.file_token,
        license: 'user_owned',
        mountain_name: source.mountain_name,
        order,
        provider: 'user_supplied',
        public_url: null,
        review_status: 'approved_by_user',
        source_attachment_path: source.relative_path,
        source_file_bytes: source.source_file_bytes,
        source_file_name: source.source_name,
        source_file_sha256: source.source_file_sha256,
        source_record_id: source.source_record_id,
        storage_bucket: 'mountain-media',
        storage_object_path: storageObjectPath,
        thumbnail_object_path: `catalog/${key}/${thumbnailBasename}`,
      })
    })
  }
  return rows
}

function buildExistingEntityUpdates(associationProposals) {
  assert.equal(associationProposals.length, 2)
  return associationProposals
    .map((proposal) => {
      const key = proposal.existing_effective_canonical_key
      assert(EXISTING_ENTITY_IDS[key], `unexpected association proposal: ${key}`)
      if (key === 'gangrenboqi-cluster') {
        return {
          ...proposal,
          altitude_resolution: 'needs_product_decision',
          altitude_review_note: 'Existing altitude=4000 may describe the route area; do not relabel it as mountain altitude without evidence.',
          existing_id: EXISTING_ENTITY_IDS[key],
        }
      }
      return {
        ...proposal,
        existing_id: EXISTING_ENTITY_IDS[key],
      }
    })
    .sort((left, right) => asciiCompare(
      left.existing_effective_canonical_key,
      right.existing_effective_canonical_key,
    ))
}

function buildBlockers(contentImports) {
  return contentImports
    .filter((row) => row.import_status === CONTENT_STATUS.BLOCKED)
    .map((row) => ({
      blocker_code: row.blocker_codes.join('|'),
      effective_canonical_key: row.effective_canonical_key,
      primary_name: row.primary_name,
      resolution: 'provide a reviewed WGS84 route-area coordinate before import',
      severity: 'hard_blocker',
    }))
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function blockersCsv(rows) {
  const columns = [
    'effective_canonical_key',
    'primary_name',
    'severity',
    'blocker_code',
    'resolution',
  ]
  return `${[
    columns.join(','),
    ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(',')),
  ].join('\n')}\n`
}

function buildSummary({
  manifest,
  geometryImports,
  contentImports,
  coverImports,
  existingEntityUpdates,
  blockers,
}) {
  const ready = contentImports.filter((row) => row.import_status === 'ready').length
  const blocked = contentImports.length - ready
  const mapCount = geometryImports.filter((row) => row.display_mode === 'map').length
  const traceOnlyCount = geometryImports.length - mapCount
  return {
    association_updates: {
      count: existingEntityUpdates.length,
      gangrenboqi_altitude_resolution: 'needs_product_decision',
      keys: existingEntityUpdates.map((row) => row.existing_effective_canonical_key),
    },
    blockers: {
      hard_blocker_count: blockers.length,
      keys: blockers.map((row) => row.effective_canonical_key),
    },
    content: {
      blocked,
      count: contentImports.length,
      no_track_keys: [...NO_TRACK_KEYS],
      ready,
    },
    covers: {
      attachment_count: coverImports.length,
      gangrenboqi_candidates_excluded: 2,
      project_count: new Set(
        coverImports.map((row) => row.effective_canonical_key),
      ).size,
    },
    frozen_inputs: EXPECTED_FROZEN_SHA256,
    geometry: {
      count: geometryImports.length,
      display_mode: {
        map: mapCount,
        trace_only: traceOnlyCount,
      },
      geo_conflicts: geometryImports.filter((row) => (
        row.geography_check.status !== 'parsed_geo_match'
      )).length,
    },
    product_metrics_overwritten: 0,
    production_side_effects: {
      database_writes: 0,
      storage_writes: 0,
      migration_applied: false,
    },
    schema_version: 'route-data-import-summary-v1',
    source_manifest: {
      coordinator_source_manifest_sha256:
        manifest.coordinator_source_manifest_sha256,
      durable_manifest_sha256: sha256File(SOURCE_PATHS.manifest),
      attachment_count: manifest.attachments.length,
      attachment_bytes: manifest.attachment_counts.total_bytes,
    },
    status: 'candidate_review_package_only',
  }
}

function reviewMarkdown(pkg) {
  const langta = pkg.blockers[0]
  const incremental = pkg.geometryImports.filter((row) => row.source_admission)
  return `# Route Data Import Review

## Candidate closure

- Geometry candidates: ${pkg.geometryImports.length} (map ${pkg.summary.geometry.display_mode.map}, trace-only ${pkg.summary.geometry.display_mode.trace_only})
- New route corridor content: ${pkg.contentImports.length} (ready ${pkg.summary.content.ready}, blocked ${pkg.summary.content.blocked})
- User-supplied cover plan: ${pkg.coverImports.length} images across ${pkg.summary.covers.project_count} projects
- Existing entity association proposals: ${pkg.existingEntityUpdates.length}
- Incremental Base geometries: ${incremental.length}; product-approved missing-coordinate rows: ${incremental.filter((row) => row.source_admission.decision === 'product_approved_missing_canonical_coordinate').length}
- Product distance, duration, ascent, difficulty, and route copy overwritten: 0

## Hard blocker

- \`${langta.effective_canonical_key}\` ${langta.primary_name}: no reviewed WGS84 area coordinate and no track. It must not be imported until the coordinate is supplied.

## Existing entity proposals

- \`gangrenboqi-cluster\`: retain the existing key/id, represent the product as the mountain body, and bind 冈仁波齐转山环线. The existing 4000m value remains a product decision because the R1 proposal does not establish it as mountain altitude.
- \`hutiaoxia-gaolu-route\`: reuse the existing route corridor, retain 22km, and add only the R1 aliases/related-mountain proposal.

## Data boundaries

- Track geometry is a reviewed shape candidate, not navigation and not a source for product distance, duration, ascent, or route highpoint.
- Kanas-Hemu and Wusun use the center of the reviewed track bbox only as an area coordinate; it is neither a summit nor a trailhead.
- Aotai and Bogeda may proceed only as inactive, unreadable closed-warning rows without geometry.
- Langta remains the sole hard blocker.
- All new rows remain \`is_active=false\` and \`is_readable=false\`.
- Original track attachments are planned for a private \`mountain-route-source\` bucket; this package creates no bucket, object, or public URL.
- Product-approved canonical-coordinate gaps remain \`geometry_review_status=pending\`; their missing coordinate is not fabricated and their distance screen is recorded as not run.
`
}

export function buildRouteDataPackage() {
  const manifest = readJson(SOURCE_PATHS.manifest)
  const sourceGeometries = readJsonl(SOURCE_PATHS.geometries)
  const sourceCovers = readJsonl(SOURCE_PATHS.covers)
  const sourceContent = readJsonl(SOURCE_PATHS.content)
  assertSourceClosure(manifest, sourceGeometries, sourceCovers, sourceContent)

  assert.equal(sourceGeometries.length, 196)
  assert.equal(sourceContent.length, 12)
  assert.equal(
    sourceGeometries.filter((row) => row.display_mode === 'map_candidate').length,
    192,
  )
  assert.equal(
    sourceGeometries.filter((row) => (
      row.display_mode === 'trace_only_candidate'
    )).length,
    4,
  )

  const contentKeys = new Set(
    sourceContent.map((row) => row.effective_canonical_key),
  )
  assert.equal(contentKeys.size, 12)
  const parentIds = existingMountainIds()
  const geometryImports = buildGeometryImports(
    sourceGeometries,
    contentKeys,
    parentIds,
  )
  const contentImports = buildContentImports(sourceContent, geometryImports)
  const coverImports = buildCoverImports(sourceCovers, contentImports)
  const existingEntityUpdates = buildExistingEntityUpdates(
    manifest.association_proposals,
  )
  const blockers = buildBlockers(contentImports)
  assertUnique(geometryImports, 'id', 'geometry import')
  assertUnique(contentImports, 'id', 'content import')
  assertUnique(coverImports, 'storage_object_path', 'cover import')
  assertUnique(coverImports, 'thumbnail_object_path', 'cover import')
  assert.equal(blockers.length, 1)
  assert.equal(blockers[0].effective_canonical_key, 'langta-ancient-trail-route')
  assert.deepEqual(
    contentImports
      .filter((row) => !geometryImports.some((geometry) => (
        geometry.effective_canonical_key === row.effective_canonical_key
      )))
      .map((row) => row.effective_canonical_key),
    [...NO_TRACK_KEYS],
  )

  const pkg = {
    blockers,
    contentImports,
    coverImports,
    existingEntityUpdates,
    geometryImports,
  }
  pkg.summary = buildSummary({
    manifest,
    ...pkg,
  })
  return pkg
}

export function buildArtifactFiles() {
  const pkg = buildRouteDataPackage()
  const files = new Map()
  files.set(OUTPUT_PATHS.geometries, stableJsonl(pkg.geometryImports))
  files.set(OUTPUT_PATHS.content, stableJsonl(pkg.contentImports))
  files.set(OUTPUT_PATHS.covers, stableJsonl(pkg.coverImports))
  files.set(OUTPUT_PATHS.updates, stableJsonl(pkg.existingEntityUpdates))
  files.set(OUTPUT_PATHS.blockers, blockersCsv(pkg.blockers))
  files.set(OUTPUT_PATHS.review, reviewMarkdown(pkg))

  const artifactSha256 = Object.fromEntries(
    [...files.entries()].map(([relativePath, body]) => [
      relativePath,
      sha256(body),
    ]),
  )
  const summary = {
    ...pkg.summary,
    artifact_sha256: artifactSha256,
  }
  files.set(OUTPUT_PATHS.summary, `${stableJson(summary, 2)}\n`)
  return { files, pkg, summary }
}

function writeAtomic(filePath, body) {
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, body)
  fs.renameSync(tempPath, filePath)
}

export function generateRouteDataPackage() {
  const artifacts = buildArtifactFiles()
  for (const [relativePath, body] of artifacts.files) {
    writeAtomic(path.join(PACKAGE_ROOT, relativePath), body)
  }
  return artifacts
}

export function checkRouteDataPackage() {
  const artifacts = buildArtifactFiles()
  for (const [relativePath, expected] of artifacts.files) {
    const filePath = path.join(PACKAGE_ROOT, relativePath)
    assert(fs.existsSync(filePath), `missing generated artifact: ${relativePath}`)
    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      expected,
      `generated artifact drift: ${relativePath}`,
    )
  }
  const residue = fs.readdirSync(PACKAGE_ROOT)
    .filter((name) => name.endsWith('.tmp'))
  assert.deepEqual(residue, [], 'transaction residue found')
  return artifacts
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const mode = process.argv[2] ?? 'generate'
  if (mode === 'generate') {
    const { summary } = generateRouteDataPackage()
    console.log(JSON.stringify(summary, null, 2))
  } else if (mode === 'check' || mode === '--check') {
    const { summary } = checkRouteDataPackage()
    console.log(JSON.stringify({
      checked: true,
      artifact_sha256: summary.artifact_sha256,
    }, null, 2))
  } else {
    throw new Error(`unknown mode: ${mode}`)
  }
}
