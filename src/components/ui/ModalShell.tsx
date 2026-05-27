'use client'

import type { CSSProperties, ReactNode } from 'react'
import IconButton from '@/components/ui/IconButton'
import IconActionButton, { ActionGlyph } from '@/components/ui/IconActionButton'

export default function ModalShell({
  title,
  description,
  onClose,
  children,
  footer,
  mode = 'dialog',
  closeControl = 'action',
  maxWidth = 560,
  zIndex = 120,
  panelStyle,
  bodyStyle,
  hideHeaderCopy = false,
  headerContent,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  mode?: 'dialog' | 'sheet'
  closeControl?: 'action' | 'icon'
  maxWidth?: number
  zIndex?: number
  panelStyle?: CSSProperties
  bodyStyle?: CSSProperties
  hideHeaderCopy?: boolean
  headerContent?: ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="modal-overlay"
      data-mode={mode}
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        className="surface-card modal-panel"
        data-mode={mode}
        style={{ maxWidth, ...panelStyle }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="modal-header"
          data-copy-hidden={hideHeaderCopy ? 'true' : undefined}
          style={headerContent ? { alignItems: 'center' } : undefined}
        >
          {headerContent ? (
            <div className="modal-header__copy">{headerContent}</div>
          ) : !hideHeaderCopy ? (
            <div className="modal-header__copy">
              <div className="modal-title">{title}</div>
              {description ? <div className="modal-description">{description}</div> : null}
            </div>
          ) : null}
          {closeControl === 'icon' ? (
            <IconButton
              icon="close"
              ariaLabel="关闭"
              variant="filled"
              onClick={onClose}
            />
          ) : (
            <IconActionButton label="关闭" icon={<ActionGlyph name="close" />} onClick={onClose} />
          )}
        </div>

        <div className="modal-body" style={bodyStyle}>
          {children}
        </div>

        {footer ? (
          <div className="modal-footer">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
