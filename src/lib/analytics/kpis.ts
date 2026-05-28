import type {
  AnalyticsCohortKey,
  AnalyticsDashboardData,
  AnalyticsRangeKey,
  AnalyticsRangeOption,
  AnalyticsEventRow,
  MetricDelta,
  ModelEvaluationMetrics,
  OperationalCostMetrics,
  OverviewMetrics,
  PaidPotentialMetrics,
  SeriesPoint,
  ShareTemplateMetrics,
  TrekCompletionMetrics,
  UserBehaviorMetrics,
} from './types'
import { ANALYTICS_COHORT_OPTIONS, NEW_USER_THRESHOLD_DAYS } from './constants.ts'

const DAY_MS = 86_400_000

export const ANALYTICS_RANGE_OPTIONS: AnalyticsRangeOption[] = [
  { key: 'today', label: '今日', days: 1 },
  { key: '7d', label: '7 天', days: 7 },
  { key: '30d', label: '30 天', days: 30 },
  { key: '90d', label: '90 天', days: 90 },
  { key: 'all_time', label: '历史累计', days: null },
]

const RANGE_OPTION_MAP = new Map(ANALYTICS_RANGE_OPTIONS.map((option) => [option.key, option]))
const COHORT_OPTION_MAP = new Map(ANALYTICS_COHORT_OPTIONS.map((option) => [option.key, option]))

export function normalizeAnalyticsRangeKey(value: string | number | undefined | null): AnalyticsRangeKey {
  if (value === 'today' || value === 'all_time') return value
  if (value === '7d' || value === 7 || value === '7') return '7d'
  if (value === '30d' || value === 30 || value === '30') return '30d'
  if (value === '90d' || value === 90 || value === '90') return '90d'
  return '30d'
}

export function normalizeAnalyticsCohortKey(value: string | undefined | null): AnalyticsCohortKey {
  if (value === 'new' || value === 'returning' || value === 'anonymous') return value
  return 'all'
}

function getRangeOption(rangeKey: AnalyticsRangeKey) {
  return RANGE_OPTION_MAP.get(rangeKey) ?? RANGE_OPTION_MAP.get('30d')!
}

function getCohortOption(cohortKey: AnalyticsCohortKey) {
  return COHORT_OPTION_MAP.get(cohortKey) ?? COHORT_OPTION_MAP.get('all')!
}

function startOfLocalDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function rangeStart(rangeKey: AnalyticsRangeKey, now = new Date()) {
  if (rangeKey === 'all_time') return null
  if (rangeKey === 'today') return startOfLocalDay(now)
  const option = getRangeOption(rangeKey)
  const date = new Date(now)
  date.setDate(date.getDate() - (option.days ?? 30))
  return date
}

function previousRangeStart(rangeKey: AnalyticsRangeKey, now = new Date()) {
  if (rangeKey === 'all_time') return null
  if (rangeKey === 'today') {
    const start = startOfLocalDay(now)
    start.setDate(start.getDate() - 1)
    return start
  }
  const option = getRangeOption(rangeKey)
  const date = rangeStart(rangeKey, now) ?? new Date(now)
  date.setDate(date.getDate() - (option.days ?? 30))
  return date
}

function isWithin(row: AnalyticsEventRow, start: Date | null, end: Date | null) {
  const time = new Date(row.server_ts).getTime()
  if (!Number.isFinite(time)) return false
  return (!start || time >= start.getTime()) && (!end || time < end.getTime())
}

export function filterEventsForAnalyticsRange(events: AnalyticsEventRow[], rangeKey: AnalyticsRangeKey, now = new Date()) {
  return events.filter((row) => isWithin(row, rangeStart(rangeKey, now), null))
}

function previousEventsForAnalyticsRange(events: AnalyticsEventRow[], rangeKey: AnalyticsRangeKey, now = new Date()) {
  if (rangeKey === 'all_time') return []
  return events.filter((row) => isWithin(row, previousRangeStart(rangeKey, now), rangeStart(rangeKey, now)))
}

