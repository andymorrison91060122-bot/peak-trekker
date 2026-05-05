import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CommunityPostViewModel, PostVisibility, PublishableRecord } from '@/types'
import {
  buildCommunityMetrics,
  buildCommunityPostViewModel,
  parseCommunityPostFeatureMutation,
  parseCommunityPostOwnerMutation,
  parseCommunityPostPayload,
  shouldRenderCommunityPost,
} from '@/lib/community'
import { getMountainPosterBackgroundImage } from '@/lib/mountain-media'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { resolveCheckinSource } from '@/lib/trek-utils'

type AnySupabase = SupabaseClient

type SessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  ascent_m: number | null
  max_altitude_m: number | null
}

type RawCommunityPostRow = {
  id: string
  user_id: string
  checkin_id: string
  content: string | null
  poster_url: string | null
  like_count: number | null
  created_at: string
  is_featured?: boolean | null
  profiles: Array<{
    id: string
    username: string | null
    province: string | null
    license_level: string | null
    mountain_count: number | null
    avatar_url: string | null
  }> | null
  checkins: Array<{
    id: string
    mountain_id?: string | null
    type: string
    source?: string | null
    status: string | null
    note: string | null
    session_id?: string | null
    created_at: string | null
    photo_url: string | null
    poster_url?: string | null
    verified_at?: string | null
    mountains: Array<{
      id: string
      name: string
      altitude: number
      province: string
      difficulty: string
      cover_image?: string | null
      gallery_images?: string[] | null
      route_preview_image?: string | null
      route_preview_image_url?: string | null
    }> | null
  }> | null
}

type OwnerPostMutationRow = {
  post_id: string
  user_id: string
  content: string
  created_at: string
}

type FeatureMutationRow = {
  post_id: string
  content: string
  created_at: string
}

type PostQueryLike = {
  order: (column: string, options?: { ascending?: boolean }) => PostQueryLike
  limit: (count: number) => PostQueryLike
  eq: (column: string, value: unknown) => PostQueryLike
  single: () => Promise<unknown>
}

const COMMUNITY_POST_SELECT_VARIANTS = [
  `
    id, user_id, checkin_id, content, poster_url, like_count, created_at, is_featured,
    profiles(id, username, province, license_level, mountain_count, avatar_url),
    checkins(id, mountain_id, type, source, status, note, session_id, created_at, photo_url, poster_url, verified_at, mountains(id, name, altitude, province, difficulty, cover_image, gallery_images, route_preview_image, route_preview_image_url))
  `,
  `
    id, user_id, checkin_id, content, poster_url, like_count, created_at, is_featured,
    profiles(id, username, province, license_level, mountain_count, avatar_url),
    checkins(id, mountain_id, type, status, note, created_at, photo_url, poster_url, mountains(id, name, altitude, province, difficulty))
  `,
  `
    id, user_id, checkin_id, content, poster_url, like_count, created_at,
    profiles(id, username, province, license_level, mountain_count),
    checkins(id, mountain_id, type, status, note, created_at, photo_url, mountains(id, name, altitude, province, difficulty))
  `,
] as const

const FEATURED_POST_SELECT_CLAUSE = `
  id, user_id, checkin_id, content, poster_url, like_count, created_at, is_featured,
  profiles(id, username, province, license_level, mountain_count, avatar_url),
  checkins!inner(id, mountain_id, type, source, status, note, created_at, photo_url, poster_url, mountains(id, name, altitude, province, difficulty, cover_image, gallery_images, route_preview_image, route_preview_image_url))
`

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null
  return (value ?? null) as T | null
}

function safeCheckinSource(value: { source?: string | null; type?: string | null }) {
  return resolveCheckinSource({
    source: value.source,
    type: value.type === 'photo' ? 'photo' : 'gps',
  })
}

