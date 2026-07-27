import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMountainRiskCopy,
  getEstimatedAscentMeters,
  getEstimatedDurationRange,
  getMountainAccessDisplay,
  getMountainDistanceKm,
  matchesMountainLengthBand,
} from '../src/lib/mountain-route-display.ts'

test('distance uses only a real non-expert length and never falls back to altitude', () => {
  assert.equal(getMountainDistanceKm({ difficulty: 'beginner', length_km: 7.4 }), 7.4)
  assert.equal(getMountainDistanceKm({ difficulty: 'intermediate', length_km: null }), null)
  assert.equal(getMountainDistanceKm({ difficulty: 'advanced', length_km: undefined }), null)
  assert.equal(getMountainDistanceKm({ difficulty: 'expert', length_km: 12 }), null)
})

test('length bands exclude unknown and expert distances while all keeps them', () => {
  assert.equal(matchesMountainLengthBand(null, 'all'), true)
  assert.equal(matchesMountainLengthBand(null, 'short'), false)
  assert.equal(matchesMountainLengthBand(7.9, 'short'), true)
  assert.equal(matchesMountainLengthBand(8, 'mid'), true)
  assert.equal(matchesMountainLengthBand(16, 'long'), true)
})

test('ascent estimates only beginner and intermediate mountains', () => {
  assert.equal(getEstimatedAscentMeters({ difficulty: 'beginner', altitude: 1864 }), 1268)
  assert.equal(getEstimatedAscentMeters({ difficulty: 'intermediate', altitude: 100 }), 320)
  assert.equal(getEstimatedAscentMeters({ difficulty: 'advanced', altitude: 5590 }), null)
  assert.equal(getEstimatedAscentMeters({ difficulty: 'expert', altitude: 7546 }), null)
})

test('duration reads minutes only and renders a whole-hour envelope', () => {
  assert.equal(
    getEstimatedDurationRange({
      difficulty: 'beginner',
      estimated_duration_minutes: 180,
    }),
    '3~4h',
  )
  assert.equal(
    getEstimatedDurationRange({
      difficulty: 'intermediate',
      estimated_duration_minutes: 210,
    }),
    '3~4h',
  )
  assert.equal(
    getEstimatedDurationRange({
      difficulty: 'beginner',
      estimated_duration_minutes: 480,
    }),
    '8~9h',
  )
  assert.equal(
    getEstimatedDurationRange({
      difficulty: 'advanced',
      estimated_duration_minutes: 180,
    }),
    null,
  )
  assert.equal(
    getEstimatedDurationRange({
      difficulty: 'beginner',
      estimated_duration_minutes: null,
    }),
    null,
  )
})

test('access display fails closed when status is missing or invalid', () => {
  assert.deepEqual(getMountainAccessDisplay('open'), {
    status: 'open',
    suitabilityLabel: null,
    ctaLabel: null,
    canStartTrek: true,
  })
  assert.deepEqual(getMountainAccessDisplay('closed'), {
    status: 'closed',
    suitabilityLabel: '当前不开放',
    ctaLabel: '暂不开放攀登',
    canStartTrek: false,
  })
  assert.deepEqual(getMountainAccessDisplay('pilgrimage_only'), {
    status: 'pilgrimage_only',
    suitabilityLabel: '仅开放转山路线',
    ctaLabel: '仅支持转山路线',
    canStartTrek: false,
  })
  assert.equal(getMountainAccessDisplay(undefined).status, 'unknown')
  assert.equal(getMountainAccessDisplay('unexpected').ctaLabel, '开放状态待确认')
})

test('advanced risk copy stays complete and always contains both mandatory warnings', () => {
  const source = '高海拔天气变化快，请结伴并准备撤退方案。'
  const copy = buildMountainRiskCopy('advanced', source)

  assert.match(copy ?? '', /高海拔天气变化快，请结伴并准备撤退方案。/)
  assert.match(copy ?? '', /自然保护区核心区及未开发未开放区域禁止擅自进入/)
  assert.match(copy ?? '', /开放范围以当地最新公告为准/)
  assert.equal(buildMountainRiskCopy('beginner', source), null)
})
