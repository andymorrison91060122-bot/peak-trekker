import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const modal = readFileSync('src/components/ui/OnboardingModal.tsx', 'utf8')
const mainLayout = readFileSync('src/app/(main)/layout.tsx', 'utf8')

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

test('production onboarding state is intro-to-done and never depends on province data', () => {
  assert.match(modal, /function derivePhase\(introSeen: boolean\): OnboardingPhase \{\s*return introSeen \? 'done' : 'intro'/)
  assert.match(modal, /derivePhase\(hasIntroSeen\(initialOnboardingVersion\)\)/)
  assert.match(modal, /setPhase\('done'\)/)
  assert.doesNotMatch(modal, /initialProvince/)
  assert.doesNotMatch(modal, /getProvinceDraft/)
  assert.doesNotMatch(modal, /setProvinceDraft/)
  assert.doesNotMatch(modal, /syncProvinceToProfile/)
  assert.doesNotMatch(modal, /getProvinceCode/)
  assert.doesNotMatch(modal, /PROVINCES/)
  assert.doesNotMatch(modal, /phase === 'province'/)
})

test('main layout reads onboarding version without hydrating province into the gate', () => {
  assert.match(mainLayout, /\.select\('onboarding_version'\)/)
  assert.match(mainLayout, /initialOnboardingVersion=\{initialOnboardingVersion\}/)
  assert.match(mainLayout, /currentUserId=\{user\?\.id \?\? null\}/)
  assert.doesNotMatch(mainLayout, /initialProvince/)
  assert.doesNotMatch(mainLayout, /province,onboarding_version/)
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
