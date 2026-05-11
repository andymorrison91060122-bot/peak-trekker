'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useHelpSheet } from './useHelpSheet'

export type HelpLinkProps = {
  anchor: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export function HelpLink({ anchor, children = '查看说明', className, style }: HelpLinkProps) {
  const { open } = useHelpSheet()

  return (
    <button
      type="button"
      data-help-anchor={anchor}
      className={className}
      onClick={() => open(anchor)}
      style={{
        padding: 0,
        border: 0,
        background: 'transparent',
        color: 'var(--color-on-surface-variant)',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 'var(--font-label-m-size)',
        lineHeight: 'var(--font-label-m-line)',
        fontWeight: 500,
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        textDecorationColor: 'color-mix(in srgb, var(--color-on-surface-variant) 50%, transparent)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
