'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { TOAST_REGISTRY, type ToastAppearance, type ToastKey, type ToastTone } from '@/lib/toast-registry'

type ToastItem = {
  id: number
  tone: ToastTone
  appearance: ToastAppearance
  message: string
}

type ShowToastInput = {
  key?: ToastKey
  tone?: ToastTone
  appearance?: ToastAppearance
  message?: string
  durationMs?: number
}

type ToastContextValue = {
  showToast: (input: ShowToastInput) => void
  clearToasts: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const FALLBACK_TOAST_CONTEXT: ToastContextValue = {
  showToast: () => {},
  clearToasts: () => {},
}

function toneStyles(tone: ToastTone) {
  if (tone === 'success') {
    return {
      borderColor: 'rgba(34,197,94,0.22)',
      background: 'rgba(34,197,94,0.12)',
      color: '#a7f3d0',
    }
  }

  if (tone === 'info') {
    return {
      borderColor: 'rgba(96,165,250,0.22)',
      background: 'rgba(96,165,250,0.12)',
      color: '#bfdbfe',
    }
  }

  return {
    borderColor: 'rgba(239,68,68,0.28)',
    background: 'rgba(127,29,29,0.22)',
    color: '#fecaca',
  }
}

export default function AppToastProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback(({ key, tone, appearance, message, durationMs }: ShowToastInput) => {
    const preset = key ? TOAST_REGISTRY[key] : null
    const nextTone = tone ?? preset?.tone ?? 'info'
    const nextAppearance = appearance ?? 'tone'
    const nextMessage = message ?? preset?.message ?? ''
    if (!nextMessage) return

    const toastId = Date.now() + Math.random()
    setToasts((current) => {
      const deduped = current.filter(
        (item) => !(item.tone === nextTone && item.appearance === nextAppearance && item.message === nextMessage)
      )
      return [...deduped, { id: toastId, tone: nextTone, appearance: nextAppearance, message: nextMessage }].slice(-3)
    })

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toastId))
    }, durationMs ?? (nextAppearance === 'surface' ? 2000 : nextTone === 'error' ? 5200 : 2800))
  }, [])

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  const contextValue = useMemo(() => ({ showToast, clearToasts }), [showToast, clearToasts])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        style={{
          position: 'fixed',
          left: 16,
          right: 16,
          top: 72,
          zIndex: 160,
          display: 'grid',
          gap: 10,
          pointerEvents: 'none',
          maxWidth: 520,
          margin: '0 auto',
        }}
      >
        {toasts.map((toast) => {
          const styles = toneStyles(toast.tone)
          const isSurfaceToast = toast.appearance === 'surface'
          return (
            <div
              key={toast.id}
              role="alert"
              data-toast-tone={toast.tone}
              data-toast-appearance={toast.appearance}
              className="surface-card"
              style={{
                padding: isSurfaceToast ? 'var(--space-3) var(--space-4)' : '12px 14px',
                borderColor: isSurfaceToast ? 'var(--color-outline)' : styles.borderColor,
                background: isSurfaceToast ? 'var(--color-surface-elevated)' : styles.background,
                borderRadius: isSurfaceToast ? 'var(--radius-md)' : undefined,
                boxShadow: '0 16px 32px rgba(0,0,0,0.24)',
              }}
            >
              <div
                className={isSurfaceToast ? '' : 'section-subtitle'}
                style={
                  isSurfaceToast
                    ? {
                        color: 'var(--color-on-surface)',
                        fontSize: 'var(--font-label-m-size)',
                        lineHeight: 'var(--font-label-m-line)',
                        fontWeight: 'var(--font-label-m-weight)',
                      }
                    : { color: styles.color }
                }
              >
                {toast.message}
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useAppToast() {
  const context = useContext(ToastContext)
  return context ?? FALLBACK_TOAST_CONTEXT
}
