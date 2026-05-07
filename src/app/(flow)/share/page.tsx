import type { Metadata } from 'next'
import ShareClient from './ShareClient'

export const metadata: Metadata = {
  title: '分享编辑器 | Peak Trekker',
}

export default function SharePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ShareClient />
    </div>
  )
}
