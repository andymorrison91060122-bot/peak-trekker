import type { WeatherData, WeatherForecastDay } from './types'

type QWeatherNowResponse = {
  code?: string
  now?: {
    temp?: string | number
    feelsLike?: string | number
    humidity?: string | number
    windSpeed?: string | number
    windDir?: string
    text?: string
    icon?: string
    pressure?: string | number
  }
}

type QWeatherForecastResponse = {
  code?: string
  daily?: Array<{
    fxDate?: string
    tempMax?: string | number
    tempMin?: string | number
    textDay?: string
    iconDay?: string
    precip?: string | number
  }>
}

export async function fetchQWeatherWeather({
  latitude,
  longitude,
  apiKey = process.env.QWEATHER_API_KEY,
  fetchFn = fetch,
}: {
  latitude: number
  longitude: number
  apiKey?: string
  fetchFn?: typeof fetch
}): Promise<WeatherData> {
  if (!apiKey) {
    throw new Error('Missing QWEATHER_API_KEY.')
  }

  const location = `${longitude},${latitude}`
  const nowUrl = new URL('https://devapi.qweather.com/v7/weather/now')
  nowUrl.searchParams.set('location', location)
  nowUrl.searchParams.set('key', apiKey)

  const forecastUrl = new URL('https://devapi.qweather.com/v7/weather/3d')
  forecastUrl.searchParams.set('location', location)
  forecastUrl.searchParams.set('key', apiKey)

  const [nowResponse, forecastResponse] = await Promise.all([
    fetchJson<QWeatherNowResponse>(fetchFn, nowUrl),
    fetchJson<QWeatherForecastResponse>(fetchFn, forecastUrl),
  ])

  return parseQWeather({
    nowResponse,
    forecastResponse,
    fetchedAt: new Date().toISOString(),
  })
}

export function parseQWeather({
  nowResponse,
  forecastResponse,
  fetchedAt,
}: {
  nowResponse: QWeatherNowResponse
  forecastResponse: QWeatherForecastResponse
  fetchedAt: string
}): WeatherData {
  if (nowResponse.code && nowResponse.code !== '200') {
    throw new Error(`QWeather now API returned code ${nowResponse.code}.`)
  }

  if (forecastResponse.code && forecastResponse.code !== '200') {
    throw new Error(`QWeather forecast API returned code ${forecastResponse.code}.`)
  }

  const now = nowResponse.now
  if (!now) {
    throw new Error('QWeather now response missing now payload.')
  }

  const forecast = (forecastResponse.daily ?? []).slice(0, 3).map<WeatherForecastDay>((day) => ({
    date: requireString(day.fxDate, 'QWeather forecast date'),
    tempMax: numberFrom(day.tempMax, 'QWeather tempMax'),
    tempMin: numberFrom(day.tempMin, 'QWeather tempMin'),
    description: day.textDay ?? '天气信息',
    icon: day.iconDay ?? '',
    precipitation: numberFrom(day.precip ?? 0, 'QWeather precipitation'),
  }))

  return {
    provider: 'qweather',
    fetchedAt,
    current: {
      temperature: numberFrom(now.temp, 'QWeather temperature'),
      feelsLike: numberFrom(now.feelsLike, 'QWeather feelsLike'),
      humidity: numberFrom(now.humidity, 'QWeather humidity'),
      windSpeed: numberFrom(now.windSpeed, 'QWeather windSpeed'),
      windDirection: now.windDir ?? '',
      description: now.text ?? '天气信息',
      icon: now.icon ?? '',
      pressure: numberFrom(now.pressure, 'QWeather pressure'),
    },
    forecast,
  }
}

async function fetchJson<T>(fetchFn: typeof fetch, url: URL): Promise<T> {
  const response = await fetchFn(url)
  if (!response.ok) {
    throw new Error(`QWeather request failed with HTTP ${response.status}.`)
  }
  return await response.json() as T
}

function numberFrom(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} is not numeric.`)
  }
  return parsed
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is missing.`)
  }
  return value
}
