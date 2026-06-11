import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isDisplayableTrackName,
  resolveCheckinDisplayTitle,
} from '../src/lib/checkin-display-title.ts'

test('mountain name takes precedence over any track name', () => {
  const resolved = resolveCheckinDisplayTitle({
    mountainName: '泰山',
    trackName: '阳江市',
  })

  assert.equal(resolved.title, '泰山')
  assert.equal(resolved.titleSource, 'mountain')
  assert.equal(resolved.unmatchedTag, null)
})

test('unmatched rows use displayable track_name before fallback', () => {
  const resolved = resolveCheckinDisplayTitle({
    mountainName: null,
    trackName: '阳江市',
  })

  assert.equal(resolved.title, '阳江市')
  assert.equal(resolved.titleSource, 'track_name')
  assert.equal(resolved.unmatchedTag, '未关联')
  assert.equal(resolved.secondaryLocation, '未关联山峰')
})

test('generic defaults are rejected as display titles', () => {
  for (const trackName of ['截图识别活动', '未命名山行', '未关联山行', '未关联山峰', '未知地点']) {
    const resolved = resolveCheckinDisplayTitle({
      mountainName: null,
      trackName,
    })

    assert.equal(resolved.title, '未关联山行')
    assert.equal(resolved.titleSource, 'fallback')
  }
})

test('fallback title can be overridden by share/poster surfaces', () => {
  const resolved = resolveCheckinDisplayTitle({
    mountainName: null,
    trackName: '截图识别活动',
    fallbackTitle: '未知山峰',
  })

  assert.equal(resolved.title, '未知山峰')
  assert.equal(resolved.titleSource, 'fallback')
  assert.equal(resolved.unmatchedTag, '未关联')
})

test('whole-string filenames are rejected but dotted location names survive', () => {
  assert.equal(isDisplayableTrackName('keep-route.png'), false)
  assert.equal(isDisplayableTrackName('weekend-track.gpx'), false)
  assert.equal(isDisplayableTrackName('A.B线'), true)
  assert.equal(isDisplayableTrackName('1.5公里入口'), true)

  assert.equal(resolveCheckinDisplayTitle({ trackName: 'keep-route.png' }).titleSource, 'fallback')
  assert.equal(resolveCheckinDisplayTitle({ trackName: 'A.B线' }).title, 'A.B线')
  assert.equal(resolveCheckinDisplayTitle({ trackName: '1.5公里入口' }).title, '1.5公里入口')
})
