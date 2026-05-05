import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getWeatherForMountain } from '@/lib/weather/weather-service'
import { normalizeWeatherTier } from '@/lib/weather/tier-config'

type MountainWeatherRow = {
  id: string
  latitude: number | null
  longitude: number | null
  weather_priority_tier: string | null
  weather_enabled: boolean | null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ mountainId: string }> }
) {
  const { mountainId } = await context.params

  if (!mountainId) {
    return NextResponse.json({ error: 'mountainId required' }, { status: 400 })
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('mountains')
      .select('id, latitude, longitude, weather_priority_tier, weather_enabled')
      .eq('id', mountainId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'mountain not found' }, { status: 404 })
    }

    const mountain = data as MountainWeatherRow
    if (mountain.weather_enabled === false) {
      return NextResponse.json({ error: 'weather disabled' }, { status: 404 })
    }

    const latitude = Number(mountain.latitude)
    const longitude = Number(mountain.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: 'mountain coordinates missing' }, { status: 422 })
    }

    const weather = await getWeatherForMountain(
      mountain.id,
      latitude,
      longitude,
      normalizeWeatherTier(mountain.weather_priority_tier)
    )

    return NextResponse.json(weather)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'weather unavailable' },
      { status: 500 }
    )
  }
}
