import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sheetSource = readFileSync('src/components/profile/ProfileNicknameSheet.tsx', 'utf8')
const profileSource = readFileSync('src/components/profile/ProfileAvatarUploader.tsx', 'utf8')
const routeSource = readFileSync('src/app/api/profile/nickname/route.ts', 'utf8')
const handlerSource = readFileSync('src/lib/profile-nickname-update.ts', 'utf8')
const faqSource = readFileSync('src/lib/faq-content.ts', 'utf8')

test('nickname sheet and route share the Phase 2A validator without a duplicate allowed regex', () => {
  assert.match(sheetSource, /import \{ validateNickname \} from '@\/lib\/profile-nickname'/)
  assert.match(handlerSource, /import \{ validateNickname \} from '\.\/profile-nickname\.ts'/)
  assert.doesNotMatch(sheetSource, /NICKNAME_ALLOWED_PATTERN/)
  assert.doesNotMatch(sheetSource, /\\u3400-\\u4DBF|\\u4E00-\\u9FFF|\\uF900-\\uFAFF/)
  assert.doesNotMatch(routeSource, /NICKNAME_ALLOWED_PATTERN|\\u3400|\\u4E00|\\uF900/)
})

test('profile nickname UI exposes the required controls and local success state', () => {
  assert.match(sheetSource, /data-testid="profile-nickname-edit-trigger"/)
  assert.match(profileSource, /data-testid="profile-nickname-value"/)
  assert.match(profileSource, /data-testid="profile-nickname-updated-badge"/)
  assert.match(profileSource, /savedUsernameRef/)
  assert.match(profileSource, /router\.refresh\(\)/)
  assert.match(sheetSource, /data-testid="profile-nickname-sheet"/)
  assert.match(sheetSource, /data-testid="profile-nickname-input"/)
  assert.match(sheetSource, /data-testid="profile-nickname-counter"/)
  assert.match(sheetSource, /data-testid="profile-nickname-save"/)
})

test('nickname sheet handles browser back, escape, scrim, and enter-submit affordances', () => {
  assert.match(profileSource, /window\.history\.pushState\(\{ peakTrekkerNicknameSheet: true \}/)
  assert.match(profileSource, /window\.addEventListener\('popstate', handlePopState\)/)
  assert.match(sheetSource, /event\.key === 'Escape'/)
  assert.match(sheetSource, /data-testid="profile-nickname-sheet-scrim"[\s\S]*onClick=\{onClose\}/)
  assert.match(sheetSource, /event\.key === 'Enter' && canSave/)
})

test('FAQ edit-profile copy reflects nickname editing but keeps province unsupported', () => {
  assert.match(faqSource, /昵称也可以在「我的」页面编辑/)
  assert.match(faqSource, /所在省份暂不支持修改/)
  assert.doesNotMatch(faqSource, /昵称、所在省份目前还不能在 App 内修改/)
})
