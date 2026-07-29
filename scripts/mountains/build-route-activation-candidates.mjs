import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DATA_ROOT = path.join(REPO_ROOT, 'data/mountains/route-activation')
const ROUTE_GEOMETRY_ROOT = path.join(REPO_ROOT, 'data/mountains/route-geometry')

const INPUT_PATHS = Object.freeze({
  productionSnapshot: path.join(DATA_ROOT, 'source-production-snapshot.json'),
  gangrenboqiAltitude: path.join(DATA_ROOT, 'source-gangrenboqi-altitude.json'),
  routeContent: path.join(ROUTE_GEOMETRY_ROOT, 'route-content-import.jsonl'),
  routeGeometry: path.join(ROUTE_GEOMETRY_ROOT, 'route-geometry-import.jsonl'),
  routeCovers: path.join(ROUTE_GEOMETRY_ROOT, 'route-cover-import.jsonl'),
  existingUpdates: path.join(ROUTE_GEOMETRY_ROOT, 'existing-entity-updates.jsonl'),
})

const OUTPUT_PATHS = Object.freeze({
  manifest: path.join(DATA_ROOT, 'route-activation-manifest.json'),
  review: path.join(DATA_ROOT, 'route-activation-review.md'),
  blockers: path.join(DATA_ROOT, 'route-activation-blockers.csv'),
})

const ACTIVATION_KEYS = Object.freeze([
  'aotai-traverse-route',
  'bogeda-grand-loop-route',
  'everest-east-kama-valley-route',
  'genie-south-route',
  'gongga-grand-loop-route',
  'kanas-hemu-traverse-route',
  'kulagangri-trek-route',
  'luoke-route',
  'motuo-trek-route',
  'siguniang-changping-bipeng-route',
  'wusun-ancient-trail-route',
])

const EXCLUDED_KEY = 'langta-ancient-trail-route'
const GANGRENBOQI_KEY = 'gangrenboqi-cluster'

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath))
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en')
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

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim()
  return text ? text.split('\n').map((line) => JSON.parse(line)) : []
}

function assertUnique(rows, field, label) {
  const seen = new Set()
  for (const row of rows) {
    assert(!seen.has(row[field]), `${label} duplicate ${field}: ${row[field]}`)
    seen.add(row[field])
  }
}

function buildSourceMaps() {
  const productionSnapshot = readJson(INPUT_PATHS.productionSnapshot)
  const gangrenboqiAltitude = readJson(INPUT_PATHS.gangrenboqiAltitude)
  const routeContent = readJsonl(INPUT_PATHS.routeContent)
  const routeGeometry = readJsonl(INPUT_PATHS.routeGeometry)
  const routeCovers = readJsonl(INPUT_PATHS.routeCovers)
  const existingUpdates = readJsonl(INPUT_PATHS.existingUpdates)

  assert.equal(productionSnapshot.schema_version, 'route-activation-source-v2')
  assert.equal(gangrenboqiAltitude.schema_version, 'gangrenboqi-altitude-source-v1')

  assertUnique(routeContent, 'effective_canonical_key', 'route content')
  assertUnique(routeGeometry, 'effective_canonical_key', 'route geometry')
  assertUnique(existingUpdates, 'existing_effective_canonical_key', 'existing updates')

  return {
    productionSnapshot,
    gangrenboqiAltitude,
    routeContentByKey: new Map(routeContent.map((row) => [row.effective_canonical_key, row])),
    routeGeometryByKey: new Map(routeGeometry.map((row) => [row.effective_canonical_key, row])),
    routeCoverCountByKey: routeCovers.reduce((map, row) => {
      map.set(row.effective_canonical_key, (map.get(row.effective_canonical_key) ?? 0) + 1)
      return map
    }, new Map()),
    existingUpdateByKey: new Map(
      existingUpdates.map((row) => [row.existing_effective_canonical_key, row]),
    ),
    sourceSha256: Object.fromEntries(
      Object.entries(INPUT_PATHS).map(([key, filePath]) => [key, fileSha256(filePath)]),
    ),
  }
}

function buildGeometryProjection(routeGeometryByKey, key) {
  const geometry = routeGeometryByKey.get(key)
  if (!geometry) {
    return {
      geometry_id: null,
      status: 'missing',
      empty_state_copy:
        '可先查看路线说明与风险提示，具体行程请使用专业户外导航工具。',
      empty_state_title: '暂未收录参考轨迹',
      point_count: 0,
      segment_count: 0,
    }
  }

  return {
    geometry_id: geometry.id,
    status: geometry.display_mode,
    empty_state_copy: null,
    empty_state_title: null,
    point_count: geometry.point_count,
    segment_count: geometry.segment_count,
  }
}

