'use client'

import type { CSSProperties } from 'react'
import { useHelpSheet } from './useHelpSheet'

export type HelpTriggerProps = {
  anchor: string
  size?: number
  className?: string
  style?: CSSProperties
}

export function HelpTrigger({ anchor, size = 16, className, style }: HelpTriggerProps) {
  const { open } = useHelpSheet()

  return (
    <button
      type="button"
      aria-label="查看说明"
      title="查看说明"
      data-help-anchor={anchor}
      className={className}
      onClick={() => open(anchor)}
      style={{
        width: 32,
        height: 32,
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: 0,
        borderRadius: 'var(--radius-pill)',
        background: 'transparent',
        color: 'var(--color-on-surface-variant)',
        cursor: 'pointer',
        transition: 'filter 120ms ease, background 120ms ease',
        ...style,
      }}
      onMouseDown={(event) => {
        event.currentTarget.style.filter = 'brightness(.94)'
      }}
      onMouseUp={(event) => {
        event.currentTarget.style.filter = ''
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.filter = ''
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M9.5 9.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5c0 1.6-2.5 1.7-2.5 3.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16.5" r=".9" fill="currentColor" />
      </svg>
    </button>
  )
}
