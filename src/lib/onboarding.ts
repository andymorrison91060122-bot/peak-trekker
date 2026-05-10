'use client'

import type { OnboardingProgress } from '@/types'

export const ONBOARDING_VERSION = '2026-v1'
export const LEGACY_ONBOARDED_KEY = 'peak_trekker_onboarded'
export const INTRO_SEEN_KEY = 'peak_trekker_intro_seen'
export const PROVINCE_DRAFT_KEY = 'peak_trekker_province_draft'
export const ONBOARDING_EVENT = 'peak-trekker:onboarding-update'

function isBrowser() {
  return typeof window !== 'undefined'
}

function emitUpdate() {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT))
}

export function migrateLegacyOnboarding() {
  if (!isBrowser()) return

  const legacyDone = localStorage.getItem(LEGACY_ONBOARDED_KEY)
  if (!legacyDone) return

  if (localStorage.getItem(INTRO_SEEN_KEY) !== ONBOARDING_VERSION) {
    localStorage.setItem(INTRO_SEEN_KEY, ONBOARDING_VERSION)
  }
}

export function hasIntroSeen() {
  if (!isBrowser()) return false
  if (localStorage.getItem(LEGACY_ONBOARDED_KEY)) return true
  return localStorage.getItem(INTRO_SEEN_KEY) === ONBOARDING_VERSION
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

export function getOnboardingProgress(): OnboardingProgress {
  return {
    introSeen: hasIntroSeen(),
    provinceChosen: Boolean(getProvinceDraft()),
    version: ONBOARDING_VERSION,
  }
}
