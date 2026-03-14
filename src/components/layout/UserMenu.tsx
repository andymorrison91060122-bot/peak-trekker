'use client'

import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

const LICENSE_ICON: Record<string, string> = {
  none: '○',
  basic: '◉',
  intermediate: '◈',
  advanced: '★',
}

export default function UserMenu({
  user,
  profile,
}: {
  user: User | null
  profile: { username: string; license_level: string; mountain_count: number } | null
}) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/explore')
    router.refresh()
  }

  if (!user || !profile) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <Link href="/auth/login" style={{
          fontFamily: 'Press Start 2P', fontSize: 7,
          color: 'var(--text-muted)', textDecoration: 'none',
          padding: '4px 8px',
          border: '1px solid var(--border-color)',
        }}>登录</Link>
        <Link href="/auth/register" className="pixel-btn" style={{ fontSize: 7, padding: '4px 8px' }}>注册</Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* 执照标识 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontFamily: 'Share Tech Mono', fontSize: 10,
        color: 'var(--green-bright)',
      }}>
        <span style={{ color: 'var(--green-neon)' }}>{LICENSE_ICON[profile.license_level]}</span>
        <span>{profile.mountain_count}座</span>
      </div>

      {/* 用户名 */}
      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-primary)' }}>
        {profile.username}
      </div>

      {/* 退出 */}
      <button onClick={handleLogout} style={{
        background: 'transparent', border: 'none',
        fontFamily: 'Share Tech Mono', fontSize: 10,
        color: 'var(--text-muted)', cursor: 'pointer',
        padding: '2px 6px',
      }}>
        退出
      </button>
    </div>
  )
}
