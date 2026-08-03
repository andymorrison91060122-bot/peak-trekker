import assert from 'node:assert/strict'
import test from 'node:test'
import { readImageDimensions } from '../src/lib/screenshot/image-dimensions.ts'

function png(width: number, height: number) {
  const bytes = Buffer.alloc(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

function jpeg(width: number, height: number) {
  const bytes = Buffer.alloc(23)
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08])
  bytes.writeUInt16BE(height, 13)
  bytes.writeUInt16BE(width, 15)
  bytes.set([0x03, 0x01, 0x11, 0x00, 0xff, 0xd9], 17)
  return bytes
}

function webpVp8x(width: number, height: number) {
  const bytes = Buffer.alloc(30)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(22, 4)
  bytes.write('WEBPVP8X', 8, 'ascii')
  bytes.writeUInt32LE(10, 16)
  bytes.writeUIntLE(width - 1, 24, 3)
  bytes.writeUIntLE(height - 1, 27, 3)
  return bytes
}

test('reads PNG dimensions without decoding pixels', () => {
  assert.deepEqual(readImageDimensions(png(447, 737), 'image/png'), { width: 447, height: 737 })
})

test('reads JPEG dimensions without decoding pixels', () => {
  assert.deepEqual(readImageDimensions(jpeg(1280, 720), 'image/jpeg'), { width: 1280, height: 720 })
})

test('reads WebP dimensions without decoding pixels', () => {
  assert.deepEqual(readImageDimensions(webpVp8x(960, 520), 'image/webp'), { width: 960, height: 520 })
})

test('returns unknown dimensions for malformed or unsupported input', () => {
  assert.deepEqual(readImageDimensions(Buffer.from('not-an-image'), 'image/png'), { width: null, height: null })
  assert.deepEqual(readImageDimensions(Buffer.from('GIF89a'), 'image/gif'), { width: null, height: null })
})
