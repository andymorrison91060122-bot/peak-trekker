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
})