function buildApplyPlan(activationRows, gangrenboqiUpdate) {
  const routeUpdates = activationRows.map((row) => ({
    effective_canonical_key: row.effective_canonical_key,
    expected_current: row.current,
    set: row.target,
  }))

  return {
    apply_supported: false,
    reason:
      'Candidate package only. Future production apply must compare-and-swap against a fresh live snapshot.',
    route_compare_and_swap: routeUpdates,
    gangrenboqi_compare_and_swap: {
      expected_current: gangrenboqiUpdate.current,
      set: gangrenboqiUpdate.target,
    },
  }
}

export function buildActivationCandidatePackage() {
  const {
    productionSnapshot,
    gangrenboqiAltitude,
    routeContentByKey,
    routeGeometryByKey,
    routeCoverCountByKey,
    existingUpdateByKey,
    sourceSha256,
  } = buildSourceMaps()

  const hiddenRouteRows = productionSnapshot.captured_from_production.hidden_route_rows
  assert.equal(hiddenRouteRows.length, 11)
  assert.deepEqual(
    hiddenRouteRows.map((row) => row.effective_canonical_key),
    ACTIVATION_KEYS,
  )

  const activationRows = ACTIVATION_KEYS.map((key) => {
    const current = hiddenRouteRows.find((row) => row.effective_canonical_key === key)
    const content = routeContentByKey.get(key)
    assert(current, `missing production snapshot row: ${key}`)
    assert(content, `missing route content row: ${key}`)
    assert.equal(content.import_status, 'ready')
    assert.equal(current.id, content.id, `id drift: ${key}`)
    assert.equal(current.entity_type, 'route_corridor', `entity_type drift: ${key}`)
    assert.equal(typeof current.access_note, 'string', `missing access_note: ${key}`)
    assert.notEqual(current.access_note.trim(), '', `blank access_note: ${key}`)
    assert.equal(current.cover_ready, true, `cover not ready: ${key}`)
    assert.equal(current.description_ready, true, `description not ready: ${key}`)
    assert.equal(current.risk_note_ready, true, `risk_note not ready: ${key}`)
    assert.equal(current.route_note_ready, true, `route_note not ready: ${key}`)

    return {
      effective_canonical_key: key,
      id: current.id,
      primary_name: content.primary_name,
      access_status: current.access_status,
      difficulty: content.difficulty,
      geometry: buildGeometryProjection(routeGeometryByKey, key),
      current: {
        entity_type: current.entity_type,
        id: current.id,
        is_active: current.is_active,
        is_readable: current.is_readable,
        weather_enabled: current.weather_enabled,
      },
      readiness: {
        cover_ready: current.cover_ready,
        description_ready: current.description_ready,
        risk_note_ready: current.risk_note_ready,
        route_note_ready: current.route_note_ready,
        access_note: current.access_note,
        readiness_hash: current.readiness_hash,
      },
      target: {
        entity_type: 'route_corridor',
        id: current.id,
        is_active: true,
        is_readable: true,
        weather_enabled: false,
      },
      route_highpoint_m: content.route_highpoint_m,
      compare_and_swap: {
        expected_current: {
          effective_canonical_key: key,
          id: current.id,
          is_active: false,
          is_readable: false,
          weather_enabled: false,
        },
        set: {
          is_active: true,
          is_readable: true,
          weather_enabled: false,
        },
      },
      activation_decision:
        current.access_status === 'closed' || current.access_status === 'restricted'
          ? 'activate_readable_with_warning'
          : 'activate_readable_route',
    }
  })

  const gangrenboqiCurrent = productionSnapshot.captured_from_production.gangrenboqi
  const gangrenboqiAssociation = existingUpdateByKey.get(GANGRENBOQI_KEY)
  assert(gangrenboqiAssociation, 'missing Gangrenboqi association proposal')
  assert.equal(gangrenboqiCurrent.entity_type, 'mountain')
  assert.equal(gangrenboqiCurrent.access_status, 'pilgrimage_only')

  const gangrenboqiGeometry = routeGeometryByKey.get(GANGRENBOQI_KEY)
  assert(gangrenboqiGeometry, 'missing Gangrenboqi reviewed route geometry')

  const gangrenboqiUpdate = {
    effective_canonical_key: GANGRENBOQI_KEY,
    id: gangrenboqiCurrent.id,
    current: {
      access_status: gangrenboqiCurrent.access_status,
      altitude: gangrenboqiCurrent.altitude,
      altitude_m_exact: gangrenboqiCurrent.altitude_m_exact,
      entity_type: gangrenboqiCurrent.entity_type,
      id: gangrenboqiCurrent.id,
      is_active: gangrenboqiCurrent.is_active,
      is_readable: gangrenboqiCurrent.is_readable,
      name: gangrenboqiCurrent.name,
      weather_enabled: gangrenboqiCurrent.weather_enabled,
    },
    target: {
      access_status: 'pilgrimage_only',
      altitude: gangrenboqiAltitude.selected.altitude_m,
      altitude_m_exact: gangrenboqiAltitude.selected.altitude_m,
      entity_type: 'mountain',
      id: gangrenboqiCurrent.id,
      is_active: true,
      is_readable: true,
      name: gangrenboqiAltitude.selected.primary_name,
      weather_enabled: gangrenboqiCurrent.weather_enabled,
    },
    selected_source: gangrenboqiAltitude.selected,
    cross_check: gangrenboqiAltitude.cross_check,
    current_product_conflict: gangrenboqiAltitude.current_product_conflict,
    estimated_ascent_hidden_reason: 'pilgrimage_only_no_verified_route_ascent',
    existing_semantic_proposal: {
      proposal_type: gangrenboqiAssociation.proposal_type,
      proposed_route_name: gangrenboqiAssociation.proposed_route_name,
      proposed_route_aliases: gangrenboqiAssociation.proposed_route_aliases,
    },
    bound_geometry: {
      geometry_count: 1,
      geometry_id: gangrenboqiGeometry.id,
      display_mode: gangrenboqiGeometry.display_mode,
    },
  }

  const excludedCoverCount = routeCoverCountByKey.get(EXCLUDED_KEY) ?? 0
  const excluded = {
    effective_canonical_key: EXCLUDED_KEY,
    decision: 'excluded_from_v1_activation',
    reason_code: 'missing_reliable_wgs84_area_coordinate_and_track',
    held_cover_count: excludedCoverCount,
    note: 'Do not import, activate, or fabricate coordinates for Langta in v1.',
  }

  const countsBefore = productionSnapshot.captured_from_production.mountain_counts
  const guardReadiness = productionSnapshot.captured_from_production.guard_readiness
  assert.equal(guardReadiness.guard_total, 11)
  assert.equal(guardReadiness.guard_ready_count, 11)
  assert.equal(guardReadiness.all_guard_ready, true)

  const counts = {
    before: {
      active: countsBefore.active,
      readable: countsBefore.readable_total,
      route_corridor_active: countsBefore.route_corridor_active,
      route_corridor_readable: countsBefore.route_corridor_readable,
      total: countsBefore.total,
    },
    after: {
      active: countsBefore.active + activationRows.length,
      readable: countsBefore.readable_total + activationRows.length,
      route_corridor_active: countsBefore.route_corridor_active + activationRows.length,
      route_corridor_readable:
        countsBefore.route_corridor_readable + activationRows.length,
      total: countsBefore.total,
    },
  }
  counts.delta = {
    active: counts.after.active - counts.before.active,
    readable: counts.after.readable - counts.before.readable,
    route_corridor_active:
      counts.after.route_corridor_active - counts.before.route_corridor_active,
    route_corridor_readable:
      counts.after.route_corridor_readable - counts.before.route_corridor_readable,
    total: counts.after.total - counts.before.total,
  }

  const blockers = [
    {
      effective_canonical_key: EXCLUDED_KEY,
      primary_name: routeContentByKey.get(EXCLUDED_KEY)?.primary_name ?? '狼塔古道',
      reason_code: excluded.reason_code,
      next_action: 'drop_from_v1_activation_keep_cover_held',
    },
  ]

  return {
    schema_version: 'route-activation-candidate-v1',
    baseline_origin_main: productionSnapshot.captured_from_production.origin_main,
    apply_supported: false,
    source_sha256: sourceSha256,
    readiness: {
      guard_ready_count: guardReadiness.guard_ready_count,
      guard_total: guardReadiness.guard_total,
      all_guard_ready: guardReadiness.all_guard_ready,
      blockers: guardReadiness.blockers,
    },
    counts,
    activation_rows: activationRows,
    gangrenboqi_update: gangrenboqiUpdate,
    excluded,
    blockers,
    visual_targets: {
      complete_map_route: 'genie-south-route',
      trace_only_route: 'gongga-grand-loop-route',
      closed_without_geometry: 'aotai-traverse-route',
      gangrenboqi: GANGRENBOQI_KEY,
    },
    apply_plan: buildApplyPlan(activationRows, gangrenboqiUpdate),
  }
}

