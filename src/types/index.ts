export type Province = {
  id: string
  name: string
  code: string
  score: number
  active_users: number
}

export type Mountain = {
  id: string
  name: string
  altitude: number
  province: string
  province_code: string
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  min_license: 'none' | 'basic' | 'intermediate' | 'advanced'
  latitude: number
  longitude: number
  description: string
  cover_image: string
  gallery_images?: string[] | null
  galleryImages?: string[] | null
  checkin_count: number
  route_thumbnail?: string | null
  route_preview_image?: string | null
  routePreviewImage?: string | null
  length_km?: number | null
  elevation_gain_m?: number | null
  estimated_duration?: string | null
  estimated_duration_min?: number | null
  route_preview_image_url?: string | null
  poi_summary?: string[] | null
  approach_radius_m?: number | null
  summit_radius_m?: number | null
  is_saved?: boolean
  lock_reason?: string | null
  created_at: string
}

export type User = {
  id: string
  email: string
  username: string
  avatar_url: string
  province: string
  province_code: string
  license_level: 'none' | 'basic' | 'intermediate' | 'advanced'
  total_altitude: number
  mountain_count: number
  onboarding_version?: string | null
  onboarding_completed_at?: string | null
  created_at: string
}

export type Checkin = {
  id: string
  user_id: string
  mountain_id: string | null
  type: 'gps' | 'photo'
  source?: 'realtime_gps' | 'historical_photo' | 'track_import' | null
  status: 'pending' | 'approved' | 'rejected'
  photo_url: string | null
  latitude: number | null
  longitude: number | null
  note: string
  session_id?: string | null
  verified_at?: string | null
  verification_distance_m?: number | null
  poster_template?: ShareCardTemplate | null
  poster_url?: string | null
  ranking_weight?: number | null
  review_note?: string | null
  created_at: string
  mountain?: Mountain
  user?: User
}

export type Achievement = {
  id: string
  user_id: string
  type: string
  title: string
  description: string
  icon: string
  earned_at: string
}

export type Post = {
  id: string
  user_id: string
  checkin_id: string
  content: string
  poster_url: string | null
  like_count: number
  comment_count: number
  created_at: string
  title?: string
  body?: string
  visibility?: 'public' | 'private'
  source_type?: 'realtime_gps' | 'historical_photo' | 'track_import'
  status?: 'published' | 'hidden' | 'removed'
  published_at?: string | null
  cover_asset_id?: string | null
  cover_url?: string | null
  tags?: string[]
  is_featured?: boolean
  user?: User
  checkin?: Checkin
}

export type PostVisibility = 'public' | 'private'

export type PostStatus = 'published' | 'hidden' | 'removed'

export type CheckinAssetType = 'image' | 'video' | 'poster'

export type CheckinAssetSource = 'record' | 'upload' | 'generated' | 'fallback'

export type CheckinAsset = {
  id: string
  checkin_id: string
  type: CheckinAssetType
  url: string
  thumbnail_url?: string | null
  created_at: string
  sort_order: number
  source?: CheckinAssetSource
}

export type CommunityTrackPreviewPoint = {
  lat: number
  lng: number
  altitude: number | null
  ts: number
}

export type CommunityTrackPreview = {
  points: CommunityTrackPreviewPoint[]
  pointCount: number
  hasAltitude: boolean
}

export type CommunityPostPayload = {
  schemaVersion: 1
  title: string
  body: string
  visibility: PostVisibility
  status: PostStatus
  sourceType: 'realtime_gps' | 'historical_photo' | 'track_import'
  tags: string[]
  coverAssetId: string | null
  coverUrl: string | null
  assets: CheckinAsset[]
  trackPreview?: CommunityTrackPreview | null
}

export type CommunityPostMetrics = {
  altitudeM: number
  ascentM: number
  distanceKm: number
  durationSec: number
}

