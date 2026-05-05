import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { canAccessAdminTools } from '@/lib/admin-access'
import {
  buildCommunityDefaultTitle,
  buildCommunityPostFeatureComment,
  normalizeCommunityStatus,
  parseCommunityPostPayload,
  serializeCommunityPostPayload,
} from '@/lib/community'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { resolveCheckinSource } from '@/lib/trek-utils'

type ActionName = 'hide' | 'restore' | 'delete' | 'resolve_report' | 'feature' | 'unfeature'

function isQaFeaturedFallbackEnabled() {
  return process.env.ENABLE_QA_TEST_HELPERS === 'true'
    || process.env.NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS === 'true'
}

export async function POST(request: NextRequest) {
  const { postId, action, reportId, fallbackReport } = await request.json()

  if (!postId || !['hide', 'restore', 'delete', 'resolve_report', 'feature', 'unfeature'].includes(action)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!canAccessAdminTools({
    email: user.email,
    isAdmin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
  })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const typedAction = action as ActionName

  if (typedAction === 'delete') {
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (typedAction === 'feature' || typedAction === 'unfeature') {
    let writableSupabase = null as ReturnType<typeof createSupabaseAdminClient> | Awaited<ReturnType<typeof createSupabaseServerClient>> | null
    try {
      writableSupabase = createSupabaseAdminClient()
    } catch (error) {
      if (!isQaFeaturedFallbackEnabled()) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : 'missing admin supabase config',
        }, { status: 500 })
      }

      writableSupabase = supabase
    }

    const { error } = await writableSupabase
      .from('posts')
      .update({ is_featured: typedAction === 'feature' })
      .eq('id', postId)

    if (error && isSchemaCompatibilityErrorMessage(error.message)) {
      const fallback = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: buildCommunityPostFeatureComment(typedAction === 'feature'),
        })

      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, mode: 'comment-fallback' })
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (typedAction === 'resolve_report') {
    if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 })

    const primary = await supabase
      .from('post_reports')
      .update({ status: 'resolved' })
      .eq('id', reportId)

    if (!primary.error) {
      return NextResponse.json({ ok: true })
    }

    if (!String(fallbackReport) && !primary.error.message.includes('post_reports')) {
      return NextResponse.json({ error: primary.error.message }, { status: 500 })
    }

    const fallback = await supabase.from('comments').delete().eq('id', reportId)
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      id, checkin_id, content, poster_url,
      checkins(type, source, photo_url, mountains(name))
    `)
    .eq('id', postId)
    .single()

  const typedPost = post as {
    id: string
    checkin_id: string
    content: string | null
    poster_url: string | null
    checkins: Array<{
      type: string
      source?: 'realtime_gps' | 'historical_photo' | 'track_import' | null
      photo_url?: string | null
      mountains: Array<{ name: string }> | null
    }> | null
  } | null

  if (postError || !typedPost) {
    return NextResponse.json({ error: postError?.message ?? 'post not found' }, { status: 404 })
  }

  const checkin = typedPost.checkins?.[0]
  const mountainName = checkin?.mountains?.[0]?.name ?? '山峰'
  const sourceType = resolveCheckinSource({
    source: checkin?.source ?? null,
    type: checkin?.type === 'photo' ? 'photo' : 'gps',
  })
  const payload = parseCommunityPostPayload({
    content: typedPost.content,
    fallbackPhotoUrl: checkin?.photo_url ?? null,
    fallbackPosterUrl: typedPost.poster_url,
    checkinId: typedPost.checkin_id,
    sourceType,
    mountainName,
  })

  const nextPayload = {
    ...payload,
    title: payload.title || buildCommunityDefaultTitle(mountainName, sourceType),
    status: normalizeCommunityStatus(typedAction === 'hide' ? 'hidden' : 'published'),
  }

  const { error } = await supabase
    .from('posts')
    .update({
      content: serializeCommunityPostPayload(nextPayload),
    })
    .eq('id', postId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
