import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { buildImportPlan } from './s3a-import.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DATA_ROOT = path.join(REPO_ROOT, 'data/mountains/route-geometry')
const STAGE2_MIGRATION = 'supabase/migrations/20260730110000_p2_route_corridor_runtime.sql'
const PUBLIC_STORAGE_BASE =
  'https://mngofocdsmqrqimsdyzf.supabase.co/storage/v1/object/public'

const INPUT_PATHS = Object.freeze({
  sourceManifest: path.join(DATA_ROOT, 'source-manifest.json'),
  sourceContent: path.join(DATA_ROOT, 'source-route-content.jsonl'),
  geometry: path.join(DATA_ROOT, 'route-geometry-import.jsonl'),
  content: path.join(DATA_ROOT, 'route-content-import.jsonl'),
  covers: path.join(DATA_ROOT, 'route-cover-import.jsonl'),
  existingUpdates: path.join(DATA_ROOT, 'existing-entity-updates.jsonl'),
  stage3Summary: path.join(DATA_ROOT, 'route-import-summary.json'),
  stage2Migration: path.join(REPO_ROOT, STAGE2_MIGRATION),
})

const OUTPUT_PATHS = Object.freeze({
  plan: path.join(DATA_ROOT, 'route-ingest-plan.json'),
  review: path.join(DATA_ROOT, 'route-ingest-review.md'),
  blockers: path.join(DATA_ROOT, 'route-ingest-blockers.csv'),
})

const EXPECTED_STAGE3_SHA256 = Object.freeze({
  'source-manifest.json':
    '303750dc20b01e354e82cc998b476dfeafe697d7090b5c04ebf0d5d3069f64b4',
  'source-route-content.jsonl':
    'bbaf62e1c76e02f9ecb47ba6e8bc32b21b32abd51529ee9ec8c761f808a2efbe',
  'route-geometry-import.jsonl':
    'a1bd5e9efd151f4908c0a4f180221986dd165e93e57c1b8079595435c93d906e',
  'route-content-import.jsonl':
    'fefb072d776d033833a1a1ee62836ff93bdcc499ddee709437cd77408902f581',
  'route-cover-import.jsonl':
    '9733218984620bb35be874cfbd571720b748ca08e8edeae65ca683f6dd457f40',
  'existing-entity-updates.jsonl':
    '7a83e88414ff44138929979e39f9a82424f29a1e11656ffdc77f844203307120',
  'route-import-summary.json':
    'ec573a1b10bbce4be4aff66b38d18665cdd90d9e3ea1ee532f58582acdd75c27',
})

const EXPECTED_STAGE2_MIGRATION_SHA256 =
  'e9becd44ea6c44fa3167b3dc1ec4aa758c156c30bc3500b253b26cbec77250e9'

const EXPECTED_FROZEN_INPUTS = Object.freeze({
  effective_canonicals:
    '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  entity_semantics:
    '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
  enrichment:
    'b3f43ef40e009c35ee1ca96aed9d55038afe4eb76a39b9c7bb37f2e4404cfee5',
})

const EXPECTED_COORDINATOR_MANIFEST_SHA256 =
  'c434e0042e83ece7be424f33916dca70b053a69f8d3fc902dbeb4d1af81caf84'

const DIFFICULTY_TO_MIN_LICENSE = Object.freeze({
  beginner: 'none',
  intermediate: 'basic',
  advanced: 'intermediate',
  expert: 'advanced',
})

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en')
}

function sortRecords(rows, fields) {
  return [...rows].sort((left, right) => {
    for (const field of fields) {
      const comparison = compareText(left[field] ?? '', right[field] ?? '')
      if (comparison !== 0) return comparison
    }
    return 0
  })
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, stableValue(value[key])]),
  )
}

export function buildStablePlanBody(plan) {
  return `${JSON.stringify(stableValue(plan), null, 2)}\n`
}

export function assertFrozenSha({ filePath, expectedSha256, label }) {
  const actual = fileSha256(filePath)
  assert.equal(actual, expectedSha256, `frozen input SHA mismatch: ${label}`)
  return actual
}

function assertStage3Inputs() {
  const byName = {
    'source-manifest.json': INPUT_PATHS.sourceManifest,
    'source-route-content.jsonl': INPUT_PATHS.sourceContent,
    'route-geometry-import.jsonl': INPUT_PATHS.geometry,
    'route-content-import.jsonl': INPUT_PATHS.content,
    'route-cover-import.jsonl': INPUT_PATHS.covers,
    'existing-entity-updates.jsonl': INPUT_PATHS.existingUpdates,
    'route-import-summary.json': INPUT_PATHS.stage3Summary,
  }
  return Object.fromEntries(
    Object.entries(byName).map(([name, filePath]) => [
      name,
      assertFrozenSha({
        filePath,
        expectedSha256: EXPECTED_STAGE3_SHA256[name],
        label: name,
      }),
    ]),
  )
}

