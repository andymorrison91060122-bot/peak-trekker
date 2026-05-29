import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUserBehaviorMetrics } from '../src/lib/analytics/kpis.ts'
import type { AnalyticsEventRow } from '../src/lib/analytics/types.ts'

const NOW = new Date('2026-05-28T12:00:00.000Z')

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function event(
  event_name: string,
  actor: string,
  options: {
    user_id?: string | null
    session_id?: string
    referrer?: string | null
    user_agent?: string | null
    properties?: Record<string, unknown>
    daysAgo?: number
  } = {},
): AnalyticsEventRow {
  const date = new Date(NOW)
  date.setDate(date.getDate() - (options.daysAgo ?? 0))
  return {
    user_id: options.user_id === undefined ? actor : options.user_id,
    session_id: options.session_id ?? `session-${actor}`,
    event_type: event_name === 'page_view' ? 'page_view' : 'business',
    event_name,
    properties: options.properties ?? {},
    referrer: options.referrer ?? null,
    user_agent: options.user_agent ?? null,
    server_ts: date.toISOString(),
  }
}

test('source metrics classify referrers and compute visible-history retention', () => {
  const events: AnalyticsEventRow[] = [
    event('page_view', 'direct-d1', { daysAgo: 8 }),
    event('page_view', 'direct-d1', { daysAgo: 7 }),
    event('page_view', 'direct-d30', { daysAgo: 31 }),
    event('page_view', 'direct-d30', { daysAgo: 1 }),
    event('page_view', 'wechat-user', { referrer: 'https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage' }),
    event('page_view', 'moments-user', { referrer: 'https://servicewechat.com/wxa-demo/pages/share' }),
    event('page_view', 'baidu-user', { referrer: 'https://baidu.com/s?wd=peak' }),
    event('page_view', 'google-user', { referrer: 'https://www.google.com/search?q=peak' }),
    event('page_view', 'other-user', { referrer: 'https://example.com/outdoor' }),
    event('page_view', 'same-site-user', { referrer: 'https://peak-trekker.vercel.app/explore' }),
  ]

  const metrics = buildUserBehaviorMetrics(events)
  const bySource = new Map(metrics.sourceMetrics.map((row) => [row.source, row]))

  assert.equal(bySource.get('直接')?.actorCount, 3)
  assert.equal(bySource.get('直接')?.d1RetentionRate, 0.3333)
  assert.equal(bySource.get('直接')?.d30RetentionRate, 0.3333)
  assert.equal(bySource.get('微信')?.actorCount, 1)
  assert.equal(bySource.get('朋友圈')?.actorCount, 1)
  assert.equal(bySource.get('百度')?.actorCount, 1)
  assert.equal(bySource.get('Google')?.actorCount, 1)
  assert.equal(bySource.get('其他')?.actorCount, 1)
})

test('device metrics classify user agents and compute actor-level Trek completion rate', () => {
  const events: AnalyticsEventRow[] = [
    event('page_view', 'ios-user', { user_agent: UA_IOS }),
    event('business.trek_start', 'ios-user', { user_agent: UA_IOS, properties: { session_id: 'ios-trek' } }),
    event('business.trek_complete', 'ios-user', { user_agent: UA_IOS, properties: { session_id: 'ios-trek' } }),
    event('page_view', 'android-user', { user_agent: UA_ANDROID }),
    event('business.trek_start', 'android-user', { user_agent: UA_ANDROID, properties: { session_id: 'android-trek' } }),
    event('page_view', 'desktop-user', { user_agent: UA_DESKTOP }),
    event('page_view', 'unknown-user', { user_agent: 'unknown-fu60-demo-agent' }),
    event('page_view', 'null-user', { user_agent: null }),
  ]

  const metrics = buildUserBehaviorMetrics(events)
  const byDevice = new Map(metrics.deviceMetrics.map((row) => [row.device, row]))

  assert.equal(byDevice.get('iOS')?.actorCount, 1)
  assert.equal(byDevice.get('iOS')?.trekStartActors, 1)
  assert.equal(byDevice.get('iOS')?.trekCompleteActors, 1)
  assert.equal(byDevice.get('iOS')?.trekCompletionRate, 1)
  assert.equal(byDevice.get('Android')?.actorCount, 1)
  assert.equal(byDevice.get('Android')?.trekCompletionRate, 0)
  assert.equal(byDevice.get('Desktop')?.actorCount, 1)
  assert.equal(byDevice.get('Other')?.actorCount, 2)
})
