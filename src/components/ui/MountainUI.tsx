import Link from 'next/link'
import { DEFAULT_MOUNTAIN_COVER_URL } from '@/lib/default-media'
import { getMountainDetailHeroImages, getMountainHeroImage, getMountainRoutePreviewImage } from '@/lib/mountain-media'
import { getDifficultyLevelLabel, getLicenseRequirementLabel } from '@/lib/license-ui'

function estimateLength(altitude: number) {
  return Math.max(4.2, Math.min(26, altitude / 260))
}

function estimateGain(altitude: number) {
  return Math.max(320, Math.round(altitude * 0.68))
}

function estimateDuration(altitude: number) {
  const hours = Math.max(2, Math.min(12, Math.round(altitude / 650)))
  return `${hours}h ${hours > 4 ? '30m' : '00m'}`
}

function formatRouteMeta(mountain: {
  altitude: number
  length_km?: number | null
  elevation_gain_m?: number | null
  estimated_duration?: string | null
}) {
  return {
    length: mountain.length_km ?? Number(estimateLength(mountain.altitude).toFixed(1)),
    gain: mountain.elevation_gain_m ?? estimateGain(mountain.altitude),
    duration: mountain.estimated_duration ?? estimateDuration(mountain.altitude),
  }
}

export function PixelMountainBg() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(circle at top left, rgba(255,255,255,0.12), transparent 28%), linear-gradient(180deg, rgba(34,197,94,0.08) 0%, transparent 35%), linear-gradient(180deg, #1c2024 0%, #14171a 65%, #121416 100%)',
      }}
    />
  )
}

export function TopoFrame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`topo-card ${className}`} style={{ padding: 16 }}>
      {children}
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>
          {title}
        </div>
        {description && <div className="section-subtitle">{description}</div>}
      </div>
      {action}
    </div>
  )
}

export function DifficultyBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    beginner: { label: '新手友好', cls: 'diff-beginner' },
    intermediate: { label: '进阶', cls: 'diff-intermediate' },
    advanced: { label: '挑战', cls: 'diff-advanced' },
    expert: { label: '专家', cls: 'diff-expert' },
  }
  const { label, cls } = map[level] ?? { label: level, cls: 'diff-beginner' }
  return (
    <span className={`pixel-badge pixel-badge-dim ${cls}`}>
      {label}
    </span>
  )
}

export function AltitudeBar({ altitude, max = 9000 }: { altitude: number; max?: number }) {
  const pct = Math.min((altitude / max) * 100, 100)
  return (
    <div className="altitude-bar">
      <div className="altitude-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

function MiniRoutePreview({
  size = 'md',
  imageUrl,
}: {
  size?: 'sm' | 'md'
  imageUrl?: string | null
}) {
  const width = size === 'sm' ? 62 : 90
  const height = size === 'sm' ? 62 : 86

  if (imageUrl) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.12)',
          position: 'relative',
          background: '#14181b',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="路线缩略图"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(8,10,12,0.06), rgba(8,10,12,0.54))',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            padding: '4px 6px',
            borderRadius: 999,
            background: 'rgba(8,12,14,0.72)',
            color: 'rgba(245,247,248,0.82)',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 9,
          }}
        >
          参考线
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.12)',
        background:
          'linear-gradient(180deg, rgba(18,20,22,0.1), rgba(18,20,22,0.65)), linear-gradient(135deg, #20262a 0%, #171c20 100%)',
        position: 'relative',
      }}
    >
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path
          d="M16 78 C26 56, 28 54, 40 45 S55 24, 70 26 S78 46, 86 20"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M16 78 C26 56, 28 54, 40 45 S55 24, 70 26 S78 46, 86 20"
          fill="none"
          stroke="#6ee7a1"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="16" cy="78" r="5" fill="#f5f7f8" />
        <circle cx="86" cy="20" r="6" fill="#22c55e" />
      </svg>
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10,
          color: 'rgba(245,247,248,0.76)',
        }}
      >
        参考线
      </div>
    </div>
  )
}

