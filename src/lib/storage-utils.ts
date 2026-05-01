export const CHECKIN_PHOTOS_BUCKET = 'checkin-photos'
export const AVATARS_BUCKET = 'avatars'

export const CHECKIN_PHOTOS_MAX_BYTES = 8 * 1024 * 1024
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export const STORAGE_CACHE_CONTROL = '3600'

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number]

const IMAGE_MIME_EXTENSION: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const EXTENSION_MIME: Record<string, AllowedImageMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function isAllowedImageMimeType(value: string): value is AllowedImageMimeType {
  return ALLOWED_IMAGE_MIME_TYPES.includes(value as AllowedImageMimeType)
}

export function sanitizeStorageBaseName(fileName: string, fallback: string, maxLength = 48) {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength) || fallback
  )
}

export function sanitizeStoragePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
}

export function getStorageExtension(file: File, fallback = 'jpg') {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (/^[a-z0-9]{1,8}$/.test(fromName)) return fromName

  const subtype = file.type.split('/').pop()?.toLowerCase() ?? fallback
  return /^[a-z0-9]{1,8}$/.test(subtype) ? subtype : fallback
}

export function getAllowedImageExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (EXTENSION_MIME[fromName]) return fromName === 'jpeg' ? 'jpg' : fromName
  if (isAllowedImageMimeType(file.type)) return IMAGE_MIME_EXTENSION[file.type]
  return 'jpg'
}

export function validateStorageImageFile(
  file: File,
  {
    maxBytes,
    invalidTypeMessage,
    tooLargeMessage,
  }: {
    maxBytes: number
    invalidTypeMessage: string
    tooLargeMessage: string
  }
) {
  if (!isAllowedImageMimeType(file.type)) {
    return { ok: false as const, status: 415, error: invalidTypeMessage }
  }

  if (file.size > maxBytes) {
    return { ok: false as const, status: 413, error: tooLargeMessage }
  }

  return { ok: true as const }
}

export function buildCheckinPhotoObjectPath({
  userId,
  file,
  fallbackBase = 'checkin-photo',
  scopeId,
  index,
}: {
  userId: string
  file: File
  fallbackBase?: string
  scopeId?: string
  index?: number
}) {
  const safeBase = sanitizeStorageBaseName(file.name, fallbackBase, 32)
  const safeScope = scopeId ? `${sanitizeStoragePathPart(scopeId)}-` : ''
  const indexSuffix = typeof index === 'number' ? `-${index}` : ''
  return `checkins/${userId}/${safeScope}${Date.now()}${indexSuffix}-${safeBase}.${getStorageExtension(file)}`
}

export function buildAvatarObjectPath(userId: string, file: File) {
  return `${userId}/${Date.now()}-avatar.${getAllowedImageExtension(file)}`
}

export function storageUploadStatus(message: string) {
  if (/file size|too large|exceed|payload too large|413/i.test(message)) return 413
  if (/mime|content.?type|unsupported media|415/i.test(message)) return 415
  if (/row-level security|permission|policy|forbidden|not allowed|unauthorized/i.test(message)) return 403
  return 500
}
