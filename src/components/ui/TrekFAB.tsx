'use client'

import { usePathname, useRouter } from 'next/navigation'

export default function TrekFAB() {
  const pathname = usePathname()
  const router = useRouter()

  // Only show on /explore, hide on /trek
  if (pathname !== '/explore') return null

  return (
    <button
      onClick={() => router.push('/trek')}
      aria-label="开始登山"
      style={{
        position: 'fixed',
        bottom: 'calc(80px + env(safe-area-inset-bottom))',
        right: 16,
        width: 64,
        height: 64,
        borderRadius: 18,
        background: 'var(--green-primary)',
        color: '#08120d',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 16px 32px rgba(34, 197, 94, 0.24)',
        zIndex: 900,
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease',
        gap: 4,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 18px 36px rgba(34, 197, 94, 0.32)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 16px 32px rgba(34, 197, 94, 0.24)'
      }}
      >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 4v13" stroke="#08120d" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 8c1.4.4 2.8 1.8 4 3.7 1.2-1.9 2.6-3.3 4-3.7" stroke="#08120d" strokeWidth="2" strokeLinecap="round" />
        <path d="M8.5 20h7" stroke="#08120d" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1 }}>开始</span>
    </button>
  )
}
