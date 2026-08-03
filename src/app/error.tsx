'use client'

import { useEffect, useState } from 'react'
import PrimaryButton from '@/components/ui/PrimaryButton'
import { RefreshIcon, WarnIcon } from '@/components/ui/Icons'
import {
  createOneShotClientErrorReporter,
  reportClientErrorDiagnostic,
} from '@/lib/client-error-diagnostic'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [reporter] = useState(() => createOneShotClientErrorReporter(fetch))

  useEffect(() => {
    console.error(error)
    reportClientErrorDiagnostic(reporter, error, {
      getPathname: () => window.location.pathname,
      getRuntime: () => process.env.NEXT_PUBLIC_PEAK_TREKKER_RUNTIME === 'cloudflare' ? 'cloudflare' : 'next',
      createCorrelationId: () => crypto.randomUUID(),
    })
  }, [error, reporter])

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding:
          'max(env(safe-area-inset-top), var(--space-6)) var(--space-4) max(env(safe-area-inset-bottom), var(--space-6))',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
      }}
    >
      <section
        aria-labelledby="root-error-title"
        style={{
          width: '100%',
          maxWidth: 420,
          minWidth: 0,
          padding: 'var(--space-6) var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
          boxShadow: 'var(--shadow-soft)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 42%, var(--color-outline))',
            background: 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface-elevated))',
            color: 'var(--color-warning)',
          }}
        >
          <WarnIcon size={28} />
        </div>
        <h1
          id="root-error-title"
          style={{
            margin: 'var(--space-5) 0 0',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-headline-m-size)',
            lineHeight: 'var(--font-headline-m-line)',
            fontWeight: 'var(--font-headline-m-weight)',
          }}
        >
          出了点问题
        </h1>
        <p
          style={{
            margin: 'var(--space-3) 0 0',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 1.7,
            fontWeight: 'var(--font-body-m-weight)',
          }}
        >
          可能是网络或服务短暂不稳。你可以先重试一次。
        </p>
        <PrimaryButton onClick={reset} style={{ width: '100%', marginTop: 'var(--space-5)' }}>
          <RefreshIcon size={18} />
          重试
        </PrimaryButton>
      </section>
    </main>
  )
}
