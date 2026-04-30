export const ALLOW_LOCAL_TREK_SESSION = process.env.ALLOW_LOCAL_TREK_SESSION === 'true'

export const LOCAL_TREK_SESSION_PREFIX = 'local-trek-session:'
export const LOCAL_FALLBACK_SESSION_PREFIX = 'local-fallback-session:'

export function isLocalTrekSessionId(value: string) {
  return value.startsWith(LOCAL_TREK_SESSION_PREFIX)
}

export function isLocalFallbackSessionId(value: string) {
  return value.startsWith(LOCAL_FALLBACK_SESSION_PREFIX)
}
