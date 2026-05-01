import type {
  CheckinAsset,
  CheckinAssetSource,
  CheckinAssetType,
  CommunityPostMetrics,
  CommunityPostPayload,
  CommunityTrackPreview,
  CommunityPostViewModel,
  PostStatus,
  PostVisibility,
} from '@/types'
import { getMountainPosterBackgroundImage } from '@/lib/mountain-media'
import { safeTrackPoints } from '@/lib/trek-utils'

export const COMMUNITY_MAX_TAGS = 3
export const COMMUNITY_MAX_TITLE_LENGTH = 30
export const COMMUNITY_MAX_BODY_LENGTH = 1000
export const COMMUNITY_MAX_IMAGE_COUNT = 9
export const COMMUNITY_POST_OVERRIDE_PREFIX = '[POST_OVERRIDE] '
export const COMMUNITY_POST_REMOVE_PREFIX = '[POST_REMOVE]'
export const COMMUNITY_POST_FEATURE_PREFIX = '[POST_FEATURE]'
export const COMMUNITY_POST_UNFEATURE_PREFIX = '[POST_UNFEATURE]'

type SessionSummaryLike = {
  started_at?: string | null
  ended_at?: string | null
  distance_m?: number | null
  ascent_m?: number | null
  max_altitude_m?: number | null
}

export function estimateCommunityDistanceKm(altitude: number) {
  return Number(Math.max(4.2, Math.min(26, altitude / 260)).toFixed(1))
}

export function estimateCommunityAscentM(altitude: number) {
  return Math.max(320, Math.round(altitude * 0.68))
}

export function estimateCommunityDurationSec(altitude: number) {
  const hours = Math.max(2, Math.min(12, Math.round(altitude / 650)))
  return hours * 3600
}

export function buildCommunityMetrics({
  session,
  altitude,
}: {
  session?: SessionSummaryLike | null
  altitude: number
}): CommunityPostMetrics {
  const distanceKm = session?.distance_m ? Number((Number(session.distance_m) / 1000).toFixed(1)) : estimateCommunityDistanceKm(altitude)
  const ascentM = session?.ascent_m ? Math.max(0, Number(session.ascent_m)) : estimateCommunityAscentM(altitude)
  const altitudeM = session?.max_altitude_m ? Math.max(altitude, Number(session.max_altitude_m)) : altitude

  let durationSec = estimateCommunityDurationSec(altitude)
  if (session?.started_at && session?.ended_at) {
    const start = new Date(session.started_at).getTime()
    const end = new Date(session.ended_at).getTime()
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      durationSec = Math.max(60, Math.round((end - start) / 1000))
    }
  }

  return {
    altitudeM,
    ascentM,
    distanceKm,
    durationSec,
  }
}

export function formatCommunityDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export function formatCommunityRelativeTime(dateStr: string) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

export function formatCommunityDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function normalizeCommunityTitle(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.slice(0, COMMUNITY_MAX_TITLE_LENGTH) || fallback
}

export function normalizeCommunityBody(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, COMMUNITY_MAX_BODY_LENGTH)
}

export function normalizeCommunityVisibility(value: unknown): PostVisibility {
  return value === 'private' ? 'private' : 'public'
}

export function normalizeCommunityStatus(value: unknown): PostStatus {
  if (value === 'hidden' || value === 'removed') return value
  return 'published'
}

export function normalizeCommunityTags(value: unknown) {
  if (!Array.isArray(value)) return []
  const next = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const cleaned = item.trim().replace(/^#+/, '').slice(0, 20)
    if (!cleaned) continue
    next.add(cleaned)
    if (next.size >= COMMUNITY_MAX_TAGS) break
  }
  return [...next]
}

export function buildCommunityDefaultTitle(mountainName: string, sourceType: 'realtime_gps' | 'historical_photo') {
  return sourceType === 'historical_photo'
    ? `补签了 ${mountainName} 的登山记录`
    : `登顶了 ${mountainName}`
}

export function buildCommunityBehaviorText(mountainName: string, sourceType: 'realtime_gps' | 'historical_photo') {
  return sourceType === 'historical_photo'
    ? `补签了 ${mountainName} 的历史记录`
    : `登顶了 ${mountainName}`
}

