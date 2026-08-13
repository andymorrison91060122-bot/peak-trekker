import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sourceExtension = 'ts'

async function loadMapAssets() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  return import(`../src/lib/map/map-assets.${sourceExtension}`)
}

describe('map tile asset registry', () => {
  test('runtime registry is generated JSON rather than a hand-maintained object', () => {
    const source = readFileSync('src/lib/map/map-assets.ts', 'utf8')
    const registry = JSON.parse(
      readFileSync('src/generated/mountain-map-assets.json', 'utf8'),
    )

    assert.match(source, /generated\/mountain-map-assets\.json/)
    assert.doesNotMatch(source, /huashan-bbox30-z9-12\.pmtiles/)
    assert.equal(registry.schemaVersion, 'mountain-map-assets-v1')
    assert.equal(Object.keys(registry.assets).length, 196)
  })

  test('resolves Huashan production mountain-bbox asset', async () => {
    const { getMountainPmtilesAsset } = await loadMapAssets()

    const asset = getMountainPmtilesAsset('216508c9-ffca-4164-8010-534d8650ee64')

    assert.match(asset?.objectPath ?? '', /^mountains\/216508c9-ffca-4164-8010-534d8650ee64\//)
    assert.ok((asset?.minZoom ?? -1) >= 0)
    assert.ok((asset?.maxZoom ?? 16) <= 15)
    const bbox = asset?.bbox
    assert.equal(bbox?.length, 4)
    assert.ok((bbox?.[0] ?? 0) < (bbox?.[2] ?? 0))
    assert.ok((bbox?.[1] ?? 0) < (bbox?.[3] ?? 0))
    assert.ok((asset?.url ?? '').includes(`/map-tiles/${asset?.objectPath ?? ''}`))
  })

  test('returns null for mountains without a per-mountain PMTiles package', async () => {
    const { getMountainPmtilesAsset } = await loadMapAssets()

    assert.equal(getMountainPmtilesAsset('not-a-real-mountain'), null)
    assert.equal(getMountainPmtilesAsset(null), null)
  })

  test('formats per-mountain PMTiles package sizes', async () => {
    const { formatMapTilesSize } = await loadMapAssets()

    assert.equal(formatMapTilesSize(649_374), '0.6 MB')
  })
})
