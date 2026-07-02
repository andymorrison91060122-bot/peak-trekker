import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { ProvinceBannerData } from '@/components/explore/ProvinceBannerStrip'
import { listProvinceMonthlyRankings } from '@/lib/province-ranking-queries'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { resolveShareTemplateParam } from '@/lib/share-template-intent'
import ExploreClient from './ExploreClient'

function getShanghaiYearMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
  }
}

function getPreviousShanghaiYearMonth({
  year,
  month,
}: {
  year: number
  month: number
}) {
  if (month === 1) {
    return {
      year: year - 1,
      month: 12,
    }
  }

  return {
    year,
    month: month - 1,
  }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ shareTemplate?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')
  const currentMonth = getShanghaiYearMonth()
  const previousMonth = getPreviousShanghaiYearMonth(currentMonth)

  const [mountainsRes, profileRes, currentRankings, previousRankings] = await Promise.all([
    supabase
      .from('mountains')
      .select('*')
      .eq('is_active', true)
      .order('checkin_count', { ascending: false }),
    user
      ? supabase.from('profiles').select('province').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
    user && provinceRankingEnabled
      ? listProvinceMonthlyRankings(currentMonth.year, currentMonth.month)
      : Promise.resolve(undefined),
    user && provinceRankingEnabled
      ? listProvinceMonthlyRankings(previousMonth.year, previousMonth.month)
      : Promise.resolve(undefined),
  ])

  const mountains = mountainsRes.data ?? []
  const hometownProvince = profileRes.data?.province ?? null
  let provinceBanner: ProvinceBannerData | null | undefined = user && provinceRankingEnabled ? null : undefined

  if (user && provinceRankingEnabled && hometownProvince) {
    const currentProvinceRow = currentRankings?.find((row) => row.province === hometownProvince) ?? null
    const previousProvinceRow = previousRankings?.find((row) => row.province === hometownProvince) ?? null

    provinceBanner = {
      provinceName: hometownProvince,
      provinceRank: currentProvinceRow?.rank ?? 0,
      provinceScore: currentProvinceRow?.total_score ?? 0,
      rankChange:
        currentProvinceRow && previousProvinceRow
          ? previousProvinceRow.rank - currentProvinceRow.rank
          : null,
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface)', paddingBottom: 104 }}>
      <ExploreClient
        list={mountains}
        hometownProvince={hometownProvince}
        provinceBanner={provinceBanner}
        shareTemplateIntent={resolveShareTemplateParam(resolvedSearchParams.shareTemplate)}
      />
    </div>
  )
}
