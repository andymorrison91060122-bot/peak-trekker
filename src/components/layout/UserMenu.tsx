'use client'

import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import IconActionButton, { ActionGlyph, IconActionLink } from '@/components/ui/IconActionButton'

const LICENSE_ICON: Record<string, string> = {
  none: '○',
  basic: '◉',
  intermediate: '◈',
  advanced: '★',
}

const LICENSE_LABEL: Record<string, string> = {
  none: '空白执照',
  basic: '初级执照',
  intermediate: '中级执照',
  advanced: '高级执照',
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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const progressRef = useRef<HTMLDivElement | null>(null)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/explore')
    router.refresh()
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!progressRef.current?.contains(event.target as Node)) {
        setDetailsOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDetailsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  if (!user || !profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Link href="/auth/login" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 40, padding: '0 12px' }}>
          登录
        </Link>
        <Link href="/auth/register" className="primary-btn" style={{ textDecoration: 'none', minHeight: 40, padding: '0 12px' }}>
          注册
        </Link>
      </div>
    )
  }

  const hasUnlockedPeak = profile.mountain_count > 0
  const progressSummary = hasUnlockedPeak ? `已点亮 ${profile.mountain_count} 座山峰` : '还没点亮第一座山'
  const nextAction = hasUnlockedPeak ? '继续去探索页解锁下一座山。' : '先去探索页挑一座山，开始第一条记录。'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0 }}>
      <div ref={progressRef} style={{ position: 'relative' }}>
        <button
          type="button"
          aria-label="查看登山进度"
          data-testid="header-progress-pill"
          onClick={() => setDetailsOpen((value) => !value)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 40,
            borderRadius: 999,
            border: hasUnlockedPeak ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(255,255,255,0.08)',
            background: hasUnlockedPeak ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)',
            color: hasUnlockedPeak ? 'var(--green-bright)' : 'var(--text-muted)',
            padding: '0 10px',
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: hasUnlockedPeak ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.06)',
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            {hasUnlockedPeak ? LICENSE_ICON[profile.license_level] : '△'}
          </span>
          {hasUnlockedPeak ? (
            <span
              aria-hidden="true"
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                padding: '0 6px',
                background: 'rgba(13,15,17,0.36)',
                color: 'var(--text-primary)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {profile.mountain_count}
            </span>
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: 'rgba(141,149,155,0.72)',
              }}
            />
          )}
        </button>

        {detailsOpen && (
          <div
            className="surface-card"
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 220,
              maxWidth: 'calc(100vw - 24px)',
              padding: 14,
              zIndex: 80,
              boxShadow: '0 18px 36px rgba(0,0,0,0.28)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              {profile.username}
            </div>
            <div className="section-subtitle" style={{ marginBottom: 6 }}>
              当前执照
            </div>
            <div className="font-pixel" style={{ fontSize: 17, marginBottom: 8 }}>
              {LICENSE_ICON[profile.license_level]} {LICENSE_LABEL[profile.license_level] ?? '空白执照'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {progressSummary}
            </div>
            <div className="section-subtitle">
              {nextAction}
            </div>
          </div>
        )}
      </div>

      <IconActionLink
        href="/profile"
        label="查看个人主页"
        icon={<ActionGlyph name="profile" />}
      />
      <IconActionButton
        label="退出登录"
        icon={<ActionGlyph name="logout" />}
        onClick={handleLogout}
      />
    </div>
  )
}
