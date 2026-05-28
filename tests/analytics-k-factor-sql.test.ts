import assert from 'node:assert/strict'
import test from 'node:test'
import { buildKFactorMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function event(event_name: string, properties: Record<string, unknown>, daysAgo = 0): AnalyticsEventRow {
  const date = new Date('2026-05-28T08:00:00.000Z')
  date.setDate(date.getDate() - daysAgo)
  return {
    session_id: `session-${event_name}-${Math.random()}`,
    event_type: 'business',
    event_name,
    properties,
    server_ts: date.toISOString(),
  }
}

test('k-factor derives attributed registrations per unique sharing source user', () => {
  const metrics = buildKFactorMetrics([
    event('business.share_link_create', { template_id: 'clean_vertical', share_link_id: 'l1', source_user_id: 'u1' }),
    event('business.share_link_create', { template_id: 'clean_vertical', share_link_id: 'l2', source_user_id: 'u2' }),
    event('business.share_link_create', { template_id: 'clean_vertical', share_link_id: 'l3', source_user_id: 'u3' }),
    event('business.share_link_register_attribution', { template_id: 'clean_vertical', share_link_id: 'l1', source_user_id: 'u1', new_user_id: 'n1' }),
    event('business.share_link_register_attribution', { template_id: 'clean_vertical', share_link_id: 'l2', source_user_id: 'u2', new_user_id: 'n2' }),
  ])

  assert.equal(metrics.sourceUsers, 3)
  assert.equal(metrics.attributedRegisters, 2)
  assert.equal(metrics.value, 0.6667)
  assert.equal(metrics.series.length, 1)
  assert.equal(metrics.series[0].value, 0.6667)
})
