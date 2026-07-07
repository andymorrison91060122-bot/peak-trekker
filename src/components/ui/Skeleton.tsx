import type { CSSProperties } from 'react'

export type SkeletonProps = {
  width?: number | string
  height: number | string
  radius?: number | string
  className?: string
}

function formatSize(value: number | string | undefined) {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export default function Skeleton({
  width = '100%',
  height,
  radius = 'var(--radius-sm)',
  className,
}: SkeletonProps) {
  const style = {
    width: formatSize(width),
    height: formatSize(height),
    borderRadius: formatSize(radius),
  } as CSSProperties

  return <div className={joinClassNames('pt-skeleton', className)} aria-hidden="true" style={style} />
}
