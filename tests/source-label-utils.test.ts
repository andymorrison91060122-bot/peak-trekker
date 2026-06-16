import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/lib/source-label-utils.ts', 'utf8')

describe('source label type mapping', () => {
  it('keeps GPS VERIFIED exclusive to realtime GPS records in the static mapping', () => {
    const gpsBlock = source.match(/case 'realtime_gps':[\s\S]*?return 'gps_verified'/)?.[0] ?? ''
    const uploadedBlock = source.match(/case 'track_import':[\s\S]*?return 'uploaded'/)?.[0] ?? ''

    assert.match(gpsBlock, /case 'realtime_gps':/)
    assert.doesNotMatch(gpsBlock, /case 'historical_photo':/)
    assert.match(uploadedBlock, /case 'historical_photo':/)
    assert.match(uploadedBlock, /case SCREENSHOT_RECOGNITION_SOURCE:/)
  })
})
