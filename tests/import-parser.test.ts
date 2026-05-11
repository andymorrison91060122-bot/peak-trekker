import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadImportIndex() {
  return import(`../src/lib/import/index.${sourceExtension}`)
}

async function loadGpxParser() {
  return import(`../src/lib/import/gpx-parser.${sourceExtension}`)
}

async function loadKmlParser() {
  return import(`../src/lib/import/kml-parser.${sourceExtension}`)
}

async function loadFitParser() {
  return import(`../src/lib/import/fit-parser.${sourceExtension}`)
}

async function loadStats() {
  return import(`../src/lib/import/track-stats.${sourceExtension}`)
}

async function loadMatcher() {
  return import(`../src/lib/import/mountain-matcher.${sourceExtension}`)
}

const mockGpx = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Test Track</name><trkseg>
    <trkpt lat="30.0" lon="120.0"><ele>100</ele><time>2026-01-01T08:00:00Z</time></trkpt>
    <trkpt lat="30.001" lon="120.001"><ele>150</ele><time>2026-01-01T08:30:00Z</time></trkpt>
    <trkpt lat="30.002" lon="120.002"><ele>200</ele><time>2026-01-01T09:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

const mockKml = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>两步路轨迹</name>
    <Placemark><LineString><coordinates>
      120.0,30.0,100 120.001,30.001,150 120.002,30.002,200
    </coordinates></LineString></Placemark>
  </Document>
