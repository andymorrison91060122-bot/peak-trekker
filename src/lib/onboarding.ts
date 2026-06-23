'use client'

import type { OnboardingProgress } from '@/types'

export const ONBOARDING_VERSION = '2026-v2'
export const LEGACY_ONBOARDED_KEY = 'peak_trekker_onboarded'
export const INTRO_SEEN_KEY = 'peak_trekker_intro_seen'
export const PROVINCE_DRAFT_KEY = 'peak_trekker_province_draft'
export const ONBOARDING_EVENT = 'peak-trekker:onboarding-update'

type LocalStorageReader = Pick<Storage, 'getItem'>

function isBrowser() {
  return typeof window !== 'undefined'
}

function emitUpdate() {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT))
}

export function migrateLegacyOnboarding() {
  return
}

export function buildOnboardingCompletionPayload(completedAt = new Date()) {
  return {
    onboarding_version: ONBOARDING_VERSION,
    onboarding_completed_at: completedAt.toISOString(),
  }
}

export function isLocalIntroCurrent(storage?: LocalStorageReader | null) {
  const source = storage ?? (isBrowser() ? window.localStorage : null)
  return source?.getItem(INTRO_SEEN_KEY) === ONBOARDING_VERSION
}

export function shouldPersistOnboardingSelfHeal(
  currentUserId: string | null,
  profileVersion: string | null,
  localIntroCurrent: boolean
) {
  return Boolean(currentUserId && localIntroCurrent && profileVersion !== ONBOARDING_VERSION)
}

export function getOnboardingSelfHealKey(userId: string) {
  return `${userId}:${ONBOARDING_VERSION}`
}

export function hasIntroSeen(profileVersion?: string | null) {
  if (profileVersion === ONBOARDING_VERSION) return true
  if (!isBrowser()) return false
  return isLocalIntroCurrent()
}

export function setIntroSeen() {
  if (!isBrowser()) return
  localStorage.setItem(INTRO_SEEN_KEY, ONBOARDING_VERSION)
  emitUpdate()
}

export function getProvinceDraft() {
  if (!isBrowser()) return null
  return localStorage.getItem(PROVINCE_DRAFT_KEY)
}

export function setProvinceDraft(province: string) {
  if (!isBrowser()) return
  localStorage.setItem(PROVINCE_DRAFT_KEY, province)
  emitUpdate()
}

export function restartIntroFlow() {
  if (!isBrowser()) return
  localStorage.removeItem(LEGACY_ONBOARDED_KEY)
  localStorage.removeItem(INTRO_SEEN_KEY)
  localStorage.removeItem(PROVINCE_DRAFT_KEY)
  emitUpdate()
}

export function getOnboardingProgress(profileVersion?: string | null): OnboardingProgress {
  return {
    introSeen: hasIntroSeen(profileVersion),
    provinceChosen: Boolean(getProvinceDraft()),
    version: ONBOARDING_VERSION,
  }
}
