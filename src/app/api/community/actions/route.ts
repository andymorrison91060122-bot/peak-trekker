import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import {
  buildDefaultCommunityPosterUrl,
  buildCommunityPostOverrideComment,
  buildCommunityPostRemoveComment,
  buildCommunityTrackPreview,
  buildCommunityDefaultTitle,
  COMMUNITY_MAX_BODY_LENGTH,
  COMMUNITY_MAX_TAGS,
  COMMUNITY_MAX_TITLE_LENGTH,
  chooseCommunityCoverAsset,
  deriveLegacyCheckinAssets,
  hasCommunityImageAsset,
  normalizeCommunityBody,
  parseCommunityPostOwnerMutation,
  parseCommunityPostPayload,
  normalizeCommunityTags,
  normalizeCommunityVisibility,
  prioritizeCommunityAssets,
  serializeCommunityPostPayload,
  validateCommunityAssets,
} from '@/lib/community'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { resolveCheckinSource } from '@/lib/trek-utils'
import type { CheckinAsset, PostVisibility } from '@/types'

type ActionName =
  | 'create_or_update_post'
  | 'delete_post'
  | 'list_post_likes'
  | 'toggle_post_like'
  | 'report_post'

const REPORT_REASONS = ['广告引流', '与登山无关', '违规内容', '侵犯隐私']
const SENSITIVE_PATTERNS = [/vx/i, /微信/i, /加我/i, /q群/i, /tg/i, /广告/i]

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null
  return (value ?? null) as T | null
}

function sanitizeTitle(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.slice(0, COMMUNITY_MAX_TITLE_LENGTH) || fallback
}

function hasSensitiveContent(value: string) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value))
}

function normalizeAssets(value: unknown, checkinId: string) {
  if (!Array.isArray(value)) return [] as CheckinAsset[]
  return value
    .map((asset, index) => {
      if (!asset || typeof asset !== 'object') return null
      const url = typeof asset.url === 'string' ? asset.url : ''
      if (!url) return null
      return {
        id: typeof asset.id === 'string' ? asset.id : `asset-${index}`,
        checkin_id: checkinId,
        type: asset.type === 'video' || asset.type === 'poster' ? asset.type : 'image',
        url,
        thumbnail_url:
          typeof asset.thumbnail_url === 'string'
            ? asset.thumbnail_url
            : typeof asset.thumbnailUrl === 'string'
              ? asset.thumbnailUrl
              : null,
        created_at: typeof asset.created_at === 'string' ? asset.created_at : new Date().toISOString(),
        sort_order: typeof asset.sort_order === 'number' ? asset.sort_order : index,
        source:
          asset.source === 'upload' || asset.source === 'generated' || asset.source === 'fallback'
            ? asset.source
            : 'record',
      } satisfies CheckinAsset
    })
    .filter(Boolean) as CheckinAsset[]
}

async function getLatestOwnerPostMutation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  postId: string,
  userId: string
) {
  const { data } = await supabase
    .from('comments')
    .select('content, created_at')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  for (const row of (data ?? []) as Array<{ content: string; created_at: string }>) {
    const parsed = parseCommunityPostOwnerMutation(row.content)
    if (parsed) return parsed
  }

  return null
}

async function insertPostOwnerOverride(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  {
    postId,
    userId,
    serializedContent,
  }: {
    postId: string
    userId: string
    serializedContent: string
  }
) {
  return supabase
    .from('comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content: buildCommunityPostOverrideComment(serializedContent),
    })
    .select('id')
    .single()
}

async function insertPostOwnerRemoveMarker(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  {
    postId,
    userId,
  }: {
    postId: string
    userId: string
  }
) {
  return supabase
    .from('comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content: buildCommunityPostRemoveComment(),
    })
    .select('id')
    .single()
}