async function loadSessionMap(supabase: AnySupabase, sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, SessionRow>()
  const { data, error } = await supabase
    .from('trek_sessions')
    .select('id, started_at, ended_at, distance_m, ascent_m, max_altitude_m')
    .in('id', sessionIds)

  if (error && isSchemaCompatibilityErrorMessage(error.message)) {
    return new Map<string, SessionRow>()
  }

  return new Map(((data ?? []) as SessionRow[]).map((session) => [session.id, session]))
}

async function fetchCommunityPostRows({
  supabase,
  applyQuery,
  single = false,
}: {
  supabase: AnySupabase
  applyQuery: (query: PostQueryLike) => PostQueryLike
  single?: boolean
}) {
  let lastResult:
    | {
        data: RawCommunityPostRow[] | RawCommunityPostRow | null
        error: { message?: string | null } | null
      }
    | null = null

  for (const selectClause of COMMUNITY_POST_SELECT_VARIANTS) {
    let query = supabase.from('posts').select(selectClause) as unknown as PostQueryLike
    query = applyQuery(query)

    const result = (await (
      single
        ? query.single()
        : query
    )) as {
      data: RawCommunityPostRow[] | RawCommunityPostRow | null
      error: { message?: string | null } | null
    }
    lastResult = result

    if (!result.error || !isSchemaCompatibilityErrorMessage(result.error.message)) {
      return result
    }
  }

  return (
    lastResult ??
    ({
      data: single ? null : [],
      error: null,
    } as {
      data: RawCommunityPostRow[] | RawCommunityPostRow | null
      error: { message?: string | null } | null
    })
  )
}

