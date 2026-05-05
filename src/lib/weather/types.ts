export type WeatherProvider = 'qweather' | 'openmeteo'
export type WeatherTier = 'S' | 'A' | 'B' | 'C'

export interface WeatherCurrent {
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  windDirection: string
  description: string
  icon: string
  pressure: number
}

export interface WeatherForecastDay {
  date: string
  tempMax: number
  tempMin: number
  description: string
  icon: string
  precipitation: number
}

export interface WeatherData {
  current: WeatherCurrent
  forecast: WeatherForecastDay[]
  provider: WeatherProvider
  fetchedAt: string
}

export interface WeatherCacheEntry {
  mountainId: string
  tier: WeatherTier
  data: WeatherData
  expiresAt: string
}

export type WeatherResponse = WeatherData & {
  mountainId: string
  tier: WeatherTier
  expiresAt: string
  stale?: boolean
  refreshError?: string
}
