import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPaidPotentialMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function paidEvent(
  feature_id: string,
  actor: string,
  current_state: 'gate_shown' | 'gate_dismissed' | 'gate_engaged',
  daysAgo: number,
  identified = true,
): AnalyticsEventRow {
  const date = new Date('2026-05-28T12:00:00.000Z')
  date.setDate(date.getDate() - daysAgo)
  return {
    user_id: identified ? actor : null,
    session_id: identified ? `session-${actor}` : actor,
    event_type: 'paid_attempt',
    event_name: `paid_attempt.${feature_id}`,
    properties: {
      feature_id,
      current_state,
    },
    server_ts: date.toISOString(),
  }
}

test('paid intent score ranks actors by engagement, frequency, diversity, and recency', () => {
  const events: AnalyticsEventRow[] = [
    ...Array.from({ length: 3 }, (_, index) => paidEvent(['high_quality_share', 'offline_map_pack', 'summit_insights'][index], 'multi-feature-user', 'gate_shown', 0)),
    ...Array.from({ length: 5 }, (_, index) => paidEvent(['high_quality_share', 'offline_map_pack', 'summit_insights'][index % 3], 'multi-feature-user', 'gate_engaged', 0)),
    ...Array.from({ length: 11 }, () => paidEvent('high_quality_share', 'single-feature-heavy', 'gate_shown', 2)),
    paidEvent('high_quality_share', 'single-feature-heavy', 'gate_engaged', 2),
    paidEvent('offline_map_pack', 'recent-session-user', 'gate_shown', 0, false),
    paidEvent('summit_insights', 'recent-session-user', 'gate_shown', 0, false),
    paidEvent('summit_insights', 'recent-session-user', 'gate_engaged', 0, false),
    paidEvent('premium_route_pack', 'shallow-user', 'gate_shown', 60),
    paidEvent('premium_route_pack', 'shallow-user', 'gate_shown', 60),
    paidEvent('premium_route_pack', 'shallow-user', 'gate_shown', 60),
  ]

  const metrics = buildPaidPotentialMetrics(events, new Date('2026-05-28T12:00:00.000Z'))

  assert.deepEqual(metrics.highIntentUsers.map((row) => row.user_id), [
    'multi-feature-user',
    'single-feature-heavy',
    'recent-session-user',
    'shallow-user',
  ])
  assert.deepEqual(metrics.highIntentUsers[0], {
    user_id: 'multi-feature-user',
    intentScore: 90,
    totalAttempts: 8,
    engagedCount: 5,
    featureDiversity: 3,
    recentAttemptAt: '2026-05-28T12:00:00.000Z',
  })
  assert.equal(metrics.highIntentUsers[1].intentScore, 56.4)
  assert.equal(metrics.highIntentUsers[2].intentScore, 42.8)
  assert.equal(metrics.highIntentUsers[3].intentScore, 17.9)
})
