import Link from 'next/link'
import { redirect } from 'next/navigation'
import CommunityManualAcceptanceChecklist from '@/components/community/CommunityManualAcceptanceChecklist'
import CommunityTestRecordSeeder from '@/components/community/CommunityTestRecordSeeder'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { canAccessOnboardingDebugTools } from '@/lib/onboarding-debug'

export default async function CommunityQAPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/community-qa')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const canAccess = canAccessOnboardingDebugTools({
    email: user.email,
    isAdmin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
  })

  if (!canAccess) {
    redirect('/profile')
  }

  const { data: mountains } = await supabase
    .from('mountains')
    .select('id, name, province, altitude, latitude, longitude')
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(12)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div className="surface-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="font-pixel" style={{ fontSize: 24, marginBottom: 8 }}>
          Community QA Console
        </div>
        <div className="section-subtitle" style={{ marginBottom: 12 }}>
          仅用于开发/管理员人工验收。这里把山友圈 7 条自动回归映射成可手点的真实产品路径。
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/onboarding-qa" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            返回 Product QA Console
          </Link>
          <Link href="/profile" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            进入个人页
          </Link>
          <Link href="/community" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            进入山友圈
          </Link>
          <Link href="/trek" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            进入出发页
          </Link>
          <Link href="/admin/community" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            进入社区后台
          </Link>
        </div>
      </div>

      <CommunityTestRecordSeeder mountains={(mountains ?? []) as Array<{
        id: string
        name: string
        province: string | null
        altitude: number
        latitude: number | null
        longitude: number | null
      }>} />

      <CommunityManualAcceptanceChecklist />
    </div>
  )
}
