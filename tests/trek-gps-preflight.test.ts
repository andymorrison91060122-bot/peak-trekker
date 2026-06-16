import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
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
