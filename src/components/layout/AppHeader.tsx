import { createSupabaseServerClient } from '@/lib/supabase-server'
import { BrandTile } from '@/components/brand/BrandTile'
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
          <BrandTile size={36} />
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