function resolveAttachment(attachmentsRoot, relativePath) {
  assert(path.isAbsolute(attachmentsRoot), 'attachments root must be absolute')
  assert(
    relativePath.startsWith('attachments/'),
    `attachment path must start with attachments/: ${relativePath}`,
  )
  const root = path.resolve(attachmentsRoot)
  const resolved = path.resolve(
    root,
    relativePath.slice('attachments/'.length),
  )
  assert(
    resolved === root || resolved.startsWith(`${root}${path.sep}`),
    `attachment path escapes root: ${relativePath}`,
  )
  assert(fs.statSync(resolved).isFile(), `attachment is not a file: ${relativePath}`)
  return resolved
}

function verifyAttachment(attachmentsRoot, manifestAttachment) {
  const filePath = resolveAttachment(
    attachmentsRoot,
    manifestAttachment.relative_path,
  )
  const bytes = fs.statSync(filePath).size
  const digest = fileSha256(filePath)
  assert.equal(
    bytes,
    manifestAttachment.bytes,
    `attachment byte mismatch: ${manifestAttachment.relative_path}`,
  )
  assert.equal(
    digest,
    manifestAttachment.sha256,
    `attachment SHA mismatch: ${manifestAttachment.relative_path}`,
  )
  return { bytes, digest, filePath }
}

function imageMime(format) {
  const mime = {
    avif: 'image/avif',
    gif: 'image/gif',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    tiff: 'image/tiff',
    webp: 'image/webp',
  }[format]
  assert(mime, `unsupported image format: ${format}`)
  return mime
}

