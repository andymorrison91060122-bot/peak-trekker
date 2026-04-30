export function buildAuthReturnTarget(pathname: string, search?: string | null) {
  return `${pathname}${search ?? ''}`
}

export function normalizeAuthReturnPath(value: string | null | undefined, fallback = '/explore') {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback
  return value
}
