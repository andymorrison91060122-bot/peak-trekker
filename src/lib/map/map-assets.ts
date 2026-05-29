export const MAP_TILES_BUCKET = 'map-tiles'

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

function withPublicUrl(asset: Omit<MapTileAsset, 'url'>): MapTileAsset {
  return {
    ...asset,
    url: getMapTilesPublicUrlForPath(asset.objectPath),
  }
}

export function getMountainPmtilesAsset(mountainId: string | null | undefined): MapTileAsset | null {
  if (!mountainId) return null
  const asset = MOUNTAIN_PMTILES_ASSETS[mountainId]
  return asset ? withPublicUrl(asset) : null
}

export function formatMapTilesSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
