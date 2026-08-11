'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import IntroCarousel from '@/components/onboarding/IntroCarousel'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  ONBOARDING_EVENT,
  buildOnboardingCompletionPayload,
  getOnboardingSelfHealKey,
  hasIntroSeen,
  isLocalIntroCurrent,
  migrateLegacyOnboarding,
  setIntroSeen,
  shouldPersistOnboardingSelfHeal,
} from '@/lib/onboarding'
import type { OnboardingPhase } from '@/types'

const INTRO_SLIDE_COUNT = 3

function derivePhase(introSeen: boolean): OnboardingPhase {
  return introSeen ? 'done' : 'intro'
}

export default function OnboardingModal({
  initialOnboardingVersion,
  currentUserId,
}: {
  initialOnboardingVersion: string | null
  currentUserId: string | null
}) {
  const pathname = usePathname()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const interactedRef = useRef(false)
  const selfHealSyncRef = useRef<Set<string>>(new Set())
  const supportsEntryFlow = pathname === '/explore'
  const suppressOnboardingUI = pathname === '/onboarding-qa'

  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<OnboardingPhase>('done')
  const [introStep, setIntroStep] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  const refreshProgress = useCallback(() => {
    migrateLegacyOnboarding()
    setPhase(derivePhase(hasIntroSeen(initialOnboardingVersion)))
    setReady(true)
  }, [initialOnboardingVersion])

  const triggerHaptic = useCallback((duration = 18) => {
    if (!interactedRef.current) return
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    navigator.vibrate(duration)
  }, [])

  const syncOnboardingVersionToProfile = useCallback(async () => {
    if (!currentUserId) return
    try {
      const { error } = await supabase.from('profiles').update(buildOnboardingCompletionPayload()).eq('id', currentUserId)
      if (error) console.warn('Onboarding completion persistence failed')
    } catch {
      console.warn('Onboarding completion persistence failed')
    }
  }, [currentUserId, supabase])

  const persistOnboardingSelfHeal = useCallback(async () => {
    if (!currentUserId) return
    try {
      const { error } = await supabase.from('profiles').update(buildOnboardingCompletionPayload()).eq('id', currentUserId)
      if (error) console.warn('Onboarding self-heal persistence failed')
    } catch {
      console.warn('Onboarding self-heal persistence failed')
    }
  }, [currentUserId, supabase])

  const completeIntro = useCallback(() => {
    setIntroSeen()
    setPhase('done')
    void syncOnboardingVersionToProfile()
  }, [syncOnboardingVersionToProfile])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => refreshProgress())
    return () => window.cancelAnimationFrame(frame)
  }, [refreshProgress])

  useEffect(() => {
    if (!currentUserId) return
    if (
      !shouldPersistOnboardingSelfHeal(
        currentUserId,
        initialOnboardingVersion,
        isLocalIntroCurrent()
      )
    ) {
      return
    }

    const selfHealKey = getOnboardingSelfHealKey(currentUserId)
    if (selfHealSyncRef.current.has(selfHealKey)) return
    selfHealSyncRef.current.add(selfHealKey)
    void persistOnboardingSelfHeal()
  }, [currentUserId, initialOnboardingVersion, persistOnboardingSelfHeal])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  useEffect(() => {
    const handleUpdate = () => refreshProgress()
    window.addEventListener(ONBOARDING_EVENT, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(ONBOARDING_EVENT, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [refreshProgress])

  if (!ready) return null
  if (suppressOnboardingUI || phase === 'done') return null
  if (phase === 'intro' && !supportsEntryFlow) return null

  function handleIntroAdvance() {
    interactedRef.current = true
    if (introStep >= INTRO_SLIDE_COUNT - 1) {
      completeIntro()
      triggerHaptic(14)
      return
    }

    setIntroStep((value) => Math.min(value + 1, INTRO_SLIDE_COUNT - 1))
    triggerHaptic(10)
  }

  function handleIntroSkip() {
    interactedRef.current = true
    completeIntro()
    triggerHaptic(12)
  }

  return (
    <IntroCarousel
      currentIndex={introStep}
      reducedMotion={reducedMotion}
      onNext={handleIntroAdvance}
      onSkip={handleIntroSkip}
    />
  )
}
