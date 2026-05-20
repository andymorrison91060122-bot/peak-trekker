import { NextResponse } from 'next/server'
import { mountainsToGeoJson, type MountainGeoJsonRow } from '@/lib/map/mountain-geojson'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

const GEOJSON_CACHE_CONTROL = 'public, s-maxage=14400, stale-while-revalidate=86400'

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('mountains')
      .select('id,name,altitude,difficulty,latitude,longitude,is_active')
      .eq('is_active', true)
      .order('altitude', { ascending: false })

    if (error) {
      console.error('[mountains/geojson] failed to load mountains', error)
      return NextResponse.json({ error: 'mountains_geojson_failed' }, { status: 500 })
    }

    return NextResponse.json(mountainsToGeoJson((data ?? []) as MountainGeoJsonRow[]), {
      headers: {
        'Cache-Control': GEOJSON_CACHE_CONTROL,
      },
    })
  } catch (error) {
    console.error('[mountains/geojson] unexpected failure', error)
    return NextResponse.json({ error: 'mountains_geojson_failed' }, { status: 500 })
  }
}
