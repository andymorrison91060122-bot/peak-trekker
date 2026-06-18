import { notFound, redirect } from 'next/navigation'
import PrimaryButton from '@/components/ui/PrimaryButton'
import { WarnIcon } from '@/components/ui/Icons'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import {
  buildDefaultCommunityPosterUrl,
  buildCommunityDefaultTitle,
  parseCommunityPostOwnerMutation,
  parseCommunityPostPayload,
} from '@/lib/community'
import { buildCommunityMetrics } from '@/lib/community'
import { getMountainPosterBackgroundImage } from '@/lib/mountain-media'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { resolveCheckinSource, type CheckinSource } from '@/lib/trek-utils'
import PublishEditorClient from './PublishEditorClient'

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null
  return (value ?? null) as T | null
}

export default async function CommunityPublishPage({
  params,
}: {
  params: Promise<{ checkinId: string }>
}) {
  const { checkinId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?from=/community/publish/${checkinId}`)
  }

  const checkinSelectVariants = [
    `
      id, user_id, type, source, note, photo_url, poster_url, session_id, created_at,
      mountains(id, name, altitude, province, difficulty, cover_image, gallery_images, route_preview_image, route_preview_image_url)
    `,
    `
      id, user_id, type, note, photo_url, poster_url, created_at,
      mountains(id, name, altitude, province, difficulty)
    `,
    `
      id, user_id, type, note, photo_url, created_at,
      mountains(id, name, altitude, province, difficulty)
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
          .eq('user_id', user.id)
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

  const { data: existingPosts } = await supabase
    .from('posts')
    .select('id, content, poster_url, created_at')
    .eq('checkin_id', checkinId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const existingPost = ((existingPosts ?? []) as Array<{
    id: string
    content: string | null
    poster_url: string | null
    created_at: string
  }>)[0] ?? null

  const existingPostMutationRows = existingPost
    ? await supabase
        .from('comments')
        .select('user_id, content, created_at')
        .eq('post_id', existingPost.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ user_id: string; content: string; created_at: string }> }

  const latestOwnerMutation = (existingPostMutationRows.data ?? [])
    .map((row) => parseCommunityPostOwnerMutation(row.content))
    .find(Boolean)

  const typedCheckin = checkinResult.data as {
    id: string
    user_id: string
    type: 'gps' | 'photo'
    source?: CheckinSource | null
    note: string | null
    photo_url: string | null
    poster_url?: string | null
    session_id?: string | null
    created_at: string
    mountains:
      | Array<{
          id: string
          name: string
          altitude: number
          province: string
          difficulty: string
          cover_image?: string | null
          gallery_images?: string[] | null
          route_preview_image?: string | null
          route_preview_image_url?: string | null
        }>
      | {
          id: string
          name: string
          altitude: number
          province: string
          difficulty: string
          cover_image?: string | null
          gallery_images?: string[] | null
          route_preview_image?: string | null
          route_preview_image_url?: string | null
        }
      | null
  } | null

  if (!typedCheckin) notFound()
  const mountain = firstRelation(typedCheckin.mountains)
  if (!mountain) {
    return (
      <section
        aria-labelledby="publish-data-issue-title"
        style={{
          minHeight: 'calc(100dvh - 180px)',
          display: 'grid',
          placeItems: 'center',
          padding: 'var(--space-8) var(--space-4)',
          color: 'var(--color-on-surface)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            minWidth: 0,
            padding: 'var(--space-6) var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            boxShadow: 'var(--shadow-soft)',
            textAlign: 'center',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 42%, var(--color-outline))',
              background: 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface-elevated))',
              color: 'var(--color-warning)',
            }}
          >
            <WarnIcon size={28} />
          </div>
          <h1
            id="publish-data-issue-title"
            style={{
              margin: 'var(--space-5) 0 0',
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-headline-m-size)',
              lineHeight: 'var(--font-headline-m-line)',
              fontWeight: 'var(--font-headline-m-weight)',
            }}
          >
            记录数据异常，暂时无法发布
          </h1>
          <p
            style={{
              margin: 'var(--space-3) 0 0',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 1.7,
              fontWeight: 'var(--font-body-m-weight)',
            }}
          >
            这次记录还在，但关联山峰数据暂时缺失。请先回到我的页面，稍后再试。
          </p>
          <PrimaryButton as="a" href="/profile" style={{ width: '100%', marginTop: 'var(--space-5)' }}>
            回到「我的」
          </PrimaryButton>
        </div>
      </section>
    )
  }

  const sourceType = resolveCheckinSource({ source: typedCheckin.source, type: typedCheckin.type })
  const fallbackPosterUrl =
    existingPost?.poster_url ??
    typedCheckin.poster_url ??
    buildDefaultCommunityPosterUrl({
      checkinId,
      sourceType,
    })
  const session =
    typedCheckin.session_id
      ? await supabase
          .from('trek_sessions')
          .select('id, started_at, ended_at, distance_m, ascent_m, max_altitude_m')
          .eq('id', typedCheckin.session_id)
          .maybeSingle()
      : { data: null }

  const metrics = buildCommunityMetrics({
    session: session.data,
    altitude: mountain.altitude,
  })

  const payload = parseCommunityPostPayload({
    content:
      latestOwnerMutation && latestOwnerMutation.type === 'override'
        ? latestOwnerMutation.serializedPayload
        : latestOwnerMutation?.type === 'removed'
          ? null
          : existingPost?.content ?? null,
    fallbackPhotoUrl: typedCheckin.photo_url,
    fallbackPosterUrl,
    checkinId,
    sourceType,
    mountainName: mountain.name,
  })

  const defaultTitle = buildCommunityDefaultTitle(mountain.name, sourceType)

  return (
    <PublishEditorClient
      checkinId={checkinId}
      sourceType={sourceType}
      defaultTitle={defaultTitle}
      initialPayload={payload}
      record={{
        mountain: {
          id: mountain.id,
          name: mountain.name,
          altitude: mountain.altitude,
          province: mountain.province,
          difficulty: mountain.difficulty,
          coverImage: getMountainPosterBackgroundImage(mountain),
        },
        metrics,
        note: typedCheckin.note ?? '',
        photoUrl: typedCheckin.photo_url,
        posterUrl: fallbackPosterUrl,
        createdAt: typedCheckin.created_at,
      }}
      existingPostId={latestOwnerMutation?.type === 'removed' ? null : existingPost?.id ?? null}
      userId={user.id}
    />
  )
}
