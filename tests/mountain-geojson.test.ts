import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

test('mountainsToGeoJson converts valid mountain rows into point features', async () => {
  const { mountainsToGeoJson } = await import(`../src/lib/map/mountain-geojson.${sourceExtension}`)

  const geojson = mountainsToGeoJson([
    {
      id: 'huashan',
      name: '华山',
      altitude: '2154',
      difficulty: 'hard',
      latitude: '34.4833',
      longitude: '110.0833',
    },
  ])

  assert.equal(geojson.type, 'FeatureCollection')
  assert.equal(geojson.features.length, 1)
  assert.deepEqual(geojson.features[0], {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [110.0833, 34.4833],
    },
    properties: {
      id: 'huashan',
      name: '华山',
      altitude: 2154,
      difficulty: 'hard',
    },
  })
})

test('mountainsToGeoJson skips rows without valid coordinates', async () => {
  const { mountainsToGeoJson } = await import(`../src/lib/map/mountain-geojson.${sourceExtension}`)

  const geojson = mountainsToGeoJson([
    {
      id: 'valid',
      name: '泰山',
      altitude: 1545,
      difficulty: 'medium',
      latitude: 36.255,
      longitude: 117.1,
    },
    {
      id: 'bad-latitude',
      name: '坏纬度',
      altitude: 1000,
      difficulty: 'easy',
      latitude: 120,
      longitude: 110,
    },
    {
      id: 'bad-longitude',
      name: '坏经度',
      altitude: 1000,
      difficulty: 'easy',
      latitude: 30,
      longitude: -190,
    },
    {
      id: null,
      name: '缺 id',
      altitude: 1000,
      difficulty: 'easy',
      latitude: 30,
      longitude: 110,
    },
  ])

  assert.equal(geojson.features.length, 1)
  assert.equal(geojson.features[0].properties.id, 'valid')
})

test('mountainsToGeoJson normalizes optional fields without leaking extra properties', async () => {
  const { mountainsToGeoJson } = await import(`../src/lib/map/mountain-geojson.${sourceExtension}`)

  const geojson = mountainsToGeoJson([
    {
      id: 42,
      name: '  ',
      altitude: 'not-a-number',
      difficulty: '  ',
      latitude: '23.5',
      longitude: '113.2',
      unexpected: 'private-field',
    } as never,
  ])

  assert.deepEqual(Object.keys(geojson.features[0].properties), ['id', 'name', 'altitude', 'difficulty'])
  assert.deepEqual(geojson.features[0].properties, {
    id: '42',
    name: '未命名山峰',
    altitude: null,
    difficulty: null,
  })
})
