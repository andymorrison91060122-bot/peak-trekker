import type { CSSProperties } from 'react'

export type SpinnerProps = {
  size: number | string
  color?: string
}

function formatSize(size: number | string) {
  return typeof size === 'number' ? `${size}px` : size
}

export default function Spinner({
  size,
  color = 'var(--color-success)',
}: SpinnerProps) {
  const resolvedSize = formatSize(size)
  const style = {
    '--pt-spinner-size': resolvedSize,
    '--pt-spinner-color': color,
  } as CSSProperties

  return <span className="pt-spinner" aria-hidden="true" style={style} />
}
