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
  layout = 'default',
  closeControl = 'action',
  maxWidth = 560,
  zIndex = 120,
  panelStyle,
  bodyStyle,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  mode?: 'dialog' | 'sheet'
  layout?: 'default' | 'share-sheet'
  closeControl?: 'action' | 'icon'
  maxWidth?: number
  zIndex?: number
  panelStyle?: CSSProperties
  bodyStyle?: CSSProperties
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="modal-overlay"
      data-mode={mode}
      data-layout={layout}
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        className="surface-card modal-panel"
        data-mode={mode}
        data-layout={layout}
        style={{ maxWidth, ...panelStyle }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header" data-layout={layout}>
          <div className="modal-header__copy">
            <div className="modal-title">{title}</div>
            {description ? <div className="modal-description">{description}</div> : null}
          </div>
          {layout === 'share-sheet' || closeControl === 'icon' ? (
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

        <div className="modal-body" data-layout={layout} style={bodyStyle}>
          {children}
        </div>

        {footer ? (
          <div className="modal-footer" data-layout={layout}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
