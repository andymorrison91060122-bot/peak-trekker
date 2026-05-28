'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsDashboardData, MetricDelta, SeriesPoint } from '@/lib/analytics/types'

type AdminAnalyticsClientProps = {
  data: AnalyticsDashboardData
}

type TabKey = 'overview' | 'behavior' | 'paid' | 'model' | 'cost'

const tabs: Array<{ key: TabKey; label: string; testId: string }> = [
  { key: 'overview', label: '概览', testId: 'admin-analytics-overview' },
  { key: 'behavior', label: '用户行为', testId: 'admin-analytics-user-behavior' },
  { key: 'paid', label: '付费潜力', testId: 'admin-analytics-paid-potential' },
  { key: 'model', label: '模型评测', testId: 'admin-analytics-model-evaluation' },
  { key: 'cost', label: '运营成本', testId: 'admin-analytics-operational-cost' },
]

const chartColors = ['#39FF14', '#74C69D', '#F4A261', '#A7F3D0', '#FACC15']

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}

function compact(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, notation: value >= 10000 ? 'compact' : 'standard' }).format(value)
}

function currency(value: number) {
  return `¥${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

function signedPercent(value: number) {
  const percentValue = Math.round(value * 1000) / 10
  return `${percentValue > 0 ? '+' : ''}${percentValue}%`
}

function seconds(value: number) {
  if (!value) return '0m'
  const hours = Math.floor(value / 3600)
  const minutes = Math.round((value % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function nonEmptySeries(rows: SeriesPoint[], fallbackLabel = '暂无') {
  return rows.length ? rows : [{ label: fallbackLabel, value: 0 }]
}

function DeltaBadge({ delta }: { delta: MetricDelta }) {
  if (delta.deltaPct === null) return <span className="analytics-delta muted">vs 上一窗口 N/A</span>
  const trend = delta.deltaPct > 0 ? 'up' : delta.deltaPct < 0 ? 'down' : 'flat'
  return <span className={`analytics-delta ${trend}`}>vs 上一窗口 {signedPercent(delta.deltaPct)}</span>
}

function StatCard({ label, value, sub, delta }: { label: string; value: string | number; sub?: string; delta?: MetricDelta }) {
  return (
    <div className="analytics-stat-card">
      <div className="analytics-eyebrow">{label}</div>
      <div className="analytics-stat-value">{value}</div>
      {delta ? <DeltaBadge delta={delta} /> : null}
      {sub ? <div className="analytics-muted">{sub}</div> : null}
    </div>
  )
}

function Panel({
  title,
  subtitle,
  testId,
  children,
}: {
  title: string
  subtitle?: string
  testId?: string
  children: React.ReactNode
}) {
  return (
    <section className="analytics-panel" data-testid={testId}>
      <div className="analytics-panel-head">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="analytics-chart-frame">{children}</div>
}

function EmptyRows({ label = '暂无数据' }: { label?: string }) {
  return <div className="analytics-empty">{label}</div>
}

function MiniTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Array<Array<string | number>>
}) {
  if (!rows.length) return <EmptyRows />
  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${row.join('-')}`}>
              {row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SeriesBarChart({ data, color = '#39FF14' }: { data: SeriesPoint[]; color?: string }) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={nonEmptySeries(data)}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="label" stroke="#8A938C" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#8A938C" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #2D6A4F', color: '#E8F5E9' }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function SeriesLineChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={nonEmptySeries(data)}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="label" stroke="#8A938C" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#8A938C" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #2D6A4F', color: '#E8F5E9' }} />
          <Line type="monotone" dataKey="value" stroke="#39FF14" strokeWidth={2.4} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="secondary" stroke="#F4A261" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function OverviewTab({ data }: { data: AnalyticsDashboardData }) {
  const { overview } = data
  return (
    <div className="analytics-tab-panel" data-testid="admin-analytics-overview">
      <div className="analytics-stat-grid">
        <StatCard label="事件总数" value={compact(overview.totalEvents)} sub={data.rangeLabel} delta={data.deltas.totalEvents} />
        <StatCard label="活跃会话" value={compact(overview.totalSessions)} sub="pt_anon_sid" delta={data.deltas.totalSessions} />
        <StatCard label="识别用户" value={compact(overview.totalUsers)} sub="auth user_id" delta={data.deltas.totalUsers} />
        <StatCard label="注册转化" value={overview.funnel[1] ? compact(overview.funnel[1].value) : 0} sub="auth.register_complete" delta={data.deltas.registrations} />
      </div>
      <div className="analytics-two-col">
        <Panel title="DAU trend" subtitle="page_view session trend">
          <SeriesLineChart data={overview.dauSeries} />
        </Panel>
        <Panel title="主漏斗" subtitle="访问 → 注册 → 首次 Trek → 分享">
          <MiniTable columns={['步骤', '数量', '渗透率']} rows={overview.funnel.map((row) => [row.step, row.value, row.conversionRate === null ? '入口' : percent(row.conversionRate)])} />
        </Panel>
      </div>
      <div className="analytics-two-col">
        <Panel title="DAU 转化路径" subtitle="当日 active 用户中的 Trek / 分享行为">
          <div className="analytics-stat-grid compact">
            <StatCard label="DAU" value={overview.dauCohort.activeUsers} />
            <StatCard label="Trek 占比" value={percent(overview.dauCohort.trekRate)} sub={`${overview.dauCohort.trekUsers} 人`} />
            <StatCard label="分享占比" value={percent(overview.dauCohort.shareRate)} sub={`${overview.dauCohort.shareUsers} 人`} />
          </div>
        </Panel>
        <Panel title="K-factor 病毒系数" subtitle="注册归因数 / 创建分享链接的推荐人">
          <div className="analytics-stat-grid compact">
            <StatCard label="K-factor" value={overview.kFactor.value.toFixed(2)} delta={data.deltas.kFactor} />
            <StatCard label="归因注册" value={overview.kFactor.attributedRegisters} />
            <StatCard label="推荐人" value={overview.kFactor.sourceUsers} />
          </div>
          <SeriesLineChart data={overview.kFactor.series} />
          <div className="analytics-muted">公式: share_link_register_attribution / unique source_user_id。</div>
        </Panel>
      </div>
      <Panel title="Retention sample" subtitle="注册后 D1 / D7 / D30 回访">
        <MiniTable
          columns={['Cohort', 'D1', 'D7', 'D30']}
          rows={overview.retention.map((row) => [row.cohort, row.d1, row.d7, row.d30])}
        />
      </Panel>
    </div>
  )
}

function UserBehaviorTab({ data }: { data: AnalyticsDashboardData }) {
  const { userBehavior } = data
  return (
    <div className="analytics-tab-panel" data-testid="admin-analytics-user-behavior">
      <div className="analytics-two-col">
        <Panel title="山峰热度 Top 10" subtitle="business.mountain_view" testId="admin-analytics-mountain-top">
          <SeriesBarChart data={userBehavior.mountainTop} />
        </Panel>
        <Panel title="Trek 完成情况" subtitle="完成率 / near-miss / 中断分布" testId="admin-analytics-trek">
          <div className="analytics-stat-grid compact">
            <StatCard label="开始" value={userBehavior.trek.starts} />
            <StatCard label="完成率" value={percent(userBehavior.trek.completionRate)} />
            <StatCard label="Near-miss" value={percent(userBehavior.trek.nearMissRate)} sub="进入顶峰附近但未完成" />
            <StatCard label="平均时长" value={seconds(userBehavior.trek.averageDurationSeconds)} />
          </div>
          <SeriesBarChart data={userBehavior.trek.interruptionHistogram} color="#F4A261" />
          <MiniTable
            columns={['Timeout bucket', 'Sessions']}
            rows={userBehavior.trek.timeoutDistribution.map((row) => [row.label, row.value])}
          />
        </Panel>
      </div>
      <div className="analytics-two-col">
        <Panel title="Activity 留证状态" subtitle="proof_status distribution" testId="admin-analytics-activity-proof">
          <SeriesBarChart data={userBehavior.activityProof} color="#74C69D" />
        </Panel>
        <Panel title="Community 互动" subtitle="community event count" testId="admin-analytics-community">
          <SeriesBarChart data={userBehavior.community} color="#A7F3D0" />
        </Panel>
      </div>
      <section className="analytics-section" data-testid="admin-analytics-share-templates">
        <div className="analytics-panel-head">
          <h2>水印模板传播归因</h2>
          <p>模板 × 推荐人 × 注册转化</p>
        </div>
        <div className="analytics-two-col">
          <Panel title="生成数占比" subtitle="各模板事件使用占比">
            <ChartFrame>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={nonEmptySeries(userBehavior.shareTemplates.templateUsage)} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={76} innerRadius={40} isAnimationActive={false}>
                    {nonEmptySeries(userBehavior.shareTemplates.templateUsage).map((row, index) => <Cell key={row.label} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #2D6A4F', color: '#E8F5E9' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
          </Panel>
          <Panel title="选择 → 生成漏斗" subtitle="per-template conversion">
            <MiniTable
              columns={['模板', '选择', '生成', '转化']}
              rows={userBehavior.shareTemplates.funnel.map((row) => [row.template_id, row.selected, row.generated, percent(row.selectToGenerateRate)])}
            />
          </Panel>
          <Panel title="分享链接 CTR" subtitle="open / create">
            <MiniTable
              columns={['模板', 'Create', 'Open', 'CTR']}
              rows={userBehavior.shareTemplates.ctr.map((row) => [row.template_id, row.creates, row.opens, percent(row.ctr)])}
            />
          </Panel>
          <Panel title="复用频次分布" subtitle="per-template sessions">
            <SeriesBarChart data={userBehavior.shareTemplates.reuseDistribution} color="#FACC15" />
          </Panel>
        </div>
        <div className="analytics-two-col">
          <MiniTable
            columns={['模板', '生成占比']}
            rows={userBehavior.shareTemplates.templateUsage.map((row) => [row.label, percent(row.share)])}
          />
          <MiniTable
            columns={['模板', '推荐人', '转化']}
            rows={userBehavior.shareTemplates.attribution.map((row) => [row.template_id, row.source_user_id.slice(0, 8), row.conversions])}
          />
        </div>
      </section>
    </div>
  )
}

function PaidPotentialTab({ data }: { data: AnalyticsDashboardData }) {
  const { paidPotential } = data
  return (
    <div className="analytics-tab-panel" data-testid="admin-analytics-paid-potential">
      <div className="analytics-stat-grid">
        <StatCard label="付费触发" value={paidPotential.totalAttempts} delta={data.deltas.paidAttempts} />
        <StatCard label="触发用户" value={paidPotential.triggeredUsers} />
        <StatCard label="Top 用户" value={paidPotential.highPotentialUsers[0]?.user_id.slice(0, 8) ?? '—'} />
      </div>
      <div className="analytics-two-col">
        <Panel title="Feature funnel" subtitle="paid_attempt current_state">
          <MiniTable
            columns={['Feature', 'Shown', 'Dismissed', 'Engaged', 'Dismiss', 'Engage']}
            rows={paidPotential.perFeatureFunnel.map((row) => [
              row.feature_id,
              row.shown,
              row.dismissed,
              row.engaged,
              percent(row.dismissRate),
              percent(row.engagementRate),
            ])}
          />
        </Panel>
        <Panel title="触发频次分布" subtitle="单 user/session paid attempts">
          <SeriesBarChart data={paidPotential.frequencyDistribution} color="#FACC15" />
        </Panel>
      </div>
      <Panel title="高潜用户列表">
        <MiniTable columns={['User / Session', '次数']} rows={paidPotential.highPotentialUsers.map((row) => [row.user_id.slice(0, 16), row.count])} />
      </Panel>
    </div>
  )
}

function ModelEvaluationTab({ data }: { data: AnalyticsDashboardData }) {
  const { modelEvaluation } = data
  const trend = modelEvaluation.trend.length ? modelEvaluation.trend : [{ label: '暂无', successRate: 0, hallucinationRate: 0, correctionRate: 0, latencyP50: 0, latencyP90: 0, costPerCall: 0 }]
  return (
    <div className="analytics-tab-panel" data-testid="admin-analytics-model-evaluation">
      <div className="analytics-callout">hallucination_rate 为启发式估算：识别完成后用户立即修改字段即计入候选，不等同 ground truth。</div>
      <div className="analytics-stat-grid">
        <StatCard label="识别调用" value={modelEvaluation.totalRecognitions} />
        <StatCard label="Success rate" value={percent(modelEvaluation.successRate)} delta={data.deltas.modelSuccessRate} />
        <StatCard label="Hallucination" value={percent(modelEvaluation.hallucinationRate)} sub="启发式估算" />
        <StatCard label="Correction" value={percent(modelEvaluation.correctionRate)} />
        <StatCard label="Latency P50/P90" value={`${modelEvaluation.latencyP50}/${modelEvaluation.latencyP90}ms`} />
        <StatCard label="Cost / call" value={`¥${modelEvaluation.costPerCall}`} />
      </div>
      <div className="analytics-two-col">
        <Panel title="5 项 KPI trend" subtitle="success / hallucination / latency / cost / correction">
          <ChartFrame>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="label" stroke="#8A938C" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#8A938C" fontSize={11} tickLine={false} axisLine={false} width={34} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #2D6A4F', color: '#E8F5E9' }} />
                <Line dataKey="successRate" stroke="#39FF14" strokeWidth={2} />
                <Line dataKey="hallucinationRate" stroke="#F4A261" strokeWidth={2} />
                <Line dataKey="correctionRate" stroke="#A7F3D0" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Panel>
        <Panel title="Provider 对比" subtitle="腾讯 OCR / 小米 v2-omni / others">
          <MiniTable
            columns={['Provider', 'Calls', 'Success', 'P50/P90', 'Cost']}
            rows={modelEvaluation.providerComparison.map((row) => [
              row.provider,
              row.calls,
              percent(row.successRate),
              `${row.latencyP50}/${row.latencyP90}`,
              `¥${row.costPerCall}`,
            ])}
          />
        </Panel>
      </div>
      <div className="analytics-two-col">
        <Panel title="Field edit heatmap" subtitle="最常被用户修正的字段 Top 5">
          <SeriesBarChart data={modelEvaluation.fieldHeatmap.map((row) => ({ label: row.field, value: row.edits }))} color="#F4A261" />
        </Panel>
        <Panel title="Cost 趋势" subtitle="调用次数 + 成本">
          <SeriesLineChart data={modelEvaluation.costSeries} />
        </Panel>
      </div>
    </div>
  )
}

function OperationalCostTab({ data }: { data: AnalyticsDashboardData }) {
  const { operationalCost } = data
  const pieData = nonEmptySeries(operationalCost.userCallFrequency)
  return (
    <div className="analytics-tab-panel" data-testid="admin-analytics-operational-cost">
      <div className="analytics-stat-grid">
        <StatCard label="截图识别调用" value={operationalCost.screenshotCalls} />
        <StatCard label="总花费" value={currency(operationalCost.totalCostCny)} delta={data.deltas.operationalCost} sub="依赖 provider pricing 集成，当前 placeholder" />
        <StatCard label="高频用户" value={operationalCost.highUsageUsers.length} />
      </div>
      <div className="analytics-two-col">
        <Panel title="Daily calls" subtitle="screenshot recognition volume">
          <SeriesLineChart data={operationalCost.dailyScreenshotCalls} />
        </Panel>
        <Panel title="用户调用频次" subtitle="per user/session call bucket">
          <ChartFrame>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={78} innerRadius={42} isAnimationActive={false}>
                  {pieData.map((row, index) => <Cell key={row.label} fill={chartColors[index % chartColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #2D6A4F', color: '#E8F5E9' }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Panel>
      </div>
      <Panel title="高用量用户 / session">
        <MiniTable columns={['User / Session', 'Calls']} rows={operationalCost.highUsageUsers.map((row) => [row.user_id.slice(0, 16), row.calls])} />
      </Panel>
    </div>
  )
}

export default function AdminAnalyticsClient({ data }: AdminAnalyticsClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const activeTestId = useMemo(() => tabs.find((tab) => tab.key === activeTab)?.testId, [activeTab])

  return (
    <div className="analytics-admin-root">
      <style>{`
        .analytics-admin-root {
          color: var(--text-primary);
        }
        .analytics-warning {
          margin-bottom: 16px;
          padding: 12px 14px;
          border: 1px solid color-mix(in srgb, var(--color-warning) 42%, transparent);
          background: color-mix(in srgb, var(--color-warning) 12%, transparent);
          color: var(--color-warning);
          font-size: 12px;
          line-height: 1.5;
        }
        .analytics-tabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 2px 0 12px;
          margin-bottom: 12px;
          scrollbar-width: thin;
        }
        .analytics-tabs button {
          min-height: 38px;
          flex: 0 0 auto;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-muted);
          border-radius: 999px;
          padding: 0 14px;
          font-family: var(--font-mono);
          font-size: 12px;
          cursor: pointer;
        }
        .analytics-tabs button[aria-selected="true"] {
          color: var(--green-bright);
          border-color: color-mix(in srgb, var(--green-bright) 54%, transparent);
          background: color-mix(in srgb, var(--green-bright) 10%, var(--bg-card));
        }
        .analytics-tab-panel {
          display: grid;
          gap: 14px;
        }
        .analytics-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
          gap: 10px;
        }
        .analytics-stat-grid.compact {
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          margin-bottom: 12px;
        }
        .analytics-stat-card,
        .analytics-panel {
          border: 1px solid var(--border-color);
          background: var(--bg-card);
        }
        .analytics-stat-card {
          padding: 14px;
          min-width: 0;
        }
        .analytics-eyebrow {
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .analytics-stat-value {
          color: var(--green-bright);
          font-family: var(--font-mono);
          font-size: 22px;
          line-height: 1.1;
          word-break: break-word;
        }
        .analytics-muted {
          margin-top: 6px;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.4;
        }
        .analytics-delta {
          display: inline-flex;
          margin-top: 7px;
          padding: 2px 6px;
          border: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
          font-family: var(--font-mono);
          font-size: 10px;
          line-height: 1.25;
          color: var(--text-muted);
          background: color-mix(in srgb, var(--bg-page) 76%, transparent);
        }
        .analytics-delta.up {
          color: var(--green-bright);
          border-color: color-mix(in srgb, var(--green-bright) 42%, transparent);
        }
        .analytics-delta.down {
          color: var(--color-warning);
          border-color: color-mix(in srgb, var(--color-warning) 38%, transparent);
        }
        .analytics-two-col,
        .analytics-three-col {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .analytics-three-col {
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .analytics-panel {
          padding: 14px;
          min-width: 0;
        }
        .analytics-section {
          display: grid;
          gap: 14px;
          min-width: 0;
        }
        .analytics-panel-head {
          margin-bottom: 12px;
        }
        .analytics-panel h2,
        .analytics-section h2 {
          margin: 0;
          color: var(--green-bright);
          font-size: 14px;
          line-height: 1.35;
          font-family: var(--font-mono);
        }
        .analytics-panel p,
        .analytics-section p {
          margin: 4px 0 0;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.5;
        }
        .analytics-callout {
          padding: 12px 14px;
          border: 1px solid color-mix(in srgb, var(--color-warning) 32%, transparent);
          background: color-mix(in srgb, var(--color-warning) 10%, transparent);
          color: var(--color-warning);
          font-size: 12px;
          line-height: 1.55;
        }
        .analytics-chart-frame {
          width: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .analytics-table-wrap {
          overflow-x: auto;
          width: 100%;
        }
        .analytics-table {
          width: 100%;
          min-width: 280px;
          border-collapse: collapse;
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .analytics-table th,
        .analytics-table td {
          padding: 9px 8px;
          border-bottom: 1px solid var(--border-color);
          text-align: left;
          color: var(--text-primary);
          vertical-align: top;
          word-break: break-word;
        }
        .analytics-table th {
          color: var(--text-muted);
          font-weight: 500;
        }
        .analytics-empty {
          min-height: 96px;
          display: grid;
          place-items: center;
          color: var(--text-muted);
          font-size: 12px;
          border: 1px dashed var(--border-color);
        }
        @media (max-width: 760px) {
          .analytics-two-col,
          .analytics-three-col {
            grid-template-columns: 1fr;
          }
          .analytics-stat-value {
            font-size: 19px;
          }
          .analytics-table {
            min-width: 280px;
          }
        }
      `}</style>
      {!data.schemaReady ? (
        <div className="analytics-warning" role="status">
          events schema 尚未在当前环境迁移，dashboard 正在显示空态。V3 需要 deploy-gated migration 后再看真实数据。
        </div>
      ) : null}
      <div className="analytics-tabs" role="tablist" aria-label="analytics tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={tab.testId}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={activeTestId}>
        {activeTab === 'overview' ? <OverviewTab data={data} /> : null}
        {activeTab === 'behavior' ? <UserBehaviorTab data={data} /> : null}
        {activeTab === 'paid' ? <PaidPotentialTab data={data} /> : null}
        {activeTab === 'model' ? <ModelEvaluationTab data={data} /> : null}
        {activeTab === 'cost' ? <OperationalCostTab data={data} /> : null}
      </div>
    </div>
  )
}
