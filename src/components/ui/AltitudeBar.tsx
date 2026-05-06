export interface AltitudeBarProps {
  current: number
  max: number
  className?: string
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function clampPercent(current: number, max: number) {
  if (max <= 0) return 0
  return Math.min(Math.max(current / max, 0), 1) * 100
}

function formatAltitude(value: number) {
  return `${Math.round(value).toLocaleString()}m`
}

export default function AltitudeBar({
  current,
  max,
  className,
}: AltitudeBarProps) {
  const percent = clampPercent(current, max)

  return (
    <div className={joinClassNames('ui-altitude-bar', className)}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Mono', Menlo, monospace",
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
            color: 'var(--color-success)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatAltitude(current)}
        </span>
        <span
          style={{
            fontFamily: "'IBM Plex Mono', Menlo, monospace",
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            color: 'var(--color-on-surface-variant)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatAltitude(max)}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 6,
          borderRadius: 'var(--radius-pill)',
          background: 'color-mix(in srgb, var(--color-on-surface) 6%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            borderRadius: 'inherit',
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-success))',
          }}
        />
      </div>
    </div>
  )
}
