import { createSupabaseServerClient } from '@/lib/supabase-server'

type AdminDashboardProvinceStat = {
  province_name: string
  score: number | null
  active_users: number | null
}

function PixelStatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      position: 'relative',
      padding: '20px 16px',
    }}>
      {/* 四角 L 型像素边框 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          linear-gradient(var(--green-primary),var(--green-primary)) top left / 10px 2px no-repeat,
          linear-gradient(var(--green-primary),var(--green-primary)) top left / 2px 10px no-repeat,
          linear-gradient(var(--green-primary),var(--green-primary)) top right / 10px 2px no-repeat,
          linear-gradient(var(--green-primary),var(--green-primary)) top right / 2px 10px no-repeat,
          linear-gradient(var(--green-primary),var(--green-primary)) bottom left / 10px 2px no-repeat,
          linear-gradient(var(--green-primary),var(--green-primary)) bottom left / 2px 10px no-repeat,
          linear-gradient(var(--green-primary),var(--green-primary)) bottom right / 10px 2px no-repeat,
          linear-gradient(var(--green-primary),var(--green-primary)) bottom right / 2px 10px no-repeat
        `,
      }} />
      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1 }}>
        {label}
      </div>
      <div className="font-pixel" style={{ fontSize: 20, color: 'var(--green-bright)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient()

  // 并行拉取所有数据
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    usersRes,
    mountainsRes,
    todayRes,
    monthRes,
    provinceRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('mountains').select('*', { count: 'exact', head: true }),
    supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase
      .from('province_stats')
      .select('province_name, score, active_users')
      .order('score', { ascending: false })
      .limit(5),
  ])

  const totalUsers = usersRes.count ?? 0
  const totalMountains = mountainsRes.count ?? 0
  const todayCount = todayRes.count ?? 0
  const monthCount = monthRes.count ?? 0
  const topProvinces = (provinceRes.data ?? []) as AdminDashboardProvinceStat[]

  const stats = [
    { label: '总用户数', value: totalUsers, sub: 'TOTAL USERS' },
    { label: '山峰总数', value: totalMountains, sub: 'MOUNTAINS' },
    { label: '今日打卡', value: todayCount, sub: 'TODAY' },
    { label: '本月打卡', value: monthCount, sub: 'THIS MONTH' },
    { label: '省份热度榜', value: topProvinces.length > 0 ? topProvinces[0].province_name : '—', sub: 'TOP PROVINCE' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-pixel" style={{ fontSize: 11, color: 'var(--green-neon)', marginBottom: 6, textShadow: '0 0 8px var(--green-neon)' }}>
          {'// DASHBOARD'}
        </h1>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
          数据总览 · {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* 6 格数据仪表盘 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {stats.map(s => (
          <PixelStatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <div>
          <h2 className="font-pixel" style={{ fontSize: 8, color: 'var(--green-bright)', marginBottom: 12 }}>
            省份热度 Top5
          </h2>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
          }}>
            {topProvinces.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                暂无数据
              </div>
            ) : (
              topProvinces.map((p, i) => (
                <div
                  key={p.province_name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: i < topProvinces.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  {/* 排名 */}
                  <div className="font-pixel" style={{
                    width: 20,
                    fontSize: 9,
                    color: i === 0 ? '#F4A261' : i === 1 ? '#9CA3AF' : i === 2 ? '#CD7F32' : 'var(--text-muted)',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  {/* 省份名 */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {p.province_name}
                    </div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                      {p.active_users ?? 0} 活跃用户
                    </div>
                  </div>
                  {/* 分数 */}
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--green-bright)', flexShrink: 0 }}>
                    {p.score} pts
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 系统状态 */}
          <h2 className="font-pixel" style={{ fontSize: 8, color: 'var(--green-bright)', margin: '20px 0 12px' }}>
            系统状态
          </h2>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '12px 16px' }}>
            {[
              { label: '数据库', status: '正常' },
              { label: '存储', status: '正常' },
              { label: 'API', status: '正常' },
            ].map((item, i) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: i < 2 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                  {item.label}
                </span>
                <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--green-neon)' }}>
                  ● {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
