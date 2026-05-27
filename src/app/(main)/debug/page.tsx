import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { canAccessOnboardingDebugTools } from '@/lib/onboarding-debug'
import OnboardingToolsGate from '@/components/ui/OnboardingToolsGate'

export default async function DebugPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/debug')
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div className="surface-card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="font-pixel" style={{ fontSize: 24, marginBottom: 8 }}>
          Debug Console
        </div>
        <div className="section-subtitle" style={{ marginBottom: 12 }}>
          仅对开发环境、管理员或白名单 QA 账号开放。这里集中放置 onboarding 重放和回归调试入口。
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/profile" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            返回个人页
          </Link>
          <Link href="/community-qa" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            打开社区回归页
          </Link>
          <Link href="/debug/map-prototype" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            打开地图原型
          </Link>
        </div>
      </div>

      <OnboardingToolsGate canAccess defaultOpen={process.env.NODE_ENV !== 'production'} />
    </div>
  )
}
