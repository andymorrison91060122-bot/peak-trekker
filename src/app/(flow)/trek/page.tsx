import { redirect } from 'next/navigation'
import TrekClient from './TrekClient'
import { buildAuthReturnTarget } from '@/lib/auth-redirect'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import AppToastProvider from '@/components/ui/AppToastProvider'
import type { User } from '@/types'

export default async function TrekPage({
  searchParams,
}: {
  searchParams: Promise<{ mountainId?: string }>
}) {
  const { mountainId } = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const search = mountainId ? `?mountainId=${encodeURIComponent(mountainId)}` : ''
    redirect(`/auth/login?from=${encodeURIComponent(buildAuthReturnTarget('/trek', search))}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('province, license_level')
    .eq('id', user.id)
    .single()

  return (
    <AppToastProvider>
      <TrekClient
        userProvince={profile?.province ?? null}
        userLicense={(profile?.license_level ?? 'none') as User['license_level']}
      />
    </AppToastProvider>
  )
}
