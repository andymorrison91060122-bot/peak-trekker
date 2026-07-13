'use client'

import { Suspense, useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  buildOnboardingCompletionPayload,
  getProvinceDraft,
  setIntroSeen,
  setProvinceDraft,
} from '@/lib/onboarding'
import { clearClientAuthReturnPath, resolveClientAuthReturnPath } from '@/lib/auth-redirect'
import { PROVINCES, getProvinceCode } from '@/lib/provinces'
import { validateNickname } from '@/lib/profile-nickname'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { attributionProperties, clearShareAttribution } from '@/lib/analytics/attribution'
import { trackEvent, trackEventNow } from '@/lib/analytics/client'
import { isFeatureEnabled } from '@/lib/feature-flags'

const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')

function RegisterPageContent() {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [province, setProvince] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const supabase = createSupabaseBrowserClient()
  const returnTo = resolveClientAuthReturnPath(searchParams.get('from'), '/explore')

  async function persistOnboardingCompletionToProfile(activeUserId: string) {
    try {
      const { error } = await supabase.from('profiles').update(buildOnboardingCompletionPayload()).eq('id', activeUserId)
      if (error) console.warn('Onboarding completion persistence failed during register')
    } catch {
      console.warn('Onboarding completion persistence failed during register')
    }
  }

  useEffect(() => {
    const draftProvince = getProvinceDraft()
    if (!draftProvince) return
    const frame = window.requestAnimationFrame(() => setProvince(draftProvince))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (step === 1) { setStep(2); return }

    const nicknameResult = validateNickname(username)
    if (!nicknameResult.ok) {
      setError(nicknameResult.error)
      return
    }
    const provinceCode = getProvinceCode(province)

    setLoading(true)
    setError('')
    trackEvent({
      event_type: 'auth',
      event_name: 'auth.register_attempt',
      properties: { return_to: returnTo },
    })

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname: nicknameResult.value,
          province,
          province_code: provinceCode,
        },
      },
    })
    if (signUpError) {
      console.warn('[auth-register] signup failed', signUpError)
      setError('注册暂时没有完成，请检查邮箱和密码后重试。')
      setLoading(false)
      return
    }

    let activeSession = data.session
    let activeUserId = data.user?.id ?? null

    if (!activeSession) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (!signInError && signInData.session) {
        activeSession = signInData.session
        activeUserId = signInData.user?.id ?? activeUserId
      }
    }

    setProvinceDraft(province)
    setIntroSeen()

    // 会话已建立时优先整页回跳，避免客户端路由在 cookie 同步阶段卡住。
    if (activeSession) {
      if (activeUserId) {
        await trackEventNow({
          event_type: 'auth',
          event_name: 'auth.register_complete',
          properties: { return_to: returnTo },
        })
        const attribution = attributionProperties(activeUserId)
        if (attribution) {
          await trackEventNow({
            event_type: 'business',
            event_name: 'business.share_link_register_attribution',
            properties: attribution,
          })
          clearShareAttribution()
        }
        await persistOnboardingCompletionToProfile(activeUserId)
      }
      clearClientAuthReturnPath()
      window.location.assign(returnTo)
      return
    }

    if (activeUserId) {
      await trackEventNow({
        event_type: 'auth',
        event_name: 'auth.register_complete',
        properties: { return_to: returnTo, login_required: true },
      })
      const attribution = attributionProperties(activeUserId)
      if (attribution) {
        await trackEventNow({
          event_type: 'business',
          event_name: 'business.share_link_register_attribution',
          properties: attribution,
        })
        clearShareAttribution()
      }
    }
    const loginHref =
      returnTo === '/explore'
        ? '/auth/login?registered=1'
        : `/auth/login?from=${encodeURIComponent(returnTo)}&registered=1`
    window.location.assign(loginHref)
  }

  return (
    <div className="pt-page-enter" style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div className="pt-page-enter" style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⛰</div>
        <div className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', textShadow: '0 0 10px var(--green-neon)', letterSpacing: 3 }}>
          PEAK TREKKER
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="mountain-card pt-page-enter pt-enter-d1" style={{ padding: 24 }}>
          {/* 步骤指示 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
            {[1, 2].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 20, height: 20,
                  background: step >= s ? 'var(--green-primary)' : 'var(--bg-secondary)',
                  border: `1px solid ${step >= s ? 'var(--green-primary)' : 'var(--border-color)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Press Start 2P', fontSize: 8,
                  color: step >= s ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>{s}</div>
                {s < 2 && <div style={{ width: 20, height: 1, background: step > s ? 'var(--green-primary)' : 'var(--border-color)' }} />}
              </div>
            ))}
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--text-muted)', marginLeft: 4 }}>
              {step === 1 ? '账号信息' : '个人资料'}
            </span>
          </div>

          <div className="font-pixel" style={{ fontSize: 9, color: 'var(--green-bright)', marginBottom: 20 }}>
            {'// REGISTER'}
          </div>

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {step === 1 ? (
              <>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>EMAIL</div>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com"
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderBottom: '2px solid var(--green-primary)', color: 'var(--text-primary)', fontFamily: 'Share Tech Mono', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>PASSWORD</div>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="至少6位" minLength={6}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderBottom: '2px solid var(--green-primary)', color: 'var(--text-primary)', fontFamily: 'Share Tech Mono', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>登山者昵称</div>
                  <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="给自己起个名字"
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderBottom: '2px solid var(--green-primary)', color: 'var(--text-primary)', fontFamily: 'Share Tech Mono', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>
                    籍贯省份 {provinceRankingEnabled ? <span style={{ color: 'var(--green-primary)' }}>（为家乡省份积分）</span> : null}
                  </div>
                  <select value={province} onChange={e => setProvince(e.target.value)} required
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderBottom: '2px solid var(--green-primary)', color: province ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'Share Tech Mono', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">选择省份...</option>
                    {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ padding: '10px 12px', background: 'rgba(45,106,79,0.08)', border: '1px solid rgba(45,106,79,0.2)', borderLeft: '3px solid var(--green-primary)', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', lineHeight: 1.8 }}>
                  🪪 初始：无执照<br />
                  完成3座1000m以下山峰，解锁初级执照
                </div>
              </>
            )}

            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderLeft: '3px solid #E63946', color: '#E63946', fontSize: 11, fontFamily: 'Share Tech Mono' }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="pixel-btn"
              style={{ width: '100%', padding: '14px', fontSize: 9, letterSpacing: 2, marginTop: 4 }}>
              {loading ? '处理中...' : step === 1 ? '下一步 →' : '▶ 创建登山档案'}
            </button>
          </form>

          <div className="pt-page-enter pt-enter-d2" style={{ textAlign: 'center', marginTop: 20, fontSize: 11, fontFamily: 'Share Tech Mono', color: 'var(--text-muted)' }}>
            已有账号？{' '}
            <Link
              href={returnTo === '/explore' ? '/auth/login' : `/auth/login?from=${encodeURIComponent(returnTo)}`}
              style={{ color: 'var(--green-bright)', textDecoration: 'none' }}
            >
              登录 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  )
}
