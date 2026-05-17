import assert from 'node:assert/strict'
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
