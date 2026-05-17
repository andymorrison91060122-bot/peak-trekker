import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatElapsedHMS } from '../src/lib/trek-time.ts'

test('formatElapsedHMS always renders hour-minute-second segments', () => {
  assert.equal(formatElapsedHMS(41), '0:00:41')
  assert.equal(formatElapsedHMS(161), '0:02:41')
  assert.equal(formatElapsedHMS(9660), '2:41:00')
})

test('formatElapsedHMS floors invalid or fractional elapsed seconds safely', () => {
  assert.equal(formatElapsedHMS(61.9), '0:01:01')
  assert.equal(formatElapsedHMS(-5), '0:00:00')
  assert.equal(formatElapsedHMS(Number.NaN), '0:00:00')
})
