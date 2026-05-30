import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminMountainRequestsClient, { type AdminMountainRequestListItem } from './AdminMountainRequestsClient'

type MountainRequestRow = Omit<AdminMountainRequestListItem, 'submitterName'> & {
  created_at: string
}

type ProfileRow = {
  id: string
  username: string | null
}

function normalizeSearchQuery(value: string) {
  return value.trim().replace(/[%_\\]/g, '').slice(0, 48)
}

export default async function AdminMountainRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; fu6Demo?: string }>
}) {
  const { page = '1', q = '', fu6Demo = '' } = await searchParams
  const currentPage = Math.max(1, Number(page) || 1)
  const searchQuery = normalizeSearchQuery(q)
  const supabase = await createSupabaseServerClient()
  const pageSize = 20
  const offset = (currentPage - 1) * pageSize
  const demoMode = fu6Demo === '1'

  if (demoMode) {
    const requests: AdminMountainRequestListItem[] = [
      {
        id: 'demo-xss-request',
        user_id: '11111111-1111-4111-8111-111111111111',
        location_name: '<img src=x onerror=alert(1)> 华山外侧路线',
        latitude: 34.48219,
        longitude: 110.08331,
        altitude_m: 2137,
        province: '陕西',
        request_source: 'import_distance_blocked',
        status: 'pending',
        track_name: '两步路南峰路线',
        file_name: 'liangbulu-huashan.gpx',
        import_format: 'gpx',
        candidate_mountain_name: '西岳华山南峰',
        candidate_distance_m: 21_340,
        created_at: '2026-05-30T10:20:00.000Z',
        submitterName: 'qa-importer',
      },
      {
        id: 'demo-no-match-request',
        user_id: '22222222-2222-4222-8222-222222222222',
        location_name: '未收录野山晨走',
        latitude: 30.21594,
        longitude: 119.71403,
        altitude_m: 842,
        province: null,
        request_source: 'import_no_match',
        status: 'pending',
        track_name: '周末徒步',
        file_name: 'weekend-track.fit',
        import_format: 'fit',
        candidate_mountain_name: null,
        candidate_distance_m: null,
        created_at: '2026-05-30T09:52:00.000Z',
        submitterName: null,
      },
    ]

    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
            {'// MOUNTAIN REQUESTS'}
          </h1>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
            收录申请 · demo {requests.length} 条 · 只读记录
          </div>
        </div>

        <AdminMountainRequestsClient
          requests={requests}
          currentPage={1}
          totalPages={1}
          searchQ={searchQuery}
        />
      </div>
    )
  }

  let query = supabase
    .from('mountain_requests')
    .select(`
      id,
      user_id,
      location_name,
      latitude,
      longitude,
      altitude_m,
      province,
      request_source,
      status,
      track_name,
      file_name,
      import_format,
      candidate_mountain_name,
      candidate_distance_m,
      created_at
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (searchQuery) {
    const escaped = searchQuery.replace(/,/g, ' ')
    query = query.or(`location_name.ilike.%${escaped}%,province.ilike.%${escaped}%,file_name.ilike.%${escaped}%,candidate_mountain_name.ilike.%${escaped}%`)
  }

  const { data: requestRows, count, error } = await query
  const rows = (requestRows ?? []) as MountainRequestRow[]
  const userIds = Array.from(new Set(rows.map(row => row.user_id).filter(Boolean)))

  const { data: profiles } = userIds.length > 0
    ? await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds)
    : { data: [] as ProfileRow[] }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]))
  const requests = rows.map<AdminMountainRequestListItem>((row) => ({
    ...row,
    submitterName: profileById.get(row.user_id) ?? null,
  }))
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize))

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          {'// MOUNTAIN REQUESTS'}
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
          收录申请 · 共 {count ?? 0} 条 · 只读记录
        </div>
      </div>

      {error ? (
        <div className="surface-card" style={{ padding: 16 }}>
          <div className="section-subtitle">收录申请暂时不可用：{error.message}</div>
        </div>
      ) : (
        <AdminMountainRequestsClient
          requests={requests}
          currentPage={currentPage}
          totalPages={totalPages}
          searchQ={searchQuery}
        />
      )}
    </div>
  )
}
