'use client'

import { useEffect, useMemo, useRef } from 'react'
import { validateNickname } from '@/lib/profile-nickname'

function countCharacters(value: string) {
  return Array.from(value).length
}

export function capNicknameInput(value: string) {
  return Array.from(value).slice(0, 12).join('')
}

export function stripNicknameControlCharacters(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, '')
}

function CloseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ErrorGlyph({ tone = 'error' }: { tone?: 'error' | 'warning' }) {
  const color = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-error)'
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <path d="M12 7.5v5.5M12 16.2v.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        borderRadius: 'var(--radius-pill)',
        display: 'inline-block',
        border: '2px solid var(--color-on-primary)',
        borderTopColor: 'transparent',
        animation: 'pt-nickname-spin 0.7s linear infinite',
      }}
    />
  )
}

export function PencilGlyph({
  size = 15,
  color = 'currentColor',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 4.2l3.3 3.3a1.2 1.2 0 0 1 0 1.7L9 19.9l-4.4 1 1-4.4L16.3 4.2a1.2 1.2 0 0 1 1.7 0z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14.6 6.1l3.3 3.3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function EditNicknameButton({
  pressed,
  onClick,
}: {
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label="编辑昵称"
      data-testid="profile-nickname-edit-trigger"
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        border: 0,
        background: 'transparent',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        margin: '-7px -8px -7px -2px',
      }}
    >
      <span
        data-testid="profile-nickname-edit-chip"
        style={{
          width: 30,
          height: 30,
          borderRadius: 'var(--radius-sm)',
          display: 'grid',
          placeItems: 'center',
          color: pressed ? 'var(--color-success)' : 'var(--color-on-surface)',
          background: pressed ? 'color-mix(in srgb, var(--color-success) 14%, transparent)' : 'var(--color-surface)',
          border: `1px solid ${pressed ? 'color-mix(in srgb, var(--color-success) 26%, transparent)' : 'var(--color-outline)'}`,
          transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease, filter 140ms ease',
        }}
      >
        <PencilGlyph />
      </span>
    </button>
  )
}

