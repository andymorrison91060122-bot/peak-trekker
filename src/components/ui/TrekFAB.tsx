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
        bottom: 88,
        right: 20,
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: 'var(--green-primary)',
        color: '#000',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(74, 222, 128, 0.5)',
        zIndex: 900,
        transition: 'transform 0.2s, box-shadow 0.2s',
        gap: 2,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.1)'
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(74, 222, 128, 0.6)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(74, 222, 128, 0.5)'
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>⛰</span>
      <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'Share Tech Mono', lineHeight: 1 }}>出发</span>
    </button>
  )
}