function properties(row: AnalyticsEventRow) {
  return row.properties ?? {}
}

function asString(value: unknown, fallback = 'unknown') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0
}

function round1(value: number) {
  return Number(value.toFixed(1))
}

function metricDelta(current: number, previous: number | null): MetricDelta {
  if (previous === null) return { current, previous: null, deltaPct: null }
  if (previous === 0) return { current, previous, deltaPct: current === 0 ? 0 : 1 }
  return { current, previous, deltaPct: Number(((current - previous) / previous).toFixed(4)) }
}

function uniqueCount(values: Array<string | null | undefined>) {
  return new Set(values.filter(Boolean)).size
}

function cohortActorId(row: AnalyticsEventRow, cohortKey: AnalyticsCohortKey) {
  if (cohortKey === 'anonymous') return row.user_id ? null : row.session_id
  return row.user_id ?? row.session_id
}

function firstRegisterMap(fullHistory: AnalyticsEventRow[]) {
  const registrations = new Map<string, number>()
  for (const row of fullHistory) {
    if (row.event_name !== 'auth.register_complete' || !row.user_id) continue
    const time = new Date(row.server_ts).getTime()
    if (!Number.isFinite(time)) continue
    const previous = registrations.get(row.user_id)
    if (previous === undefined || time < previous) registrations.set(row.user_id, time)
  }
  return registrations
}

export function partitionByCohort(
  events: AnalyticsEventRow[],
  cohort: AnalyticsCohortKey | string = 'all',
  fullHistory: AnalyticsEventRow[] = events,
  now = new Date(),
): AnalyticsEventRow[] {
  const cohortKey = normalizeAnalyticsCohortKey(cohort)
  if (cohortKey === 'all') return events
  if (cohortKey === 'anonymous') return events.filter((row) => !row.user_id)

  const firstRegisters = firstRegisterMap(fullHistory)
  const thresholdMs = NEW_USER_THRESHOLD_DAYS * DAY_MS
  const nowTime = now.getTime()

  return events.filter((row) => {
    if (!row.user_id) return false
    const firstRegisterAt = firstRegisters.get(row.user_id)
    if (firstRegisterAt === undefined) return cohortKey === 'returning'
    const accountAgeMs = nowTime - firstRegisterAt
    const isNew = accountAgeMs <= thresholdMs
    return cohortKey === 'new' ? isNew : !isNew
  })
}

function countCohortActors(events: AnalyticsEventRow[], cohortKey: AnalyticsCohortKey) {
  return uniqueCount(events.map((row) => cohortActorId(row, cohortKey)))
}

function dayLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function percentile(values: number[], target: number) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (clean.length === 0) return 0
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil((target / 100) * clean.length) - 1))
  return Math.round(clean[index])
}

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

function mapToTopList(counts: Map<string, number>, limit = 10) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}

function funnelWithConversion(rows: Array<{ step: string; value: number }>) {
  return rows.map((row, index) => ({
    ...row,
    conversionRate: index === 0 ? null : ratio(row.value, rows[index - 1]?.value ?? 0),
  }))
}

function dailySeries(events: AnalyticsEventRow[], filter: (row: AnalyticsEventRow) => boolean): SeriesPoint[] {
  const counts = countBy(events.filter(filter).map((row) => dayLabel(row.server_ts)))
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label))
}

