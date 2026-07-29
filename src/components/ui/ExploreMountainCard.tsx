import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, PointerEvent, Ref } from 'react'
import { EXPLORE_MOUNTAIN_COVER_FALLBACK_URL } from '@/lib/default-media'
import { getMountainDetailHeroImages, getMountainHeroImage } from '@/lib/mountain-media'
import {
  getEstimatedDurationRange,
  getMountainDisplayAltitude,
  getMountainDistanceKm,
} from '@/lib/mountain-route-display'
import { getExploreMountainThumbnailUrl } from '@/lib/mountain-storage'
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
  imagePriority,
  loadMoreSentinelRef,
}: {
  mountain: Pick<
    Mountain,
    | 'id'
    | 'name'
    | 'altitude'
    | 'entity_type'
    | 'route_highpoint_m'
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
  imagePriority: boolean
  loadMoreSentinelRef?: Ref<HTMLSpanElement>
}) {
  const heroImage = getMountainHeroImage(mountain)
  const thumbnailImage =
    getExploreMountainThumbnailUrl(heroImage) ?? EXPLORE_MOUNTAIN_COVER_FALLBACK_URL
  const coverImageRef = useRef<HTMLImageElement | null>(null)
  const [hasEnteredImageLoadRange, setHasEnteredImageLoadRange] = useState(false)
  const shouldLoadImage = imagePriority || hasEnteredImageLoadRange
  const heroImageCount = getMountainDetailHeroImages(mountain, 3).length
  const normalizedDifficulty =
    mountain.difficulty === 'intermediate' || mountain.difficulty === 'advanced' || mountain.difficulty === 'expert'
      ? mountain.difficulty
      : 'beginner'
  const difficultyLabel = normalizedDifficulty === 'beginner' ? '入门线' : '进阶线'
  const displayLengthKm = getMountainDistanceKm(mountain)
  const displayAltitude = getMountainDisplayAltitude(mountain)
  const durationRange = getEstimatedDurationRange(mountain)
  const realMeta = [
    displayLengthKm === null ? null : `${displayLengthKm}km`,
    durationRange,
  ].filter((value): value is string => Boolean(value))

  useEffect(() => {
    const image = coverImageRef.current
    if (!image || hasEnteredImageLoadRange) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setHasEnteredImageLoadRange(true)
      observer.disconnect()
    }, { rootMargin: '600px 0px', threshold: 0 })
    observer.observe(image)
    return () => observer.disconnect()
  }, [hasEnteredImageLoadRange])

  return (
    <Link
      href={`/mountain/${mountain.id}`}
      data-testid="explore-mountain-card"
      data-province={mountain.province}
      data-difficulty={mountain.difficulty}
      data-altitude={displayAltitude ?? undefined}
      data-length-km={filterLengthKm ?? undefined}
      data-license-level={mountain.min_license}
      data-hero-image-count={heroImageCount}
      data-explore-mount-state={mountPending ? 'pending' : undefined}
      style={{ textDecoration: 'none', display: 'block', position: 'relative' }}
    >
      {loadMoreSentinelRef ? (
        <span
          ref={loadMoreSentinelRef}
          data-testid="explore-load-more-sentinel"
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      ) : null}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={coverImageRef}
            className="explore-card__cover-image"
            data-testid="explore-mountain-card-cover-image"
            data-thumbnail-source={thumbnailImage.includes('/thumb-v1-') ? 'thumb-v1' : 'fallback'}
            data-image-load-state={shouldLoadImage ? 'requested' : 'deferred'}
            src={shouldLoadImage ? thumbnailImage : undefined}
            alt={mountain.name}
            width={960}
            height={520}
            loading={imagePriority ? 'eager' : 'lazy'}
            fetchPriority={imagePriority ? 'high' : 'auto'}
            decoding="async"
            onError={(event) => {
              const image = event.currentTarget
              if (image.dataset.fallbackAttempted === 'true') {
                image.dataset.coverFailed = 'true'
                image.style.visibility = 'hidden'
                return
              }
              image.dataset.fallbackAttempted = 'true'
              image.dataset.thumbnailSource = 'fallback'
              image.src = EXPLORE_MOUNTAIN_COVER_FALLBACK_URL
            }}
          />
          <div className="explore-card__scrim" aria-hidden="true" />
        </div>

        <div className="explore-card__body" data-testid="explore-mountain-card-body">
          <div className="explore-card__altitude" data-testid="explore-mountain-card-altitude">
            <span aria-hidden="true">▲</span>{' '}
            {mountain.entity_type === 'route_corridor' ? '最高海拔 ' : ''}
            {displayAltitude === null ? '--' : `${displayAltitude.toLocaleString()}m`}
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
