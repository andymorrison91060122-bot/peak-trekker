import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildCommunityTrackPreview,
  buildDefaultCommunityPosterUrl,
  buildCommunitySourceLabel,
} from '@/lib/community'
import { listPublishableRecords } from '@/lib/community-server'
import { resolveCheckinSource } from '@/lib/trek-utils'
import type { CheckinAsset } from '@/types'

type AnySupabase = SupabaseClient

type ActivitySessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  ascent_m: number | null
  max_altitude_m: number | null
  track_points?: unknown
}

type LinkedPostRow = {
  id: string
  created_at: string
}

type CheckinAssetRow = {
  id: string
  checkin_id: string
  type: 'image' | 'video' | 'poster'
  url: string
  thumbnail_url: string | null
  created_at: string
  sort_order: number | null
}

export type ActivityDetail = {
  checkinId: string
  createdAt: string
  startedAt: string | null
  summitAt: string | null
  verifiedAt: string | null
  note: string
  sourceType: 'realtime_gps' | 'historical_photo' | 'track_import'
  sourceLabel: string
  recordSourceLabel: string
  summitStatusLabel: string
  verificationStatusLabel: string
  mountain: {
    id: string
    name: string
    altitude: number
    province: string
    difficulty: string
    coverImage: string | null
  }
  metrics: {
    altitudeM: number
    ascentM: number
    distanceKm: number
    durationSec: number
  }
  routeSessionId: string | null
  trackPreview: ReturnType<typeof buildCommunityTrackPreview> | null
  photoUrl: string | null
  posterUrl: string | null
  coverUrl: string | null
  photos: CheckinAsset[]
  linkedPost: {
    postId: string
    visibility: 'public' | 'private'
    publishedAt: string
  } | null
}

function dedupePhotoAssets({
  legacyPhotoUrl,
  assets,
}: {
  legacyPhotoUrl: string | null
  assets: CheckinAssetRow[]
}): CheckinAsset[] {
  const next: CheckinAsset[] = []
  const seenUrls = new Set<string>()

  if (legacyPhotoUrl) {
    seenUrls.add(legacyPhotoUrl)
    next.push({
      id: 'legacy-photo',
      checkin_id: 'legacy-photo',
      type: 'image',
      url: legacyPhotoUrl,
      thumbnail_url: legacyPhotoUrl,
      created_at: FALLBACK_CREATED_AT,
      sort_order: 0,
      source: 'record',
    })
  }

  for (const asset of assets) {
    if (asset.type !== 'image' || seenUrls.has(asset.url)) continue
    seenUrls.add(asset.url)
    next.push({
      id: asset.id,
      checkin_id: asset.checkin_id,
      type: asset.type,
      url: asset.url,
      thumbnail_url: asset.thumbnail_url,
      created_at: asset.created_at,
      sort_order: asset.sort_order ?? next.length,
      source: 'upload',
    })
  }

  return next
}

const FALLBACK_CREATED_AT = '1970-01-01T00:00:00.000Z'

export async function getActivityDetail({
  supabase,
  checkinId,
  userId,
}: {
  supabase: AnySupabase
  checkinId: string
  userId: string
}): Promise<ActivityDetail | null> {
  const records = await listPublishableRecords({ supabase, userId })
  const record = records.find((item) => item.checkinId === checkinId) ?? null
  if (!record) return null

  const sourceType = resolveCheckinSource({
    source: record.sourceType,
    type: record.sourceType === 'historical_photo' ? 'photo' : 'gps',
  })
  const isHistoricalPhoto = sourceType === 'historical_photo'
  const isTrackImport = sourceType === 'track_import'

  const [{ data: linkedPost }, sessionResult, assetResult] = await Promise.all([
    record.postId
      ? supabase
          .from('posts')
          .select('id, created_at')
          .eq('id', record.postId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null as LinkedPostRow | null }),
    record.routeSessionId
      ? supabase
          .from('trek_sessions')
          .select('id, started_at, ended_at, distance_m, ascent_m, max_altitude_m, track_points')
          .eq('id', record.routeSessionId)
          .maybeSingle()
      : Promise.resolve({ data: null as ActivitySessionRow | null }),
    supabase
      .from('checkin_assets')
      .select('id, checkin_id, type, url, thumbnail_url, created_at, sort_order')
      .eq('checkin_id', checkinId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  const session = (sessionResult.data ?? null) as ActivitySessionRow | null
  const photoAssets = dedupePhotoAssets({
    legacyPhotoUrl: record.photoUrl ?? null,
    assets: ((assetResult.data ?? []) as CheckinAssetRow[]).filter((asset) => asset.type === 'image'),
  })
  const generatedPosterUrl = buildDefaultCommunityPosterUrl({
    checkinId,
    sourceType,
  })
  const coverUrl = record.photoUrl ?? record.posterUrl ?? generatedPosterUrl ?? record.mountain.coverImage ?? null

  return {
    checkinId: record.checkinId,
    createdAt: record.createdAt,
    startedAt: session?.started_at ?? record.createdAt,
    summitAt: record.verifiedAt ?? session?.ended_at ?? null,
    verifiedAt: record.verifiedAt ?? null,
    note: record.note?.trim() ?? '',
    sourceType,
    sourceLabel: buildCommunitySourceLabel(sourceType),
    recordSourceLabel: isHistoricalPhoto ? '补签记录' : isTrackImport ? '上传数据' : 'GPS 记录',
    summitStatusLabel: isHistoricalPhoto ? '历史补签通过' : isTrackImport ? '轨迹导入通过' : '已核验登顶',
    verificationStatusLabel: isHistoricalPhoto ? '补签审核通过' : isTrackImport ? '上传数据' : 'GPS 核验通过',
    mountain: {
      ...record.mountain,
      coverImage: record.mountain.coverImage ?? null,
    },
    metrics: record.metrics,
    routeSessionId: record.routeSessionId ?? null,
    trackPreview: session ? buildCommunityTrackPreview(session?.track_points) : null,
    photoUrl: record.photoUrl ?? null,
    posterUrl: record.posterUrl ?? generatedPosterUrl ?? null,
    coverUrl,
    photos: photoAssets,
    linkedPost:
      linkedPost && record.postId
        ? {
            postId: record.postId,
            visibility: record.postVisibility ?? 'public',
            publishedAt: linkedPost.created_at,
          }
        : null,
  }
}
