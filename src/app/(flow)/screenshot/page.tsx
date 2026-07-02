import type { Metadata } from 'next'
import ScreenshotClient from './ScreenshotClient'
import { resolveShareTemplateParam } from '@/lib/share-template-intent'

export const metadata: Metadata = {
  title: '识别截图 | Peak Trekker',
}

export default async function ScreenshotPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; from?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const fromImprint = Array.isArray(resolvedSearchParams.from)
    ? resolvedSearchParams.from[0] === 'imprint'
    : resolvedSearchParams.from === 'imprint'
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ScreenshotClient
        initialTemplate={resolveShareTemplateParam(resolvedSearchParams.template)}
        returnToImprint={fromImprint}
      />
    </div>
  )
}
