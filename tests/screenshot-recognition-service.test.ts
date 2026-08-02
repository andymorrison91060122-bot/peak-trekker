import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adjudicateMimoTextPayload, type MimoTextPayload } from '../src/lib/screenshot/mimo-v25-text-adjudicator.ts'
import { recognizeScreenshotText } from '../src/lib/screenshot/recognition-service.ts'
import type { OcrResult } from '../src/lib/screenshot/types.ts'

const emptyOcr: OcrResult = { textBlocks: [], rawText: '' }

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

test('recognition service invokes only mimo for a confident result', async () => {
  let mimoCalls = 0
  const result = await recognizeScreenshotText('base64', 'image/png', {
    mimoInvoker: async () => {
      mimoCalls += 1
      return mimoResult({
        distanceKm: [{ raw: '5.9', labelRaw: '路线距离', unitRaw: 'km', bbox: null, sourceKind: 'metric_label', visibility: 'visible', confidence: 0.96, reason: null }],
      })
    },
  })

  assert.equal(result.source, 'mimo_v25')
  assert.equal(result.parsedFields.distance?.value, 5.9)
  assert.equal(mimoCalls, 1)
})

test('recognition service retains a low-confidence mimo result without another OCR provider', async () => {
  let mimoCalls = 0
  const result = await recognizeScreenshotText('base64', 'image/png', {
    mimoInvoker: async () => {
      mimoCalls += 1
      return mimoResult({
        durationSeconds: [{ raw: '2:00:00', labelRaw: '运动时长', unitRaw: null, bbox: null, sourceKind: 'metric_label', visibility: 'visible', confidence: 0.92, reason: null }],
      })
    },
  })

  assert.equal(result.source, 'mimo_v25')
  assert.equal(mimoCalls, 1)
  assert.equal(result.parsedFields.duration?.value, 7200)
  assert.match(result.fallbackReason ?? '', /mimo_missing_required_distance/)
  assert.deepEqual(result.engineMeta?.fallbackChain, ['mimo_v25'])
})

test('recognition service propagates a mimo provider failure without another OCR provider', async () => {
  let mimoCalls = 0
  await assert.rejects(
    recognizeScreenshotText('base64', 'image/png', {
      mimoInvoker: async () => {
        mimoCalls += 1
        throw new Error('mimo upstream timeout')
      },
    }),
    /mimo upstream timeout/
  )
  assert.equal(mimoCalls, 1)
})
