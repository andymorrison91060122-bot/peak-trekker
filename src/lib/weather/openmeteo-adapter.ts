import type { WeatherData, WeatherForecastDay } from './types'

type OpenMeteoResponse = {
  current_weather?: {
    temperature?: number
    windspeed?: number
    winddirection?: number
    weathercode?: number
  }
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
    weathercode?: number[]
  }
}

const WEATHER_CODE_LABEL: Record<number, { description: string; icon: string }> = {
  0: { description: '晴', icon: 'clear' },
  1: { description: '少云', icon: 'mainly-clear' },
  2: { description: '局部多云', icon: 'partly-cloudy' },
  3: { description: '多云', icon: 'cloudy' },
  45: { description: '雾', icon: 'fog' },
  48: { description: '雾凇', icon: 'rime-fog' },
  51: { description: '小毛毛雨', icon: 'drizzle-light' },
  53: { description: '毛毛雨', icon: 'drizzle' },
  55: { description: '强毛毛雨', icon: 'drizzle-heavy' },
  61: { description: '小雨', icon: 'rain-light' },
  63: { description: '中雨', icon: 'rain' },
  65: { description: '大雨', icon: 'rain-heavy' },
  71: { description: '小雪', icon: 'snow-light' },
  73: { description: '中雪', icon: 'snow' },
  75: { description: '大雪', icon: 'snow-heavy' },
  80: { description: '阵雨', icon: 'showers-light' },
  81: { description: '阵雨', icon: 'showers' },
  82: { description: '强阵雨', icon: 'showers-heavy' },
  95: { description: '雷雨', icon: 'thunderstorm' },
}

export async function fetchOpenMeteoWeather({
  latitude,
  longitude,
  fetchFn = fetch,
}: {
  latitude: number
  longitude: number
  fetchFn?: typeof fetch
}): Promise<WeatherData> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current_weather', 'true')
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '3')

  const response = await fetchFn(url)
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with HTTP ${response.status}.`)
  }

  return parseOpenMeteoWeather({
    response: await response.json() as OpenMeteoResponse,
    fetchedAt: new Date().toISOString(),
  })
}

export function parseOpenMeteoWeather({
  response,
  fetchedAt,
}: {
  response: OpenMeteoResponse
  fetchedAt: string
}): WeatherData {
  const current = response.current_weather
  if (!current) {
    throw new Error('Open-Meteo response missing current_weather payload.')
  }

  const currentCode = Number(current.weathercode ?? -1)
  const currentLabel = weatherCodeLabel(currentCode)
  const daily = response.daily ?? {}
  const dates = daily.time ?? []

  const forecast = dates.slice(0, 3).map<WeatherForecastDay>((date, index) => {
    const code = Number(daily.weathercode?.[index] ?? -1)
    const label = weatherCodeLabel(code)
    return {
      date,
      tempMax: numberFrom(daily.temperature_2m_max?.[index], 'Open-Meteo tempMax'),
      tempMin: numberFrom(daily.temperature_2m_min?.[index], 'Open-Meteo tempMin'),
      description: label.description,
      icon: label.icon,
      precipitation: numberFrom(daily.precipitation_sum?.[index] ?? 0, 'Open-Meteo precipitation'),
    }
  })

  return {
    provider: 'openmeteo',
    fetchedAt,
    current: {
      temperature: numberFrom(current.temperature, 'Open-Meteo temperature'),
      feelsLike: numberFrom(current.temperature, 'Open-Meteo feelsLike'),
      humidity: 0,
      windSpeed: numberFrom(current.windspeed, 'Open-Meteo windspeed'),
      windDirection: windDirectionFromDegrees(numberFrom(current.winddirection, 'Open-Meteo winddirection')),
      description: currentLabel.description,
      icon: currentLabel.icon,
      pressure: 0,
    },
    forecast,
  }
}

function weatherCodeLabel(code: number) {
  return WEATHER_CODE_LABEL[code] ?? { description: '天气信息', icon: `wmo-${code}` }
}

export function windDirectionFromDegrees(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(normalized / 45) % directions.length]
}

function numberFrom(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} is not numeric.`)
  }
  return parsed
}
