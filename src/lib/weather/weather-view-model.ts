import type { WeatherForecastDay, WeatherResponse } from './types'

export const WEATHER_TEMPERATURE_REVIEW_THRESHOLD_C = 0
export const WEATHER_TEMPERATURE_DANGER_THRESHOLD_C = -10
export const WEATHER_WIND_REVIEW_THRESHOLD_KMH = 29
export const WEATHER_WIND_DANGER_THRESHOLD_KMH = 50
export const WEATHER_PRECIP_REVIEW_THRESHOLD_MM = 1
export const WEATHER_PRECIP_DANGER_THRESHOLD_MM = 15
export const WEATHER_ALTITUDE_WEIGHTING_THRESHOLD_M = 3000
export const WEATHER_HIGH_ALTITUDE_REVIEW_THRESHOLD_M = 5000

const DESCRIPTION_REVIEW_KEYWORDS = ['雨夹雪', '大雾', '浓雾', '小雪', '小雨', '雾'] as const
const DESCRIPTION_DANGER_KEYWORDS = ['强风暴', '沙尘暴', '暴风雪', '雷阵雨', '雷暴', '暴雪', '雪暴', '中雪', '大雪', '冰雹'] as const

export type WeatherIconKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'wind'
export type DeparturePolicy = 'can_depart' | 'needs_evaluation' | 'not_recommended'
export type DepartureSeverity = 'ok' | 'review' | 'danger'
export type DepartureDimensionKey =
  | 'temperature'
  | 'wind'
  | 'precipitation'
  | 'description'
  | 'altitude'
  | 'stale'

export type DepartureDimensionResult = {
  severity: DepartureSeverity
  reasons: string[]
}

export type DeparturePolicyDimensions = Record<DepartureDimensionKey, DepartureDimensionResult>

export type DepartureWindowViewModel = {
  policy: DeparturePolicy
  label: '可出发' | '建议评估' | '不建议出发'
  tone: DepartureSeverity
  reasons: string[]
  dimensions: DeparturePolicyDimensions
}

export type WeatherForecastDayViewModel = {
  key: 'today' | 'tomorrow'
  label: '今日' | '明日'
  temperature: string
  description: string
  precipitation: string
}

export type WeatherKpiViewModel = {
  label: '风' | '降水'
  value: string
  sub: string
  tone: DepartureSeverity
}

export type WeatherRiskNoteViewModel = {
  tone: DepartureSeverity
  title: string
  body: string
}

export type DailyWeatherViewModel = {
  state: 'live' | 'stale'
  updateLabel: string
  staleHours: number | null
  providerLabel: string
  iconKind: WeatherIconKind
  current: {
    temperature: string
    feelsLike: string
    description: string
    altitude: string
  }
  departureWindow: DepartureWindowViewModel
  forecast: WeatherForecastDayViewModel[]
  kpis: WeatherKpiViewModel[]
  riskNote: WeatherRiskNoteViewModel
  footnote: string
}

type MountainWeatherContext = {
  altitude: number
}

export function buildDeparturePolicy({
  stale,
  feelsLike,
  windSpeed,
  precipitation,
  description,
  todayDescription,
  altitude,
}: {
  stale: boolean
  feelsLike: number | null | undefined
  windSpeed: number | null | undefined
  precipitation: number | null | undefined
  description: string | null | undefined
  todayDescription: string | null | undefined
  altitude: number | null | undefined
}): DepartureWindowViewModel {
  const naturalDimensions = {
    temperature: evaluateTemperature(feelsLike),
    wind: evaluateWindSpeed(windSpeed),
    precipitation: evaluatePrecipitation(precipitation),
    description: evaluateDescription(description, todayDescription),
  }

  const dimensions: DeparturePolicyDimensions = {
    ...naturalDimensions,
    altitude: evaluateAltitude(altitude, Object.values(naturalDimensions)),
    stale: evaluateStale(stale),
  }

  const tone = maxSeverity(Object.values(dimensions).map((dimension) => dimension.severity))
  const policy = severityToPolicy(tone)
  return {
    policy,
    label: policyToLabel(policy),
    tone,
    reasons: tone === 'ok' ? [] : collectReasonsForSeverity(dimensions, tone),
    dimensions,
  }
}

