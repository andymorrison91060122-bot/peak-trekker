import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLateProofHref,
  classifyPrepGpsAccuracy,
  TREK_PREP_GPS_READY_ACCURACY_M,
} from '../src/lib/trek-gps-preflight.ts'
import {
  isTrekClientTestModeEnabled,
  resolveTrekClientVerificationRules,
} from '../src/lib/trek-verification-rules.ts'

describe('trek gps preflight helpers', () => {
  it('classifies ready gps accuracy at or below the threshold', () => {
    assert.equal(classifyPrepGpsAccuracy(12), 'ready')
    assert.equal(classifyPrepGpsAccuracy(TREK_PREP_GPS_READY_ACCURACY_M), 'ready')
  })

  it('classifies weak gps accuracy above the threshold', () => {
    assert.equal(classifyPrepGpsAccuracy(TREK_PREP_GPS_READY_ACCURACY_M + 1), 'weak')
  })

  it('classifies invalid accuracy as unavailable', () => {
    assert.equal(classifyPrepGpsAccuracy(undefined), 'unavailable')
    assert.equal(classifyPrepGpsAccuracy(Number.NaN), 'unavailable')
    assert.equal(classifyPrepGpsAccuracy(0), 'unavailable')
  })

  it('builds encoded late-proof href for skipped gps flow', () => {
    const href = buildLateProofHref({
      id: 'mountain-1',
      name: '泰山 · 南天门',
      altitude: 1545.4,
    })

    assert.equal(
      href,
      '/late-proof?mountainId=mountain-1&mountainName=%E6%B3%B0%E5%B1%B1+%C2%B7+%E5%8D%97%E5%A4%A9%E9%97%A8&altitude=1545'
    )
  })

  it('falls back to explore when no mountain is available', () => {
    assert.equal(buildLateProofHref(null), '/explore')
  })

  it('enables dev verification thresholds only outside production', () => {
    const params = new URLSearchParams('testMode=1')
    assert.equal(isTrekClientTestModeEnabled(params, { nodeEnv: 'development' }), true)
    assert.equal(isTrekClientTestModeEnabled(params, { nodeEnv: 'production' }), false)

    assert.deepEqual(
      resolveTrekClientVerificationRules({
        testMode: true,
        env: {
          nodeEnv: 'development',
          publicMinTrackPoints: '2',
          publicMinSessionSeconds: '11',
        },
      }),
      {
        minTrackPoints: 2,
        minSessionSeconds: 11,
      }
    )

    assert.deepEqual(
      resolveTrekClientVerificationRules({
        testMode: true,
        env: {
          nodeEnv: 'production',
          publicMinTrackPoints: '1',
          publicMinSessionSeconds: '10',
        },
      }),
      {
        minTrackPoints: 8,
        minSessionSeconds: 90,
      }
    )
  })
})
