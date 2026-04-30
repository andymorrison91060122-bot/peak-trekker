import type { CSSProperties } from 'react'
import TertiaryButton from '@/components/ui/TertiaryButton'
import { formatRankWithPercentile, type UserContribution } from '@/lib/province-ranking'

const numberFormatter = new Intl.NumberFormat('zh-CN')

const labelStyle: CSSProperties = {
  fontSize: 'var(--font-label-s-size)',
  lineHeight: 'var(--font-label-s-line)',
  fontWeight: 'var(--font-label-s-weight)',
  color: 'var(--color-on-surface-variant)',
}

const valueStyle: CSSProperties = {
  fontSize: 'var(--font-title-m-size)',
  lineHeight: 'var(--font-title-m-line)',
  fontWeight: 'var(--font-title-m-weight)',
  color: 'var(--color-on-surface)',
}

function MetricTile({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-elevated)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-3)',
        minWidth: 0,
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div style={{ ...valueStyle, marginTop: 'var(--space-2)' }}>{value}</div>
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
  const provinceRank = contribution?.province_rank ?? 0
  const displayRank = formatRankWithPercentile(
    provinceRank,
    contribution?.province_active_users ?? 0
  )
  const totalScore = numberFormatter.format(contribution?.total_score ?? 0)
  const summitCount = numberFormatter.format(contribution?.summit_count ?? 0)

  return (
    <section
      data-testid="province-contribution-section"
      data-month-label={monthLabel}
      aria-label={`${monthLabel} 我的省域贡献`}
      style={{
        background: 'var(--color-surface-variant)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBottom: hasProvince ? 'var(--space-3)' : 'var(--space-4)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 'var(--font-title-m-weight)',
            color: 'var(--color-on-surface)',
          }}
        >
          我的省域贡献
        </div>
        {hasProvince ? (
          <TertiaryButton as="a" href="/rankings/province">
            查看月榜 →
          </TertiaryButton>
        ) : null}
      </div>

      {hasProvince ? (
        <div
          data-testid="province-contribution-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <MetricTile label="所属省份" value={contribution.province} />
          <MetricTile label="我的排名" value={displayRank} />
          <MetricTile label="我的积分" value={totalScore} />
          <MetricTile label="我的登顶" value={`${summitCount} 座`} />
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
            fontWeight: 'var(--font-body-m-weight)',
          }}
        >
          完善资料以参与省域月榜
        </div>
      )}
    </section>
  )
}
