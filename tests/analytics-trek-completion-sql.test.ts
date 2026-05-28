import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTrekCompletionMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function event(event_name: string, session_id: string, properties: Record<string, unknown> = {}): AnalyticsEventRow {
  return {
    session_id,
    event_type: 'business',
    event_name,
    properties: { session_id, ...properties },
    server_ts: '2026-05-28T08:00:00.000Z',
  }
}

test('trek completion KPI derives completion rate, near-miss rate, interruption altitude, and timeout buckets', () => {
  const metrics = buildTrekCompletionMetrics([
    event('business.trek_start', 's1'),
    event('business.trek_start', 's2'),
    event('business.trek_start', 's3'),
    event('business.trek_complete', 's1', { duration_seconds: 3600 }),
    event('business.trek_summit_proximity_enter', 's1'),
    event('business.trek_summit_proximity_enter', 's2'),
    event('business.trek_abort', 's3', { altitude_progress: 0.62 }),
    event('business.trek_timeout', 's4', { altitude_progress: 0.2, hours_idle: 8 }),
    event('business.trek_timeout', 's5', { altitude_progress: 0.81, hours_idle: 32 }),
  ])

  assert.equal(metrics.starts, 3)
  assert.equal(metrics.completes, 1)
  assert.equal(metrics.completionRate, 0.3333)
  assert.equal(metrics.nearMissRate, 0.5)
  assert.equal(metrics.averageDurationSeconds, 3600)
  assert.deepEqual(metrics.interruptionHistogram, [
    { label: '0-25%', value: 1 },
    { label: '25-50%', value: 0 },
    { label: '50-75%', value: 1 },
    { label: '75-100%', value: 1 },
  ])
  assert.deepEqual(metrics.timeoutDistribution, [
    { label: '6-24h', value: 1 },
    { label: '24h+', value: 1 },
  ])
})