export function toDailyWeatherViewModel(
  response: WeatherResponse | null | undefined,
  mountain: MountainWeatherContext,
  now = new Date()
): DailyWeatherViewModel | null {
  if (!response?.current || !Array.isArray(response.forecast) || response.forecast.length === 0) {
    return null
  }

  const today = response.forecast[0]
  if (!today) return null

  const stale = response.stale === true
  const staleHours = stale ? getHoursSince(response.fetchedAt, now) : null
  const departureWindow = buildDeparturePolicy({
    stale,
    feelsLike: response.current.feelsLike,
    windSpeed: response.current.windSpeed,
    precipitation: today.precipitation,
    description: response.current.description,
    todayDescription: today.description,
    altitude: mountain.altitude,
  })

  return {
    state: stale ? 'stale' : 'live',
    updateLabel: stale
      ? `数据已 ${staleHours ?? 1} 小时未更新`
      : formatFreshUpdateLabel(response.fetchedAt, now),
    staleHours,
    providerLabel: formatProviderLabel(response.provider),
    iconKind: getWeatherIconKind(response.current.description, response.current.icon),
    current: {
      temperature: formatTemperature(response.current.temperature),
      feelsLike: `体感 ${formatTemperature(response.current.feelsLike)}`,
      description: response.current.description || '天气信息',
      altitude: `${formatInteger(mountain.altitude)}m`,
    },
    departureWindow,
    forecast: [
      formatForecastDay('today', today),
      formatForecastDay('tomorrow', response.forecast[1]),
    ],
    kpis: [
      {
        label: '风',
        value: formatWindSpeed(response.current.windSpeed),
        sub: response.current.windDirection || '风向待复核',
        tone: departureWindow.dimensions.wind.severity,
      },
      {
        label: '降水',
        value: formatPrecipitation(today.precipitation),
        sub: '今日预报',
        tone: departureWindow.dimensions.precipitation.severity,
      },
    ],
    riskNote: buildRiskNote(departureWindow, staleHours),
    footnote: '仅作决策参考 · Peak Trekker 不是专业天气产品',
  }
}

function buildRiskNote(
  departureWindow: DepartureWindowViewModel,
  staleHours: number | null
): WeatherRiskNoteViewModel {
  if (departureWindow.policy === 'not_recommended') {
    return {
      tone: 'danger',
      title: '天气风险过高',
      body: '当前窗口不适合直接出发，请改期或等待条件改善。',
    }
  }
  if (departureWindow.dimensions.stale.severity === 'review') {
    return {
      tone: 'review',
      title: `数据已 ${staleHours ?? 1} 小时未更新`,
      body: '出发前请通过其他渠道复核当前状况。',
    }
  }
  if (departureWindow.policy === 'needs_evaluation') {
    if (departureWindow.dimensions.temperature.severity === 'review') {
      return {
        tone: 'review',
        title: '低温条件需评估',
        body: '体感温度偏低，出发前请确认保暖、补给和回撤余量。',
      }
    }
    if (departureWindow.dimensions.wind.severity === 'review') {
      return {
        tone: 'review',
        title: '风速需评估',
        body: '山脊和垭口体感会更强，出发前请复核阵风预报。',
      }
    }
    if (departureWindow.dimensions.precipitation.severity === 'review') {
      return {
        tone: 'review',
        title: '降水需评估',
        body: '路面湿滑和节奏变化会更明显，建议保留回撤余量。',
      }
    }
    if (departureWindow.dimensions.description.severity === 'review') {
      return {
        tone: 'review',
        title: '天气现象需评估',
        body: '当前描述包含需复核的天气现象，出发前请确认局地变化。',
      }
    }
    if (departureWindow.dimensions.altitude.severity === 'review') {
      return {
        tone: 'review',
        title: '高海拔需评估',
        body: '高海拔环境放大天气变化，建议结合身体状态和装备再判断。',
      }
    }
    return {
      tone: 'review',
      title: '天气窗口需评估',
      body: '出发前请结合路线、装备和实时天气重新判断。',
    }
  }
  return {
    tone: 'ok',
    title: '天气窗口较稳',
    body: '山区天气变化快，出发前仍建议再复核一次。',
  }
}

