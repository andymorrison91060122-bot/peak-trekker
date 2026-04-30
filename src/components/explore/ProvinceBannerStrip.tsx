import Link from 'next/link'
import type { CSSProperties } from 'react'

const numberFormatter = new Intl.NumberFormat('zh-CN')

export type ProvinceBannerData = {
  provinceName: string
  provinceRank: number
  provinceScore: number
  rankChange: number | null
}

const bannerBaseStyle: CSSProperties = {
  minHeight: 48,
  paddingInline: 'var(--space-4)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface-variant)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minWidth: 0,
  textDecoration: 'none',
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--font-label-m-size)',
  lineHeight: 'var(--font-label-m-line)',
  fontWeight: 'var(--font-label-m-weight)',
}

const dotSeparatorStyle: CSSProperties = {
  ...labelStyle,
  color: 'var(--color-on-surface-variant)',
  flexShrink: 0,
}

function ChevronRightGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ProvinceBannerStrip({
  banner,
}: {
  banner: ProvinceBannerData | null
}) {
  if (!banner) {
    return (
      <div
        data-testid="province-banner-strip"
        style={bannerBaseStyle}
      >
        <div
          style={{
            ...labelStyle,
            color: 'var(--color-on-surface-variant)',
            flex: 1,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          加入省域月榜
        </div>
        <div
          aria-hidden="true"
          style={{
            color: 'var(--color-on-surface-variant)',
            flexShrink: 0,
          }}
        >
          <ChevronRightGlyph />
        </div>
      </div>
    )
  }

  const hasRankingData = banner.provinceRank > 0
  const changeText =
    banner.rankChange === null
      ? null
      : banner.rankChange > 0
        ? `↑${banner.rankChange}`
        : banner.rankChange < 0
          ? `↓${Math.abs(banner.rankChange)}`
          : '-'

  const changeColor =
    banner.rankChange === null
      ? 'var(--color-on-surface-variant)'
      : banner.rankChange > 0
        ? 'var(--color-success)'
        : banner.rankChange < 0
          ? 'var(--color-error)'
          : 'var(--color-on-surface-variant)'

  return (
    <Link
      href="/rankings/province"
      data-testid="province-banner-strip"
      style={bannerBaseStyle}
    >
      <div
        style={{
          ...labelStyle,
          color: 'var(--color-on-surface)',
          flex: '0 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {banner.provinceName}
      </div>

      <span aria-hidden="true" style={dotSeparatorStyle}>
        ·
      </span>

      {hasRankingData ? (
        <>
          <div
            style={{
              ...labelStyle,
              color: 'var(--color-on-surface-variant)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            第 {banner.provinceRank} 名
          </div>
          {changeText ? (
            <div
              style={{
                ...labelStyle,
                color: changeColor,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {changeText}
            </div>
          ) : null}
          <span aria-hidden="true" style={dotSeparatorStyle}>
            ·
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--color-on-surface-variant)',
              flexShrink: 0,
              minWidth: 0,
              marginLeft: 'auto',
            }}
          >
            <span
              style={{
                ...labelStyle,
                whiteSpace: 'nowrap',
              }}
            >
              本月 {numberFormatter.format(banner.provinceScore)} 分
            </span>
            <ChevronRightGlyph />
          </div>
        </>
      ) : (
        <div
          style={{
            ...labelStyle,
            color: 'var(--color-on-surface-variant)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          本月暂无登山记录
        </div>
      )}

      {!hasRankingData ? (
        <div
          aria-hidden="true"
          style={{
            color: 'var(--color-on-surface-variant)',
            flexShrink: 0,
            marginLeft: 'auto',
          }}
        >
          <ChevronRightGlyph />
        </div>
      ) : null}
    </Link>
  )
}
