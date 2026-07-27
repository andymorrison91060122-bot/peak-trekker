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
    return NextResponse.json({ error: '天气暂时不可用。' }, { status: 400 })
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('mountains')
      .select('id, latitude, longitude, weather_priority_tier, weather_enabled')
      .eq('id', mountainId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error('[weather] mountain lookup failed', error)
      return NextResponse.json({ error: '天气暂时不可用。' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: '天气暂时不可用。' }, { status: 404 })
    }

    const mountain = data as MountainWeatherRow
    if (mountain.weather_enabled === false) {
      return NextResponse.json({ error: '天气暂时不可用。' }, { status: 404 })
    }

    const latitude = Number(mountain.latitude)
    const longitude = Number(mountain.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: '天气暂时不可用。' }, { status: 422 })
    }

    const weather = await getWeatherForMountain(
      mountain.id,
      latitude,
      longitude,
      normalizeWeatherTier(mountain.weather_priority_tier)
    )

    return NextResponse.json(weather)
  } catch (error) {
    console.error('[weather] weather lookup failed', error)
    return NextResponse.json(
      { error: '天气暂时不可用。' },
      { status: 500 }
    )
  }
}
