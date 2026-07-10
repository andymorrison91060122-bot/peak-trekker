'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import IntroCarousel from '@/components/onboarding/IntroCarousel'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  ONBOARDING_EVENT,
  ONBOARDING_VERSION,
  buildOnboardingCompletionPayload,
  getOnboardingSelfHealKey,
  getOnboardingProgress,
  getProvinceDraft,
  isLocalIntroCurrent,
  migrateLegacyOnboarding,
  setIntroSeen,
  setProvinceDraft as persistProvinceDraft,
  shouldPersistOnboardingSelfHeal,
} from '@/lib/onboarding'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { PROVINCES, getProvinceCode } from '@/lib/provinces'
import type { OnboardingPhase, OnboardingProgress } from '@/types'

const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')
const INTRO_SLIDE_COUNT = 3

type ProvinceStage = 'select' | 'license'

function derivePhase(progress: OnboardingProgress, province: string | null): OnboardingPhase {
  if (!progress.introSeen) return 'intro'
  if (!province) return 'province'
  return 'done'
}

export default function OnboardingModal({
  initialProvince,
  initialOnboardingVersion,
  currentUserId,
}: {
  initialProvince: string | null
  initialOnboardingVersion: string | null
  currentUserId: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const interactedRef = useRef(false)
  const provinceSyncRef = useRef<string | null>(null)
  const selfHealSyncRef = useRef<Set<string>>(new Set())
  const supportsEntryFlow = pathname === '/explore'
  const suppressOnboardingUI = pathname === '/onboarding-qa'

  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<OnboardingPhase>('done')
  const [progress, setProgress] = useState<OnboardingProgress>({
    introSeen: false,
    provinceChosen: false,
    version: ONBOARDING_VERSION,
  })
  const [draftProvince, setDraftProvince] = useState<string | null>(initialProvince)
  const [selectedProvince, setSelectedProvince] = useState(initialProvince ?? '')
  const [provinceStage, setProvinceStage] = useState<ProvinceStage>('select')
  const [introStep, setIntroStep] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  const resolvePostIntroPhase = useCallback(
    (province: string | null) =>
      derivePhase(
        {
          ...progress,
          introSeen: true,
        },
        province
      ),
    [progress]
  )

  const refreshProgress = useCallback(() => {
    migrateLegacyOnboarding()

    const nextProgress = getOnboardingProgress(initialOnboardingVersion)
    const nextProvince = initialProvince ?? getProvinceDraft()

    setProgress(nextProgress)
    setDraftProvince(nextProvince)
    setSelectedProvince((value) => value || nextProvince || '')
    setPhase((current) => {
      if (provinceStage === 'license') return current
      return derivePhase(nextProgress, nextProvince)
    })
    setReady(true)
  }, [initialOnboardingVersion, initialProvince, provinceStage])

  const triggerHaptic = useCallback((duration = 18) => {
    if (!interactedRef.current) return
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    navigator.vibrate(duration)
  }, [])

  const syncProvinceToProfile = useCallback(
    async (province: string) => {
      if (!currentUserId) return
      const payload = {
        ...buildOnboardingCompletionPayload(),
        province,
        province_code: getProvinceCode(province),
      }

      const { error } = await supabase.from('profiles').update(payload).eq('id', currentUserId)
      if (!error) return

      await supabase
        .from('profiles')
        .update({
          province,
          province_code: getProvinceCode(province),
        })
        .eq('id', currentUserId)
    },
    [currentUserId, supabase]
  )

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
    setProgress((value) => ({ ...value, introSeen: true }))
    setPhase(resolvePostIntroPhase(draftProvince))
    void syncOnboardingVersionToProfile()
  }, [draftProvince, resolvePostIntroPhase, syncOnboardingVersionToProfile])

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
    if (!initialProvince) return
    if (getProvinceDraft() === initialProvince) return
    persistProvinceDraft(initialProvince)
  }, [initialProvince])

  useEffect(() => {
    if (currentUserId && draftProvince && provinceSyncRef.current !== draftProvince && !initialProvince) {
      provinceSyncRef.current = draftProvince
      void syncProvinceToProfile(draftProvince)
    }
  }, [currentUserId, draftProvince, initialProvince, syncProvinceToProfile])

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

  useEffect(() => {
    if (phase !== 'province' || provinceStage !== 'license') return
    const timer = window.setTimeout(() => {
      setProvinceStage('select')
      setPhase('done')
      if (pathname !== '/explore') {
        router.replace('/explore')
      }
    }, 1250)

    return () => window.clearTimeout(timer)
  }, [pathname, phase, provinceStage, router])

  if (!ready) return null

  if (suppressOnboardingUI || phase === 'done') return null

  async function handleProvinceConfirm() {
    if (!selectedProvince) return

    interactedRef.current = true
    persistProvinceDraft(selectedProvince)
    setDraftProvince(selectedProvince)
    setProgress((value) => ({ ...value, provinceChosen: true }))
    setProvinceStage('license')
    triggerHaptic(18)
    await syncProvinceToProfile(selectedProvince)
  }

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

  if ((phase === 'intro' || phase === 'province') && !supportsEntryFlow) {
    return null
  }

  if (phase === 'intro') {
    return (
      <IntroCarousel
        currentIndex={introStep}
        reducedMotion={reducedMotion}
        onNext={handleIntroAdvance}
        onSkip={handleIntroSkip}
      />
    )
  }

  if (phase === 'province') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 180,
          background: 'rgba(10,12,14,0.84)',
          backdropFilter: 'blur(18px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div className="surface-card" style={{ width: '100%', maxWidth: 420, padding: 22 }}>
          {provinceStage === 'license' ? (
            <div style={{ display: 'grid', gap: 18 }}>
              <div className="font-mono" style={{ fontSize: 12, color: 'var(--green-bright)' }}>
                登山执照已准备好
              </div>
              <div
                className="surface-card"
                style={{
                  padding: 22,
                  background:
                    'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(255,255,255,0.03)), linear-gradient(180deg, rgba(23,26,29,0.98), rgba(18,20,22,0.98))',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                  <div>
                    <div className="font-pixel" style={{ fontSize: 24, marginBottom: 6 }}>Peak Trekker</div>
                    <div className="section-subtitle">你的登山执照已准备好，先从第一座山开始。</div>
                  </div>
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 999,
                      background: 'rgba(34,197,94,0.12)',
                      color: 'var(--green-bright)',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    无执照
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <LicenseRow label="归属地" value={selectedProvince} />
                  <LicenseRow label="接下来" value="找到第一座山，开启第一次真实记录" />
                  <LicenseRow label="升级条件" value="完成 3 座低海拔山峰的真实登顶" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="font-mono" style={{ fontSize: 12, color: '#f6d28d' /* illustration-gold */, marginBottom: 10 }}>
                选择归属地
              </div>
              <div className="font-pixel" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 10 }}>
                先选一个与你有连接的地方。
              </div>
              <div className="section-subtitle" style={{ fontSize: 14, marginBottom: 18 }}>
                {provinceRankingEnabled
                  ? '选择你的籍贯或常驻省。首页会优先展示本省热门，后续注册也会自动预填这里的归属地。'
                  : '选择你的籍贯或常驻省。后续注册也会自动预填这里的归属地。'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, maxHeight: 280, overflowY: 'auto', marginBottom: 18 }}>
                {PROVINCES.map((province) => {
                  const active = selectedProvince === province
                  return (
                    <button
                      key={province}
                      type="button"
                      onClick={() => {
                        interactedRef.current = true
                        setSelectedProvince(province)
                      }}
                      className={active ? 'primary-btn' : 'secondary-btn'}
                      style={{
                        minHeight: 44,
                        padding: '10px 8px',
                        justifyContent: 'center',
                        boxShadow: active ? '0 10px 18px rgba(34, 197, 94, 0.16)' : 'none',
                      }}
                    >
                      {province}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    interactedRef.current = true
                    setPhase('done')
                    triggerHaptic(10)
                  }}
                >
                  稍后再选
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  style={{ flex: 1.3 }}
                  disabled={!selectedProvince}
                  onClick={handleProvinceConfirm}
                >
                  生成空白执照
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}

function LicenseRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <div className="section-subtitle">{label}</div>
      <div className="font-pixel" style={{ fontSize: 14, textAlign: 'right' }}>{value}</div>
    </div>
  )
}
