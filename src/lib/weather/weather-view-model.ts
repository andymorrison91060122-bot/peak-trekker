import type { WeatherForecastDay, WeatherResponse } from './types'

export const WEATHER_WIND_REVIEW_THRESHOLD_KMH = 39
export const WEATHER_PRECIP_REVIEW_THRESHOLD_MM = 5

export type WeatherIconKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'wind'

export type DepartureWindowViewModel = {
  label: '可出发' | '需复核'
  tone: 'ok' | 'review'
  reasons: Array<'stale' | 'wind' | 'precipitation'>
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
  tone: 'ok' | 'review'
}

export type WeatherRiskNoteViewModel = {
  tone: 'ok' | 'review'
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

export function buildDepartureWindow({
  stale,
  windSpeed,
  precipitation,
}: {
  stale: boolean
  windSpeed: number | null | undefined
  precipitation: number | null | undefined
}): DepartureWindowViewModel {
  const reasons: DepartureWindowViewModel['reasons'] = []
  if (stale) reasons.push('stale')
  if (isFiniteNumber(windSpeed) && windSpeed >= WEATHER_WIND_REVIEW_THRESHOLD_KMH) {
    reasons.push('wind')
  }
  if (isFiniteNumber(precipitation) && precipitation >= WEATHER_PRECIP_REVIEW_THRESHOLD_MM) {
    reasons.push('precipitation')
  }

  return reasons.length > 0
    ? { label: '需复核', tone: 'review', reasons }
    : { label: '可出发', tone: 'ok', reasons }
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
  const departureWindow = buildDepartureWindow({
    stale,
    windSpeed: response.current.windSpeed,
    precipitation: today.precipitation,
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
        tone: departureWindow.reasons.includes('wind') ? 'review' : 'ok',
      },
      {
        label: '降水',
        value: formatPrecipitation(today.precipitation),
        sub: '今日预报',
        tone: departureWindow.reasons.includes('precipitation') ? 'review' : 'ok',
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
  if (departureWindow.reasons.includes('stale')) {
    return {
      tone: 'review',
      title: `数据已 ${staleHours ?? 1} 小时未更新`,
      body: '出发前请通过其他渠道复核当前状况。',
    }
  }
  if (departureWindow.reasons.includes('wind') && departureWindow.reasons.includes('precipitation')) {
    return {
      tone: 'review',
      title: '风雨条件需复核',
      body: '风速和降水都偏高，建议重新判断出发窗口。',
    }
  }
  if (departureWindow.reasons.includes('wind')) {
    return {
      tone: 'review',
      title: '风速偏高',
      body: '山脊和垭口体感会更强，出发前请复核阵风预报。',
    }
  }
  if (departureWindow.reasons.includes('precipitation')) {
    return {
      tone: 'review',
      title: '降水偏高',
      body: '路面湿滑和节奏变化会更明显，建议保留回撤余量。',
    }
  }
  return {
    tone: 'ok',
    title: '天气窗口较稳',
    body: '山区天气变化快，出发前仍建议再复核一次。',
  }
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
