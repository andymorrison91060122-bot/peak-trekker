'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExploreImportMethodCard } from '@/components/explore/ExploreImportMethodCard'

export function ImportRecordSheet({
  mountain,
  onClose,
}: {
  mountain: { id: string; name: string }
  onClose: () => void
}) {
  const router = useRouter()
  const titleId = useId()
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function open(path: '/import' | '/screenshot') {
    router.push(`${path}?mountainId=${encodeURIComponent(mountain.id)}`)
  }

  return (
    <div data-testid="mountain-import-record-sheet-root" style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
      <button
        type="button"
        aria-label="关闭导入记录"
        data-testid="mountain-import-record-sheet-scrim"
        className="mountain-import-record-sheet__scrim"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, padding: 0, border: 0, cursor: 'pointer',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
          opacity: entered ? 1 : 0,
          transition: 'opacity var(--motion-fast) var(--ease-standard)',
        }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="mountain-import-record-sheet"
        className="mountain-import-record-sheet__panel"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 'var(--page-max-width)', margin: '0 auto',
          background: 'var(--color-surface-variant)', borderTop: '1px solid var(--color-outline)',
          borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
          boxShadow: '0 -18px 36px rgba(0,0,0,.28)',
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform var(--motion-enter) var(--ease-out)',
        }}
      >
        <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
          <span style={{ width: 36, height: 4, borderRadius: 'var(--radius-pill)', background: 'rgba(255,255,255,.18)' }} />
        </div>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 20px' }}>
          <div>
            <h2 id={titleId} style={{ margin: 0, color: 'var(--color-on-surface)', fontSize: 17, lineHeight: '24px', fontWeight: 700 }}>导入记录</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-m-size)', lineHeight: 'var(--font-label-m-line)' }}>把以前走过的山行带回来</p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            data-testid="mountain-import-record-sheet-close"
            onClick={onClose}
            style={{ width: 44, height: 44, marginRight: -10, border: 0, background: 'transparent', color: 'var(--color-on-surface)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-4) calc(var(--space-5) + env(safe-area-inset-bottom))' }}>
          <ExploreImportMethodCard
            kind="import"
            title="导入轨迹记录"
            description="GPX / FIT · 校验是否在当前山峰附近"
            onClick={() => open('/import')}
            src="/explore/explore-empty-import.mp4"
            poster="/explore/explore-empty-import-poster.jpg"
            primary
          />
          <ExploreImportMethodCard
            kind="screenshot"
            title="识别成绩截图"
            description="把别家 App 的记录变成一次山行"
            onClick={() => open('/screenshot')}
            src="/explore/explore-empty-shot.mp4"
            poster="/explore/explore-empty-shot-poster.jpg"
          />
        </div>
      </section>
      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          .mountain-import-record-sheet__scrim,
          .mountain-import-record-sheet__panel {
            transition: none !important;
          }

          .mountain-import-record-sheet__scrim {
            opacity: 1 !important;
          }

          .mountain-import-record-sheet__panel {
            transform: none !important;
          }
        }
      `}</style>
    </div>
  )
}
