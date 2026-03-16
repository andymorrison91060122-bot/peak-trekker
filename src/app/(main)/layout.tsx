import TabBar from '@/components/layout/TabBar'
import AppHeader from '@/components/layout/AppHeader'
import TrekFAB from '@/components/ui/TrekFAB'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <AppHeader />
      <main className="max-w-lg mx-auto pb-20">
        {children}
      </main>
      <TrekFAB />
      <TabBar />
    </div>
  )
}
