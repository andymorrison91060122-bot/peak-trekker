import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { canAccessAdminTools } from '@/lib/admin-access'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/admin')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!canAccessAdminTools({
    email: user.email,
    isAdmin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
  })) {
    redirect('/profile')
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      {/* 顶部导航 */}
      <header style={{ background: '#111', borderBottom: '2px solid #2D6A4F' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-pixel text-xs" style={{ color: '#39FF14' }}>⛰</span>
            <span className="font-pixel text-xs" style={{ color: '#E8F5E9' }}>PEAK TREKKER</span>
            <span className="font-pixel text-xs" style={{ color: '#6B7280' }}>/ ADMIN</span>
          </div>
          <nav className="flex gap-4">
            {[
              { href: '/admin', label: '总览' },
              { href: '/admin/users', label: '用户' },
              { href: '/admin/mountains', label: '山峰' },
              { href: '/admin/community', label: '社区' },
            ].map(item => (
              <a
                key={item.href}
                href={item.href}
                className="font-pixel text-[9px] transition-colors hover:text-green-400"
                style={{ color: '#6B7280' }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
