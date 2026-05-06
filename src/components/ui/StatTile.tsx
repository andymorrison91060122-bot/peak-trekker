export interface StatTileProps {
  label: string
  value: string
  accent?: boolean
  className?: string
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export default function StatTile({
  label,
  value,
  accent = false,
  className,
}: StatTileProps) {
  return (
    <div
      className={joinClassNames('ui-stat-tile', className)}
      style={{
        background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
        borderRadius: 10,
        padding: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', Menlo, monospace",
          fontSize: 16,
          lineHeight: '20px',
          fontWeight: 700,
          color: accent ? 'var(--color-success)' : 'var(--color-on-surface)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 0,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 10,
          lineHeight: '14px',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        {label}
      </div>
    </div>
  )
}
