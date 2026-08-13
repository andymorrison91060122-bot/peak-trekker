#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'
import { bytesToHeader } from 'pmtiles'

import {
  assertRegisterReady,
  auditMapAssetCoverage,
  buildCoveragePlan,
  buildRegistryProjection,
  computeFingerprint,
  computeRouteRevision,
  normalizeApprovedSnapshot,
  recordRemoteUploadWriteResult,
  selectRunnableJobs,
  sha256,
  stableJson,
  summarizeRemoteUploadJobs,
} from './map-batch-lib.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const CONFIG_PATH = path.join(REPO_ROOT, 'config/maps/v0.1.json')
const OUTPUT_ROOT = path.join(REPO_ROOT, 'output/map-batch')
const CURRENT_RUN_PATH = path.join(OUTPUT_ROOT, 'current.json')
const REGISTRY_PATH = path.join(
  REPO_ROOT,
  'src/generated/mountain-map-assets.json',
)
const GEOMETRY_COLUMNS = [
  'id',
  'mountain_id',
  'source_file_sha256',
  'display_mode',
  'review_status',
  'simplified_geometry',
].join(',')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tempPath, filePath)
}

function loadConfig() {
  const config = readJson(CONFIG_PATH)
  assert.equal(config.schemaVersion, 'mountain-map-batch-config-v1')
  assert.equal(config.productMaxZoom, 15)
  assert.equal(config.viewportPixels, 343)
  assert.equal(config.runtimeViewportAspect?.width, 16)
  assert.equal(config.runtimeViewportAspect?.height, 11)
  assert.equal(config.paddingRatio, 0.095238)
  assert.equal(config.paddingMaxMeters, 3_000)
  assert.equal(config.concurrency, 2)
  assert.match(config.pmtilesCliDigest, /^sha256:[0-9a-f]{64}$/)
  return config
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(url, 'NEXT_PUBLIC_SUPABASE_URL is required')
  assert(key, 'SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function parseCli(argv) {
  const command = argv[0]
  assert(
    ['audit', 'plan', 'build', 'validate', 'upload', 'register', 'status'].includes(command),
    'command must be audit, plan, build, validate, upload, register, or status',
  )
  const mountainIds = []
  let limit = null
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--mountain') {
      mountainIds.push(argv[index + 1])
      index += 1
    } else if (token === '--limit') {
      limit = Number(argv[index + 1])
      index += 1
    } else {
      assert(
        ['--all', '--resume', '--force'].includes(token),
        `unsupported argument: ${token}`,
      )
    }
  }
  if (limit !== null) assert(Number.isInteger(limit) && limit > 0)
  return {
    command,
    all: argv.includes('--all'),
    resume: argv.includes('--resume'),
    force: argv.includes('--force'),
    mountainIds,
    limit,
  }
}

function runIdNow() {
  return (
    process.env.MAP_BATCH_RUN_ID
    ?? new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)
  )
}

function runPaths(runId) {
  const root = path.join(OUTPUT_ROOT, runId)
  return {
    root,
    snapshot: path.join(root, 'snapshot.json'),
    manifest: path.join(root, 'manifest.json'),
    summary: path.join(root, 'summary.json'),
    failures: path.join(root, 'failures.json'),
    packages: path.join(root, 'packages'),
    logs: path.join(root, 'logs'),
  }
}

function currentRunId() {
  assert(fs.existsSync(CURRENT_RUN_PATH), 'no current map batch run; execute plan first')
  return readJson(CURRENT_RUN_PATH).runId
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

async function fetchAllGeometries(supabase) {
  const rows = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('mountain_route_geometries')
      .select(GEOMETRY_COLUMNS)
      .order('mountain_id')
      .order('id')
      .range(from, from + 499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) break
  }
  return rows
}

async function fetchMountainNames(supabase, mountainIds) {
  const names = new Map()
  for (let index = 0; index < mountainIds.length; index += 50) {
    const { data, error } = await supabase
      .from('mountains')
      .select('id,name,effective_canonical_key,is_active,is_readable')
      .in('id', mountainIds.slice(index, index + 50))
    if (error) throw error
    for (const row of data) names.set(row.id, row)
  }
  assert.equal(names.size, mountainIds.length, 'one or more geometry parents are missing')
  return names
}

function groupByMountain(rows) {
  const groups = new Map()
  for (const row of rows) {
    const current = groups.get(row.mountain_id) ?? []
    current.push(row)
    groups.set(row.mountain_id, current)
  }
  return groups
}