function buildReviewMarkdown(pkg) {
  const activationLines = pkg.activation_rows
    .map(
      (row) =>
        `- \`${row.effective_canonical_key}\` ${row.primary_name}: ${row.access_status}, ${row.geometry.status}, target \`active/readable=true\`.`,
    )
    .join('\n')

  return `# Route Activation Candidate Review

- Status: candidate only; no production write, no activation, no commit.
- Baseline: \`${pkg.baseline_origin_main}\`
- Activation rows: ${pkg.activation_rows.length}
- Production guard-ready rows: ${pkg.readiness.guard_ready_count}/${pkg.readiness.guard_total}
- Active delta: +${pkg.counts.delta.active}
- Readable delta: +${pkg.counts.delta.readable}
- Langta: excluded from v1 activation.

## Activation Targets

${activationLines}

## Gangrenboqi Correction

- Current production name: \`${pkg.gangrenboqi_update.current.name}\`
- Current production altitude: ${pkg.gangrenboqi_update.current.altitude}m
- Candidate product name: \`${pkg.gangrenboqi_update.target.name}\`
- Candidate mountain altitude: ${pkg.gangrenboqi_update.target.altitude}m
- Estimated ascent display: hidden (${pkg.gangrenboqi_update.estimated_ascent_hidden_reason})
- Selected authority source: ${pkg.gangrenboqi_update.selected_source.publisher}
- Cross-check source count: ${pkg.gangrenboqi_update.cross_check.length}
- Bound route geometry display mode: \`${pkg.gangrenboqi_update.bound_geometry.display_mode}\`

## Excluded This Round

- \`${pkg.excluded.effective_canonical_key}\`: ${pkg.excluded.reason_code}; held covers=${pkg.excluded.held_cover_count}.
`
}