</kml>`

test('GPX parser extracts track points, name, and computed stats', async () => {
  const { parseGpx } = await loadGpxParser()
  const parsed = parseGpx(mockGpx, 'test-track.gpx')

  assert.equal(parsed.format, 'gpx')
  assert.equal(parsed.fileName, 'test-track.gpx')
  assert.equal(parsed.name, 'Test Track')
  assert.equal(parsed.trackPoints.length, 3)
  assert.deepEqual(parsed.trackPoints[0], {
    latitude: 30,
    longitude: 120,
    elevation: 100,
    timestamp: '2026-01-01T08:00:00Z',
  })
  assert.equal(parsed.elevationGainMeters, 100)
  assert.equal(parsed.elevationLossMeters, 0)
  assert.equal(parsed.durationSeconds, 3600)
  assert.equal(parsed.startTime, '2026-01-01T08:00:00Z')
  assert.equal(parsed.endTime, '2026-01-01T09:00:00Z')
  assert.ok((parsed.distanceMeters ?? 0) > 0)
})

test('KML parser reads longitude-latitude-elevation coordinate order', async () => {
  const { parseKml } = await loadKmlParser()
  const parsed = parseKml(mockKml, 'liangbulu.kml')

  assert.equal(parsed.format, 'kml')
  assert.equal(parsed.fileName, 'liangbulu.kml')
  assert.equal(parsed.name, '两步路轨迹')
  assert.equal(parsed.trackPoints.length, 3)
  assert.deepEqual(parsed.trackPoints[1], {
    latitude: 30.001,
    longitude: 120.001,
    elevation: 150,
  })
  assert.equal(parsed.elevationGainMeters, 100)
  assert.equal(parsed.elevationLossMeters, 0)
})

test('FIT parser normalizes semicircles and parsed FIT records', async () => {
  const { buildImportedFitDataFromParsedFit, semicirclesToDegrees } = await loadFitParser()
  const semicircleLat = Math.round(30 * (2 ** 31) / 180)
  const semicircleLng = Math.round(120 * (2 ** 31) / 180)

  assert.equal(Math.round(semicirclesToDegrees(semicircleLat)), 30)
  assert.equal(Math.round(semicirclesToDegrees(semicircleLng)), 120)

  const parsed = buildImportedFitDataFromParsedFit(
    {
      records: [
        {
          position_lat: semicircleLat,
          position_long: semicircleLng,
          altitude: 100,
          timestamp: '2026-01-01T08:00:00.000Z',
        },
        {
          position_lat: 30.001,
          position_long: 120.001,
          enhanced_altitude: 150,
          timestamp: '2026-01-01T08:30:00.000Z',
        },
      ],
      sessions: [
        {
          total_distance: 4567,
          total_elapsed_time: 1800,
          total_ascent: 50,
          total_descent: 0,
          max_altitude: 150,
          min_altitude: 100,
        },
      ],
    },
    'garmin.fit'
  )

  assert.equal(parsed.format, 'fit')
  assert.equal(parsed.trackPoints.length, 2)
  assert.equal(Math.round(parsed.trackPoints[0].latitude), 30)
  assert.equal(Math.round(parsed.trackPoints[0].longitude), 120)
  assert.equal(parsed.distanceMeters, 4567)
  assert.equal(parsed.durationSeconds, 1800)
  assert.equal(parsed.elevationGainMeters, 50)
})

test('track stats compute distance, elevation gain/loss, duration, and highest point', async () => {
  const {
    calculateDistance,
    calculateDuration,
    calculateElevationGain,
    findHighestTrackPoint,
  } = await loadStats()
  const points = [
    { latitude: 30, longitude: 120, elevation: 100, timestamp: '2026-01-01T08:00:00Z' },
    { latitude: 30.001, longitude: 120.001, elevation: 150, timestamp: '2026-01-01T08:10:00Z' },
    { latitude: 30.002, longitude: 120.002, elevation: 120, timestamp: '2026-01-01T08:20:00Z' },
    { latitude: 30.003, longitude: 120.003, elevation: 200, timestamp: '2026-01-01T08:30:00Z' },
  ]

  assert.ok(calculateDistance(points) > 400)
  assert.deepEqual(calculateElevationGain(points, { noiseThresholdMeters: 0 }), { gain: 130, loss: 30 })
  assert.equal(calculateDuration(points), 1800)
  assert.equal(findHighestTrackPoint(points)?.elevation, 200)
})

test('track stats provide server-side import metrics instead of trusting client values', async () => {
  const { buildComputedTrackStats } = await loadStats()
  const clientSuppliedMetrics = {
    distanceMeters: 99999,
    durationSeconds: 99999,
    elevationGainMeters: 99999,
    maxElevation: 99999,
  }
  const points = [
    { latitude: 30, longitude: 100, elevation: 3000, timestamp: '2026-01-01T08:00:00Z' },
    { latitude: 30.001, longitude: 100.001, elevation: 3500, timestamp: '2026-01-01T08:30:00Z' },
    { latitude: 30.002, longitude: 100.002, elevation: 3400, timestamp: '2026-01-01T09:00:00Z' },
  ]

  const computed = buildComputedTrackStats(points)

  assert.ok(computed.distanceMeters < clientSuppliedMetrics.distanceMeters)
  assert.equal(computed.durationSeconds, 3600)
  assert.equal(computed.elevationGainMeters, 500)
  assert.equal(computed.elevationLossMeters, 100)
  assert.equal(computed.maxElevation, 3500)
  assert.equal(computed.minElevation, 3000)
  assert.equal(computed.startTime, '2026-01-01T08:00:00Z')
  assert.equal(computed.endTime, '2026-01-01T09:00:00Z')
})

test('track stats provide import metrics when client sends only track points', async () => {
  const { buildComputedTrackStats } = await loadStats()
  const points = [
    { latitude: 30, longitude: 100, elevation: 3000, timestamp: '2026-01-01T08:00:00Z' },
    { latitude: 30.001, longitude: 100.001, elevation: 3200, timestamp: '2026-01-01T08:15:00Z' },
  ]

  const computed = buildComputedTrackStats(points)

  assert.ok(computed.distanceMeters > 0)
  assert.equal(computed.durationSeconds, 900)
  assert.equal(computed.elevationGainMeters, 200)
  assert.equal(computed.elevationLossMeters, 0)
  assert.equal(computed.maxElevation, 3200)
  assert.equal(computed.minElevation, 3000)
  assert.equal(computed.startTime, '2026-01-01T08:00:00Z')
  assert.equal(computed.endTime, '2026-01-01T08:15:00Z')
})

test('parseTrackFile routes by extension and rejects unsupported files', async () => {
  const { parseTrackFile } = await loadImportIndex()

  const parsed = await parseTrackFile('route.gpx', Buffer.from(mockGpx))
  assert.equal(parsed.format, 'gpx')

  await assert.rejects(
    () => parseTrackFile('route.txt', Buffer.from('nope')),
    /unsupported import format/i
  )
})

test('mountain matcher returns null for empty mountain lists and nearest match under 5km', async () => {
  const { matchNearestMountainFromRows } = await loadMatcher()
  const points = [
    { latitude: 30, longitude: 120, elevation: 100 },
    { latitude: 30.001, longitude: 120.001, elevation: 200 },
  ]

  assert.equal(matchNearestMountainFromRows(points, []), null)
  assert.deepEqual(matchNearestMountainFromRows(points, [
    { id: 'far', name: '远山', latitude: 31, longitude: 121 },
    { id: 'near', name: '近山', latitude: 30.0012, longitude: 120.0012 },
  ]), {
    id: 'near',
    name: '近山',
    distanceMeters: 29,
  })
})