function objectPath(config, mountainId, routeRevision) {
  return [
    'mountains',
    mountainId,
    routeRevision,
    config.generatorVersion,
    config.basemapSourceVersion,
    'basemap.pmtiles',
  ].join('/')
}

function selectMountainGroups(groups, options) {
  let entries = [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )
  if (options.mountainIds.length) {
    const requested = new Set(options.mountainIds)
    entries = entries.filter(([mountainId]) => requested.has(mountainId))
    assert.equal(entries.length, requested.size, 'requested mountain has no map geometry')
  } else {
    assert(options.all, 'plan requires --all or at least one --mountain')
  }
  if (options.limit !== null) entries = entries.slice(0, options.limit)
  return entries
}

function registryAssets() {
  const registry = readJson(REGISTRY_PATH)
  assert.equal(registry.schemaVersion, 'mountain-map-assets-v1')
  return registry.assets
}

function buildJob(config, mountain, rows, registry, packagePath, force) {
  const routeRevision = computeRouteRevision(mountain.id, rows)
  const fingerprint = computeFingerprint({
    mountainId: mountain.id,
    routeRevision,
    generatorVersion: config.generatorVersion,
    basemapSourceVersion: config.basemapSourceVersion,
  })
  const coverage = buildCoveragePlan(rows, {
    runtimeViewportAspect:
      config.runtimeViewportAspect.width / config.runtimeViewportAspect.height,
  })
  const registered = registry[mountain.id]
  return {
    mountainId: mountain.id,
    mountainName: mountain.name,
    canonicalKey: mountain.effective_canonical_key,
    mountainActive: mountain.is_active,
    mountainReadable: mountain.is_readable,
    geometryIds: rows.map((row) => row.id).sort(),
    routeRevision,
    fingerprint,
    generatorVersion: config.generatorVersion,
    basemapSourceVersion: config.basemapSourceVersion,
    ...coverage,
    objectPath: objectPath(config, mountain.id, routeRevision),
    localPath: packagePath,
    status:
      !force && registered?.fingerprint === fingerprint
        ? 'skipped'
        : 'pending',
    failureStage: null,
    errorCode: null,
    errorMessage: null,
    bytes: null,
    localSha256: null,
    pmtilesHeader: null,
    remoteUpload: {
      attempted: false,
      disposition: null,
      remoteVerified: false,
      remoteVerifiedBytes: null,
    },
  }
}

async function commandAudit() {
  const supabase = createAdminClient()
  const rows = await fetchAllGeometries(supabase)
  const assets = registryAssets()
  let jobs = []
  if (fs.existsSync(CURRENT_RUN_PATH)) {
    const { manifest } = loadCurrentState()
    jobs = manifest.jobs
  }
  const audit = auditMapAssetCoverage({
    rows,
    assets,
    jobs,
    packageExists: (filePath) => Boolean(filePath && fs.existsSync(filePath)),
  })
  process.stdout.write(`${JSON.stringify(audit)}\n`)
}

function summarize(manifest) {
  const counts = {}
  let totalBytes = 0
  for (const job of manifest.jobs) {
    counts[job.status] = (counts[job.status] ?? 0) + 1
    if (Number.isFinite(job.bytes)) totalBytes += job.bytes
  }
  const remoteUpload = summarizeRemoteUploadJobs(manifest.jobs)
  return {
    schemaVersion: 'mountain-map-batch-summary-v1',
    runId: manifest.runId,
    sourceGeometryCount: manifest.sourceGeometryCount,
    sourceMapCount: manifest.sourceMapCount,
    sourceTraceOnlyCount: manifest.sourceTraceOnlyCount,
    selectedJobs: manifest.jobs.length,
    counts,
    totalBytes,
    failed: counts.failed ?? 0,
    ...remoteUpload,
  }
}

function saveState(paths, manifest) {
  manifest.updatedAt = new Date().toISOString()
  writeJsonAtomic(paths.manifest, manifest)
  const failures = manifest.jobs
    .filter((job) => job.status === 'failed')
    .map((job) => ({
      mountainId: job.mountainId,
      mountainName: job.mountainName,
      stage: job.failureStage,
      code: job.errorCode,
      message: job.errorMessage,
      logPath: job.logPath ?? null,
    }))
  writeJsonAtomic(paths.failures, failures)
  writeJsonAtomic(paths.summary, summarize(manifest))
}

