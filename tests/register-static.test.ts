import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const registerPage = readFileSync('src/app/auth/register/page.tsx', 'utf8')

function requiredIndexOf(source: string, pattern: string, fromIndex = 0) {
  const index = source.indexOf(pattern, fromIndex)
  assert.notEqual(index, -1, `Expected source to include ${pattern}`)
  return index
}

test('register validates nickname before signup and sends signup metadata', () => {
  assert.match(registerPage, /import \{ validateNickname \} from '@\/lib\/profile-nickname'/)
  assert.match(registerPage, /const nicknameResult = validateNickname\(username\)/)
  assert.match(registerPage, /const provinceCode = getProvinceCode\(province\)/)
  assert.match(registerPage, /supabase\.auth\.signUp\(\{[\s\S]*email,[\s\S]*password,[\s\S]*options:\s*\{[\s\S]*data:\s*\{[\s\S]*nickname:\s*nicknameResult\.value,[\s\S]*province,[\s\S]*province_code:\s*provinceCode,[\s\S]*\}[\s\S]*\}[\s\S]*\}\)/)
})

test('register only performs a narrow onboarding completion profile update after authenticated signup', () => {
  assert.doesNotMatch(registerPage, /from\('profiles'\)\.upsert/)
  assert.doesNotMatch(registerPage, /syncProfile/)
  assert.doesNotMatch(registerPage, /Profile sync failed during register/)
  assert.match(registerPage, /buildOnboardingCompletionPayload\(\)/)
  assert.match(registerPage, /from\('profiles'\)\.update\(buildOnboardingCompletionPayload\(\)\)\.eq\('id', activeUserId\)/)
  assert.match(registerPage, /console\.warn\('Onboarding completion persistence failed during register'\)/)
  assert.doesNotMatch(registerPage, /console\.warn\([^)]*signUpError/)
  assert.doesNotMatch(registerPage, /console\.warn\([^)]*activeSession/)
  assert.doesNotMatch(registerPage, /console\.warn\([^)]*activeUserId/)
})

test('register persists onboarding completion before redirecting an authenticated session', () => {
  const activeSessionIndex = requiredIndexOf(registerPage, 'if (activeSession) {')
  const persistenceIndex = requiredIndexOf(registerPage, 'await persistOnboardingCompletionToProfile(activeUserId)')
  const redirectIndex = requiredIndexOf(registerPage, 'window.location.assign(returnTo)')

  assert.ok(activeSessionIndex < persistenceIndex)
  assert.ok(persistenceIndex < redirectIndex)
})

test('register email-confirm branch does not attempt server onboarding persistence without a session', () => {
  const activeSessionIndex = requiredIndexOf(registerPage, 'if (activeSession) {')
  const activeSessionRedirectIndex = requiredIndexOf(registerPage, 'window.location.assign(returnTo)')
  const loginRequiredBranchIndex = requiredIndexOf(registerPage, 'if (activeUserId) {', activeSessionRedirectIndex)
  const loginRedirectIndex = requiredIndexOf(registerPage, 'window.location.assign(loginHref)', loginRequiredBranchIndex)

  assert.ok(activeSessionIndex < activeSessionRedirectIndex)
  assert.ok(activeSessionRedirectIndex < loginRequiredBranchIndex)
  assert.ok(loginRequiredBranchIndex < loginRedirectIndex)

  const emailConfirmBranch = registerPage.slice(loginRequiredBranchIndex, loginRedirectIndex)
  assert.doesNotMatch(emailConfirmBranch, /persistOnboardingCompletionToProfile/)
})

test('register keeps session guidance, redirects, and local onboarding state', () => {
  assert.match(registerPage, /supabase\.auth\.signInWithPassword\(\{ email, password \}\)/)
  assert.match(registerPage, /if \(activeSession\) \{[\s\S]*window\.location\.assign\(returnTo\)[\s\S]*return[\s\S]*\}/)
  assert.match(registerPage, /const loginHref =[\s\S]*window\.location\.assign\(loginHref\)/)
  assert.match(registerPage, /setProvinceDraft\(province\)/)
  assert.match(registerPage, /setIntroSeen\(\)/)
})
