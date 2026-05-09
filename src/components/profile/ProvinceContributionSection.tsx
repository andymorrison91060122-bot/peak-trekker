'use client'

import Link from 'next/link'
import { formatRankWithPercentile, type UserContribution } from '@/lib/province-ranking'

const numberFormatter = new Intl.NumberFormat('zh-CN')

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function Metric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="pt-label-s" style={{ color: 'var(--color-on-surface-variant)' }}>
        {label}
      </div>
      <div
        className="pt-title-m"
        style={{
          marginTop: 'var(--space-1)',
          color: 'var(--color-on-surface)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

export default function ProvinceContributionSection({
  contribution,
  monthLabel,
}: {
  contribution: UserContribution | null
  monthLabel: string
}) {
  const hasProvince = contribution !== null
  const displayRank = hasProvince
    ? formatRankWithPercentile(contribution.province_rank ?? 0, contribution.province_active_users ?? 0)
    : '—'
  const totalScore = numberFormatter.format(contribution?.total_score ?? 0)
  const summitCount = numberFormatter.format(contribution?.summit_count ?? 0)

  return (
    <section
      data-testid="province-contribution-section"
      data-month-label={monthLabel}
      aria-label={`${monthLabel} 省域贡献`}
      style={{ marginBottom: 'var(--space-6)' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <div>
          <h2 className="pt-title-l" style={{ margin: 0, color: 'var(--color-on-surface)' }}>
            省域贡献
          </h2>
        </div>
        {hasProvince ? (
          <Link
            href="/rankings/province"
            className="pt-label-m"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              color: 'var(--color-success)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            查看月榜
            <Chevron />
          </Link>
        ) : null}
      </div>

      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
          padding: 'var(--space-4)',
        }}
      >
        {hasProvince ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline' }}>
              <div className="pt-title-m" style={{ color: 'var(--color-on-surface)' }}>
                {contribution.province}
              </div>
              <div
                className="pt-label-s"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-on-surface-variant)',
                  whiteSpace: 'nowrap',
                }}
              >
                {monthLabel}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
              <Metric label="当前排名" value={displayRank} />
              <Metric label="积分" value={totalScore} />
              <Metric label="登顶数" value={`${summitCount} 座`} />
            </div>
          </div>
        ) : (
          <div className="pt-body-m" style={{ color: 'var(--color-on-surface-variant)' }}>
            完善资料后,你的省域贡献会显示在这里。
          </div>
        )}
      </div>
    </section>
  )
}
