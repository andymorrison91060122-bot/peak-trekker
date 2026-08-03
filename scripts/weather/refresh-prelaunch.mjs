import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_RECEIPT_PATH = 'output/weather-prelaunch/receipt.jsonl'

function getRequiredEnvironment(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function getEndpoint(baseUrl) {
  return new URL('/api/weather/refresh-batch/', baseUrl).toString()
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function appendReceipt(receiptPath, entry) {
  await mkdir(dirname(receiptPath), { recursive: true })
  await appendFile(receiptPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

async function loadResumeState(receiptPath) {
  try {
    const contents = await readFile(receiptPath, 'utf8')
    let latestCompleted = null
    for (const line of contents.split('\n')) {
      if (!line) continue
      const entry = JSON.parse(line)
      if (entry.status === 'completed') {
        latestCompleted = entry
      }
    }
    if (!latestCompleted) {
      return { cursor: null, alreadyCompleted: false }
    }

    return {
      cursor: latestCompleted.nextCursor ?? null,
      alreadyCompleted: latestCompleted.nextCursor == null,
    }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { cursor: null, alreadyCompleted: false }
    }
    throw error
  }
}

async function requestBatch({ baseUrl, secret, cursor, fetchImpl }) {
  const response = await fetchImpl(getEndpoint(baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ mode: 'prelaunch', cursor }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.ok || body.mode !== 'prelaunch') {
    throw new Error(body?.error || `prelaunch refresh request failed with HTTP ${response.status}`)
  }
  if (body.failed > 0) {
    throw new Error(`prelaunch refresh reported ${body.failed} failed mountain(s)`)
  }

  return body
}

export async function runPrelaunchRefresh({
  baseUrl,
  secret,
  receiptPath = DEFAULT_RECEIPT_PATH,
  fetchImpl = fetch,
}) {
  const resolvedReceiptPath = resolve(receiptPath)
  const resumeState = await loadResumeState(resolvedReceiptPath)
  if (resumeState.alreadyCompleted) {
    return { completed: 0, retries: 0, finalCursor: null, alreadyCompleted: true }
  }

  let cursor = resumeState.cursor
  let completed = 0
  let retries = 0

  while (true) {
    let result
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        result = await requestBatch({ baseUrl, secret, cursor, fetchImpl })
        await appendReceipt(resolvedReceiptPath, {
          status: 'completed',
          cursor,
          nextCursor: result.nextCursor ?? null,
          checked: result.checked,
          refreshed: result.refreshed,
          skipped: result.skipped,
          attempt,
        })
        break
      } catch (error) {
        if (attempt === 2) {
          await appendReceipt(resolvedReceiptPath, {
            status: 'failed',
            cursor,
            error: getErrorMessage(error),
          })
          throw new Error(`prelaunch refresh failed after one retry: ${getErrorMessage(error)}`)
        }

        retries += 1
        await appendReceipt(resolvedReceiptPath, {
          status: 'retrying',
          cursor,
          error: getErrorMessage(error),
        })
      }
    }

    completed += 1
    cursor = result.nextCursor ?? null
    if (!cursor) {
      return { completed, retries, finalCursor: null, alreadyCompleted: false }
    }
  }
}

async function main() {
  const summary = await runPrelaunchRefresh({
    baseUrl: getRequiredEnvironment('BASE_URL'),
    secret: getRequiredEnvironment('WEATHER_REFRESH_SECRET'),
    receiptPath: process.env.WEATHER_PRELAUNCH_RECEIPT_PATH || DEFAULT_RECEIPT_PATH,
  })
  process.stdout.write(`${JSON.stringify(summary)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${getErrorMessage(error)}\n`)
    process.exitCode = 1
  })
}
