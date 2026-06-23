import {
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/auth-js'

type SupabaseGetUserResult<TUser> = {
  data: { user: TUser | null }
  error: unknown | null
}

export type ScreenshotAuthState<TUser> =
  | { status: 'authenticated'; user: TUser }
  | { status: 'unauthenticated' }
  | { status: 'unavailable'; error: unknown }

function authErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? '')
}

export function isRetryableScreenshotAuthError(error: unknown) {
  if (isAuthRetryableFetchError(error)) return true
  if (isAuthSessionMissingError(error)) return false

  const status = authErrorStatus(error)
  if (status === 401 || status === 403) return false
  if (typeof status === 'number' && status >= 500) return true
  if (status === undefined) return true

  return /fetch failed|ECONNRESET|ETIMEDOUT|timeout|TLS|network socket|ENOTFOUND|ECONNREFUSED/i.test(errorMessage(error))
}

export async function resolveScreenshotAuthState<TUser extends { id: string }>(
  getUser: () => Promise<SupabaseGetUserResult<TUser>>
): Promise<ScreenshotAuthState<TUser>> {
  try {
    const {
      data: { user },
      error,
    } = await getUser()

    if (error) {
      return isRetryableScreenshotAuthError(error)
        ? { status: 'unavailable', error }
        : { status: 'unauthenticated' }
    }

    if (!user) return { status: 'unauthenticated' }
    return { status: 'authenticated', user }
  } catch (error) {
    return { status: 'unavailable', error }
  }
}
