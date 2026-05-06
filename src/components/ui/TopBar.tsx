import type { ReactNode } from 'react'

export interface TopBarProps {
  title?: string
  leftAction?: ReactNode
  rightActions?: ReactNode
  transparent?: boolean
  className?: string
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export default function TopBar({
  title,
  leftAction,
  rightActions,
  transparent = false,
  className,
}: TopBarProps) {
  return (
    <header
      className={joinClassNames('ui-top-bar', className)}
      data-transparent={transparent ? 'true' : 'false'}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        height: 48,
        display: 'grid',
        gridTemplateColumns: 'minmax(80px, 1fr) minmax(0, auto) minmax(80px, 1fr)',
        alignItems: 'center',
        gap: 'var(--space-2)',
        paddingInline: 'var(--space-3)',
        background: transparent ? 'transparent' : 'color-mix(in srgb, var(--color-surface) 84%, transparent)',
        backdropFilter: transparent ? 'none' : 'blur(18px)',
        borderBottom: transparent ? 'none' : '1px solid color-mix(in srgb, var(--color-on-surface) 6%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 }}>
        {leftAction}
      </div>
      <div
        style={{
          minWidth: 0,
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-title-m-size)',
          lineHeight: 'var(--font-title-m-line)',
          fontWeight: 'var(--font-title-m-weight)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 'var(--space-2)',
          minWidth: 0,
        }}
      >
        {rightActions}
      </div>
    </header>
  )
}
