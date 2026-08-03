import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import type { OcrResult, ScreenshotQuotaState } from '../src/lib/screenshot/types.ts'

const quota: ScreenshotQuotaState = {
  monthKey: '2026-08',
  isFirstMonth: false,
  subscriptionTier: 'free',
  freeLimit: 2,
  freeUsed: 0,
  paidLimit: 0,
  paidUsed: 0,
  freeRemaining: 2,
  paidRemaining: 0,
  remaining: 2,
  totalLimit: 2,
}

const ocrResult: OcrResult = {
  rawText: '路线距离 5.9 km',
  textBlocks: [{ text: '路线距离', confidence: 99, x: 0, y: 0, width: 10, height: 10 }],
}

const recognition = {
  source: 'mimo_v25' as const,
  ocrResult,
  parsedFields: { distance: { value: 5.9, unit: 'km' as const, raw: '5.9 km' } },
  engineMeta: { primary: 'mimo_v25' as const, fallbackChain: ['mimo_v25'] },
}

test('lightweight recovery survives two pending reads and returns a 31.7-second completion without image, reserve, or OCR work', async () => {
  const {
    SCREENSHOT_RECOGNITION_RECOVERY_DEADLINE_MS,
    recoverScreenshotRecognition,
  } = await import('../src/lib/screenshot/recognition-recovery.ts')
  assert.equal(SCREENSHOT_RECOGNITION_RECOVERY_DEADLINE_MS, 55_000)
  const controller = new AbortController()
  const requestId = '2408c2b0-6cb7-4d2b-b7f9-0df5972ea555'
  let elapsedMs = 28_400
  let recoveryCalls = 0
  const reserveCalls = 0
  const recognitionCalls = 0

  const result = await recoverScreenshotRecognition({
    requestId,
    startedAtMs: 0,
    signal: controller.signal,
    now: () => elapsedMs,
    wait: async (ms, signal) => {
      assert.equal(signal, controller.signal)
      elapsedMs += ms
    },
    read: async (...args) => {
      assert.equal(args.length, 2)
      assert.equal(args[0], requestId)
      assert.equal(args[1], controller.signal)
      recoveryCalls += 1
      if (recoveryCalls <= 2) {
        return { status: 202, ok: true, payload: { code: 'screenshot_recognition_pending' } }
      }
      elapsedMs = 31_700
      return { status: 200, ok: true, payload: { ok: true, ocrSource: 'mimo_v25' } }
    },
  })

  assert.equal(result.status, 200)
  assert.equal(result.payload.ok, true)
  assert.equal(recoveryCalls, 3)
  assert.equal(reserveCalls, 0)
  assert.equal(recognitionCalls, 0)
  assert.ok(elapsedMs < SCREENSHOT_RECOGNITION_RECOVERY_DEADLINE_MS)
})

test('lightweight recovery ends at its total deadline without quota mutation', async () => {
  const {
    ScreenshotRecognitionRecoveryDeadlineError,
    recoverScreenshotRecognition,
  } = await import('../src/lib/screenshot/recognition-recovery.ts')
  const controller = new AbortController()
  let elapsedMs = 28_400
  let recoveryCalls = 0
  let providerCalls = 1
  const quotaMutations = 0

  await assert.rejects(
    recoverScreenshotRecognition({
      requestId: '2c5d05b0-4b82-43b4-9e02-b049789b1e4c',
      startedAtMs: 0,
      signal: controller.signal,
      now: () => elapsedMs,
      wait: async (ms) => {
        elapsedMs += ms
      },
      read: async () => {
        recoveryCalls += 1
        throw new TypeError('network body read failed')
      },
    }),
    ScreenshotRecognitionRecoveryDeadlineError,
  )

  assert.ok(recoveryCalls > 0)
  assert.ok(elapsedMs >= 55_000)
  assert.equal(quotaMutations, 0)
  assert.equal(providerCalls, 1)
})

