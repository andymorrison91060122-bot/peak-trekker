import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildActivationCandidatePackage,
  buildStableActivationOutputs,
} from '../scripts/mountains/build-route-activation-candidates.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MOUNTAINS_ROOT = path.join(REPO_ROOT, 'data/mountains')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function listRepoScratchDirs() {
  return fs.readdirSync(MOUNTAINS_ROOT)
    .filter((name) => /^route-activation-(left|right)-/.test(name))
    .sort()
}

function cleanupRepoScratchDirs() {
  for (const name of listRepoScratchDirs()) {
    fs.rmSync(path.join(MOUNTAINS_ROOT, name), { recursive: true, force: true })
  }
}

test('activation package promotes exactly 11 hidden route corridors and excludes Langta', () => {
  const pkg = buildActivationCandidatePackage()

  assert.equal(pkg.apply_supported, false)
  assert.equal(pkg.activation_rows.length, 11)
  assert.deepEqual(
    pkg.activation_rows.map((row) => row.effective_canonical_key),
    [
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
    ],
  )
  assert(pkg.activation_rows.every((row) => row.current.is_active === false))
  assert(pkg.activation_rows.every((row) => row.current.is_readable === false))
  assert(pkg.activation_rows.every((row) => row.target.is_active === true))
  assert(pkg.activation_rows.every((row) => row.target.is_readable === true))
  assert(pkg.activation_rows.every((row) => row.target.weather_enabled === false))
  assert.equal(
    pkg.blockers.some((row) => row.effective_canonical_key === 'langta-ancient-trail-route'),
    true,
  )
  assert.equal(
    pkg.blockers.find((row) => row.effective_canonical_key === 'langta-ancient-trail-route')?.reason_code,
    'missing_reliable_wgs84_area_coordinate_and_track',
  )
})

test('Gangrenboqi correction uses a government-confirmed 6656m mountain altitude and keeps the mountain entity', () => {
  const pkg = buildActivationCandidatePackage()

  assert.deepEqual(pkg.gangrenboqi_update.current, {
    access_status: 'pilgrimage_only',
    altitude: 4000,
    altitude_m_exact: 4000,
    entity_type: 'mountain',
    id: '137df8c2-10cd-5705-b65a-60a904744246',
    is_active: true,
    is_readable: true,
    name: '冈仁波齐周边山峰',
    weather_enabled: true,
  })
  assert.deepEqual(pkg.gangrenboqi_update.target, {
    access_status: 'pilgrimage_only',
    altitude: 6656,
    altitude_m_exact: 6656,
    entity_type: 'mountain',
    id: '137df8c2-10cd-5705-b65a-60a904744246',
    is_active: true,
    is_readable: true,
    name: '冈仁波齐',
    weather_enabled: true,
  })
  assert.equal(pkg.gangrenboqi_update.selected_source.altitude_m, 6656)
  assert.equal(pkg.gangrenboqi_update.cross_check.length, 1)
  assert.equal(pkg.gangrenboqi_update.bound_geometry.geometry_count, 1)
  assert.equal(pkg.gangrenboqi_update.bound_geometry.display_mode, 'map')
  assert.equal(
    pkg.gangrenboqi_update.estimated_ascent_hidden_reason,
    'pilgrimage_only_no_verified_route_ascent',
  )
})

test('activation counts are compare-and-swap ready and the delta is exactly +11/+11', () => {
  const pkg = buildActivationCandidatePackage()

  assert.deepEqual(pkg.counts.before, {
    active: 342,
    readable: 345,
    route_corridor_active: 9,
    route_corridor_readable: 9,
    total: 373,
  })
  assert.deepEqual(pkg.counts.after, {
    active: 353,
    readable: 356,
    route_corridor_active: 20,
    route_corridor_readable: 20,
    total: 373,
  })
  assert.deepEqual(pkg.counts.delta, {
    active: 11,
    readable: 11,
    route_corridor_active: 11,
    route_corridor_readable: 11,
    total: 0,
  })
})

test('geometry and honest empty-state expectations are preserved for activation review', () => {
  const pkg = buildActivationCandidatePackage()
  const byKey = new Map(pkg.activation_rows.map((row) => [row.effective_canonical_key, row]))

  assert.equal(byKey.get('genie-south-route')?.geometry.status, 'map')
  assert.equal(byKey.get('gongga-grand-loop-route')?.geometry.status, 'trace_only')
  assert.equal(byKey.get('aotai-traverse-route')?.geometry.status, 'missing')
  assert.equal(
    byKey.get('aotai-traverse-route')?.geometry.empty_state_title,
    '暂未收录参考轨迹',
  )
})

test('activation package binds 11/11 production readiness closure and non-empty access notes', () => {
  const pkg = buildActivationCandidatePackage()

  assert.equal(pkg.readiness.guard_ready_count, 11)
  assert.equal(pkg.readiness.all_guard_ready, true)

  for (const row of pkg.activation_rows) {
    assert.deepEqual(
      {
        cover_ready: row.readiness.cover_ready,
        description_ready: row.readiness.description_ready,
        risk_note_ready: row.readiness.risk_note_ready,
        route_note_ready: row.readiness.route_note_ready,
      },
      {
        cover_ready: true,
        description_ready: true,
        risk_note_ready: true,
        route_note_ready: true,
      },
      `missing guard readiness for ${row.effective_canonical_key}`,
    )
    assert.equal(typeof row.readiness.access_note, 'string')
    assert.notEqual(row.readiness.access_note.trim(), '')
  }
})

test('check command leaves no scratch residue inside the repo', () => {
  cleanupRepoScratchDirs()

  const result = spawnSync(
    process.execPath,
    ['scripts/mountains/build-route-activation-candidates.mjs', '--check'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(listRepoScratchDirs(), [])
})

test('stable outputs are byte-identical across independent scratch directories', () => {
  const leftDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-activation-left-'))
  const rightDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-activation-right-'))

  const left = buildStableActivationOutputs(leftDir)
  const right = buildStableActivationOutputs(rightDir)

  assert.deepEqual(
    {
      manifest: readJson(left.manifestPath),
      blockers: fs.readFileSync(left.blockersPath, 'utf8'),
      review: fs.readFileSync(left.reviewPath, 'utf8'),
    },
    {
      manifest: readJson(right.manifestPath),
      blockers: fs.readFileSync(right.blockersPath, 'utf8'),
      review: fs.readFileSync(right.reviewPath, 'utf8'),
    },
  )
})
