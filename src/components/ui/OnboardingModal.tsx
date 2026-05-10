'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  ONBOARDING_EVENT,
  ONBOARDING_VERSION,
  getOnboardingProgress,
  getProvinceDraft,
  migrateLegacyOnboarding,
  setIntroSeen,
  setProvinceDraft as persistProvinceDraft,
} from '@/lib/onboarding'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { PROVINCES, getProvinceCode } from '@/lib/provinces'
import type { OnboardingPhase, OnboardingProgress } from '@/types'

const INTRO_SCENES = [
  {
    id: 'unlock',
    eyebrow: 'First Step',
    title: '先找一座你真的想去的山。',
    lines: ['Peak Trekker 会先帮你看清路线、海拔和门槛。', '第一次打开详情，就能知道这座山适不适合现在出发。'],
    accent: '#f6d28d',
  },
  {
    id: 'camera',
    eyebrow: 'Real Record',
    title: '开始记录后，轨迹、照片和海报会串成一条完整记录。',
    lines: ['确认目标山峰后再开始，能避免误以为已经开录。', '完成一次有效记录后，海报和分享素材会自动准备好。'],
    accent: '#7dd3fc',
  },
  {
    id: 'glory',
    eyebrow: 'After The Trek',
    title: '记录完成后，去“我的”管理记录，再决定要不要发到山友圈。',
    lines: ['你可以回看自己的登山记录、重新分享海报，或者把内容带去山友圈。', '整个流程先求顺，再慢慢补充自己的风格和故事。'],
    accent: '#a7f3d0',
  },
] as const

const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')

type ProvinceStage = 'select' | 'license'

function derivePhase(progress: OnboardingProgress, province: string | null): OnboardingPhase {
  if (!progress.introSeen) return 'intro'
  if (!province) return 'province'
  return 'done'
}