export type CommunityPostViewModel = {
  id: string
  userId: string
  checkinId: string
  title: string
  body: string
  visibility: PostVisibility
  status: PostStatus
  tags: string[]
  likeCount: number
  isLiked: boolean
  isOwner: boolean
  publishedAt: string
  publishedRelative: string
  sourceType: 'realtime_gps' | 'historical_photo' | 'track_import'
  sourceLabel: string
  behaviorText: string
  recordStatusLabel: string
  author: {
    id: string
    username: string
    province: string
    licenseLevel: string
    mountainCount: number
    avatarUrl?: string | null
  }
  mountain: {
    id: string
    name: string
    altitude: number
    province: string
    difficulty: string
    coverImage?: string | null
  } | null
  metrics: CommunityPostMetrics
  note: string
  coverUrl: string | null
  coverType: CheckinAssetType | null
  assets: CheckinAsset[]
  posterUrl: string | null
  routeSessionId: string | null
  trackPreview: CommunityTrackPreview | null
  isFeatured?: boolean
}

export type PublishableRecord = {
  checkinId: string
  sourceType: 'realtime_gps' | 'historical_photo' | 'track_import'
  status: 'approved'
  createdAt: string
  verifiedAt?: string | null
  mountain: {
    id: string
    name: string
    altitude: number
    province: string
    difficulty: string
    coverImage?: string | null
  }
  metrics: CommunityPostMetrics
  note: string
  photoUrl: string | null
  posterUrl: string | null
  routeSessionId: string | null
  shareState: 'unshared' | 'published'
  postId?: string | null
  postVisibility?: PostVisibility | null
}

export type ReviewQueueRecord = {
  checkinId: string
  mountainName: string
  mountainProvince: string
  photoUrl: string | null
  status: 'pending' | 'rejected'
  reviewNote: string | null
  createdAt: string
}

export type PostReport = {
  id: string
  post_id: string
  user_id: string
  reason: string
  status: 'pending' | 'resolved' | 'dismissed'
  created_at: string
}

export type TrekSession = {
  id: string
  user_id: string
  mountain_id: string | null
  status: 'tracking' | 'summit_verified' | 'finished' | 'aborted'
  verify_state?: 'pending' | 'verified' | 'failed'
  started_at: string
  ended_at?: string | null
  track_points?: Array<{ lat: number; lng: number; accuracy: number; altitude: number | null; ts: number }>
  track_summary?: {
    distance_m: number
    ascent_m: number
    descent_m: number
    max_altitude_m: number
    point_count: number
  }
  distance_km?: number
  distance_m?: number
  ascent_m: number
  descent_m: number
  elapsed_time: number
  current_altitude?: number | null
  avg_pace?: string | null
  weather_summary?: string | null
  map_mode?: 'standard' | 'satellite' | 'terrain'
}

export type ShareCardTemplate = 'trek_snapshot' | 'summit_card' | 'activity_summary'

export type ShareRenderMode = 'photo_composite' | 'overlay_only' | 'classic_card'

export type ShareAnchorPosition = 'top' | 'bottom'

export type ShareComposerDraft = {
  template: ShareCardTemplate
  renderMode: ShareRenderMode
  photoFile?: File | null
  anchorPosition: ShareAnchorPosition
  photoOffsetY: number
}

export type ShareCardModel = {
  photo_url?: string | null
  template: ShareCardTemplate
  renderMode?: ShareRenderMode
  headline_metric: string
  secondary_metrics: Array<{ label: string; value: string }>
  route_preview?: string | null
  verified_state: 'verified' | 'pending' | 'historical'
  location_label: string
  recorded_at: string
}

export type ProfileSummary = {
  peak_count: number
  total_distance_km: number
  total_ascent_m: number
  total_duration_sec: number
  streak_days: number
  province_rank: number | null
}

export type OnboardingPhase = 'intro' | 'province' | 'activation' | 'done'

export type ActivationTask = 'find_peak' | 'open_start' | 'learn_share'

export type OnboardingProgress = {
  introSeen: boolean
  provinceChosen: boolean
  activationCompleted: boolean
  version: string
  tasks: Record<ActivationTask, boolean>
}

export type LicenseLevel = {
  level: 'none' | 'basic' | 'intermediate' | 'advanced'
  label: string
  requirement: string
  max_altitude: number
}

export const LICENSE_LEVELS: LicenseLevel[] = [
  { level: 'none', label: '无执照', requirement: '无要求', max_altitude: 1000 },
  { level: 'basic', label: '初级登山证', requirement: '完成3座1000m以下', max_altitude: 2000 },
  { level: 'intermediate', label: '中级登山证', requirement: '完成3座2000m以下', max_altitude: 4000 },
  { level: 'advanced', label: '高级登山证', requirement: '完成3座4000m以下', max_altitude: 99999 },
]