export default function ProfileNicknameSheet({
  open,
  value,
  original,
  saving,
  serverError,
  onChange,
  onSave,
  onClose,
  onClearServerError,
}: {
  open: boolean
  value: string
  original: string
  saving: boolean
  serverError: string
  onChange: (value: string) => void
  onSave: () => void
  onClose: () => void
  onClearServerError: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const trimmedOriginal = original.trim()
  const validation = useMemo(() => validateNickname(value), [value])
  const trimmedValue = validation.ok ? validation.value : value.trim()
  const count = countCharacters(value)
  const atLimit = count >= 12
  const canSave = validation.ok && trimmedValue !== trimmedOriginal && !saving
  const helperTone = validation.ok ? (atLimit ? 'warning' : 'neutral') : 'error'

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      const cursor = input.value.length
      input.setSelectionRange(cursor, cursor)
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

  const fieldBorderColor =
    helperTone === 'error'
      ? 'color-mix(in srgb, var(--color-error) 55%, transparent)'
      : 'color-mix(in srgb, var(--color-primary) 55%, transparent)'
  const fieldShadow =
    helperTone === 'error'
      ? '0 0 0 3px color-mix(in srgb, var(--color-error) 16%, transparent)'
      : '0 0 0 3px color-mix(in srgb, var(--color-primary) 14%, transparent)'
  const counterColor =
    helperTone === 'error'
      ? 'var(--color-error)'
      : helperTone === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-on-surface-variant)'

  function updateValue(nextValue: string) {
    onClearServerError()
    onChange(capNicknameInput(stripNicknameControlCharacters(nextValue)))
  }

  return (
    <div
      data-testid="profile-nickname-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-nickname-sheet-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 170,
      }}
    >
      <div
        data-testid="profile-nickname-sheet-scrim"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: 'pt-nickname-fade-in 200ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
          background: 'var(--color-surface-variant)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          borderTop: '1px solid var(--color-outline)',
          boxShadow: '0 -18px 36px rgba(0,0,0,.28)',
          animation: 'pt-nickname-sheet-up 280ms cubic-bezier(.2,.6,.2,1)',
        }}
      >
        <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            data-testid="profile-nickname-sheet-handle"
            style={{
              width: 36,
              height: 4,
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(255,255,255,.18)',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px 0 20px',
          }}
        >
          <h2
            id="profile-nickname-sheet-title"
            style={{
              margin: 0,
              color: 'var(--color-on-surface)',
              fontSize: 17,
              lineHeight: '24px',
              fontWeight: 700,
            }}
          >
            编辑昵称
          </h2>
          <button
            type="button"
            aria-label="关闭"
            data-testid="profile-nickname-close"
            onClick={onClose}
            style={{
              width: 44,
              height: 44,
              border: 0,
              background: 'transparent',
              color: 'var(--color-on-surface)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              marginRight: -10,
            }}
          >
            <CloseGlyph />
          </button>
        </div>
        <div style={{ padding: '6px 20px 0' }}>
          <div
            data-testid="profile-nickname-input-shell"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 50,
              padding: '0 14px',
              background: 'var(--color-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${fieldBorderColor}`,
              boxShadow: fieldShadow,
              transition: 'border-color 140ms ease, box-shadow 140ms ease',
            }}
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => updateValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSave) {
                  event.preventDefault()
                  onSave()
                }
              }}
              spellCheck={false}
              autoComplete="nickname"
              data-testid="profile-nickname-input"
              aria-invalid={!validation.ok}
              aria-describedby="profile-nickname-helper"
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                border: 0,
                outline: 'none',
                background: 'transparent',
                color: 'var(--color-on-surface)',
                font: 'inherit',
                fontSize: 17,
                fontWeight: 600,
                caretColor: 'var(--color-primary)',
              }}
            />
            {value && !saving ? (
              <button
                type="button"
                aria-label="清空昵称"
                data-testid="profile-nickname-clear"
                onClick={() => updateValue('')}
                style={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-pill)',
                  border: 0,
                  cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--color-on-surface) 8%, transparent)',
                  color: 'var(--color-on-surface-variant)',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
            <span
              data-testid="profile-nickname-counter"
              style={{
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 500,
                color: counterColor,
                transition: 'color 140ms ease',
              }}
            >
              {count} / 12
            </span>
          </div>
          <div
            id="profile-nickname-helper"
            data-testid="profile-nickname-helper"
            style={{
              minHeight: 20,
              marginTop: 9,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {!validation.ok ? (
              <>
                <ErrorGlyph />
                <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--color-error)', fontWeight: 500 }}>
                  {validation.error}
                </span>
              </>
            ) : atLimit ? (
              <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--color-warning)', fontWeight: 500 }}>
                已达 12 字上限
              </span>
            ) : (
              <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--color-on-surface-variant)' }}>
                2–12 个字，支持中文、字母、数字
              </span>
            )}
          </div>
        </div>
        {serverError ? (
          <div
            data-testid="profile-nickname-server-error"
            style={{
              margin: '4px 20px 0',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ErrorGlyph />
            <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--color-on-surface)', fontWeight: 500 }}>
              {serverError}
            </span>
          </div>
        ) : null}
        <div style={{ padding: '14px 20px calc(20px + env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            data-testid="profile-nickname-save"
            disabled={!canSave}
            onClick={canSave ? onSave : undefined}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 'var(--radius-md)',
              border: 0,
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              font: 'inherit',
              fontSize: 15,
              fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave ? 1 : 0.4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 140ms ease, filter 120ms ease',
            }}
          >
            {saving ? (
              <>
                <Spinner />
                保存中
              </>
            ) : serverError ? (
              '重试'
            ) : (
              '保存'
            )}
          </button>
        </div>
      </div>
      <style jsx global>{`
        @keyframes pt-nickname-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes pt-nickname-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes pt-nickname-sheet-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes pt-nickname-success-fade {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
