import PrimaryButton from '@/components/ui/PrimaryButton'
import { MountainIcon } from '@/components/ui/Icons'

export default function NotFound() {
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
        aria-labelledby="not-found-title"
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
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-success)',
          }}
        >
          <MountainIcon size={28} />
        </div>
        <h1
          id="not-found-title"
          style={{
            margin: 'var(--space-5) 0 0',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-headline-m-size)',
            lineHeight: 'var(--font-headline-m-line)',
            fontWeight: 'var(--font-headline-m-weight)',
          }}
        >
          这条路暂时走不通
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
          页面可能已经移动，或链接不完整。你可以回到探索，重新找一座山出发。
        </p>
        <PrimaryButton as="a" href="/explore" style={{ width: '100%', marginTop: 'var(--space-5)' }}>
          回到探索
        </PrimaryButton>
      </section>
    </main>
  )
}
