import ImportClient from './ImportClient'
import AppToastProvider from '@/components/ui/AppToastProvider'
import { resolveShareTemplateParam } from '@/lib/share-template-intent'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function normalizeMountainId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; from?: string | string[]; mountainId?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const contextMountainId = normalizeMountainId(resolvedSearchParams.mountainId)
  const supabase = await createSupabaseServerClient()
  const initialMountainContext = contextMountainId
    ? await supabase
      .from('mountains')
      .select('id, name')
      .eq('id', contextMountainId)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => data ? { id: data.id, name: data.name } : null)
    : null
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
          initialMountainContext={initialMountainContext}
        />
      </div>
    </AppToastProvider>
  )
}
