import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const routeSource = await readFile('src/app/api/weather/refresh-batch/route.ts', 'utf8')
const weatherCoreSource = await readFile('src/lib/weather/weather-core.ts', 'utf8')

function batch({ nextCursor = null, failed = 0 } = {}) {
  return {
    ok: true,
    mode: 'prelaunch',
    checked: 1,
    refreshed: 1 - failed,
    failed,
    skipped: 0,
    nextCursor,
    failures: failed ? [{ mountainId: 'mountain-failed', error: 'temporary' }] : [],
  }
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function loadDriver() {
  return await import(`../scripts/weather/refresh-prelaunch.mjs?test=${Date.now()}-${Math.random()}`)
}

test('prelaunch route selects eligible mountains by cursor without changing the normal cache batch', () => {
  assert.match(routeSource, /mode === 'prelaunch'/)
  assert.match(routeSource, /\.from\('mountains'\)/)
  assert.match(routeSource, /\.eq\('is_active', true\)/)
  assert.match(routeSource, /\.eq\('is_readable', true\)/)
  assert.match(routeSource, /\.eq\('entity_type', 'mountain'\)/)
  assert.match(routeSource, /\.eq\('weather_enabled', true\)/)
  assert.match(routeSource, /\.not\('latitude', 'is', null\)/)
  assert.match(routeSource, /\.not\('longitude', 'is', null\)/)
  assert.match(routeSource, /\.gt\('id', cursor\)/)
  assert.match(routeSource, /\.order\('id', \{ ascending: true \}\)/)
  assert.match(routeSource, /PRELAUNCH_BATCH_LIMIT = 10/)
  assert.match(routeSource, /PRELAUNCH_CONCURRENCY = 2/)
  assert.match(routeSource, /Number\.isFinite\(latitude\)/)
  assert.match(routeSource, /Number\.isFinite\(longitude\)/)
  assert.match(routeSource, /\.from\('weather_cache'\)/)
  assert.match(routeSource, /const BATCH_LIMIT = 20/)
  assert.match(routeSource, /const CONCURRENCY = 3/)
  assert.doesNotMatch(routeSource, /\.delete\(|\.update\(.*mountains|cron/i)
})

test('weather provider order remains QWeather then Open-Meteo', () => {
  const qweatherIndex = weatherCoreSource.indexOf('return await fetchQWeather')
  const openMeteoIndex = weatherCoreSource.indexOf('return await fetchOpenMeteo')
  assert.ok(qweatherIndex >= 0)
  assert.ok(openMeteoIndex > qweatherIndex)
})

test('prelaunch driver closes cursors and stores no secret in its receipt', async () => {
  const { runPrelaunchRefresh } = await loadDriver()
  const directory = await mkdtemp(join(tmpdir(), 'weather-prelaunch-driver-'))
  const receiptPath = join(directory, 'receipt.jsonl')
  const requests = []
  const responses = [batch({ nextCursor: 'cursor-1' }), batch({ nextCursor: 'cursor-2' }), batch()]

  const summary = await runPrelaunchRefresh({
    baseUrl: 'https://example.test',
    secret: 'not-for-receipt',
    receiptPath,
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body))
      return response(responses.shift())
    },
  })

  assert.deepEqual(requests.map((request) => request.cursor), [null, 'cursor-1', 'cursor-2'])
  assert.equal(summary.completed, 3)
  assert.equal(summary.finalCursor, null)
  const receipt = await readFile(receiptPath, 'utf8')
  assert.doesNotMatch(receipt, /not-for-receipt/)
  assert.doesNotMatch(receipt, /authorization/i)
})

test('prelaunch driver retries one failed batch once and resumes from the receipt cursor', async () => {
  const { runPrelaunchRefresh } = await loadDriver()
  const directory = await mkdtemp(join(tmpdir(), 'weather-prelaunch-driver-'))
  const receiptPath = join(directory, 'receipt.jsonl')
  await writeFile(receiptPath, `${JSON.stringify({ status: 'completed', nextCursor: 'resume-cursor' })}\n`, 'utf8')
  const requests = []
  const responses = [batch({ failed: 1 }), batch()]

  const summary = await runPrelaunchRefresh({
    baseUrl: 'https://example.test',
    secret: 'not-for-receipt',
    receiptPath,
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body))
      return response(responses.shift())
    },
  })

  assert.deepEqual(requests.map((request) => request.cursor), ['resume-cursor', 'resume-cursor'])
  assert.equal(summary.retries, 1)
})

test('prelaunch driver treats a terminal completed receipt as an already-completed no-op', async () => {
  const { runPrelaunchRefresh } = await loadDriver()
  const directory = await mkdtemp(join(tmpdir(), 'weather-prelaunch-driver-'))
  const receiptPath = join(directory, 'receipt.jsonl')
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return response(batch())
  }

  await runPrelaunchRefresh({
    baseUrl: 'https://example.test',
    secret: 'not-for-receipt',
    receiptPath,
    fetchImpl,
  })
  const secondRun = await runPrelaunchRefresh({
    baseUrl: 'https://example.test',
    secret: 'not-for-receipt',
    receiptPath,
    fetchImpl,
  })

  assert.equal(calls, 1)
  assert.deepEqual(secondRun, {
    completed: 0,
    retries: 0,
    finalCursor: null,
    alreadyCompleted: true,
  })
})

test('prelaunch driver throws after the one allowed causal retry', async () => {
  const { runPrelaunchRefresh } = await loadDriver()
  const directory = await mkdtemp(join(tmpdir(), 'weather-prelaunch-driver-'))
  const receiptPath = join(directory, 'receipt.jsonl')
  let calls = 0

  await assert.rejects(
    () => runPrelaunchRefresh({
      baseUrl: 'https://example.test',
      secret: 'not-for-receipt',
      receiptPath,
      fetchImpl: async () => {
        calls += 1
        return response(batch({ failed: 1 }))
      },
    }),
    /failed after one retry/
  )
  assert.equal(calls, 2)
})
