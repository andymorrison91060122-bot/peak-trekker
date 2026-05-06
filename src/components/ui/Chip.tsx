'use client'

import type { ReactNode } from 'react'

export interface ChipProps {
  children: ReactNode
  active?: boolean
  tone?: 'success' | 'warn' | 'error'
  onClick?: () => void
  className?: string
}

type ChipTone = NonNullable<ChipProps['tone']> | 'active'

const toneStyles: Record<
  ChipTone,
  {
    background: string
    color: string
    borderColor: string
  }
> = {
  active: {
    background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
    color: 'var(--color-success)',
    borderColor: 'color-mix(in srgb, var(--color-primary) 26%, transparent)',
  },
  success: {
    background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
    color: 'var(--color-success)',
    borderColor: 'color-mix(in srgb, var(--color-success) 26%, transparent)',
  },
  warn: {
    background: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
    color: 'var(--color-warning)',
    borderColor: 'color-mix(in srgb, var(--color-warning) 28%, transparent)',
  },
  error: {
    background: 'color-mix(in srgb, var(--color-error) 14%, transparent)',
    color: 'var(--color-error)',
    borderColor: 'color-mix(in srgb, var(--color-error) 28%, transparent)',
  },
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export default function Chip({
  children,
  active = false,
  tone,
  onClick,
  className,
}: ChipProps) {
  const selectedTone = active ? 'active' : tone
  const variant = selectedTone ? toneStyles[selectedTone] : null
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 'var(--radius-pill)',
    background: variant?.background ?? 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
    color: variant?.color ?? 'var(--color-on-surface-variant)',
    border: `1px solid ${variant?.borderColor ?? 'transparent'}`,
    fontSize: 'var(--font-label-s-size)',
    lineHeight: 'var(--font-label-s-line)',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    cursor: onClick ? 'pointer' : undefined,
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={joinClassNames('ui-chip', className)}
        data-active={active ? 'true' : 'false'}
        data-tone={tone}
        style={{
          ...style,
          appearance: 'none',
          font: 'inherit',
        }}
        onClick={onClick}
      >
        {children}
      </button>
    )
  }

  return (
    <span
      className={joinClassNames('ui-chip', className)}
      data-active={active ? 'true' : 'false'}
      data-tone={tone}
      style={style}
    >
      {children}
    </span>
  )
}
