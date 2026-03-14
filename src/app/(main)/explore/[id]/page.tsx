import { createSupabaseServerClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { MountainImagePlaceholder, AltitudeBar, DifficultyBadge } from '@/components/ui/MountainUI'
import CheckinButton from '@/components/ui/CheckinButton'
import Link from 'next/link'

const LICENSE_LABEL: Record<string, string> = {
  none: '无需执照',
  basic: '初级登山证',
  intermediate: '中级登山证',
  advanced: '高级登山证',
}

export default async function MountainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: mountain } = await supabase
    .from('mountains')
    .select('*')
    .eq('id', id)
    .single()

  if (!mountain) notFound()

  const { data: recentCheckins } = await supabase
    .from('checkins')
    .select('id, created_at, note, profiles(username, avatar_url)')
    .eq('mountain_id', id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(5)

  const isLocked = mountain.min_license !== 'none'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: 80 }}>

      {/* 顶部：山峰图片大图 */}
      <div style={{ position: 'relative' }}>
        <MountainImagePlaceholder
          name={mountain.name}
          altitude={mountain.altitude}
          size="lg"
          coverImage={mountain.cover_image}
        />
        {/* 返回按钮 */}
        <Link href="/explore" style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid var(--green-primary)',
          color: 'var(--green-bright)',
          fontFamily: 'Press Start 2P', fontSize: 8,
          padding: '6px 10px',
          textDecoration: 'none',
        }}>
          ← 返回
        </Link>
        {/* 图片底部渐变遮罩 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(transparent, var(--bg-primary))',
        }} />
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* 山峰标题区 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <h1 className="font-pixel" style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, lineHeight: 1.8 }}>
                {mountain.name}
              </h1>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginTop: 2 }}>
                {mountain.province} · {mountain.altitude.toLocaleString()}m
              </div>
            </div>
            <DifficultyBadge level={mountain.difficulty} />
          </div>

          {/* 海拔可视化 */}
          <div style={{ marginBottom: 6 }}>
            <AltitudeBar altitude={mountain.altitude} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>
            <span>0m 海平面</span>
            <span style={{ color: 'var(--green-bright)' }}>▲ {mountain.altitude.toLocaleString()}m</span>
            <span>8848m 珠峰</span>
          </div>
        </div>

        {/* 数据面板（4格仪表盘） */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {[
            { label: '登顶人数', value: `${mountain.checkin_count ?? 0}人`, icon: '▲' },
            { label: '所需执照', value: LICENSE_LABEL[mountain.min_license] ?? mountain.min_license, icon: '🪪' },
            { label: '难度评级', value: { beginner: '★☆☆☆', intermediate: '★★☆☆', advanced: '★★★☆', expert: '★★★★' }[mountain.difficulty as string] ?? '—', icon: '⚡' },
            { label: '海拔高度', value: `${mountain.altitude.toLocaleString()}m`, icon: '📍' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderLeft: '2px solid var(--green-primary)',
              padding: '10px 12px',
            }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 4 }}>
                {item.icon} {item.label}
              </div>
              <div className="font-pixel" style={{ fontSize: 9, color: 'var(--green-bright)', lineHeight: 1.6 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* 山峰简介 */}
        {mountain.description && (
          <div style={{ marginBottom: 20 }}>
            <div className="mountain-divider">
              <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>// 山峰介绍</span>
            </div>
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              padding: '12px',
              fontSize: 12, color: 'var(--text-muted)',
              fontFamily: 'Share Tech Mono', lineHeight: 1.8,
            }}>
              {mountain.description}
            </div>
          </div>
        )}

        {/* 坐标信息 */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderTop: '2px solid var(--green-primary)',
          padding: '10px 12px',
          marginBottom: 20,
          fontFamily: 'Share Tech Mono', fontSize: 10,
          color: 'var(--text-muted)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>N {mountain.latitude?.toFixed(4)}°</span>
          <span style={{ color: 'var(--green-primary)' }}>◈</span>
          <span>E {mountain.longitude?.toFixed(4)}°</span>
        </div>

        {/* 近期登顶记录 */}
        {(recentCheckins ?? []).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="mountain-divider">
              <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>▲ 近期登顶</span>
            </div>
            {recentCheckins!.map((c: any) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid var(--border-color)',
                fontSize: 11, fontFamily: 'Share Tech Mono',
              }}>
                <div style={{
                  width: 28, height: 28, background: 'var(--green-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>⛰</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 11 }}>
                    {(c.profiles as any)?.username ?? '匿名登山者'}
                  </div>
                  {c.note && <div style={{ color: 'var(--text-muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.note}</div>}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 9, flexShrink: 0 }}>
                  {new Date(c.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 执照锁定提示 */}
        {isLocked && (
          <div style={{
            background: 'rgba(139,0,0,0.08)',
            border: '1px solid rgba(139,0,0,0.25)',
            borderLeft: '3px solid #8B0000',
            padding: '12px 14px',
            marginBottom: 20,
            fontFamily: 'Share Tech Mono', fontSize: 11,
          }}>
            <div className="font-pixel" style={{ fontSize: 7, color: '#E63946', marginBottom: 6 }}>
              ⚠ 需要 {LICENSE_LABEL[mountain.min_license]}
            </div>
            <div style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
              点击下方按钮查看详细解锁步骤。
            </div>
          </div>
        )}

        {/* 底部打卡按钮（客户端交互） */}
        <CheckinButton
          isLocked={isLocked}
          minLicense={mountain.min_license}
          mountainName={mountain.name}
          altitude={mountain.altitude}
        />

      </div>
    </div>
  )
}
