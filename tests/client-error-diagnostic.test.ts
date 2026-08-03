import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  buildClientErrorDiagnosticPayload,
  createOneShotClientErrorReporter,
  reportClientErrorDiagnostic,
  validateClientErrorDiagnosticPayload,
} from '../src/lib/client-error-diagnostic.ts'
import { handleClientErrorDiagnosticPost } from '../src/lib/client-error-diagnostic-request.ts'

const VALID_CORRELATION_ID = '4e2a93ee-2a10-4b10-ae37-f1dbadbc6b99'

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    correlationId: VALID_CORRELATION_ID,
    name: 'ChunkLoadError',
    message: 'Loading chunk 42 failed',
    digest: 'next-digest',
    pathname: '/auth/login',
    runtime: 'cloudflare',
    ...overrides,
  }
}

function diagnosticRequest(
  body: BodyInit,
  headers: HeadersInit = {},
  url = 'https://peaktrekker.cc/api/diagnostics/client-error',
) {
  const requestUrl = new URL(url)

  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: requestUrl.host,
      origin: requestUrl.origin,
      ...headers,
    },
    body,
  })
}

function chunkedOversizeDiagnosticRequest() {
  let pulls = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1
      if (pulls === 1) {
        controller.enqueue(new Uint8Array(2048))
        return
      }
      if (pulls === 2) {
        controller.enqueue(new Uint8Array([1]))
        return
      }
      throw new Error('trailing chunk should not be consumed')
    },
    cancel() {
      cancelled = true
    },
  }, { highWaterMark: 0 })
  const request = new Request('https://peaktrekker.cc/api/diagnostics/client-error', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'peaktrekker.cc',
      origin: 'https://peaktrekker.cc',
    },
    body: stream,
    duplex: 'half',
  } as RequestInit)

  return {
    request,
    metrics: () => ({ pulls, cancelled }),
  }
}

test('client diagnostic payload is allowlisted, bounded, and excludes location query data', () => {
  const payload = buildClientErrorDiagnosticPayload(
    {
      name: 'ChunkLoadError',
      message: `failure?token=private-${'x'.repeat(900)}`,
      digest: 'digest-value',
      stack: 'never report stack traces',
    },
    '/auth/login?token=private#fragment',
    'cloudflare',
    VALID_CORRELATION_ID,
  )

  assert.deepEqual(Object.keys(payload).sort(), [
    'correlationId',
    'digest',
    'message',
    'name',
    'pathname',
    'runtime',
  ])
  assert.equal(payload.pathname, '/auth/login')
  assert.ok(payload.message.length <= 512)
  assert.doesNotMatch(payload.message, /private/)
  assert.equal('stack' in payload, false)
  assert.equal(validateClientErrorDiagnosticPayload(payload), true)
})

test('one-shot reporter posts once per mounted boundary and swallows reporting failures', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const reporter = createOneShotClientErrorReporter(async (url, init) => {
    calls.push({ url, init })
    throw new Error('network unavailable')
  })
  const payload = validPayload()

  await assert.doesNotReject(reporter(payload))
  await assert.doesNotReject(reporter(payload))

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/diagnostics/client-error')
  assert.equal(calls[0].init?.method, 'POST')
  assert.equal(calls[0].init?.credentials, 'omit')
  assert.equal(calls[0].init?.keepalive, true)
  assert.equal(calls[0].init?.referrerPolicy, 'no-referrer')
})

test('diagnostic preparation failures do not throw from the existing error boundary path', () => {
  let reports = 0
  const reporter = () => {
    reports += 1
  }
  const error = new Error('hydration failed')

  assert.doesNotThrow(() => reportClientErrorDiagnostic(reporter, error, {
    getPathname: () => '/auth/login',
    getRuntime: () => 'cloudflare',
    createCorrelationId: () => {
      throw new Error('crypto unavailable')
    },
  }))
  assert.doesNotThrow(() => reportClientErrorDiagnostic(reporter, error, {
    getPathname: () => '/auth/login',
    getRuntime: () => 'cloudflare',
    createCorrelationId: () => VALID_CORRELATION_ID,
    buildPayload: () => {
      throw new Error('payload preparation failed')
    },
  }))

  assert.equal(reports, 0)
})

test('diagnostic endpoint logs only a valid bounded payload and returns 204', async () => {
  const originalConsoleError = console.error
  const records: unknown[][] = []
  console.error = (...args: unknown[]) => records.push(args)

  try {
    const response = await handleClientErrorDiagnosticPost(diagnosticRequest(JSON.stringify(validPayload())))
    assert.equal(response.status, 204)
    assert.equal(records.length, 1)
    assert.equal(records[0][0], '[client-error-diagnostic]')
    assert.deepEqual(records[0][1], validPayload())
  } finally {
    console.error = originalConsoleError
  }
})

