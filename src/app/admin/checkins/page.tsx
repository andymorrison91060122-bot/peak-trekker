import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminCheckinsClient from './AdminCheckinsClient'
import type { AdminCheckinListItem } from './AdminCheckinsClient'

export default async function AdminCheckinsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const { status = 'pending', page = '1' } = await searchParams
  const supabase = await createSupabaseServerClient()
  const pageSize = 20
  const offset = (Number(page) - 1) * pageSize

  const query = supabase
    .from('checkins')
    .select(`
      id, type, status, created_at, note, photo_url, latitude, longitude,
      mountains(id, name, altitude, province, difficulty),
      profiles(id, username, province, license_level)
    `, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (status !== 'all') query.eq('status', status)

  const { data: checkins, count } = await query

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          {'// CHECKIN REVIEW'}
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
          照片打卡审核 · 共 {count ?? 0} 条记录
        </div>
      </div>

      <AdminCheckinsClient
        checkins={(checkins ?? []) as unknown as AdminCheckinListItem[]}
        currentStatus={status}
        currentPage={Number(page)}
        totalPages={totalPages}
      />
    </div>
  )
}
