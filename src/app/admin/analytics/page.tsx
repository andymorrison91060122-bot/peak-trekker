import AdminAnalyticsClient from './AdminAnalyticsClient'
import { ANALYTICS_COHORT_OPTIONS } from '@/lib/analytics/constants'
import { ANALYTICS_RANGE_OPTIONS, buildAnalyticsDashboardData, normalizeAnalyticsCohortKey, normalizeAnalyticsRangeKey } from '@/lib/analytics/kpis'
import type { AnalyticsCohortKey, AnalyticsEventRow, AnalyticsRangeKey } from '@/lib/analytics/types'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type AdminAnalyticsPageProps = {
  searchParams?: Promise<{ range?: string; cohort?: string; fu55Demo?: string }>
}

const demoReferrers = [
  null,
  'https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage',
  'https://servicewechat.com/wxa-demo/pages/share',
  'https://www.google.com/search?q=peak+trekker',
  'https://baidu.com/s?wd=登山记录',
  'https://example.com/outdoor-list',
  'https://peak-trekker.vercel.app/explore',
]

const demoUserAgents = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'unknown-fu60-demo-agent',
]

function demoEvent(
  index: number,
  event_name: string,
  properties: Record<string, unknown> = {},
  event_type: AnalyticsEventRow['event_type'] = 'business',
  daysAgo = index % 14,
  overrides: Partial<AnalyticsEventRow> = {},
): AnalyticsEventRow {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return {
    id: `fu55-demo-${index}`,
    user_id: index % 3 === 0 ? `demo-user-${index % 5}` : null,
    session_id: `demo-session-${index % 8}`,
    event_type,
    event_name,
    properties,
    page_path: '/admin/analytics?fu55Demo=1',
    referrer: demoReferrers[index % demoReferrers.length],
    user_agent: demoUserAgents[index % demoUserAgents.length],
    client_ts: date.toISOString(),
    server_ts: date.toISOString(),
    ...overrides,
  }
}

