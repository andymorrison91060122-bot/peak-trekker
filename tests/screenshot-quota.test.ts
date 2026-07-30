import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  computeScreenshotQuotaState,
  SCREENSHOT_QUOTA_FIRST_MONTH_FREE_LIMIT,
  SCREENSHOT_QUOTA_MONTHLY_FREE_LIMIT,
  SCREENSHOT_QUOTA_PAID_LIMIT,
} from '../src/lib/screenshot/quota.ts'
import { recognizeScreenshotWithFallback } from '../src/lib/screenshot/tencent-ocr-adapter.ts'
import type { OcrResult, TencentOcrSource } from '../src/lib/screenshot/types.ts'

const emptyOcr: OcrResult = { textBlocks: [], rawText: '' }
const filledOcr: OcrResult = {
  rawText: '路线距离\n5.9 km',
  textBlocks: [{ text: '路线距离', confidence: 99, x: 0, y: 0, width: 10, height: 10 }],
}

test('screenshot quota grants first OCR month 5 free recognitions', () => {
  const quota = computeScreenshotQuotaState({
    rows: [],
    profile: { subscription_tier: 'free' },
    monthKey: '2026-05',
  })

  assert.equal(quota.isFirstMonth, true)
  assert.equal(quota.freeLimit, SCREENSHOT_QUOTA_FIRST_MONTH_FREE_LIMIT)
  assert.equal(quota.paidLimit, 0)
  assert.equal(quota.remaining, 5)
})

test('screenshot quota grants later free months 2 recognitions', () => {
  const quota = computeScreenshotQuotaState({
    rows: [{ month_key: '2026-04', free_used: 5, paid_used: 0 }],
    profile: { subscription_tier: 'free' },
    monthKey: '2026-05',
  })

  assert.equal(quota.isFirstMonth, false)
  assert.equal(quota.freeLimit, SCREENSHOT_QUOTA_MONTHLY_FREE_LIMIT)
  assert.equal(quota.remaining, 2)
})

test('screenshot quota includes paid monthly allowance for premium users', () => {
  const quota = computeScreenshotQuotaState({
    rows: [{ month_key: '2026-05', free_used: 5, paid_used: 9 }],
    profile: { subscription_tier: 'premium' },
    monthKey: '2026-05',
  })

  assert.equal(quota.freeRemaining, 0)
  assert.equal(quota.paidLimit, SCREENSHOT_QUOTA_PAID_LIMIT)
  assert.equal(quota.paidRemaining, 21)
  assert.equal(quota.remaining, 21)
})

test('screenshot quota clamps exhausted usage to zero remaining', () => {
  const quota = computeScreenshotQuotaState({
    rows: [{ month_key: '2026-05', free_used: 7, paid_used: 0 }],
    profile: { subscription_tier: 'free' },
    monthKey: '2026-05',
  })

  assert.equal(quota.freeRemaining, 0)
  assert.equal(quota.remaining, 0)
})

test('Tencent OCR router returns basic when BasicOCR has text blocks', async () => {
  const result = await recognizeScreenshotWithFallback('base64', async (_image, source) => {
    assert.equal(source, 'basic')
    return filledOcr
  })

  assert.equal(result.source, 'basic')
  assert.equal(result.ocrResult, filledOcr)
})

test('Tencent OCR router falls back to accurate when BasicOCR returns no text', async () => {
  const calls: TencentOcrSource[] = []
  const result = await recognizeScreenshotWithFallback('base64', async (_image, source) => {
    calls.push(source)
    return source === 'basic' ? emptyOcr : filledOcr
  })

  assert.deepEqual(calls, ['basic', 'accurate'])
  assert.equal(result.source, 'accurate')
  assert.equal(result.fallbackReason, 'basic_empty_result')
})

test('Tencent OCR router falls back to accurate on transient BasicOCR errors', async () => {
  const calls: TencentOcrSource[] = []
  const result = await recognizeScreenshotWithFallback('base64', async (_image, source) => {
    calls.push(source)
    if (source === 'basic') throw new Error('Tencent basic OCR failed: rate limit exceeded')
    return filledOcr
  })

  assert.deepEqual(calls, ['basic', 'accurate'])
  assert.equal(result.source, 'accurate')
})

