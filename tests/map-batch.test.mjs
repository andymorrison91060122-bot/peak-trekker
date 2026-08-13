import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  assertRegisterReady,
  auditMapAssetCoverage,
  buildCoveragePlan,
  buildRegistryProjection,
  computeFingerprint,
  computeRouteRevision,
  normalizeApprovedSnapshot,
  selectRunnableJobs,
} from '../scripts/maps/map-batch-lib.mjs'

const line = (id, mountainId, coordinates, overrides = {}) => ({
  id,
  mountain_id: mountainId,
  source_file_sha256: id.padEnd(64, '0').slice(0, 64),
  display_mode: 'map',
  review_status: 'approved',
  simplified_geometry: { type: 'MultiLineString', coordinates: [coordinates] },
  ...overrides,
})

test('coverage uses square Mercator fit, bounded padding, and calibrated zooms', () => {
  const plan = buildCoveragePlan([
    line('a', 'm1', [
      [103.558616, 30.899627],
      [103.570738, 30.913418],
    ]),
  ])

  assert.ok(Math.abs(plan.rawBaseZoom - 13.6215685872) < 0.05)
  assert.equal(plan.effectiveBaseZoom, plan.rawBaseZoom)
  assert.equal(plan.packageMinZoom, 13)
  assert.equal(plan.packageMaxZoom, 15)
  assert.equal(plan.userMaxZoom, 15)
  assert.ok(plan.paddingPerSideMeters > 0)
  assert.ok(plan.paddingPerSideMeters < 3_000)
})

test('coverage expands tiny routes to the product zoom ceiling', () => {
  const plan = buildCoveragePlan([
    line('b', 'm2', [
      [116.397, 39.908],
      [116.39701, 39.90801],
    ]),
  ])

  assert.ok(plan.rawBaseZoom > 15)
  assert.ok(Math.abs(plan.effectiveBaseZoom - 15) < 0.01)
  assert.equal(plan.userMinZoom, 15)
  assert.equal(plan.userMaxZoom, 15)
  assert.equal(plan.packageMinZoom, 14)
  assert.equal(plan.packageMaxZoom, 15)
})

test('K2 keeps its calibrated base while packaging the real 16:11 default tile zoom', () => {
  const plan = buildCoveragePlan([
    line('k2', 'k2', [
      [75.816742, 35.454111],
      [76.640947, 35.83504],
    ]),
  ])

  assert.ok(Math.abs(plan.effectiveBaseZoom - 8.10145) < 0.01)
  assert.ok(Math.abs(plan.runtimeFitZoom - 7.56088) < 0.01)
  assert.equal(plan.packageMinZoom, 7)
  assert.equal(plan.packageMaxZoom, 11)
})

test('map audit emits only missing valid approved mountains and machine reasons', () => {
  const audit = auditMapAssetCoverage({
    rows: [
      line('a', 'mapped', [[100, 30], [100.1, 30.1]]),
      line('b', 'trace', [[101, 31], [101.1, 31.1]], { display_mode: 'trace_only' }),
      line('c', 'missing-package', [[102, 32], [102.1, 32.1]]),
      line('d', 'invalid', [[103, 33], [Number.NaN, 33.1]]),
    ],
    assets: { mapped: { objectPath: 'mapped.pmtiles' } },
    jobs: [{ mountainId: 'missing-package', status: 'pending', localPath: '/missing.pmtiles' }],
    packageExists: () => false,
  })

  assert.deepEqual(audit, {
    approvedValidRouteMountainCount: 3,
    registryMapCount: 1,
    missingCount: 2,
    invalidGeometryCount: 1,
    missing: [
      { mountainId: 'missing-package', reason: 'package_missing' },
      { mountainId: 'trace', reason: 'trace_only' },
    ],
  })
  assert.equal(JSON.stringify(audit).includes('mapped.pmtiles'), false)
})

test('revision and fingerprint are stable across geometry ordering', () => {
  const left = line('a', 'm1', [[100, 30], [100.1, 30.1]])
  const right = line('b', 'm1', [[100.2, 30.2], [100.3, 30.3]])
  const first = computeRouteRevision('m1', [left, right])
  const second = computeRouteRevision('m1', [right, left])

  assert.equal(first, second)
  assert.equal(
    computeFingerprint({
      mountainId: 'm1',
      routeRevision: first,
      generatorVersion: 'map-package-v1',
      basemapSourceVersion: 'protomaps-20260812-v4.15.2',
    }),
    computeFingerprint({
      mountainId: 'm1',
      routeRevision: second,
      generatorVersion: 'map-package-v1',
      basemapSourceVersion: 'protomaps-20260812-v4.15.2',
    }),
  )
})

