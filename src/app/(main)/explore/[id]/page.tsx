import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listFeaturedPostsByMountain } from '@/lib/community-server'
import { getMountainDetailHeroImages, getMountainRoutePreviewImage } from '@/lib/mountain-media'
import { listWaypointsByMountain } from '@/lib/waypoints-queries'
import {
  getDifficultyLevelLabel,
  getDifficultySuitabilityCopy,
  getLicenseRequirementLabel,
  getLockPromptCopy,
} from '@/lib/license-ui'
import {
  MapPlaceholder,
  MountainImagePlaceholder,
  SectionHeader,
} from '@/components/ui/MountainUI'
import MountainDetailHeroCarousel from '@/components/ui/MountainDetailHeroCarousel'
import MountainDetailRecordCTA from '@/components/ui/MountainDetailRecordCTA'
import MountainDetailToolbarActions from '@/components/ui/MountainDetailToolbarActions'
import { ActionGlyph, IconActionLink } from '@/components/ui/IconActionButton'
import MountainFeaturedPostCard from '@/components/community/MountainFeaturedPostCard'
import SanitizedMountainDescription from '@/components/mountain/SanitizedMountainDescription'
import WaypointsSection from '@/components/mountain/WaypointsSection'

const LICENSE_RANK: Record<string, number> = {
  none: 0,
  basic: 1,
  intermediate: 2,
  advanced: 3,
}

function getRouteFacts(mountain: {
  altitude: number
  length_km?: number | null
  elevation_gain_m?: number | null
  estimated_duration?: string | null
}) {
  return {
    length: mountain.length_km ?? Number(Math.max(4.2, Math.min(26, mountain.altitude / 260)).toFixed(1)),
    gain: mountain.elevation_gain_m ?? Math.max(320, Math.round(mountain.altitude * 0.68)),
    duration: mountain.estimated_duration ?? `${Math.max(2, Math.min(12, Math.round(mountain.altitude / 650)))}h`,
  }
}

function getRouteTypeLabel(level: string) {
  switch (level) {
    case 'beginner':
      return '轻装入门线'
    case 'intermediate':
      return '经典进阶线'
    case 'advanced':
      return '长线挑战线'
    case 'expert':
      return '高海拔挑战线'
    default:
      return '经典徒步线'
  }
}

function getWeatherGuidance(mountain: { altitude: number; difficulty: string }) {
  const altitudeHint =
    mountain.altitude >= 4000
      ? '高海拔温差更直接，风感也会更强。'
      : mountain.altitude >= 2000
        ? '山里温差更大，午后变化也更快。'
        : '山区体感通常低于城市，山脊风更明显。'

  const difficultyHint =
    mountain.difficulty === 'advanced' || mountain.difficulty === 'expert'
      ? '长线尽量更早出发，把回撤判断留在上午。'
      : '经典路线也尽量早点出发，天气会更稳一些。'

  return [
    { label: '体感提醒', value: altitudeHint },
    { label: '出发前复核', value: '出发前 12 小时和上山前各核一次。' },
    { label: '节奏建议', value: difficultyHint },
  ]
}

function DetailStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="metric-tile" style={{ padding: '12px 10px' }}>
      <div className="font-pixel" style={{ fontSize: 16 }}>{value}</div>
      <div className="metric-label" style={{ marginTop: 4 }}>{label}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile detail-info-row">
      <div className="detail-info-row__label">{label}</div>
      <div className="detail-info-row__value">
        {value}
      </div>
    </div>
  )
}

