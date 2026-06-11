import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  SCREENSHOT_RECOGNITION_SOURCE,
  isScreenshotRecognitionSource,
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
