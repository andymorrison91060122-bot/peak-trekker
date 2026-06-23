import assert from 'node:assert/strict'
import test from 'node:test'

import {
  INTRO_SEEN_KEY,
  ONBOARDING_VERSION,
  buildOnboardingCompletionPayload,
  getOnboardingSelfHealKey,
  hasIntroSeen,
  isLocalIntroCurrent,
  shouldPersistOnboardingSelfHeal,
} from '../src/lib/onboarding.ts'

function fakeStorage(value: string | null) {
  return {
    getItem(key: string) {
      assert.equal(key, INTRO_SEEN_KEY)
      return value
    },
  }
}

test('completion payload stamps current onboarding version and completion time', () => {
  const completedAt = new Date('2026-06-23T10:11:12.000Z')

  assert.deepEqual(buildOnboardingCompletionPayload(completedAt), {
    onboarding_version: ONBOARDING_VERSION,
    onboarding_completed_at: '2026-06-23T10:11:12.000Z',
  })
})

test('server current version suppresses onboarding independently of local storage', () => {
  assert.equal(hasIntroSeen(ONBOARDING_VERSION), true)
  assert.equal(shouldPersistOnboardingSelfHeal('user-1', ONBOARDING_VERSION, true), false)
})

test('local current plus stale server version needs authenticated self-heal', () => {
  assert.equal(isLocalIntroCurrent(fakeStorage(ONBOARDING_VERSION)), true)
  assert.equal(shouldPersistOnboardingSelfHeal('user-1', null, true), true)
  assert.equal(shouldPersistOnboardingSelfHeal('user-1', 'old-version', true), true)
})

test('self-heal does not run without a user or without current local completion', () => {
  assert.equal(shouldPersistOnboardingSelfHeal(null, null, true), false)
  assert.equal(shouldPersistOnboardingSelfHeal('user-1', null, false), false)
  assert.equal(isLocalIntroCurrent(fakeStorage(null)), false)
  assert.equal(isLocalIntroCurrent(fakeStorage('old-version')), false)
})

test('version mismatch still shows onboarding instead of over-suppressing', () => {
  assert.equal(hasIntroSeen('old-version'), false)
})

test('self-heal de-dupe key is scoped by user and onboarding version', () => {
  const attempts = new Set<string>()
  const firstKey = getOnboardingSelfHealKey('user-1')
  const secondKey = getOnboardingSelfHealKey('user-1')
  const otherUserKey = getOnboardingSelfHealKey('user-2')

  assert.equal(firstKey, `user-1:${ONBOARDING_VERSION}`)
  assert.equal(attempts.has(firstKey), false)
  attempts.add(firstKey)
  assert.equal(attempts.has(secondKey), true)
  assert.equal(attempts.has(otherUserKey), false)
})
