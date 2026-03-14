import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { AltitudeBar } from '@/components/ui/MountainUI'
import Link from 'next/link'

// 执照配置
const LICENSE_CONFIG = {
  none:         { label: '无执照',    icon: '○', color: '#6B7280', next: 'basic',        needCount: 3, needAlt: 1000 },
  basic:        { label: '初级登山证', icon: '◉', color: '#52B788', next: 'intermediate', needCount: 3, needAlt: 2000 },
  intermediate: { label: '中级登山证', icon: '◈', color: '#F4A261', next: 'advanced',     needCount: 3, needAlt: 4000 },
  advanced:     { label: '高级登山证', icon: '★', color: '#39FF14', next: null,           needCount: 0, needAlt: 0   },
} as const

const DIFF_COLOR: Record<string, string> = {
  beginner: '#52B788', intermediate: '#F4A261', advanced: '#E76F51', expert: '#E63946',
}
const DIFF_LABEL: Record<string, string> = {
  beginner: '入门', intermediate: '中级', advanced: '高级', expert: '专家',
}

// 成就定义（本地计算）
function computeAchievements(checkins: any[], profile: any) {
  const approved = checkins.filter(c => c.status === 'approved')
  const count = approved.length
  const maxAlt = Math.max(0, ...approved.map((c: any) => c.mountains?.altitude ?? 0))

  const achievements = [
    { id: 'first_peak',   icon: '🏔', title: '初登峰顶',   desc: '完成第一次登顶打卡',           earned: count >= 1 },
    { id: 'three_peaks',  icon: '⛰', title: '三峰挑战者', desc: '登顶 3 座不同山峰',             earned: count >= 3 },
    { id: 'ten_peaks',    icon: '🗻', title: '十峰勇士',   desc: '登顶 10 座不同山峰',            earned: count >= 10 },
    { id: 'high_3000',    icon: '❄', title: '云端漫步者', desc: '登顶海拔 3000m 以上的山峰',     earned: maxAlt >= 3000 },
    { id: 'high_5000',    icon: '🌨', title: '高原行者',   desc: '登顶海拔 5000m 以上的山峰',    earned: maxAlt >= 5000 },
    { id: 'gps_master',   icon: '📍', title: 'GPS精英',    desc: '完成 5 次 GPS 打卡',            earned: approved.filter((c: any) => c.type === 'gps').length >= 5 },
    { id: 'license_basic',icon: '🪪', title: '持证登山人', desc: '获得初级登山证',                 earned: ['basic','intermediate','advanced'].includes(profile?.license_level) },
    { id: 'province_rep', icon: '🏅', title: '省份代表',   desc: '为家乡省份贡献 3 次登顶',       earned: count >= 3 },
  ]
  return achievements
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login?from=/profile')

  // 并行拉取数据
  const [profileRes, checkinsRes, provinceRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('checkins')
      .select('id, type, status, created_at, mountains(id, name, altitude, province, difficulty)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('province_stats').select('province_name, score, active_users').order('score', { ascending: false }).limit(5),
  ])

  const profile = profileRes.data
  const checkins = checkinsRes.data ?? []
  const topProvinces = provinceRes.data ?? []

  const approved = checkins.filter(c => c.status === 'approved')
  const pending  = checkins.filter(c => c.status === 'pending')

  // 执照进度计算
  const currentLicense = profile?.license_level ?? 'none'
  const cfg = LICENSE_CONFIG[currentLicense as keyof typeof LICENSE_CONFIG]
  const nextCfg = cfg.next ? LICENSE_CONFIG[cfg.next as keyof typeof LICENSE_CONFIG] : null

  // 下一级所需：在当前可打卡范围内完成的数量
  const qualifiedForNext = cfg.next
    ? approved.filter((c: any) => {
        const alt = c.mountains?.altitude ?? 0
        return alt <= cfg.needAlt
      }).length
    : 0
  const progressToNext = cfg.next ? Math.min(qualifiedForNext, cfg.needCount) : cfg.needCount
  const progressPct = cfg.next ? (progressToNext / cfg.needCount) * 100 : 100

  // 最高海拔
  const maxAltitude = Math.max(0, ...approved.map((c: any) => c.mountains?.altitude ?? 0))

  // 成就
  const achievements = computeAchievements(checkins, profile)
  const earnedCount = achievements.filter(a => a.earned).length

  // 找自己省份排名
  const myProvinceRank = topProvinces.findIndex(p => p.province_name === profile?.province) + 1

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: 80 }}>

      {/* ── 顶部个人卡 ── */}
      <div style={{
        background: 'linear-gradient(180deg, #050f05 0%, #0a1a0a 60%, var(--bg-primary) 100%)',
        padding: '24px 16px 0',
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
          {/* 像素头像 */}
          <div style={{
            width: 64, height: 64, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--green-primary), #0a1a0a)',
            border: '2px solid var(--green-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, position: 'relative',
          }}>
            {profile?.province?.slice(0, 1) ?? '⛰'}
            {/* 执照角标 */}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 18, height: 18,
              background: cfg.color,
              border: '1px solid var(--bg-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10,
            }}>
              {cfg.icon}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div className="font-pixel" style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>
              {profile?.username ?? '登山者'}
            </div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
              {profile?.province ?? '—'} · 注册于 {new Date(user.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
            </div>
            {/* 执照标签 */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px',
              background: `${cfg.color}18`,
              border: `1px solid ${cfg.color}50`,
              fontFamily: 'Press Start 2P', fontSize: 7,
              color: cfg.color,
            }}>
              {cfg.icon} {cfg.label}
            </div>
          </div>
        </div>

        {/* 四格数据 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: '登顶', value: approved.length, unit: '座' },
            { label: '最高', value: maxAltitude >= 1000 ? `${(maxAltitude/1000).toFixed(1)}k` : maxAltitude, unit: 'm' },
            { label: '待审', value: pending.length, unit: '条' },
            { label: '成就', value: `${earnedCount}/${achievements.length}`, unit: '' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid var(--border-color)',
              borderTop: '2px solid var(--green-primary)',
              padding: '10px 8px', textAlign: 'center',
            }}>
              <div className="font-pixel" style={{ fontSize: 11, color: 'var(--green-bright)', marginBottom: 2 }}>
                {item.value}<span style={{ fontSize: 7 }}>{item.unit}</span>
              </div>
              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* ── 攀登执照进度 ── */}
        <div style={{ marginBottom: 20 }}>
          <div className="mountain-divider">
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>
              🪪 攀登执照
            </span>
          </div>

          <div className="topo-card" style={{ padding: 16 }}>
            {/* 执照等级路径 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              {(['none','basic','intermediate','advanced'] as const).map((lvl, i, arr) => {
                const c = LICENSE_CONFIG[lvl]
                const isEarned = ['none','basic','intermediate','advanced'].indexOf(currentLicense) >= i
                const isCurrent = currentLicense === lvl
                return (
                  <div key={lvl} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: 28, height: 28,
                        background: isEarned ? c.color : 'var(--bg-secondary)',
                        border: `2px solid ${isEarned ? c.color : 'var(--border-color)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12,
                        boxShadow: isCurrent ? `0 0 8px ${c.color}` : 'none',
                      }}>
                        {isEarned ? c.icon : '·'}
                      </div>
                      <div style={{
                        fontFamily: 'Press Start 2P', fontSize: 5,
                        color: isCurrent ? c.color : isEarned ? 'var(--text-muted)' : 'var(--border-color)',
                        textAlign: 'center', lineHeight: 1.6,
                        maxWidth: 40,
                      }}>
                        {lvl === 'none' ? '无' : lvl === 'basic' ? '初级' : lvl === 'intermediate' ? '中级' : '高级'}
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{
                        flex: 1, height: 2, margin: '0 4px', marginBottom: 16,
                        background: isEarned && ['none','basic','intermediate','advanced'].indexOf(currentLicense) > i
                          ? 'var(--green-primary)' : 'var(--border-color)',
                      }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* 下一级进度 */}
            {cfg.next && nextCfg ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                    距 <span style={{ color: nextCfg.color }}>{nextCfg.label}</span>
                  </div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--green-bright)' }}>
                    {progressToNext} / {cfg.needCount} 座
                  </div>
                </div>
                <AltitudeBar altitude={progressPct * 90} max={9000} />
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.7 }}>
                  需在 {cfg.needAlt.toLocaleString()}m 以下山峰再完成 {Math.max(0, cfg.needCount - progressToNext)} 座
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', fontFamily: 'Share Tech Mono', fontSize: 10 }}>
                <span className="neon-green">★ 已获得最高级别执照</span>
              </div>
            )}
          </div>
        </div>

        {/* ── 成就勋章墙 ── */}
        <div style={{ marginBottom: 20 }}>
          <div className="mountain-divider">
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>
              🏅 成就勋章
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {achievements.map(a => (
              <div key={a.id} style={{
                background: a.earned ? 'rgba(45,106,79,0.12)' : 'var(--bg-card)',
                border: `1px solid ${a.earned ? 'var(--green-primary)' : 'var(--border-color)'}`,
                borderTop: `2px solid ${a.earned ? 'var(--green-bright)' : 'var(--border-color)'}`,
                padding: '10px 6px',
                textAlign: 'center',
                opacity: a.earned ? 1 : 0.4,
                position: 'relative',
              }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{a.icon}</div>
                <div className="font-pixel" style={{ fontSize: 6, color: a.earned ? 'var(--green-bright)' : 'var(--text-muted)', lineHeight: 1.8 }}>
                  {a.title}
                </div>
                {a.earned && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 6, height: 6,
                    background: 'var(--green-neon)',
                    borderRadius: '50%',
                    boxShadow: '0 0 4px var(--green-neon)',
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── 登顶记录列表 ── */}
        <div style={{ marginBottom: 20 }}>
          <div className="mountain-divider">
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>
              ▲ 登顶记录
            </span>
          </div>

          {checkins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-muted)' }}>
              还没有登顶记录，去出发页开始吧！
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checkins.slice(0, 10).map((c: any) => {
                const m = c.mountains
                return (
                  <div key={c.id} style={{
                    display: 'flex', gap: 10, alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderLeft: `3px solid ${
                      c.status === 'approved' ? (DIFF_COLOR[m?.difficulty] ?? 'var(--green-primary)')
                      : c.status === 'pending' ? '#F4A261'
                      : '#E63946'
                    }`,
                    opacity: c.status === 'rejected' ? 0.5 : 1,
                  }}>
                    {/* 山峰信息 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-pixel" style={{ fontSize: 8, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.6 }}>
                        {m?.name ?? '未知山峰'}
                      </div>
                      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                        ▲ {(m?.altitude ?? 0).toLocaleString()}m · {m?.province}
                      </div>
                    </div>

                    {/* 右侧元数据 */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontFamily: 'Share Tech Mono', fontSize: 9,
                        color: c.status === 'approved' ? 'var(--green-bright)'
                          : c.status === 'pending' ? '#F4A261' : '#E63946',
                        marginBottom: 3,
                      }}>
                        {c.status === 'approved' ? '✓ 已通过' : c.status === 'pending' ? '⏳ 审核中' : '✗ 已拒绝'}
                      </div>
                      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: 'var(--text-muted)' }}>
                        {c.type === 'gps' ? '📍' : '📷'} {new Date(c.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 省份荣誉 ── */}
        <div style={{ marginBottom: 20 }}>
          <div className="mountain-divider">
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>
              🗺 省份荣誉
            </span>
          </div>
          <div className="mountain-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {profile?.province ?? '—'}
                </div>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                  你已为家乡贡献 <span style={{ color: 'var(--green-bright)' }}>{approved.length}</span> 次登顶
                </div>
              </div>
              {myProvinceRank > 0 && (
                <div style={{
                  fontFamily: 'Press Start 2P', fontSize: 8,
                  color: 'var(--green-neon)',
                  textShadow: '0 0 6px var(--green-neon)',
                }}>
                  TOP {myProvinceRank}
                </div>
              )}
            </div>
            {/* 省份热度榜 */}
            {topProvinces.map((prov, i) => (
              <div key={prov.province_name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0',
                borderBottom: i < topProvinces.length - 1 ? '1px solid var(--border-color)' : 'none',
              }}>
                <div className="font-pixel" style={{
                  width: 16, fontSize: 7,
                  color: i === 0 ? '#F4A261' : i === 1 ? '#9CA3AF' : i === 2 ? '#CD7F32' : 'var(--text-muted)',
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, fontFamily: 'Share Tech Mono', fontSize: 10, color: prov.province_name === profile?.province ? 'var(--green-bright)' : 'var(--text-muted)' }}>
                  {prov.province_name}
                  {prov.province_name === profile?.province && ' ←我'}
                </div>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                  {prov.score} pts
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 设置入口 ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 1,
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
        }}>
          {[
            { label: '编辑个人资料', icon: '✏', href: '#' },
            { label: '登录与安全',   icon: '🔒', href: '#' },
            { label: '关于 Peak Trekker', icon: '⛰', href: '#' },
          ].map(item => (
            <div key={item.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '13px 14px',
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border-color)',
              fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-muted)',
              cursor: 'pointer',
            }}>
              <span>{item.icon} {item.label}</span>
              <span style={{ color: 'var(--green-primary)' }}>›</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
