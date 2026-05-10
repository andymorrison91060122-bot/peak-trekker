import { createSupabaseServerClient } from '@/lib/supabase-server'
import TabBar from '@/components/layout/TabBar'
import AppHeader from '@/components/layout/AppHeader'
import OnboardingModal from '@/components/ui/OnboardingModal'
import AppToastProvider from '@/components/ui/AppToastProvider'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let initialProvince: string | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('province')
      .eq('id', user.id)
      .single()
    initialProvince = data?.province ?? null
  }

  return (
    <AppToastProvider>
      <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
        <AppHeader />
        <OnboardingModal initialProvince={initialProvince} currentUserId={user?.id ?? null} />
        <main
          className="mx-auto"
          style={{
            maxWidth: 'var(--page-max-width)',
            paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
          }}
        >
          {children}
        </main>
        <TabBar />
      </div>
    </AppToastProvider>
  )
}
