import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAnalyticsDashboardData } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function event(event_name: string, daysAgo: number, properties: Record<string, unknown> = {}, event_type: AnalyticsEventRow['event_type'] = 'business'): AnalyticsEventRow {
  const date = new Date('2026-05-28T12:00:00.000Z')
  date.setDate(date.getDate() - daysAgo)
  return {
    session_id: `session-${daysAgo}-${event_name}-${Math.random()}`,
    user_id: `user-${daysAgo}`,
    event_type,
    event_name,
    properties,
    server_ts: date.toISOString(),
  }
}

test('dashboard ranges support today, all-time, funnel penetration, DAU cohort, and previous-window delta', () => {
  const now = new Date('2026-05-28T12:00:00.000Z')
  const today = buildAnalyticsDashboardData([
    event('page_view', 0, {}, 'page_view'),
    event('page_view', 0, {}, 'page_view'),
    event('auth.register_complete', 0, {}, 'auth'),
    event('business.trek_start', 0, { session_id: 'trek-today' }),
    event('business.share_link_create', 0, { source_user_id: 'source-today', template_id: 'clean_vertical' }),
    event('page_view', 1, {}, 'page_view'),
  ], 'today', true, now)

  assert.equal(today.rangeKey, 'today')
  assert.equal(today.overview.totalEvents, 5)
  assert.equal(today.overview.funnel[1].conversionRate, 1)
  assert.equal(today.overview.dauCohort.activeUsers, 1)
  assert.equal(today.overview.dauCohort.trekRate, 1)
  assert.equal(today.deltas.totalEvents.previous, 1)
  assert.equal(today.deltas.totalEvents.deltaPct, 4)

  const allTime = buildAnalyticsDashboardData([
    event('page_view', 0, {}, 'page_view'),
    event('page_view', 200, {}, 'page_view'),
  ], 'all_time', true, now)

  assert.equal(allTime.rangeKey, 'all_time')
  assert.equal(allTime.overview.totalEvents, 2)
  assert.equal(allTime.deltas.totalEvents.previous, null)
  assert.equal(allTime.deltas.totalEvents.deltaPct, null)
})
