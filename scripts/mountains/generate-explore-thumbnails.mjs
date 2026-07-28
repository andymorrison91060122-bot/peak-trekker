import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import {
  auditRuntimeThumbnailClosure,
  buildFinalCoverInventory,
  EXPLORE_THUMBNAIL_BUCKET,
  EXPLORE_THUMBNAIL_CACHE_CONTROL,
  EXPLORE_THUMBNAIL_HEIGHT,
  EXPLORE_THUMBNAIL_QUALITY,
  EXPLORE_THUMBNAIL_WIDTH,
  isMissingPublicObjectResponse,
  sha256,
  stableJson,
  verifyExistingThumbnail,
  writeJsonAtomic,
} from './explore-thumbnail-lib.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const OUTPUT_ROOT = path.join(
  REPO_ROOT,
  'output/mountain-carousel-hotfix-acceptance/thumbnails',
)
const GENERATED_ROOT = path.join(OUTPUT_ROOT, 'generated')
const PLAN_PATH = path.join(OUTPUT_ROOT, 'thumbnail-plan.json')
const PLAN_PROGRESS_PATH = path.join(OUTPUT_ROOT, 'thumbnail-plan-progress.json')
const CHECKPOINT_PATH = path.join(OUTPUT_ROOT, 'thumbnail-checkpoint.json')
const SUMMARY_PATH = path.join(OUTPUT_ROOT, 'thumbnail-summary.json')
const RUNTIME_AUDIT_PATH = path.join(OUTPUT_ROOT, 'runtime-closure-audit.json')
const ORPHAN_REPORT_PATH = path.join(OUTPUT_ROOT, 'orphaned-thumbnail-objects.json')

function loadLocalEnvironment() {
  const envPath = path.join(REPO_ROOT, '.env.local')
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath)
}

function parseArguments(argv) {
  const commandFlags = ['--plan', '--apply', '--check', '--verify-byte-identical']
  const commands = commandFlags.filter((flag) => argv.includes(flag))
  assert.equal(commands.length, 1, `choose exactly one command: ${commandFlags.join(', ')}`)
  const limitIndex = argv.indexOf('--limit')
  const limit = limitIndex === -1 ? null : Number(argv[limitIndex + 1])
  if (limit !== null) {
    assert(Number.isInteger(limit) && limit > 0 && limit <= 359, '--limit must be 1..359')
  }
  return { command: commands[0], limit }
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length)
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await callback(values[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  )
  return results
}

async function fetchWithRetry(
  url,
  { attempts = 3, allowMissing = false, headers = {} } = {},
) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'user-agent': 'Peak-Trekker-Explore-Thumbnail-Pipeline/1.0',
          ...headers,
        },
        signal: AbortSignal.timeout(120_000),
      })
      if (allowMissing && await isMissingPublicObjectResponse(response)) return response
      if (response.ok) return response
      throw new Error(`HTTP ${response.status} for ${url}`)
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
      }
    }
  }
  throw lastError
}

async function readResponseBuffer(response) {
  return Buffer.from(await response.arrayBuffer())
}

