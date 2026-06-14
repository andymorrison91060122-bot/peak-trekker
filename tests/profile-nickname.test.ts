import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROFILE_NICKNAME_ERRORS,
  normalizeNickname,
  validateNickname,
} from '../src/lib/profile-nickname.ts'

function assertValid(input: string, expected: string) {
  const result = validateNickname(input)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.value, expected)
}

function assertInvalid(input: string, error: string) {
  const result = validateNickname(input)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, error)
}

test('normalizes nickname by trimming outer whitespace', () => {
  assert.equal(normalizeNickname('  山友  '), '山友')
  assertValid('  山友  ', '山友')
})

test('validates nickname length by Unicode code points', () => {
  assertInvalid('', PROFILE_NICKNAME_ERRORS.empty)
  assertInvalid('   ', PROFILE_NICKNAME_ERRORS.empty)
  assertInvalid('山', PROFILE_NICKNAME_ERRORS.tooShort)
  assertValid('山友', '山友')
  assertValid('一二三四五六七八九十甲乙', '一二三四五六七八九十甲乙')
  assertInvalid('一二三四五六七八九十甲乙丙', PROFILE_NICKNAME_ERRORS.tooLong)
})

test('accepts the Phase 2A allowed character set', () => {
  // Keep this set in parity with public.validate_nickname() in the FU-90 M2 migration.
  assertValid('山友 A_9-', '山友 A_9-')
  assertValid('㐀㐁', '㐀㐁')
  assertValid('豈﫿', '豈﫿')
})

test('rejects newline, control, emoji, punctuation, format characters, and non-Han ranges', () => {
  assertInvalid('山\n友', PROFILE_NICKNAME_ERRORS.unsupported)
  assertInvalid('山\t友', PROFILE_NICKNAME_ERRORS.unsupported)
  assertInvalid('山友😀', PROFILE_NICKNAME_ERRORS.unsupported)
  assertInvalid('山友!', PROFILE_NICKNAME_ERRORS.unsupported)
  assertInvalid('山\u200B友', PROFILE_NICKNAME_ERRORS.unsupported)
  assertInvalid('가나', PROFILE_NICKNAME_ERRORS.unsupported)
  assertInvalid('\uE000\uE001', PROFILE_NICKNAME_ERRORS.unsupported)
})
