'use client'

import { Suspense, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { normalizeAuthReturnPath } from '@/lib/auth-redirect'

function LoginPageContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const supabase = createSupabaseBrowserClient()
  const returnTo = normalizeAuthReturnPath(searchParams.get('from'), '/explore')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials' ? '邮箱或密码错误' : error.message)
    } else {
      window.location.assign(returnTo)
      return
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      {/* Logo区 */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⛰</div>
        <div className="font-pixel" style={{ fontSize: 12, color: 'var(--green-neon)', textShadow: '0 0 10px var(--green-neon)', letterSpacing: 3 }}>
          PEAK TREKKER
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontFamily: 'Share Tech Mono' }}>
          记录你的登山之旅
        </div>
      </div>

      {/* 登录表单 */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="mountain-card" style={{ padding: 24 }}>
          <div className="font-pixel" style={{ fontSize: 9, color: 'var(--green-bright)', marginBottom: 20, letterSpacing: 1 }}>
            {'// LOGIN'}
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>
                EMAIL
              </div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderBottom: '2px solid var(--green-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'Share Tech Mono', fontSize: 12,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>
                PASSWORD
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderBottom: '2px solid var(--green-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'Share Tech Mono', fontSize: 12,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(230,57,70,0.1)',
                border: '1px solid rgba(230,57,70,0.3)',
                borderLeft: '3px solid #E63946',
                color: '#E63946', fontSize: 11,
                fontFamily: 'Share Tech Mono',
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="pixel-btn"
              style={{ width: '100%', padding: '14px', fontSize: 9, letterSpacing: 2, marginTop: 4 }}
            >
              {loading ? '登录中...' : '▶ 开始登山'}
            </button>
          </form>

          {/* 分割线 */}
          <div className="mountain-divider" style={{ margin: '20px 0' }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>OR</span>
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'Share Tech Mono', color: 'var(--text-muted)' }}>
            还没有账号？{' '}
            <Link
              href={returnTo === '/explore' ? '/auth/register' : `/auth/register?from=${encodeURIComponent(returnTo)}`}
              style={{ color: 'var(--green-bright)', textDecoration: 'none' }}
            >
              注册 →
            </Link>
          </div>
        </div>

        {/* 底部装饰 */}
        <div style={{
          marginTop: 24, textAlign: 'center',
          fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono',
          lineHeight: 2,
        }}>
          <div>▲ 已收录 20 座国内山峰</div>
          <div>⛺ 攀登执照系统保障安全</div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  )
}
