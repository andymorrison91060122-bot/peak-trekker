import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadTrackHash() {
  return import(`../src/lib/import/track-hash.${sourceExtension}`)
}

test('track content hash is deterministic across equivalent timestamps and floating noise', async () => {
  const { computeTrackContentHash } = await loadTrackHash()
  const first = computeTrackContentHash([
    { latitude: 30.1234564, longitude: 120.6543214, elevation: 100.4, timestamp: '2026-05-17T08:00:00+08:00' },
    { latitude: 30.2234564, longitude: 120.7543214, elevation: 130.4, timestamp: '2026-05-17T08:30:00+08:00' },
  ])
  const second = computeTrackContentHash([
    { latitude: 30.12345639, longitude: 120.65432139, elevation: 100.49, timestamp: '2026-05-17T00:00:00.000Z' },
    { latitude: 30.22345639, longitude: 120.75432139, elevation: 130.49, timestamp: '2026-05-17T00:30:00Z' },
  ])

  assert.equal(first, second)
})

test('track content hash sorts only fully timestamped tracks', async () => {
  const { computeTrackContentHash } = await loadTrackHash()
  const points = [
    { latitude: 30.1, longitude: 120.1, elevation: 100, timestamp: '2026-05-17T00:00:00Z' },
    { latitude: 30.2, longitude: 120.2, elevation: 120, timestamp: '2026-05-17T00:10:00Z' },
  ]

  assert.equal(computeTrackContentHash(points), computeTrackContentHash([...points].reverse()))

  const noTimePoints = points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    elevation: point.elevation,
  }))
  assert.notEqual(computeTrackContentHash(noTimePoints), computeTrackContentHash([...noTimePoints].reverse()))
})

test('missing timestamps normalize to an empty string and differ from timestamped tracks', async () => {
  const { computeTrackContentHash, normalizeTrackPointsForHash } = await loadTrackHash()
  const withoutTime = [
    { latitude: 30.1, longitude: 120.1, elevation: 100 },
    { latitude: 30.2, longitude: 120.2, elevation: 120, timestamp: '' },
  ]
  const withTime = [
    { latitude: 30.1, longitude: 120.1, elevation: 100, timestamp: '2026-05-17T00:00:00Z' },
    { latitude: 30.2, longitude: 120.2, elevation: 120, timestamp: '2026-05-17T00:10:00Z' },
  ]

  assert.deepEqual(normalizeTrackPointsForHash(withoutTime).map((point) => point.time), ['', ''])
  assert.notEqual(computeTrackContentHash(withoutTime), computeTrackContentHash(withTime))
})

test('track content hash supports one-point tracks and returns null for unusable coordinates', async () => {
  const { computeTrackContentHash } = await loadTrackHash()

  assert.match(
    computeTrackContentHash([{ latitude: 30, longitude: 120 }]) ?? '',
    /^[a-f0-9]{64}$/
  )
  assert.equal(computeTrackContentHash([]), null)
  assert.equal(computeTrackContentHash([{ latitude: Number.NaN, longitude: 120 }]), null)
})