export function buildCommunitySourceLabel(sourceType: 'realtime_gps' | 'historical_photo') {
  return sourceType === 'historical_photo' ? '照片补签记录' : 'GPS 实时记录'
}

export function buildCommunityActionTitle(sourceType: 'realtime_gps' | 'historical_photo') {
  return sourceType === 'historical_photo' ? '照片补签' : 'GPS 记录'
}

export function buildCommunityRenderFallbackTitle({
  mountainName,
  sourceType,
}: {
  mountainName?: string | null
  sourceType?: 'realtime_gps' | 'historical_photo' | null
}) {
  const normalizedMountainName = typeof mountainName === 'string' ? mountainName.trim() : ''
  const actionTitle =
    sourceType === 'historical_photo' || sourceType === 'realtime_gps'
      ? buildCommunityActionTitle(sourceType)
      : ''

  if (!normalizedMountainName || !actionTitle) {
    return '未命名记录'
  }

  return `${normalizedMountainName} · ${actionTitle}`
}

export function buildDefaultCommunityPosterUrl({
  checkinId,
  sourceType,
  anchorPosition = 'top',
}: {
  checkinId: string
  sourceType: 'realtime_gps' | 'historical_photo'
  anchorPosition?: 'top' | 'bottom'
}) {
  const template = sourceType === 'historical_photo' ? 'activity_summary' : 'summit_card'
  return `/api/poster?checkinId=${encodeURIComponent(checkinId)}&template=${template}&renderMode=classic_card&anchorPosition=${anchorPosition}`
}

export function createCommunityAsset({
  id,
  checkinId,
  type,
  url,
  thumbnailUrl = null,
  sortOrder,
  source,
  createdAt,
}: {
  id: string
  checkinId: string
  type: CheckinAssetType
  url: string
  thumbnailUrl?: string | null
  sortOrder: number
  source: CheckinAssetSource
  createdAt?: string
}): CheckinAsset {
  return {
    id,
    checkin_id: checkinId,
    type,
    url,
    thumbnail_url: thumbnailUrl,
    created_at: createdAt ?? new Date().toISOString(),
    sort_order: sortOrder,
    source,
  }
}

export function deriveLegacyCheckinAssets({
  checkinId,
  photoUrl,
  posterUrl,
}: {
  checkinId: string
  photoUrl?: string | null
  posterUrl?: string | null
}) {
  const assets: CheckinAsset[] = []
  if (photoUrl) {
    assets.push(
      createCommunityAsset({
        id: 'record-photo',
        checkinId,
        type: 'image',
        url: photoUrl,
        thumbnailUrl: photoUrl,
        sortOrder: 0,
        source: 'record',
      })
    )
  }
  if (posterUrl) {
    assets.push(
      createCommunityAsset({
        id: 'generated-poster',
        checkinId,
        type: 'poster',
        url: posterUrl,
        thumbnailUrl: posterUrl,
        sortOrder: assets.length,
        source: 'generated',
      })
    )
  }
  return assets
}

function normalizeTrackPreview(value: unknown): CommunityTrackPreview | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as {
    points?: unknown
    pointCount?: unknown
    hasAltitude?: unknown
  }
  const points = safeTrackPoints(raw.points)
  if (points.length < 2) return null

  return {
    points: points.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      altitude: point.altitude,
      ts: point.ts,
    })),
    pointCount: Number.isFinite(Number(raw.pointCount)) ? Number(raw.pointCount) : points.length,
    hasAltitude:
      typeof raw.hasAltitude === 'boolean'
        ? raw.hasAltitude
        : points.some((point) => typeof point.altitude === 'number'),
  }
}

export function buildCommunityTrackPreview(value: unknown, maxPoints = 48): CommunityTrackPreview | null {
  const points = safeTrackPoints(value)
  if (points.length < 2) return null

  const step = Math.max(1, Math.ceil(points.length / maxPoints))
  const sampled = points.filter((_, index) => index % step === 0)
  const finalPoints = sampled.at(-1)?.ts === points.at(-1)?.ts ? sampled : [...sampled, points.at(-1)!]

  return {
    points: finalPoints.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      altitude: point.altitude,
      ts: point.ts,
    })),
    pointCount: points.length,
    hasAltitude: points.some((point) => typeof point.altitude === 'number'),
  }
}

