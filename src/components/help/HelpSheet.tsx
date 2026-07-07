'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { FAQ_BY_ANCHOR } from '@/lib/faq-content'

export type HelpSheetProps = {
  anchor: string
  closing: boolean
  onClose: () => void
}

export function HelpSheet({ anchor, closing, onClose }: HelpSheetProps) {
  const item = FAQ_BY_ANCHOR[anchor]
  const titleId = useId()
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [anchor])

  if (!item) return null

  const active = entered && !closing
  const faqHref = `/faq?anchor=${encodeURIComponent(anchor)}`

  return (
    <div
      data-testid="help-sheet-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        aria-label="关闭说明"
        data-testid="help-sheet-scrim"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          padding: 0,
          border: 0,
          background: 'rgba(0,0,0,0.55)',
          opacity: active ? 1 : 0,
          backdropFilter: 'blur(2px)',
          transition: 'opacity var(--motion-fast) var(--ease-standard)',
          cursor: 'pointer',
        }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="help-sheet"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderTop: '1px solid var(--color-outline)',
          boxShadow: '0 -18px 36px rgba(0,0,0,0.28)',
          transform: active ? 'translateY(0)' : 'translateY(100%)',
          transition: active
            ? 'transform var(--motion-enter) var(--ease-out)'
            : 'transform var(--motion-base) var(--ease-standard)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
          <div style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.18)' }} />
        </div>
        <div style={{ padding: '4px 20px 0' }}>
          <div
            style={{
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              lineHeight: '14px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {item.group.title}
          </div>
          <h2
            id={titleId}
            style={{
              margin: '8px 0 0',
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-l-size)',
              lineHeight: 'var(--font-title-l-line)',
              fontWeight: 700,
            }}
          >
            {item.q}
          </h2>
        </div>
        <div
          style={{
            padding: '12px 20px 4px',
            overflowY: 'auto',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'calc(var(--font-body-m-line) * 1.12)',
            whiteSpace: 'pre-line',
          }}
        >
          {item.a}
        </div>
        <div style={{ padding: '14px 20px 22px', display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            href={faqHref}
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            查看更多 FAQ
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}
