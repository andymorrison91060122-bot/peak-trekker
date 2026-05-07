import type { Metadata } from 'next'
import ScreenshotClient from './ScreenshotClient'

export const metadata: Metadata = {
  title: '识别截图 | Peak Trekker',
}

export default function ScreenshotPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ScreenshotClient />
    </div>
  )
}