export function prioritizeCommunityAssets(assets: CheckinAsset[]) {
  return [...assets].sort((a, b) => {
    const aScore = a.type === 'poster' ? 0 : a.type === 'image' ? 1 : 2
    const bScore = b.type === 'poster' ? 0 : b.type === 'image' ? 1 : 2
    if (aScore !== bScore) return aScore - bScore
    return a.sort_order - b.sort_order
  })
}

export function hasCommunityImageAsset(assets: CheckinAsset[]) {
  return assets.some((asset) => asset.type === 'image')
}

export function shouldRenderCommunityPost({
  sourceType,
  assets,
}: {
  sourceType: 'realtime_gps' | 'historical_photo'
  assets: CheckinAsset[]
}) {
  return sourceType !== 'historical_photo' || hasCommunityImageAsset(assets)
}

export function buildCommunityMetricItems({
  sourceType,
  metrics,
  mountain,
}: {
  sourceType: 'realtime_gps' | 'historical_photo'
  metrics: CommunityPostMetrics
  mountain?: {
    name?: string | null
    province?: string | null
  } | null
}) {
  if (sourceType === 'historical_photo') {
    return [
      { label: '海拔', value: `${metrics.altitudeM.toLocaleString()} m` },
      { label: '山峰', value: mountain?.name?.trim() || '未知山峰' },
      { label: '地点', value: mountain?.province?.trim() || '未知地点' },
    ]
  }

  return [
    { label: '海拔', value: `${metrics.altitudeM.toLocaleString()} m` },
    { label: '路线距离', value: `${metrics.distanceKm.toFixed(1)} km` },
    { label: '累计爬升', value: `${metrics.ascentM} m` },
    { label: '运动时长', value: formatCommunityDuration(metrics.durationSec) },
  ]
}

export function resolveCommunityCardVariant({
  sourceType,
  assets,
}: {
  sourceType: 'realtime_gps' | 'historical_photo'
  assets: CheckinAsset[]
}) {
  const hasRenderableMedia = assets.some((asset) => asset.type === 'image' || asset.type === 'video')
  if (hasRenderableMedia) {
    return 'media' as const
  }

  return sourceType === 'realtime_gps' ? ('route_map' as const) : ('no_image' as const)
}

export function serializeCommunityPostPayload(payload: CommunityPostPayload) {
  return JSON.stringify(payload)
}

export function buildCommunityPostOverrideComment(serializedPayload: string) {
  return `${COMMUNITY_POST_OVERRIDE_PREFIX}${serializedPayload}`
}

export function buildCommunityPostRemoveComment() {
  return COMMUNITY_POST_REMOVE_PREFIX
}

export function buildCommunityPostFeatureComment(featured: boolean) {
  return featured ? COMMUNITY_POST_FEATURE_PREFIX : COMMUNITY_POST_UNFEATURE_PREFIX
}

export function normalizeCommunityActionError(message: unknown, fallback: string) {
  const text = typeof message === 'string' ? message : ''
  if (!text) return fallback

  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(text)) {
    return '当前网络不稳定，请在信号更稳定后重试。'
  }

  if (/row-level security|forbidden|unauthorized/i.test(text)) {
    return '当前账号没有权限执行这个操作。'
  }

  if (/content exceeds limits/i.test(text)) {
    return '标题、正文或标签数量超过限制，请精简后重试。'
  }

  if (/invalid report payload/i.test(text)) {
    return '举报信息不完整，请重新选择举报原因。'
  }

  if (/invalid asset payload/i.test(text)) {
    return '素材格式不正确，请重新选择与本次记录关联的素材。'
  }

  if (/assets must belong to current checkin/i.test(text)) {
    return '只能发布当前登山记录下的素材，请重新选择。'
  }

  if (/至少需要 1 张审核照片/i.test(text)) {
    return '照片补签必须至少保留 1 张审核照片后才能发布。'
  }

  if (/only approved records can be published/i.test(text)) {
    return '只有已通过的有效登山记录才能分享到山友圈。'
  }

  return text
}