export function buildOverviewMetrics(events: AnalyticsEventRow[]): OverviewMetrics {
  const users = new Set(events.map((row) => row.user_id).filter(Boolean))
  const sessions = new Set(events.map((row) => row.session_id).filter(Boolean))
  const started = events.filter((row) => row.event_name === 'business.trek_start').length
  const shared = events.filter((row) => row.event_name === 'business.share_template_generate').length
  return {
    totalEvents: events.length,
    totalSessions: sessions.size,
    totalUsers: users.size,
    dauSeries: dailySeries(events, (row) => row.event_name === 'page_view'),
    registrationSeries: dailySeries(events, (row) => row.event_name === 'auth.register_complete'),
    funnel: funnelWithConversion([
      { step: '访问', value: events.filter((row) => row.event_name === 'page_view').length },
      { step: '注册', value: events.filter((row) => row.event_name === 'auth.register_complete').length },
      { step: '首次 Trek', value: started },
      { step: '分享', value: shared },
    ]),
    dauCohort: buildDauCohort(events),
    kFactor: buildKFactorMetrics(events),
    retention: buildRetention(events),
  }
}

function actorId(row: AnalyticsEventRow) {
  return row.user_id ?? row.session_id
}

function paidActorId(row: AnalyticsEventRow) {
  return actorId(row) || 'unknown'
}

function buildDauCohort(events: AnalyticsEventRow[]) {
  const activeUsers = new Set(events.filter((row) => row.event_name === 'page_view').map(actorId).filter(Boolean))
  const trekUsers = new Set(events.filter((row) => row.event_name === 'business.trek_start').map(actorId).filter(Boolean))
  const shareUsers = new Set(events.filter((row) => row.event_name === 'business.share_link_create').map(actorId).filter(Boolean))
  const active = [...activeUsers]
  const trekCount = active.filter((id) => trekUsers.has(id)).length
  const shareCount = active.filter((id) => shareUsers.has(id)).length
  return {
    activeUsers: active.length,
    trekUsers: trekCount,
    shareUsers: shareCount,
    trekRate: ratio(trekCount, active.length),
    shareRate: ratio(shareCount, active.length),
  }
}

export function buildKFactorMetrics(events: AnalyticsEventRow[]): OverviewMetrics['kFactor'] {
  const attributionRows = events.filter((row) => row.event_name === 'business.share_link_register_attribution')
  const sourceUsers = countKFactorSourceUsers(events)
  return {
    value: ratio(attributionRows.length, sourceUsers),
    attributedRegisters: attributionRows.length,
    sourceUsers,
    series: buildKFactorSeries(events),
  }
}

function countKFactorSourceUsers(events: AnalyticsEventRow[]) {
  const createRows = events.filter((row) => row.event_name === 'business.share_link_create')
  return uniqueCount(createRows.map((row) => asString(properties(row).source_user_id, row.user_id ?? row.session_id)))
}

function buildKFactorSeries(events: AnalyticsEventRow[]) {
  const days = [...new Set(events
    .filter((row) => row.event_name === 'business.share_link_create' || row.event_name === 'business.share_link_register_attribution')
    .map((row) => dayLabel(row.server_ts)))]
    .sort()
  return days.map((label) => {
    const dayRows = events.filter((row) => dayLabel(row.server_ts) === label)
    const attributions = dayRows.filter((row) => row.event_name === 'business.share_link_register_attribution').length
    return { label, value: ratio(attributions, countKFactorSourceUsers(dayRows)) }
  })
}

function buildRetention(events: AnalyticsEventRow[]) {
  const registrationRows = events.filter((row) => row.event_name === 'auth.register_complete' && row.user_id)
  return registrationRows.slice(0, 8).map((row) => {
    const registeredAt = new Date(row.server_ts).getTime()
    const userEvents = events.filter((event) => event.user_id === row.user_id)
    const hasWithin = (minDay: number, maxDay: number) => userEvents.some((event) => {
      const delta = new Date(event.server_ts).getTime() - registeredAt
      return delta >= minDay * DAY_MS && delta < maxDay * DAY_MS
    })
    return {
      cohort: dayLabel(row.server_ts),
      d1: hasWithin(1, 2) ? 1 : 0,
      d7: hasWithin(7, 8) ? 1 : 0,
      d30: hasWithin(30, 31) ? 1 : 0,
    }
  })
}