function loadCurrentState() {
  const runId = currentRunId()
  const paths = runPaths(runId)
  const manifest = readJson(paths.manifest)
  assert.equal(manifest.runId, runId)
  return { runId, paths, manifest }
}

async function commandPlan(config, options) {
  const runId = runIdNow()
  const paths = runPaths(runId)
  if (fs.existsSync(paths.root)) {
    assert(options.force, `run already exists: ${runId}`)
    assert(
      options.mountainIds.length > 0 || process.env.MAP_BATCH_FORCE_ALL === '1',
      '--force for a full run requires MAP_BATCH_FORCE_ALL=1',
    )
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
  fs.mkdirSync(paths.packages, { recursive: true })
  fs.mkdirSync(paths.logs, { recursive: true })

  const supabase = createAdminClient()
  const sourceRows = await fetchAllGeometries(supabase)
  const normalized = normalizeApprovedSnapshot(sourceRows)
  const mapGroups = groupByMountain(normalized.map)
  const allMountainIds = [...new Set(sourceRows.map((row) => row.mountain_id))]
  const mountains = await fetchMountainNames(supabase, allMountainIds)
  const selected = selectMountainGroups(mapGroups, options)
  const registry = registryAssets()
  const jobs = selected.map(([mountainId, rows]) =>
    buildJob(
      config,
      mountains.get(mountainId),
      rows,
      registry,
      path.join(paths.packages, `${mountainId}.pmtiles`),
      options.force,
    ),
  )
  const snapshot = {
    schemaVersion: 'approved-geometry-snapshot-v1',
    capturedAt: new Date().toISOString(),
    source: 'production_supabase',
    rows: sourceRows,
    mountains: [...mountains.values()].sort((left, right) => left.id.localeCompare(right.id)),
  }
  const manifest = {
    schemaVersion: 'mountain-map-batch-manifest-v1',
    runId,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    config,
    snapshotSha256: sha256(stableJson(snapshot)),
    sourceGeometryCount: sourceRows.length,
    sourceMapCount: normalized.map.length,
    sourceTraceOnlyCount: normalized.traceOnly.length,
    jobs,
  }
  writeJsonAtomic(paths.snapshot, snapshot)
  saveState(paths, manifest)
  writeJsonAtomic(CURRENT_RUN_PATH, { runId })
  process.stdout.write(`${JSON.stringify(summarize(manifest))}\n`)
}

function runProcess(command, args, { cwd, logPath }) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(logPath, { flags: 'w' })
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(stream)
    child.stderr.pipe(stream)
    child.once('error', reject)
    child.once('close', (code) => {
      stream.end()
      resolve(code)
    })
  })
}

async function parallelMap(items, concurrency, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}

function failJob(job, stage, code, error, logPath = null) {
  job.status = 'failed'
  job.failureStage = stage
  job.errorCode = code
  job.errorMessage = String(error?.message ?? error).slice(0, 1_000)
  if (logPath) job.logPath = logPath
}

async function commandBuild(config, options) {
  const { paths, manifest } = loadCurrentState()
  assert.equal(
    sha256(stableJson(readJson(paths.snapshot))),
    manifest.snapshotSha256,
    'snapshot file changed',
  )
  const candidates = selectRunnableJobs(manifest.jobs, { resume: options.resume })
    .filter((job) => !options.mountainIds.length || options.mountainIds.includes(job.mountainId))
  await parallelMap(candidates, config.concurrency, async (job) => {
    const temporaryPath = `${job.localPath}.tmp`
    const logPath = path.join(paths.logs, `${job.mountainId}-build.log`)
    try {
      fs.rmSync(temporaryPath, { force: true })
      const mountedRoot = '/work'
      const relativeTemporary = path.relative(paths.root, temporaryPath)
      const image = `${config.pmtilesCliImage}@${config.pmtilesCliDigest}`
      const args = [
        'run', '--rm',
        '-v', `${paths.root}:${mountedRoot}`,
        image,
        'extract',
        config.basemapSourceUrl,
        `${mountedRoot}/${relativeTemporary}`,
        '--quiet',
        `--bbox=${job.finalCoverageBbox.join(',')}`,
        `--minzoom=${job.packageMinZoom}`,
        `--maxzoom=${job.packageMaxZoom}`,
      ]
      const code = await runProcess('docker', args, { cwd: REPO_ROOT, logPath })
      if (code !== 0) throw new Error(`pmtiles extract exited ${code}`)
      assert(fs.statSync(temporaryPath).size > 0, 'empty PMTiles output')
      fs.renameSync(temporaryPath, job.localPath)
      job.status = 'built'
      job.failureStage = null
      job.errorCode = null
      job.errorMessage = null
      job.logPath = path.relative(REPO_ROOT, logPath)
    } catch (error) {
      try {
        fs.rmSync(temporaryPath, { force: true })
      } catch {
        // The original per-job failure is the actionable error.
      }
      failJob(job, 'build', 'pmtiles_extract_failed', error, path.relative(REPO_ROOT, logPath))
    }
    saveState(paths, manifest)
  })
  const summary = summarize(manifest)
  process.stdout.write(`${JSON.stringify(summary)}\n`)
  if (summary.failed) process.exitCode = 1
}

