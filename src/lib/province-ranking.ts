export const DIFFICULTY_WEIGHTS = {
  beginner: 1,
  intermediate: 2,
  advanced: 5,
  expert: 10,
} as const

export type ProvinceRankingRow = {
  province: string
  province_code: string
  total_score: number
  summit_count: number
  active_users: number
  rank: number
}

export type UserContribution = {
  total_score: number
  summit_count: number
  province: string
  province_rank: number
  province_active_users: number
}

export function getCheckinScore(difficulty: string): number {
  const normalized = difficulty.trim().toLowerCase()
  return DIFFICULTY_WEIGHTS[normalized as keyof typeof DIFFICULTY_WEIGHTS] ?? 0
}

export function getMonthBoundary(year: number, month: number): { start: string; end: string } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('year and month must be integers, with month in 1-12')
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1, -8, 0, 0)).toISOString(),
    end: new Date(Date.UTC(year, month, 1, -8, 0, 0)).toISOString(),
  }
}

export function formatProvinceRank(rank: number): string {
  if (rank <= 0) return '—'
  if (rank >= 1000) return '999+'
  return `第 ${rank} 名`
}

export function formatRankWithPercentile(rank: number, activeUsers: number): string {
  if (rank <= 0) return '—'
  if (rank >= 1000) return '999+'
  if (activeUsers <= 0) return formatProvinceRank(rank)

  const percentile = Math.ceil((rank / activeUsers) * 100)
  return `第 ${rank} 名（前 ${percentile}%）`
}
