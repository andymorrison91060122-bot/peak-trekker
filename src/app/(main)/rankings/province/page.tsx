import type { CSSProperties } from 'react'
import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { formatRankWithPercentile } from '@/lib/province-ranking'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserMonthlyContribution, listProvinceMonthlyRankings } from '@/lib/province-ranking-queries'

const numberFormatter = new Intl.NumberFormat('zh-CN')
const QA_MONTH_OVERRIDE_ENABLED = process.env.ENABLE_QA_TEST_HELPERS === 'true'

function getShanghaiYearMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  return {
    year,
    month,
    label: `${year} 年 ${month} 月`,
  }
}

function parseSearchParamNumber(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value
  if (!normalized || !/^\d+$/.test(normalized)) return null
  return Number(normalized)
}

function resolveRankingMonth(searchParams: { year?: string | string[]; month?: string | string[] } | undefined) {
  const fallback = getShanghaiYearMonth()

  if (!QA_MONTH_OVERRIDE_ENABLED || !searchParams) {
    return fallback
  }

  const requestedYear = parseSearchParamNumber(searchParams.year)
  const requestedMonth = parseSearchParamNumber(searchParams.month)

  if (!requestedYear || !requestedMonth || requestedMonth < 1 || requestedMonth > 12) {
    return fallback
  }

  return {
    year: requestedYear,
    month: requestedMonth,
    label: `${requestedYear} 年 ${requestedMonth} 月`,
  }
}

const summaryCardTextStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-2)',
  color: 'var(--color-on-surface)',
  fontSize: 'var(--font-body-m-size)',
  lineHeight: 'var(--font-body-m-line)',
  fontWeight: 'var(--font-body-m-weight)',
}

const summaryNumberStyle: CSSProperties = {
  fontSize: 'var(--font-title-m-size)',
  lineHeight: 'var(--font-title-m-line)',
  fontWeight: 'var(--font-title-m-weight)',
  color: 'var(--color-on-surface)',
}

