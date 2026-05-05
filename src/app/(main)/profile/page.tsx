import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listPublishableRecords, listUserCommunityPosts } from '@/lib/community-server'
import { getUserMonthlyContribution } from '@/lib/province-ranking-queries'
import { countPendingReviewRecords, listReviewQueueRecords } from '@/lib/review-queue'
import { resolveCheckinSource, type CheckinSource } from '@/lib/trek-utils'
import ProfileCommunitySections from '@/components/community/ProfileCommunitySections'
import ProfileAvatarUploader from '@/components/profile/ProfileAvatarUploader'
import ProvinceContributionSection from '@/components/profile/ProvinceContributionSection'
import ProfileLicenseProgressSection from '@/components/profile/ProfileLicenseProgressSection'
import ProfileReviewQueueSummary from '@/components/profile/ProfileReviewQueueSummary'

const LICENSE_PROGRESS_CONFIG = {
  none: { next: 'basic', needCount: 3, needAlt: 1000 },
  basic: { next: 'intermediate', needCount: 3, needAlt: 2000 },
  intermediate: { next: 'advanced', needCount: 3, needAlt: 4000 },
  advanced: { next: null, needCount: 0, needAlt: 0 },
} as const
const LICENSE_LEVELS = ['none', 'basic', 'intermediate', 'advanced'] as const

function estimateLength(altitude: number) {
  return Number(Math.max(4.2, Math.min(26, altitude / 260)).toFixed(1))
}

function estimateGain(altitude: number) {
  return Math.max(320, Math.round(altitude * 0.68))
}

function estimateDurationSeconds(altitude: number) {
  const hours = Math.max(2, Math.min(12, Math.round(altitude / 650)))
  return hours * 3600
}

function formatHours(seconds: number) {
  return `${(seconds / 3600).toFixed(1)}h`
}

function computeStreak(checkins: Array<{ created_at: string; status: 'pending' | 'approved' | 'rejected' }>) {
  const approvedDays = [...new Set(checkins.filter((item) => item.status === 'approved').map((item) => item.created_at.slice(0, 10)))].sort().reverse()
  let streak = 0
  let cursor = new Date()

  for (const day of approvedDays) {
    const current = cursor.toISOString().slice(0, 10)
    const previous = new Date(cursor)
    previous.setDate(previous.getDate() - 1)
    const yesterday = previous.toISOString().slice(0, 10)
    if (day === current || (streak > 0 && day === yesterday)) {
      streak += 1
      cursor = previous
    } else if (streak === 0 && day === yesterday) {
      streak += 1
      cursor = previous
    }
  }
  return streak
}

function getShanghaiYearMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  return {
    year,
    month,
    label: `${year} 年 ${month} 月`,
  }
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login?from=/profile')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  const primaryCheckinsRes = await supabase
    .from('checkins')
    .select('id, type, source, status, created_at, mountains(id, name, altitude, province, difficulty)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const fallbackCheckinsRes =
    primaryCheckinsRes.error && primaryCheckinsRes.error.message.includes('source')
      ? await supabase
          .from('checkins')
          .select('id, type, status, created_at, mountains(id, name, altitude, province, difficulty)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      : null

  const checkinsData = (fallbackCheckinsRes?.data ?? primaryCheckinsRes.data) as Array<{
    id: string
    type: 'gps' | 'photo'
    source?: CheckinSource | null
    status: 'pending' | 'approved' | 'rejected'
    created_at: string
    mountains: Array<{ id: string; name: string; altitude: number; province: string; difficulty: string }> | null
  }> | null
  const checkins = (checkinsData ?? []).map((item) => ({
    ...item,
    source: resolveCheckinSource({ source: item.source, type: item.type }),
    mountains: item.mountains?.[0] ?? null,
  }))
  const approved = checkins.filter((checkin) => checkin.status === 'approved')
  const approvedRealtime = approved.filter((checkin) => checkin.source === 'realtime_gps')
  const peakCount = approved.length
  const totalDistance = approved.reduce((sum, checkin) => sum + estimateLength(checkin.mountains?.altitude ?? 0), 0)
  const totalAscent = approved.reduce((sum, checkin) => sum + estimateGain(checkin.mountains?.altitude ?? 0), 0)
  const totalDuration = approved.reduce((sum, checkin) => sum + estimateDurationSeconds(checkin.mountains?.altitude ?? 0), 0)
  const highestAltitude = Math.max(0, ...approved.map((checkin) => checkin.mountains?.altitude ?? 0))
  const streakDays = computeStreak(checkins)
  const currentLicense = LICENSE_LEVELS.includes((profile?.license_level ?? 'none') as typeof LICENSE_LEVELS[number])
    ? ((profile?.license_level ?? 'none') as typeof LICENSE_LEVELS[number])
    : 'none'
  const currentConfig = LICENSE_PROGRESS_CONFIG[currentLicense]
  const qualifiedForNext = currentConfig.next
    ? approvedRealtime.filter((checkin) => (checkin.mountains?.altitude ?? 0) <= currentConfig.needAlt).length
    : currentConfig.needCount
  const currentMonth = getShanghaiYearMonth()

  const [publishableRecords, myPosts, reviewQueueRecords, provinceContribution] = await Promise.all([
    listPublishableRecords({
      supabase,
      userId: user.id,
    }),
    listUserCommunityPosts({
      supabase,
      userId: user.id,
    }),
    listReviewQueueRecords({
      supabase,
      userId: user.id,
    }),
    getUserMonthlyContribution(user.id, currentMonth.year, currentMonth.month),
  ])
  const pendingCount = countPendingReviewRecords(reviewQueueRecords)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div className="surface-card profile-summary-card">
        <div className="profile-summary-card__topbar">
          <ProfileAvatarUploader
            userId={user.id}
            username={profile?.username ?? '登山者'}
            province={profile?.province ?? null}
            joinedAt={user.created_at}
            initialAvatarUrl={profile?.avatar_url ?? null}
            licenseLevel={profile?.license_level ?? 'none'}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
          {[
            { label: '总登顶数', value: peakCount },
            { label: '总徒步里程', value: `${totalDistance.toFixed(1)} km` },
            { label: '总累计爬升', value: `${totalAscent} m` },
            { label: '总运动时长', value: formatHours(totalDuration) },
          ].map((item) => (
            <div key={item.label} className="metric-tile">
              <div className="metric-value">{item.value}</div>
              <div className="metric-label">{item.label}</div>
            </div>
          ))}
        </div>

        <ProfileReviewQueueSummary
          pendingCount={pendingCount}
          highestAltitude={highestAltitude}
          streakDays={streakDays}
          approvedRealtimeCount={approvedRealtime.length}
          records={reviewQueueRecords}
        />
      </div>

      <ProfileLicenseProgressSection
        currentLicense={currentLicense}
        approvedRealtimeCount={approvedRealtime.length}
        qualifiedForNext={qualifiedForNext}
      />

      <ProvinceContributionSection
        contribution={provinceContribution}
        monthLabel={currentMonth.label}
      />

      <ProfileCommunitySections
        initialRecords={publishableRecords}
        initialPosts={myPosts}
      />
    </div>
  )
}
