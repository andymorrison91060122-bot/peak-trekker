import ImportClient from './ImportClient'
import AppToastProvider from '@/components/ui/AppToastProvider'
import { resolveShareTemplateParam } from '@/lib/share-template-intent'

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; from?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const fromImprint = Array.isArray(resolvedSearchParams.from)
    ? resolvedSearchParams.from[0] === 'imprint'
    : resolvedSearchParams.from === 'imprint'
  return (
    <AppToastProvider>
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <ImportClient
          initialTemplate={resolveShareTemplateParam(resolvedSearchParams.template)}
          returnToImprint={fromImprint}
        />
      </div>
    </AppToastProvider>
  )
}
