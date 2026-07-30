'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          appearance: 'always' | 'execute' | 'interaction-only'
          size: 'normal' | 'compact' | 'flexible'
          theme: 'auto' | 'light' | 'dark'
          callback: (token: string) => void
          'expired-callback': () => void
          'error-callback': () => void
        }
      ) => string
      remove?: (widgetId: string) => void
      reset?: (widgetId?: string) => void
    }
    __ptTurnstileScriptPromise?: Promise<void>
  }
}

const TURNSTILE_SCRIPT_ID = 'pt-cloudflare-turnstile-script'
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TURNSTILE_ALWAYS_PASS_TEST_SITE_KEY = '1x00000000000000000000AA'

export const TURNSTILE_LOAD_ERROR_MESSAGE = '人机验证暂时无法加载，请刷新重试。'
export const TURNSTILE_EXPIRED_MESSAGE = '人机验证已过期，请重新完成验证。'

type TurnstileState = 'loading' | 'ready' | 'verified' | 'expired' | 'error'

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (window.__ptTurnstileScriptPromise) return window.__ptTurnstileScriptPromise

  window.__ptTurnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Cloudflare Turnstile script failed to load.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Cloudflare Turnstile script failed to load.'))
    document.head.appendChild(script)
  })

  return window.__ptTurnstileScriptPromise
}

export function getCloudflareTurnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ''
}

export function CloudflareTurnstile({
  onToken,
  onExpired,
  onError,
  resetKey = 0,
}: {
  onToken: (token: string) => void
  onExpired: () => void
  onError: () => void
  resetKey?: number
}) {
  const siteKey = getCloudflareTurnstileSiteKey()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const previousResetKeyRef = useRef(resetKey)
  const onTokenRef = useRef(onToken)
  const onExpiredRef = useRef(onExpired)
  const onErrorRef = useRef(onError)
  const [state, setState] = useState<TurnstileState>('loading')

  useEffect(() => {
    onTokenRef.current = onToken
    onExpiredRef.current = onExpired
    onErrorRef.current = onError
  }, [onError, onExpired, onToken])

  useEffect(() => {
    if (!siteKey || !containerRef.current) return

    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'always',
          size: 'flexible',
          theme: 'dark',
          callback: (token) => {
            if (!cancelled) {
              setState('verified')
              onTokenRef.current(token)
            }
          },
          'expired-callback': () => {
            if (!cancelled) {
              setState('expired')
              onExpiredRef.current()
            }
          },
          'error-callback': () => {
            if (!cancelled) {
              setState('error')
              onErrorRef.current()
            }
          },
        })
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setState('error')
          onErrorRef.current()
        }
      })

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current)
      }
      widgetIdRef.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return
    previousResetKeyRef.current = resetKey
    if (!widgetIdRef.current || !window.turnstile?.reset) return
    window.turnstile.reset(widgetIdRef.current)
  }, [resetKey])

  if (!siteKey) return null

  return (
    <div
      data-testid="auth-turnstile-widget"
      data-turnstile-state={state}
      data-turnstile-reset-key={resetKey}
      data-turnstile-site-key-kind={
        siteKey === TURNSTILE_ALWAYS_PASS_TEST_SITE_KEY
          ? 'official-always-pass-test'
          : 'configured'
      }
      style={{
        width: '100%',
        minHeight: state === 'loading' || state === 'ready' || state === 'expired' ? 65 : 0,
      }}
    >
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />
    </div>
  )
}
