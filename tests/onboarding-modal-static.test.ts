import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const modal = readFileSync('src/components/ui/OnboardingModal.tsx', 'utf8')

function extractSelfHealCallback() {
  const match = modal.match(/const persistOnboardingSelfHeal = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[currentUserId, supabase\]\)/)
  assert.ok(match)
  return match[0]
}

function extractSelfHealEffect() {
  const match = modal.match(/useEffect\(\(\) => \{[\s\S]*?void persistOnboardingSelfHeal\(\)[\s\S]*?\n  \}, \[currentUserId, initialOnboardingVersion, persistOnboardingSelfHeal\]\)/)
  assert.ok(match)
  return match[0]
}

test('in-app onboarding completion writes the shared completion payload', () => {
  assert.match(modal, /buildOnboardingCompletionPayload/)
  assert.match(modal, /from\('profiles'\)\.update\(buildOnboardingCompletionPayload\(\)\)\.eq\('id', currentUserId\)/)
})

test('province sync stamps completion only through the onboarding-only path', () => {
  assert.match(modal, /const payload = \{[\s\S]*\.\.\.buildOnboardingCompletionPayload\(\),[\s\S]*province,[\s\S]*province_code: getProvinceCode\(province\),[\s\S]*\}/)
  assert.match(modal, /void syncProvinceToProfile\(draftProvince\)/)
  assert.match(modal, /await syncProvinceToProfile\(selectedProvince\)/)
})

test('self-heal is fire-and-forget, de-duped, and does not feed gate display state', () => {
  const selfHealCallback = extractSelfHealCallback()
  const selfHealEffect = extractSelfHealEffect()

  assert.match(modal, /const selfHealSyncRef = useRef<Set<string>>\(new Set\(\)\)/)
  assert.match(selfHealEffect, /shouldPersistOnboardingSelfHeal\([\s\S]*currentUserId,[\s\S]*initialOnboardingVersion,[\s\S]*isLocalIntroCurrent\(\)[\s\S]*\)/)
  assert.match(selfHealEffect, /const selfHealKey = getOnboardingSelfHealKey\(currentUserId\)/)
  assert.match(selfHealEffect, /selfHealSyncRef\.current\.add\(selfHealKey\)/)
  assert.match(selfHealEffect, /void persistOnboardingSelfHeal\(\)/)
  assert.doesNotMatch(selfHealCallback, /setProgress/)
  assert.doesNotMatch(selfHealCallback, /setPhase/)
  assert.doesNotMatch(selfHealCallback, /router\.(?:replace|push)/)
  assert.doesNotMatch(selfHealEffect, /setProgress/)
  assert.doesNotMatch(selfHealEffect, /setPhase/)
  assert.doesNotMatch(selfHealEffect, /router\.(?:replace|push)/)
})

test('onboarding persistence failure logs use fixed safe copies only', () => {
  assert.match(modal, /console\.warn\('Onboarding completion persistence failed'\)/)
  assert.match(modal, /console\.warn\('Onboarding self-heal persistence failed'\)/)
  assert.doesNotMatch(modal, /console\.warn\([^)]*error/)
  assert.doesNotMatch(modal, /console\.warn\([^)]*currentUserId/)
})
