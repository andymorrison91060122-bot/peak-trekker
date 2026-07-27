import Link from 'next/link'
import type { FocusEvent, PointerEvent } from 'react'
import { DEFAULT_MOUNTAIN_COVER_URL } from '@/lib/default-media'
import { getMountainDetailHeroImages, getMountainHeroImage } from '@/lib/mountain-media'
import { getEstimatedDurationRange, getMountainDistanceKm } from '@/lib/mountain-route-display'
import type { Mountain } from '@/types'

type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

export default function ExploreMountainCard({
  mountain,
  filterLengthKm,
  mountPending,
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
    | 'estimated_duration_minutes'
  >
  filterLengthKm: number | null
  mountPending: boolean
}) {
  const heroImage = getMountainHeroImage(mountain)
  const coverBackgroundImage = heroImage
    ? `url(${JSON.stringify(heroImage)}), url(${JSON.stringify(DEFAULT_MOUNTAIN_COVER_URL)})`
    : `url(${JSON.stringify(DEFAULT_MOUNTAIN_COVER_URL)})`
  const heroImageCount = getMountainDetailHeroImages(mountain, 3).length
  const normalizedDifficulty =
    mountain.difficulty === 'intermediate' || mountain.difficulty === 'advanced' || mountain.difficulty === 'expert'
      ? mountain.difficulty
      : 'beginner'
  const difficultyLabel = normalizedDifficulty === 'beginner' ? '入门线' : '进阶线'
  const displayLengthKm = getMountainDistanceKm(mountain)
  const durationRange = getEstimatedDurationRange(mountain)
  const realMeta = [
    displayLengthKm === null ? null : `${displayLengthKm}km`,
    durationRange,
  ].filter((value): value is string => Boolean(value))

  return (
    <Link
      href={`/mountain/${mountain.id}`}
      data-testid="explore-mountain-card"
      data-province={mountain.province}
      data-difficulty={mountain.difficulty}
      data-altitude={mountain.altitude}
      data-length-km={filterLengthKm ?? undefined}
      data-license-level={mountain.min_license}
      data-hero-image-count={heroImageCount}
      data-explore-mount-state={mountPending ? 'pending' : undefined}
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
          style={{ backgroundImage: coverBackgroundImage }}
        >
          <div className="explore-card__scrim" aria-hidden="true" />
        </div>

        <div className="explore-card__body" data-testid="explore-mountain-card-body">
          <div className="explore-card__altitude" data-testid="explore-mountain-card-altitude">
            <span aria-hidden="true">▲</span> {mountain.altitude.toLocaleString()}m
          </div>
          <div className="explore-card__topline" data-testid="explore-mountain-card-topline">
            <div className="explore-card__title">{mountain.name}</div>
            <span className="explore-card__difficulty" data-testid="explore-mountain-card-difficulty">
              {difficultyLabel}
            </span>
          </div>

          <div className="explore-card__subline" data-testid="explore-mountain-card-subline">
            <span className="explore-card__location" data-testid="explore-mountain-card-location">{mountain.province}</span>
            {realMeta.length > 0 ? (
              <span className="explore-card__metrics" data-testid="explore-mountain-card-metrics">
                {realMeta.map((item) => <span key={item}>{item}</span>)}
              </span>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  )
}
