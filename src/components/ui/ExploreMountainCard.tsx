import Link from 'next/link'
import type { FocusEvent, PointerEvent } from 'react'
import { DEFAULT_MOUNTAIN_COVER_URL } from '@/lib/default-media'
import { getMountainDetailHeroImages, getMountainHeroImage } from '@/lib/mountain-media'
import DifficultyChip from '@/components/mountain/DifficultyChip'
import type { Mountain } from '@/types'

type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

function estimateLength(mountain: Pick<Mountain, 'altitude' | 'length_km'>) {
  return mountain.length_km ?? Number(Math.max(4.2, Math.min(26, mountain.altitude / 260)).toFixed(1))
}

function estimateDuration(mountain: Pick<Mountain, 'altitude' | 'estimated_duration'>) {
  return mountain.estimated_duration ?? `${Math.max(2, Math.min(12, Math.round(mountain.altitude / 650)))}h`
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
  const normalizedDifficulty =
    mountain.difficulty === 'intermediate' || mountain.difficulty === 'advanced' || mountain.difficulty === 'expert'
      ? mountain.difficulty
      : 'beginner'

  return (
    <Link
      href={`/mountain/${mountain.id}`}
      data-testid="explore-mountain-card"
      data-province={mountain.province}
      data-difficulty={mountain.difficulty}
      data-altitude={mountain.altitude}
      data-length-km={distanceKm}
      data-license-level={mountain.min_license}
      data-hero-image-count={heroImageCount}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <article
        className="surface-card explore-card pt-pressable-card"
        onPointerDown={markPressFallback}
        onPointerUp={clearPressFallback}
        onPointerCancel={clearPressFallback}
        onPointerLeave={clearPressFallback}
        onBlur={clearPressFallback}
      >
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
          </div>

          <div className="explore-card__subline" data-testid="explore-mountain-card-subline">
            <span className="explore-card__location" data-testid="explore-mountain-card-location">{mountain.province}</span>
            {normalizedDifficulty === 'beginner' ? null : (
              <span className="explore-card__subline-separator" aria-hidden="true">·</span>
            )}
            <span data-testid="explore-mountain-card-difficulty" style={{ minWidth: 0 }}>
              <DifficultyChip difficulty={normalizedDifficulty} withSuggestion />
            </span>
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
