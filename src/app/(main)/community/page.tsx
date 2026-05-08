import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listCommunityPosts } from '@/lib/community-server'
import CommunityClient from './CommunityClient'

type CommunityPageSearchParams = {
  qaCommunityState?: string
}

function resolveQaCommunityState(value: unknown) {
  if (process.env.NODE_ENV === 'production') return undefined
  if (value === 'empty' || value === 'loading') return value
  return undefined
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams?: Promise<CommunityPageSearchParams>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const viewState = resolveQaCommunityState(resolvedSearchParams.qaCommunityState)
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const posts = await listCommunityPosts({
    supabase,
    viewerId: user?.id ?? null,
    limit: 80,
  })

  return (
    <div className="community-v2-page">
      <CommunityClient
        initialPosts={viewState ? [] : posts}
        currentUserId={user?.id ?? null}
        viewState={viewState}
      />
    </div>
  )
}
