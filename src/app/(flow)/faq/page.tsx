import AppToastProvider from '@/components/ui/AppToastProvider'
import { FAQ_BY_ANCHOR } from '@/lib/faq-content'
import FAQClient from './FAQClient'

export default async function FAQPage({
  searchParams,
}: {
  searchParams: Promise<{ anchor?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const rawAnchor = Array.isArray(resolvedSearchParams.anchor)
    ? resolvedSearchParams.anchor[0]
    : resolvedSearchParams.anchor
  const initialAnchor = rawAnchor && FAQ_BY_ANCHOR[rawAnchor] ? rawAnchor : null

  return (
    <AppToastProvider>
      <FAQClient initialAnchor={initialAnchor} />
    </AppToastProvider>
  )
}
