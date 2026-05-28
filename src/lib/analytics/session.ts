import { ANALYTICS_SESSION_COOKIE, ANALYTICS_SESSION_MAX_AGE_SECONDS } from './constants'

function cookieSecureFlag() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
}

export function readClientCookie(name: string) {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const match = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
  return match ? decodeURIComponent(match.slice(prefix.length)) : null
}

export function writeClientCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${cookieSecureFlag()}`
}

export function clearClientCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${cookieSecureFlag()}`
}

export function getOrCreateAnalyticsSessionId() {
  const existing = readClientCookie(ANALYTICS_SESSION_COOKIE)
  if (existing) return existing
  const nextId = crypto.randomUUID()
  writeClientCookie(ANALYTICS_SESSION_COOKIE, nextId, ANALYTICS_SESSION_MAX_AGE_SECONDS)
  return nextId
}
