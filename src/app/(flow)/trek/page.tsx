import { redirect } from 'next/navigation'
import TrekClient from './TrekClient'
import { buildAuthReturnTarget } from '@/lib/auth-redirect'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listProfileTrips } from '@/lib/profile-records-server'
import { buildLicenseProgressSummary } from '@/lib/license-progress'
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

  const [profileRes, profileTrips] = await Promise.all([
    supabase
      .from('profiles')
      .select('province, license_level')
      .eq('id', user.id)
      .single(),
    listProfileTrips({ supabase, userId: user.id }).catch(() => []),
  ])

  const profile = profileRes.data

  return (
    <AppToastProvider>
      <TrekClient
        userProvince={profile?.province ?? null}
        userLicense={(profile?.license_level ?? 'none') as User['license_level']}
        licenseProgress={buildLicenseProgressSummary({
          storedLevel: profile?.license_level ?? 'none',
          records: profileTrips,
        })}
      />
    </AppToastProvider>
  )
}