function readPmtilesHeader(filePath) {
  const descriptor = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(127)
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0)
    assert.equal(bytesRead, 127, 'PMTiles header is truncated')
    return bytesToHeader(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    )
  } finally {
    fs.closeSync(descriptor)
  }
}

function assertHeaderMatches(job, header) {
  assert.equal(header.minZoom, job.packageMinZoom, 'PMTiles minZoom mismatch')
  assert.equal(header.maxZoom, job.packageMaxZoom, 'PMTiles maxZoom mismatch')
  const tolerance = 0.001
  assert(header.minLon <= job.finalCoverageBbox[0] + tolerance, 'PMTiles west bound mismatch')
  assert(header.minLat <= job.finalCoverageBbox[1] + tolerance, 'PMTiles south bound mismatch')
  assert(header.maxLon >= job.finalCoverageBbox[2] - tolerance, 'PMTiles east bound mismatch')
  assert(header.maxLat >= job.finalCoverageBbox[3] - tolerance, 'PMTiles north bound mismatch')
}

async function commandValidate(config, options) {
  const { paths, manifest } = loadCurrentState()
  const candidates = manifest.jobs.filter((job) => {
    if (options.mountainIds.length && !options.mountainIds.includes(job.mountainId)) return false
    if (job.status === 'built') return true
    return options.resume && job.status === 'failed' && job.failureStage === 'validate'
  })
  for (const job of candidates) {
    try {
      assert(fs.existsSync(job.localPath), 'PMTiles file missing')
      const bytes = fs.statSync(job.localPath).size
      assert(bytes > 0, 'PMTiles file empty')
      assert(bytes <= config.storage.hardLimitBytes, 'PMTiles exceeds Storage hard limit')
      const header = readPmtilesHeader(job.localPath)
      assertHeaderMatches(job, header)
      job.bytes = bytes
      job.localSha256 = fileSha256(job.localPath)
      job.pmtilesHeader = {
        minZoom: header.minZoom,
        maxZoom: header.maxZoom,
        bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      }
      job.status = 'validated'
      job.failureStage = null
      job.errorCode = null
      job.errorMessage = null
    } catch (error) {
      failJob(job, 'validate', 'local_validation_failed', error)
    }
    saveState(paths, manifest)
  }
  const summary = summarize(manifest)
  process.stdout.write(`${JSON.stringify(summary)}\n`)
  if (summary.failed) process.exitCode = 1
}

async function objectInfo(bucket, objectPath) {
  const { data, error } = await bucket.info(objectPath)
  if (!error) return data
  if (Number(error.statusCode ?? error.status) === 404) return null
  throw error
}

function publicObjectUrl(config, objectPath) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  assert(baseUrl)
  return `${baseUrl}/storage/v1/object/public/${config.storage.bucket}/${objectPath}`
}

async function fullRemoteSha(bucket, objectPath) {
  const { data, error } = await bucket.download(objectPath)
  if (error) throw error
  return sha256(Buffer.from(await data.arrayBuffer()))
}

