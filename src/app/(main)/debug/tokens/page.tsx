import { redirect } from 'next/navigation'
import TokensDebugShowcase from '@/components/ui/TokensDebugShowcase'
import { canAccessOnboardingDebugTools } from '@/lib/onboarding-debug'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function DebugTokensPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/debug/tokens')
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

  return <TokensDebugShowcase />
}
