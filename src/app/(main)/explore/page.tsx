import { createSupabaseServerClient } from '@/lib/supabase-server'
import { PixelMountainBg, MountainCard, MountainFeatureCard } from '@/components/ui/MountainUI'
import ExploreClient from './ExploreClient'
import OnboardingModal from '@/components/ui/OnboardingModal'

export default async function ExplorePage() {
  const supabase = await createSupabaseServerClient()

  // 拉取所有山峰
  const { data: mountains } = await supabase
    .from('mountains')
    .select('*')
    .eq('is_active', true)
    .order('checkin_count', { ascending: false })

  // 精选：海拔最高的2座
  const featured = (mountains ?? [])
    .filter(m => m.altitude >= 5000)
    .slice(0, 2)

  // 列表：其余
  const list = (mountains ?? [])
    .filter(m => m.altitude < 5000)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <OnboardingModal />

      {/* 顶部山脉全景 */}
      <div style={{ position: 'relative', background: 'linear-gradient(180deg, #050f05 0%, #0a1a0a 60%, var(--bg-primary) 100%)' }}>
        <PixelMountainBg />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px' }}>
          <div className="font-pixel" style={{ fontSize: 8, color: 'var(--green-neon)', textShadow: '0 0 8px var(--green-neon)', letterSpacing: 2 }}>
            PEAK TREKKER
          </div>
          <div className="font-pixel" style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 4 }}>
            探索山峰
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'Share Tech Mono' }}>
            共收录 {mountains?.length ?? 0} 座山峰
          </div>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 9, color: 'var(--text-muted)', textAlign: 'right', fontFamily: 'Share Tech Mono' }}>
          <div>☀ 晴</div>
          <div style={{ color: 'var(--green-bright)' }}>风速 3级</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        {/* 交互部分（搜索/筛选）交给客户端组件 */}
        <ExploreClient featured={featured} list={list} />
      </div>
    </div>
  )
}
