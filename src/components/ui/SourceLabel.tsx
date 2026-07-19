import type { CSSProperties } from 'react'
import { BrandMask } from '@/components/brand/BrandMask'

export interface SourceLabelProps {
  type: 'gps_verified' | 'uploaded'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

type SourceLabelSize = NonNullable<SourceLabelProps['size']>

const sizeStyles: Record<
  SourceLabelSize,
  {
    height: number
    paddingX: number
    gap: number
    iconSize: number
    separatorHeight: number
    fontSize: string
    lineHeight: string
    radius: string
  }
> = {
  sm: {
    height: 20,
    paddingX: 7,
    gap: 5,
    iconSize: 14,
    separatorHeight: 12,
    fontSize: 'var(--font-label-s-size)',
    lineHeight: 'var(--font-label-s-line)',
    radius: 'var(--radius-xs)',
  },
  md: {
    height: 24,
    paddingX: 8,
    gap: 6,
    iconSize: 16,
    separatorHeight: 14,
    fontSize: 'var(--font-label-s-size)',
    lineHeight: 'var(--font-label-s-line)',
    radius: 'var(--radius-xs)',
  },
  lg: {
    height: 28,
    paddingX: 10,
    gap: 8,
    iconSize: 18,
    separatorHeight: 16,
    fontSize: 'var(--font-label-m-size)',
    lineHeight: 'var(--font-label-m-line)',
    radius: 'var(--radius-sm)',
  },
}

const labelStyles: Record<
  SourceLabelProps['type'],
  {
    text: string
    root: Pick<CSSProperties, 'background' | 'borderColor' | 'boxShadow' | 'color'>
    separator?: Pick<CSSProperties, 'background'>
  }
> = {
  gps_verified: {
    text: 'GPS 实测',
    root: {
      background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)',
      borderColor: 'var(--color-success)',
      boxShadow: '0 0 18px color-mix(in srgb, var(--color-primary) 24%, transparent)',
      color: 'var(--color-success)',
    },
    separator: {
      background: 'color-mix(in srgb, var(--color-success) 62%, transparent)',
    },
  },
  uploaded: {
    text: '上传记录',
    root: {
      background: 'color-mix(in srgb, var(--color-surface-variant) 72%, transparent)',
      borderColor: 'var(--color-outline)',
      color: 'var(--color-on-surface-variant)',
    },
  },
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function CheckGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DocumentGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.8h6.4L18 8.4v11.8H7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.4 3.8v4.6H18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path
        d="M9.5 14.2l2 2 3.7-4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SourceLabel({ type, size = 'md', className }: SourceLabelProps) {
  const sizing = sizeStyles[size]
  const variant = labelStyles[type]

  return (
    <span
      className={joinClassNames('source-label', className)}
      data-source-label-type={type}
      data-source-label-size={size}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizing.gap,
        height: sizing.height,
        paddingInline: sizing.paddingX,
        borderRadius: sizing.radius,
        border: '1px solid',
        borderColor: variant.root.borderColor,
        background: variant.root.background,
        boxShadow: variant.root.boxShadow,
        color: variant.root.color,
        fontSize: sizing.fontSize,
        lineHeight: sizing.lineHeight,
        fontWeight: 700,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {type === 'gps_verified' ? (
        <>
          <BrandMask size={sizing.iconSize} />
          <span
            aria-hidden="true"
            style={{
              width: 1,
              height: sizing.separatorHeight,
              background: variant.separator?.background,
              flex: '0 0 auto',
            }}
          />
          <CheckGlyph size={sizing.iconSize} />
        </>
      ) : (
        <DocumentGlyph size={sizing.iconSize} />
      )}
      <span>{variant.text}</span>
    </span>
  )
}
