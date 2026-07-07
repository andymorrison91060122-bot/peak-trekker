import type { HTMLAttributes, ReactNode } from 'react'

type EmptyStateSize = 'sm' | 'md'

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  icon?: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  copy: ReactNode
  actions?: ReactNode | ReactNode[]
  footnote?: ReactNode
  size?: EmptyStateSize
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function normalizeActions(actions: ReactNode | ReactNode[] | undefined) {
  if (actions === undefined || actions === null) return []
  return Array.isArray(actions) ? actions.slice(0, 2) : [actions]
}

export default function EmptyState({
  icon,
  eyebrow,
  title,
  copy,
  actions,
  footnote,
  size = 'md',
  className,
  ...rest
}: EmptyStateProps) {
  const actionNodes = normalizeActions(actions)

  return (
    <div
      {...rest}
      className={joinClassNames('pt-empty-state', `pt-empty-state--${size}`, className)}
    >
      {icon ? (
        <div className="pt-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {eyebrow ? <div className="pt-empty-state__eyebrow">{eyebrow}</div> : null}
      <div className="pt-empty-state__title">{title}</div>
      {copy ? <div className="pt-empty-state__copy">{copy}</div> : null}
      {actionNodes.length > 0 ? (
        <div className="pt-empty-state__actions">
          {actionNodes.map((action, index) => (
            <div className="pt-empty-state__action" key={index}>
              {action}
            </div>
          ))}
        </div>
      ) : null}
      {footnote ? <div className="pt-empty-state__footnote">{footnote}</div> : null}
    </div>
  )
}