async function getPostAccessSnapshot(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  postId: string
) {
  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, checkin_id, content')
    .eq('id', postId)
    .maybeSingle()

  if (error || !data) return null

  const latestOwnerMutation = await getLatestOwnerPostMutation(supabase, data.id, data.user_id)
  if (latestOwnerMutation?.type === 'removed') {
    return {
      id: data.id,
      userId: data.user_id,
      checkinId: data.checkin_id,
      status: 'removed' as const,
      visibility: 'public' as const,
    }
  }

  const parsed = parseCommunityPostPayload({
    content: latestOwnerMutation?.type === 'override' ? latestOwnerMutation.serializedPayload : data.content,
    fallbackPhotoUrl: null,
    fallbackPosterUrl: null,
    checkinId: data.checkin_id,
    sourceType: 'realtime_gps',
    mountainName: '山峰',
  })

  return {
    id: data.id,
    userId: data.user_id,
    checkinId: data.checkin_id,
    status: parsed.status,
    visibility: parsed.visibility,
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = body?.action as ActionName | undefined

  if (!action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (action === 'create_or_update_post') {
    const checkinId = typeof body?.checkinId === 'string' ? body.checkinId : ''
    if (!checkinId) {
      return NextResponse.json({ error: 'checkinId required' }, { status: 400 })
    }

    const checkinSelectVariants = [
      `
        id, user_id, type, source, status, photo_url, poster_url, session_id,
        mountains(name)
      `,
      `
        id, user_id, type, status, photo_url, poster_url,
        mountains(name)
      `,
      `
        id, user_id, type, status, photo_url,
        mountains(name)
      `,
    ]

    const checkinResult =
      (await (async () => {
        let lastResult:
          | {
              data: Record<string, unknown> | null
              error: { message?: string | null } | null
            }
          | null = null

        for (const selectClause of checkinSelectVariants) {
          const result = await supabase
            .from('checkins')
            .select(selectClause)
            .eq('id', checkinId)
            .single()

          lastResult = result as {
            data: Record<string, unknown> | null
            error: { message?: string | null } | null
          }

          if (!result.error || !isSchemaCompatibilityErrorMessage(result.error.message)) {
            return result
          }
        }

        return lastResult ?? { data: null, error: null }
      })()) as {
        data: Record<string, unknown> | null
        error: { message?: string | null } | null
      }

    const typedCheckin = checkinResult.data as {
      id: string
      user_id: string
      type: 'gps' | 'photo'
      source?: 'realtime_gps' | 'historical_photo' | null
      status: 'pending' | 'approved' | 'rejected'
      photo_url: string | null
      poster_url?: string | null
      session_id?: string | null
      mountains: Array<{ name: string }> | { name: string } | null
    } | null

    if (checkinResult.error || !typedCheckin) {
      return NextResponse.json({ error: 'checkin not found' }, { status: 404 })
    }
    if (typedCheckin.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (typedCheckin.status !== 'approved') {
      return NextResponse.json({ error: 'only approved records can be published' }, { status: 422 })
    }

    const sourceType = resolveCheckinSource({ source: typedCheckin.source, type: typedCheckin.type })
    const fallbackPosterUrl =
      typedCheckin.poster_url ??
      buildDefaultCommunityPosterUrl({
        checkinId,
        sourceType,
      })
    const mountainName = firstRelation(typedCheckin.mountains)?.name ?? '山峰'
    const fallbackTitle = buildCommunityDefaultTitle(mountainName, sourceType)
    const title = sanitizeTitle(body?.title, fallbackTitle)
    const postBody = normalizeCommunityBody(body?.body)
    const visibility = normalizeCommunityVisibility(body?.visibility) as PostVisibility
    const tags = normalizeCommunityTags(body?.tags)
    const requestedAssets = normalizeAssets(body?.assets, checkinId)
    const fallbackRecordAssets =
      sourceType === 'historical_photo' && !hasCommunityImageAsset(requestedAssets)
        ? deriveLegacyCheckinAssets({
            checkinId,
            photoUrl: typedCheckin.photo_url,
            posterUrl: null,
          }).filter((asset) => asset.type === 'image')
        : []
    const assets = prioritizeCommunityAssets(
      [...requestedAssets, ...fallbackRecordAssets]
        .filter((asset, index, current) =>
          current.findIndex((candidate) => candidate.type === asset.type && candidate.url === asset.url) === index
        )
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((asset, index) => ({ ...asset, sort_order: index }))
    )
    const coverAssetId = typeof body?.coverAssetId === 'string' ? body.coverAssetId : null
    const sessionTrackPreview =
      typedCheckin.session_id
        ? await supabase
            .from('trek_sessions')
            .select('track_points')
            .eq('id', typedCheckin.session_id)
            .maybeSingle()
        : { data: null, error: null }

    if (hasSensitiveContent(`${title}\n${postBody}`)) {
      return NextResponse.json({ error: 'content contains blocked words' }, { status: 422 })
    }

    const validation = validateCommunityAssets({
      assets,
      userId: user.id,
      checkinId,
      sourceType,
      checkinPhotoUrl: typedCheckin.photo_url,
      checkinPosterUrl: fallbackPosterUrl,
    })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 422 })
    }

    if (tags.length > COMMUNITY_MAX_TAGS || title.length > COMMUNITY_MAX_TITLE_LENGTH || postBody.length > COMMUNITY_MAX_BODY_LENGTH) {
      return NextResponse.json({ error: 'content exceeds limits' }, { status: 422 })
    }

    const orderedAssets = prioritizeCommunityAssets([...assets].sort((a, b) => a.sort_order - b.sort_order))
    const draftPayload = {
      schemaVersion: 1 as const,
      title,
      body: postBody,
      visibility,
      status: 'published' as const,
      sourceType,
      tags,
      coverAssetId,
      coverUrl: null,
      assets: orderedAssets,
      trackPreview: sessionTrackPreview.error && isSchemaCompatibilityErrorMessage(sessionTrackPreview.error.message)
        ? null
        : buildCommunityTrackPreview(sessionTrackPreview.data?.track_points),
    }
    const coverAsset = chooseCommunityCoverAsset(draftPayload)
    const coverUrl = coverAsset?.thumbnail_url ?? coverAsset?.url ?? typedCheckin.photo_url ?? fallbackPosterUrl ?? null

    const payload = {
      ...draftPayload,
      coverAssetId: coverAsset?.id ?? null,
      coverUrl,
    }

    const { data: existingPosts } = await supabase
      .from('posts')
      .select('id, like_count, comment_count, content')
      .eq('checkin_id', checkinId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
    const existingPost = ((existingPosts ?? []) as Array<{
      id: string
      like_count?: number | null
      comment_count?: number | null
      content?: string | null
    }>)[0] ?? null
    const latestOwnerMutation = existingPost
      ? await getLatestOwnerPostMutation(supabase, existingPost.id, user.id)
      : null

    const existingStatus = existingPost
      ? parseCommunityPostPayload({
          content:
            latestOwnerMutation?.type === 'override'
              ? latestOwnerMutation.serializedPayload
              : latestOwnerMutation?.type === 'removed'
                ? null
                : existingPost.content ?? null,
          fallbackPhotoUrl: typedCheckin.photo_url,
          fallbackPosterUrl,
          checkinId,
          sourceType,
          mountainName,
        }).status
      : 'published'

    const values = {
      user_id: user.id,
      checkin_id: checkinId,
      content: serializeCommunityPostPayload({
        ...payload,
        status: existingStatus === 'published' ? 'published' : existingStatus,
      }),
      poster_url: coverUrl,
    }
    const updateValues = {
      content: values.content,
      poster_url: values.poster_url,
    }

    const result = existingPost && latestOwnerMutation?.type !== 'removed'
      ? await supabase
          .from('posts')
          .update(updateValues)
          .eq('id', existingPost.id)
          .select('id')
      : await supabase
          .from('posts')
          .insert({
            ...values,
            like_count: 0,
            comment_count: 0,
          })
          .select('id')

    const persistedPost = (Array.isArray(result.data) ? result.data[0] : result.data) as { id?: string } | null
    let persistedPostId = persistedPost?.id ?? null

    if (existingPost && latestOwnerMutation?.type === 'removed') {
      const overrideResult = await insertPostOwnerOverride(supabase, {
        postId: existingPost.id,
        userId: user.id,
        serializedContent: values.content,
      })

      if (overrideResult.error) {
        return NextResponse.json({ error: overrideResult.error.message }, { status: 500 })
      }

      persistedPostId = existingPost.id
    } else if (existingPost && !result.error) {
      const desiredContent = values.content
      const desiredPosterUrl = values.poster_url ?? null

      const readBack = await supabase
        .from('posts')
        .select('id, content, poster_url')
        .eq('id', existingPost.id)
        .maybeSingle()

      const matchesReadBack =
        readBack.data?.id === existingPost.id &&
        readBack.data?.content === desiredContent &&
        (readBack.data?.poster_url ?? null) === desiredPosterUrl

      if (matchesReadBack) {
        persistedPostId = existingPost.id
      } else {
        const overrideResult = await insertPostOwnerOverride(supabase, {
          postId: existingPost.id,
          userId: user.id,
          serializedContent: desiredContent,
        })

        if (overrideResult.error) {
          return NextResponse.json({ error: overrideResult.error.message }, { status: 500 })
        }

        persistedPostId = existingPost.id
      }
    }

    if (result.error || !persistedPostId) {
      return NextResponse.json({ error: result.error?.message ?? 'publish failed' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      postId: persistedPostId,
      detailUrl: `/community/${persistedPostId}`,
      mode: existingPost && latestOwnerMutation?.type !== 'removed' ? 'updated' : 'created',
    })
  }

  if (action === 'delete_post') {
    const postId = typeof body?.postId === 'string' ? body.postId : ''
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 })
    }

    const accessSnapshot = await getPostAccessSnapshot(supabase, postId)
    if (!accessSnapshot) {
      return NextResponse.json({ error: 'post not found' }, { status: 404 })
    }
    if (accessSnapshot.userId !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (accessSnapshot.status === 'removed') {
      return NextResponse.json({ ok: true, alreadyRemoved: true })
    }

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)

    if (!error) {
      const readBack = await supabase
        .from('posts')
        .select('id')
        .eq('id', postId)
        .maybeSingle()

      if (readBack.error) {
        return NextResponse.json({ error: readBack.error.message }, { status: 500 })
      }

      if (!readBack.data?.id) {
        return NextResponse.json({ ok: true })
      }
    }

    const removeMarker = await insertPostOwnerRemoveMarker(supabase, {
      postId,
      userId: user.id,
    })

    if (removeMarker.error) {
      return NextResponse.json({ error: error?.message ?? removeMarker.error.message ?? 'delete failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, fallback: true })
  }

  if (action === 'toggle_post_like') {
    const postId = typeof body?.postId === 'string' ? body.postId : ''
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 })
    }

    const accessSnapshot = await getPostAccessSnapshot(supabase, postId)
    if (!accessSnapshot || accessSnapshot.status === 'removed' || accessSnapshot.status === 'hidden') {
      return NextResponse.json({ error: 'post not found' }, { status: 404 })
    }
    if (accessSnapshot.visibility === 'private' && accessSnapshot.userId !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { data: existingLike } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingLike) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: user.id })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { count } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)

    const likeCount = count ?? 0
    await supabase.from('posts').update({ like_count: likeCount }).eq('id', postId)

    return NextResponse.json({
      ok: true,
      liked: !existingLike,
      likeCount,
    })
  }

  if (action === 'list_post_likes') {
    const postId = typeof body?.postId === 'string' ? body.postId : ''
    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 })
    }

    const accessSnapshot = await getPostAccessSnapshot(supabase, postId)
    if (!accessSnapshot || accessSnapshot.status === 'removed' || accessSnapshot.status === 'hidden') {
      return NextResponse.json({ error: 'post not found' }, { status: 404 })
    }
    if (accessSnapshot.visibility === 'private' && accessSnapshot.userId !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { data: likeRows, error: likeError } = await supabase
      .from('likes')
      .select('user_id, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .limit(24)

    if (likeError) {
      return NextResponse.json({ error: likeError.message }, { status: 500 })
    }

    const userIds = ((likeRows ?? []) as Array<{ user_id: string; created_at: string }>).map((row) => row.user_id)
    let profileMap = new Map<
      string,
      {
        id: string
        username: string | null
        province: string | null
        avatar_url: string | null
      }
    >()

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, province, avatar_url')
        .in('id', userIds)

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 })
      }

      profileMap = new Map(
        (
          (profiles ?? []) as Array<{
            id: string
            username: string | null
            province: string | null
            avatar_url: string | null
          }>
        ).map((profile) => [profile.id, profile])
      )
    }

    return NextResponse.json({
      ok: true,
      likers: ((likeRows ?? []) as Array<{ user_id: string; created_at: string }>).map((row) => {
        const profile = profileMap.get(row.user_id)
        return {
          id: row.user_id,
          username: profile?.username ?? '山友',
          province: profile?.province ?? '未知省份',
          avatarUrl: profile?.avatar_url ?? null,
          likedAt: row.created_at,
        }
      }),
    })
  }

  if (action === 'report_post') {
    const postId = typeof body?.postId === 'string' ? body.postId : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!postId || !REPORT_REASONS.includes(reason)) {
      return NextResponse.json({ error: 'invalid report payload' }, { status: 400 })
    }

    const accessSnapshot = await getPostAccessSnapshot(supabase, postId)
    if (!accessSnapshot || accessSnapshot.status === 'removed' || accessSnapshot.status === 'hidden') {
      return NextResponse.json({ error: 'post not found' }, { status: 404 })
    }
    if (accessSnapshot.visibility === 'private' && accessSnapshot.userId !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const payload = {
      post_id: postId,
      user_id: user.id,
      reason,
      status: 'pending',
    }

    const primary = await supabase.from('post_reports').insert(payload).select('id').single()
    if (!primary.error) {
      return NextResponse.json({ ok: true, fallback: false })
    }

    if (!primary.error.message.includes('post_reports')) {
      return NextResponse.json({ error: primary.error.message }, { status: 500 })
    }

    const fallback = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        content: `[REPORT] ${reason}`,
      })
      .select('id')
      .single()

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, fallback: true })
  }

  return NextResponse.json({ error: 'unsupported action' }, { status: 400 })
}