export function parseCommunityPostOwnerMutation(content: unknown):
  | { type: 'override'; serializedPayload: string }
  | { type: 'removed' }
  | null {
  if (typeof content !== 'string') return null
  if (content.startsWith(COMMUNITY_POST_OVERRIDE_PREFIX)) {
    return {
      type: 'override',
      serializedPayload: content.slice(COMMUNITY_POST_OVERRIDE_PREFIX.length),
    }
  }
  if (content.startsWith(COMMUNITY_POST_REMOVE_PREFIX)) {
    return { type: 'removed' }
  }
  return null
}

export function parseCommunityPostFeatureMutation(content: unknown):
  | { type: 'feature'; featured: boolean }
  | null {
  if (typeof content !== 'string') return null
  if (content.startsWith(COMMUNITY_POST_FEATURE_PREFIX)) {
    return { type: 'feature', featured: true }
  }
  if (content.startsWith(COMMUNITY_POST_UNFEATURE_PREFIX)) {
    return { type: 'feature', featured: false }
  }
  return null
}

export function parseCommunityPostPayload({
  content,
  fallbackPhotoUrl,
  fallbackPosterUrl,
  checkinId,
  sourceType,
  mountainName,
}: {
  content: string | null
  fallbackPhotoUrl?: string | null
  fallbackPosterUrl?: string | null
  checkinId: string
  sourceType: 'realtime_gps' | 'historical_photo'
  mountainName: string
}): CommunityPostPayload {
  const fallbackAssets = deriveLegacyCheckinAssets({
    checkinId,
    photoUrl: fallbackPhotoUrl,
    posterUrl: fallbackPosterUrl,
  })

  if (!content) {
    const orderedAssets = prioritizeCommunityAssets(fallbackAssets)
    const preferredCover = orderedAssets[0] ?? null
    return {
      schemaVersion: 1,
      title: buildCommunityDefaultTitle(mountainName, sourceType),
      body: '',
      visibility: 'public',
      status: 'published',
      sourceType,
      tags: [],
      coverAssetId: preferredCover?.id ?? null,
      coverUrl:
        preferredCover?.thumbnail_url ??
        preferredCover?.url ??
        fallbackPhotoUrl ??
        fallbackPosterUrl ??
        null,
      assets: orderedAssets,
      trackPreview: null,
    }
  }

  try {
    const parsed = JSON.parse(content) as Partial<CommunityPostPayload> | null
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid payload')

        const assets = Array.isArray(parsed.assets)
      ? parsed.assets
          .map((asset, index) => {
            if (!asset || typeof asset !== 'object') return null
            const url = typeof asset.url === 'string' ? asset.url : ''
            if (!url) return null
            const type = asset.type === 'video' || asset.type === 'poster' ? asset.type : 'image'
            const rawAsset = asset as {
              thumbnail_url?: unknown
              thumbnailUrl?: unknown
              sort_order?: unknown
              source?: unknown
              created_at?: unknown
            }
            return createCommunityAsset({
              id: typeof asset.id === 'string' ? asset.id : `asset-${index}`,
              checkinId,
              type,
              url,
              thumbnailUrl:
                typeof rawAsset.thumbnail_url === 'string'
                  ? rawAsset.thumbnail_url
                  : typeof rawAsset.thumbnailUrl === 'string'
                    ? rawAsset.thumbnailUrl
                    : null,
              sortOrder: typeof rawAsset.sort_order === 'number' ? rawAsset.sort_order : index,
              source:
                rawAsset.source === 'upload' || rawAsset.source === 'generated' || rawAsset.source === 'fallback'
                  ? rawAsset.source
                  : 'record',
              createdAt: typeof rawAsset.created_at === 'string' ? rawAsset.created_at : new Date().toISOString(),
            })
          })
          .filter(Boolean) as CheckinAsset[]
      : fallbackAssets

    const nextAssets = assets.length ? prioritizeCommunityAssets(assets) : prioritizeCommunityAssets(fallbackAssets)
    const fallbackTitle = buildCommunityDefaultTitle(mountainName, sourceType)
    const coverAsset =
      nextAssets.find((asset) => asset.id === parsed.coverAssetId) ??
      nextAssets[0] ??
      null

    return {
      schemaVersion: 1,
      title: normalizeCommunityTitle(parsed.title, fallbackTitle),
      body: normalizeCommunityBody(parsed.body),
      visibility: normalizeCommunityVisibility(parsed.visibility),
      status: normalizeCommunityStatus(parsed.status),
      sourceType,
      tags: normalizeCommunityTags(parsed.tags),
      coverAssetId: coverAsset?.id ?? null,
      coverUrl:
        coverAsset?.thumbnail_url ||
        coverAsset?.url ||
        (typeof parsed.coverUrl === 'string' && parsed.coverUrl) ||
        fallbackPhotoUrl ||
        fallbackPosterUrl ||
        null,
      assets: nextAssets,
      trackPreview: normalizeTrackPreview(parsed.trackPreview),
    }
  } catch {
    const title = buildCommunityDefaultTitle(mountainName, sourceType)
    const orderedAssets = prioritizeCommunityAssets(fallbackAssets)
    return {
      schemaVersion: 1,
      title,
      body: content.trim().slice(0, COMMUNITY_MAX_BODY_LENGTH),
      visibility: 'public',
      status: 'published',
      sourceType,
      tags: [],
      coverAssetId: orderedAssets[0]?.id ?? null,
      coverUrl:
        orderedAssets[0]?.thumbnail_url ??
        orderedAssets[0]?.url ??
        fallbackPhotoUrl ??
        fallbackPosterUrl ??
        null,
      assets: orderedAssets,
      trackPreview: null,
    }
  }
}

