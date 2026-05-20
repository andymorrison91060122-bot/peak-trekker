export type MountainGeoJsonRow = {
  id: string | number | null
  name: string | null
  altitude: number | string | null
  difficulty: string | null
  latitude: number | string | null
  longitude: number | string | null
}

export type MountainFeatureProperties = {
  id: string
  name: string
  altitude: number | null
  difficulty: string | null
}

export type MountainPointFeature = {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: MountainFeatureProperties
}

export type MountainFeatureCollection = {
  type: 'FeatureCollection'
  features: MountainPointFeature[]
}

function toFiniteNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const normalized = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

function toValidCoordinate(value: number | string | null, min: number, max: number): number | null {
  const coordinate = toFiniteNumber(value)
  if (coordinate === null || coordinate < min || coordinate > max) return null
  return coordinate
}

export function mountainsToGeoJson(rows: MountainGeoJsonRow[]): MountainFeatureCollection {
  const features = rows.flatMap((row): MountainPointFeature[] => {
    const longitude = toValidCoordinate(row.longitude, -180, 180)
    const latitude = toValidCoordinate(row.latitude, -90, 90)
    const id = row.id === null ? '' : String(row.id)

    if (!id || longitude === null || latitude === null) {
      return []
    }

    return [{
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      properties: {
        id,
        name: row.name?.trim() || '未命名山峰',
        altitude: toFiniteNumber(row.altitude),
        difficulty: row.difficulty?.trim() || null,
      },
    }]
  })

  return {
    type: 'FeatureCollection',
    features,
  }
}