test('lightweight recovery tolerates two transient reads before pending then a 31.7-second completion', async () => {
  const { recoverScreenshotRecognition } = await import('../src/lib/screenshot/recognition-recovery.ts')
  const controller = new AbortController()
  const requestId = '9a5d2bc5-b3f2-4aae-b749-669b85ee7823'
  let elapsedMs = 28_400
  let recoveryCalls = 0
  const providerCalls = 1
  const quotaMutations = 0

  const result = await recoverScreenshotRecognition({
    requestId,
    startedAtMs: 0,
    signal: controller.signal,
    now: () => elapsedMs,
    wait: async (ms) => {
      elapsedMs += ms
    },
    read: async () => {
      recoveryCalls += 1
      if (recoveryCalls <= 2) throw new TypeError('network body read failed')
      if (recoveryCalls === 3) {
        return { status: 202, ok: true, payload: { code: 'screenshot_recognition_pending' } }
      }
      elapsedMs = 31_700
      return { status: 200, ok: true, payload: { ok: true, ocrSource: 'mimo_v25' } }
    },
  })

  assert.equal(result.status, 200)
  assert.equal(recoveryCalls, 4)
  assert.equal(providerCalls, 1)
  assert.equal(quotaMutations, 0)
  assert.ok(elapsedMs < 55_000)
})

