import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adjudicateMimoTextPayload, type MimoTextPayload } from '../src/lib/screenshot/mimo-v25-text-adjudicator.ts'
import { recognizeScreenshotText, type ScreenshotRecognitionOptions } from '../src/lib/screenshot/recognition-service.ts'
import type { OcrResult } from '../src/lib/screenshot/types.ts'

const emptyOcr: OcrResult = { textBlocks: [], rawText: '' }
const tencentOcr: OcrResult = {
  rawText: '路线距离\n5.9 km\n运动时长\n2h 00m',
  textBlocks: [
    { text: '路线距离', confidence: 99, x: 0, y: 0, width: 40, height: 12 },
    { text: '5.9 km', confidence: 99, x: 0, y: 14, width: 40, height: 12 },
    { text: '运动时长', confidence: 99, x: 0, y: 30, width: 40, height: 12 },
    { text: '2h 00m', confidence: 99, x: 0, y: 44, width: 40, height: 12 },
  ],
}

function payload(fields: MimoTextPayload['fields']): MimoTextPayload {
  return { app: null, imageType: 'activity_summary', fields }
}

function mimoResult(fields: MimoTextPayload['fields']) {
  const parsed = payload(fields)
  const adjudication = adjudicateMimoTextPayload(parsed)
  return {
    source: 'mimo_v25' as const,
    ocrResult: emptyOcr,
    parsedFields: adjudication.parsedFields,
    adjudication,
    meta: {
      model: 'mimo-v2.5' as const,
      latencyMs: 123,
      usage: null,
      parsePath: 'direct' as const,
      repairAttempts: 0,
      thinkingAccepted: true,
      fallbackReason: adjudication.fallbackReason,
    },
  }
}

function tencentInvoker(calls: string[]) {
  return async (imageBase64: string) => {
    calls.push(imageBase64)
    return { source: 'basic' as const, ocrResult: tencentOcr }
  }
}

test('recognition service uses mimo as primary when required distance is confident', async () => {
  const tencentCalls: string[] = []
  const options: ScreenshotRecognitionOptions = {
    mimoInvoker: async () => mimoResult({
      distanceKm: [{ raw: '5.9', labelRaw: '路线距离', unitRaw: 'km', bbox: null, sourceKind: 'metric_label', visibility: 'visible', confidence: 0.96, reason: null }],
      durationSeconds: [{ raw: '2:00:00', labelRaw: '运动时长', unitRaw: null, bbox: null, sourceKind: 'metric_label', visibility: 'visible', confidence: 0.92, reason: null }],
    }),
    tencentInvoker: tencentInvoker(tencentCalls),
  }

  const result = await recognizeScreenshotText('base64', 'image/png', options)

  assert.equal(result.source, 'mimo_v25')
  assert.equal(result.parsedFields.distance?.value, 5.9)
  assert.deepEqual(tencentCalls, [])
})

test('recognition service falls back to Tencent when mimo misses required distance', async () => {
  const tencentCalls: string[] = []
  const result = await recognizeScreenshotText('base64', 'image/png', {
    mimoInvoker: async () => mimoResult({
      durationSeconds: [{ raw: '2:00:00', labelRaw: '运动时长', unitRaw: null, bbox: null, sourceKind: 'metric_label', visibility: 'visible', confidence: 0.92, reason: null }],
    }),
    tencentInvoker: tencentInvoker(tencentCalls),
  })

  assert.equal(result.source, 'basic')
  assert.equal(result.parsedFields.distance?.value, 5.9)
  assert.equal(tencentCalls.length, 1)
  assert.ok(result.engineMeta?.fallbackChain.some((item) => item.includes('mimo_missing_required_distance')))
})

test('recognition service returns an empty low-confidence result when every engine sees no text', async () => {
  const result = await recognizeScreenshotText('base64', 'image/png', {
    mimoInvoker: async () => mimoResult({}),
    tencentInvoker: async () => {
      throw new Error('Tencent accurate OCR failed: 照片中未检测到文本')
    },
  })

  assert.equal(result.source, 'accurate')
  assert.deepEqual(result.ocrResult, { textBlocks: [], rawText: '' })
  assert.deepEqual(result.parsedFields, {})
  assert.equal(result.engineMeta?.primary, 'mimo_v25')
  assert.equal(result.engineMeta?.fallback, 'accurate')
  assert.equal(result.engineMeta?.noTextDetected, true)
  assert.ok(result.engineMeta?.fallbackChain.includes('tencent_accurate:no_text'))
})

test('recognition service still rejects non-empty Tencent failures', async () => {
  await assert.rejects(
    recognizeScreenshotText('base64', 'image/png', {
      mimoInvoker: async () => mimoResult({}),
      tencentInvoker: async () => {
        throw new Error('Tencent accurate OCR failed: upstream timeout')
      },
    }),
    /upstream timeout/
  )
})

test('recognition service skips mimo when forced to Tencent', async () => {
  let mimoCalled = false
  const result = await recognizeScreenshotText('base64', 'image/png', {
    forceTencent: true,
    mimoInvoker: async () => {
      mimoCalled = true
      return mimoResult({})
    },
    tencentInvoker: tencentInvoker([]),
  })

  assert.equal(result.source, 'basic')
  assert.equal(mimoCalled, false)
})
