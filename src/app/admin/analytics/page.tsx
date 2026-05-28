import AdminAnalyticsClient from './AdminAnalyticsClient'
import { ANALYTICS_RANGE_OPTIONS, buildAnalyticsDashboardData, normalizeAnalyticsRangeKey } from '@/lib/analytics/kpis'
import type { AnalyticsEventRow, AnalyticsRangeKey } from '@/lib/analytics/types'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type AdminAnalyticsPageProps = {
  searchParams?: Promise<{ range?: string; fu55Demo?: string }>
}

function demoEvent(
  index: number,
  event_name: string,
  properties: Record<string, unknown> = {},
  event_type: AnalyticsEventRow['event_type'] = 'business',
  daysAgo = index % 14,
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
    referrer: null,
    user_agent: 'fu55-demo',
    client_ts: date.toISOString(),
    server_ts: date.toISOString(),
  }
}

function buildDemoEvents(): AnalyticsEventRow[] {
  const events: AnalyticsEventRow[] = []
  for (let index = 0; index < 28; index += 1) {
    events.push(demoEvent(index, 'page_view', {}, 'page_view', index % 14))
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
  events.push(
    demoEvent(20, 'auth.register_complete', {}, 'auth', 0),
    demoEvent(21, 'auth.register_complete', {}, 'auth', 8),
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
  const demoMode = process.env.NODE_ENV !== 'production' && params?.fu55Demo === '1'
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('events')
    .select('id,user_id,session_id,event_type,event_name,properties,page_path,referrer,user_agent,client_ts,server_ts')
    .order('server_ts', { ascending: false })
    .limit(5000)

  const schemaReady = !error || demoMode
  if (error) {
    console.warn('[admin analytics] events read skipped', {
      code: error.code,
      message: error.message,
    })
  }

  const dashboardData = buildAnalyticsDashboardData(demoMode ? buildDemoEvents() : (data ?? []) as AnalyticsEventRow[], rangeKey, schemaReady)

  return (
    <div data-testid="admin-analytics-page">
      <div style={{ marginBottom: 22 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          {'// ANALYTICS'}
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          自托管事件分析 · {dashboardData.rangeLabel}窗口 · {new Date(dashboardData.generatedAt).toLocaleString('zh-CN')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {ANALYTICS_RANGE_OPTIONS.map((range) => (
            <a
              key={range.key}
              href={`/admin/analytics?range=${range.key}${demoMode ? '&fu55Demo=1' : ''}`}
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
      </div>
      <AdminAnalyticsClient data={dashboardData} />
    </div>
  )
}
