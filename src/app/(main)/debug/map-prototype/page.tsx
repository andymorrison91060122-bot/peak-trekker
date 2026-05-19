import { redirect } from 'next/navigation'
import MapPrototypeClient from '@/components/map/MapPrototypeClient'
import { canAccessOnboardingDebugTools } from '@/lib/onboarding-debug'
import {
  formatMapTilesSize,
  getMapTilesPublicUrl,
  MAP_TILES_BUILD_DATE,
  MAP_TILES_MAX_ZOOM,
  MAP_TILES_OBJECT_PATH,
  MAP_TILES_SIZE_BYTES,
} from '@/lib/map/map-assets'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function MapPrototypePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/debug/map-prototype')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const canAccess = canAccessOnboardingDebugTools({
    email: user.email,
    isAdmin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
  })

  if (!canAccess) {
    redirect('/profile')
  }

  return (
    <MapPrototypeClient
      tileUrl={getMapTilesPublicUrl()}
      tileObjectPath={MAP_TILES_OBJECT_PATH}
      tileSizeLabel={formatMapTilesSize(MAP_TILES_SIZE_BYTES)}
      tileMaxZoom={MAP_TILES_MAX_ZOOM}
      buildDate={MAP_TILES_BUILD_DATE}
    />
  )
}
