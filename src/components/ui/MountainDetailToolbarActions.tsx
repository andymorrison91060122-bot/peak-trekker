'use client'

import { useEffect, useRef, useState } from 'react'
import IconActionButton, { ActionGlyph } from '@/components/ui/IconActionButton'

const SECTION_LINKS = [
  { label: '核心信息', href: '#mountain-overview' },
  { label: '山峰简介', href: '#mountain-intro' },
  { label: '静态路线参考', href: '#route-reference' },
  { label: '天气提醒', href: '#weather-guidance' },
]

export default function MountainDetailToolbarActions() {
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  async function shareDetail() {
    const url = window.location.href
    const title = document.title || '山峰详情'

    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
    } catch {
      // Fall through to clipboard when native share is unavailable or cancelled.
    }

    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Ignore clipboard failures to keep the button lightweight.
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div className="page-toolbar__actions">
        <IconActionButton
          icon={<ActionGlyph name="share" />}
          label="分享山峰详情"
          onClick={() => void shareDetail()}
        />
        <IconActionButton
          icon={<ActionGlyph name="more" />}
          label="更多区块"
          onClick={() => setMenuOpen((value) => !value)}
          active={menuOpen}
        />
      </div>

      {menuOpen && (
        <div
          className="surface-card"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 168,
            padding: 8,
            display: 'grid',
            gap: 6,
            zIndex: 12,
          }}
        >
          {SECTION_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="secondary-btn"
              style={{ minHeight: 40, justifyContent: 'flex-start', textDecoration: 'none', padding: '0 12px' }}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
