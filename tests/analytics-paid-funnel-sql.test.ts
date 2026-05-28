import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPaidPotentialMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function event(current_state: 'gate_shown' | 'gate_dismissed' | 'gate_engaged'): AnalyticsEventRow {
  return {
    session_id: `session-${current_state}-${Math.random()}`,
    event_type: 'paid_attempt',
    event_name: 'paid_attempt.high_quality_share',
    properties: {
      feature_id: 'high_quality_share',
      current_state,
    },
    server_ts: '2026-05-28T08:00:00.000Z',
  }
}

test('paid attempt funnel derives shown, dismissed, engaged, and rates per feature', () => {
  const metrics = buildPaidPotentialMetrics([
    event('gate_shown'),
    event('gate_shown'),
    event('gate_shown'),
    event('gate_dismissed'),
    event('gate_engaged'),
  ])

  assert.equal(metrics.totalAttempts, 5)
  assert.deepEqual(metrics.perFeatureFunnel[0], {
    feature_id: 'high_quality_share',
    shown: 3,
    dismissed: 1,
    engaged: 1,
    dismissRate: 0.3333,
    engagementRate: 0.3333,
    conversionRate: 0.3333,
  })
})
