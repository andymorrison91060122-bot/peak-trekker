'use client'

import type { ActivationTask, OnboardingProgress } from '@/types'

export const ONBOARDING_VERSION = '2026-v1'
export const LEGACY_ONBOARDED_KEY = 'peak_trekker_onboarded'
export const INTRO_SEEN_KEY = 'peak_trekker_intro_seen'
export const PROVINCE_DRAFT_KEY = 'peak_trekker_province_draft'
export const ACTIVATION_DONE_KEY = 'peak_trekker_activation_done'
export const ACTIVATION_TASKS_KEY = 'peak_trekker_activation_tasks'
export const ACTIVATION_DISMISS_KEY = 'peak_trekker_activation_dismiss'
export const ONBOARDING_SUPPRESSED_KEY = 'peak_trekker_onboarding_suppressed'
export const ONBOARDING_EVENT = 'peak-trekker:onboarding-update'

const DEFAULT_TASKS: Record<ActivationTask, boolean> = {
  find_peak: false,
  open_start: false,
  learn_share: false,
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function emitUpdate() {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT))
}

function cloneDefaultTasks() {
  return { ...DEFAULT_TASKS }
}

function readVersionedValue<T>(key: string): T | null {
  if (!isBrowser()) return null

  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { version?: string; value?: T }
    if (parsed.version !== ONBOARDING_VERSION) return null
    return parsed.value ?? null
  } catch {
    return null
  }
}

function writeVersionedValue<T>(key: string, value: T) {
  if (!isBrowser()) return
  localStorage.setItem(
    key,
    JSON.stringify({
      version: ONBOARDING_VERSION,
      value,
    })
  )
  emitUpdate()
}

export function migrateLegacyOnboarding() {
  if (!isBrowser()) return

  const legacyDone = localStorage.getItem(LEGACY_ONBOARDED_KEY)
  if (!legacyDone) return

  if (localStorage.getItem(INTRO_SEEN_KEY) !== ONBOARDING_VERSION) {
    localStorage.setItem(INTRO_SEEN_KEY, ONBOARDING_VERSION)
  }

  if (localStorage.getItem(ACTIVATION_DONE_KEY) !== ONBOARDING_VERSION) {
    localStorage.setItem(ACTIVATION_DONE_KEY, ONBOARDING_VERSION)
  }

  const payload = {
    version: ONBOARDING_VERSION,
    tasks: {
      find_peak: true,
      open_start: true,
      learn_share: true,
    },
  }
  localStorage.setItem(ACTIVATION_TASKS_KEY, JSON.stringify(payload))
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

export function getActivationTasks() {
  if (!isBrowser()) return cloneDefaultTasks()

  const raw = localStorage.getItem(ACTIVATION_TASKS_KEY)
  if (!raw) return cloneDefaultTasks()

  try {
    const parsed = JSON.parse(raw) as {
      version?: string
      tasks?: Partial<Record<ActivationTask, boolean>>
    }
    if (parsed.version !== ONBOARDING_VERSION || !parsed.tasks) {
      return cloneDefaultTasks()
    }
    return {
      find_peak: Boolean(parsed.tasks.find_peak),
      open_start: Boolean(parsed.tasks.open_start),
      learn_share: Boolean(parsed.tasks.learn_share),
    }
  } catch {
    return cloneDefaultTasks()
  }
}

export function setActivationTaskState(tasks: Partial<Record<ActivationTask, boolean>>) {
  if (!isBrowser()) return
  const nextTasks = {
    ...getActivationTasks(),
    ...tasks,
  }
  localStorage.setItem(
    ACTIVATION_TASKS_KEY,
    JSON.stringify({
      version: ONBOARDING_VERSION,
      tasks: nextTasks,
    })
  )
  emitUpdate()
}

export function markActivationTask(task: ActivationTask) {
  setActivationTaskState({ [task]: true })
}

export function hasActivationCompleted() {
  if (!isBrowser()) return false
  if (localStorage.getItem(LEGACY_ONBOARDED_KEY)) return true
  return localStorage.getItem(ACTIVATION_DONE_KEY) === ONBOARDING_VERSION
}

export function setActivationDone() {
  if (!isBrowser()) return
  localStorage.setItem(ACTIVATION_DONE_KEY, ONBOARDING_VERSION)
  localStorage.removeItem(ACTIVATION_DISMISS_KEY)
  localStorage.removeItem(ONBOARDING_SUPPRESSED_KEY)
  emitUpdate()
}

export function resetActivationDone() {
  if (!isBrowser()) return
  localStorage.removeItem(ACTIVATION_DONE_KEY)
  emitUpdate()
}

export function resetActivationProgress() {
  if (!isBrowser()) return
  localStorage.removeItem(ACTIVATION_DONE_KEY)
  localStorage.removeItem(ACTIVATION_TASKS_KEY)
  localStorage.removeItem(ACTIVATION_DISMISS_KEY)
  localStorage.removeItem(ONBOARDING_SUPPRESSED_KEY)
  emitUpdate()
}

export function restartIntroFlow() {
  if (!isBrowser()) return
  localStorage.removeItem(LEGACY_ONBOARDED_KEY)
  localStorage.removeItem(INTRO_SEEN_KEY)
  localStorage.removeItem(ACTIVATION_DONE_KEY)
  localStorage.removeItem(ACTIVATION_TASKS_KEY)
  localStorage.removeItem(ACTIVATION_DISMISS_KEY)
  localStorage.removeItem(ONBOARDING_SUPPRESSED_KEY)
  emitUpdate()
}

export function getActivationDismissPath() {
  return readVersionedValue<string>(ACTIVATION_DISMISS_KEY)
}

export function setActivationDismissPath(pathname: string) {
  writeVersionedValue(ACTIVATION_DISMISS_KEY, pathname)
}

export function clearActivationDismissPath() {
  if (!isBrowser()) return
  localStorage.removeItem(ACTIVATION_DISMISS_KEY)
  emitUpdate()
}

export function isOnboardingSuppressed() {
  if (!isBrowser()) return false
  return readVersionedValue<boolean>(ONBOARDING_SUPPRESSED_KEY) === true
}

export function setOnboardingSuppressed() {
  writeVersionedValue(ONBOARDING_SUPPRESSED_KEY, true)
}

export function clearOnboardingSuppressed() {
  if (!isBrowser()) return
  localStorage.removeItem(ONBOARDING_SUPPRESSED_KEY)
  emitUpdate()
}

export function getOnboardingProgress(): OnboardingProgress {
  const tasks = getActivationTasks()
  return {
    introSeen: hasIntroSeen(),
    provinceChosen: Boolean(getProvinceDraft()),
    activationCompleted: hasActivationCompleted(),
    version: ONBOARDING_VERSION,
    tasks,
  }
}

export function areAllActivationTasksComplete(tasks: Partial<Record<ActivationTask, boolean>>) {
  return Boolean(tasks.find_peak && tasks.open_start && tasks.learn_share)
}
