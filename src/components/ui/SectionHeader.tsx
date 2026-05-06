'use client'

export interface SectionHeaderProps {
  title: string
  action?: { label: string; onClick: () => void }
  className?: string
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export default function SectionHeader({
  title,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={joinClassNames('ui-section-header', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        minWidth: 0,
      }}
    >
      <h2
        style={{
          margin: 0,
          minWidth: 0,
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-title-m-size)',
          lineHeight: 'var(--font-title-m-line)',
          fontWeight: 'var(--font-title-m-weight)',
        }}
      >
        {title}
      </h2>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-on-surface-variant)',
            font: 'inherit',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 'var(--font-label-m-weight)',
            padding: 0,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
