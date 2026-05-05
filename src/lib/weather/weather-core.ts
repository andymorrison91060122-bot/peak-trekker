import type { WeatherData, WeatherProvider, WeatherResponse, WeatherTier } from './types'

export const TIER_CONFIG = {
  S: { refreshIntervalMs: 1 * 60 * 60 * 1000 },
  A: { refreshIntervalMs: 6 * 60 * 60 * 1000 },
  B: { refreshIntervalMs: 24 * 60 * 60 * 1000 },
  C: { refreshIntervalMs: 24 * 60 * 60 * 1000 },
} as const satisfies Record<WeatherTier, { refreshIntervalMs: number }>

export type CachedWeather = {
  mountainId: string
  tier: WeatherTier
  provider: WeatherProvider
  data: WeatherData
  fetchedAt: string
  expiresAt: string
}

export type WeatherCacheStore = {
  get(mountainId: string): Promise<CachedWeather | null>
  upsert(entry: {
    mountainId: string
    tier: WeatherTier
    provider: WeatherProvider
    data: WeatherData
    expiresAt: string
  }): Promise<void>
}

export type WeatherFetchDeps = {
  fetchQWeather: (input: { latitude: number; longitude: number }) => Promise<WeatherData>
  fetchOpenMeteo: (input: { latitude: number; longitude: number }) => Promise<WeatherData>
}

export type GetWeatherDeps = WeatherFetchDeps & {
  mountainId: string
  latitude: number
  longitude: number
  tier: WeatherTier
  cacheStore: WeatherCacheStore
  now?: Date
  refreshMode?: 'blocking' | 'background'
  onBackgroundRefreshError?: (error: unknown) => void
}

export function normalizeWeatherTier(value: unknown): WeatherTier {
  return value === 'S' || value === 'A' || value === 'B' || value === 'C' ? value : 'C'
}

export function getWeatherExpiresAt(tier: WeatherTier, now = new Date()) {
  return new Date(now.getTime() + TIER_CONFIG[tier].refreshIntervalMs).toISOString()
}

export function isWeatherCacheFresh(cache: Pick<CachedWeather, 'expiresAt'>, now = new Date()) {
  const expiresAt = Date.parse(cache.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

export async function getWeatherForMountainWithDeps({
  mountainId,
  latitude,
  longitude,
  tier,
  cacheStore,
  fetchQWeather,
  fetchOpenMeteo,
  now = new Date(),
  refreshMode = 'blocking',
  onBackgroundRefreshError,
}: GetWeatherDeps): Promise<WeatherResponse> {
  const cache = await cacheStore.get(mountainId)

  if (cache && isWeatherCacheFresh(cache, now)) {
    return buildWeatherResponse({
      mountainId,
      tier: normalizeWeatherTier(cache.tier),
      cache,
    })
  }

  if (cache && refreshMode === 'background') {
    void refreshWeatherCache({
      mountainId,
      latitude,
      longitude,
      tier,
      cacheStore,
      fetchQWeather,
      fetchOpenMeteo,
      now,
    }).catch((error) => {
      onBackgroundRefreshError?.(error)
    })

    return buildWeatherResponse({
      mountainId,
      tier: normalizeWeatherTier(cache.tier),
      cache,
      stale: true,
    })
  }

  try {
    return await refreshWeatherCache({
      mountainId,
      latitude,
      longitude,
      tier,
      cacheStore,
      fetchQWeather,
      fetchOpenMeteo,
      now,
    })
  } catch (error) {
    if (cache) {
      return buildWeatherResponse({
        mountainId,
        tier: normalizeWeatherTier(cache.tier),
        cache,
        stale: true,
        refreshError: error instanceof Error ? error.message : 'weather refresh failed',
      })
    }
    throw error
  }
}

export async function refreshWeatherCache({
  mountainId,
  latitude,
  longitude,
  tier,
  cacheStore,
  fetchQWeather,
  fetchOpenMeteo,
  now = new Date(),
}: Omit<GetWeatherDeps, 'refreshMode' | 'onBackgroundRefreshError'>): Promise<WeatherResponse> {
  const weather = await fetchWeatherWithFallback({
    latitude,
    longitude,
    fetchQWeather,
    fetchOpenMeteo,
  })
  const expiresAt = getWeatherExpiresAt(tier, now)

  await cacheStore.upsert({
    mountainId,
    tier,
    provider: weather.provider,
    data: weather,
    expiresAt,
  })

  return {
    ...weather,
    mountainId,
    tier,
    expiresAt,
  }
}

export async function fetchWeatherWithFallback({
  latitude,
  longitude,
  fetchQWeather,
  fetchOpenMeteo,
}: WeatherFetchDeps & { latitude: number; longitude: number }) {
  try {
    return await fetchQWeather({ latitude, longitude })
  } catch (qweatherError) {
    try {
      return await fetchOpenMeteo({ latitude, longitude })
    } catch (openMeteoError) {
      const qweatherMessage = qweatherError instanceof Error ? qweatherError.message : String(qweatherError)
      const openMeteoMessage = openMeteoError instanceof Error ? openMeteoError.message : String(openMeteoError)
      throw new Error(`weather providers failed: qweather=${qweatherMessage}; openmeteo=${openMeteoMessage}`)
    }
  }
}

function buildWeatherResponse({
  mountainId,
  tier,
  cache,
  stale,
  refreshError,
}: {
  mountainId: string
  tier: WeatherTier
  cache: CachedWeather
  stale?: boolean
  refreshError?: string
}): WeatherResponse {
  return {
    ...cache.data,
    mountainId,
    tier,
    expiresAt: cache.expiresAt,
    ...(stale ? { stale: true } : {}),
    ...(refreshError ? { refreshError } : {}),
  }
}
