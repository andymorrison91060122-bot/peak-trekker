import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/auth-js'
import {
  isRetryableScreenshotAuthError,
  resolveScreenshotAuthState,
} from '../src/lib/screenshot/recognize-auth-errors.ts'
import {
  readableError,
  responseKind,
} from '../src/lib/screenshot/recognize-client-errors.ts'
import {
  SCREENSHOT_QUOTA_RETRY_MESSAGE,
  SCREENSHOT_RECOGNITION_RETRY_MESSAGE,
  SCREENSHOT_RECOGNITION_TEMPORARY_MESSAGE,
} from '../src/lib/screenshot/recognize-error-copy.ts'

test('screenshot auth classifier keeps genuine no-session as unauthenticated', async () => {
  const missing = await resolveScreenshotAuthState(async () => ({
    data: { user: null },
    error: new AuthSessionMissingError(),
  }))
  assert.deepEqual(missing, { status: 'unauthenticated' })

  const noUser = await resolveScreenshotAuthState(async () => ({
    data: { user: null },
    error: null,
  }))
  assert.deepEqual(noUser, { status: 'unauthenticated' })

  const api401 = await resolveScreenshotAuthState(async () => ({
    data: { user: null },
    error: new AuthApiError('JWT invalid', 401, 'invalid_token'),
  }))
  assert.deepEqual(api401, { status: 'unauthenticated' })
})

test('screenshot auth classifier treats transport and 5xx auth failures as unavailable', async () => {
  const thrownNetwork = await resolveScreenshotAuthState(async () => {
    throw new TypeError('fetch failed')
  })
  assert.equal(thrownNetwork.status, 'unavailable')

  const retryable = await resolveScreenshotAuthState(async () => ({
    data: { user: null },
    error: new AuthRetryableFetchError('Client network socket disconnected before secure TLS connection was established', 0),
  }))
  assert.equal(retryable.status, 'unavailable')

  const missingStatus = await resolveScreenshotAuthState(async () => ({
    data: { user: null },
    error: new AuthError('fetch failed'),
  }))
  assert.equal(missingStatus.status, 'unavailable')

  const api503 = await resolveScreenshotAuthState(async () => ({
    data: { user: null },
    error: new AuthApiError('temporarily unavailable', 503, 'server_error'),
  }))
  assert.equal(api503.status, 'unavailable')

  assert.equal(isRetryableScreenshotAuthError(new Error('ECONNRESET to supabase.co')), true)
})

test('screenshot auth classifier returns authenticated user when getUser succeeds', async () => {
  const user = { id: 'user-123' }
  const state = await resolveScreenshotAuthState(async () => ({
    data: { user },
    error: null,
  }))
  assert.deepEqual(state, { status: 'authenticated', user })
})

test('screenshot client maps retryable network errors to safe user copy', () => {
  assert.equal(responseKind(503), 'network')
  assert.equal(readableError('TypeError: fetch failed', 'network'), SCREENSHOT_RECOGNITION_RETRY_MESSAGE)
  assert.equal(readableError('ECONNRESET', 'network'), SCREENSHOT_RECOGNITION_RETRY_MESSAGE)
  assert.equal(readableError(SCREENSHOT_RECOGNITION_RETRY_MESSAGE, 'network'), SCREENSHOT_RECOGNITION_RETRY_MESSAGE)
  assert.equal(readableError(SCREENSHOT_RECOGNITION_TEMPORARY_MESSAGE, 'network'), SCREENSHOT_RECOGNITION_TEMPORARY_MESSAGE)
  assert.equal(readableError(SCREENSHOT_QUOTA_RETRY_MESSAGE, 'network'), SCREENSHOT_QUOTA_RETRY_MESSAGE)
  assert.equal(readableError('unauthorized', 'auth'), '登录后才能识别截图。')
})
