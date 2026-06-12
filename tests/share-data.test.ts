import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadShareData() {
  return import(`../src/lib/share-data.${sourceExtension}`)
}

describe('share data mapping', () => {
  test('resolves hero altitude from measured values only', async () => {
    const { resolveMeasuredShareAltitude } = await loadShareData()

    assert.equal(resolveMeasuredShareAltitude(null, undefined), undefined)
    assert.equal(resolveMeasuredShareAltitude(undefined, Number.NaN), undefined)
    assert.equal(resolveMeasuredShareAltitude(null, 0), 0)
    assert.equal(resolveMeasuredShareAltitude(1286, 884), 1286)
    assert.equal(resolveMeasuredShareAltitude(undefined, 884), 884)
  })

  test('resolves share poster titles with mountain, track_name, then share fallback', async () => {
    const { resolveShareMountainName } = await loadShareData()

    assert.equal(
      resolveShareMountainName({
        mountainName: '泰山',
        trackName: '鸡笼顶大草原',
      }),
      '泰山',
    )
    assert.equal(
      resolveShareMountainName({
        mountainName: null,
        trackName: '鸡笼顶大草原',
      }),
      '鸡笼顶大草原',
    )
    assert.equal(
      resolveShareMountainName({
        mountainName: null,
        trackName: '截图识别活动',
      }),
      '未知山峰',
    )
  })

  test('resolves share source badges with realtime GPS as the only verified branch', async () => {
    const { resolveShareRenderSource } = await loadShareData()

    assert.equal(resolveShareRenderSource('realtime_gps'), 'gps')
    assert.equal(resolveShareRenderSource('track_import'), 'uploaded')
    assert.equal(resolveShareRenderSource('screenshot_recognition'), 'uploaded')
    assert.equal(resolveShareRenderSource('historical_photo'), 'uploaded')
    assert.equal(resolveShareRenderSource(null), 'uploaded')
    assert.equal(resolveShareRenderSource(undefined), 'uploaded')
  })
})