async function fetchFeaturedCommunityPostRows({
  supabase,
  mountainId,
  limit,
}: {
  supabase: AnySupabase
  mountainId: string
  limit: number
}) {
  const result = await supabase
    .from('posts')
    .select(FEATURED_POST_SELECT_CLAUSE)
    .eq('is_featured', true)
    .eq('checkins.mountain_id', mountainId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (result.error && isSchemaCompatibilityErrorMessage(result.error.message)) {
    return null
  }

  return (result.data ?? []) as RawCommunityPostRow[]
}

async function loadOwnerPostMutations(supabase: AnySupabase, postIds: string[]) {
  if (!postIds.length) return new Map<string, OwnerPostMutationRow[]>()

  const { data, error } = await supabase
    .from('comments')
    .select('post_id, user_id, content, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: false })

  if (error) {
    return new Map<string, OwnerPostMutationRow[]>()
  }

  const mutationMap = new Map<string, OwnerPostMutationRow[]>()
  for (const row of (data ?? []) as OwnerPostMutationRow[]) {
    const parsed = parseCommunityPostOwnerMutation(row.content)
    if (!parsed) continue
    const current = mutationMap.get(row.post_id) ?? []
    current.push(row)
    mutationMap.set(row.post_id, current)
  }
  return mutationMap
}

async function loadFeatureMutations(supabase: AnySupabase, postIds: string[]) {
  if (!postIds.length) return new Map<string, FeatureMutationRow[]>()

  const { data, error } = await supabase
    .from('comments')
    .select('post_id, content, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: false })

  if (error) {
    return new Map<string, FeatureMutationRow[]>()
  }

  const mutationMap = new Map<string, FeatureMutationRow[]>()
  for (const row of (data ?? []) as FeatureMutationRow[]) {
    const parsed = parseCommunityPostFeatureMutation(row.content)
    if (!parsed) continue
    const current = mutationMap.get(row.post_id) ?? []
    current.push(row)
    mutationMap.set(row.post_id, current)
  }
  return mutationMap
}

function resolveFeaturedState({
  persistedValue,
  mutationRows,
}: {
  persistedValue?: boolean | null
  mutationRows?: FeatureMutationRow[]
}) {
  if (typeof persistedValue === 'boolean') return persistedValue

  const latest = mutationRows?.find((row) => parseCommunityPostFeatureMutation(row.content))
  const parsed = latest ? parseCommunityPostFeatureMutation(latest.content) : null
  return parsed?.featured ?? false
}

function resolveEffectivePostContent({
  post,
  mutationRows,
}: {
  post: RawCommunityPostRow | { id: string; user_id: string; content: string | null }
  mutationRows: OwnerPostMutationRow[]
}) {
  const ownerMutation = mutationRows.find((row) => row.user_id === post.user_id && parseCommunityPostOwnerMutation(row.content))
  if (!ownerMutation) {
    return {
      removed: false,
      content: post.content,
    }
  }

  const parsed = parseCommunityPostOwnerMutation(ownerMutation.content)
  if (!parsed) {
    return {
      removed: false,
      content: post.content,
    }
  }

  if (parsed.type === 'removed') {
    return {
      removed: true,
      content: post.content,
    }
  }

  return {
    removed: false,
    content: parsed.serializedPayload,
  }
}

function dedupePostsByCheckin(posts: CommunityPostViewModel[]) {
  const next = new Map<string, CommunityPostViewModel>()
  for (const post of posts) {
    if (!next.has(post.checkinId)) {
      next.set(post.checkinId, post)
    }
  }
  return [...next.values()]
}

export async function listCommunityPosts({
  supabase,
  viewerId,
  limit = 60,
}: {
  supabase: AnySupabase
  viewerId?: string | null
  limit?: number
}) {
  const [{ data: posts }, { data: userLikes }] = await Promise.all([
    fetchCommunityPostRows({
      supabase,
      applyQuery: (query) => query.order('created_at', { ascending: false }).limit(limit),
    }),
    viewerId ? supabase.from('likes').select('post_id').eq('user_id', viewerId) : Promise.resolve({ data: [] as Array<{ post_id: string }> }),
  ])

  const rawPosts = (posts ?? []) as RawCommunityPostRow[]

  const sessionIds = [...new Set(rawPosts.map((post) => firstRelation(post.checkins)?.session_id).filter(Boolean) as string[])]
  const [sessionMap, likedSet, ownerMutations] = await Promise.all([
    loadSessionMap(supabase, sessionIds),
    Promise.resolve(new Set((userLikes ?? []).map((item) => item.post_id))),
    loadOwnerPostMutations(supabase, rawPosts.map((post) => post.id)),
  ])

  const postsView = rawPosts.flatMap((post) => {
    const checkin = firstRelation(post.checkins)
    const mountain = firstRelation(checkin?.mountains)
    if (!checkin || !mountain) return []
    const effectivePost = resolveEffectivePostContent({
      post,
      mutationRows: ownerMutations.get(post.id) ?? [],
    })
    if (effectivePost.removed) return []
    const sourceType = safeCheckinSource({ source: checkin.source, type: checkin.type })
    const parsed = parseCommunityPostPayload({
      content: effectivePost.content,
      fallbackPhotoUrl: checkin.photo_url,
      fallbackPosterUrl: post.poster_url,
      checkinId: post.checkin_id,
      sourceType,
      mountainName: mountain.name,
    })

    if (parsed.status !== 'published') return []
    if (parsed.visibility !== 'public' && post.user_id !== viewerId) return []
    if (!shouldRenderCommunityPost({ sourceType, assets: parsed.assets })) return []

    return [
      buildCommunityPostViewModel({
        postId: post.id,
        postUserId: post.user_id,
        checkinId: post.checkin_id,
        postContent: effectivePost.content,
        posterUrl: post.poster_url ?? firstRelation(post.checkins)?.poster_url ?? null,
        checkinPhotoUrl: checkin.photo_url ?? null,
        likeCount: post.like_count ?? 0,
        createdAt: post.created_at,
        liked: likedSet.has(post.id),
        viewerId,
        author: firstRelation(post.profiles),
        checkin: {
          note: checkin.note,
          source: sourceType,
          status: checkin.status,
          session_id: checkin.session_id,
          created_at: checkin.created_at,
        },
        mountain,
        session: checkin.session_id ? sessionMap.get(checkin.session_id) ?? null : null,
        isFeatured: post.is_featured,
      }),
    ]
  })

  return dedupePostsByCheckin(postsView)
}

export async function listUserCommunityPosts({
  supabase,
  userId,
}: {
  supabase: AnySupabase
  userId: string
}) {
  const [{ data: posts }, { data: userLikes }] = await Promise.all([
    fetchCommunityPostRows({
      supabase,
      applyQuery: (query) => query.eq('user_id', userId).order('created_at', { ascending: false }),
    }),
    supabase.from('likes').select('post_id').eq('user_id', userId),
  ])

  const rawPosts = (posts ?? []) as RawCommunityPostRow[]

  const sessionIds = [...new Set(rawPosts.map((post) => firstRelation(post.checkins)?.session_id).filter(Boolean) as string[])]
  const [sessionMap, likedSet, ownerMutations] = await Promise.all([
    loadSessionMap(supabase, sessionIds),
    Promise.resolve(new Set((userLikes ?? []).map((item) => item.post_id))),
    loadOwnerPostMutations(supabase, rawPosts.map((post) => post.id)),
  ])

  return dedupePostsByCheckin(
    rawPosts.flatMap((post) => {
      const checkin = firstRelation(post.checkins)
      const mountain = firstRelation(checkin?.mountains)
      if (!checkin || !mountain) return []
      const effectivePost = resolveEffectivePostContent({
        post,
        mutationRows: ownerMutations.get(post.id) ?? [],
      })
      if (effectivePost.removed) return []
      const sourceType = safeCheckinSource({ source: checkin.source, type: checkin.type })
      const parsed = parseCommunityPostPayload({
        content: effectivePost.content,
        fallbackPhotoUrl: checkin.photo_url,
        fallbackPosterUrl: post.poster_url,
        checkinId: post.checkin_id,
        sourceType,
        mountainName: mountain.name,
      })
      if (!shouldRenderCommunityPost({ sourceType, assets: parsed.assets })) return []
      return [
        buildCommunityPostViewModel({
          postId: post.id,
          postUserId: post.user_id,
          checkinId: post.checkin_id,
          postContent: effectivePost.content,
          posterUrl: post.poster_url ?? firstRelation(post.checkins)?.poster_url ?? null,
          checkinPhotoUrl: checkin.photo_url ?? null,
          likeCount: post.like_count ?? 0,
          createdAt: post.created_at,
          liked: likedSet.has(post.id),
          viewerId: userId,
          author: firstRelation(post.profiles),
          checkin: {
            note: checkin.note,
            source: sourceType,
            status: checkin.status,
            session_id: checkin.session_id,
            created_at: checkin.created_at,
          },
          mountain,
          session: checkin.session_id ? sessionMap.get(checkin.session_id) ?? null : null,
          isFeatured: post.is_featured,
        }),
      ]
    })
  )
}

export async function listCommunityPostsByAuthor({
  supabase,
  authorUserId,
  viewerId,
}: {
  supabase: AnySupabase
  authorUserId: string
  viewerId?: string | null
}) {
  const [{ data: posts }, { data: userLikes }] = await Promise.all([
    fetchCommunityPostRows({
      supabase,
      applyQuery: (query) => query.eq('user_id', authorUserId).order('created_at', { ascending: false }),
    }),
    viewerId ? supabase.from('likes').select('post_id').eq('user_id', viewerId) : Promise.resolve({ data: [] as Array<{ post_id: string }> }),
  ])

  const rawPosts = (posts ?? []) as RawCommunityPostRow[]

  const sessionIds = [...new Set(rawPosts.map((post) => firstRelation(post.checkins)?.session_id).filter(Boolean) as string[])]
  const [sessionMap, likedSet, ownerMutations] = await Promise.all([
    loadSessionMap(supabase, sessionIds),
    Promise.resolve(new Set((userLikes ?? []).map((item) => item.post_id))),
    loadOwnerPostMutations(supabase, rawPosts.map((post) => post.id)),
  ])

  return dedupePostsByCheckin(
    rawPosts.flatMap((post) => {
      const checkin = firstRelation(post.checkins)
      const mountain = firstRelation(checkin?.mountains)
      if (!checkin || !mountain) return []
      const effectivePost = resolveEffectivePostContent({
        post,
        mutationRows: ownerMutations.get(post.id) ?? [],
      })
      if (effectivePost.removed) return []
      const sourceType = safeCheckinSource({ source: checkin.source, type: checkin.type })
      const parsed = parseCommunityPostPayload({
        content: effectivePost.content,
        fallbackPhotoUrl: checkin.photo_url,
        fallbackPosterUrl: post.poster_url,
        checkinId: post.checkin_id,
        sourceType,
        mountainName: mountain.name,
      })

      if (parsed.status !== 'published' && post.user_id !== viewerId) return []
      if (parsed.visibility !== 'public' && post.user_id !== viewerId) return []
      if (!shouldRenderCommunityPost({ sourceType, assets: parsed.assets })) return []

      return [
        buildCommunityPostViewModel({
          postId: post.id,
          postUserId: post.user_id,
          checkinId: post.checkin_id,
          postContent: effectivePost.content,
          posterUrl: post.poster_url ?? firstRelation(post.checkins)?.poster_url ?? null,
          checkinPhotoUrl: checkin.photo_url ?? null,
          likeCount: post.like_count ?? 0,
          createdAt: post.created_at,
          liked: likedSet.has(post.id),
          viewerId,
          author: firstRelation(post.profiles),
          checkin: {
            note: checkin.note,
            source: sourceType,
            status: checkin.status,
            session_id: checkin.session_id,
            created_at: checkin.created_at,
          },
          mountain,
          session: checkin.session_id ? sessionMap.get(checkin.session_id) ?? null : null,
          isFeatured: post.is_featured,
        }),
      ]
    })
  )
}

export async function listFeaturedPostsByMountain({
  supabase,
  mountainId,
  limit = 5,
}: {
  supabase: AnySupabase
  mountainId: string
  limit?: number
}) {
  const featuredRows = await fetchFeaturedCommunityPostRows({
    supabase,
    mountainId,
    limit,
  })

  const rawPosts = featuredRows ?? ((await fetchCommunityPostRows({
    supabase,
    applyQuery: (query) => query.eq('checkins.mountain_id', mountainId).order('created_at', { ascending: false }).limit(Math.max(limit * 6, 30)),
  })).data ?? []) as RawCommunityPostRow[]

  const [ownerMutations, featureMutations] = await Promise.all([
    loadOwnerPostMutations(supabase, rawPosts.map((post) => post.id)),
    loadFeatureMutations(supabase, rawPosts.map((post) => post.id)),
  ])

  return dedupePostsByCheckin(
    rawPosts.flatMap((post) => {
      const checkin = firstRelation(post.checkins)
      const mountain = firstRelation(checkin?.mountains)
      if (!checkin || !mountain) return []

      const effectivePost = resolveEffectivePostContent({
        post,
        mutationRows: ownerMutations.get(post.id) ?? [],
      })
      if (effectivePost.removed) return []

      const sourceType = safeCheckinSource({ source: checkin.source, type: checkin.type })
      const parsed = parseCommunityPostPayload({
        content: effectivePost.content,
        fallbackPhotoUrl: checkin.photo_url,
        fallbackPosterUrl: post.poster_url,
        checkinId: post.checkin_id,
        sourceType,
        mountainName: mountain.name,
      })

      if (parsed.status !== 'published') return []
      if (parsed.visibility !== 'public') return []
      if (!shouldRenderCommunityPost({ sourceType, assets: parsed.assets })) return []

      const isFeatured = resolveFeaturedState({
        persistedValue: post.is_featured,
        mutationRows: featureMutations.get(post.id),
      })
      if (!isFeatured) return []

      return [
        buildCommunityPostViewModel({
          postId: post.id,
          postUserId: post.user_id,
          checkinId: post.checkin_id,
          postContent: effectivePost.content,
          posterUrl: post.poster_url ?? null,
          checkinPhotoUrl: checkin.photo_url ?? null,
          likeCount: post.like_count ?? 0,
          createdAt: post.created_at,
          liked: false,
          viewerId: null,
          author: firstRelation(post.profiles),
          checkin: {
            note: checkin.note,
            source: sourceType,
            status: checkin.status,
            created_at: checkin.created_at,
          },
          mountain,
          session: null,
          isFeatured,
        }),
      ]
    })
  ).slice(0, limit)
}

export async function listAdminCommunityPosts({
  supabase,
  limit = 80,
}: {
  supabase: AnySupabase
  limit?: number
}) {
  const { data: posts } = await fetchCommunityPostRows({
    supabase,
    applyQuery: (query) => query.order('created_at', { ascending: false }).limit(limit),
  })

  const rawPosts = (posts ?? []) as RawCommunityPostRow[]

  const sessionIds = [...new Set(rawPosts.map((post) => firstRelation(post.checkins)?.session_id).filter(Boolean) as string[])]
  const [sessionMap, ownerMutations, featureMutations] = await Promise.all([
    loadSessionMap(supabase, sessionIds),
    loadOwnerPostMutations(supabase, rawPosts.map((post) => post.id)),
    loadFeatureMutations(supabase, rawPosts.map((post) => post.id)),
  ])

  return rawPosts.flatMap((post) => {
    const checkin = firstRelation(post.checkins)
    const mountain = firstRelation(checkin?.mountains)
    if (!checkin || !mountain) return []
    const effectivePost = resolveEffectivePostContent({
      post,
      mutationRows: ownerMutations.get(post.id) ?? [],
    })
    if (effectivePost.removed) return []
    const sourceType = safeCheckinSource({ source: checkin.source, type: checkin.type })
    const isFeatured = resolveFeaturedState({
      persistedValue: post.is_featured,
      mutationRows: featureMutations.get(post.id),
    })
    return [
      buildCommunityPostViewModel({
        postId: post.id,
        postUserId: post.user_id,
        checkinId: post.checkin_id,
        postContent: effectivePost.content,
        posterUrl: post.poster_url ?? firstRelation(post.checkins)?.poster_url ?? null,
        checkinPhotoUrl: checkin.photo_url ?? null,
        likeCount: post.like_count ?? 0,
        createdAt: post.created_at,
        liked: false,
        viewerId: null,
        author: firstRelation(post.profiles),
        checkin: {
          note: checkin.note,
          source: sourceType,
          status: checkin.status,
          session_id: checkin.session_id,
          created_at: checkin.created_at,
        },
        mountain,
        session: checkin.session_id ? sessionMap.get(checkin.session_id) ?? null : null,
        isFeatured,
      }),
    ]
  })
}

export async function listCommunityReports({
  supabase,
}: {
  supabase: AnySupabase
}) {
  const primary = await supabase
    .from('post_reports')
    .select(`
      id, post_id, user_id, reason, status, created_at,
      profiles(username),
      posts(id, checkin_id)
    `)
    .order('created_at', { ascending: false })

  if (!primary.error) {
    return ((primary.data ?? []) as Array<{
      id: string
      post_id: string
      user_id: string
      reason: string
      status: string
      created_at: string
      profiles: Array<{ username: string | null }> | null
      posts: Array<{ id: string; checkin_id: string }> | null
    }>).map((report) => ({
      id: report.id,
      postId: report.post_id,
      reporter: report.profiles?.[0]?.username ?? '匿名用户',
      reason: report.reason,
      status: report.status,
      createdAt: report.created_at,
      fallback: false,
    }))
  }

  if (!primary.error.message.includes('post_reports')) {
    return []
  }

  const fallback = await supabase
    .from('comments')
    .select('id, post_id, user_id, content, created_at, profiles(username)')
    .ilike('content', '[REPORT]%')
    .order('created_at', { ascending: false })

  return ((fallback.data ?? []) as Array<{
    id: string
    post_id: string
    user_id: string
    content: string
    created_at: string
    profiles: Array<{ username: string | null }> | null
  }>).map((report) => ({
    id: report.id,
    postId: report.post_id,
    reporter: report.profiles?.[0]?.username ?? '匿名用户',
    reason: report.content.replace(/^\[REPORT\]\s*/, ''),
    status: 'pending',
    createdAt: report.created_at,
    fallback: true,
  }))
}

export async function getCommunityPostDetail({
  supabase,
  postId,
  viewerId,
}: {
  supabase: AnySupabase
  postId: string
  viewerId?: string | null
}) {
  const [{ data: post }, { data: userLikes }] = await Promise.all([
    fetchCommunityPostRows({
      supabase,
      applyQuery: (query) => query.eq('id', postId),
      single: true,
    }),
    viewerId ? supabase.from('likes').select('post_id').eq('user_id', viewerId).eq('post_id', postId) : Promise.resolve({ data: [] as Array<{ post_id: string }> }),
  ])

  if (!post) notFound()

  const typedPost = post as RawCommunityPostRow
  const ownerMutations = await loadOwnerPostMutations(supabase, [typedPost.id])
  const effectivePost = resolveEffectivePostContent({
    post: typedPost,
    mutationRows: ownerMutations.get(typedPost.id) ?? [],
  })
  if (effectivePost.removed) notFound()

  const checkin = firstRelation(typedPost.checkins)
  const mountain = firstRelation(checkin?.mountains)
  if (!checkin || !mountain) notFound()
  const sourceType = safeCheckinSource({ source: checkin.source, type: checkin.type })
  const parsed = parseCommunityPostPayload({
    content: effectivePost.content,
    fallbackPhotoUrl: checkin.photo_url,
    fallbackPosterUrl: typedPost.poster_url,
    checkinId: typedPost.checkin_id,
    sourceType,
    mountainName: mountain.name,
  })

  if (parsed.status !== 'published' && typedPost.user_id !== viewerId) {
    notFound()
  }
  if (parsed.visibility !== 'public' && typedPost.user_id !== viewerId) {
    notFound()
  }
  if (!shouldRenderCommunityPost({ sourceType, assets: parsed.assets })) {
    notFound()
  }

  const sessionMap = await loadSessionMap(supabase, checkin.session_id ? [checkin.session_id] : [])

  return buildCommunityPostViewModel({
    postId: typedPost.id,
    postUserId: typedPost.user_id,
    checkinId: typedPost.checkin_id,
    postContent: effectivePost.content,
    posterUrl: typedPost.poster_url ?? checkin.poster_url ?? null,
    checkinPhotoUrl: checkin.photo_url ?? null,
    likeCount: typedPost.like_count ?? 0,
    createdAt: typedPost.created_at,
    liked: Boolean(userLikes?.length),
    viewerId,
    author: firstRelation(typedPost.profiles),
    checkin: {
      note: checkin.note,
      source: sourceType,
      status: checkin.status,
      session_id: checkin.session_id,
      created_at: checkin.created_at,
    },
    mountain,
    session: checkin.session_id ? sessionMap.get(checkin.session_id) ?? null : null,
    isFeatured: typedPost.is_featured,
  })
}

export async function listPublishableRecords({
  supabase,
  userId,
}: {
  supabase: AnySupabase
  userId: string
}) {
  const checkinSelectVariants = [
    'id, type, source, status, created_at, note, photo_url, poster_url, verified_at, session_id, mountains(id, name, altitude, province, difficulty, cover_image, gallery_images, route_preview_image, route_preview_image_url)',
    'id, type, status, created_at, note, photo_url, poster_url, mountains(id, name, altitude, province, difficulty)',
    'id, type, status, created_at, note, photo_url, mountains(id, name, altitude, province, difficulty)',
  ]

  const checkinResult =
    (await (async () => {
      let lastResult:
        | {
            data: unknown[] | null
            error: { message?: string | null } | null
          }
        | null = null

      for (const selectClause of checkinSelectVariants) {
        const result = await supabase
          .from('checkins')
          .select(selectClause)
          .eq('user_id', userId)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })

        lastResult = result as {
          data: unknown[] | null
          error: { message?: string | null } | null
        }

        if (!result.error || !isSchemaCompatibilityErrorMessage(result.error.message)) {
          return result
        }
      }

      return lastResult ?? { data: [], error: null }
    })()) as {
      data: unknown[] | null
      error: { message?: string | null } | null
    }

  const { data: posts } = await supabase
    .from('posts')
    .select('id, checkin_id, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const checkins = checkinResult.data

  const typedCheckins = (checkins ?? []) as Array<{
    id: string
    type: string
    source?: string | null
    status: 'approved'
    created_at: string
    note: string | null
    photo_url: string | null
    poster_url?: string | null
    verified_at?: string | null
    session_id?: string | null
    mountains: Array<{
      id: string
      name: string
      altitude: number
      province: string
      difficulty: string
      cover_image?: string | null
      gallery_images?: string[] | null
      route_preview_image?: string | null
      route_preview_image_url?: string | null
    }> | null
  }>
  const typedPosts = (posts ?? []) as Array<{
    id: string
    checkin_id: string
    user_id?: string
    content: string | null
    created_at: string
  }>
  const ownerMutations = await loadOwnerPostMutations(supabase, typedPosts.map((post) => post.id))

  const postMap = new Map(
    typedPosts.flatMap((post) => {
      const effectivePost = resolveEffectivePostContent({
        post: {
          id: post.id,
          user_id: userId,
          content: post.content,
        },
        mutationRows: ownerMutations.get(post.id) ?? [],
      })

      if (effectivePost.removed) return []

      return [[post.checkin_id, { ...post, content: effectivePost.content }]] as const
    })
  )
  const sessionIds = [...new Set(typedCheckins.map((checkin) => checkin.session_id).filter(Boolean) as string[])]
  const sessionMap = await loadSessionMap(supabase, sessionIds)

  return typedCheckins.flatMap((checkin) => {
    const mountain = firstRelation(checkin.mountains)
    if (!mountain) return []
    const sourceType = safeCheckinSource({ source: checkin.source, type: checkin.type })
    const post = postMap.get(checkin.id)
    const visibility = post
      ? parseCommunityPostPayload({
          content: post.content,
          fallbackPhotoUrl: checkin.photo_url,
          fallbackPosterUrl: checkin.poster_url,
          checkinId: checkin.id,
          sourceType,
          mountainName: mountain.name,
        }).visibility
      : null

    return [
      {
        checkinId: checkin.id,
        sourceType,
        status: 'approved' as const,
        createdAt: checkin.created_at,
        verifiedAt: checkin.verified_at ?? null,
        mountain: {
          id: mountain.id,
          name: mountain.name,
          altitude: mountain.altitude,
          province: mountain.province,
          difficulty: mountain.difficulty,
          coverImage: getMountainPosterBackgroundImage(mountain),
        },
        metrics: buildCommunityMetrics({
          session: checkin.session_id ? sessionMap.get(checkin.session_id) ?? null : null,
          altitude: mountain.altitude,
        }),
        note: checkin.note ?? '',
        photoUrl: checkin.photo_url,
        posterUrl: checkin.poster_url ?? null,
        routeSessionId: checkin.session_id ?? null,
        shareState: post ? 'published' : 'unshared',
        postId: post?.id ?? null,
        postVisibility: visibility as PostVisibility | null,
      } satisfies PublishableRecord,
    ]
  })
}