test('diagnostic endpoint accepts only matching apex, www, and localhost same-origin requests', async () => {
  const originalConsoleError = console.error
  const records: unknown[][] = []
  console.error = (...args: unknown[]) => records.push(args)

  try {
    const www = await handleClientErrorDiagnosticPost(
      diagnosticRequest(JSON.stringify(validPayload()), {}, 'https://www.peaktrekker.cc/api/diagnostics/client-error'),
    )
    const localhost = await handleClientErrorDiagnosticPost(
      diagnosticRequest(JSON.stringify(validPayload()), {}, 'http://localhost:3000/api/diagnostics/client-error'),
    )

    assert.equal(www.status, 204)
    assert.equal(localhost.status, 204)
    assert.equal(records.length, 2)
  } finally {
    console.error = originalConsoleError
  }
})

test('diagnostic endpoint rejects invalid, oversize, and cross-origin requests without logging payload data', async () => {
  const originalConsoleError = console.error
  const records: unknown[][] = []
  console.error = (...args: unknown[]) => records.push(args)

  try {
    const invalid = await handleClientErrorDiagnosticPost(diagnosticRequest(JSON.stringify(validPayload({ stack: 'sensitive' }))))
    const oversize = await handleClientErrorDiagnosticPost(diagnosticRequest('x'.repeat(4097)))
    const declaredOversize = await handleClientErrorDiagnosticPost(
      diagnosticRequest('{}', { 'content-length': '2049' }),
    )
    const nonJson = await handleClientErrorDiagnosticPost(
      diagnosticRequest(JSON.stringify(validPayload()), { 'content-type': 'text/plain' }),
    )
    const crossOrigin = await handleClientErrorDiagnosticPost(diagnosticRequest(JSON.stringify(validPayload()), {
      origin: 'https://example.com',
    }))
    const sensitive = await handleClientErrorDiagnosticPost(
      diagnosticRequest(JSON.stringify(validPayload({
        message: 'failed with access_token=private-value and user@example.com',
        pathname: '/profile/4e2a93ee-2a10-4b10-ae37-f1dbadbc6b99',
      }))),
    )

    assert.equal(invalid.status, 400)
    assert.equal(oversize.status, 413)
    assert.equal(declaredOversize.status, 413)
    assert.equal(nonJson.status, 415)
    assert.equal(crossOrigin.status, 403)
    assert.equal(sensitive.status, 400)
    assert.equal(records.length, 0)
  } finally {
    console.error = originalConsoleError
  }
})

test('diagnostic endpoint cancels a chunked oversize body before consuming a trailing chunk', async () => {
  const originalConsoleError = console.error
  const records: unknown[][] = []
  console.error = (...args: unknown[]) => records.push(args)

  try {
    const { request, metrics } = chunkedOversizeDiagnosticRequest()
    const response = await handleClientErrorDiagnosticPost(request)

    assert.equal(response.status, 413)
    assert.deepEqual(metrics(), { pulls: 2, cancelled: true })
    assert.equal(records.length, 0)
  } finally {
    console.error = originalConsoleError
  }
})

test('root error boundary retains its existing UI and invokes the invisible one-shot reporter', () => {
  const source = readFileSync('src/app/error.tsx', 'utf8')
  const routeSource = readFileSync('src/app/api/diagnostics/client-error/route.ts', 'utf8')
  const diagnosticSource = readFileSync('src/lib/client-error-diagnostic.ts', 'utf8')
  const baseline = execFileSync('git', ['show', 'e196e402e01a97a76be7005295e3883ab7a520fe:src/app/error.tsx'], {
    encoding: 'utf8',
  })

  assert.match(source, /出了点问题/)
  assert.match(source, /可能是网络或服务短暂不稳。你可以先重试一次。/)
  assert.match(source, /<PrimaryButton onClick=\{reset\}/)
  assert.match(source, /createOneShotClientErrorReporter/)
  assert.match(source, /reportClientErrorDiagnostic/)
  assert.match(diagnosticSource, /buildClientErrorDiagnosticPayload/)
  assert.match(diagnosticSource, /reportClientErrorDiagnostic/)
  assert.match(routeSource, /handleClientErrorDiagnosticPost\(request\)/)
  assert.equal(source.slice(source.indexOf('  return (')), baseline.slice(baseline.indexOf('  return (')))
})
