import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DIFFICULTY_WEIGHTS,
  getCheckinScore,
  getMonthBoundary,
  type ProvinceRankingRow,
} from '../src/lib/province-ranking.ts'

type MockCheckinRecord = {
  userId: string
  province: string | null
  provinceCode: string | null
  difficulty: string
  status: string
  createdAt: string
}

function buildCompetitionRanks<T extends { total_score: number; summit_count: number }>(
  rows: T[]
): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score
    if (b.summit_count !== a.summit_count) return b.summit_count - a.summit_count
    return 0
  })

  let previousScore: number | null = null
  let previousRank = 0

  return sorted.map((row, index) => {
    const rank = previousScore !== null && row.total_score === previousScore ? previousRank : index + 1
    previousScore = row.total_score
    previousRank = rank
    return { ...row, rank }
  })
}

function aggregateProvinceRows(
  rows: MockCheckinRecord[],
  year: number,
  month: number
): ProvinceRankingRow[] {
  const { start, end } = getMonthBoundary(year, month)
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
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
    const createdAtMs = Date.parse(row.createdAt)
    if (row.status !== 'approved') continue
    if (Number.isNaN(createdAtMs) || createdAtMs < startMs || createdAtMs >= endMs) continue
    if (!row.province || !row.provinceCode) continue

    const bucket =
      provinceMap.get(row.province) ??
      {
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

  const ranked = buildCompetitionRanks(
    Array.from(provinceMap.values()).map((bucket) => ({
      province: bucket.province,
      province_code: bucket.province_code,
      total_score: bucket.total_score,
      summit_count: bucket.summit_count,
      active_users: bucket.userIds.size,
    }))
  )

  return ranked
}

test('DIFFICULTY_WEIGHTS exposes the agreed difficulty mapping', () => {
  assert.deepEqual(DIFFICULTY_WEIGHTS, {
    beginner: 1,
    intermediate: 2,
    advanced: 5,
    expert: 10,
  })
})

test('getCheckinScore returns the configured score for known difficulties', () => {
  assert.equal(getCheckinScore('beginner'), 1)
  assert.equal(getCheckinScore('intermediate'), 2)
  assert.equal(getCheckinScore('advanced'), 5)
  assert.equal(getCheckinScore('expert'), 10)
})

test('getCheckinScore returns 0 for unknown or empty values', () => {
  assert.equal(getCheckinScore('unknown'), 0)
  assert.equal(getCheckinScore(''), 0)
})

test('getMonthBoundary returns UTC windows for UTC+8 calendar months', () => {
  assert.deepEqual(getMonthBoundary(2026, 4), {
    start: '2026-03-31T16:00:00.000Z',
    end: '2026-04-30T16:00:00.000Z',
  })

  assert.deepEqual(getMonthBoundary(2026, 1), {
    start: '2025-12-31T16:00:00.000Z',
    end: '2026-01-31T16:00:00.000Z',
  })

  assert.deepEqual(getMonthBoundary(2026, 12), {
    start: '2026-11-30T16:00:00.000Z',
    end: '2026-12-31T16:00:00.000Z',
  })
})

test('province aggregation only scores approved checkins inside the target month', () => {
  const rows = aggregateProvinceRows(
    [
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'beginner',
        status: 'approved',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'advanced',
        status: 'approved',
        createdAt: '2026-04-10T08:00:00.000Z',
      },
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'expert',
        status: 'approved',
        createdAt: '2026-04-20T08:00:00.000Z',
      },
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'expert',
        status: 'pending',
        createdAt: '2026-04-21T08:00:00.000Z',
      },
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'expert',
        status: 'rejected',
        createdAt: '2026-04-22T08:00:00.000Z',
      },
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'expert',
        status: 'approved',
        createdAt: '2026-03-20T08:00:00.000Z',
      },
    ],
    2026,
    4
  )

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    province: '北京',
    province_code: 'BJ',
    total_score: 16,
    summit_count: 3,
    active_users: 1,
    rank: 1,
  })
})

test('province ranking attributes score to the user province and skips users without province', () => {
  const rows = aggregateProvinceRows(
    [
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'advanced',
        status: 'approved',
        createdAt: '2026-04-05T08:00:00.000Z',
      },
      {
        userId: 'user-b',
        province: null,
        provinceCode: null,
        difficulty: 'expert',
        status: 'approved',
        createdAt: '2026-04-06T08:00:00.000Z',
      },
    ],
    2026,
    4
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.province, '北京')
  assert.equal(rows[0]?.total_score, 5)
})

test('province ranking uses competition rank for ties', () => {
  const rows = aggregateProvinceRows(
    [
      {
        userId: 'user-a',
        province: '北京',
        provinceCode: 'BJ',
        difficulty: 'advanced',
        status: 'approved',
        createdAt: '2026-04-05T08:00:00.000Z',
      },
      {
        userId: 'user-b',
        province: '四川',
        provinceCode: 'SC',
        difficulty: 'advanced',
        status: 'approved',
        createdAt: '2026-04-06T08:00:00.000Z',
      },
      {
        userId: 'user-c',
        province: '河南',
        provinceCode: 'HA',
        difficulty: 'beginner',
        status: 'approved',
        createdAt: '2026-04-07T08:00:00.000Z',
      },
    ],
    2026,
    4
  )

  assert.deepEqual(
    rows.map((row) => ({ province: row.province, total_score: row.total_score, rank: row.rank })),
    [
      { province: '北京', total_score: 5, rank: 1 },
      { province: '四川', total_score: 5, rank: 1 },
      { province: '河南', total_score: 1, rank: 3 },
    ]
  )
})
