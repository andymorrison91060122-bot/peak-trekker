import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const registerPage = readFileSync('src/app/auth/register/page.tsx', 'utf8')
const turnstileComponent = readFileSync('src/components/auth/CloudflareTurnstile.tsx', 'utf8')

function requiredIndexOf(source: string, pattern: string, fromIndex = 0) {
  const index = source.indexOf(pattern, fromIndex)
  assert.notEqual(index, -1, `Expected source to include ${pattern}`)
  return index
}

test('register validates nickname before signup and sends nickname-only signup metadata', () => {
  assert.match(registerPage, /CloudflareTurnstile/)
  assert.match(registerPage, /const \[captchaToken, setCaptchaToken\] = useState\(''\)/)
  assert.match(registerPage, /import \{ validateNickname \} from '@\/lib\/profile-nickname'/)
  assert.match(registerPage, /const nicknameResult = validateNickname\(username\)/)
  assert.match(registerPage, /supabase\.auth\.signUp\(\{[\s\S]*email,[\s\S]*password,[\s\S]*options:\s*\{[\s\S]*captchaToken,[\s\S]*data:\s*\{[\s\S]*nickname:\s*nicknameResult\.value,[\s\S]*\}[\s\S]*\}[\s\S]*\}\)/)
  assert.doesNotMatch(registerPage, /province_code/)
  assert.doesNotMatch(registerPage, /getProvinceCode/)
})

test('register only performs a narrow onboarding completion profile update after authenticated signup', () => {
  assert.doesNotMatch(registerPage, /from\('profiles'\)\.upsert/)
  assert.doesNotMatch(registerPage, /syncProfile/)
  assert.doesNotMatch(registerPage, /Profile sync failed during register/)
  assert.match(registerPage, /buildOnboardingCompletionPayload\(\)/)
  assert.match(registerPage, /from\('profiles'\)\.update\(buildOnboardingCompletionPayload\(\)\)\.eq\('id', activeUserId\)/)
  assert.match(registerPage, /console\.warn\('Onboarding completion persistence failed during register'\)/)
  assert.match(registerPage, /console\.warn\('\[auth-register\] signup failed', signUpError\)/)
  assert.match(registerPage, /setError\('注册暂时没有完成，请检查邮箱和密码后重试。'\)/)
  assert.doesNotMatch(registerPage, /console\.warn\([^)]*activeSession/)
  assert.doesNotMatch(registerPage, /console\.warn\([^)]*activeUserId/)
})

test('register persists onboarding completion before redirecting an authenticated session', () => {
  const activeSessionIndex = requiredIndexOf(registerPage, 'if (activeSession) {')
  const persistenceIndex = requiredIndexOf(registerPage, 'await persistOnboardingCompletionToProfile(activeUserId)')
  const redirectIndex = requiredIndexOf(registerPage, 'window.location.replace(returnTo)')

  assert.ok(activeSessionIndex < persistenceIndex)
  assert.ok(persistenceIndex < redirectIndex)
})

test('register email-confirm branch does not attempt server onboarding persistence without a session', () => {
  const activeSessionIndex = requiredIndexOf(registerPage, 'if (activeSession) {')
  const activeSessionRedirectIndex = requiredIndexOf(registerPage, 'window.location.replace(returnTo)')
  const loginRequiredBranchIndex = requiredIndexOf(registerPage, 'if (activeUserId) {', activeSessionRedirectIndex)
  const loginRedirectIndex = requiredIndexOf(registerPage, 'window.location.replace(loginHref)', loginRequiredBranchIndex)

  assert.ok(activeSessionIndex < activeSessionRedirectIndex)
  assert.ok(activeSessionRedirectIndex < loginRequiredBranchIndex)
  assert.ok(loginRequiredBranchIndex < loginRedirectIndex)

  const emailConfirmBranch = registerPage.slice(loginRequiredBranchIndex, loginRedirectIndex)
  assert.doesNotMatch(emailConfirmBranch, /persistOnboardingCompletionToProfile/)
})

test('register never replays the one-time signup captcha token for automatic sign-in', () => {
  assert.doesNotMatch(registerPage, /supabase\.auth\.signInWithPassword/)
  assert.doesNotMatch(registerPage, /signInData|signInError/)
})

test('register keeps session guidance, redirects, and intro completion state without a province draft', () => {
  assert.match(registerPage, /if \(activeSession\) \{[\s\S]*window\.location\.replace\(returnTo\)[\s\S]*return[\s\S]*\}/)
  assert.match(registerPage, /const loginHref =[\s\S]*window\.location\.replace\(loginHref\)/)
  assert.match(registerPage, /setIntroSeen\(\)/)
  assert.doesNotMatch(registerPage, /setProvinceDraft/)
})

test('register mounts Turnstile widget and exposes clear reset and load-error states', () => {
  assert.match(registerPage, /onToken=\{handleTurnstileToken\}/)
  assert.match(registerPage, /onExpired=\{handleTurnstileExpired\}/)
  assert.match(registerPage, /onError=\{handleTurnstileError\}/)
  assert.match(registerPage, /resetKey=\{turnstileResetKey\}/)
  assert.match(registerPage, /TURNSTILE_EXPIRED_MESSAGE/)
  assert.match(registerPage, /TURNSTILE_LOAD_ERROR_MESSAGE/)
  assert.match(registerPage, /setTurnstileResetKey\(\(current\) => current \+ 1\)/)
})

test('auth Turnstile widget stays visibly rendered by default', () => {
  assert.match(turnstileComponent, /appearance:\s*'always',/)
  assert.doesNotMatch(turnstileComponent, /appearance:\s*'interaction-only',/)
})

test('register profile step contains no province state, draft, selector, or ranking copy', () => {
  assert.doesNotMatch(registerPage, /getProvinceDraft/)
  assert.doesNotMatch(registerPage, /setProvinceDraft/)
  assert.doesNotMatch(registerPage, /PROVINCES/)
  assert.doesNotMatch(registerPage, /provinceRankingEnabled/)
  assert.doesNotMatch(registerPage, /register-province-help/)
  assert.doesNotMatch(registerPage, /<select/)
})
