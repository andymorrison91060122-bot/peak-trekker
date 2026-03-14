import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserMenu from './UserMenu'

export default async function AppHeader() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('username, license_level, mountain_count')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'rgba(10,10,10,0.96)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--border-color)',
    }}>
      {/* 顶部刻度线 */}
      <div style={{
        height: '2px',
        background: 'repeating-linear-gradient(90deg, var(--green-primary) 0, var(--green-primary) 3px, transparent 3px, transparent 7px)',
      }} />
      <div style={{
        maxWidth: 480, margin: '0 auto',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⛰</span>
          <span className="font-pixel" style={{ fontSize: 8, color: 'var(--green-neon)', textShadow: '0 0 6px var(--green-neon)', letterSpacing: 1 }}>
            PEAK
          </span>
        </div>
        <UserMenu user={user} profile={profile} />
      </div>
    </header>
  )
}