function buildBlockersCsv(pkg) {
  return [
    'effective_canonical_key,primary_name,reason_code,next_action',
    ...pkg.blockers.map((row) =>
      [
        row.effective_canonical_key,
        row.primary_name,
        row.reason_code,
        row.next_action,
      ].join(','),
    ),
    '',
  ].join('\n')
}

export function buildStableActivationOutputs(outputRoot = DATA_ROOT) {
  const pkg = buildActivationCandidatePackage()
  fs.mkdirSync(outputRoot, { recursive: true })

  const manifestPath = path.join(outputRoot, 'route-activation-manifest.json')
  const reviewPath = path.join(outputRoot, 'route-activation-review.md')
  const blockersPath = path.join(outputRoot, 'route-activation-blockers.csv')

  fs.writeFileSync(manifestPath, stableJson(pkg))
  fs.writeFileSync(reviewPath, buildReviewMarkdown(pkg))
  fs.writeFileSync(blockersPath, buildBlockersCsv(pkg))

  return {
    manifestPath,
    reviewPath,
    blockersPath,
  }
}

function compareOutputs(leftRoot, rightRoot) {
  const outputs = ['route-activation-manifest.json', 'route-activation-review.md', 'route-activation-blockers.csv']
  for (const file of outputs) {
    const left = fs.readFileSync(path.join(leftRoot, file))
    const right = fs.readFileSync(path.join(rightRoot, file))
    assert.equal(
      sha256(left),
      sha256(right),
      `determinism drift: ${file}`,
    )
  }
}

function run() {
  const command = process.argv[2] ?? 'generate'
  if (command === 'generate') {
    buildStableActivationOutputs(DATA_ROOT)
    return
  }

  if (command === '--check') {
    const scratchLeft = fs.mkdtempSync(path.join(os.tmpdir(), 'route-activation-left-'))
    const scratchRight = fs.mkdtempSync(path.join(os.tmpdir(), 'route-activation-right-'))
    try {
      buildStableActivationOutputs(DATA_ROOT)
      buildStableActivationOutputs(scratchLeft)
      buildStableActivationOutputs(scratchRight)
      compareOutputs(scratchLeft, scratchRight)
    } finally {
      fs.rmSync(scratchLeft, { recursive: true, force: true })
      fs.rmSync(scratchRight, { recursive: true, force: true })
    }
    return
  }

  throw new Error(`unknown command: ${command}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
}