test('snapshot rejects pending rows and skips trace-only rows', () => {
  assert.throws(
    () => normalizeApprovedSnapshot([line('a', 'm1', [], { review_status: 'pending' })]),
    /pending geometry is forbidden/,
  )

  const normalized = normalizeApprovedSnapshot([
    line('a', 'm1', [[100, 30], [100.1, 30.1]]),
    line('b', 'm2', [[101, 31], [101.1, 31.1]], { display_mode: 'trace_only' }),
  ])
  assert.equal(normalized.map.length, 1)
  assert.equal(normalized.traceOnly.length, 1)
})

test('resume isolates failures and registry projection preserves unreplaced assets', () => {
  const jobs = [
    { mountainId: 'a', status: 'validated', fingerprint: 'fa' },
    { mountainId: 'b', status: 'failed', fingerprint: 'fb' },
    { mountainId: 'c', status: 'pending', fingerprint: 'fc' },
  ]
  assert.deepEqual(
    selectRunnableJobs(jobs, { resume: true }).map((job) => job.mountainId),
    ['b', 'c'],
  )

  const registry = buildRegistryProjection({
    existingAssets: {
      a: { fingerprint: 'old-a', objectPath: 'old-a.pmtiles' },
      b: { fingerprint: 'old-b', objectPath: 'old-b.pmtiles' },
    },
    jobs: [
      {
        mountainId: 'a',
        status: 'remote_validated',
        fingerprint: 'new-a',
        objectPath: 'new-a.pmtiles',
        routeRevision: 'r',
        generatorVersion: 'g',
        basemapSourceVersion: 's',
        packageMinZoom: 10,
        packageMaxZoom: 12,
        finalCoverageBbox: [1, 2, 3, 4],
        bytes: 10,
      },
      { mountainId: 'b', status: 'failed', fingerprint: 'new-b' },
    ],
  })
  assert.equal(registry.a.objectPath, 'new-a.pmtiles')
  assert.equal(registry.a.id, 'mountain-new-a')
  assert.equal(registry.b.objectPath, 'old-b.pmtiles')
})

test('remote validation keeps normal reads lightweight and rejects metadata anomalies', () => {
  const source = fs.readFileSync('scripts/maps/maps.mjs', 'utf8')
  const remoteValidator = source.match(
    /async function validateRemote[\s\S]*?\n}\n\nasync function commandUpload/,
  )?.[0] ?? ''

  assert.match(remoteValidator, /Range: 'bytes=0-126'/)
  assert.match(remoteValidator, /response\.status, 206/)
  assert.match(remoteValidator, /if \(anomalies\.length\) \{[\s\S]*fullRemoteSha/)
  assert.match(remoteValidator, /remote metadata integrity failure/)
  assert.doesNotMatch(remoteValidator, /job\.status = 'remote_validated'/)
})

