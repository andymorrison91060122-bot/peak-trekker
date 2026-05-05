import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { fetchOpenMeteoWeather } from './openmeteo-adapter'
import { fetchQWeatherWeather } from './qweather-adapter'
import {
  getWeatherForMountainWithDeps,
  normalizeWeatherTier,
  refreshWeatherCache,
  type CachedWeather,
  type WeatherCacheStore,
} from './weather-core'
import type { WeatherData, WeatherResponse, WeatherTier } from './types'

type WeatherCacheRow = {
  mountain_id: string
  provider: WeatherData['provider']
  tier: WeatherTier
  weather_data: WeatherData
  fetched_at: string
  expires_at: string
}

class SupabaseWeatherCacheStore implements WeatherCacheStore {
  private supabase = createSupabaseAdminClient()

  async get(mountainId: string): Promise<CachedWeather | null> {
    const { data, error } = await this.supabase
      .from('weather_cache')
      .select('mountain_id, provider, tier, weather_data, fetched_at, expires_at')
      .eq('mountain_id', mountainId)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) return null

    const row = data as WeatherCacheRow
    return {
      mountainId: row.mountain_id,
      tier: normalizeWeatherTier(row.tier),
      provider: row.provider,
      data: row.weather_data,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    }
  }

  async upsert(entry: {
    mountainId: string
    tier: WeatherTier
    provider: WeatherData['provider']
    data: WeatherData
    expiresAt: string
  }): Promise<void> {
    const { error } = await this.supabase
      .from('weather_cache')
      .upsert(
        {
          mountain_id: entry.mountainId,
          provider: entry.provider,
          tier: entry.tier,
          weather_data: entry.data,
          fetched_at: entry.data.fetchedAt,
          expires_at: entry.expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'mountain_id' }
      )

    if (error) {
      throw new Error(error.message)
    }
  }
}

export async function getWeatherForMountain(
  mountainId: string,
  latitude: number,
  longitude: number,
  tier: WeatherTier
): Promise<WeatherResponse> {
  return getWeatherForMountainWithDeps({
    mountainId,
    latitude,
    longitude,
    tier,
    cacheStore: new SupabaseWeatherCacheStore(),
    fetchQWeather: ({ latitude: lat, longitude: lon }) => fetchQWeatherWeather({ latitude: lat, longitude: lon }),
    fetchOpenMeteo: ({ latitude: lat, longitude: lon }) => fetchOpenMeteoWeather({ latitude: lat, longitude: lon }),
    refreshMode: 'background',
    onBackgroundRefreshError(error) {
      console.error('weather background refresh failed', error)
    },
  })
}

export async function refreshWeatherForMountain({
  mountainId,
  latitude,
  longitude,
  tier,
}: {
  mountainId: string
  latitude: number
  longitude: number
  tier: WeatherTier
}) {
  return refreshWeatherCache({
    mountainId,
    latitude,
    longitude,
    tier,
    cacheStore: new SupabaseWeatherCacheStore(),
    fetchQWeather: ({ latitude: lat, longitude: lon }) => fetchQWeatherWeather({ latitude: lat, longitude: lon }),
    fetchOpenMeteo: ({ latitude: lat, longitude: lon }) => fetchOpenMeteoWeather({ latitude: lat, longitude: lon }),
  })
}

export type { WeatherCacheStore } from './weather-core'
