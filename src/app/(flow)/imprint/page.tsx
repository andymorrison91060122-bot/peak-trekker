import type { Metadata } from 'next'
import { isPremiumPaywallEnabled } from '@/lib/premium'
import { resolveShareTemplateParam } from '@/lib/share-template-intent'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import ImprintClient from './ImprintClient'

export const metadata: Metadata = {
  title: '印迹 | Peak Trekker',
}

async function getIsAuthenticated() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return Boolean(user)
  } catch {
    return false
  }
}

export default async function ImprintPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; step?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const sourceStep = Array.isArray(resolvedSearchParams.step)
    ? resolvedSearchParams.step[0] === 'source'
    : resolvedSearchParams.step === 'source'
  return (
    <ImprintClient
      paywallEnabled={isPremiumPaywallEnabled()}
      isAuthenticated={await getIsAuthenticated()}
      initialTemplate={resolveShareTemplateParam(resolvedSearchParams.template) ?? undefined}
      initialStep={sourceStep ? 'source' : undefined}
    />
  )
}
