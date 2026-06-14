import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  SCREENSHOT_RECOGNITION_SOURCE,
  isScreenshotRecognitionSource,
  safeTrackPoints,
} from '../src/lib/trek-utils.ts'

test('screenshot recognition source predicate matches only the exact persisted source', () => {
  assert.equal(isScreenshotRecognitionSource(SCREENSHOT_RECOGNITION_SOURCE), true)

  for (const value of ['track_import', 'gps', 'uploaded', '', undefined, null]) {
    assert.equal(isScreenshotRecognitionSource(value), false, `${String(value)} should not be screenshot recognition`)
  }
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry) ? [path] : []
  })
}

test('source code uses the shared screenshot recognition predicate instead of literal boolean checks', () => {
  const hits = sourceFiles('src').flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return source.includes("=== 'screenshot_recognition'") ? [file] : []
  })

  assert.deepEqual(hits, [])
})

test('safeTrackPoints preserves point ids and capture sequence for offline replay', () => {
  const points = safeTrackPoints([
    {
      id: '11111111-1111-4111-8111-1111111111AA',
      lat: 30.1,
      lng: 120.1,
      accuracy: 8,
      altitude: 102,
      ts: 1710000000000,
      captureSeq: 7,
      extra: 'ignored',
    },
    {
      lat: 30.2,
      lng: 120.2,
      accuracy: 10,
      altitude: null,
      ts: 1710000005000,
    },
  ])

  assert.deepEqual(points, [
    {
      id: '11111111-1111-4111-8111-1111111111aa',
      lat: 30.1,
      lng: 120.1,
      accuracy: 8,
      altitude: 102,
      ts: 1710000000000,
      captureSeq: 7,
    },
    {
      lat: 30.2,
      lng: 120.2,
      accuracy: 10,
      altitude: null,
      ts: 1710000005000,
    },
  ])
})
