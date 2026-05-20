export const MAP_TILES_BUCKET = 'map-tiles'
export const MAP_TILES_OBJECT_PATH = 'basemap/china-z7-20260519.pmtiles'
export const MAP_TILES_BUILD_DATE = '20260519'
export const MAP_TILES_MAX_ZOOM = 7
export const MAP_TILES_SIZE_BYTES = 21_346_537
export const MAP_TILES_BBOX = [73.5, 18.0, 135.1, 53.6] as const

export function getMapTilesPublicUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL for map tile public URL.')
  }

  return `${supabaseUrl}/storage/v1/object/public/${MAP_TILES_BUCKET}/${MAP_TILES_OBJECT_PATH}`
}

export function formatMapTilesSize(bytes = MAP_TILES_SIZE_BYTES) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
