import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const registerPage = readFileSync('src/app/auth/register/page.tsx', 'utf8')

test('register validates nickname before signup and sends signup metadata', () => {
  assert.match(registerPage, /import \{ validateNickname \} from '@\/lib\/profile-nickname'/)
  assert.match(registerPage, /const nicknameResult = validateNickname\(username\)/)
  assert.match(registerPage, /const provinceCode = getProvinceCode\(province\)/)
  assert.match(registerPage, /supabase\.auth\.signUp\(\{[\s\S]*email,[\s\S]*password,[\s\S]*options:\s*\{[\s\S]*data:\s*\{[\s\S]*nickname:\s*nicknameResult\.value,[\s\S]*province,[\s\S]*province_code:\s*provinceCode,[\s\S]*\}[\s\S]*\}[\s\S]*\}\)/)
})

test('register no longer writes profiles from the client after signup', () => {
  assert.doesNotMatch(registerPage, /from\('profiles'\)\.upsert/)
  assert.doesNotMatch(registerPage, /syncProfile/)
  assert.doesNotMatch(registerPage, /Profile sync failed during register/)
})

test('register keeps session guidance, redirects, and local onboarding state', () => {
  assert.match(registerPage, /supabase\.auth\.signInWithPassword\(\{ email, password \}\)/)
  assert.match(registerPage, /if \(activeSession\) \{[\s\S]*window\.location\.assign\(returnTo\)[\s\S]*return[\s\S]*\}/)
  assert.match(registerPage, /const loginHref =[\s\S]*window\.location\.assign\(loginHref\)/)
  assert.match(registerPage, /setProvinceDraft\(province\)/)
  assert.match(registerPage, /setIntroSeen\(\)/)
})
