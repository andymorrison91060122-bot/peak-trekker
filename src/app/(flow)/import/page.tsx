import ImportClient from './ImportClient'
import AppToastProvider from '@/components/ui/AppToastProvider'

export default function ImportPage() {
  return (
    <AppToastProvider>
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <ImportClient />
      </div>
    </AppToastProvider>
  )
}