export function buildTrekCompletionMetrics(events: AnalyticsEventRow[]): TrekCompletionMetrics {
  const starts = events.filter((row) => row.event_name === 'business.trek_start')
  const completes = events.filter((row) => row.event_name === 'business.trek_complete')
  const aborts = events.filter((row) => row.event_name === 'business.trek_abort')
  const timeouts = events.filter((row) => row.event_name === 'business.trek_timeout')
  const completedSessions = new Set(completes.map((row) => asString(properties(row).session_id, '')).filter(Boolean))
  const proximityRows = events.filter((row) => row.event_name === 'business.trek_summit_proximity_enter')
  const nearMisses = proximityRows.filter((row) => {
    const sessionId = asString(properties(row).session_id, '')
    return sessionId && !completedSessions.has(sessionId)
  })
  const durations = completes.map((row) => asNumber(properties(row).duration_seconds)).filter(Boolean)
  return {
    starts: starts.length,
    completes: completes.length,
    aborts: aborts.length,
    timeouts: timeouts.length,
    completionRate: ratio(completes.length, starts.length),
    nearMissRate: ratio(nearMisses.length, proximityRows.length),
    averageDurationSeconds: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    interruptionHistogram: buildAltitudeHistogram([...aborts, ...timeouts]),
    timeoutDistribution: mapToTopList(countBy(timeouts.map((row) => {
      const hours = asNumber(properties(row).hours_idle)
      if (hours < 6) return '<6h'
      if (hours < 24) return '6-24h'
      return '24h+'
    })), 3),
  }
}

function buildAltitudeHistogram(rows: AnalyticsEventRow[]) {
  const buckets = ['0-25%', '25-50%', '50-75%', '75-100%']
  const counts = new Map(buckets.map((bucket) => [bucket, 0]))
  for (const row of rows) {
    const progress = Math.max(0, Math.min(1, asNumber(properties(row).altitude_progress)))
    const bucket = progress < 0.25 ? buckets[0] : progress < 0.5 ? buckets[1] : progress < 0.75 ? buckets[2] : buckets[3]
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }
  return buckets.map((label) => ({ label, value: counts.get(label) ?? 0 }))
}

export function buildShareTemplateMetrics(events: AnalyticsEventRow[]): ShareTemplateMetrics {
  const templateEvents = events.filter((row) => String(row.event_name).startsWith('business.share_template_') || row.event_name.startsWith('business.share_link_'))
  const templateCounts = countBy(templateEvents.map((row) => asString(properties(row).template_id)))
  const totalTemplateEvents = templateEvents.length
  const templates = [...templateCounts.keys()]
  return {
    templateUsage: mapToTopList(templateCounts).map((row) => ({ ...row, share: ratio(row.value, totalTemplateEvents) })),
    funnel: templates.map((template_id) => ({
      template_id,
      selected: templateEvents.filter((row) => row.event_name === 'business.share_template_select' && properties(row).template_id === template_id).length,
      generated: templateEvents.filter((row) => row.event_name === 'business.share_template_generate' && properties(row).template_id === template_id).length,
      downloaded: templateEvents.filter((row) => row.event_name === 'business.share_template_download' && properties(row).template_id === template_id).length,
      selectToGenerateRate: ratio(
        templateEvents.filter((row) => row.event_name === 'business.share_template_generate' && properties(row).template_id === template_id).length,
        templateEvents.filter((row) => row.event_name === 'business.share_template_select' && properties(row).template_id === template_id).length,
      ),
      generateToDownloadRate: ratio(
        templateEvents.filter((row) => row.event_name === 'business.share_template_download' && properties(row).template_id === template_id).length,
        templateEvents.filter((row) => row.event_name === 'business.share_template_generate' && properties(row).template_id === template_id).length,
      ),
    })),
    ctr: templates.map((template_id) => {
      const creates = templateEvents.filter((row) => row.event_name === 'business.share_link_create' && properties(row).template_id === template_id).length
      const opens = templateEvents.filter((row) => row.event_name === 'business.share_link_open' && properties(row).template_id === template_id).length
      return { template_id, creates, opens, ctr: ratio(opens, creates) }
    }),
    attribution: buildAttributionTable(templateEvents),
    reuse: templates.map((template_id) => {
      const rows = templateEvents.filter((row) => properties(row).template_id === template_id)
      return { template_id, sessions: new Set(rows.map((row) => row.session_id)).size, events: rows.length }
    }),
    reuseDistribution: mapToTopList(countBy(templates.map((template_id) => {
      const sessions = new Set(templateEvents.filter((row) => properties(row).template_id === template_id).map((row) => row.session_id)).size
      if (sessions <= 1) return '1 session'
      if (sessions <= 3) return '2-3 sessions'
      return '4+ sessions'
    })), 3),
  }
}