function evaluateTemperature(feelsLike: number | null | undefined): DepartureDimensionResult {
  if (!isFiniteNumber(feelsLike)) return okDimension()
  if (feelsLike <= WEATHER_TEMPERATURE_DANGER_THRESHOLD_C) {
    return { severity: 'danger', reasons: ['体感≤-10°C'] }
  }
  if (feelsLike < WEATHER_TEMPERATURE_REVIEW_THRESHOLD_C) {
    return { severity: 'review', reasons: ['体感-10~0°C'] }
  }
  return okDimension()
}

function evaluateWindSpeed(windSpeed: number | null | undefined): DepartureDimensionResult {
  if (!isFiniteNumber(windSpeed)) return okDimension()
  if (windSpeed >= WEATHER_WIND_DANGER_THRESHOLD_KMH) {
    return { severity: 'danger', reasons: ['风速≥50 km/h'] }
  }
  if (windSpeed >= WEATHER_WIND_REVIEW_THRESHOLD_KMH) {
    return { severity: 'review', reasons: ['风速29-49 km/h'] }
  }
  return okDimension()
}

function evaluatePrecipitation(precipitation: number | null | undefined): DepartureDimensionResult {
  if (!isFiniteNumber(precipitation)) return okDimension()
  if (precipitation >= WEATHER_PRECIP_DANGER_THRESHOLD_MM) {
    return { severity: 'danger', reasons: ['降水≥15 mm'] }
  }
  if (precipitation >= WEATHER_PRECIP_REVIEW_THRESHOLD_MM) {
    return { severity: 'review', reasons: ['降水1-15 mm'] }
  }
  return okDimension()
}

function evaluateDescription(
  description: string | null | undefined,
  todayDescription: string | null | undefined
): DepartureDimensionResult {
  const text = `${description ?? ''} ${todayDescription ?? ''}`
  const dangerKeyword = DESCRIPTION_DANGER_KEYWORDS.find((keyword) => text.includes(keyword))
  if (dangerKeyword) return { severity: 'danger', reasons: [`描述含"${dangerKeyword}"`] }

  const reviewKeyword = DESCRIPTION_REVIEW_KEYWORDS.find((keyword) => text.includes(keyword))
  if (reviewKeyword) return { severity: 'review', reasons: [`描述含"${reviewKeyword}"`] }

  return okDimension()
}

function evaluateAltitude(
  altitude: number | null | undefined,
  naturalDimensions: DepartureDimensionResult[]
): DepartureDimensionResult {
  if (!isFiniteNumber(altitude)) return okDimension()
  if (altitude >= WEATHER_HIGH_ALTITUDE_REVIEW_THRESHOLD_M) {
    return { severity: 'review', reasons: ['海拔≥5000m默认建议评估'] }
  }
  if (
    altitude >= WEATHER_ALTITUDE_WEIGHTING_THRESHOLD_M &&
    naturalDimensions.some((dimension) => dimension.severity === 'review')
  ) {
    return { severity: 'danger', reasons: ['3000m以上中等天气风险升级'] }
  }
  return okDimension()
}

function evaluateStale(stale: boolean): DepartureDimensionResult {
  return stale ? { severity: 'review', reasons: ['数据已过期'] } : okDimension()
}