async function fetchSourceBuffer(url) {
  const chunkSize = 1024 * 1024
  const firstResponse = await fetchWithRetry(url, {
    headers: { range: `bytes=0-${chunkSize - 1}` },
  })
  const contentType = firstResponse.headers.get('content-type')?.split(';')[0] ?? null
  const firstBuffer = await readResponseBuffer(firstResponse)
  if (firstResponse.status === 200) {
    return { buffer: firstBuffer, contentType }
  }
  assert.equal(firstResponse.status, 206, `range request unsupported for ${url}`)
  const contentRange = firstResponse.headers.get('content-range')
  const rangeMatch = contentRange?.match(/^bytes 0-(\d+)\/(\d+)$/)
  assert(rangeMatch, `invalid Content-Range for ${url}: ${contentRange}`)
  const firstEnd = Number(rangeMatch[1])
  const totalBytes = Number(rangeMatch[2])
  assert.equal(firstBuffer.length, firstEnd + 1, `first range byte mismatch for ${url}`)
  const chunks = [firstBuffer]

  for (let start = firstEnd + 1; start < totalBytes; start += chunkSize) {
    const end = Math.min(totalBytes - 1, start + chunkSize - 1)
    const response = await fetchWithRetry(url, {
      headers: { range: `bytes=${start}-${end}` },
    })
    assert.equal(response.status, 206, `range request failed for ${url}: ${start}-${end}`)
    const range = response.headers.get('content-range')
    assert.equal(range, `bytes ${start}-${end}/${totalBytes}`, `Content-Range drift for ${url}`)
    const chunk = await readResponseBuffer(response)
    assert.equal(chunk.length, end - start + 1, `range byte mismatch for ${url}: ${start}-${end}`)
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)
  assert.equal(buffer.length, totalBytes, `source byte closure failed for ${url}`)
  return { buffer, contentType }
}

async function imageMetadata(buffer) {
  return sharp(buffer).metadata()
}