function buildAttributionTable(events: AnalyticsEventRow[]) {
  const keyCounts = new Map<string, number>()
  for (const row of events.filter((event) => event.event_name === 'business.share_link_register_attribution')) {
    const props = properties(row)
    const templateId = asString(props.template_id)
    const sourceUserId = asString(props.source_user_id)
    const key = `${templateId}|||${sourceUserId}`
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }
  return [...keyCounts.entries()].map(([key, conversions]) => {
    const [template_id, source_user_id] = key.split('|||')
    return { template_id, source_user_id, conversions }
  }).sort((left, right) => right.conversions - left.conversions)
}

export function buildModelEvaluationMetrics(events: AnalyticsEventRow[]): ModelEvaluationMetrics {
  const completeRows = events.filter((row) => row.event_name === 'business.screenshot_recognize_complete')
  const editRows = events.filter((row) => row.event_name === 'business.screenshot_recognize_user_edit')
  const successRows = completeRows.filter((row) => properties(row).success === true)
  const latencies = completeRows.map((row) => asNumber(properties(row).duration_ms)).filter(Boolean)
  const totalCost = completeRows.reduce((sum, row) => sum + asNumber(properties(row).cost_cny), 0)
  const providerCounts = countBy(completeRows.map((row) => asString(properties(row).provider, 'unknown')))
  return {
    totalRecognitions: completeRows.length,
    successRate: ratio(successRows.length, completeRows.length),
    hallucinationRate: ratio(editRows.length, completeRows.length),
    correctionRate: ratio(editRows.length, completeRows.length),
    latencyP50: percentile(latencies, 50),
    latencyP90: percentile(latencies, 90),
    costPerCall: completeRows.length ? Number((totalCost / completeRows.length).toFixed(4)) : 0,
    trend: buildModelTrend(completeRows, editRows),
    providerComparison: [...providerCounts.keys()].map((provider) => buildProviderComparison(provider, completeRows)),
    fieldHeatmap: mapToTopList(countBy(editRows.map((row) => asString(properties(row).field_edited))), 5)
      .map(({ label, value }) => ({ field: label, edits: value })),
    costSeries: dailySeries(completeRows, () => true).map((point) => ({
      ...point,
      secondary: completeRows
        .filter((row) => dayLabel(row.server_ts) === point.label)
        .reduce((sum, row) => sum + asNumber(properties(row).cost_cny), 0),
    })),
  }
}

function buildModelTrend(completeRows: AnalyticsEventRow[], editRows: AnalyticsEventRow[]) {
  const days = [...new Set([...completeRows, ...editRows].map((row) => dayLabel(row.server_ts)))].sort()
  return days.map((label) => {
    const dayCompletes = completeRows.filter((row) => dayLabel(row.server_ts) === label)
    const dayEdits = editRows.filter((row) => dayLabel(row.server_ts) === label)
    const latencies = dayCompletes.map((row) => asNumber(properties(row).duration_ms)).filter(Boolean)
    const totalCost = dayCompletes.reduce((sum, row) => sum + asNumber(properties(row).cost_cny), 0)
    return {
      label,
      successRate: ratio(dayCompletes.filter((row) => properties(row).success === true).length, dayCompletes.length),
      hallucinationRate: ratio(dayEdits.length, dayCompletes.length),
      correctionRate: ratio(dayEdits.length, dayCompletes.length),
      costPerCall: dayCompletes.length ? Number((totalCost / dayCompletes.length).toFixed(4)) : 0,
      latencyP50: percentile(latencies, 50),
      latencyP90: percentile(latencies, 90),
    }
  })
}