async function validateRemote(config, bucket, job) {
  const info = await objectInfo(bucket, job.objectPath)
  assert(info, 'remote object does not exist')
  const anomalies = []
  if (Number(info.size) !== job.bytes) anomalies.push('remote_bytes_mismatch')
  if (info.contentType !== config.storage.contentType) anomalies.push('remote_content_type_mismatch')
  if (info.metadata?.sha256 !== job.localSha256) anomalies.push('remote_metadata_sha_mismatch')
  if (info.metadata?.fingerprint !== job.fingerprint) anomalies.push('remote_metadata_fingerprint_mismatch')
  if (anomalies.length) {
    const remoteSha = await fullRemoteSha(bucket, job.objectPath)
    assert.equal(remoteSha, job.localSha256, `remote integrity failure: ${anomalies.join(',')}`)
    throw new Error(`remote metadata integrity failure: ${anomalies.join(',')}`)
  }
  const response = await fetch(publicObjectUrl(config, job.objectPath), {
    headers: { Range: 'bytes=0-126' },
  })
  assert.equal(response.status, 206, 'remote Range request did not return 206')
  assert.match(response.headers.get('content-range') ?? '', /^bytes 0-126\/\d+$/)
  const body = await response.arrayBuffer()
  assert.equal(body.byteLength, 127)
  const header = bytesToHeader(body)
  assertHeaderMatches(job, header)
  return { remoteVerifiedBytes: Number(info.size) }
}

async function commandUpload(config, options) {
  const { paths, manifest } = loadCurrentState()
  const supabase = createAdminClient()
  const bucket = supabase.storage.from(config.storage.bucket)
  const candidates = manifest.jobs.filter((job) => {
    if (options.mountainIds.length && !options.mountainIds.includes(job.mountainId)) return false
    if (job.status === 'validated') return true
    return options.resume && job.status === 'failed' && job.failureStage === 'upload'
  })
  for (const job of candidates) {
    try {
      job.remoteUpload = {
        attempted: true,
        disposition: null,
        remoteVerified: false,
        remoteVerifiedBytes: null,
      }
      let info = await objectInfo(bucket, job.objectPath)
      if (!info) {
        const { error } = await bucket.upload(
          job.objectPath,
          fs.readFileSync(job.localPath),
          {
            upsert: false,
            cacheControl: '31536000',
            contentType: config.storage.contentType,
            metadata: {
              sha256: job.localSha256,
              fingerprint: job.fingerprint,
              routeRevision: job.routeRevision,
              generatorVersion: job.generatorVersion,
              basemapSourceVersion: job.basemapSourceVersion,
            },
          },
        )
        if (!recordRemoteUploadWriteResult(job.remoteUpload, error)) throw error
        info = await objectInfo(bucket, job.objectPath)
        assert(info, 'uploaded object missing')
      } else {
        job.remoteUpload.disposition = 'skipped'
      }
      const remoteVerification = await validateRemote(config, bucket, job)
      job.remoteUpload.remoteVerified = true
      job.remoteUpload.remoteVerifiedBytes = remoteVerification.remoteVerifiedBytes
      job.status = 'remote_validated'
      job.failureStage = null
      job.errorCode = null
      job.errorMessage = null
    } catch (error) {
      failJob(job, 'upload', 'remote_validation_failed', error)
    }
    saveState(paths, manifest)
  }
  const summary = summarize(manifest)
  process.stdout.write(`${JSON.stringify(summary)}\n`)
  if (summary.failed) process.exitCode = 1
}

async function commandRegister(config) {
  const { manifest } = loadCurrentState()
  const existing = registryAssets()
  const assets = buildRegistryProjection({ existingAssets: existing, jobs: manifest.jobs })
  assertRegisterReady({
    jobs: manifest.jobs,
    existingAssets: existing,
    assets,
    productMaxZoom: config.productMaxZoom,
    sourceMapCount: manifest.sourceMapCount,
    manifestSchemaVersion: manifest.schemaVersion,
  })
  const registry = {
    schemaVersion: 'mountain-map-assets-v1',
    generatedAt: new Date().toISOString(),
    assets,
  }
  writeJsonAtomic(REGISTRY_PATH, registry)
  process.stdout.write(`${JSON.stringify({ registered: Object.keys(assets).length })}\n`)
}

function commandStatus() {
  const { paths } = loadCurrentState()
  process.stdout.write(`${JSON.stringify({
    summary: readJson(paths.summary),
    failures: readJson(paths.failures),
  })}\n`)
}

async function main() {
  const options = parseCli(process.argv.slice(2))
  const config = loadConfig()
  if (options.command === 'audit') await commandAudit()
  else if (options.command === 'plan') await commandPlan(config, options)
  else if (options.command === 'build') await commandBuild(config, options)
  else if (options.command === 'validate') await commandValidate(config, options)
  else if (options.command === 'upload') await commandUpload(config, options)
  else if (options.command === 'register') await commandRegister(config, options)
  else commandStatus()
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