function publicStorageUrl(bucket, objectPath) {
  return `${PUBLIC_STORAGE_BASE}/${bucket}/${objectPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

function deriveProvinceContract() {
  const existingRows = buildImportPlan().rows
  const provinceByFullName = new Map()
  const minLicenseByDifficulty = new Map()

  for (const row of existingRows) {
    row.provinces.forEach((fullName, index) => {
      const next = {
        code: row.province_codes[index],
        displayName: index === 0 ? row.province : fullName,
        fullName,
      }
      const current = provinceByFullName.get(fullName)
      if (current) {
        assert.equal(current.code, next.code, `province code drift: ${fullName}`)
        if (index === 0) {
          assert.equal(
            current.displayName,
            next.displayName,
            `province display drift: ${fullName}`,
          )
        }
      } else {
        provinceByFullName.set(fullName, next)
      }
    })

    const currentLicense = minLicenseByDifficulty.get(row.difficulty)
    if (currentLicense) {
      assert.equal(
        currentLicense,
        row.min_license,
        `difficulty license mapping drift: ${row.difficulty}`,
      )
    } else {
      minLicenseByDifficulty.set(row.difficulty, row.min_license)
    }
  }

  assert.deepEqual(
    Object.fromEntries(minLicenseByDifficulty),
    DIFFICULTY_TO_MIN_LICENSE,
  )
  return { provinceByFullName, minLicenseByDifficulty }
}

function assertUnique(rows, field, label) {
  const seen = new Set()
  for (const row of rows) {
    assert(!seen.has(row[field]), `${label} duplicate ${field}: ${row[field]}`)
    seen.add(row[field])
  }
}

function countGeometryPoints(geometry) {
  assert.equal(geometry.type, 'MultiLineString')
  return geometry.coordinates.reduce(
    (total, segment) => total + segment.length,
    0,
  )
}

function geometryBbox(geometry) {
  const points = geometry.coordinates.flat()
  assert(points.length >= 2, 'geometry must contain at least two points')
  const longitudes = points.map((point) => point[0])
  const latitudes = points.map((point) => point[1])
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ]
}

function chooseAccessSource(sourceContent) {
  const preferredSupports = new Set([
    'closure',
    'continuing_enforcement',
    'access',
    'access_status',
    'protected_area_restriction',
  ])
  return (
    sourceContent.sources.find((source) =>
      source.supports.some((support) => preferredSupports.has(support)),
    )?.url ?? null
  )
}

function buildFieldReviewStatus(content) {
  return {
    access_status: content.access_evidence_status,
    coordinate: content.coordinate.source_kind,
    content: 'stage3_candidate_reviewed',
    cover: 'approved_by_user',
    geometry: 'separate_reviewed_candidate',
    route_highpoint_m:
      content.route_highpoint_m == null
        ? 'not_provided'
        : 'explicit_candidate_value',
  }
}

function buildMountainInsert({
  content,
  sourceContent,
  coverOriginals,
  coverThumbnails,
  provinceContract,
}) {
  assert.equal(content.import_status, 'ready')
  assert.equal(content.entity_type, 'route_corridor')
  assert(content.coordinate, `ready content missing coordinate: ${content.effective_canonical_key}`)
  assert.equal(content.latitude, content.coordinate.latitude)
  assert.equal(content.longitude, content.coordinate.longitude)
  assert.equal(content.altitude, null)
  assert.equal(content.altitude_m_exact, null)
  assert(Array.isArray(content.route_reference) && content.route_reference.length === 1)
  assert(
    'distance_km_range' in content.route_reference[0],
    `route distance range missing: ${content.effective_canonical_key}`,
  )

  const provinces = content.provinces.map((fullName) => {
    const mapping = provinceContract.provinceByFullName.get(fullName)
    assert(mapping, `missing province mapping for ${fullName}`)
    return mapping
  })
  const minLicense = provinceContract.minLicenseByDifficulty.get(
    content.difficulty,
  )
  assert(minLicense, `missing min_license mapping for ${content.difficulty}`)

  assert(coverOriginals.length > 0, `missing ready cover: ${content.effective_canonical_key}`)
  assert.equal(coverOriginals.length, coverThumbnails.length)
  const thumbnailByToken = new Map(
    coverThumbnails.map((row) => [row.file_token, row]),
  )
  const imageLicenseManifest = coverOriginals.map((cover) => {
    const thumbnail = thumbnailByToken.get(cover.file_token)
    assert(thumbnail, `missing thumbnail plan for ${cover.file_token}`)
    return {
      attribution_text: '用户自有图片',
      author: null,
      compressed: false,
      file_sha256: cover.sha256,
      filename: cover.source_file_name,
      height: cover.height,
      is_illustrative: false,
      license_id: 'user_owned',
      license_url: null,
      mime_type: cover.mime_type,
      order: cover.order,
      original_file_sha256: cover.sha256,
      original_size_bytes: cover.verified_bytes,
      provider: 'user_supplied',
      public_url: cover.public_url,
      review_status: 'approved_by_user',
      source_url: null,
      storage_path: cover.object_path,
      stored_size_bytes: cover.verified_bytes,
      thumbnail_path: thumbnail.object_path,
      thumbnail_url: thumbnail.public_url,
      width: cover.width,
    }
  })
  const sourcePayloadHashes = {
    route_content_import_sha256: sha256(
      JSON.stringify(stableValue(content)),
    ),
    route_content_source_sha256: sha256(
      JSON.stringify(stableValue(sourceContent)),
    ),
    stage3_source_manifest_sha256:
      EXPECTED_STAGE3_SHA256['source-manifest.json'],
  }
  const sourcePayloadSha = sha256(JSON.stringify(stableValue({
    effective_canonical_key: content.effective_canonical_key,
    ...sourcePayloadHashes,
  })))

  return {
    access_note: content.access_note,
    access_source: chooseAccessSource(sourceContent),
    access_status: content.access_status,
    aliases: [...content.aliases],
    altitude: null,
    altitude_m_exact: null,
    checkin_count: 0,
    closed_basis: null,
    coordinate_kind: 'area',
    coordinate_precision_decimals: null,
    coordinate_provenance: {
      coordinate_role: content.coordinate.coordinate_role,
      datum: content.coordinate.datum,
      note: content.coordinate.note,
      precision: content.coordinate.precision,
      source_class: content.coordinate.source_class,
      source_id: content.coordinate.source_id,
      source_kind: content.coordinate.source_kind,
      stage: 'route_content_candidate_r1',
    },
    coordinate_source: content.coordinate.source_kind,
    coordinate_source_url: null,
    coordinate_status: 'resolved',
    cover_image: imageLicenseManifest[0].public_url,
    description: content.intro,
    difficulty: content.difficulty,
    effective_canonical_key: content.effective_canonical_key,
    entity_type: 'route_corridor',
    estimated_duration_minutes: null,
    field_review_status: buildFieldReviewStatus(content),
    gallery_images: imageLicenseManifest
      .slice(1)
      .map((image) => image.public_url),
    id: content.id,
    image_is_illustrative: false,
    image_license_manifest: imageLicenseManifest,
    intro_has_needs_review_claim: false,
    intro_review_claims: [],
    is_active: false,
    is_readable: false,
    latitude: content.latitude,
    length_km: null,
    longitude: content.longitude,
    min_license: minLicense,
    name: content.primary_name,
    province: provinces[0].displayName,
    province_code: provinces[0].code,
    province_codes: provinces.map((province) => province.code),
    provinces: provinces.map((province) => province.fullName),
    quality_tier: null,
    risk_note: content.risk_note,
    route_highpoint_m: content.route_highpoint_m,
    route_note: content.route_note,
    route_preview_image: null,
    route_reference: content.route_reference,
    semantic_review_status: 'needs_review',
    source_payload_hashes: sourcePayloadHashes,
    source_payload_sha256: sourcePayloadSha,
    summit_radius_m: null,
    weather_enabled: false,
    weather_priority_tier: 'C',
    weather_zone_id: null,
  }
}

async function buildCoverPlans({
  covers,
  contentByKey,
  attachmentByToken,
  attachmentsRoot,
  scratchDir,
}) {
  fs.mkdirSync(scratchDir, { recursive: true })
  const originals = []
  const thumbnails = []
  const held = []

  for (const cover of sortRecords(covers, [
    'effective_canonical_key',
    'order',
    'file_token',
  ])) {
    const content = contentByKey.get(cover.effective_canonical_key)
    assert(content, `cover has no content parent: ${cover.effective_canonical_key}`)
    const manifestAttachment = attachmentByToken.get(cover.file_token)
    assert(manifestAttachment, `cover missing from source manifest: ${cover.file_token}`)
    assert.equal(manifestAttachment.kind, 'cover')
    assert.equal(manifestAttachment.relative_path, cover.source_attachment_path)
    assert.equal(manifestAttachment.record_id, cover.source_record_id)
    assert.equal(manifestAttachment.sha256, cover.source_file_sha256)
    assert.equal(manifestAttachment.bytes, cover.source_file_bytes)
    const verified = verifyAttachment(attachmentsRoot, manifestAttachment)

    if (content.import_status !== 'ready') {
      held.push({
        effective_canonical_key: cover.effective_canonical_key,
        file_token: cover.file_token,
        reason: 'parent_content_blocked',
        source_relative_path: manifestAttachment.relative_path,
        source_file_name: cover.source_file_name,
        source_file_sha256: cover.source_file_sha256,
        verified_bytes: verified.bytes,
        verified_sha256: verified.digest,
      })
      continue
    }

    const sourceBuffer = fs.readFileSync(verified.filePath)
    const metadata = await sharp(sourceBuffer).metadata()
    assert(metadata.width && metadata.height && metadata.format)
    const mimeType = imageMime(metadata.format)
    assert(mimeType.startsWith('image/'))

    originals.push({
      bucket: 'mountain-media',
      collision_policy: 'reuse_only_if_existing_sha_matches',
      effective_canonical_key: cover.effective_canonical_key,
      file_token: cover.file_token,
      height: metadata.height,
      mime_type: mimeType,
      object_path: cover.storage_object_path,
      order: cover.order,
      public_url: publicStorageUrl(
        'mountain-media',
        cover.storage_object_path,
      ),
      sha256: verified.digest,
      source_file_name: cover.source_file_name,
      source_relative_path: manifestAttachment.relative_path,
      upsert: false,
      verified_bytes: verified.bytes,
      width: metadata.width,
    })

    const thumbnailBuffer = await sharp(sourceBuffer)
      .rotate()
      .resize(960, 520, { fit: 'cover', position: 'centre' })
      .webp({ quality: 78, effort: 4, smartSubsample: true })
      .toBuffer()
    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata()
    assert.equal(thumbnailMetadata.format, 'webp')
    assert.equal(thumbnailMetadata.width, 960)
    assert.equal(thumbnailMetadata.height, 520)
    const thumbnailSha = sha256(thumbnailBuffer)
    const scratchPath = path.join(scratchDir, `${thumbnailSha}.webp`)
    fs.writeFileSync(scratchPath, thumbnailBuffer)

    thumbnails.push({
      bucket: 'mountain-media',
      bytes: thumbnailBuffer.length,
      collision_policy: 'reuse_only_if_existing_sha_matches',
      effective_canonical_key: cover.effective_canonical_key,
      file_token: cover.file_token,
      height: 520,
      mime_type: 'image/webp',
      object_path: cover.thumbnail_object_path,
      order: cover.order,
      public_url: publicStorageUrl(
        'mountain-media',
        cover.thumbnail_object_path,
      ),
      quality: 78,
      sha256: thumbnailSha,
      source_file_sha256: verified.digest,
      upsert: false,
      width: 960,
    })
  }

  return {
    held: sortRecords(held, ['effective_canonical_key', 'file_token']),
    originals: sortRecords(originals, [
      'effective_canonical_key',
      'order',
      'file_token',
    ]),
    thumbnails: sortRecords(thumbnails, [
      'effective_canonical_key',
      'order',
      'file_token',
    ]),
  }
}

function buildGeometryPlans({
  geometries,
  attachmentByToken,
  attachmentsRoot,
}) {
  const inserts = []
  const uploads = []

  for (const geometry of sortRecords(geometries, [
    'effective_canonical_key',
    'id',
  ])) {
    const manifestAttachment = attachmentByToken.get(
      geometry.source_file_token,
    )
    assert(
      manifestAttachment,
      `track missing from source manifest: ${geometry.source_file_token}`,
    )
    assert.equal(manifestAttachment.kind, 'track')
    assert.equal(manifestAttachment.record_id, geometry.source_record_id)
    assert.equal(manifestAttachment.sha256, geometry.source_file_sha256)
    assert.equal(manifestAttachment.bytes, geometry.source_file_bytes)
    assert.equal(manifestAttachment.field, '轨迹文件')
    const verified = verifyAttachment(attachmentsRoot, manifestAttachment)

    const bbox = geometryBbox(geometry.geometry)
    assert.deepEqual(bbox, [
      geometry.bbox.min_longitude,
      geometry.bbox.min_latitude,
      geometry.bbox.max_longitude,
      geometry.bbox.max_latitude,
    ])
    assert.equal(countGeometryPoints(geometry.geometry), geometry.point_count)
    assert.equal(
      geometry.geometry.coordinates.length,
      geometry.segment_count,
    )

    inserts.push({
      bbox,
      display_mode: geometry.display_mode,
      id: geometry.id,
      mountain_id: geometry.mountain_id,
      point_count: geometry.point_count,
      review_status: 'approved',
      segment_count: geometry.segment_count,
      simplified_geometry: geometry.geometry,
      source_field_name: '轨迹文件',
      source_file_name: geometry.source_file_name,
      source_file_sha256: geometry.source_file_sha256,
      source_record_id: geometry.source_record_id,
    })
    uploads.push({
      bucket: 'mountain-route-source',
      collision_policy: 'reuse_only_if_existing_sha_matches',
      effective_canonical_key: geometry.effective_canonical_key,
      object_path: geometry.source_object_path,
      public_url: null,
      source_file_name: geometry.source_file_name,
      source_file_sha256: geometry.source_file_sha256,
      source_relative_path: manifestAttachment.relative_path,
      upsert: false,
      verified_bytes: verified.bytes,
      verified_sha256: verified.digest,
      visibility: 'private',
    })
  }

  assertUnique(inserts, 'id', 'geometry inserts')
  assertUnique(uploads, 'object_path', 'private track uploads')
  return { inserts, uploads }
}

function buildExistingEntityPlans(existingUpdates) {
  const gangrenboqi = existingUpdates.find(
    (row) => row.existing_effective_canonical_key === 'gangrenboqi-cluster',
  )
  const hutiaoxia = existingUpdates.find(
    (row) => row.existing_effective_canonical_key === 'hutiaoxia-gaolu-route',
  )
  assert(gangrenboqi, 'missing Gangrenboqi association proposal')
  assert(hutiaoxia, 'missing Hutiaoxia association proposal')

  return {
    holds: [
      {
        effective_canonical_key:
          gangrenboqi.existing_effective_canonical_key,
        id: gangrenboqi.existing_id,
        held_fields: [
          'name',
          'entity_type',
          'catalog_entity_kind',
          'altitude',
          'route_binding',
        ],
        reason: 'product_semantics_and_altitude_require_separate_decision',
      },
    ],
    updates: [
      {
        add_aliases: hutiaoxia.proposed_route_aliases,
        compare_and_swap: {
          expected_current_source: 'production_target_snapshot.hutiaoxia',
          fields: [
            'id',
            'effective_canonical_key',
            'aliases',
            'length_km',
          ],
          on_mismatch: 'hard_failure',
          required: true,
        },
        effective_canonical_key:
          hutiaoxia.existing_effective_canonical_key,
        id: hutiaoxia.existing_id,
        operation: 'merge_aliases',
        provenance_only: {
          proposed_related_mountain_keys:
            hutiaoxia.proposed_related_mountain_keys,
          retain_length_km: hutiaoxia.retain_length_km,
        },
      },
    ],
  }
}

function buildBlockers(plan) {
  return [
    ...plan.holds.blocked_content.map((row) => ({
      action: 'hold_content',
      blocker_code: row.blocker_codes.join('|'),
      effective_canonical_key: row.effective_canonical_key,
      reason: 'missing reliable WGS84 area coordinate',
    })),
    ...plan.holds.held_covers.map((row) => ({
      action: 'hold_cover',
      blocker_code: 'parent_content_blocked',
      effective_canonical_key: row.effective_canonical_key,
      reason: 'cover remains in candidate package until parent content is ready',
    })),
    ...plan.holds.existing_entity_updates.map((row) => ({
      action: 'hold_existing_update',
      blocker_code: 'separate_product_decision_required',
      effective_canonical_key: row.effective_canonical_key,
      reason: row.reason,
    })),
  ]
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function buildBlockersCsv(plan) {
  const columns = [
    'effective_canonical_key',
    'action',
    'blocker_code',
    'reason',
  ]
  const rows = buildBlockers(plan)
  return `${[
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n')}\n`
}

function buildReview(plan) {
  const summary = plan.summary
  return `# Stage 4 Route Ingest Dry-Run Review

## Decision

- Status: dry-run package only; no migration, database, Storage, Feishu, activation, or publication action was executed.
- Stage 2 migration is a required but unapplied prerequisite.
- Collision policy: an existing object may be reused only when its SHA-256 matches; a different SHA is a hard failure. Every planned upload uses \`upsert=false\`.

## Planned Closure

| Operation | Count |
|---|---:|
| New inactive route corridor rows | ${summary.new_mountain_rows} |
| Approved geometry rows | ${summary.geometry_rows} |
| Private KML source objects | ${summary.private_track_objects} |
| Ready cover originals | ${summary.cover_originals} |
| Runtime thumbnails (960x520 WebP q78) | ${summary.cover_thumbnails} |
| Existing entity updates ready | ${summary.ready_existing_updates} |
| Blocked content rows | ${summary.blocked_content} |
| Held covers | ${summary.held_covers} |
| Held existing semantic updates | ${summary.held_existing_updates} |

## Product Truth Boundaries

- Tracks supply reviewed display geometry only. They do not overwrite distance, duration, ascent, difficulty, or route copy.
- The 11 new rows remain \`is_active=false\` and \`is_readable=false\`.
- Route altitude columns remain null; only explicit candidate \`route_highpoint_m\` values are planned.
- Route distance and duration ranges remain inside \`route_reference\`; \`length_km\` and \`estimated_duration_minutes\` stay null.
- Raw KML is planned for the private \`mountain-route-source\` bucket and has no public URL.
- Langta content and its cover remain held. Aotai and Bogeda are valid closed-warning rows without geometry.
- Gangrenboqi geometry may be inserted, but its name, entity semantics, route binding, and existing altitude remain held for a separate product decision.
- Hutiaoxia is limited to an add-only alias merge; related mountain keys remain provenance only and the existing 22 km value is unchanged. A future apply must compare the current id, key, aliases, and length against a freshly captured production snapshot and fail on drift.

## Preconditions Before Any Future Apply

1. Independently review this plan and blockers.
2. Review and apply the Stage 2 route-corridor migration in a separate authorized task.
3. Capture the required read-only production target snapshot for existing geometry parents, absent new ids/keys, Hutiaoxia compare-and-swap fields, migration/schema state, and both buckets' collision sets.
4. Preserve all new rows as inactive and unreadable until a later activation review.
5. Never expose the raw attachment object path to the public frontend.
`
}

function buildMountainPayloads({
  content,
  sourceContent,
  coverPlans,
  provinceContract,
}) {
  const sourceContentByKey = new Map(
    sourceContent.map((row) => [row.effective_canonical_key, row]),
  )
  const originalsByKey = Map.groupBy(
    coverPlans.originals,
    (row) => row.effective_canonical_key,
  )
  const thumbnailsByKey = Map.groupBy(
    coverPlans.thumbnails,
    (row) => row.effective_canonical_key,
  )

  return sortRecords(
    content
      .filter((row) => row.import_status === 'ready')
      .map((row) => {
        const source = sourceContentByKey.get(row.effective_canonical_key)
        assert(source, `missing source content: ${row.effective_canonical_key}`)
        return buildMountainInsert({
          content: row,
          sourceContent: source,
          coverOriginals: originalsByKey.get(row.effective_canonical_key) ?? [],
          coverThumbnails:
            thumbnailsByKey.get(row.effective_canonical_key) ?? [],
          provinceContract,
        })
      }),
    ['effective_canonical_key'],
  )
}

function assertFinalClosure(plan) {
  assert.equal(plan.operations.mountain_inserts.length, 11)
  assert.equal(plan.operations.geometry_inserts.length, 74)
  assert.equal(plan.operations.private_track_uploads.length, 74)
  assert.equal(plan.operations.cover_original_uploads.length, 15)
  assert.equal(plan.operations.cover_thumbnail_uploads.length, 15)
  assert.equal(plan.holds.blocked_content.length, 1)
  assert.equal(
    plan.holds.blocked_content[0].effective_canonical_key,
    'langta-ancient-trail-route',
  )
  assert.equal(plan.holds.held_covers.length, 1)
  assert.equal(
    plan.holds.held_covers[0].effective_canonical_key,
    'langta-ancient-trail-route',
  )
  assert.equal(plan.holds.existing_entity_updates.length, 1)
  assert.equal(
    plan.holds.existing_entity_updates[0].effective_canonical_key,
    'gangrenboqi-cluster',
  )
  assert.equal(plan.operations.existing_entity_updates.length, 1)
  assert.equal(
    plan.operations.existing_entity_updates[0].effective_canonical_key,
    'hutiaoxia-gaolu-route',
  )

  assertUnique(plan.operations.mountain_inserts, 'id', 'mountain inserts')
  assertUnique(
    plan.operations.cover_original_uploads,
    'object_path',
    'cover originals',
  )
  assertUnique(
    plan.operations.cover_thumbnail_uploads,
    'object_path',
    'cover thumbnails',
  )

  for (const mountain of plan.operations.mountain_inserts) {
    assert.equal(mountain.is_active, false)
    assert.equal(mountain.is_readable, false)
    assert.equal(mountain.altitude, null)
    assert.equal(mountain.altitude_m_exact, null)
    assert.equal(mountain.length_km, null)
    assert.equal(mountain.estimated_duration_minutes, null)
  }

  const noTrackKeys = new Set([
    'aotai-traverse-route',
    'bogeda-grand-loop-route',
    'langta-ancient-trail-route',
  ])
  const newGeometryKeys = new Set(
    plan.operations.private_track_uploads
      .map((row) => row.effective_canonical_key)
      .filter((key) => key.endsWith('-route')),
  )
  for (const key of noTrackKeys) assert(!newGeometryKeys.has(key))
}

export async function buildRouteIngestPlan({ attachmentsRoot, scratchDir }) {
  assert(attachmentsRoot, 'attachmentsRoot is required')
  assert(scratchDir, 'scratchDir is required')

  const stage3Sha256 = assertStage3Inputs()
  assertFrozenSha({
    filePath: INPUT_PATHS.stage2Migration,
    expectedSha256: EXPECTED_STAGE2_MIGRATION_SHA256,
    label: 'Stage 2 migration',
  })

  const sourceManifest = readJson(INPUT_PATHS.sourceManifest)
  const stage3Summary = readJson(INPUT_PATHS.stage3Summary)
  const geometries = readJsonl(INPUT_PATHS.geometry)
  const content = readJsonl(INPUT_PATHS.content)
  const covers = readJsonl(INPUT_PATHS.covers)
  const sourceContent = readJsonl(INPUT_PATHS.sourceContent)
  const existingUpdates = readJsonl(INPUT_PATHS.existingUpdates)

  assert.equal(
    sourceManifest.coordinator_source_manifest_sha256,
    EXPECTED_COORDINATOR_MANIFEST_SHA256,
  )
  assert.equal(
    sourceManifest.source_products.route_content.path,
    'data/mountains/route-geometry/source-route-content.jsonl',
  )
  assert.equal(
    sourceManifest.source_products.route_content.sha256,
    stage3Sha256['source-route-content.jsonl'],
  )
  assert.deepEqual(sourceManifest.frozen_inputs, {
    effective_canonicals: {
      path: 'data/mountains/ledger/effective_canonicals.jsonl',
      sha256: EXPECTED_FROZEN_INPUTS.effective_canonicals,
    },
    entity_semantics: {
      path: 'data/mountains/ledger/entity-semantics.jsonl',
      sha256: EXPECTED_FROZEN_INPUTS.entity_semantics,
    },
    enrichment: {
      path: 'data/mountains/ledger/effective-canonical-enrichment.jsonl',
      sha256: EXPECTED_FROZEN_INPUTS.enrichment,
    },
  })
  assert.equal(stage3Summary.geometry.count, 74)
  assert.equal(stage3Summary.geometry.geo_conflicts, 0)
  assert.equal(stage3Summary.content.ready, 11)
  assert.equal(stage3Summary.content.blocked, 1)
  assert.equal(stage3Summary.covers.attachment_count, 16)

  const attachmentByToken = new Map()
  for (const attachment of sourceManifest.attachments) {
    assert(
      !attachmentByToken.has(attachment.file_token),
      `duplicate attachment token: ${attachment.file_token}`,
    )
    attachmentByToken.set(attachment.file_token, attachment)
  }

  const contentByKey = new Map(
    content.map((row) => [row.effective_canonical_key, row]),
  )
  const geometryPlans = buildGeometryPlans({
    geometries,
    attachmentByToken,
    attachmentsRoot,
  })
  const coverPlans = await buildCoverPlans({
    covers,
    contentByKey,
    attachmentByToken,
    attachmentsRoot,
    scratchDir,
  })
  const provinceContract = deriveProvinceContract()
  const mountainInserts = buildMountainPayloads({
    content,
    sourceContent,
    coverPlans,
    provinceContract,
  })
  const existingEntityPlans = buildExistingEntityPlans(existingUpdates)
  const blockedContent = content
    .filter((row) => row.import_status === 'blocked')
    .map((row) => ({
      blocker_codes: [...row.blocker_codes],
      effective_canonical_key: row.effective_canonical_key,
      id: row.id,
      import_status: row.import_status,
    }))

  const plan = {
    apply_supported: false,
    collision_policy: {
      existing_different_sha: 'hard_failure',
      existing_same_sha: 'reuse',
      overwrite_or_delete: 'forbidden',
      storage_upsert: false,
    },
    input_closure: {
      attachment_root_contract: 'explicit_cli_or_environment_input',
      coordinator_source_manifest_sha256:
        EXPECTED_COORDINATOR_MANIFEST_SHA256,
      frozen_inputs: EXPECTED_FROZEN_INPUTS,
      stage3_artifacts_sha256: stage3Sha256,
    },
    mode: 'dry_run_only',
    operation_order: [
      'apply_stage2_migration_in_separate_authorized_task',
      'preflight_schema_and_storage_collisions',
      'upload_private_track_sources',
      'upload_ready_cover_originals',
      'upload_ready_cover_thumbnails',
      'insert_inactive_route_corridors',
      'insert_approved_route_geometries',
      'merge_reviewed_hutiaoxia_aliases_with_compare_and_swap',
      'independent_activation_review',
    ],
    operations: {
      cover_original_uploads: coverPlans.originals,
      cover_thumbnail_uploads: coverPlans.thumbnails,
      existing_entity_updates: existingEntityPlans.updates,
      geometry_inserts: geometryPlans.inserts,
      mountain_inserts: mountainInserts,
      private_track_uploads: geometryPlans.uploads,
    },
    preconditions: {
      activation: {
        active_rows_written: 0,
        readable_rows_written: 0,
        status: 'not_authorized',
      },
      stage2_migration: {
        apply_in_this_stage: false,
        path: STAGE2_MIGRATION,
        sha256: EXPECTED_STAGE2_MIGRATION_SHA256,
        status: 'required_not_applied',
      },
      production_target_snapshot: {
        captured_in_this_stage: false,
        required_checks: {
          existing_geometry_parents: {
            expected_count: 65,
            fields: ['id', 'effective_canonical_key'],
            requirement: 'exact_identity_closure',
          },
          hutiaoxia: {
            expected_id: '9bef8995-54c4-5e7a-8b38-4342bb818faf',
            expected_key: 'hutiaoxia-gaolu-route',
            fields: ['id', 'effective_canonical_key', 'aliases', 'length_km'],
            requirement: 'capture_expected_current_for_compare_and_swap',
          },
          migration_and_schema: {
            migration_path: STAGE2_MIGRATION,
            requirement: 'capture_ledger_and_schema_state',
          },
          new_route_identities: {
            expected_count: 11,
            fields: ['id', 'effective_canonical_key'],
            requirement: 'all_absent',
          },
          storage_collisions: {
            buckets: ['mountain-media', 'mountain-route-source'],
            requirement: 'capture_existing_object_sha_by_planned_path',
          },
        },
        status: 'required_before_apply',
      },
      storage_buckets: {
        create_in_this_stage: false,
        private_track_bucket: 'mountain-route-source',
        public_media_bucket: 'mountain-media',
      },
    },
    schema_version: 'route-ingest-plan-v2',
    side_effects: {
      database_writes: 0,
      feishu_writes: 0,
      migration_applied: false,
      storage_writes: 0,
    },
    holds: {
      blocked_content: sortRecords(blockedContent, [
        'effective_canonical_key',
      ]),
      existing_entity_updates: existingEntityPlans.holds,
      held_covers: coverPlans.held,
    },
    summary: {
      blocked_content: blockedContent.length,
      cover_originals: coverPlans.originals.length,
      cover_thumbnails: coverPlans.thumbnails.length,
      geometry_rows: geometryPlans.inserts.length,
      held_covers: coverPlans.held.length,
      held_existing_updates: existingEntityPlans.holds.length,
      new_mountain_rows: mountainInserts.length,
      private_track_objects: geometryPlans.uploads.length,
      ready_existing_updates: existingEntityPlans.updates.length,
    },
  }

  assertFinalClosure(plan)
  return plan
}

function atomicWrite(filePath, body) {
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, body)
  fs.renameSync(tempPath, filePath)
}

export async function writeRouteIngestArtifacts(options) {
  const plan = await buildRouteIngestPlan(options)
  atomicWrite(OUTPUT_PATHS.plan, buildStablePlanBody(plan))
  atomicWrite(OUTPUT_PATHS.review, buildReview(plan))
  atomicWrite(OUTPUT_PATHS.blockers, buildBlockersCsv(plan))
  return plan
}

export async function checkRouteIngestArtifacts(options) {
  const plan = await buildRouteIngestPlan(options)
  const expected = new Map([
    [OUTPUT_PATHS.plan, buildStablePlanBody(plan)],
    [OUTPUT_PATHS.review, buildReview(plan)],
    [OUTPUT_PATHS.blockers, buildBlockersCsv(plan)],
  ])
  for (const [filePath, body] of expected) {
    assert(fs.existsSync(filePath), `missing generated artifact: ${filePath}`)
    assert.equal(
      fs.readFileSync(filePath, 'utf8'),
      body,
      `generated artifact drift: ${filePath}`,
    )
  }
  return plan
}

function parseCli(argv) {
  const mode = argv.includes('--plan')
    ? 'plan'
    : argv.includes('--check')
      ? 'check'
      : argv.includes('--apply')
        ? 'apply'
        : null
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag)
    return index === -1 ? null : argv[index + 1]
  }
  return {
    attachmentsRoot:
      valueAfter('--attachments-root')
      ?? process.env.P2_ROUTE_ATTACHMENTS_ROOT,
    mode,
    scratchDir:
      valueAfter('--scratch-dir')
      ?? process.env.P2_ROUTE_INGEST_SCRATCH_DIR,
  }
}

async function main() {
  const options = parseCli(process.argv.slice(2))
  assert(options.mode, 'use --plan or --check')
  assert.notEqual(options.mode, 'apply', '--apply is intentionally disabled')
  assert(options.attachmentsRoot, '--attachments-root is required')
  assert(options.scratchDir, '--scratch-dir is required')

  const plan = options.mode === 'plan'
    ? await writeRouteIngestArtifacts(options)
    : await checkRouteIngestArtifacts(options)
  process.stdout.write(
    `${JSON.stringify({
      mode: options.mode,
      side_effects: plan.side_effects,
      summary: plan.summary,
    })}\n`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
