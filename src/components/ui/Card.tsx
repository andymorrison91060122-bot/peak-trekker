import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  variant?: 'default' | 'elevated'
  noBorder?: boolean
  className?: string
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export default function Card({
  children,
  variant = 'default',
  noBorder = false,
  className,
}: CardProps) {
  const elevated = variant === 'elevated'

  return (
    <div
      className={joinClassNames('ui-card', className)}
      data-variant={variant}
      data-no-border={noBorder ? 'true' : 'false'}
      style={{
        background: elevated ? 'var(--color-surface-elevated)' : 'var(--color-surface-variant)',
        border: noBorder || elevated ? 'none' : '1px solid var(--color-outline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        minWidth: 0,
      }}
    >
      {children}
    </div>
  )
}