function buildProviderComparison(provider: string, completeRows: AnalyticsEventRow[]) {
  const rows = completeRows.filter((row) => asString(properties(row).provider, 'unknown') === provider)
  const latencies = rows.map((row) => asNumber(properties(row).duration_ms)).filter(Boolean)
  const totalCost = rows.reduce((sum, row) => sum + asNumber(properties(row).cost_cny), 0)
  return {
    provider,
    calls: rows.length,
    successRate: ratio(rows.filter((row) => properties(row).success === true).length, rows.length),
    latencyP50: percentile(latencies, 50),
    latencyP90: percentile(latencies, 90),
    costPerCall: rows.length ? Number((totalCost / rows.length).toFixed(4)) : 0,
  }
}

function buildPaidFeatureRanking(rows: AnalyticsEventRow[]): PaidPotentialMetrics['featureRanking'] {
  const featureIds = [...new Set(rows.map((row) => asString(properties(row).feature_id)))]
  const featureStats = featureIds.map((feature_id) => {
    const featureRows = rows.filter((row) => properties(row).feature_id === feature_id)
    const attemptCount = featureRows.length
    const uniqueUserCount = new Set(featureRows.map(paidActorId)).size
    const shown = featureRows.filter((row) => properties(row).current_state === 'gate_shown').length
    const engaged = featureRows.filter((row) => properties(row).current_state === 'gate_engaged').length
    return {
      feature_id,
      attemptCount,
      uniqueUserCount,
      engagementRate: ratio(engaged, shown),
      score: 0,
    }
  })
  const maxAttemptCount = Math.max(1, ...featureStats.map((row) => row.attemptCount))
  const maxUniqueUserCount = Math.max(1, ...featureStats.map((row) => row.uniqueUserCount))
  return featureStats
    .map((row) => ({
      ...row,
      score: round1(100 * (
        0.4 * (row.attemptCount / maxAttemptCount)
        + 0.3 * (row.uniqueUserCount / maxUniqueUserCount)
        + 0.3 * row.engagementRate
      )),
    }))
    .sort((left, right) => (
      right.score - left.score
      || right.engagementRate - left.engagementRate
      || right.uniqueUserCount - left.uniqueUserCount
      || right.attemptCount - left.attemptCount
      || left.feature_id.localeCompare(right.feature_id)
    ))
}

function recencyScore(recentAttemptAt: string | null, now: Date) {
  if (!recentAttemptAt) return 0
  const recentTime = new Date(recentAttemptAt).getTime()
  if (!Number.isFinite(recentTime)) return 0
  const ageDays = Math.max(0, (now.getTime() - recentTime) / DAY_MS)
  if (ageDays <= 1) return 1
  if (ageDays <= 7) return 0.85
  if (ageDays <= 30) return 0.55
  if (ageDays <= 90) return 0.25
  return 0.05
}

