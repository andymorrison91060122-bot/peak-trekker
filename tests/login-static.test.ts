import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const loginPage = readFileSync('src/app/auth/login/page.tsx', 'utf8')

test('login passes captchaToken through signInWithPassword and mounts Turnstile widget', () => {
  assert.match(loginPage, /CloudflareTurnstile/)
  assert.match(loginPage, /const \[captchaToken, setCaptchaToken\] = useState\(''\)/)
  assert.match(loginPage, /supabase\.auth\.signInWithPassword\(\{[\s\S]*email,[\s\S]*password,[\s\S]*options:\s*\{[\s\S]*captchaToken,[\s\S]*\}[\s\S]*\}\)/)
  assert.match(loginPage, /onToken=\{handleTurnstileToken\}/)
  assert.match(loginPage, /onExpired=\{handleTurnstileExpired\}/)
  assert.match(loginPage, /onError=\{handleTurnstileError\}/)
  assert.match(loginPage, /resetKey=\{turnstileResetKey\}/)
  assert.match(loginPage, /TURNSTILE_EXPIRED_MESSAGE/)
  assert.match(loginPage, /TURNSTILE_LOAD_ERROR_MESSAGE/)
  assert.match(loginPage, /setTurnstileResetKey\(\(current\) => current \+ 1\)/)
})