function sceneVisual(sceneId: (typeof INTRO_SCENES)[number]['id']) {
  if (sceneId === 'unlock') {
    return (
      <div
        className="surface-card"
        style={{
          position: 'relative',
          minHeight: 284,
          overflow: 'hidden',
          background:
            'radial-gradient(circle at top, rgba(246,210,141,0.14), transparent 26%), linear-gradient(180deg, rgba(25,28,31,0.98), rgba(15,17,19,0.98))',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '18% 0 auto',
            height: 160,
            background:
              'radial-gradient(circle at 50% 100%, rgba(255,255,255,0.06), transparent 55%), linear-gradient(180deg, transparent, rgba(0,0,0,0.34))',
            filter: 'blur(4px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '12%',
            right: '12%',
            bottom: 48,
            height: 160,
            borderRadius: '46% 46% 14px 14px / 80% 80% 14px 14px',
            background:
              'linear-gradient(180deg, rgba(90,96,104,0.18), rgba(40,44,49,0.9)), linear-gradient(135deg, rgba(255,255,255,0.05), transparent 45%)',
            clipPath: 'polygon(8% 100%, 26% 58%, 40% 40%, 50% 12%, 58% 34%, 72% 54%, 92% 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '44%',
            bottom: 74,
            width: 3,
            height: 106,
            borderRadius: 999,
            background: 'linear-gradient(180deg, rgba(246,210,141,0.05), rgba(246,210,141,0.95))',
            boxShadow: '0 0 26px rgba(246,210,141,0.4)',
            transform: 'rotate(22deg)',
            transformOrigin: 'bottom center',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '58%',
            bottom: 134,
            width: 18,
            height: 18,
            background: '#f6d28d',
            clipPath: 'polygon(0 0, 100% 30%, 0 60%)',
            boxShadow: '0 0 18px rgba(246,210,141,0.42)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {Array.from({ length: 18 }).map((_, index) => {
            const active = [1, 4, 9, 13, 16].includes(index)
            return (
              <span
                key={index}
                style={{
                  width: active ? 10 : 6,
                  height: active ? 10 : 6,
                  borderRadius: 999,
                  justifySelf: 'center',
                  background: active ? '#f6d28d' : 'rgba(141,149,155,0.38)',
                  boxShadow: active ? '0 0 12px rgba(246,210,141,0.4)' : 'none',
                }}
              />
            )
          })}
        </div>
      </div>
    )
  }

  if (sceneId === 'camera') {
    return (
      <div
        className="surface-card"
        style={{
          position: 'relative',
          minHeight: 284,
          overflow: 'hidden',
          background:
            'linear-gradient(180deg, rgba(17,20,22,0.12), rgba(17,20,22,0.78)), linear-gradient(120deg, #26343b 0%, #4d6c76 34%, #ecb173 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 18,
            borderRadius: 18,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.08), transparent 32%), linear-gradient(180deg, rgba(10,12,14,0.02), rgba(10,12,14,0.58))',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 30,
            right: 30,
            top: 30,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div className="font-mono" style={{ fontSize: 12, color: 'rgba(245,247,248,0.78)', marginBottom: 6 }}>
              SUMMIT MODE
            </div>
            <div className="font-pixel" style={{ fontSize: 36, lineHeight: 1, marginBottom: 4 }}>
              5396m
            </div>
            <div className="section-subtitle" style={{ color: 'rgba(245,247,248,0.72)' }}>
              梅里雪山 · Summit Card
            </div>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 999,
              background: 'rgba(8,15,12,0.56)',
              border: '1px solid rgba(110,231,161,0.24)',
              color: '#a7f3d0',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            VERIFIED
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 30,
            right: 30,
            bottom: 26,
            display: 'grid',
            gridTemplateColumns: '1.3fr 0.9fr',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div
            style={{
              padding: 14,
              borderRadius: 18,
              background: 'rgba(10,12,14,0.68)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {[
                ['总爬升', '1382m'],
                ['用时', '05:42'],
                ['顺位', '#019'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-pixel" style={{ fontSize: 16, marginBottom: 4 }}>{value}</div>
                  <div className="section-subtitle" style={{ fontSize: 11 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              padding: 14,
              borderRadius: 18,
              background: 'rgba(10,12,14,0.68)',
              border: '1px solid rgba(255,255,255,0.08)',
              minHeight: 94,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 14,
                borderRadius: 14,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.03), transparent), radial-gradient(circle at 72% 28%, rgba(125,211,252,0.24), transparent 24%)',
              }}
            />
            <svg viewBox="0 0 160 70" width="100%" height="66" style={{ position: 'relative' }}>
              <path d="M4 60 C24 54 36 44 48 46 C66 49 76 20 92 18 C105 16 117 38 128 34 C140 30 148 12 156 10" stroke="rgba(245,247,248,0.24)" strokeWidth="6" fill="none" strokeLinecap="round" />
              <path d="M4 60 C24 54 36 44 48 46 C66 49 76 20 92 18 C105 16 117 38 128 34 C140 30 148 12 156 10" stroke="#7dd3fc" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="156" cy="10" r="5" fill="#7dd3fc" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="surface-card"
      style={{
        position: 'relative',
        minHeight: 284,
        overflow: 'hidden',
        padding: 18,
        background:
          'radial-gradient(circle at top left, rgba(167,243,208,0.12), transparent 24%), linear-gradient(180deg, rgba(25,28,31,0.98), rgba(15,17,19,0.98))',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14, height: '100%' }}>
        <div
          style={{
            borderRadius: 18,
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div className="section-subtitle" style={{ color: 'rgba(245,247,248,0.76)' }}>个人成就墙</div>
          {[
            '四姑娘山征服者',
            '高海拔记录保持',
            '省域热度推动者',
          ].map((title) => (
            <div
              key={title}
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 10px 18px rgba(0,0,0,0.16)',
              }}
            >
              <div className="font-pixel" style={{ fontSize: 15 }}>{title}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            borderRadius: 18,
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            alignContent: 'start',
            gap: 12,
          }}
        >
          <div className="section-subtitle" style={{ color: 'rgba(245,247,248,0.76)' }}>省域荣耀榜</div>
          {[
            ['四川', 82],
            ['云南', 74],
            ['西藏', 69],
          ].map(([province, value], index) => (
            <div key={province}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="font-pixel" style={{ fontSize: 14 }}>{province}</div>
                <div className="font-mono" style={{ fontSize: 12, color: index === 0 ? '#a7f3d0' : 'var(--text-muted)' }}>
                  {value}%
                </div>
              </div>
              <div className="altitude-bar">
                <div
                  className="altitude-bar-fill"
                  style={{
                    width: `${value}%`,
                    background: index === 0 ? 'linear-gradient(90deg, rgba(34,197,94,0.6), #a7f3d0)' : undefined,
                  }}
                />
              </div>
            </div>
          ))}
          <div
            style={{
              marginTop: 'auto',
              padding: '10px 12px',
              borderRadius: 14,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.18)',
              color: '#a7f3d0',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            四川刚刚升到第 1 位
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingModal({
  initialProvince,
  currentUserId,
}: {
  initialProvince: string | null
  currentUserId: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const interactedRef = useRef(false)
  const provinceSyncRef = useRef<string | null>(null)
  const supportsEntryFlow = pathname === '/explore'
  const suppressOnboardingUI = pathname === '/onboarding-qa' || pathname === '/share-card-lab'

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

    const nextProgress = getOnboardingProgress()
    const nextProvince = initialProvince ?? getProvinceDraft()

    setProgress(nextProgress)
    setDraftProvince(nextProvince)
    setSelectedProvince((value) => value || nextProvince || '')
    setPhase((current) => {
      if (provinceStage === 'license') return current
      return derivePhase(nextProgress, nextProvince)
    })
    setReady(true)
  }, [initialProvince, provinceStage])

  const triggerHaptic = useCallback((duration = 18) => {
    if (!interactedRef.current) return
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    navigator.vibrate(duration)
  }, [])

  const syncProvinceToProfile = useCallback(
    async (province: string) => {
      if (!currentUserId) return
      const payload = {
        province,
        province_code: getProvinceCode(province),
        onboarding_version: ONBOARDING_VERSION,
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => refreshProgress())
    return () => window.cancelAnimationFrame(frame)
  }, [refreshProgress])

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
    if (phase !== 'intro' || reducedMotion || !supportsEntryFlow) return
    const timer = window.setTimeout(() => {
      if (introStep === INTRO_SCENES.length - 1) {
        setIntroSeen()
        setPhase(resolvePostIntroPhase(draftProvince))
        return
      }
      setIntroStep((value) => Math.min(value + 1, INTRO_SCENES.length - 1))
    }, 3400)

    return () => window.clearTimeout(timer)
  }, [draftProvince, introStep, phase, reducedMotion, resolvePostIntroPhase, supportsEntryFlow])

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

  const currentScene = INTRO_SCENES[introStep]

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
    if (reducedMotion || introStep === INTRO_SCENES.length - 1) {
      setIntroSeen()
      setPhase(resolvePostIntroPhase(draftProvince))
      triggerHaptic(14)
      return
    }

    setIntroStep((value) => Math.min(value + 1, INTRO_SCENES.length - 1))
    triggerHaptic(10)
  }

  function handleIntroSkip() {
    interactedRef.current = true
    setIntroSeen()
    setPhase(resolvePostIntroPhase(draftProvince))
    triggerHaptic(12)
  }

  if ((phase === 'intro' || phase === 'province') && !supportsEntryFlow) {
    return null
  }

  if (phase === 'intro') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 180,
          background:
            'radial-gradient(circle at top, rgba(255,255,255,0.04), transparent 26%), linear-gradient(180deg, rgba(13,15,17,0.94), rgba(9,11,12,0.98))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flex: 1 }}>
              {INTRO_SCENES.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => {
                    interactedRef.current = true
                    setIntroStep(index)
                  }}
                  style={{
                    flex: 1,
                    height: 6,
                    border: 'none',
                    borderRadius: 999,
                    background: index <= introStep ? currentScene.accent : 'rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                  }}
                  aria-label={`切换到第 ${index + 1} 幕`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleIntroSkip}
              style={{
                marginLeft: 12,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              跳过
            </button>
          </div>

          {reducedMotion ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {INTRO_SCENES.map((scene) => (
                <div key={scene.id} className="surface-card" style={{ padding: 18 }}>
                  <div className="font-mono" style={{ fontSize: 12, color: scene.accent, marginBottom: 10 }}>
                    {scene.eyebrow}
                  </div>
                  <div className="font-pixel" style={{ fontSize: 24, marginBottom: 10 }}>
                    {scene.title}
                  </div>
                  <div className="section-subtitle">
                    {scene.lines.join(' ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {sceneVisual(currentScene.id)}
              <div className="surface-card" style={{ padding: 20 }}>
                <div className="font-mono" style={{ fontSize: 12, color: currentScene.accent, marginBottom: 12 }}>
                  {currentScene.eyebrow}
                </div>
                <div className="font-pixel" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 12 }}>
                  {currentScene.title}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {currentScene.lines.map((line) => (
                    <div key={line} className="section-subtitle" style={{ fontSize: 14 }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="secondary-btn" style={{ flex: 1 }} onClick={handleIntroSkip}>
              稍后再说
            </button>
            <button type="button" className="primary-btn" style={{ flex: 1.4 }} onClick={handleIntroAdvance}>
              {introStep === INTRO_SCENES.length - 1 || reducedMotion ? '继续' : '快进下一幕'}
            </button>
          </div>
        </div>
      </div>
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
                Blank License Issued
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
                    <div className="section-subtitle">登山执照已下发，先从第一座山开始。</div>
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
                  <LicenseRow label="战区归属" value={selectedProvince} />
                  <LicenseRow label="当前任务" value="找到第一座山，开启第一次真实记录" />
                  <LicenseRow label="升级条件" value="完成 3 座低海拔山峰的真实登顶" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="font-mono" style={{ fontSize: 12, color: '#f6d28d', marginBottom: 10 }}>
                Identity Anchor
              </div>
              <div className="font-pixel" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 10 }}>
                告诉我，你将为哪片土地而战？
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