test('force planning rebuilds an otherwise registered fingerprint', () => {
  const source = fs.readFileSync('scripts/maps/maps.mjs', 'utf8')

  assert.match(source, /!force && registered\?\.fingerprint === fingerprint/)
  assert.match(source, /buildJob\([\s\S]*?options\.force/)
})

test('remote upload summary persists aggregate outcomes without emitting per-object detail', async () => {
  const batch = await import('../scripts/maps/map-batch-lib.mjs')

  assert.equal(typeof batch.summarizeRemoteUploadJobs, 'function')

  const aggregate = batch.summarizeRemoteUploadJobs([
    {
      status: 'remote_validated',
      remoteUpload: {
        attempted: true,
        disposition: 'uploaded',
        remoteVerified: true,
        remoteVerifiedBytes: 5,
      },
    },
    {
      status: 'remote_validated',
      remoteUpload: {
        attempted: true,
        disposition: 'skipped',
        remoteVerified: true,
        remoteVerifiedBytes: 7,
      },
    },
    {
      status: 'failed',
      failureStage: 'upload',
      remoteUpload: {
        attempted: true,
        disposition: null,
        remoteVerified: false,
        remoteVerifiedBytes: null,
      },
    },
    { status: 'validated' },
  ])

  assert.deepEqual(aggregate, {
    attempted: 3,
    uploaded: 1,
    skipped: 1,
    uploadFailed: 1,
    remoteVerified: 2,
    remoteVerifiedBytes: 12,
  })
})

test('a failed storage upload never records an uploaded disposition', async () => {
  const batch = await import('../scripts/maps/map-batch-lib.mjs')
  const remoteUpload = {
    attempted: true,
    disposition: null,
    remoteVerified: false,
    remoteVerifiedBytes: null,
  }

  assert.equal(typeof batch.recordRemoteUploadWriteResult, 'function')
  assert.equal(batch.recordRemoteUploadWriteResult(remoteUpload, new Error('storage failed')), false)
  assert.equal(remoteUpload.disposition, null)
  assert.equal(batch.recordRemoteUploadWriteResult(remoteUpload, null), true)
  assert.equal(remoteUpload.disposition, 'uploaded')
})

test('register hard gate preserves full-batch exactness without a fixed entry count', async () => {
  const batch = await import('../scripts/maps/map-batch-lib.mjs')

  assert.equal(typeof batch.assertRegisterReady, 'function')

  const jobs = Array.from({ length: 3 }, (_, index) => {
    const mountainId = `test-mountain-${index}`
    const routeRevision = `${index}`.padStart(64, '0')
    const finalCoverageBbox = [100 + index / 1_000, 30, 100.1 + index / 1_000, 30.1]
    const fingerprint = batch.computeFingerprint({
      mountainId,
      routeRevision,
      minZoom: 9,
      maxZoom: 15,
      coverageBbox: finalCoverageBbox,
      generatorVersion: 'map-package-v1',
      basemapSourceVersion: 'protomaps-test',
    })

    return {
      mountainId,
      status: 'remote_validated',
      routeRevision,
      fingerprint,
      finalCoverageBbox,
      packageMinZoom: 9,
      packageMaxZoom: 15,
      generatorVersion: 'map-package-v1',
      basemapSourceVersion: 'protomaps-test',
      objectPath: `mountains/${mountainId}/${routeRevision}/map-package-v1/protomaps-test/map.pmtiles`,
      bytes: 1_024 + index,
    }
  })
  const assets = batch.buildRegistryProjection({ existingAssets: {}, jobs })

  assert.doesNotThrow(() =>
    batch.assertRegisterReady({
      jobs,
      existingAssets: {},
      assets,
      productMaxZoom: 15,
      sourceMapCount: 3,
    }),
  )
  assert.throws(
    () =>
      batch.assertRegisterReady({
        jobs: jobs.map((job, index) => (index === 1 ? { ...job, status: 'validated' } : job)),
        existingAssets: {},
        assets,
        productMaxZoom: 15,
        sourceMapCount: 3,
      }),
    /remote_validated/,
  )
})

test('incremental register replaces selected assets, adds new IDs, and rejects drift', async () => {
  const batch = await import('../scripts/maps/map-batch-lib.mjs')
  const existingAssets = {
    existing: { fingerprint: 'old', objectPath: 'old.pmtiles' },
    replaced: { fingerprint: 'old-replaced', objectPath: 'old-replaced.pmtiles' },
  }
  const jobs = ['replaced', 'added'].map((mountainId, index) => {
    const routeRevision = `${index + 1}`.padStart(64, '0')
    const generatorVersion = 'map-package-v2'
    const basemapSourceVersion = 'protomaps-test'
    return {
      mountainId,
      status: 'remote_validated',
      routeRevision,
      generatorVersion,
      basemapSourceVersion,
      fingerprint: batch.computeFingerprint({
        mountainId,
        routeRevision,
        generatorVersion,
        basemapSourceVersion,
      }),
      finalCoverageBbox: [100 + index, 30, 100.5 + index, 30.5],
      packageMinZoom: 7,
      packageMaxZoom: 11,
      objectPath: `mountains/${mountainId}/v2.pmtiles`,
      bytes: 100 + index,
    }
  })
  const assets = buildRegistryProjection({ existingAssets, jobs })

  assert.doesNotThrow(() => assertRegisterReady({
    jobs,
    existingAssets,
    assets,
    productMaxZoom: 15,
    sourceMapCount: 196,
  }))
  assert.equal(Object.keys(assets).length, 3)
  assert.equal(assets.existing.objectPath, 'old.pmtiles')
  assert.throws(() => assertRegisterReady({
    jobs,
    existingAssets,
    assets: { ...assets, existing: { ...assets.existing, objectPath: 'drift.pmtiles' } },
    productMaxZoom: 15,
    sourceMapCount: 196,
  }), /unselected registry asset changed/)
})

test('register invokes the deterministic full or incremental gate before any generated registry write', () => {
  const source = fs.readFileSync('scripts/maps/maps.mjs', 'utf8')
  const registerCommand = source.match(/async function commandRegister[\s\S]*?\n}\n\nfunction commandStatus/)?.[0] ?? ''
  const gateIndex = registerCommand.indexOf('assertRegisterReady(')
  const writeIndex = registerCommand.indexOf('writeJsonAtomic(REGISTRY_PATH, registry)')

  assert.notEqual(gateIndex, -1)
  assert.notEqual(writeIndex, -1)
  assert.ok(gateIndex < writeIndex)
})

test('machine summary writes the remote aggregate fields at top level', () => {
  const source = fs.readFileSync('scripts/maps/maps.mjs', 'utf8')
  const summary = source.match(/function summarize\(manifest\)[\s\S]*?\n}\n\nfunction saveState/)?.[0] ?? ''

  assert.match(summary, /const remoteUpload = summarizeRemoteUploadJobs\(manifest\.jobs\)/)
  assert.match(summary, /\.\.\.remoteUpload/)
})
