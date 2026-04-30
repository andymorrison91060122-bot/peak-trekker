'use client'

import { useEffect, useState } from 'react'
import IconButton from '@/components/ui/IconButton'

export type ActivityHeroSource = 'photo' | 'mountain' | 'default' | 'solid'

export default function ActivityDetailHero({
  heroSource,
  imageUrl,
  mountainName,
  locationLabel,
  onBackClick,
  onShareClick,
}: {
  heroSource: ActivityHeroSource
  imageUrl: string | null
  mountainName: string
  locationLabel: string
  onBackClick: () => void
  onShareClick: () => void
}) {
  const [defaultImageFailed, setDefaultImageFailed] = useState(false)

  useEffect(() => {
    setDefaultImageFailed(false)
  }, [heroSource, imageUrl])

  const displaySource = heroSource === 'default' && defaultImageFailed ? 'solid' : heroSource
  const showImage = Boolean(imageUrl) && displaySource !== 'solid'
  const showDefaultCopy = displaySource === 'default'

  return (
    <div className="activity-detail__hero-cover" data-testid="activity-hero" data-hero-source={displaySource}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="activity-hero-image"
          className="activity-detail__hero-image"
          src={imageUrl!}
          alt={`${mountainName} 活动封面`}
          onError={() => {
            if (heroSource === 'default') {
              setDefaultImageFailed(true)
            }
          }}
        />
      ) : (
        <div
          className="activity-detail__hero-fallback"
          data-testid="activity-hero-fallback-solid"
          aria-hidden="true"
        />
      )}

      <div className="activity-detail__hero-scrim" aria-hidden="true" />

      {showDefaultCopy ? (
        <div className="activity-detail__hero-default-copy">
          <div className="activity-detail__hero-default-title">{mountainName}</div>
          <div className="activity-detail__hero-default-location">{locationLabel}</div>
        </div>
      ) : null}

      <div className="activity-detail__hero-toolbar">
        <IconButton
          icon="back"
          ariaLabel="返回"
          variant="filled"
          className="activity-detail__hero-toolbar-btn"
          data-testid="activity-hero-back"
          onClick={onBackClick}
        />
        <IconButton
          icon="share"
          ariaLabel="分享"
          variant="filled"
          className="activity-detail__hero-toolbar-btn"
          data-testid="activity-hero-share"
          onClick={onShareClick}
        />
      </div>
    </div>
  )
}
