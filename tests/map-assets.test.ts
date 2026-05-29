import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadMapAssets() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  return import(`../src/lib/map/map-assets.${sourceExtension}`)
}

describe('map tile asset registry', () => {
  test('resolves Huashan production mountain-bbox asset', async () => {
    const { getMountainPmtilesAsset } = await loadMapAssets()

    const asset = getMountainPmtilesAsset('216508c9-ffca-4164-8010-534d8650ee64')

    assert.equal(asset?.objectPath, 'basemap/huashan-bbox30-z9-12.pmtiles')
    assert.equal(asset?.minZoom, 9)
    assert.equal(asset?.maxZoom, 12)
    assert.deepEqual(asset?.bbox, [109.924223, 34.352153, 110.251177, 34.621647])
    assert.ok((asset?.url ?? '').endsWith('/map-tiles/basemap/huashan-bbox30-z9-12.pmtiles'))
  })

  test('returns null for mountains without a per-mountain PMTiles package', async () => {
    const { getMountainPmtilesAsset } = await loadMapAssets()

    assert.equal(getMountainPmtilesAsset('11e9d0e9-8355-41b4-bc15-0b7e99d43c96'), null)
    assert.equal(getMountainPmtilesAsset(null), null)
  })

  test('formats per-mountain PMTiles package sizes', async () => {
    const { formatMapTilesSize } = await loadMapAssets()

    assert.equal(formatMapTilesSize(649_374), '0.6 MB')
  })
})