test('Tencent OCR router does not hide missing credential errors', async () => {
  await assert.rejects(
    () => recognizeScreenshotWithFallback('base64', async () => {
      throw new Error('TENCENT_CLOUD_SECRET_ID is not configured')
    }),
    /not configured/
  )
})

test('screenshot recognition reserves quota before OCR and refunds only provider failures', async () => {
  const {
    ScreenshotRecognitionAttemptError,
    recognizeWithReservedScreenshotQuota,
  } = await import('../src/lib/screenshot/recognition-quota.ts')
  const quota = {
    monthKey: '2026-06',
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
  } as const

  const calls: string[] = []
  const success = await recognizeWithReservedScreenshotQuota({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-id',
    quota,
    requestId: 'request-1',
    adminClient: {} as never,
    recognize: async () => {
      calls.push('recognize')
      return {
        source: 'mimo_v25',
        ocrResult: filledOcr,
        parsedFields: {},
      }
    },
    reserve: async (_adminClient, _userId, _quota, requestId) => {
      calls.push(`reserve:${requestId}`)
      return {
        success: true,
        bucket: 'free',
        requestId,
        quota: { ...quota, freeUsed: 1, freeRemaining: 1, remaining: 1 },
      }
    },
    finalize: async (_adminClient, _userId, requestId, nextQuota) => {
      calls.push(`finalize:${requestId}`)
      return {
        success: true,
        requestId,
        quota: nextQuota,
      }
    },
    refund: async () => {
      calls.push('refund')
      return {
        success: true,
        reason: 'already_refunded',
        requestId: 'request-1',
        quota,
      }
    },
  })

  assert.deepEqual(calls, ['reserve:request-1', 'recognize', 'finalize:request-1'])
  assert.equal(success.reserveResult.success, true)
  assert.equal(success.finalizeResult.success, true)

  calls.length = 0
  await assert.rejects(
    () => recognizeWithReservedScreenshotQuota({
      imageBase64: 'base64',
      mimeType: 'image/png',
      userId: 'user-id',
      quota,
      requestId: 'request-2',
      adminClient: {} as never,
      recognize: async () => {
        calls.push('recognize')
        throw new TypeError('fetch failed')
      },
      reserve: async (_adminClient, _userId, _quota, requestId) => {
        calls.push(`reserve:${requestId}`)
        return {
          success: true,
          bucket: 'free',
          requestId,
          quota: { ...quota, freeUsed: 1, freeRemaining: 1, remaining: 1 },
        }
      },
      finalize: async () => {
        calls.push('finalize')
        return {
          success: true,
          requestId: 'request-2',
          quota,
        }
      },
      refund: async (_adminClient, _userId, requestId) => {
        calls.push(`refund:${requestId}`)
        return {
          success: true,
          requestId,
          reason: null,
          quota,
        }
      },
    }),
    /fetch failed/,
  )
  assert.deepEqual(calls, ['reserve:request-2', 'recognize', 'refund:request-2'])

  await assert.rejects(
    () => recognizeWithReservedScreenshotQuota({
      imageBase64: 'base64',
      mimeType: 'image/png',
      userId: 'user-id',
      quota,
      requestId: 'request-refund-failed',
      adminClient: {} as never,
      recognize: async () => {
        throw new TypeError('fetch failed')
      },
      reserve: async (_adminClient, _userId, _quota, requestId) => ({
        success: true,
        bucket: 'free',
        requestId,
        quota: { ...quota, freeUsed: 1, freeRemaining: 1, remaining: 1 },
      }),
      finalize: async () => {
        throw new Error('finalize should not run for provider failure')
      },
      refund: async (_adminClient, _userId, requestId, nextQuota) => ({
        success: false,
        requestId,
        reason: 'rpc_error',
        error: 'temporary database failure',
        quota: nextQuota,
      }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof ScreenshotRecognitionAttemptError)
      assert.equal(error.quotaRefunded, false)
      assert.match(error.message, /fetch failed/)
      return true
    },
  )
})

test('successful OCR survives a quota finalize failure without a second recognition', async () => {
  const { recognizeWithReservedScreenshotQuota } = await import('../src/lib/screenshot/recognition-quota.ts')
  const quota = {
    monthKey: '2026-06',
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
  } as const
  let recognitionCalls = 0

  const result = await recognizeWithReservedScreenshotQuota({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-id',
    quota,
    requestId: 'request-finalize-failed',
    adminClient: {} as never,
    recognize: async () => {
      recognitionCalls += 1
      return {
        source: 'mimo_v25',
        ocrResult: filledOcr,
        parsedFields: { distance: 5.9 },
      }
    },
    reserve: async (_adminClient, _userId, _quota, requestId) => ({
      success: true,
      bucket: 'free',
      requestId,
      quota: { ...quota, freeUsed: 1, freeRemaining: 1, remaining: 1 },
    }),
    finalize: async (_adminClient, _userId, requestId, nextQuota) => ({
      success: false,
      requestId,
      reason: 'rpc_error',
      error: 'temporary database failure',
      quota: nextQuota,
    }),
    refund: async () => {
      throw new Error('refund should not run after valid OCR')
    },
  })

  assert.equal(recognitionCalls, 1)
  assert.equal(result.reserveResult.success, true)
  assert.deepEqual(result.recognition.parsedFields, { distance: 5.9 })
  assert.equal(result.finalizeResult.success, false)
  assert.equal(result.reserveResult.quota.remaining, 1)
})

test('successful OCR survives a thrown quota finalize error without refunding or retrying', async () => {
  const { recognizeWithReservedScreenshotQuota } = await import('../src/lib/screenshot/recognition-quota.ts')
  const quota = {
    monthKey: '2026-06',
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
  } as const
  let recognitionCalls = 0
  let refundCalls = 0

  const result = await recognizeWithReservedScreenshotQuota({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-id',
    quota,
    requestId: 'request-finalize-threw',
    adminClient: {} as never,
    recognize: async () => {
      recognitionCalls += 1
      return {
        source: 'mimo_v25',
        ocrResult: filledOcr,
        parsedFields: { distance: 5.9 },
      }
    },
    reserve: async (_adminClient, _userId, _quota, requestId) => ({
      success: true,
      bucket: 'free',
      requestId,
      quota: { ...quota, freeUsed: 1, freeRemaining: 1, remaining: 1 },
    }),
    finalize: async () => {
      throw new TypeError('fetch failed during finalize')
    },
    refund: async (_adminClient, _userId, requestId, nextQuota) => {
      refundCalls += 1
      return {
        success: true,
        requestId,
        reason: null,
        quota: nextQuota,
      }
    },
  })

  assert.equal(recognitionCalls, 1)
  assert.equal(refundCalls, 0)
  assert.equal(result.reserveResult.success, true)
  assert.deepEqual(result.recognition.parsedFields, { distance: 5.9 })
  assert.deepEqual(result.finalizeResult, {
    success: false,
    requestId: 'request-finalize-threw',
    reason: 'rpc_error',
    error: 'fetch failed during finalize',
    quota: result.reserveResult.quota,
  })
})

test('dangerous OCR-first quota helper is not exported or retained', () => {
  const recognitionQuotaSource = readFileSync('src/lib/screenshot/recognition-quota.ts', 'utf8')
  const quotaSource = readFileSync('src/lib/screenshot/quota.ts', 'utf8')

  assert.doesNotMatch(recognitionQuotaSource, /recognizeThenConsumeScreenshotQuota/)
  assert.doesNotMatch(recognitionQuotaSource, /legacy-request/)
  assert.doesNotMatch(quotaSource, /ConsumeScreenshotQuotaResult/)
  assert.doesNotMatch(quotaSource, /consumeScreenshotQuota/)
})

test('screenshot quota migration defines request-bound reserve finalize and refund contracts', () => {
  const migration = readFileSync(
    'supabase/migrations/20260730180543_screenshot_quota_reservations.sql',
    'utf8',
  )

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.screenshot_quota_attempts/)
  assert.match(migration, /request_id TEXT NOT NULL UNIQUE/)
  assert.match(migration, /status TEXT NOT NULL/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reserve_screenshot_quota_attempt/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_screenshot_quota_attempt/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.refund_screenshot_quota_attempt/)
})
