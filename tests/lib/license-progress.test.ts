import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import {
  buildLicenseProgressSummary,
  deriveLicenseLevelFromRecords,
  getRecommendedLicenseForDifficulty,
  maxLicenseLevel,
  type LicenseProgressRecord,
} from '../../src/lib/license-progress.ts'

function record(overrides: Partial<LicenseProgressRecord>): LicenseProgressRecord {
  return {
    mountainId: randomUUID(),
    difficulty: 'beginner',
    completionStatus: 'complete',
    verifiedAt: '2026-05-26T00:00:00.000Z',
    sourceType: 'realtime_gps',
    ...overrides,
  }
}

test('license derivation uses distinct valid GPS mountains and difficulty-or-higher thresholds', () => {
  const records = [
    record({ mountainId: 'a', difficulty: 'advanced' }),
    record({ mountainId: 'b', difficulty: 'expert' }),
    record({ mountainId: 'c', difficulty: 'advanced' }),
    record({ mountainId: 'c', difficulty: 'advanced' }),
    record({ mountainId: 'photo', difficulty: 'expert', sourceType: 'historical_photo' }),
    record({ mountainId: 'incomplete', difficulty: 'expert', completionStatus: 'incomplete' }),
    record({ mountainId: 'unverified', difficulty: 'expert', verifiedAt: null }),
  ]

  assert.equal(deriveLicenseLevelFromRecords(records), 'advanced')
})

test('license summary is monotonic and reports current target progress', () => {
  const records = [
    record({ mountainId: 'a', difficulty: 'intermediate' }),
    record({ mountainId: 'b', difficulty: 'beginner' }),
  ]
  const summary = buildLicenseProgressSummary({ storedLevel: 'basic', records })

  assert.equal(summary.effectiveLevel, 'basic')
  assert.equal(summary.nextLevel, 'intermediate')
  assert.equal(summary.targetDifficulty, 'intermediate')
  assert.equal(summary.qualifiedCount, 1)
  assert.equal(summary.remainingCount, 2)
})

test('maxLicenseLevel never downgrades stored profile tier', () => {
  assert.equal(maxLicenseLevel('advanced', 'basic'), 'advanced')
  assert.equal(maxLicenseLevel('none', 'intermediate'), 'intermediate')
})

test('difficulty advisory mapping preserves the existing four-value mountain model', () => {
  assert.equal(getRecommendedLicenseForDifficulty('beginner'), 'none')
  assert.equal(getRecommendedLicenseForDifficulty('intermediate'), 'basic')
  assert.equal(getRecommendedLicenseForDifficulty('advanced'), 'intermediate')
  assert.equal(getRecommendedLicenseForDifficulty('expert'), 'advanced')
})
