'use client'

/**
 * INTERNAL ONLY: do not import outside ui/
 * Future button variants (for example DangerButton) must derive from this file.
 * Business code must not import this primitive directly.
 */

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  MouseEvent,
  MouseEventHandler,
  ReactNode,
} from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

type SharedButtonProps = {
  children: ReactNode
  variant: ButtonVariant
  className?: string
  loading?: boolean
  outlined?: boolean
}

type ButtonModeProps = SharedButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    as?: 'button'
    href?: never
  }

type AnchorModeProps = SharedButtonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className'> & {
    as: 'a'
    href: string
    onClick?: MouseEventHandler<HTMLAnchorElement>
  }

export type ButtonPrimitiveProps = ButtonModeProps | AnchorModeProps

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function buildButtonContent(children: ReactNode, loading: boolean) {
  return (
    <>
      {loading ? <span className="ui-btn-loading-indicator" aria-hidden="true" /> : null}
      <span className="ui-btn-label">{children}</span>
    </>
  )
}

function preventActionWhenUnavailable(event: MouseEvent<HTMLElement>, unavailable: boolean) {
  if (!unavailable) return
  event.preventDefault()
  event.stopPropagation()
}

export function ButtonPrimitive(props: ButtonPrimitiveProps) {
  const {
    children,
    variant,
    className,
    loading = false,
    outlined = false,
    ...restProps
  } = props

  const unavailable = loading || ('disabled' in props ? Boolean(props.disabled) : false)
  const content = buildButtonContent(children, loading)
  const commonClassName = joinClassNames('ui-btn-root', className)

  if (props.as === 'a') {
    const {
      as: _as,
      href,
      onClick,
      target,
      rel,
      tabIndex,
      ...anchorProps
    } = restProps as AnchorModeProps

    return (
      <a
        href={href}
        onClick={(event) => {
          preventActionWhenUnavailable(event, unavailable)
          if (!unavailable) {
            onClick?.(event)
          }
        }}
        aria-disabled={unavailable ? 'true' : undefined}
        aria-busy={loading ? 'true' : undefined}
        data-variant={variant}
        data-outlined={outlined ? 'true' : 'false'}
        data-loading={loading ? 'true' : 'false'}
        className={commonClassName}
        target={target}
        rel={rel}
        tabIndex={unavailable ? -1 : tabIndex}
        {...anchorProps}
      >
        {content}
      </a>
    )
  }

  const {
    as: _as,
    type = 'button',
    onClick,
    disabled,
    ...buttonProps
  } = restProps as ButtonModeProps

  return (
    <button
      type={type}
      disabled={unavailable}
      onClick={(event) => {
        preventActionWhenUnavailable(event, unavailable)
        if (!unavailable) {
          onClick?.(event)
        }
      }}
      aria-busy={loading ? 'true' : undefined}
      data-variant={variant}
      data-outlined={outlined ? 'true' : 'false'}
      data-loading={loading ? 'true' : 'false'}
      className={commonClassName}
      {...buttonProps}
    >
      {content}
    </button>
  )
}