export function chooseCommunityCoverAsset(payload: CommunityPostPayload) {
  const orderedAssets = prioritizeCommunityAssets(payload.assets)
  return (
    orderedAssets.find((asset) => asset.id === payload.coverAssetId) ??
    orderedAssets[0] ??
    null
  )
}

export function validateCommunityAssets({
  assets,
  userId,
  checkinId,
  sourceType,
  checkinPhotoUrl,
  checkinPosterUrl,
}: {
  assets: CheckinAsset[]
  userId: string
  checkinId: string
  sourceType: 'realtime_gps' | 'historical_photo'
  checkinPhotoUrl?: string | null
  checkinPosterUrl?: string | null
}) {
  if (!assets.length) {
    if (sourceType === 'historical_photo' && !checkinPhotoUrl) {
      return { ok: false as const, message: '照片补签至少需要 1 张审核照片。' }
    }
    return { ok: true as const }
  }

  const videoCount = assets.filter((asset) => asset.type === 'video').length
  const imageCount = assets.filter((asset) => asset.type === 'image').length

  if (sourceType === 'historical_photo' && imageCount === 0 && !checkinPhotoUrl) {
    return { ok: false as const, message: '照片补签至少需要 1 张审核照片。' }
  }

  if (videoCount > 1) {
    return { ok: false as const, message: 'V1 每条动态最多只能包含 1 条视频。' }
  }

  if (videoCount > 0 && imageCount > 0) {
    return { ok: false as const, message: '视频与图片不能混传，请保留其中一种。' }
  }

  if (imageCount > COMMUNITY_MAX_IMAGE_COUNT) {
    return { ok: false as const, message: `最多只能选择 ${COMMUNITY_MAX_IMAGE_COUNT} 张图片。` }
  }

  const allowedPrefixes = [
    `/storage/v1/object/public/checkin-photos/checkins/${userId}/${checkinId}-`,
    `/checkin-photos/checkins/${userId}/${checkinId}-`,
    `/checkin-photos/community-assets/${userId}/${checkinId}/`,
    `/storage/v1/object/public/checkin-photos/community-assets/${userId}/${checkinId}/`,
  ]
  const allowedUrls = new Set([checkinPhotoUrl, checkinPosterUrl].filter(Boolean) as string[])

  for (const asset of assets) {
    if (asset.checkin_id !== checkinId) {
      return { ok: false as const, message: '素材必须绑定到当前登山记录。' }
    }

    const allowed = allowedUrls.has(asset.url) || allowedPrefixes.some((prefix) => asset.url.includes(prefix))
    if (!allowed) {
      return { ok: false as const, message: '存在不属于本次登山记录的素材。' }
    }
  }

  return { ok: true as const }
}