function buildPaidIntentUsers(rows: AnalyticsEventRow[], now: Date): PaidPotentialMetrics['highIntentUsers'] {
  const rowsByActor = new Map<string, AnalyticsEventRow[]>()
  for (const row of rows) {
    const id = paidActorId(row)
    rowsByActor.set(id, [...(rowsByActor.get(id) ?? []), row])
  }
  return [...rowsByActor.entries()]
    .map(([user_id, actorRows]) => {
      const totalAttempts = actorRows.length
      const engagedCount = actorRows.filter((row) => properties(row).current_state === 'gate_engaged').length
      const featureDiversity = new Set(actorRows.map((row) => asString(properties(row).feature_id))).size
      const recentAttemptAt = actorRows
        .map((row) => row.server_ts)
        .filter(Boolean)
        .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null
      const frequencyScore = Math.min(totalAttempts, 12) / 12
      const engagementScore = Math.min(engagedCount, 5) / 5
      const diversityScore = Math.min(featureDiversity, 3) / 3
      const intentScore = round1(100 * (
        0.3 * frequencyScore
        + 0.35 * engagementScore
        + 0.2 * diversityScore
        + 0.15 * recencyScore(recentAttemptAt, now)
      ))
      return {
        user_id,
        intentScore,
        totalAttempts,
        engagedCount,
        featureDiversity,
        recentAttemptAt,
      }
    })
    .sort((left, right) => (
      right.intentScore - left.intentScore
      || right.engagedCount - left.engagedCount
      || right.totalAttempts - left.totalAttempts
      || new Date(right.recentAttemptAt ?? 0).getTime() - new Date(left.recentAttemptAt ?? 0).getTime()
    ))
    .slice(0, 50)
}

export function buildPaidPotentialMetrics(events: AnalyticsEventRow[], now = new Date()): PaidPotentialMetrics {
  const rows = events.filter((row) => row.event_type === 'paid_attempt')
  const userCounts = countBy(rows.map(paidActorId))
  const featureIds = [...new Set(rows.map((row) => asString(properties(row).feature_id)))]
  return {
    totalAttempts: rows.length,
    triggeredUsers: userCounts.size,
    highPotentialUsers: [...userCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([user_id, count]) => ({ user_id, count })),
    featureRanking: buildPaidFeatureRanking(rows),
    highIntentUsers: buildPaidIntentUsers(rows, now),
    perFeatureFunnel: featureIds.map((feature_id) => {
      const featureRows = rows.filter((row) => properties(row).feature_id === feature_id)
      const shown = featureRows.filter((row) => properties(row).current_state === 'gate_shown').length
      const dismissed = featureRows.filter((row) => properties(row).current_state === 'gate_dismissed').length
      const engaged = featureRows.filter((row) => properties(row).current_state === 'gate_engaged').length
      return {
        feature_id,
        shown,
        dismissed,
        engaged,
        dismissRate: ratio(dismissed, shown),
        engagementRate: ratio(engaged, shown),
        conversionRate: ratio(engaged, shown),
      }
    }),
    frequencyDistribution: mapToTopList(countBy([...userCounts.values()].map((count) => {
      if (count <= 1) return '1'
      if (count <= 3) return '2-3'
      if (count <= 6) return '4-6'
      return '7+'
    })), 4),
  }
}

export function buildOperationalCostMetrics(events: AnalyticsEventRow[]): OperationalCostMetrics {
  const screenshotRows = events.filter((row) => row.event_name === 'business.screenshot_recognize_complete')
  const userCounts = countBy(screenshotRows.map((row) => row.user_id ?? row.session_id))
  const totalCostCny = screenshotRows.reduce((sum, row) => sum + asNumber(properties(row).cost_cny), 0)
  return {
    screenshotCalls: screenshotRows.length,
    totalCostCny: Number(totalCostCny.toFixed(4)),
    dailyScreenshotCalls: dailySeries(screenshotRows, () => true),
    userCallFrequency: mapToTopList(countBy([...userCounts.values()].map((count) => {
      if (count <= 1) return '1'
      if (count <= 3) return '2-3'
      if (count <= 8) return '4-8'
      return '9+'
    })), 4),
    highUsageUsers: [...userCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10).map(([user_id, calls]) => ({ user_id, calls })),
  }
}

