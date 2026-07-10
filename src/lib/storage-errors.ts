function isMissingStorageMessage(normalized: string) {
  return /bucket not found|resource was not found|the resource was not found|status code 404|\b404\b/i.test(normalized)
}

export function describeStorageError(error: unknown) {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error))
    return [error.message, serialized].filter(Boolean).join(' :: ')
  }
  if (typeof error === 'object') {
    const message = typeof (error as { message?: unknown }).message === 'string' ? String((error as { message?: unknown }).message) : ''
    const serialized = JSON.stringify(error)
    return [message, serialized].filter(Boolean).join(' :: ')
  }
  return String(error)
}

export function normalizeStorageUploadError(
  message: string | null | undefined,
  fallback: string
) {
  const normalized = String(message ?? '').trim()
  if (!normalized) return fallback

  if (/failed to fetch|networkerror|load failed|fetch failed|aborterror|aborted|err_failed|network request failed/i.test(normalized)) {
    return fallback
  }

  if (isMissingStorageMessage(normalized)) {
    return '当前环境未配置图片存储，请联系管理员补齐存储配置。'
  }

  return fallback
}

export function isMissingStorageError(message: string | null | undefined) {
  const normalized = String(message ?? '').trim()
  return isMissingStorageMessage(normalized) || normalized.includes('当前环境未配置图片存储')
}
