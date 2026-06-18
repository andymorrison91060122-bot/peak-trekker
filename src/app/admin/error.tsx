'use client'

import { useEffect } from 'react'
import PrimaryButton from '@/components/ui/PrimaryButton'
import { RefreshIcon, WarnIcon } from '@/components/ui/Icons'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section
      aria-labelledby="admin-error-title"
      style={{
        minHeight: 'calc(100dvh - 160px)',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-8) 0',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          minWidth: 0,
          padding: 'var(--space-6) var(--space-5)',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          boxShadow: '0 18px 42px rgba(0, 0, 0, 0.28)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `
              linear-gradient(var(--green-primary),var(--green-primary)) top left / 12px 2px no-repeat,
              linear-gradient(var(--green-primary),var(--green-primary)) top left / 2px 12px no-repeat,
              linear-gradient(var(--green-primary),var(--green-primary)) top right / 12px 2px no-repeat,
              linear-gradient(var(--green-primary),var(--green-primary)) top right / 2px 12px no-repeat,
              linear-gradient(var(--green-primary),var(--green-primary)) bottom left / 12px 2px no-repeat,
              linear-gradient(var(--green-primary),var(--green-primary)) bottom left / 2px 12px no-repeat,
              linear-gradient(var(--green-primary),var(--green-primary)) bottom right / 12px 2px no-repeat,
              linear-gradient(var(--green-primary),var(--green-primary)) bottom right / 2px 12px no-repeat
            `,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto',
            border: '1px solid color-mix(in srgb, var(--warning) 46%, var(--border-color))',
            background: 'rgba(245, 158, 11, 0.1)',
            color: 'var(--warning)',
          }}
        >
          <WarnIcon size={28} />
        </div>
        <div
          className="font-mono"
          style={{
            marginTop: 'var(--space-5)',
            color: 'var(--text-muted)',
            fontSize: 10,
            lineHeight: 'var(--font-label-s-line)',
            letterSpacing: '0.16em',
          }}
        >
          ADMIN BACKSTOP
        </div>
        <h1
          id="admin-error-title"
          className="font-pixel"
          style={{
            margin: 'var(--space-2) 0 0',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-headline-m-size)',
            lineHeight: 'var(--font-headline-m-line)',
          }}
        >
          出了点问题
        </h1>
        <p
          style={{
            margin: 'var(--space-3) 0 0',
            color: 'var(--text-muted)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 1.7,
          }}
        >
          可能是网络或服务短暂不稳。你可以先重试一次。
        </p>
        <PrimaryButton onClick={reset} style={{ width: '100%', marginTop: 'var(--space-5)' }}>
          <RefreshIcon size={18} />
          重试
        </PrimaryButton>
      </div>
    </section>
  )
}