function okDimension(): DepartureDimensionResult {
  return { severity: 'ok', reasons: [] }
}

function maxSeverity(severities: DepartureSeverity[]): DepartureSeverity {
  return severities.reduce<DepartureSeverity>((max, severity) => (
    severityRank(severity) > severityRank(max) ? severity : max
  ), 'ok')
}

function collectReasonsForSeverity(
  dimensions: DeparturePolicyDimensions,
  severity: DepartureSeverity
) {
  return Object.values(dimensions).flatMap((dimension) => (
    dimension.severity === severity ? dimension.reasons : []
  ))
}

function severityRank(severity: DepartureSeverity) {
  if (severity === 'danger') return 2
  if (severity === 'review') return 1
  return 0
}

function severityToPolicy(severity: DepartureSeverity): DeparturePolicy {
  if (severity === 'danger') return 'not_recommended'
  if (severity === 'review') return 'needs_evaluation'
  return 'can_depart'
}

function policyToLabel(policy: DeparturePolicy): DepartureWindowViewModel['label'] {
  if (policy === 'not_recommended') return '不建议出发'
  if (policy === 'needs_evaluation') return '建议评估'
  return '可出发'
}

function formatForecastDay(
  key: WeatherForecastDayViewModel['key'],
  day: WeatherForecastDay | undefined
): WeatherForecastDayViewModel {
  const label = key === 'today' ? '今日' : '明日'
  if (!day) {
    return {
      key,
      label,
      temperature: '--',
      description: '暂未返回',
      precipitation: '--',
    }
  }

  return {
    key,
    label,
    temperature: `${formatTemperature(day.tempMax)} / ${formatTemperature(day.tempMin)}`,
    description: day.description || '天气信息',
    precipitation: formatPrecipitation(day.precipitation),
  }
}

function formatFreshUpdateLabel(fetchedAt: string, now: Date) {
  const time = Date.parse(fetchedAt)
  if (!Number.isFinite(time)) return '最近更新'

  const diffMinutes = Math.max(0, Math.floor((now.getTime() - time) / 60_000))
  if (diffMinutes < 60) return '更新于 1 小时内'

  const fetchedDate = new Date(time)
  if (isSameLocalDate(fetchedDate, now)) {
    return `今日已更新 · ${pad2(fetchedDate.getHours())}:${pad2(fetchedDate.getMinutes())}`
  }

  return `${fetchedDate.getMonth() + 1}月${fetchedDate.getDate()}日更新`
}

function getHoursSince(fetchedAt: string, now: Date) {
  const time = Date.parse(fetchedAt)
  if (!Number.isFinite(time)) return 1
  return Math.max(1, Math.ceil((now.getTime() - time) / 3_600_000))
}

function getWeatherIconKind(description?: string, icon?: string): WeatherIconKind {
  const text = `${description ?? ''} ${icon ?? ''}`.toLowerCase()
  if (text.includes('雪') || text.includes('snow')) return 'snow'
  if (text.includes('雨') || text.includes('rain') || text.includes('shower')) return 'rain'
  if (text.includes('风') || text.includes('wind')) return 'wind'
  if (text.includes('云') || text.includes('阴') || text.includes('cloud') || text.includes('overcast')) return 'cloud'
  return 'sun'
}

function formatProviderLabel(provider: WeatherResponse['provider']) {
  return provider === 'qweather' ? 'QWeather' : 'Open-Meteo'
}

function formatTemperature(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return '--'
  return `${Math.round(value)}°`
}

function formatWindSpeed(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return '--'
  return `${Math.round(value)} km/h`
}

function formatPrecipitation(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return '--'
  if (value === 0) return '0 mm'
  if (Math.abs(value) < 10 && !Number.isInteger(value)) return `${value.toFixed(1)} mm`
  return `${Math.round(value)} mm`
}

function formatInteger(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return '--'
  return String(Math.round(value))
}

function isSameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
