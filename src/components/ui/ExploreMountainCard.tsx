import Link from 'next/link'
import { DEFAULT_MOUNTAIN_COVER_URL } from '@/lib/default-media'
import { getLicenseRequirementLabel } from '@/lib/license-ui'
import { getMountainDetailHeroImages, getMountainHeroImage } from '@/lib/mountain-media'
import type { Mountain } from '@/types'

function estimateLength(mountain: Pick<Mountain, 'altitude' | 'length_km'>) {
  return mountain.length_km ?? Number(Math.max(4.2, Math.min(26, mountain.altitude / 260)).toFixed(1))
}

function estimateDuration(mountain: Pick<Mountain, 'altitude' | 'estimated_duration'>) {
  return mountain.estimated_duration ?? `${Math.max(2, Math.min(12, Math.round(mountain.altitude / 650)))}h`
}

function getExploreRequirementLabel(level: Mountain['min_license']) {
  switch (level) {
    case 'basic':
      return '初级可进'
    case 'intermediate':
      return '中级及以上'
    case 'advanced':
      return '高级及以上'
    default:
      return '无需执照'
  }
}

function getExploreDifficultyCopy(level: Mountain['difficulty']) {
  switch (level) {
    case 'intermediate':
      return '进阶线'
    case 'advanced':
      return '中级线'
    case 'expert':
      return '高级线'
    default:
      return '入门线'
  }
}

export default function ExploreMountainCard({
  mountain,
}: {
  mountain: Pick<
    Mountain,
    | 'id'
    | 'name'
    | 'altitude'
    | 'province'
    | 'difficulty'
    | 'min_license'
    | 'cover_image'
    | 'gallery_images'
    | 'galleryImages'
    | 'length_km'
    | 'estimated_duration'
  >
}) {
  const heroImage = getMountainHeroImage(mountain)
  const heroImageCount = getMountainDetailHeroImages(mountain, 3).length
  const distanceKm = estimateLength(mountain)
  const duration = estimateDuration(mountain)
  const difficultyLabel = getExploreDifficultyCopy(mountain.difficulty)
  const licenseRequirement = getExploreRequirementLabel(mountain.min_license)
  const requirementA11yLabel = getLicenseRequirementLabel(mountain.min_license)

  return (
    <Link
      href={`/explore/${mountain.id}`}
      data-testid="explore-mountain-card"
      data-province={mountain.province}
      data-difficulty={mountain.difficulty}
      data-altitude={mountain.altitude}
      data-length-km={distanceKm}
      data-license-level={mountain.min_license}
      data-hero-image-count={heroImageCount}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <article className="surface-card explore-card">
        <div
          className="explore-card__cover"
          data-testid="explore-mountain-card-cover"
        >
          {heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage}
              alt={mountain.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={DEFAULT_MOUNTAIN_COVER_URL}
              alt={mountain.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>

        <div className="explore-card__body" data-testid="explore-mountain-card-body">
          <div className="explore-card__topline" data-testid="explore-mountain-card-topline">
            <div className="explore-card__title">{mountain.name}</div>
            <span
              className={`muted-chip explore-card__primary-tag ${mountain.min_license === 'none' ? 'active' : ''}`}
              data-testid="explore-mountain-card-requirement"
              aria-label={`准入要求：${requirementA11yLabel}`}
            >
              {licenseRequirement}
            </span>
          </div>

          <div className="explore-card__subline" data-testid="explore-mountain-card-subline">
            <span className="explore-card__location" data-testid="explore-mountain-card-location">{mountain.province}</span>
            <span className="explore-card__subline-separator" aria-hidden="true">·</span>
            <span className="explore-card__difficulty" data-testid="explore-mountain-card-difficulty">{difficultyLabel}</span>
          </div>

          <div className="explore-card__metrics" data-testid="explore-mountain-card-metrics">
            {[
              { label: '海拔', value: `${mountain.altitude.toLocaleString()}m` },
              { label: '距离', value: `${distanceKm}km` },
              { label: '时长', value: duration },
            ].map((item) => (
              <div key={item.label} style={{ minWidth: 0 }}>
                <div className="metric-label" style={{ marginTop: 0 }}>{item.label}</div>
                <div className="explore-card__metric-value">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>
    </Link>
  )
}
