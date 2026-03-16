'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PROVINCES = [
  '北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江',
  '上海','江苏','浙江','安徽','福建','江西','山东','河南',
  '湖北','湖南','广东','广西','海南','重庆','四川','贵州',
  '云南','西藏','陕西','甘肃','青海','宁夏','新疆',
]

const PROVINCE_CODE_MAP: Record<string, string> = {
  '北京':'BJ','天津':'TJ','河北':'HE','山西':'SX','内蒙古':'NM',
  '辽宁':'LN','吉林':'JL','黑龙江':'HL','上海':'SH','江苏':'JS',
  '浙江':'ZJ','安徽':'AH','福建':'FJ','江西':'JX','山东':'SD',
  '河南':'HA','湖北':'HB','湖南':'HN','广东':'GD','广西':'GX',
  '海南':'HI','重庆':'CQ','四川':'SC','贵州':'GZ','云南':'YN',
  '西藏':'XZ','陕西':'SN','甘肃':'GS','青海':'QH','宁夏':'NX','新疆':'XJ',
}

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [province, setProvince] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (step === 1) { setStep(2); return }

    setLoading(true)
    setError('')

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').update({
        username,
        province,
        province_code: PROVINCE_CODE_MAP[province] ?? '',
      }).eq('id', data.user.id)
      if (profileError) {
        // Profile update failed but user is created - non-fatal, they can update later
        console.warn('Profile update failed:', profileError.message)
      }
    }

    router.push('/explore')
    router.refresh()
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⛰</div>
        <div className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', textShadow: '0 0 10px var(--green-neon)', letterSpacing: 3 }}>
          PEAK TREKKER
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="mountain-card" style={{ padding: 24 }}>
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
            // REGISTER
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
                  <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="你的登山代号"
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderBottom: '2px solid var(--green-primary)', color: 'var(--text-primary)', fontFamily: 'Share Tech Mono', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>
                    籍贯省份 <span style={{ color: 'var(--green-primary)' }}>（为家乡省份积分）</span>
                  </div>
                  <select value={province} onChange={e => setProvince(e.target.value)} required
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderBottom: '2px solid var(--green-primary)', color: province ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'Share Tech Mono', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">选择省份...</option>
                    {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ padding: '10px 12px', background: 'rgba(45,106,79,0.08)', border: '1px solid rgba(45,106,79,0.2)', borderLeft: '3px solid var(--green-primary)', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', lineHeight: 1.8 }}>
                  🪪 初始：无执照<br />
                  完成3座1000m以下山峰，解锁初级登山证
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

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, fontFamily: 'Share Tech Mono', color: 'var(--text-muted)' }}>
            已有账号？{' '}
            <Link href="/auth/login" style={{ color: 'var(--green-bright)', textDecoration: 'none' }}>登录 →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
