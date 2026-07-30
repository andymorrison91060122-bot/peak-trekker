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
  assert.match(registerPage, /CloudflareTurnstile/)
  assert.match(registerPage, /const \[captchaToken, setCaptchaToken\] = useState\(''\)/)
  assert.match(registerPage, /import \{ validateNickname \} from '@\/lib\/profile-nickname'/)
  assert.match(registerPage, /const nicknameResult = validateNickname\(username\)/)
  assert.match(registerPage, /const provinceCode = getProvinceCode\(province\)/)
  assert.match(registerPage, /supabase\.auth\.signUp\(\{[\s\S]*email,[\s\S]*password,[\s\S]*options:\s*\{[\s\S]*captchaToken,[\s\S]*data:\s*\{[\s\S]*nickname:\s*nicknameResult\.value,[\s\S]*province,[\s\S]*province_code:\s*provinceCode,[\s\S]*\}[\s\S]*\}[\s\S]*\}\)/)
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

test('register keeps session guidance, redirects, and local onboarding state', () => {
  assert.match(registerPage, /if \(activeSession\) \{[\s\S]*window\.location\.replace\(returnTo\)[\s\S]*return[\s\S]*\}/)
  assert.match(registerPage, /const loginHref =[\s\S]*window\.location\.replace\(loginHref\)/)
  assert.match(registerPage, /setProvinceDraft\(province\)/)
  assert.match(registerPage, /setIntroSeen\(\)/)
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

test('register keeps province required and explains its profile purpose accessibly', () => {
  const provinceSelect = registerPage.match(/<select[\s\S]*?<option value="">选择省份\.\.\.<\/option>[\s\S]*?<\/select>/)?.[0] ?? ''
  assert.match(provinceSelect, /required/)
  assert.match(provinceSelect, /aria-describedby="register-province-help"/)
  assert.match(
    registerPage,
    /id="register-province-help"[\s\S]*选择你的籍贯或常驻省，将作为个人资料中的归属地。/,
  )
  assert.match(registerPage, /provinceRankingEnabled \? <span[\s\S]*（为家乡省份积分）/)
})