export function MapPlaceholder({
  title = '路线预览',
  subtitle = '仅作静态参考，实际出发请以专业地图和现场判断为准。',
  controls,
  height = 360,
}: {
  title?: string
  subtitle?: string
  controls?: React.ReactNode
  height?: number
}) {
  return (
    <div className="map-surface" style={{ minHeight: height }}>
      <div style={{ position: 'absolute', inset: 0, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div className="surface-card" style={{ padding: '10px 12px', background: 'rgba(18,20,22,0.78)', backdropFilter: 'blur(10px)' }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 4 }}>{title}</div>
            <div className="section-subtitle" style={{ maxWidth: 220 }}>{subtitle}</div>
          </div>
          {controls}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div className="surface-card" style={{ padding: '10px 12px', background: 'rgba(18,20,22,0.78)', backdropFilter: 'blur(10px)' }}>
            <div className="font-mono" style={{ color: 'var(--green-bright)', fontSize: 12, marginBottom: 4 }}>
              STATIC REFERENCE
            </div>
            <div className="section-subtitle">这里只保留静态路线示意和占位语义，不承诺实时地图能力。</div>
          </div>
          <MiniRoutePreview />
        </div>
      </div>
    </div>
  )
}

export function MountainImagePlaceholder({
  name,
  altitude: _altitude,
  size = 'md',
  coverImage,
}: {
  name: string
  altitude: number
  size?: 'sm' | 'md' | 'lg'
  coverImage?: string
}) {
  const heights: Record<string, number> = { sm: 96, md: 144, lg: 252 }
  const h = heights[size]
  const resolvedCoverImage = coverImage || DEFAULT_MOUNTAIN_COVER_URL

  return (
    <div style={{ width: '100%', height: h, position: 'relative', overflow: 'hidden', borderRadius: size === 'sm' ? 12 : 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedCoverImage}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}

export function MountainFeatureCard({ mountain }: { mountain: {
  id: string
  name: string
  altitude: number
  province: string
  difficulty: string
  checkin_count: number
  min_license: string
  cover_image?: string
  length_km?: number | null
  elevation_gain_m?: number | null
  estimated_duration?: string | null
  gallery_images?: string[] | null
  galleryImages?: string[] | null
  route_preview_image?: string | null
  routePreviewImage?: string | null
  route_preview_image_url?: string | null
  route_thumbnail?: string | null
}}) {
  const isLocked = mountain.min_license !== 'none'
  const meta = formatRouteMeta(mountain)
  const heroImage = getMountainHeroImage(mountain) ?? mountain.cover_image
  const routePreviewImage = getMountainRoutePreviewImage(mountain)
  return (
    <Link href={`/explore/${mountain.id}`} style={{ textDecoration: 'none' }}>
      <div className="surface-card" style={{ overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: 10 }}>
          <div style={{ position: 'relative' }}>
            <MountainImagePlaceholder name={mountain.name} altitude={mountain.altitude} size="lg" coverImage={heroImage ?? undefined} />
            <div style={{ position: 'absolute', right: 14, bottom: 14 }}>
              <MiniRoutePreview imageUrl={routePreviewImage} />
            </div>
            <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <DifficultyBadge level={mountain.difficulty} />
              {isLocked && <span className="muted-chip">需执照解锁</span>}
            </div>
          </div>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div className="font-pixel" style={{ fontSize: 22, marginBottom: 4 }}>{mountain.name}</div>
              <div className="section-subtitle">{mountain.province}</div>
            </div>
            <span className="muted-chip active">主链路入口</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { label: '海拔', value: `${(mountain.altitude / 1000).toFixed(1)}k` },
              { label: '路线', value: `${meta.length} km` },
              { label: '爬升', value: `${meta.gain} m` },
              { label: '时长', value: meta.duration },
            ].map((item) => (
              <div key={item.label} className="metric-tile" style={{ padding: '12px 10px' }}>
                <div className="font-pixel" style={{ fontSize: 15 }}>{item.value}</div>
                <div className="metric-label" style={{ marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {isLocked ? `需 ${mountain.min_license} 级登山证` : `${mountain.checkin_count.toLocaleString()} 次真实登顶`}
            </div>
            <div className="font-pixel" style={{ fontSize: 13, color: 'var(--green-bright)' }}>
              查看路线
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function MountainCard({ mountain }: { mountain: {
  id: string
  name: string
  altitude: number
  province: string
  difficulty: string
  checkin_count: number
  min_license: string
  cover_image?: string
  gallery_images?: string[] | null
  galleryImages?: string[] | null
  route_preview_image?: string | null
  routePreviewImage?: string | null
  route_preview_image_url?: string | null
  route_thumbnail?: string | null
  length_km?: number | null
  elevation_gain_m?: number | null
  estimated_duration?: string | null
}}) {
  const isLocked = mountain.min_license !== 'none'
  const meta = formatRouteMeta(mountain)
  const heroImage = getMountainHeroImage(mountain) ?? mountain.cover_image
  const heroImageCount = getMountainDetailHeroImages(mountain, 3).length
  return (
    <Link
      href={`/explore/${mountain.id}`}
      data-testid="explore-mountain-card"
      data-province={mountain.province}
      data-difficulty={mountain.difficulty}
      data-altitude={mountain.altitude}
      data-length-km={meta.length}
      data-license-level={mountain.min_license}
      data-hero-image-count={heroImageCount}
      style={{ textDecoration: 'none' }}
    >
      <div className="surface-card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '108px minmax(0, 1fr)', gap: 12, alignItems: 'stretch' }}>
          <div style={{ width: '100%', minWidth: 0 }}>
            <MountainImagePlaceholder name={mountain.name} altitude={mountain.altitude} size="sm" coverImage={heroImage ?? undefined} />
          </div>

          <div style={{ minWidth: 0, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div className="font-pixel" style={{ fontSize: 18, marginBottom: 4, overflowWrap: 'anywhere' }}>{mountain.name}</div>
                <div className="section-subtitle">{mountain.province}</div>
              </div>
              <span className="muted-chip active">{getDifficultyLevelLabel(mountain.difficulty)}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`muted-chip ${isLocked ? '' : 'active'}`}>{getLicenseRequirementLabel(mountain.min_license)}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[
                { label: '海拔', value: `${mountain.altitude.toLocaleString()}m` },
                { label: '距离', value: `${meta.length}km` },
                { label: '时长', value: meta.duration },
              ].map((item) => (
                <div key={item.label} className="metric-tile" style={{ padding: '10px 8px' }}>
                  <div className="font-pixel" style={{ fontSize: 13 }}>{item.value}</div>
                  <div className="metric-label" style={{ marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                爬升 {meta.gain}m
              </div>
              <div className="section-subtitle" style={{ textAlign: 'right' }}>
                {mountain.checkin_count.toLocaleString()} 次真实登顶
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