export function buildCommunityPostViewModel({
  postId,
  postUserId,
  checkinId,
  postContent,
  posterUrl,
  checkinPhotoUrl,
  likeCount,
  createdAt,
  liked,
  viewerId,
  author,
  checkin,
  mountain,
  session,
  isFeatured,
}: {
  postId: string
  postUserId: string
  checkinId: string
  postContent: string | null
  posterUrl: string | null
  checkinPhotoUrl?: string | null
  likeCount: number
  createdAt: string
  liked: boolean
  viewerId?: string | null
  author: {
    id: string
    username: string | null
    province: string | null
    license_level: string | null
    mountain_count: number | null
    avatar_url?: string | null
  } | null
  checkin: {
    note?: string | null
    source: 'realtime_gps' | 'historical_photo'
    status?: string | null
    session_id?: string | null
    created_at?: string | null
  }
  mountain: {
    id: string
    name: string
    altitude: number
    province: string
    difficulty: string
    cover_image?: string | null
    gallery_images?: string[] | null
    route_preview_image?: string | null
    route_preview_image_url?: string | null
  } | null
  session?: SessionSummaryLike | null
  isFeatured?: boolean | null
}): CommunityPostViewModel {
  const safeMountainName = mountain?.name ?? '未知山峰'
  const payload = parseCommunityPostPayload({
    content: postContent,
    fallbackPhotoUrl: checkinPhotoUrl,
    fallbackPosterUrl: posterUrl,
    checkinId,
    sourceType: checkin.source,
    mountainName: safeMountainName,
  })
  const coverAsset = chooseCommunityCoverAsset(payload)
  const metrics = buildCommunityMetrics({
    session,
    altitude: mountain?.altitude ?? 0,
  })

  return {
    id: postId,
    userId: postUserId,
    checkinId,
    title: payload.title,
    body: payload.body,
    visibility: payload.visibility,
    status: payload.status,
    tags: payload.tags,
    likeCount,
    isLiked: liked,
    isOwner: Boolean(viewerId && viewerId === postUserId),
    publishedAt: createdAt,
    publishedRelative: formatCommunityRelativeTime(createdAt),
    sourceType: checkin.source,
    sourceLabel: buildCommunitySourceLabel(checkin.source),
    behaviorText: buildCommunityBehaviorText(safeMountainName, checkin.source),
    recordStatusLabel: checkin.source === 'historical_photo' ? '历史补签' : '已核验登顶',
    author: {
      id: author?.id ?? postUserId,
      username: author?.username ?? '匿名登山者',
      province: author?.province ?? '未知省份',
      licenseLevel: author?.license_level ?? 'none',
      mountainCount: author?.mountain_count ?? 0,
      avatarUrl: author?.avatar_url ?? null,
    },
    mountain: mountain
      ? {
          id: mountain.id,
          name: mountain.name,
          altitude: mountain.altitude,
          province: mountain.province,
          difficulty: mountain.difficulty,
          coverImage: getMountainPosterBackgroundImage(mountain),
        }
      : null,
    metrics,
    note: checkin.note?.trim() ?? '',
    coverUrl:
      payload.coverUrl ||
      coverAsset?.thumbnail_url ||
      coverAsset?.url ||
      checkinPhotoUrl ||
      posterUrl ||
      getMountainPosterBackgroundImage(mountain ?? {}) ||
      null,
    coverType: coverAsset?.type ?? (posterUrl ? 'poster' : null),
    assets: payload.assets,
    posterUrl,
    routeSessionId: checkin.session_id ?? null,
    trackPreview: payload.trackPreview ?? null,
    isFeatured: Boolean(isFeatured),
  }
}