test('aborting during a transient recovery observation exits immediately', async () => {
  const { recoverScreenshotRecognition } = await import('../src/lib/screenshot/recognition-recovery.ts')
  const controller = new AbortController()
  let recoveryCalls = 0

  await assert.rejects(
    recoverScreenshotRecognition({
      requestId: 'c522e8bc-9a91-4147-8cfe-4d58e91214ef',
      startedAtMs: 0,
      signal: controller.signal,
      read: async () => {
        recoveryCalls += 1
        throw new TypeError('network body read failed')
      },
      wait: async () => {
        controller.abort()
      },
    }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  )

  assert.equal(recoveryCalls, 1)
})

test('a 200 response with a truncated body recovers through the same request id without another image submission', async () => {
  const {
    readScreenshotRecognitionResponse,
    recoverScreenshotRecognition,
  } = await import('../src/lib/screenshot/recognition-recovery.ts')
  const requestId = '5a4ad35e-fd47-4e74-b4e0-e7e749abbc88'
  const controller = new AbortController()
  let initialImagePosts = 1
  let recoveryReads = 0
  const providerCalls = 1
  const reserveCalls = 1

  await assert.rejects(
    readScreenshotRecognitionResponse({
      status: 200,
      ok: true,
      json: async () => {
        throw new TypeError('response body truncated')
      },
    }),
    /response body truncated/,
  )

  const recovered = await recoverScreenshotRecognition({
    requestId,
    startedAtMs: 0,
    signal: controller.signal,
    read: async (nextRequestId) => {
      recoveryReads += 1
      assert.equal(nextRequestId, requestId)
      return readScreenshotRecognitionResponse({
        status: 200,
        ok: true,
        json: async () => ({ ok: true, ocrSource: 'mimo_v25' }),
      })
    },
  })

  assert.equal(recovered.status, 200)
  assert.equal(recovered.payload.ok, true)
  assert.equal(initialImagePosts, 1)
  assert.equal(recoveryReads, 1)
  assert.equal(providerCalls, 1)
  assert.equal(reserveCalls, 1)
})

test('recognition checkpoint timing allowlists only bounded timing fields and prefers MIMO latency', async () => {
  const {
    createScreenshotRecognitionCheckpointTiming,
  } = await import('../src/lib/screenshot/recognition-timing.ts')
  const timing = createScreenshotRecognitionCheckpointTiming(
    'f0fc64d6-b76a-481a-85b0-22cf2d24e9d4',
    () => 1_000,
  )

  await timing.measureReserve(async () => undefined)
  timing.measureProviderResult({ mimo: { latencyMs: 317 } }, 41)
  await timing.measureFinalize(async () => undefined)

  const checkpoint = (timing.finish as (...args: unknown[]) => Record<string, unknown>)(
    'completed',
    false,
    {
      error: new Error('token=not-for-log'),
      providerPayload: { parsedFields: { secret: 'not-for-log' } },
    },
  )
  assert.deepEqual(checkpoint, {
    requestId: 'f0fc64d6-b76a-481a-85b0-22cf2d24e9d4',
    phase: 'recognition',
    reserve_ms: 0,
    provider_ms: 317,
    finalize_ms: 0,
    total_ms: 0,
    outcome: 'completed',
    replay: false,
  })
  assert.deepEqual(Object.keys(checkpoint), [
    'requestId',
    'phase',
    'reserve_ms',
    'provider_ms',
    'finalize_ms',
    'total_ms',
    'outcome',
    'replay',
  ])
  assert.doesNotMatch(JSON.stringify(checkpoint), /token|secret|payload|stack|providerError/i)
})

test('a lost client response is recovered by the same request id without a second reserve or OCR call', async () => {
  const { recognizeOrReplayScreenshotQuotaAttempt } = await import('../src/lib/screenshot/recognition-quota.ts')
  let status: 'missing' | 'reserved' | 'consumed' = 'missing'
  let stored: unknown = null
  let reserveCalls = 0
  let recognitionCalls = 0
  let finalizeCalls = 0
  const requestId = '8c2d3a73-9ee3-4b54-a6f8-e426a3d449a9'

  const findAttempt = async (_userId: string, nextRequestId: string) => {
    assert.equal(nextRequestId, requestId)
    if (status === 'missing') return { success: true as const, kind: 'missing' as const }
    if (status === 'reserved') return { success: true as const, kind: 'pending' as const }
    return { success: true as const, kind: 'completed' as const, recognition: stored }
  }

  const reserve = async (_adminClient: never, _userId: string, nextQuota: ScreenshotQuotaState, nextRequestId: string) => {
    reserveCalls += 1
    assert.equal(nextRequestId, requestId)
    assert.equal(status, 'missing')
    status = 'reserved'
    return {
      success: true as const,
      requestId,
      bucket: 'free' as const,
      quota: { ...nextQuota, freeUsed: 1, freeRemaining: 1, remaining: 1 },
    }
  }

  const finalize = async (_adminClient: never, _userId: string, nextRequestId: string, nextQuota: ScreenshotQuotaState, result: unknown) => {
    finalizeCalls += 1
    assert.equal(nextRequestId, requestId)
    status = 'consumed'
    stored = result
    return { success: true as const, requestId, quota: nextQuota }
  }

  const first = await recognizeOrReplayScreenshotQuotaAttempt({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-a',
    quota,
    requestId,
    adminClient: {} as never,
    findAttempt,
    reserve,
    finalize,
    refund: async () => {
      throw new Error('refund should not run after a valid provider result')
    },
    recognize: async () => {
      recognitionCalls += 1
      return recognition
    },
  })

  assert.equal(first.kind, 'completed')
  assert.equal(recognitionCalls, 1)
  assert.equal(reserveCalls, 1)
  assert.equal(finalizeCalls, 1)

  // The first response is intentionally ignored to reproduce a client transport failure.
  const replay = await recognizeOrReplayScreenshotQuotaAttempt({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-a',
    quota,
    requestId,
    adminClient: {} as never,
    findAttempt,
    reserve,
    finalize,
    refund: async () => {
      throw new Error('refund should not run for a completed replay')
    },
    recognize: async () => {
      recognitionCalls += 1
      return recognition
    },
  })

  assert.equal(replay.kind, 'replayed')
  assert.deepEqual(replay.recognition, recognition)
  assert.equal(recognitionCalls, 1)
  assert.equal(reserveCalls, 1)
  assert.equal(finalizeCalls, 1)
})

test('a duplicate request while the first recognition is reserved returns pending and never starts parallel OCR', async () => {
  const { recognizeOrReplayScreenshotQuotaAttempt } = await import('../src/lib/screenshot/recognition-quota.ts')
  let status: 'missing' | 'reserved' = 'missing'
  let recognitionCalls = 0
  const requestId = '63d37990-9d86-4ddb-81a2-1b3510fb644d'

  const findAttempt = async () => status === 'missing'
    ? { success: true as const, kind: 'missing' as const }
    : { success: true as const, kind: 'pending' as const }

  const reserve = async (_adminClient: never, _userId: string, nextQuota: ScreenshotQuotaState, nextRequestId: string) => {
    assert.equal(nextRequestId, requestId)
    status = 'reserved'
    return {
      success: true as const,
      requestId,
      bucket: 'free' as const,
      quota: nextQuota,
    }
  }

  const first = recognizeOrReplayScreenshotQuotaAttempt({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-a',
    quota,
    requestId,
    adminClient: {} as never,
    findAttempt,
    reserve,
    finalize: async () => ({ success: true as const, requestId, quota }),
    refund: async () => ({ success: true as const, requestId, reason: null, quota }),
    recognize: async () => {
      recognitionCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return recognition
    },
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  const duplicate = await recognizeOrReplayScreenshotQuotaAttempt({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-a',
    quota,
    requestId,
    adminClient: {} as never,
    findAttempt,
    reserve,
    finalize: async () => ({ success: true as const, requestId, quota }),
    refund: async () => ({ success: true as const, requestId, reason: null, quota }),
    recognize: async () => {
      recognitionCalls += 1
      return recognition
    },
  })

  assert.equal(duplicate.kind, 'pending')
  await first
  assert.equal(recognitionCalls, 1)
})

test('request ids are bounded UUIDs before they can reach quota reservation', async () => {
  const { isValidScreenshotRecognitionRequestId } = await import('../src/lib/screenshot/recognition-quota.ts')
  assert.equal(isValidScreenshotRecognitionRequestId('8c2d3a73-9ee3-4b54-a6f8-e426a3d449a9'), true)
  assert.equal(isValidScreenshotRecognitionRequestId(''), false)
  assert.equal(isValidScreenshotRecognitionRequestId('x'.repeat(65)), false)
  assert.equal(isValidScreenshotRecognitionRequestId('not-a-uuid'), false)
  assert.equal(isValidScreenshotRecognitionRequestId('8c2d3a73-9ee3-4b54-a6f8-e426a3d449a9?other-user'), false)
})

test('idempotency migration stores only bounded result data and scopes replay reads to auth.uid()', () => {
  const migrationPath = 'supabase/migrations/20260803150802_screenshot_recognition_idempotency.sql'
  assert.equal(existsSync(migrationPath), true)
  const migration = readFileSync(migrationPath, 'utf8')

  assert.match(migration, /recognition_result JSONB/)
  assert.match(migration, /recognition_result_bytes INTEGER/)
  assert.match(migration, /CHECK \(recognition_result_bytes IS NULL OR recognition_result_bytes BETWEEN 1 AND 65536\)/)
  assert.match(migration, /result_expires_at TIMESTAMPTZ/)
  assert.match(migration, /UNIQUE \(user_id, request_id\)/)
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /WHERE a\.user_id = auth\.uid\(\)/)
  assert.doesNotMatch(migration, /DROP FUNCTION IF EXISTS public\.complete_screenshot_quota_attempt\(UUID, TEXT\)/)
  assert.match(migration, /Keep the two-argument overload for migration-first deployment and rollback compatibility/)
  assert.doesNotMatch(migration, /(?:REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION) public\.complete_screenshot_quota_attempt\(UUID, TEXT\)(?!,)/)
  assert.match(migration, /CREATE FUNCTION public\.complete_screenshot_quota_attempt\(\s*p_user_id UUID,\s*p_request_id TEXT,\s*p_recognition_result JSONB/s)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.complete_screenshot_quota_attempt\(UUID, TEXT, JSONB\)\s+TO service_role/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_screenshot_recognition_replay\(TEXT\) TO authenticated/)
  assert.doesNotMatch(migration, /GRANT .* ON TABLE public\.screenshot_quota_attempts TO authenticated/)
})

test('recognition route exposes a requestId-only recovery read without reserve, OCR, or image decoding', () => {
  const route = readFileSync('src/app/api/screenshot/recognize/route.ts', 'utf8')
  const getRoute = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))

  assert.match(getRoute, /new URL\(request\.url\)\.searchParams\.get\('requestId'\)/)
  assert.match(getRoute, /getScreenshotRecognitionReplay\(supabase, requestId\)/)
  assert.doesNotMatch(getRoute, /createSupabaseAdminClient|recognizeOrReplayScreenshotQuotaAttempt|formData|arrayBuffer|reserveScreenshotQuota/)
})