function buildDemoEvents(): AnalyticsEventRow[] {
  const events: AnalyticsEventRow[] = []
  const addPaidDemoEvent = (
    index: number,
    featureId: string,
    currentState: 'gate_shown' | 'gate_dismissed' | 'gate_engaged',
    actorId: string,
    daysAgo: number,
    identified = true,
  ) => {
    const row = demoEvent(index, `paid_attempt.${featureId}`, {
      feature_id: featureId,
      current_state: currentState,
    }, 'paid_attempt', daysAgo)
    row.user_id = identified ? actorId : null
    row.session_id = identified ? `session-${actorId}` : actorId
    events.push(row)
  }
  const addIdentifiedEvent = (
    index: number,
    userId: string,
    event_name: string,
    properties: Record<string, unknown> = {},
    event_type: AnalyticsEventRow['event_type'] = 'business',
    daysAgo = 0,
    overrides: Partial<AnalyticsEventRow> = {},
  ) => {
    const row = demoEvent(index, event_name, properties, event_type, daysAgo, overrides)
    row.user_id = userId
    row.session_id = `session-${userId}`
    events.push(row)
  }
  for (let index = 0; index < 28; index += 1) {
    events.push(demoEvent(index, 'page_view', {}, 'page_view', index % 14))
  }
  for (let index = 0; index < 10; index += 1) {
    const userId = `demo-new-user-${index + 1}`
    const registerDaysAgo = index % 6
    const activityDaysAgo = index % 5
    addIdentifiedEvent(800 + index * 10, userId, 'auth.register_complete', { cohort: 'new' }, 'auth', registerDaysAgo)
    addIdentifiedEvent(801 + index * 10, userId, 'page_view', { cohort: 'new' }, 'page_view', activityDaysAgo)
    addIdentifiedEvent(802 + index * 10, userId, 'business.mountain_view', { mountain_id: index % 2 === 0 ? 'huashan' : 'taishan' }, 'business', activityDaysAgo)
    if (index < 8) addIdentifiedEvent(803 + index * 10, userId, 'page_view', { cohort: 'new', selected_mountain_id: 'huashan' }, 'page_view', activityDaysAgo, {
      page_path: `/trek?mountainId=${index % 2 === 0 ? 'huashan' : 'taishan'}`,
    })
    if (index < 7) addIdentifiedEvent(804 + index * 10, userId, 'business.trek_start', { session_id: `new-trek-${index}`, mountain_id: 'huashan' }, 'business', activityDaysAgo, {
      user_agent: demoUserAgents[index % demoUserAgents.length],
    })
    if (index < 4) addIdentifiedEvent(805 + index * 10, userId, 'business.trek_complete', { session_id: `new-trek-${index}`, mountain_id: 'huashan', duration_seconds: 6900 + index * 180 }, 'business', activityDaysAgo, {
      user_agent: demoUserAgents[index % demoUserAgents.length],
    })
    if (index < 4) addIdentifiedEvent(806 + index * 10, userId, 'business.activity_create', { proof_status: 'verified', source: 'realtime_gps', mountain_id: 'huashan' }, 'business', activityDaysAgo)
    if (index < 3) addIdentifiedEvent(807 + index * 10, userId, 'business.share_template_generate', { template_id: 'clean_vertical', success: true }, 'business', activityDaysAgo)
    if (index < 3) addIdentifiedEvent(808 + index * 10, userId, 'paid_attempt.high_quality_share', { feature_id: 'high_quality_share', current_state: index === 0 ? 'gate_engaged' : 'gate_shown' }, 'paid_attempt', activityDaysAgo)
  }
  for (let index = 0; index < 10; index += 1) {
    const userId = `demo-returning-user-${index + 1}`
    const registerDaysAgo = 15 + index
    const activityDaysAgo = index % 8
    addIdentifiedEvent(950 + index * 10, userId, 'auth.register_complete', { cohort: 'returning' }, 'auth', registerDaysAgo)
    addIdentifiedEvent(951 + index * 10, userId, 'page_view', { cohort: 'returning' }, 'page_view', activityDaysAgo)
    addIdentifiedEvent(952 + index * 10, userId, 'business.mountain_view', { mountain_id: index % 2 === 0 ? 'huashan' : 'wudang' }, 'business', activityDaysAgo)
    if (index < 9) addIdentifiedEvent(953 + index * 10, userId, 'page_view', { cohort: 'returning', selected_mountain_id: 'wudang' }, 'page_view', activityDaysAgo, {
      page_path: `/trek?mountainId=${index % 2 === 0 ? 'huashan' : 'wudang'}`,
    })
    if (index < 8) addIdentifiedEvent(954 + index * 10, userId, 'business.trek_start', { session_id: `returning-trek-${index}`, mountain_id: 'wudang' }, 'business', activityDaysAgo, {
      user_agent: demoUserAgents[(index + 1) % demoUserAgents.length],
    })
    if (index < 6) addIdentifiedEvent(955 + index * 10, userId, 'business.trek_complete', { session_id: `returning-trek-${index}`, mountain_id: 'wudang', duration_seconds: 8400 + index * 240 }, 'business', activityDaysAgo, {
      user_agent: demoUserAgents[(index + 1) % demoUserAgents.length],
    })
    if (index < 6) addIdentifiedEvent(956 + index * 10, userId, 'business.activity_create', { proof_status: 'verified', source: 'realtime_gps', mountain_id: 'wudang' }, 'business', activityDaysAgo)
    if (index < 8) addIdentifiedEvent(957 + index * 10, userId, 'paid_attempt.premium_route_pack', { feature_id: 'premium_route_pack', current_state: index < 3 ? 'gate_engaged' : index < 5 ? 'gate_dismissed' : 'gate_shown' }, 'paid_attempt', activityDaysAgo)
    if (index < 4) addIdentifiedEvent(958 + index * 10, userId, 'business.screenshot_recognize_complete', { provider: 'xiaomi_v2_omni', success: true, duration_ms: 1500 + index * 120, cost_cny: 0 }, 'business', activityDaysAgo)
  }
  for (let index = 0; index < 8; index += 1) {
    const row = demoEvent(1100 + index, index < 4 ? 'business.share_link_open' : 'paid_attempt.anonymous_gate', {
      template_id: 'watermark_minimal',
      feature_id: 'anonymous_trial',
      current_state: index < 6 ? 'gate_shown' : 'gate_dismissed',
    }, index < 4 ? 'business' : 'paid_attempt', index % 5)
    row.user_id = null
    row.session_id = `anon-cohort-session-${index + 1}`
    events.push(row)
  }
  const templates = ['clean_vertical', 'summit_story', 'strava_simple', 'watermark_minimal']
  templates.forEach((templateId, index) => {
    const base = 100 + index * 20
    const source = `demo-source-${index + 1}`
    events.push(
      demoEvent(base, 'business.share_template_select', { template_id: templateId }, 'business', index),
      demoEvent(base + 1, 'business.share_template_select', { template_id: templateId }, 'business', index + 1),
      demoEvent(base + 2, 'business.share_template_generate', { template_id: templateId, success: true, generate_duration_ms: 600 + index * 80 }, 'business', index),
      demoEvent(base + 3, 'business.share_template_download', { template_id: templateId }, 'business', index),
      demoEvent(base + 4, 'business.share_link_create', { template_id: templateId, share_link_id: `demo-link-${index + 1}`, source_user_id: source }, 'business', index),
      demoEvent(base + 5, 'business.share_link_open', { template_id: templateId, share_link_id: `demo-link-${index + 1}`, source_user_id: source }, 'business', index),
    )
    if (index < 2) {
      events.push(demoEvent(base + 6, 'business.share_link_register_attribution', {
        template_id: templateId,
        share_link_id: `demo-link-${index + 1}`,
        source_user_id: source,
        new_user_id: `demo-new-${index + 1}`,
      }, 'business', index))
    }
  })
  for (let index = 0; index < 8; index += 1) {
    const templateId = templates[index % templates.length]
    const source = `demo-extra-source-${index + 1}`
    events.push(demoEvent(210 + index, 'business.share_link_create', {
      template_id: templateId,
      share_link_id: `demo-extra-link-${index + 1}`,
      source_user_id: source,
    }, 'business', index % 6))
    if (index < 3) {
      events.push(demoEvent(230 + index, 'business.share_link_register_attribution', {
        template_id: templateId,
        share_link_id: `demo-extra-link-${index + 1}`,
        source_user_id: source,
        new_user_id: `demo-extra-new-${index + 1}`,
      }, 'business', index % 6))
    }
  }
  for (let index = 0; index < 100; index += 1) {
    events.push(demoEvent(300 + index, 'paid_attempt.high_quality_share', {
      feature_id: 'high_quality_share',
      current_state: 'gate_shown',
    }, 'paid_attempt', index % 10))
  }
  for (let index = 0; index < 30; index += 1) {
    events.push(demoEvent(420 + index, 'paid_attempt.high_quality_share', {
      feature_id: 'high_quality_share',
      current_state: 'gate_dismissed',
    }, 'paid_attempt', index % 10))
  }
  for (let index = 0; index < 10; index += 1) {
    events.push(demoEvent(470 + index, 'paid_attempt.high_quality_share', {
      feature_id: 'high_quality_share',
      current_state: 'gate_engaged',
    }, 'paid_attempt', index % 10))
  }
  for (let index = 0; index < 40; index += 1) {
    events.push(demoEvent(500 + index, 'paid_attempt.screenshot_quota_exceeded', {
      feature_id: 'screenshot_recognition',
      current_state: 'gate_shown',
    }, 'paid_attempt', index % 9))
  }
  for (let index = 0; index < 12; index += 1) {
    events.push(demoEvent(550 + index, 'paid_attempt.screenshot_quota_exceeded', {
      feature_id: 'screenshot_recognition',
      current_state: 'gate_dismissed',
    }, 'paid_attempt', index % 9))
  }
  for (let index = 0; index < 4; index += 1) {
    events.push(demoEvent(580 + index, 'paid_attempt.screenshot_quota_exceeded', {
      feature_id: 'screenshot_recognition',
      current_state: 'gate_engaged',
    }, 'paid_attempt', index % 9))
  }
  for (let index = 0; index < 50; index += 1) {
    addPaidDemoEvent(610 + index, 'premium_route_pack', index < 5 ? 'gate_engaged' : index < 12 ? 'gate_dismissed' : 'gate_shown', 'demo-heavy-route-user', index % 11)
  }
  for (let index = 0; index < 20; index += 1) {
    const featureId = ['premium_route_pack', 'offline_map_pack', 'summit_insights'][index % 3]
    addPaidDemoEvent(680 + index, featureId, index < 10 ? 'gate_engaged' : 'gate_shown', 'demo-multi-feature-explorer', index % 6)
  }
  for (let index = 0; index < 3; index += 1) {
    addPaidDemoEvent(730 + index, 'offline_map_pack', 'gate_shown', 'demo-shallow-tester', 24 + index)
  }
  for (let index = 0; index < 3; index += 1) {
    addPaidDemoEvent(740 + index, 'summit_insights', index === 2 ? 'gate_engaged' : 'gate_shown', 'demo-recent-session-user', 0, false)
  }
  events.push(
    demoEvent(20, 'auth.register_complete', {}, 'auth', 0),
    demoEvent(21, 'auth.register_complete', {}, 'auth', 8),
    demoEvent(2099, 'page_view', {}, 'page_view', 0, { user_id: 'demo-funnel-register', session_id: 'session-demo-funnel-register' }),
    demoEvent(2100, 'auth.register_complete', {}, 'auth', 0, { user_id: 'demo-funnel-register', session_id: 'session-demo-funnel-register' }),
    demoEvent(22, 'business.mountain_view', { mountain_id: 'huashan', mountain_name: '华山' }, 'business', 0),
    demoEvent(23, 'business.mountain_view', { mountain_id: 'taishan', mountain_name: '泰山' }, 'business', 1),
    demoEvent(24, 'business.mountain_view', { mountain_id: 'huashan', mountain_name: '华山' }, 'business', 2),
    demoEvent(25, 'business.activity_create', { proof_status: 'verified', source: 'realtime_gps' }, 'business', 0),
    demoEvent(26, 'business.activity_create', { proof_status: 'uploaded', source: 'screenshot' }, 'business', 1),
    demoEvent(27, 'business.community_post_create', { post_id: 'demo-post-1' }, 'business', 0),
    demoEvent(28, 'business.community_post_view', { post_id: 'demo-post-1' }, 'business', 1),
    demoEvent(34, 'business.trek_start', { session_id: 'demo-trek-1', mountain_id: 'huashan' }, 'business', 0),
    demoEvent(35, 'business.trek_start', { session_id: 'demo-trek-2', mountain_id: 'taishan' }, 'business', 1),
    demoEvent(36, 'business.trek_complete', { session_id: 'demo-trek-1', mountain_id: 'huashan', duration_seconds: 7440 }, 'business', 0),
    demoEvent(2101, 'business.trek_complete', { session_id: 'demo-funnel-complete', mountain_id: 'huashan', duration_seconds: 7800 }, 'business', 0, { user_id: 'demo-funnel-complete', session_id: 'session-demo-funnel-complete' }),
    demoEvent(2102, 'business.share_template_generate', { template_id: 'clean_vertical', success: true }, 'business', 0, { user_id: 'demo-funnel-share', session_id: 'session-demo-funnel-share' }),
    demoEvent(37, 'business.trek_summit_proximity_enter', { session_id: 'demo-trek-1', mountain_id: 'huashan' }, 'business', 0),
    demoEvent(38, 'business.trek_summit_proximity_enter', { session_id: 'demo-trek-2', mountain_id: 'taishan' }, 'business', 1),
    demoEvent(39, 'business.trek_abort', { session_id: 'demo-trek-2', altitude_progress: 0.68, duration_seconds: 3600 }, 'business', 1),
    demoEvent(40, 'business.trek_timeout', { session_id: 'demo-trek-3', altitude_progress: 0.32, hours_idle: 9 }, 'business', 3),
    demoEvent(401, 'business.trek_timeout', { session_id: 'demo-trek-4', altitude_progress: 0.18, hours_idle: 5.2 }, 'business', 2),
    demoEvent(402, 'business.trek_timeout', { session_id: 'demo-trek-5', altitude_progress: 0.44, hours_idle: 12 }, 'business', 2),
    demoEvent(403, 'business.trek_timeout', { session_id: 'demo-trek-6', altitude_progress: 0.71, hours_idle: 28 }, 'business', 4),
    demoEvent(404, 'business.trek_timeout', { session_id: 'demo-trek-7', altitude_progress: 0.58, hours_idle: 31 }, 'business', 5),
    demoEvent(41, 'business.screenshot_recognize_complete', { provider: 'tencent_ocr', success: true, duration_ms: 1200, cost_cny: 0, fields_recognized: ['distance', 'duration'] }, 'business', 0),
    demoEvent(42, 'business.screenshot_recognize_complete', { provider: 'xiaomi_v2_omni', success: true, duration_ms: 1850, cost_cny: 0, fields_recognized: ['distance', 'duration', 'elevation'] }, 'business', 1),
    demoEvent(43, 'business.screenshot_recognize_user_edit', { provider: 'xiaomi_v2_omni', field_edited: 'elevation' }, 'business', 1),
    demoEvent(44, 'business.screenshot_recognize_complete', { provider: 'tencent_ocr', success: false, duration_ms: 2600, cost_cny: 0, fields_recognized: ['distance'] }, 'business', 8),
  )
  return events
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const params = await searchParams
  const rangeKey: AnalyticsRangeKey = normalizeAnalyticsRangeKey(params?.range)
  const cohortKey: AnalyticsCohortKey = normalizeAnalyticsCohortKey(params?.cohort)
  const demoMode = process.env.NODE_ENV !== 'production' && params?.fu55Demo === '1'
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('events')
    .select('id,user_id,session_id,event_type,event_name,properties,page_path,referrer,user_agent,client_ts,server_ts')
    .order('server_ts', { ascending: false })
    .limit(5000)
  const { data: registrationHistory, error: registrationError } = await supabase
    .from('events')
    .select('id,user_id,session_id,event_type,event_name,properties,page_path,referrer,user_agent,client_ts,server_ts')
    .eq('event_name', 'auth.register_complete')
    .order('server_ts', { ascending: true })
    .limit(10000)

  const schemaReady = (!error && !registrationError) || demoMode
  if (error || registrationError) {
    console.warn('[admin analytics] events read skipped', {
      code: error?.code ?? registrationError?.code,
      message: error?.message ?? registrationError?.message,
    })
  }

  const demoEvents = demoMode ? buildDemoEvents() : null
  const events = demoEvents ?? (data ?? []) as AnalyticsEventRow[]
  const fullHistory = demoEvents ?? ([...((data ?? []) as AnalyticsEventRow[]), ...((registrationHistory ?? []) as AnalyticsEventRow[])])
  const dashboardData = buildAnalyticsDashboardData(events, rangeKey, schemaReady, new Date(), cohortKey, fullHistory)

  return (
    <div data-testid="admin-analytics-page">
      <div style={{ marginBottom: 22 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          {'// ANALYTICS'}
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          自托管事件分析 · {dashboardData.rangeLabel}窗口 · {dashboardData.cohortLabel} · {new Date(dashboardData.generatedAt).toLocaleString('zh-CN')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {ANALYTICS_RANGE_OPTIONS.map((range) => (
            <a
              key={range.key}
              href={`/admin/analytics?range=${range.key}&cohort=${cohortKey}${demoMode ? '&fu55Demo=1' : ''}`}
              className="secondary-btn"
              style={{
                minHeight: 34,
                height: 34,
                padding: '0 12px',
                textDecoration: 'none',
                fontSize: 12,
                borderColor: range.key === rangeKey ? 'var(--green-bright)' : undefined,
                color: range.key === rangeKey ? 'var(--green-bright)' : undefined,
              }}
            >
              {range.label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }} data-testid="admin-analytics-cohort-selector">
          {ANALYTICS_COHORT_OPTIONS.map((cohort) => (
            <a
              key={cohort.key}
              href={`/admin/analytics?range=${rangeKey}&cohort=${cohort.key}${demoMode ? '&fu55Demo=1' : ''}`}
              className="secondary-btn"
              style={{
                minHeight: 34,
                height: 34,
                padding: '0 12px',
                textDecoration: 'none',
                fontSize: 12,
                borderColor: cohort.key === cohortKey ? 'var(--green-bright)' : undefined,
                color: cohort.key === cohortKey ? 'var(--green-bright)' : undefined,
              }}
            >
              {cohort.label}
            </a>
          ))}
        </div>
      </div>
      <AdminAnalyticsClient data={dashboardData} />
    </div>
  )
}
