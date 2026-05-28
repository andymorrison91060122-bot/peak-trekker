import assert from 'node:assert/strict'
import test from 'node:test'
import { buildModelEvaluationMetrics, buildOperationalCostMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function event(event_name: string, properties: Record<string, unknown>, server_ts = '2026-05-28T08:00:00.000Z'): AnalyticsEventRow {
  return {
    session_id: `session-${event_name}-${Math.random()}`,
    event_type: 'business',
    event_name,
    properties,
    server_ts,
  }
}

test('model evaluation KPI derives success, hallucination heuristic, latency, cost, and field heatmap', () => {
  const metrics = buildModelEvaluationMetrics([
    event('business.screenshot_recognize_complete', {
      provider: 'tencent_ocr',
      success: true,
      duration_ms: 1000,
      cost_cny: 0.01,
    }),
    event('business.screenshot_recognize_complete', {
      provider: 'tencent_ocr',
      success: true,
      duration_ms: 2000,
      cost_cny: 0.02,
    }),
    event('business.screenshot_recognize_complete', {
      provider: 'xiaomi_v2_omni',
      success: false,
      duration_ms: 5000,
      cost_cny: 0.06,
    }),
    event('business.screenshot_recognize_user_edit', { field_edited: 'distance' }),
    event('business.screenshot_recognize_user_edit', { field_edited: 'distance' }),
  ])

  assert.equal(metrics.totalRecognitions, 3)
  assert.equal(metrics.successRate, 0.6667)
  assert.equal(metrics.hallucinationRate, 0.6667)
  assert.equal(metrics.correctionRate, 0.6667)
  assert.equal(metrics.latencyP50, 2000)
  assert.equal(metrics.latencyP90, 5000)
  assert.equal(metrics.costPerCall, 0.03)
  assert.deepEqual(metrics.fieldHeatmap[0], { field: 'distance', edits: 2 })
  assert.equal(metrics.providerComparison.length, 2)
})

test('operational cost KPI sums screenshot recognition cost in the selected event set', () => {
  const metrics = buildOperationalCostMetrics([
    event('business.screenshot_recognize_complete', {
      provider: 'tencent_ocr',
      success: true,
      duration_ms: 1000,
      cost_cny: 0.12,
    }),
    event('business.screenshot_recognize_complete', {
      provider: 'xiaomi_v2_omni',
      success: true,
      duration_ms: 1800,
      cost_cny: 0.08,
    }),
  ])

  assert.equal(metrics.screenshotCalls, 2)
  assert.equal(metrics.totalCostCny, 0.2)
})