test('recognition route emits a single allowlisted checkpoint around reserve, provider, and finalize work', () => {
  const route = readFileSync('src/app/api/screenshot/recognize/route.ts', 'utf8')
  const checkpointLog = route.match(/console\.info\('screenshot recognition checkpoint', [^\n]+\)/)?.[0] ?? ''

  assert.match(route, /createScreenshotRecognitionCheckpointTiming/)
  assert.match(route, /measureReserve/)
  assert.match(route, /measureProvider/)
  assert.match(route, /measureFinalize/)
  assert.match(route, /screenshot recognition checkpoint/)
  assert.doesNotMatch(checkpointLog, /error|payload|providerError|stack/i)
})

test('recognition client sends an initial image POST once and lets malformed response bodies enter requestId-only recovery', () => {
  const client = readFileSync('src/app/(flow)/screenshot/ScreenshotClient.tsx', 'utf8')
  const recognitionFlow = client.slice(client.indexOf('async function recognize(file: File)'), client.indexOf('function engageUpgradeSheet'))

  assert.match(recognitionFlow, /method: 'POST'/)
  assert.match(recognitionFlow, /readScreenshotRecognitionResponse<RecognizeResponse>\(response\)/)
  assert.match(recognitionFlow, /catch \(error\) \{\s*if \(controller\.signal\.aborted\) throw error\s*recognitionResponse = await recoverScreenshotRecognition/s)
  assert.match(recognitionFlow, /method: 'GET'/)
  assert.doesNotMatch(recognitionFlow, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/)
})
