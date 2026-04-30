import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReviewQueueRecord } from '@/types'

const REVIEW_QUEUE_SELECT_VARIANTS = [
  'id, status, created_at, photo_url, review_note, admin_note, mountains(name, province)',
  'id, status, created_at, photo_url, review_note, mountains(name, province)',
  'id, status, created_at, photo_url, admin_note, mountains(name, province)',
  'id, status, created_at, photo_url, mountains(name, province)',
] as const

type RawReviewQueueRecord = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  photo_url?: string | null
  review_note?: string | null
  admin_note?: string | null
  mountains:
    | Array<{ name: string | null; province: string | null }>
    | { name: string | null; province: string | null }
    | null
}

function getPrimaryMountain(
  mountains: RawReviewQueueRecord['mountains']
): { name: string | null; province: string | null } | null {
  if (!mountains) return null
  return Array.isArray(mountains) ? mountains[0] ?? null : mountains
}

function normalizeReviewQueueRecord(record: RawReviewQueueRecord): ReviewQueueRecord | null {
  if (record.status !== 'pending' && record.status !== 'rejected') {
    return null
  }

  const mountain = getPrimaryMountain(record.mountains)

  return {
    checkinId: record.id,
    mountainName: mountain?.name ?? '未命名山峰',
    mountainProvince: mountain?.province ?? '未知地区',
    photoUrl: record.photo_url ?? null,
    status: record.status,
    reviewNote: record.review_note ?? record.admin_note ?? null,
    createdAt: record.created_at,
  }
}

export async function listReviewQueueRecords({
  supabase,
  userId,
}: {
  supabase: SupabaseClient
  userId: string
}) {
  let lastError: Error | null = null

  for (const select of REVIEW_QUEUE_SELECT_VARIANTS) {
    const { data, error } = await supabase
      .from('checkins')
      .select(select)
      .eq('user_id', userId)
      .in('status', ['pending', 'rejected'])
      .order('created_at', { ascending: false })

    if (error) {
      lastError = error
      continue
    }

    return ((data ?? []) as unknown as RawReviewQueueRecord[])
      .map(normalizeReviewQueueRecord)
      .filter((record): record is ReviewQueueRecord => Boolean(record))
  }

  if (lastError) {
    console.warn('[review-queue] failed to load records', lastError.message)
  }

  return [] as ReviewQueueRecord[]
}

export function countPendingReviewRecords(records: ReviewQueueRecord[]) {
  return records.filter((record) => record.status === 'pending').length
}
