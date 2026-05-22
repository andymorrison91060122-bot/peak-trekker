import { createSupabaseServerClient } from '@/lib/supabase-server'
import {
  getCheckinScore,
  getMonthBoundary,
  type ProvinceRankingRow,
  type UserContribution,
} from '@/lib/province-ranking'

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

type Relation<T> = T | T[] | null

type VerifiedCheckinQueryRow = {
  user_id: string
  created_at: string
  verified_at: string | null
  mountains: Relation<{ difficulty: string | null }>
  profiles: Relation<{
    id: string
    username: string | null
    province: string | null
    province_code: string | null
  }>
}

type NormalizedCheckinRow = {
  userId: string
  createdAt: string
  difficulty: string
  province: string
  provinceCode: string
  nickname: string
}

type ProvinceUserRankingRow = {
  userId: string
  nickname: string
  total_score: number
  summit_count: number
  rank: number
}

const VERIFIED_CHECKIN_SELECT = `
  user_id,
  created_at,
  verified_at,
  mountains(difficulty),
  profiles(id, username, province, province_code)
`

function unwrapRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function buildCompetitionRanks<T>(
  rows: T[],
  compare: (left: T, right: T) => number,
  rankValue: (row: T) => number
): Array<T & { rank: number }> {
  const sorted = [...rows].sort(compare)
  let previousScore: number | null = null
  let previousRank = 0

  return sorted.map((row, index) => {
    const currentScore = rankValue(row)
    const rank = previousScore !== null && currentScore === previousScore ? previousRank : index + 1
    previousScore = currentScore
    previousRank = rank
    return { ...row, rank }
  })
}

function normalizeVerifiedRows(rows: VerifiedCheckinQueryRow[]): NormalizedCheckinRow[] {
  return rows.flatMap((row) => {
    const mountain = unwrapRelation(row.mountains)
    const profile = unwrapRelation(row.profiles)

    if (!profile?.province || !profile.province_code) return []

    return [
      {
        userId: row.user_id,
        createdAt: row.created_at,
        difficulty: mountain?.difficulty ?? '',
        province: profile.province,
        provinceCode: profile.province_code,
        nickname: profile.username?.trim() || '未知用户',
      },
    ]
  })
}

async function fetchVerifiedCheckinsForMonth(
  supabase: ServerSupabaseClient,
  year: number,
  month: number
): Promise<NormalizedCheckinRow[]> {
  const { start, end } = getMonthBoundary(year, month)
  const pageSize = 1000
  const rows: VerifiedCheckinQueryRow[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('checkins')
      .select(VERIFIED_CHECKIN_SELECT)
      .not('verified_at', 'is', null)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    if (!data?.length) break

    rows.push(...(data as VerifiedCheckinQueryRow[]))

    if (data.length < pageSize) break
  }

  return normalizeVerifiedRows(rows)
}

function aggregateProvinceRows(rows: NormalizedCheckinRow[]): ProvinceRankingRow[] {
  const provinceMap = new Map<
    string,
    {
      province: string
      province_code: string
      total_score: number
      summit_count: number
      userIds: Set<string>
    }
  >()

  for (const row of rows) {
    const bucket = provinceMap.get(row.province) ?? {
      province: row.province,
      province_code: row.provinceCode,
      total_score: 0,
      summit_count: 0,
      userIds: new Set<string>(),
    }

    bucket.total_score += getCheckinScore(row.difficulty)
    bucket.summit_count += 1
    bucket.userIds.add(row.userId)

    provinceMap.set(row.province, bucket)
  }

  return buildCompetitionRanks(
    Array.from(provinceMap.values()).map((bucket) => ({
      province: bucket.province,
      province_code: bucket.province_code,
      total_score: bucket.total_score,
      summit_count: bucket.summit_count,
      active_users: bucket.userIds.size,
    })),
    (left, right) =>
      right.total_score - left.total_score ||
      right.summit_count - left.summit_count ||
      left.province_code.localeCompare(right.province_code),
    (row) => row.total_score
  )
}

function aggregateProvinceUserRows(
  rows: NormalizedCheckinRow[],
  province: string
): ProvinceUserRankingRow[] {
  const userMap = new Map<
    string,
    {
      userId: string
      nickname: string
      total_score: number
      summit_count: number
    }
  >()

  for (const row of rows) {
    if (row.province !== province) continue

    const bucket = userMap.get(row.userId) ?? {
      userId: row.userId,
      nickname: row.nickname,
      total_score: 0,
      summit_count: 0,
    }

    bucket.total_score += getCheckinScore(row.difficulty)
    bucket.summit_count += 1

    userMap.set(row.userId, bucket)
  }

  return buildCompetitionRanks(
    Array.from(userMap.values()),
    (left, right) =>
      right.total_score - left.total_score ||
      right.summit_count - left.summit_count ||
      left.nickname.localeCompare(right.nickname) ||
      left.userId.localeCompare(right.userId),
    (row) => row.total_score
  )
}

export async function listProvinceMonthlyRankings(year: number, month: number): Promise<ProvinceRankingRow[]> {
  const supabase = await createSupabaseServerClient()
  const rows = await fetchVerifiedCheckinsForMonth(supabase, year, month)
  return aggregateProvinceRows(rows)
}

export async function getUserMonthlyContribution(
  userId: string,
  year: number,
  month: number
): Promise<UserContribution | null> {
  const supabase = await createSupabaseServerClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('province, province_code')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (!profile?.province || !profile.province_code) return null

  const rows = await fetchVerifiedCheckinsForMonth(supabase, year, month)
  const provinceRows = aggregateProvinceUserRows(rows, profile.province)
  const currentUser = provinceRows.find((row) => row.userId === userId)

  if (!currentUser) {
    return {
      total_score: 0,
      summit_count: 0,
      province: profile.province,
      province_rank: 0,
      province_active_users: provinceRows.length,
    }
  }

  return {
    total_score: currentUser.total_score,
    summit_count: currentUser.summit_count,
    province: profile.province,
    province_rank: currentUser.rank,
    province_active_users: provinceRows.length,
  }
}

export async function getProvinceUserRankings(
  province: string,
  year: number,
  month: number
): Promise<Array<{ userId: string; nickname: string; total_score: number; summit_count: number; rank: number }>> {
  const supabase = await createSupabaseServerClient()
  const rows = await fetchVerifiedCheckinsForMonth(supabase, year, month)
  return aggregateProvinceUserRows(rows, province).slice(0, 50)
}