export default async function MountainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [mountainRes, profileRes, featuredPosts, waypoints] = await Promise.all([
    supabase.from('mountains').select('*').eq('id', id).single(),
    user
      ? supabase.from('profiles').select('license_level').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
    listFeaturedPostsByMountain({
      supabase,
      mountainId: id,
      limit: 5,
    }),
    listWaypointsByMountain(id).catch(() => []),
  ])

  const mountain = mountainRes.data
  if (!mountain) notFound()

  const routeFacts = getRouteFacts(mountain)
  const heroImages = getMountainDetailHeroImages(mountain, 3)
  const routePreviewImage = getMountainRoutePreviewImage(mountain)
  const featuredWithPhotos = featuredPosts.filter((post) =>
    post.assets.some((asset) => asset.type === 'image' && Boolean(asset.url))
  )
  const userLicense = profileRes.data?.license_level ?? 'none'
  const isLocked = LICENSE_RANK[userLicense] < LICENSE_RANK[mountain.min_license]
  const requiresLogin = !user
  const difficultyLabel = getDifficultyLevelLabel(mountain.difficulty)
  const licenseRequirementLabel = getLicenseRequirementLabel(mountain.min_license)
  const suitabilityLabel = getDifficultySuitabilityCopy(mountain.difficulty)
  const weatherGuidance = getWeatherGuidance(mountain)
  const descriptionHtml =
    mountain.description?.trim()
      ? mountain.description
      : '先看看这座山更偏轻装徒步、长线挑战，还是需要为海拔和补给节奏多做些准备。'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        // Reserve extra scroll room so the final section can clear the fixed record bar.
        padding: '20px 20px calc(300px + env(safe-area-inset-bottom))',
      }}
    >
      <div className="page-toolbar">
        <IconActionLink href="/explore" label="返回探索" icon={<ActionGlyph name="back" />} />
        <MountainDetailToolbarActions />
      </div>

      <section id="mountain-overview" className="surface-card" style={{ overflow: 'hidden', padding: 10, marginBottom: 18 }}>
        <div style={{ position: 'relative' }}>
          <MountainDetailHeroCarousel
            name={mountain.name}
            altitude={mountain.altitude}
            images={heroImages}
          />
          <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="muted-chip active">{difficultyLabel}</span>
            <span className={`muted-chip ${mountain.min_license === 'none' ? 'active' : ''}`}>{licenseRequirementLabel}</span>
          </div>
        </div>

        <div style={{ padding: '16px 10px 10px', display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="font-pixel" style={{ fontSize: 28, overflowWrap: 'anywhere' }}>{mountain.name}</div>
            <div className="section-subtitle">{mountain.province}</div>
            <div className="section-subtitle">{suitabilityLabel}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <DetailStat label="海拔" value={`${mountain.altitude.toLocaleString()}m`} />
            <DetailStat label="距离" value={`${routeFacts.length}km`} />
            <DetailStat label="爬升" value={`${routeFacts.gain}m`} />
            <DetailStat label="时长" value={routeFacts.duration} />
          </div>

          <div className="detail-info-list">
            <InfoRow label="难度等级" value={difficultyLabel} />
            <InfoRow label="准入要求" value={licenseRequirementLabel} />
            <InfoRow label="适合人群" value={suitabilityLabel} />
          </div>

          {isLocked && (
            <div className="danger-card" style={{ padding: 14 }}>
              <div className="section-subtitle" style={{ color: 'color-mix(in oklch, var(--color-error) 58%, var(--color-on-surface))' }}>
                {getLockPromptCopy(mountain.min_license)}
              </div>
            </div>
          )}

          <MountainDetailRecordCTA
            isLocked={isLocked}
            requiresLogin={requiresLogin}
            minLicense={mountain.min_license}
            mountainName={mountain.name}
            altitude={mountain.altitude}
            mountainId={mountain.id}
          />
        </div>
      </section>

      <section id="mountain-intro" className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
        <SectionHeader title="山峰简介" />
        <div style={{ marginBottom: 12 }}>
          <SanitizedMountainDescription html={descriptionHtml} />
        </div>
      </section>

      <section id="route-reference" className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
        <SectionHeader title="静态路线参考" description="只帮助你理解路线轮廓，不替代专业地图与现场判断。" />
        {routePreviewImage ? (
          <div className="surface-card" style={{ padding: 10, marginBottom: 12 }}>
            <MountainImagePlaceholder
              name={`${mountain.name} 路线参考`}
              altitude={mountain.altitude}
              size="lg"
              coverImage={routePreviewImage}
            />
          </div>
        ) : (
          <MapPlaceholder
            title="静态路线参考"
            subtitle={`预计 ${routeFacts.duration} · 累计爬升 ${routeFacts.gain}m · 全长 ${routeFacts.length}km`}
            height={280}
          />
        )}

        <div
          data-testid="mountain-route-facts"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 12 }}
        >
          <DetailStat label="路线类型" value={getRouteTypeLabel(mountain.difficulty)} />
          <DetailStat label="距离" value={`${routeFacts.length}km`} />
          <DetailStat label="时长" value={routeFacts.duration} />
          <DetailStat label="累计爬升" value={`${routeFacts.gain}m`} />
        </div>

        <div className="support-copy support-copy--compact support-copy--muted" style={{ marginTop: 12 }}>
          本路线仅供参考，实际请结合专业地图、天气、向导和现场情况判断。
        </div>
      </section>

      <section id="weather-guidance" className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
        <SectionHeader title="行前天气提醒" />
        <div className="weather-reminder-list" data-testid="weather-reminder-list">
          {weatherGuidance.map((item) => (
            <div key={item.label} className="weather-reminder-item" data-testid="weather-reminder-item">
              <div className="weather-reminder-item__label">{item.label}</div>
              <div className="weather-reminder-item__value">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {waypoints.length > 0 ? <WaypointsSection waypoints={waypoints} /> : null}

      {featuredWithPhotos.length > 0 && (
        <section
          className="surface-card mountain-featured-posts"
          data-testid="mountain-featured-posts-section"
          style={{ padding: 16, marginBottom: 18 }}
        >
          <div className="mountain-featured-posts__title">山友经验</div>
          <div className="mountain-featured-posts__list">
            {featuredWithPhotos.map((post) => (
              <MountainFeaturedPostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
