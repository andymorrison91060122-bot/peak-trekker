import Link from 'next/link'
import { redirect } from 'next/navigation'
import OnboardingRegressionChecklist from '@/components/ui/OnboardingRegressionChecklist'
import QADemoSequenceCard from '@/components/ui/QADemoSequenceCard'
import TrekVerificationChecklist from '@/components/ui/TrekVerificationChecklist'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { canAccessOnboardingDebugTools } from '@/lib/onboarding-debug'

export default async function OnboardingQAPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/onboarding-qa')
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
      <div className="surface-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="font-pixel" style={{ fontSize: 24, marginBottom: 8 }}>
          Product QA Console
        </div>
        <div className="section-subtitle" style={{ marginBottom: 12 }}>
          仅用于开发/管理员验收。建议先演示 onboarding，再走登顶核验闭环与异常恢复分支。
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/profile" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            返回个人页
          </Link>
          <Link href="/explore" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            进入探索页
          </Link>
          <Link href="/trek" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            进入出发页
          </Link>
          <Link href="/community" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            进入山友圈
          </Link>
          <Link href="/community-qa" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            社区人工验收
          </Link>
          <Link href="/share-card-lab" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            分享实验室
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <QADemoSequenceCard />
        <OnboardingRegressionChecklist />
        <TrekVerificationChecklist />
      </div>
    </div>
  )
}
