import { ANALYTICS_EVENT_TYPES } from './constants'

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number]

export type AnalyticsProperties = Record<string, string | number | boolean | null | string[] | number[] | undefined>

export type TrackEventInput = {
  event_type: AnalyticsEventType
  event_name: string
  properties?: AnalyticsProperties
  page_path?: string
  referrer?: string
  client_ts?: string
}

export type AnalyticsEventRow = {
  id?: string
  user_id?: string | null
  session_id: string
  event_type: AnalyticsEventType
  event_name: string
  properties: Record<string, unknown> | null
  page_path?: string | null
  referrer?: string | null
  user_agent?: string | null
  client_ts?: string | null
  server_ts: string
}

export type AnalyticsRangeKey = 'today' | '7d' | '30d' | '90d' | 'all_time'

export type AnalyticsRangeOption = {
  key: AnalyticsRangeKey
  label: string
  days: number | null
}

export type MetricDelta = {
  current: number
  previous: number | null
  deltaPct: number | null
}

export type AnalyticsDashboardData = {
  generatedAt: string
  schemaReady: boolean
  rangeKey: AnalyticsRangeKey
  rangeLabel: string
  rangeDays: number | null
  deltas: AnalyticsDashboardDeltas
  overview: OverviewMetrics
  userBehavior: UserBehaviorMetrics
  paidPotential: PaidPotentialMetrics
  modelEvaluation: ModelEvaluationMetrics
  operationalCost: OperationalCostMetrics
}

export type AnalyticsDashboardDeltas = {
  totalEvents: MetricDelta
  totalSessions: MetricDelta
  totalUsers: MetricDelta
  registrations: MetricDelta
  paidAttempts: MetricDelta
  modelSuccessRate: MetricDelta
  operationalCost: MetricDelta
  kFactor: MetricDelta
}

export type SeriesPoint = {
  label: string
  value: number
  secondary?: number
}

export type OverviewMetrics = {
  totalEvents: number
  totalSessions: number
  totalUsers: number
  dauSeries: SeriesPoint[]
  registrationSeries: SeriesPoint[]
  funnel: Array<{ step: string; value: number; conversionRate: number | null }>
  dauCohort: {
    activeUsers: number
    trekUsers: number
    shareUsers: number
    trekRate: number
    shareRate: number
  }
  kFactor: {
    value: number
    attributedRegisters: number
    sourceUsers: number
    series: SeriesPoint[]
  }
  retention: Array<{ cohort: string; d1: number; d7: number; d30: number }>
}

export type UserBehaviorMetrics = {
  mountainTop: Array<{ label: string; value: number }>
  trek: TrekCompletionMetrics
  activityProof: Array<{ label: string; value: number }>
  community: Array<{ label: string; value: number }>
  shareTemplates: ShareTemplateMetrics
}

export type TrekCompletionMetrics = {
  starts: number
  completes: number
  aborts: number
  timeouts: number
  completionRate: number
  nearMissRate: number
  averageDurationSeconds: number
  interruptionHistogram: Array<{ label: string; value: number }>
  timeoutDistribution: Array<{ label: string; value: number }>
}

export type ShareTemplateMetrics = {
  templateUsage: Array<{ label: string; value: number; share: number }>
  funnel: Array<{
    template_id: string
    selected: number
    generated: number
    downloaded: number
    selectToGenerateRate: number
    generateToDownloadRate: number
  }>
  ctr: Array<{ template_id: string; creates: number; opens: number; ctr: number }>
  attribution: Array<{ template_id: string; source_user_id: string; conversions: number }>
  reuse: Array<{ template_id: string; sessions: number; events: number }>
  reuseDistribution: Array<{ label: string; value: number }>
}

export type PaidPotentialMetrics = {
  totalAttempts: number
  triggeredUsers: number
  highPotentialUsers: Array<{ user_id: string; count: number }>
  perFeatureFunnel: Array<{
    feature_id: string
    shown: number
    dismissed: number
    engaged: number
    dismissRate: number
    engagementRate: number
    conversionRate: number
  }>
  frequencyDistribution: Array<{ label: string; value: number }>
}

export type ModelEvaluationMetrics = {
  totalRecognitions: number
  successRate: number
  hallucinationRate: number
  correctionRate: number
  latencyP50: number
  latencyP90: number
  costPerCall: number
  trend: Array<{
    label: string
    successRate: number
    hallucinationRate: number
    correctionRate: number
    costPerCall: number
    latencyP50: number
    latencyP90: number
  }>
  providerComparison: Array<{
    provider: string
    calls: number
    successRate: number
    latencyP50: number
    latencyP90: number
    costPerCall: number
  }>
  fieldHeatmap: Array<{ field: string; edits: number }>
  costSeries: SeriesPoint[]
}

export type OperationalCostMetrics = {
  screenshotCalls: number
  totalCostCny: number
  dailyScreenshotCalls: SeriesPoint[]
  userCallFrequency: Array<{ label: string; value: number }>
  highUsageUsers: Array<{ user_id: string; calls: number }>
}
