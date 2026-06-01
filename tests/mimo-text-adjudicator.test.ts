import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adjudicateField,
  parseDateCandidate,
  parseDurationCandidate,
  type EvidenceCandidate,
} from '../scripts/mimo-v25-text-generalization.ts'

function candidate(raw: string, labelRaw: string, unitRaw = ''): EvidenceCandidate {
  return {
    raw,
    labelRaw,
    unitRaw,
    bbox: null,
    sourceKind: 'metric_label',
    visibility: 'visible',
    confidence: 0.95,
    reason: null,
  }
}

test('duration parsing trusts raw time text instead of model arithmetic', () => {
  assert.equal(parseDurationCandidate('3:34:19', '运动时间').value, 3 * 3600 + 34 * 60 + 19)
  assert.equal(parseDurationCandidate("6:42'54", '运动时长').value, 6 * 3600 + 42 * 60 + 54)
  assert.equal(parseDurationCandidate('48:44', '运动时间').value, 48 * 60 + 44)
  assert.equal(parseDurationCandidate('3:12', '全程耗时').value, 3 * 3600 + 12 * 60)
  assert.equal(parseDurationCandidate('19:34', '预计耗时').value, 19 * 3600 + 34 * 60)
  assert.equal(parseDurationCandidate('19:34').value, 19 * 3600 + 34 * 60)
})

test('partial dates stay partial when no year is visible', () => {
  assert.deepEqual(parseDateCandidate('3月22日 07:04'), { value: '03-22 07:04', hints: ['partial date'] })
  assert.deepEqual(parseDateCandidate('4月15日 @ 下午8:48'), { value: '04-15 20:48', hints: ['partial date'] })
  assert.deepEqual(parseDateCandidate('2026.05.31 13:14'), { value: '2026-05-31', hints: [] })
  assert.deepEqual(parseDateCandidate('12.03.2026'), { value: '2026-03-12', hints: [] })
})

test('speed and pace candidates are not cross-promoted', () => {
  const speedFromPace = adjudicateField('speedKmh', [candidate('06\'13"', '平均配速', '/公里')])
  assert.equal(speedFromPace.value, null)
  assert.ok(speedFromPace.hints.some((hint) => hint.includes('pace is not speed')))

  const paceFromSpeed = adjudicateField('paceMinPerKm', [candidate('8.7', '平均速度', 'km/h')])
  assert.equal(paceFromSpeed.value, null)
  assert.ok(paceFromSpeed.hints.some((hint) => hint.includes('speed is not pace')))
})

test('elevation and cumulative gain candidates require compatible labels', () => {
  const elevationFromGain = adjudicateField('elevationMeters', [candidate('544', '累计上升', 'm')])
  assert.equal(elevationFromGain.value, null)
  assert.ok(elevationFromGain.hints.some((hint) => hint.includes('gain label is not elevation')))

  const gainFromElevation = adjudicateField('elevationGainMeters', [candidate('373', '最高海拔', '米')])
  assert.equal(gainFromElevation.value, null)
  assert.ok(gainFromElevation.hints.some((hint) => hint.includes('elevation label is not gain')))
})
