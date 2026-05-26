export function buildAuthReturnTarget(pathname: string, search?: string | null) {
  return `${pathname}${search ?? ''}`
}

export function normalizeAuthReturnPath(value: string | null | undefined, fallback = '/explore') {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback
  return value
}

const AUTH_RETURN_STORAGE_KEY = 'peak_trekker_auth_return_to'

export function resolveClientAuthReturnPath(value: string | null | undefined, fallback = '/explore') {
  const fromQuery = normalizeAuthReturnPath(value, '')
  if (typeof window === 'undefined') return fromQuery || fallback

  if (fromQuery) {
    window.sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, fromQuery)
    return fromQuery
  }

  return normalizeAuthReturnPath(window.sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY), fallback)
}

export function clearClientAuthReturnPath() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY)
}
