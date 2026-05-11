'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function Icon({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return (
    <span
      style={{
        width: 30,
        height: 30,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 10,
        background: active ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)' : 'transparent',
        border: active ? '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)' : '1px solid transparent',
      }}
    >
      {children}
    </span>
  )
}

const TabIcons = {
  explore: (active: boolean) => (
    <Icon active={active}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 17L9.8 8.2a1 1 0 0 1 1.7 0L20 17" stroke={active ? 'var(--color-success)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 17h10" stroke={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </Icon>
  ),
  archive: (active: boolean) => (
    <Icon active={active}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3.5 18.5l5-8.2 4 5.4 2.8-3.7 5.2 6.5" stroke={active ? 'var(--color-success)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 18.2c2.1-1.2 4.2-1.1 6.2.2 1.9 1.2 3.6 1.3 5.2.2" stroke={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="4.2" cy="18.4" r="1.1" fill={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} />
      </svg>
    </Icon>
  ),
  trek: (active: boolean) => (
    <Icon active={active}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M11 5h2" stroke={active ? 'var(--color-success)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 5v11" stroke={active ? 'var(--color-success)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8.5 20h7" stroke={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 8.5c1.5.5 3 1.7 4 3.5 1.2-1.8 2.5-3 4-3.5" stroke={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </Icon>
  ),
  community: (active: boolean) => (
    <Icon active={active}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 15.5c0-1.6 1.4-3 3-3s3 1.4 3 3" stroke={active ? 'var(--color-success)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 15.5c0-1.6 1.4-3 3-3s3 1.4 3 3" stroke={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="9" r="2" stroke={active ? 'var(--color-success)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" />
        <circle cx="15" cy="9" r="2" stroke={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" />
      </svg>
    </Icon>
  ),
  profile: (active: boolean) => (
    <Icon active={active}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8.5" r="3" stroke={active ? 'var(--color-success)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" />
        <path d="M6.5 18c1.6-2.4 3.7-3.6 5.5-3.6S15.9 15.6 17.5 18" stroke={active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </Icon>
  ),
}

const tabs = [
  { href: '/explore', label: '探索', icon: TabIcons.explore },
  { href: '/archive', label: '山行', icon: TabIcons.archive },
  { href: '/trek', label: '出发', icon: TabIcons.trek },
  { href: '/community', label: '山友圈', icon: TabIcons.community },
  { href: '/profile', label: '我的', icon: TabIcons.profile },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
        backdropFilter: 'blur(18px)',
        borderTop: '1px solid color-mix(in srgb, var(--color-on-surface) 8%, transparent)',
      }}
    >
      <div
        className="flex justify-around items-center max-w-lg mx-auto"
        style={{ padding: '10px 12px max(12px, env(safe-area-inset-bottom))' }}
      >
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-1.5"
              style={{ minWidth: 58, flex: 1, textDecoration: 'none' }}
            >
              {tab.icon(isActive)}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                  lineHeight: 1,
                }}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
