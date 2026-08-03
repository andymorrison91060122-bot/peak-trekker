export type ImageDimensions = {
  width: number | null
  height: number | null
}

const UNKNOWN_DIMENSIONS: ImageDimensions = { width: null, height: null }

function isPositiveDimension(value: number) {
  return Number.isSafeInteger(value) && value > 0
}

function dimensions(width: number, height: number): ImageDimensions {
  return isPositiveDimension(width) && isPositiveDimension(height)
    ? { width, height }
    : UNKNOWN_DIMENSIONS
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > bytes.length) return ''
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function uint16Be(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function uint16Le(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function uint24Le(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 3 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function uint32Be(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return ((bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]) >>> 0
}

function pngDimensions(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    return UNKNOWN_DIMENSIONS
  }
  const width = uint32Be(bytes, 16)
  const height = uint32Be(bytes, 20)
  return width === null || height === null ? UNKNOWN_DIMENSIONS : dimensions(width, height)
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return UNKNOWN_DIMENSIONS

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ])
  let offset = 2

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break

    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue

    const segmentLength = uint16Be(bytes, offset)
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > bytes.length) {
      return UNKNOWN_DIMENSIONS
    }
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return UNKNOWN_DIMENSIONS
      const height = uint16Be(bytes, offset + 3)
      const width = uint16Be(bytes, offset + 5)
      return width === null || height === null ? UNKNOWN_DIMENSIONS : dimensions(width, height)
    }
    offset += segmentLength
  }

  return UNKNOWN_DIMENSIONS
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return UNKNOWN_DIMENSIONS
  }

  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8X') {
    const widthMinusOne = uint24Le(bytes, 24)
    const heightMinusOne = uint24Le(bytes, 27)
    return widthMinusOne === null || heightMinusOne === null
      ? UNKNOWN_DIMENSIONS
      : dimensions(widthMinusOne + 1, heightMinusOne + 1)
  }

  if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return UNKNOWN_DIMENSIONS
    const packed = (bytes[21]
      | (bytes[22] << 8)
      | (bytes[23] << 16)
      | (bytes[24] << 24)) >>> 0
    return dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1)
  }

  if (chunk === 'VP8 ') {
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return UNKNOWN_DIMENSIONS
    }
    const width = uint16Le(bytes, 26)
    const height = uint16Le(bytes, 28)
    return width === null || height === null
      ? UNKNOWN_DIMENSIONS
      : dimensions(width & 0x3fff, height & 0x3fff)
  }

  return UNKNOWN_DIMENSIONS
}

export function readImageDimensions(bytes: Uint8Array, mimeType?: string): ImageDimensions {
  const normalizedMime = mimeType?.split(';', 1)[0].trim().toLowerCase()
  if (normalizedMime === 'image/png') return pngDimensions(bytes)
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') return jpegDimensions(bytes)
  if (normalizedMime === 'image/webp') return webpDimensions(bytes)

  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return pngDimensions(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegDimensions(bytes)
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webpDimensions(bytes)
  return UNKNOWN_DIMENSIONS
}
