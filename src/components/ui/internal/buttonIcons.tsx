'use client'

/**
 * INTERNAL ONLY: do not import outside ui/
 */

import type { ReactNode } from 'react'

export type BuiltInIconName =
  | 'back'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-up'
  | 'close'
  | 'share'
  | 'more'
  | 'edit'
  | 'delete'
  | 'report'
  | 'download'
  | 'profile'
  | 'logout'

function glyphStroke(currentColor: string) {
  return {
    stroke: currentColor,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function isBuiltInIconName(value: ReactNode | BuiltInIconName): value is BuiltInIconName {
  return typeof value === 'string'
}

export function BuiltInIcon({
  name,
}: {
  name: BuiltInIconName
}) {
  switch (name) {
    case 'back':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'chevron-right':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'chevron-up':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 15l6-6 6 6" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'close':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12" {...glyphStroke('currentColor')} />
          <path d="M18 6L6 18" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'share':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V5" {...glyphStroke('currentColor')} />
          <path d="M8 9l4-4 4 4" {...glyphStroke('currentColor')} />
          <path d="M5 14.5V17a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'more':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'edit':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 20h9" {...glyphStroke('currentColor')} />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'delete':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16" {...glyphStroke('currentColor')} />
          <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" {...glyphStroke('currentColor')} />
          <path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12" {...glyphStroke('currentColor')} />
          <path d="M10 11.5v5" {...glyphStroke('currentColor')} />
          <path d="M14 11.5v5" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'report':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 20V5" {...glyphStroke('currentColor')} />
          <path d="M6 5h8.4l-.9 2.4L15.2 10H6" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'download':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4v10" {...glyphStroke('currentColor')} />
          <path d="M8 10.5l4 4 4-4" {...glyphStroke('currentColor')} />
          <path d="M5 19h14" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" {...glyphStroke('currentColor')} />
          <path d="M6 18c1.4-2.5 3.6-3.8 6-3.8s4.6 1.3 6 3.8" {...glyphStroke('currentColor')} />
        </svg>
      )
    case 'logout':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M10 6H7.5A1.5 1.5 0 0 0 6 7.5v9A1.5 1.5 0 0 0 7.5 18H10" {...glyphStroke('currentColor')} />
          <path d="M14 8l4 4-4 4" {...glyphStroke('currentColor')} />
          <path d="M18 12h-8" {...glyphStroke('currentColor')} />
        </svg>
      )
    default:
      return null
  }
}