export function buildUserBehaviorMetrics(events: AnalyticsEventRow[]): UserBehaviorMetrics {
  return {
    mountainTop: mapToTopList(countBy(events.filter((row) => row.event_name === 'business.mountain_view').map((row) => asString(properties(row).mountain_id)))),
    trek: buildTrekCompletionMetrics(events),
    activityProof: mapToTopList(countBy(events.filter((row) => row.event_name === 'business.activity_create').map((row) => asString(properties(row).proof_status, 'unknown'))), 5),
    community: mapToTopList(countBy(events.filter((row) => row.event_name.startsWith('business.community_')).map((row) => row.event_name)), 5),
    shareTemplates: buildShareTemplateMetrics(events),
  }
}

function buildDashboardDeltas(currentEvents: AnalyticsEventRow[], previousEvents: AnalyticsEventRow[], rangeKey: AnalyticsRangeKey) {
  const previousOrNull = (value: number) => (rangeKey === 'all_time' ? null : value)
  const currentModel = buildModelEvaluationMetrics(currentEvents)
  const previousModel = buildModelEvaluationMetrics(previousEvents)
  const currentCost = buildOperationalCostMetrics(currentEvents)
  const previousCost = buildOperationalCostMetrics(previousEvents)
  const currentK = buildKFactorMetrics(currentEvents)
  const previousK = buildKFactorMetrics(previousEvents)
  return {
    totalEvents: metricDelta(currentEvents.length, previousOrNull(previousEvents.length)),
    totalSessions: metricDelta(uniqueCount(currentEvents.map((row) => row.session_id)), previousOrNull(uniqueCount(previousEvents.map((row) => row.session_id)))),
    totalUsers: metricDelta(uniqueCount(currentEvents.map((row) => row.user_id)), previousOrNull(uniqueCount(previousEvents.map((row) => row.user_id)))),
    registrations: metricDelta(
      currentEvents.filter((row) => row.event_name === 'auth.register_complete').length,
      previousOrNull(previousEvents.filter((row) => row.event_name === 'auth.register_complete').length),
    ),
    paidAttempts: metricDelta(
      currentEvents.filter((row) => row.event_type === 'paid_attempt').length,
      previousOrNull(previousEvents.filter((row) => row.event_type === 'paid_attempt').length),
    ),
    modelSuccessRate: metricDelta(currentModel.successRate, previousOrNull(previousModel.successRate)),
    operationalCost: metricDelta(currentCost.totalCostCny, previousOrNull(previousCost.totalCostCny)),
    kFactor: metricDelta(currentK.value, previousOrNull(previousK.value)),
  }
}

export function buildAnalyticsDashboardData(
  events: AnalyticsEventRow[],
  range: AnalyticsRangeKey | number = '30d',
  schemaReady = true,
  now = new Date(),
  cohort: AnalyticsCohortKey | string = 'all',
  fullHistory: AnalyticsEventRow[] = events,
): AnalyticsDashboardData {
  const rangeKey = normalizeAnalyticsRangeKey(range)
  const cohortKey = normalizeAnalyticsCohortKey(cohort)
  const option = getRangeOption(rangeKey)
  const cohortOption = getCohortOption(cohortKey)
  const currentEvents = partitionByCohort(filterEventsForAnalyticsRange(events, rangeKey, now), cohortKey, fullHistory, now)
  const previousEvents = partitionByCohort(previousEventsForAnalyticsRange(events, rangeKey, now), cohortKey, fullHistory, now)
  return {
    generatedAt: new Date().toISOString(),
    schemaReady,
    rangeKey,
    rangeLabel: option.label,
    rangeDays: option.days,
    cohortKey,
    cohortLabel: cohortOption.label,
    cohortActorCount: countCohortActors(currentEvents, cohortKey),
    cohortEventCount: currentEvents.length,
    deltas: buildDashboardDeltas(currentEvents, previousEvents, rangeKey),
    overview: buildOverviewMetrics(currentEvents),
    userBehavior: buildUserBehaviorMetrics(currentEvents),
    paidPotential: buildPaidPotentialMetrics(currentEvents, now),
    modelEvaluation: buildModelEvaluationMetrics(currentEvents),
    operationalCost: buildOperationalCostMetrics(currentEvents),
  }
}
