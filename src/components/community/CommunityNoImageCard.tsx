'use client'

import { DEFAULT_ACTIVITY_COVER_URL } from '@/lib/default-media'

export default function CommunityNoImageCard({
  mountainName,
  sourceLabel,
  variant = 'feed',
}: {
  mountainName?: string | null
  sourceLabel: string
  variant?: 'feed' | 'detail' | 'compact'
}) {
  const isDetail = variant === 'detail'
  const showDescription = isDetail
  const title = isDetail ? '这条动态暂时没有现场图片' : '无图动态'
  const subtitle = mountainName ? `${mountainName} · ${sourceLabel}` : sourceLabel
  const description = isDetail
    ? '先看正文、记录来源和核心数据。'
    : ''

  return (
    <div className="community-no-image-card" data-variant={variant}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DEFAULT_ACTIVITY_COVER_URL}
        alt=""
        aria-hidden="true"
        className="community-no-image-card__cover"
      />
      <div className="community-no-image-card__scrim" aria-hidden="true" />
      <div className="community-no-image-card__content">
        <div className="community-no-image-card__chips">
          <span className="muted-chip">无图</span>
          <span className="muted-chip active">{sourceLabel}</span>
        </div>

        <div className="community-no-image-card__title">
          {title}
        </div>

        <div className="community-no-image-card__subtitle">
          {subtitle}
        </div>

        {showDescription ? (
          <div className="community-no-image-card__description">
            {description}
          </div>
        ) : null}
      </div>
    </div>
  )
}
