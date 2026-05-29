import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAnalyticsDashboardData, partitionByCohort } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

const NOW = new Date('2026-05-28T12:00:00.000Z')

function event(
  event_name: string,
  daysAgo: number,
  user_id: string | null,
  session_id: string,
  properties: Record<string, unknown> = {},
  event_type: AnalyticsEventRow['event_type'] = 'business',
): AnalyticsEventRow {
  const date = new Date(NOW)
  date.setDate(date.getDate() - daysAgo)
  return {
    user_id,
    session_id,
    event_type,
    event_name,
    properties,
    server_ts: date.toISOString(),
  }
}

test('partitionByCohort filters all, anonymous, new, returning, boundary, and legacy actors', () => {
  const fullHistory: AnalyticsEventRow[] = [
    event('auth.register_complete', 3, 'new-user', 'session-new', {}, 'auth'),
    event('auth.register_complete', 7, 'boundary-user', 'session-boundary', {}, 'auth'),
    event('auth.register_complete', 8, 'returning-user', 'session-returning', {}, 'auth'),
    event('auth.register_complete', 35, 'old-window-user', 'session-old-window', {}, 'auth'),
  ]
  const windowEvents: AnalyticsEventRow[] = [
    event('page_view', 0, 'new-user', 'session-new', {}, 'page_view'),
    event('page_view', 0, 'boundary-user', 'session-boundary', {}, 'page_view'),
    event('page_view', 0, 'returning-user', 'session-returning', {}, 'page_view'),
    event('page_view', 0, 'old-window-user', 'session-old-window', {}, 'page_view'),
    event('page_view', 0, 'legacy-user', 'session-legacy', {}, 'page_view'),
    event('page_view', 0, null, 'anonymous-session', {}, 'page_view'),
  ]

  assert.equal(partitionByCohort(windowEvents, 'all', fullHistory, NOW).length, 6)
  assert.deepEqual(partitionByCohort(windowEvents, 'anonymous', fullHistory, NOW).map((row) => row.session_id), ['anonymous-session'])
  assert.deepEqual(partitionByCohort(windowEvents, 'new', fullHistory, NOW).map((row) => row.user_id), ['new-user', 'boundary-user'])
  assert.deepEqual(partitionByCohort(windowEvents, 'returning', fullHistory, NOW).map((row) => row.user_id), [
    'returning-user',
    'old-window-user',
    'legacy-user',
  ])
})

test('buildAnalyticsDashboardData applies cohort filter before all dashboard metrics and deltas', () => {
  const fullHistory: AnalyticsEventRow[] = [
    event('auth.register_complete', 1, 'new-user', 'session-new', {}, 'auth'),
    event('auth.register_complete', 20, 'returning-user', 'session-returning', {}, 'auth'),
  ]
  const events: AnalyticsEventRow[] = [
    ...fullHistory,
    event('page_view', 0, 'new-user', 'session-new', {}, 'page_view'),
    event('business.trek_start', 0, 'new-user', 'session-new', { session_id: 'new-trek' }),
    event('paid_attempt.high_quality_share', 0, 'new-user', 'session-new', { feature_id: 'high_quality_share', current_state: 'gate_shown' }, 'paid_attempt'),
    event('page_view', 0, 'returning-user', 'session-returning', {}, 'page_view'),
    event('paid_attempt.premium_route_pack', 0, 'returning-user', 'session-returning', { feature_id: 'premium_route_pack', current_state: 'gate_engaged' }, 'paid_attempt'),
    event('page_view', 0, null, 'anonymous-session', {}, 'page_view'),
    event('paid_attempt.anonymous_gate', 0, null, 'anonymous-session', { feature_id: 'anonymous_gate', current_state: 'gate_shown' }, 'paid_attempt'),
  ]

  const newData = buildAnalyticsDashboardData(events, '30d', true, NOW, 'new', fullHistory)
  assert.equal(newData.cohortKey, 'new')
  assert.equal(newData.cohortActorCount, 1)
  assert.equal(newData.overview.totalEvents, 4)
  assert.equal(newData.overview.funnel.find((row) => row.step === '首次 Trek 启动')?.value, 1)
  assert.deepEqual(newData.paidPotential.featureRanking.map((row) => row.feature_id), ['high_quality_share'])

  const returningData = buildAnalyticsDashboardData(events, '30d', true, NOW, 'returning', fullHistory)
  assert.equal(returningData.cohortActorCount, 1)
  assert.deepEqual(returningData.paidPotential.featureRanking.map((row) => row.feature_id), ['premium_route_pack'])

  const anonymousData = buildAnalyticsDashboardData(events, '30d', true, NOW, 'anonymous', fullHistory)
  assert.equal(anonymousData.cohortActorCount, 1)
  assert.equal(anonymousData.overview.totalUsers, 0)
  assert.deepEqual(anonymousData.paidPotential.featureRanking.map((row) => row.feature_id), ['anonymous_gate'])
})
