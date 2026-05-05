import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { normalizeWeatherTier } from '@/lib/weather/tier-config'
import { refreshWeatherForMountain } from '@/lib/weather/weather-service'
import type { WeatherTier } from '@/lib/weather/types'

type ExpiredCacheRow = {
  mountain_id: string
  tier: string | null
  expires_at: string
}

type MountainRow = {
  id: string
  latitude: number | null
  longitude: number | null
  weather_priority_tier: string | null
  weather_enabled: boolean | null
}

const TIER_PRIORITY: Record<WeatherTier, number> = { S: 0, A: 1, B: 2, C: 3 }
const BATCH_LIMIT = 20
const CONCURRENCY = 3

export async function POST(request: Request) {
  const secret = process.env.WEATHER_REFRESH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'WEATHER_REFRESH_SECRET not configured' }, { status: 503 })
  }

  const expected = `Bearer ${secret}`
  if (request.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('weather_cache')
      .select('mountain_id, tier, expires_at')
      .lt('expires_at', new Date().toISOString())
      .in('tier', ['S', 'A', 'B'])
      .limit(BATCH_LIMIT)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const expiredRows = ((data ?? []) as ExpiredCacheRow[]).sort((a, b) => (
      TIER_PRIORITY[normalizeWeatherTier(a.tier)] - TIER_PRIORITY[normalizeWeatherTier(b.tier)]
    ))

    let refreshed = 0
    let failed = 0
    let skipped = 0
    const failures: Array<{ mountainId: string; error: string }> = []

    for (let index = 0; index < expiredRows.length; index += CONCURRENCY) {
      const chunk = expiredRows.slice(index, index + CONCURRENCY)
      const results = await Promise.allSettled(chunk.map(async (row) => {
        const { data: mountainData, error: mountainError } = await supabase
          .from('mountains')
          .select('id, latitude, longitude, weather_priority_tier, weather_enabled')
          .eq('id', row.mountain_id)
          .maybeSingle()

        if (mountainError) {
          throw new Error(mountainError.message)
        }

        if (!mountainData) {
          skipped += 1
          return
        }

        const mountain = mountainData as MountainRow
        if (mountain.weather_enabled === false) {
          skipped += 1
          return
        }

        const latitude = Number(mountain.latitude)
        const longitude = Number(mountain.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          skipped += 1
          return
        }

        await refreshWeatherForMountain({
          mountainId: mountain.id,
          latitude,
          longitude,
          tier: normalizeWeatherTier(mountain.weather_priority_tier ?? row.tier),
        })
        refreshed += 1
      }))

      results.forEach((result, resultIndex) => {
        if (result.status === 'rejected') {
          failed += 1
          failures.push({
            mountainId: chunk[resultIndex]?.mountain_id ?? 'unknown',
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          })
        }
      })
    }

    return NextResponse.json({
      ok: true,
      checked: expiredRows.length,
      refreshed,
      failed,
      skipped,
      failures,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'weather refresh failed' },
      { status: 500 }
    )
  }
}
