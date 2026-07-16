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

test('complete CDATA wrappers are unwrapped before display checks', () => {
  const resolved = resolveCheckinDisplayTitle({
    mountainName: null,
    trackName: '<![CDATA[  南峰环线  ]]>',
  })

  assert.equal(resolved.title, '南峰环线')
  assert.equal(resolved.titleSource, 'track_name')
})

test('device-default timestamps inside or outside CDATA use the unmatched fallback', () => {
  for (const trackName of [
    '<![CDATA[2026-07-16 08:32:11 其它]]>',
    '<![CDATA[20260716_083211 未命名]]>',
    '1721118731000',
    '2026-07-16T08:32:11',
  ]) {
    const resolved = resolveCheckinDisplayTitle({ mountainName: null, trackName })
    assert.equal(resolved.title, '未关联山行')
    assert.equal(resolved.titleSource, 'fallback')
    assert.equal(resolved.secondaryLocation, '未知地点')
  }
})

test('empty CDATA uses fallback while partial CDATA text is left untouched', () => {
  assert.equal(resolveCheckinDisplayTitle({ trackName: '<![CDATA[   ]]>' }).titleSource, 'fallback')
  assert.equal(resolveCheckinDisplayTitle({ trackName: '前缀 <![CDATA[山径]]>' }).title, '前缀 <![CDATA[山径]]>')
})

test('meaningful names that contain dates remain displayable', () => {
  assert.equal(resolveCheckinDisplayTitle({ trackName: '2026-07-16 华山夜爬' }).title, '2026-07-16 华山夜爬')
  assert.equal(resolveCheckinDisplayTitle({ trackName: '<![CDATA[2026 夏季南峰线]]>' }).title, '2026 夏季南峰线')
})
