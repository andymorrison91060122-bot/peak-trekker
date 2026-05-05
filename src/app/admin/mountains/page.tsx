import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminMountainsClient from './AdminMountainsClient'
import type { AdminMountainListItem } from './AdminMountainsClient'

export default async function AdminMountainsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; difficulty?: string }>
}) {
  const { page = '1', q = '', difficulty = '' } = await searchParams
  const supabase = await createSupabaseServerClient()
  const pageSize = 20
  const offset = (Number(page) - 1) * pageSize

  let query = supabase
    .from('mountains')
    .select('id, name, altitude, province, difficulty, min_license, checkin_count, latitude, longitude', { count: 'exact' })
    .order('altitude', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (q) query = query.ilike('name', `%${q}%`)
  if (difficulty) query = query.eq('difficulty', difficulty)

  const { data: mountains, count } = await query
  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          {'// MOUNTAIN DATA'}
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
          山峰数据管理 · 共 {count ?? 0} 座
        </div>
      </div>

      <AdminMountainsClient
        mountains={(mountains ?? []) as AdminMountainListItem[]}
        currentPage={Number(page)}
        totalPages={totalPages}
        searchQ={q}
      />
    </div>
  )
}
