'use client'

import Link from 'next/link'

function clampTextStyle(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  }
}

export default function CommunityContentBlock({
  content,
  variant = 'detail',
  detailHref,
}: {
  content: string
  variant?: 'feed' | 'detail'
  detailHref?: string
}) {
  const normalized = content.trim()
  const isDetail = variant === 'detail'
  const shouldClamp = !isDetail && (normalized.length > 60 || normalized.split('\n').length > 3)

  if (!normalized) {
    return null
  }

  return (
    <div className={`community-copy-block community-copy-block--${variant}`}>
      <div
        className={`community-copy-block__body ${shouldClamp ? 'community-copy-block__body--clamped' : ''}`}
        style={{
          whiteSpace: 'pre-wrap',
          ...(shouldClamp ? clampTextStyle(3) : null),
        }}
      >
        {normalized}
      </div>
      {!isDetail && shouldClamp && detailHref ? (
        <Link href={detailHref} className="community-copy-block__link">
          查看完整内容 →
        </Link>
      ) : null}
    </div>
  )
}
