export const MAP_TILES_BUCKET = 'map-tiles'
// The z=7 national PMTiles package is retained for debug/prototype surfaces only.
// Activity Detail falls back to trace-only when a mountain-bbox asset is missing or fails.
export const MAP_TILES_OBJECT_PATH = 'basemap/china-z7-20260519.pmtiles'
export const MAP_TILES_BUILD_DATE = '20260519'
export const MAP_TILES_MAX_ZOOM = 7
export const MAP_TILES_SIZE_BYTES = 21_346_537
export const MAP_TILES_BBOX = [73.5, 18.0, 135.1, 53.6] as const

export type MapTileFlavor = 'dark' | 'light' | 'black' | 'grayscale' | 'white'

export type MapTileBbox = readonly [number, number, number, number]

export type MapTileAsset = {
  id: string
  objectPath: string
  url: string
  minZoom: number
  maxZoom: number
  bbox: MapTileBbox
  flavor: MapTileFlavor
  sizeBytes?: number
}

export const NATIONAL_MAP_TILE_ASSET = {
  id: 'china-z7-20260519',
  objectPath: MAP_TILES_OBJECT_PATH,
  minZoom: 2,
  maxZoom: MAP_TILES_MAX_ZOOM,
  bbox: MAP_TILES_BBOX,
  flavor: 'dark' as const,
  sizeBytes: MAP_TILES_SIZE_BYTES,
}

const MOUNTAIN_PMTILES_ASSETS: Record<string, Omit<MapTileAsset, 'url'>> = {
  '216508c9-ffca-4164-8010-534d8650ee64': {
    id: 'huashan-bbox30-z9-12',
    objectPath: 'basemap/huashan-bbox30-z9-12.pmtiles',
    minZoom: 9,
    maxZoom: 12,
    bbox: [109.924223, 34.352153, 110.251177, 34.621647],
    flavor: 'dark',
    sizeBytes: 649_374,
  },
}

export function getMapTilesPublicUrlForPath(objectPath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL for map tile public URL.')
  }

  return `${supabaseUrl}/storage/v1/object/public/${MAP_TILES_BUCKET}/${objectPath}`
}

export function getMapTilesPublicUrl() {
  return getMapTilesPublicUrlForPath(MAP_TILES_OBJECT_PATH)
}

function withPublicUrl(asset: Omit<MapTileAsset, 'url'>): MapTileAsset {
  return {
    ...asset,
    url: getMapTilesPublicUrlForPath(asset.objectPath),
  }
}

export function getNationalMapTilesAsset(): MapTileAsset {
  return withPublicUrl(NATIONAL_MAP_TILE_ASSET)
}

export function getMountainPmtilesAsset(mountainId: string | null | undefined): MapTileAsset | null {
  if (!mountainId) return null
  const asset = MOUNTAIN_PMTILES_ASSETS[mountainId]
  return asset ? withPublicUrl(asset) : null
}

export function formatMapTilesSize(bytes = MAP_TILES_SIZE_BYTES) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
