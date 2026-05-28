import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPaidPotentialMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function paidEvent(feature_id: string, actor: string, current_state: 'gate_shown' | 'gate_dismissed' | 'gate_engaged'): AnalyticsEventRow {
  return {
    user_id: actor,
    session_id: `session-${actor}`,
    event_type: 'paid_attempt',
    event_name: `paid_attempt.${feature_id}`,
    properties: {
      feature_id,
      current_state,
    },
    server_ts: '2026-05-28T08:00:00.000Z',
  }
}

test('paid feature ranking combines attempt scale, user coverage, and engagement rate', () => {
  const events: AnalyticsEventRow[] = [
    ...Array.from({ length: 6 }, (_, index) => paidEvent('high_quality_share', `u${index + 1}`, 'gate_shown')),
    ...Array.from({ length: 3 }, (_, index) => paidEvent('high_quality_share', `u${index + 1}`, 'gate_engaged')),
    paidEvent('high_quality_share', 'u4', 'gate_dismissed'),
    paidEvent('high_quality_share', 'u5', 'gate_dismissed'),
    ...Array.from({ length: 4 }, (_, index) => paidEvent('offline_map_pack', `u${index + 7}`, 'gate_shown')),
    ...Array.from({ length: 4 }, (_, index) => paidEvent('offline_map_pack', `u${index + 7}`, 'gate_engaged')),
    ...Array.from({ length: 4 }, (_, index) => paidEvent('summit_insights', `u${index + 11}`, 'gate_shown')),
    paidEvent('summit_insights', 'u11', 'gate_engaged'),
  ]

  const metrics = buildPaidPotentialMetrics(events, new Date('2026-05-28T12:00:00.000Z'))

  assert.deepEqual(metrics.featureRanking.map((row) => row.feature_id), [
    'high_quality_share',
    'offline_map_pack',
    'summit_insights',
  ])
  assert.deepEqual(metrics.featureRanking[0], {
    feature_id: 'high_quality_share',
    attemptCount: 11,
    uniqueUserCount: 6,
    engagementRate: 0.5,
    score: 85,
  })
  assert.equal(metrics.featureRanking[1].score, 79.1)
  assert.equal(metrics.featureRanking[2].score, 45.7)
})
