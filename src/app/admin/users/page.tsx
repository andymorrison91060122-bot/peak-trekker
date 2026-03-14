import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminUsersClient from './AdminUsersClient'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const { page = '1', q = '' } = await searchParams
  const supabase = await createSupabaseServerClient()
  const pageSize = 20
  const offset = (Number(page) - 1) * pageSize

  let query = supabase
    .from('profiles')
    .select('id, username, province, license_level, mountain_count, total_altitude, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (q) query = query.ilike('username', `%${q}%`)

  const { data: users, count } = await query
  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          // USER MANAGEMENT
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
          用户管理 · 共 {count ?? 0} 名用户
        </div>
      </div>

      <AdminUsersClient
        users={users ?? []}
        currentPage={Number(page)}
        totalPages={totalPages}
        searchQ={q}
      />
    </div>
  )
}