export default async function ProvinceRankingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string | string[]; month?: string | string[] }>
}) {
  if (!isFeatureEnabled('PROVINCE_RANKING')) redirect('/explore')

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const { year, month, label } = resolveRankingMonth(resolvedSearchParams)
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [rankings, contribution] = await Promise.all([
    listProvinceMonthlyRankings(year, month),
    user ? getUserMonthlyContribution(user.id, year, month) : Promise.resolve(null),
  ])
  const currentProvince = contribution?.province ?? null
  const summaryRank = contribution
    ? formatRankWithPercentile(contribution.province_rank, contribution.province_active_users)
    : '—'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        padding: 'var(--space-5) var(--space-5) calc(var(--space-12) * 2 + var(--space-2))',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-6)',
        }}
      >
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <a
              href="/profile"
              aria-label="返回个人页"
              title="返回个人页"
              data-variant="plain"
              data-shape="rounded"
              className="ui-icon-btn-root"
            >
              <span aria-hidden="true" className="ui-icon-btn-glyph">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M15 5l-7 7 7 7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </a>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  color: 'var(--color-on-surface)',
                  fontSize: 'var(--font-headline-m-size)',
                  lineHeight: 'var(--font-headline-m-line)',
                  fontWeight: 'var(--font-headline-m-weight)',
                }}
              >
                省域热力榜
              </h1>
              <div
                style={{
                  marginTop: 'var(--space-2)',
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 'var(--font-body-m-size)',
                  lineHeight: 'var(--font-body-m-line)',
                  fontWeight: 'var(--font-body-m-weight)',
                }}
              >
                {label}
              </div>
            </div>
          </div>

          {contribution ? (
            <div
              data-testid="province-ranking-summary"
              style={{
                background: 'var(--color-surface-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
              }}
            >
              {contribution.province_rank > 0 ? (
                <div style={summaryCardTextStyle}>
                  <span>我的贡献</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {summaryRank}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    本月 <span style={summaryNumberStyle}>{numberFormatter.format(contribution.total_score)}</span> 分
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <span style={summaryNumberStyle}>{numberFormatter.format(contribution.summit_count)}</span> 次登顶
                  </span>
                </div>
              ) : (
                <div style={summaryCardTextStyle}>
                  <span>我的贡献</span>
                  <span aria-hidden="true">·</span>
                  <span>本月暂无登顶</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {rankings.length > 0 ? (
          <div data-testid="province-ranking-list" style={{ display: 'grid' }}>
            {rankings.map((row, index) => {
              const isCurrentProvince = currentProvince === row.province
              const rankColor = row.rank <= 3 ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'

              return (
                <div key={`${row.province}-${row.rank}`}>
                  {index > 0 ? (
                    <div
                      aria-hidden="true"
                      style={{
                        height: 1,
                        background: 'var(--color-outline)',
                      }}
                    />
                  ) : null}
                  <div
                    data-testid="province-ranking-row"
                    data-province={row.province}
                    data-total-score={row.total_score}
                    data-current-province={isCurrentProvince ? 'true' : 'false'}
                    style={{
                      minHeight: 64,
                      padding: 'var(--space-4)',
                      display: 'grid',
                      gridTemplateColumns: '48px minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      background: isCurrentProvince ? 'var(--color-surface-elevated)' : 'transparent',
                      borderRadius: isCurrentProvince ? 'var(--radius-md)' : 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                      {isCurrentProvince ? (
                        <span
                          data-testid="province-ranking-current-dot"
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--color-primary)',
                            flexShrink: 0,
                          }}
                        />
                      ) : null}
                      <div
                        style={{
                          minWidth: 40,
                          textAlign: 'right',
                          color: rankColor,
                          fontSize: 'var(--font-title-l-size)',
                          lineHeight: 'var(--font-title-l-line)',
                          fontWeight: 'var(--font-title-l-weight)',
                        }}
                      >
                        {numberFormatter.format(row.rank)}
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: 'var(--color-on-surface)',
                          fontSize: 'var(--font-title-m-size)',
                          lineHeight: 'var(--font-title-m-line)',
                          fontWeight: 'var(--font-title-m-weight)',
                        }}
                      >
                        {row.province}
                      </div>
                      <div
                        style={{
                          marginTop: 'var(--space-1)',
                          color: 'var(--color-on-surface-variant)',
                          fontSize: 'var(--font-label-s-size)',
                          lineHeight: 'var(--font-label-s-line)',
                          fontWeight: 'var(--font-label-s-weight)',
                        }}
                      >
                        {numberFormatter.format(row.active_users)} 位山友参与
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: 0 }}>
                      <div
                        style={{
                          color: 'var(--color-on-surface)',
                          fontSize: 'var(--font-title-m-size)',
                          lineHeight: 'var(--font-title-m-line)',
                          fontWeight: 'var(--font-title-m-weight)',
                        }}
                      >
                        {numberFormatter.format(row.total_score)}
                      </div>
                      <div
                        style={{
                          color: 'var(--color-on-surface-variant)',
                          fontSize: 'var(--font-label-s-size)',
                          lineHeight: 'var(--font-label-s-line)',
                          fontWeight: 'var(--font-label-s-weight)',
                        }}
                      >
                        分
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div
            data-testid="province-ranking-empty"
            style={{
              textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 'var(--font-body-m-line)',
              fontWeight: 'var(--font-body-m-weight)',
              padding: 'var(--space-8) 0',
            }}
          >
            本月暂无登山记录
          </div>
        )}

        <div
          style={{
            marginTop: 'var(--space-6)',
            display: 'grid',
            gap: 'var(--space-1)',
            textAlign: 'center',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 'var(--font-label-s-weight)',
          }}
        >
          <div>榜单每月 1 号 00:00 重置</div>
          <div>难度权重：入门 1 · 进阶 2 · 挑战 5 · 硬核 10</div>
        </div>
      </div>
    </div>
  )
}
