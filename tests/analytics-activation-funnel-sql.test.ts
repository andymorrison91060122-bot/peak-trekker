import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAnalyticsDashboardData, buildOverviewMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

const NOW = new Date('2026-05-28T12:00:00.000Z')

function event(
  event_name: string,
  actor: string,
  options: {
    user_id?: string | null
    session_id?: string
    event_type?: AnalyticsEventRow['event_type']
    properties?: Record<string, unknown>
    page_path?: string | null
    daysAgo?: number
  } = {},
): AnalyticsEventRow {
  const date = new Date(NOW)
  date.setDate(date.getDate() - (options.daysAgo ?? 0))
  return {
    user_id: options.user_id === undefined ? actor : options.user_id,
    session_id: options.session_id ?? `session-${actor}`,
    event_type: options.event_type ?? (event_name === 'page_view' ? 'page_view' : event_name.startsWith('auth.') ? 'auth' : 'business'),
    event_name,
    properties: options.properties ?? {},
    page_path: options.page_path ?? null,
    server_ts: date.toISOString(),
  }
}

test('buildOverviewMetrics produces the 10-step actor-level activation funnel with dedupe and edge actor ids', () => {
  const events: AnalyticsEventRow[] = [
    event('page_view', 'user-a', { page_path: '/' }),
    event('page_view', 'user-a', { page_path: '/explore' }),
    event('auth.register_complete', 'user-a', { event_type: 'auth' }),
    event('business.mountain_view', 'user-a', { properties: { mountain_id: 'huashan' } }),
    event('page_view', 'user-a', { page_path: '/trek?mountainId=huashan' }),
    event('business.trek_start', 'user-a', { properties: { session_id: 'trek-a' } }),
    event('business.trek_start', 'user-a', { properties: { session_id: 'trek-a-duplicate' } }),
    event('business.trek_complete', 'user-a', { properties: { session_id: 'trek-a' } }),
    event('business.activity_create', 'user-a', { properties: { checkin_id: 'activity-a' } }),
    event('business.share_template_generate', 'user-a', { properties: { template_id: 'clean_vertical', success: true } }),
    event('page_view', 'user-b', { page_path: '/' }),
    event('auth.register_complete', 'user-b', { event_type: 'auth' }),
    event('business.mountain_view', 'user-b', { properties: { mountain_id: 'taishan' } }),
    event('business.share_template_generate', 'user-b', { properties: { template_id: 'clean_vertical', success: false } }),
    event('page_view', 'user-c', { page_path: '/trek' }),
    event('business.share_link_open', 'source-user', {
      properties: { visitor_session_id: 'visitor-session-1', share_link_id: 'link-1' },
    }),
    event('business.share_link_register_attribution', 'source-user', {
      properties: { new_user_id: 'new-user-from-link', share_link_id: 'link-1' },
    }),
  ]

  const overview = buildOverviewMetrics(events)

  assert.deepEqual(overview.funnel.map((row) => row.step), [
    '访问',
    '注册',
    '首次浏览山峰',
    '首次选山',
    '首次 Trek 启动',
    '首次 Trek 完成',
    '首次 Activity 创建',
    '首次分享生成',
    '分享 link 被点击',
    '通过 link 拉新成功',
  ])
  assert.deepEqual(overview.funnel.map((row) => row.value), [3, 2, 2, 1, 1, 1, 1, 1, 1, 1])
  assert.equal(overview.funnel[3].eventLabel, 'page_view /trek?mountainId=')
  assert.equal(overview.funnel[3].dropoffCount, 1)
  assert.equal(overview.funnel[7].value, 1, 'success=false share generation is excluded')
})

test('10-step activation funnel follows cohort filtering from buildAnalyticsDashboardData', () => {
  const fullHistory = [
    event('auth.register_complete', 'new-user', { event_type: 'auth', daysAgo: 1 }),
    event('auth.register_complete', 'returning-user', { event_type: 'auth', daysAgo: 20 }),
  ]
  const events: AnalyticsEventRow[] = [
    ...fullHistory,
    event('page_view', 'new-user', { page_path: '/', daysAgo: 0 }),
    event('business.mountain_view', 'new-user', { properties: { mountain_id: 'huashan' }, daysAgo: 0 }),
    event('page_view', 'new-user', { page_path: '/trek?mountainId=huashan', daysAgo: 0 }),
    event('business.trek_start', 'new-user', { properties: { session_id: 'new-trek' }, daysAgo: 0 }),
    event('page_view', 'returning-user', { page_path: '/', daysAgo: 0 }),
    event('business.mountain_view', 'returning-user', { properties: { mountain_id: 'wudang' }, daysAgo: 0 }),
  ]

  const newData = buildAnalyticsDashboardData(events, '30d', true, NOW, 'new', fullHistory)
  const returningData = buildAnalyticsDashboardData(events, '30d', true, NOW, 'returning', fullHistory)

  assert.deepEqual(newData.overview.funnel.slice(0, 5).map((row) => row.value), [1, 1, 1, 1, 1])
  assert.deepEqual(returningData.overview.funnel.slice(0, 5).map((row) => row.value), [1, 1, 1, 0, 0])
})
