'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { BuiltInIcon, type BuiltInIconName, isBuiltInIconName } from '@/components/ui/internal/buttonIcons'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: ReactNode | BuiltInIconName
  ariaLabel: string
  variant?: 'plain' | 'filled'
  shape?: 'rounded' | 'circular'
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function renderIcon(icon: ReactNode | BuiltInIconName) {
  if (isBuiltInIconName(icon)) {
    return <BuiltInIcon name={icon} />
  }

  return icon
}

export default function IconButton({
  icon,
  ariaLabel,
  variant = 'plain',
  shape = 'rounded',
  className,
  disabled = false,
  type = 'button',
  ...buttonProps
}: IconButtonProps) {
  if (!ariaLabel.trim()) {
    throw new Error('IconButton ariaLabel is required')
  }

  return (
    <button
      type={type}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      data-variant={variant}
      data-shape={shape}
      className={joinClassNames('ui-icon-btn-root', className)}
      {...buttonProps}
    >
      <span aria-hidden="true" className="ui-icon-btn-glyph">
        {renderIcon(icon)}
      </span>
    </button>
  )
}
