'use client'

// @deprecated - use IconButton instead. Will be removed during page rewrites.
// Kept for backward compatibility with existing pages.

import Link from 'next/link'
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'

type ActionGlyphName =
  | 'back'
  | 'close'
  | 'share'
  | 'more'
  | 'edit'
  | 'delete'
  | 'report'
  | 'download'
  | 'profile'
  | 'logout'

function glyphColor(currentColor: string) {
  return { stroke: currentColor, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
}

export function ActionGlyph({
  name,
}: {
  name: ActionGlyphName
}) {
  switch (name) {
    case 'back':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'close':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12" {...glyphColor('currentColor')} />
          <path d="M18 6L6 18" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'share':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V5" {...glyphColor('currentColor')} />
          <path d="M8 9l4-4 4 4" {...glyphColor('currentColor')} />
          <path d="M5 14.5V17a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'more':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'edit':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 20h9" {...glyphColor('currentColor')} />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'delete':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16" {...glyphColor('currentColor')} />
          <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" {...glyphColor('currentColor')} />
          <path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12" {...glyphColor('currentColor')} />
          <path d="M10 11.5v5" {...glyphColor('currentColor')} />
          <path d="M14 11.5v5" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'report':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 20V5" {...glyphColor('currentColor')} />
          <path d="M6 5h8.4l-.9 2.4L15.2 10H6" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'download':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4v10" {...glyphColor('currentColor')} />
          <path d="M8 10.5l4 4 4-4" {...glyphColor('currentColor')} />
          <path d="M5 19h14" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'profile':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" {...glyphColor('currentColor')} />
          <path d="M6 18c1.4-2.5 3.6-3.8 6-3.8s4.6 1.3 6 3.8" {...glyphColor('currentColor')} />
        </svg>
      )
    case 'logout':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M10 6H7.5A1.5 1.5 0 0 0 6 7.5v9A1.5 1.5 0 0 0 7.5 18H10" {...glyphColor('currentColor')} />
          <path d="M14 8l4 4-4 4" {...glyphColor('currentColor')} />
          <path d="M18 12h-8" {...glyphColor('currentColor')} />
        </svg>
      )
    default:
      return null
  }
}

type SharedProps = {
  label: string
  icon: ReactNode
  active?: boolean
  danger?: boolean
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  style?: CSSProperties
}

export default function IconActionButton({
  label,
  icon,
  active = false,
  danger = false,
  disabled = false,
  size = 'md',
  className = '',
  style,
  onClick,
  type = 'button',
}: SharedProps & {
  onClick?: MouseEventHandler<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      data-size={size}
      data-active={active ? 'true' : 'false'}
      data-variant={danger ? 'danger' : 'default'}
      className={`icon-action-btn ${className}`.trim()}
      style={style}
      onClick={onClick}
    >
      <span aria-hidden="true" className="icon-action-btn__glyph">
        {icon}
      </span>
    </button>
  )
}

export function IconActionLink({
  href,
  label,
  icon,
  active = false,
  danger = false,
  size = 'md',
  className = '',
  style,
}: SharedProps & {
  href: string
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      data-size={size}
      data-active={active ? 'true' : 'false'}
      data-variant={danger ? 'danger' : 'default'}
      className={`icon-action-btn icon-action-link ${className}`.trim()}
      style={style}
    >
      <span aria-hidden="true" className="icon-action-btn__glyph">
        {icon}
      </span>
    </Link>
  )
}
