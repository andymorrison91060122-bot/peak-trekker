export const EXPLORE_THUMBNAIL_BUCKET = 'mountain-media'
export const EXPLORE_THUMBNAIL_VERSION = 'thumb-v1'

const PUBLIC_STORAGE_PREFIX =
  `/storage/v1/object/public/${EXPLORE_THUMBNAIL_BUCKET}/`
const CANONICAL_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function sanitizeThumbnailBasename(sourceBasename) {
  return sourceBasename
    .replace(/\.[^.]+$/, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveExploreMountainThumbnailUrl(
  sourceUrl,
  expectedBaseUrl,
) {
  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) return null
  if (typeof expectedBaseUrl !== 'string' || expectedBaseUrl.trim().length === 0) {
    return null
  }

  try {
    const resolved = new URL(sourceUrl)
    const expected = new URL(expectedBaseUrl)
    if (resolved.origin !== expected.origin || resolved.search || resolved.hash) return null
    if (!resolved.pathname.startsWith(PUBLIC_STORAGE_PREFIX)) return null

    const encodedObjectPath = resolved.pathname.slice(PUBLIC_STORAGE_PREFIX.length)
    const segments = encodedObjectPath.split('/').map((segment) => decodeURIComponent(segment))
    if (
      segments.length !== 3
      || segments[0] !== 'catalog'
      || !CANONICAL_KEY_PATTERN.test(segments[1])
      || segments.some((segment) => (
        !segment
        || segment === '.'
        || segment === '..'
        || segment.includes('/')
        || segment.includes('\\')
      ))
    ) {
      return null
    }

    const [catalog, canonicalKey, sourceBasename] = segments
    if (sourceBasename.startsWith(`${EXPLORE_THUMBNAIL_VERSION}-`)) return null
    const targetBasename = sanitizeThumbnailBasename(sourceBasename)
    if (!targetBasename) return null

    return [
      `${expected.origin}/storage/v1/object/public/${EXPLORE_THUMBNAIL_BUCKET}`,
      catalog,
      canonicalKey,
      `${EXPLORE_THUMBNAIL_VERSION}-${targetBasename}.webp`,
    ].join('/')
  } catch {
    return null
  }
}
