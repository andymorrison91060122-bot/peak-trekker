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
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(18, 20, 22, 0.84)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
          padding: '12px var(--page-padding)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'linear-gradient(180deg, rgba(34,197,94,0.2), rgba(34,197,94,0.06))',
              border: '1px solid rgba(34,197,94,0.24)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 18L10.4 7.6a1 1 0 0 1 1.7 0L20 18" stroke="var(--green-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8.8 18l2.8-4.4a.9.9 0 0 1 1.5 0L16 18" stroke="var(--text-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="font-pixel" style={{ fontSize: 16, color: 'var(--text-primary)', lineHeight: 1, whiteSpace: 'nowrap' }}>
              Peak Trekker
            </div>
            <div className="section-subtitle" style={{ marginTop: 4, whiteSpace: 'nowrap' }}>
              真实记录与分享
            </div>
          </div>
        </div>
        <UserMenu user={user} profile={profile} />
      </div>
    </header>
  )
}
