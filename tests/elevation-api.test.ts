import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fetchOpenMeteoElevation,
  shouldRefreshElevationLookup,
} from '../src/lib/elevation-api.ts'

test('fetchOpenMeteoElevation parses the first elevation value', async () => {
  const result = await fetchOpenMeteoElevation(
    { lat: 34.4869, lng: 110.0877 },
    {
      fetcher: (async (url: URL) => {
        assert.equal(url.hostname, 'api.open-meteo.com')
        assert.equal(url.searchParams.get('latitude'), '34.4869')
        assert.equal(url.searchParams.get('longitude'), '110.0877')
        return {
          ok: true,
          json: async () => ({ elevation: [1329.2] }),
        } as Response
      }) as typeof fetch,
    }
  )

  assert.deepEqual(result, { elevationM: 1329 })
})

test('fetchOpenMeteoElevation returns null for invalid coordinates and API failures', async () => {
  assert.deepEqual(await fetchOpenMeteoElevation({ lat: Number.NaN, lng: 110 }), { elevationM: null })

  const failed = await fetchOpenMeteoElevation(
    { lat: 34.4869, lng: 110.0877 },
    {
      fetcher: (async () => ({ ok: false, json: async () => ({}) }) as Response) as typeof fetch,
    }
  )
  assert.deepEqual(failed, { elevationM: null })
})

test('shouldRefreshElevationLookup refreshes only after movement threshold', () => {
  const distance = (_lat1: number, _lng1: number, lat2: number) => lat2

  assert.equal(shouldRefreshElevationLookup(null, { lat: 1, lng: 1 }, distance), true)
  assert.equal(shouldRefreshElevationLookup({ lat: 1, lng: 1 }, { lat: 49, lng: 1 }, distance), false)
  assert.equal(shouldRefreshElevationLookup({ lat: 1, lng: 1 }, { lat: 50, lng: 1 }, distance), true)
  assert.equal(shouldRefreshElevationLookup({ lat: 1, lng: 1 }, null, distance), false)
})
