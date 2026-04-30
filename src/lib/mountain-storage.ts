export const MOUNTAIN_MEDIA_BUCKET = 'mountain-media'

export const ALLOWED_MOUNTAIN_COVER_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const MAX_MOUNTAIN_COVER_SIZE_BYTES = 8 * 1024 * 1024

export const MOUNTAIN_MEDIA_CACHE_CONTROL = '31536000'

export const ALLOWED_MOUNTAIN_GALLERY_TYPES = ALLOWED_MOUNTAIN_COVER_TYPES

export const MAX_MOUNTAIN_GALLERY_SIZE_BYTES = MAX_MOUNTAIN_COVER_SIZE_BYTES

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function normalizeMountainGalleryImages(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(isNonEmptyString)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.filter(isNonEmptyString) : []
    } catch {
      return []
    }
  }

  return [] as string[]
}

export function dedupeExactUrlsPreserveOrder(urls: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const url of urls) {
    if (!isNonEmptyString(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    normalized.push(url)
  }

  return normalized
}

export function sanitizeMountainMediaExtension(file: Pick<File, 'name' | 'type'>) {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName

  const subtype = file.type.split('/').pop()?.toLowerCase() ?? 'jpg'
  return /^[a-z0-9]{1,5}$/.test(subtype) ? subtype : 'jpg'
}

export function buildMountainGalleryObjectPath(
  mountainId: string,
  file: Pick<File, 'name' | 'type'>,
  timestamp = Date.now(),
  uuid = globalThis.crypto.randomUUID()
) {
  const ext = sanitizeMountainMediaExtension(file)
  return `mountains/${mountainId}/gallery/${timestamp}-${uuid}.${ext}`
}

export function parseMountainMediaObjectPathFromPublicUrl(url: string) {
  if (!isNonEmptyString(url)) return null

  try {
    const resolved = new URL(url)
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!baseUrl) return null

    const base = new URL(baseUrl)
    if (resolved.origin !== base.origin) {
      return null
    }

    const prefix = `/storage/v1/object/public/${MOUNTAIN_MEDIA_BUCKET}/`
    if (!resolved.pathname.startsWith(prefix)) {
      return null
    }

    const encodedObjectPath = resolved.pathname.slice(prefix.length)
    if (!encodedObjectPath) return null

    return {
      bucket: MOUNTAIN_MEDIA_BUCKET,
      objectPath: decodeURIComponent(encodedObjectPath),
    }
  } catch {
    return null
  }
}
