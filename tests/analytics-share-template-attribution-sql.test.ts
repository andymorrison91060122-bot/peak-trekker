import assert from 'node:assert/strict'
import test from 'node:test'
import { buildShareTemplateMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

function event(event_name: string, properties: Record<string, unknown>, session_id = 'session-a'): AnalyticsEventRow {
  return {
    session_id,
    event_type: 'business',
    event_name,
    properties,
    server_ts: '2026-05-28T08:00:00.000Z',
  }
}

test('share template attribution derives select to generate funnel and link to register conversions', () => {
  const metrics = buildShareTemplateMetrics([
    event('business.share_template_select', { template_id: 'clean_vertical' }),
    event('business.share_template_generate', { template_id: 'clean_vertical', success: true }),
    event('business.share_template_download', { template_id: 'clean_vertical' }),
    event('business.share_link_create', { template_id: 'clean_vertical', share_link_id: 'link-1', source_user_id: 'source-1' }),
    event('business.share_link_open', { template_id: 'clean_vertical', share_link_id: 'link-1', source_user_id: 'source-1' }, 'visitor-1'),
    event('business.share_link_register_attribution', {
      template_id: 'clean_vertical',
      share_link_id: 'link-1',
      source_user_id: 'source-1',
      new_user_id: 'new-user-1',
    }, 'visitor-1'),
  ])

  assert.deepEqual(metrics.funnel[0], {
    template_id: 'clean_vertical',
    selected: 1,
    generated: 1,
    downloaded: 1,
    selectToGenerateRate: 1,
    generateToDownloadRate: 1,
  })
  assert.deepEqual(metrics.ctr[0], {
    template_id: 'clean_vertical',
    creates: 1,
    opens: 1,
    ctr: 1,
  })
  assert.deepEqual(metrics.attribution[0], {
    template_id: 'clean_vertical',
    source_user_id: 'source-1',
    conversions: 1,
  })
  assert.deepEqual(metrics.templateUsage[0], {
    label: 'clean_vertical',
    value: 6,
    share: 1,
  })
  assert.deepEqual(metrics.reuseDistribution[0], {
    label: '2-3 sessions',
    value: 1,
  })
})
