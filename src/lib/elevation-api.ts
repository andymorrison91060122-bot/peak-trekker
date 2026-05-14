export type ElevationLookupResult = {
  elevationM: number | null
}

export type ElevationCoordinate = {
  lat: number
  lng: number
}

function isUsableCoordinate(lat: unknown, lng: unknown) {
  const latitude = Number(lat)
  const longitude = Number(lng)
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
}

export function shouldRefreshElevationLookup(
  previous: ElevationCoordinate | null,
  next: ElevationCoordinate | null,
  distanceMeters: (lat1: number, lng1: number, lat2: number, lng2: number) => number,
  thresholdMeters = 50
) {
  if (!previous || !next) return Boolean(next)
  if (!isUsableCoordinate(previous.lat, previous.lng) || !isUsableCoordinate(next.lat, next.lng)) return false
  return distanceMeters(previous.lat, previous.lng, next.lat, next.lng) >= thresholdMeters
}

export async function fetchOpenMeteoElevation(
  coordinate: ElevationCoordinate | null | undefined,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}
): Promise<ElevationLookupResult> {
  if (!coordinate || !isUsableCoordinate(coordinate.lat, coordinate.lng)) {
    return { elevationM: null }
  }

  const fetcher = options.fetcher ?? fetch
  const url = new URL('https://api.open-meteo.com/v1/elevation')
  url.searchParams.set('latitude', String(coordinate.lat))
  url.searchParams.set('longitude', String(coordinate.lng))

  try {
    const response = await fetcher(url, { signal: options.signal })
    if (!response.ok) return { elevationM: null }
    const payload = (await response.json().catch(() => null)) as { elevation?: unknown } | null
    if (!payload || !Array.isArray(payload.elevation)) return { elevationM: null }
    const elevation = Number(payload.elevation[0])
    if (!Number.isFinite(elevation)) return { elevationM: null }
    return { elevationM: Math.round(elevation) }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error
    return { elevationM: null }
  }
}