async function buildPlan() {
  loadLocalEnvironment()
  const expectedBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  assert(expectedBaseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required')
  const inventory = buildFinalCoverInventory({
    repoRoot: REPO_ROOT,
    expectedCount: 359,
    expectedBaseUrl,
  })
  const previousPlan = fs.existsSync(PLAN_PATH)
    ? JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'))
    : null
  fs.mkdirSync(GENERATED_ROOT, { recursive: true })
  const progress = fs.existsSync(PLAN_PROGRESS_PATH)
    ? JSON.parse(fs.readFileSync(PLAN_PROGRESS_PATH, 'utf8'))
    : { schema_version: 1, entries: [] }
  const progressByKey = new Map(
    progress.entries.map((entry) => [entry.effective_canonical_key, entry]),
  )
  let completedCount = 0

  const entries = await mapWithConcurrency(inventory, 6, async (row) => {
    const cached = progressByKey.get(row.effective_canonical_key)
    if (
      cached
      && cached.source_url === row.source_url
      && cached.thumbnail_object_path === row.thumbnail_object_path
      && fs.existsSync(path.join(REPO_ROOT, cached.generated_path))
      && sha256(fs.readFileSync(path.join(REPO_ROOT, cached.generated_path))) === cached.stored_sha256
    ) {
      completedCount += 1
      process.stdout.write(`\rplan ${String(completedCount).padStart(3, ' ')}/${inventory.length}`)
      return cached
    }

    try {
      const source = await fetchSourceBuffer(row.source_url)
      const sourceBuffer = source.buffer
      const sourceMetadata = await imageMetadata(sourceBuffer)
      assert(sourceMetadata.width && sourceMetadata.height, `source dimensions unavailable: ${row.source_url}`)

      const thumbnailBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize(EXPLORE_THUMBNAIL_WIDTH, EXPLORE_THUMBNAIL_HEIGHT, {
          fit: 'cover',
          position: 'centre',
        })
        .webp({
          quality: EXPLORE_THUMBNAIL_QUALITY,
          effort: 4,
          smartSubsample: true,
        })
        .toBuffer()
      const thumbnailMetadata = await imageMetadata(thumbnailBuffer)
      assert.equal(thumbnailMetadata.format, 'webp')
      assert.equal(thumbnailMetadata.width, EXPLORE_THUMBNAIL_WIDTH)
      assert.equal(thumbnailMetadata.height, EXPLORE_THUMBNAIL_HEIGHT)
      const generatedPath = path.join(
        GENERATED_ROOT,
        `${row.effective_canonical_key}.webp`,
      )
      fs.writeFileSync(generatedPath, thumbnailBuffer)
      const entry = {
        ...row,
        source_sha256: sha256(sourceBuffer),
        source_size_bytes: sourceBuffer.length,
        source_width: sourceMetadata.width,
        source_height: sourceMetadata.height,
        source_mime: source.contentType,
        stored_sha256: sha256(thumbnailBuffer),
        stored_size_bytes: thumbnailBuffer.length,
        stored_width: thumbnailMetadata.width,
        stored_height: thumbnailMetadata.height,
        stored_mime: 'image/webp',
        generated_path: path.relative(REPO_ROOT, generatedPath),
      }
      progressByKey.set(row.effective_canonical_key, entry)
      writeJsonAtomic(PLAN_PROGRESS_PATH, {
        schema_version: 1,
        entries: [...progressByKey.values()].sort((left, right) => (
          left.effective_canonical_key.localeCompare(right.effective_canonical_key, 'en')
        )),
      })
      completedCount += 1
      process.stdout.write(`\rplan ${String(completedCount).padStart(3, ' ')}/${inventory.length}`)
      return entry
    } catch (error) {
      throw new Error(
        `thumbnail plan failed for ${row.effective_canonical_key} (${row.source_url}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  })
  process.stdout.write('\n')
  const totalSourceBytes = entries.reduce((sum, entry) => sum + entry.source_size_bytes, 0)
  const totalThumbnailBytes = entries.reduce((sum, entry) => sum + entry.stored_size_bytes, 0)
  const plan = {
    schema_version: 1,
    transformation: {
      width: EXPLORE_THUMBNAIL_WIDTH,
      height: EXPLORE_THUMBNAIL_HEIGHT,
      format: 'webp',
      quality: EXPLORE_THUMBNAIL_QUALITY,
      fit: 'cover',
      position: 'centre',
    },
    inventory_count: entries.length,
    total_source_bytes: totalSourceBytes,
    total_thumbnail_bytes: totalThumbnailBytes,
    byte_reduction_ratio: 1 - totalThumbnailBytes / totalSourceBytes,
    entries,
  }
  const previousByKey = new Map(
    (previousPlan?.entries ?? []).map((entry) => [entry.effective_canonical_key, entry]),
  )
  const newOrphans = entries.flatMap((entry) => {
    const previous = previousByKey.get(entry.effective_canonical_key)
    if (
      !previous
      || previous.thumbnail_object_path === entry.thumbnail_object_path
    ) {
      return []
    }
    return [{
      effective_canonical_key: entry.effective_canonical_key,
      orphaned_thumbnail_object_path: previous.thumbnail_object_path,
      orphaned_thumbnail_public_url: previous.thumbnail_public_url,
      current_source_url: entry.source_url,
      current_thumbnail_object_path: entry.thumbnail_object_path,
      current_thumbnail_public_url: entry.thumbnail_public_url,
    }]
  })
  const existingOrphans = fs.existsSync(ORPHAN_REPORT_PATH)
    ? JSON.parse(fs.readFileSync(ORPHAN_REPORT_PATH, 'utf8')).entries
    : []
  const orphansByPath = new Map(
    [...existingOrphans, ...newOrphans].map((entry) => (
      [entry.orphaned_thumbnail_object_path, entry]
    )),
  )
  writeJsonAtomic(ORPHAN_REPORT_PATH, {
    schema_version: 1,
    policy: 'retained; never overwritten or deleted by this pipeline',
    count: orphansByPath.size,
    entries: [...orphansByPath.values()].sort((left, right) => (
      left.orphaned_thumbnail_object_path.localeCompare(
        right.orphaned_thumbnail_object_path,
        'en',
      )
    )),
  })
  writeJsonAtomic(PLAN_PATH, plan)
  console.log(stableJson({
    plan_path: path.relative(REPO_ROOT, PLAN_PATH),
    inventory_count: entries.length,
    total_source_bytes: totalSourceBytes,
    total_thumbnail_bytes: totalThumbnailBytes,
    byte_reduction_ratio: plan.byte_reduction_ratio,
    orphaned_thumbnail_count: orphansByPath.size,
  }, 2))
}

function readPlan() {
  assert(fs.existsSync(PLAN_PATH), `thumbnail plan is missing: ${PLAN_PATH}`)
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'))
  assert.equal(plan.inventory_count, 359)
  assert.equal(plan.entries.length, 359)
  return plan
}

function assertPlanMatchesInventory(plan) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  assert(baseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required')
  const inventory = buildFinalCoverInventory({
    repoRoot: REPO_ROOT,
    expectedCount: 359,
    expectedBaseUrl: baseUrl,
  })
  assert.deepEqual(
    plan.entries.map((entry) => ({
      effective_canonical_key: entry.effective_canonical_key,
      source_url: entry.source_url,
      thumbnail_object_path: entry.thumbnail_object_path,
    })),
    inventory.map((entry) => ({
      effective_canonical_key: entry.effective_canonical_key,
      source_url: entry.source_url,
      thumbnail_object_path: entry.thumbnail_object_path,
    })),
    'thumbnail plan no longer matches the final cover inventory',
  )
}

function readCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    return {
      schema_version: 1,
      created_object_paths: [],
      reused_object_paths: [],
      verified_object_paths: [],
      runs: [],
    }
  }
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'))
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(url, 'NEXT_PUBLIC_SUPABASE_URL is required')
  assert(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verifyPublicEntry(entry, { allowMissing = false } = {}) {
  const separator = entry.thumbnail_public_url.includes('?') ? '&' : '?'
  const response = await fetchWithRetry(
    `${entry.thumbnail_public_url}${separator}thumb_verify=${entry.stored_sha256.slice(0, 16)}`,
    { allowMissing },
  )
  if (allowMissing && await isMissingPublicObjectResponse(response)) return false
  assert.equal(response.status, 200, `thumbnail public GET failed: ${entry.thumbnail_object_path}`)
  assert.equal(
    response.headers.get('content-type')?.split(';')[0],
    'image/webp',
    `thumbnail public MIME mismatch: ${entry.thumbnail_object_path}`,
  )
  const buffer = await readResponseBuffer(response)
  await verifyExistingThumbnail(buffer, entry, imageMetadata)
  return true
}

async function applyPlan(limit) {
  loadLocalEnvironment()
  const plan = readPlan()
  assertPlanMatchesInventory(plan)
  const selected = plan.entries.slice(0, limit ?? plan.entries.length)
  const checkpoint = readCheckpoint()
  const client = createAdminClient()
  const run = {
    command: 'apply',
    limit: limit ?? null,
    selected_count: selected.length,
    created: [],
    reused: [],
    verified: [],
  }

  for (const [index, entry] of selected.entries()) {
    const exists = await verifyPublicEntry(entry, { allowMissing: true })
    if (exists) {
      run.reused.push(entry.thumbnail_object_path)
    } else {
      const buffer = fs.readFileSync(path.join(REPO_ROOT, entry.generated_path))
      await verifyExistingThumbnail(buffer, entry, imageMetadata)
      const { error } = await client.storage
        .from(EXPLORE_THUMBNAIL_BUCKET)
        .upload(entry.thumbnail_object_path, buffer, {
          contentType: 'image/webp',
          cacheControl: EXPLORE_THUMBNAIL_CACHE_CONTROL,
          upsert: false,
        })
      if (error) throw error
      run.created.push(entry.thumbnail_object_path)
      await verifyPublicEntry(entry)
    }
    run.verified.push(entry.thumbnail_object_path)
    process.stdout.write(
      `\rapply ${String(index + 1).padStart(3, ' ')}/${selected.length}`,
    )
  }
  process.stdout.write('\n')
  checkpoint.created_object_paths = [
    ...new Set([...checkpoint.created_object_paths, ...run.created]),
  ].sort()
  checkpoint.reused_object_paths = [
    ...new Set([...checkpoint.reused_object_paths, ...run.reused]),
  ].sort()
  checkpoint.verified_object_paths = [
    ...new Set([...checkpoint.verified_object_paths, ...run.verified]),
  ].sort()
  checkpoint.runs.push(run)
  writeJsonAtomic(CHECKPOINT_PATH, checkpoint)
  writeJsonAtomic(SUMMARY_PATH, {
    command: run.command,
    selected_count: run.selected_count,
    created_count: run.created.length,
    reused_count: run.reused.length,
    verified_count: run.verified.length,
    total_created_count: checkpoint.created_object_paths.length,
    total_verified_count: checkpoint.verified_object_paths.length,
  })
  console.log(stableJson(JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8')), 2))
}

async function checkPlan(limit) {
  loadLocalEnvironment()
  const plan = readPlan()
  assertPlanMatchesInventory(plan)
  const selected = plan.entries.slice(0, limit ?? plan.entries.length)
  const expectedBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  assert(expectedBaseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required')
  const runtimeInventory = buildFinalCoverInventory({
    repoRoot: REPO_ROOT,
    expectedCount: 359,
    expectedBaseUrl,
  }).slice(0, limit ?? 359)
  const runtimeAudit = await auditRuntimeThumbnailClosure(runtimeInventory, {
    expectedBaseUrl,
    concurrency: 8,
    fetcher: (thumbnailUrl) => {
      const separator = thumbnailUrl.includes('?') ? '&' : '?'
      return fetchWithRetry(
        `${thumbnailUrl}${separator}runtime_closure=${Date.now()}`,
        { allowMissing: true },
      )
    },
  })
  writeJsonAtomic(RUNTIME_AUDIT_PATH, {
    schema_version: 1,
    derived_with: 'src/lib/explore-thumbnail-runtime.js#deriveExploreMountainThumbnailUrl',
    inventory_source: [
      'data/mountains/photos/t10-ingest-checkpoint.json#rows_after',
      'data/mountains/photos/t10-replacement-20260728-checkpoint.json#rows_after',
      'data/mountains/photos/t11-image-sync-checkpoint.json#rows_after',
    ],
    ...runtimeAudit,
  })
  assert.equal(
    runtimeAudit.failed_count,
    0,
    `runtime thumbnail closure failed for ${runtimeAudit.failed_count} object(s): ${runtimeAudit.failures.map((failure) => failure.effective_canonical_key).join(', ')}`,
  )
  await mapWithConcurrency(selected, 8, async (entry, index) => {
    await verifyPublicEntry(entry)
    process.stdout.write(
      `\rcheck ${String(index + 1).padStart(3, ' ')}/${selected.length}`,
    )
  })
  process.stdout.write('\n')
  console.log(stableJson({
    command: 'check',
    selected_count: selected.length,
    verified_count: selected.length,
    runtime_closure_count: runtimeAudit.checked_count,
    runtime_closure_failed_count: runtimeAudit.failed_count,
    runtime_audit_path: path.relative(REPO_ROOT, RUNTIME_AUDIT_PATH),
  }, 2))
}

async function verifyByteIdentical() {
  const plan = readPlan()
  const hashesBefore = plan.entries.map((entry) => {
    const buffer = fs.readFileSync(path.join(REPO_ROOT, entry.generated_path))
    assert.equal(sha256(buffer), entry.stored_sha256)
    return entry.stored_sha256
  })
  await buildPlan()
  const rebuilt = readPlan()
  assert.deepEqual(
    rebuilt.entries.map((entry) => entry.stored_sha256),
    hashesBefore,
    'thumbnail bytes changed across deterministic rebuild',
  )
  console.log(stableJson({ byte_identical: true, count: rebuilt.entries.length }, 2))
}

const { command, limit } = parseArguments(process.argv.slice(2))
if (command === '--plan') await buildPlan()
if (command === '--apply') await applyPlan(limit)
if (command === '--check') await checkPlan(limit)
if (command === '--verify-byte-identical') await verifyByteIdentical()
