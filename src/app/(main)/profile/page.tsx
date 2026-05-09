import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { listPublishableRecords, listUserCommunityPosts } from '@/lib/community-server'
import { getUserMonthlyContribution } from '@/lib/province-ranking-queries'
import { listReviewQueueRecords } from '@/lib/review-queue'
import ProfileV2Client, {
  type ProfileV2Identity,
  type ProfileV2SharePreview,
  type ProfileV2Summary,
  type ProfileV2TripPreview,
} from '@/components/profile/ProfileV2Client'

type ProfileRow = {
  username?: string | null
  display_name?: string | null
  province?: string | null
  avatar_url?: string | null
  license_level?: string | null
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

function resolveIdentity({
  userId,
  emailName,
  joinedAt,
  profile,
}: {
  userId: string
  emailName: string
  joinedAt: string
  profile: ProfileRow | null
}): ProfileV2Identity {
  const username = profile?.display_name?.trim() || profile?.username?.trim() || emailName || '登山者'

  return {
    userId,
    username,
    province: profile?.province?.trim() || null,
    avatarUrl: profile?.avatar_url ?? null,
    licenseLevel: profile?.license_level ?? 'none',
    joinedAt,
  }
}

function buildSummary(trips: ProfileV2TripPreview[]): ProfileV2Summary {
  const visitedProvinces = new Set(trips.map((trip) => trip.province).filter(Boolean))

  return {
    tripCount: trips.length,
    maxAltitudeM: Math.max(0, ...trips.map((trip) => trip.altitudeM)),
    visitedProvinceCount: visitedProvinces.size,
  }
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login?from=/profile')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
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

  const trips: ProfileV2TripPreview[] = publishableRecords.map((record) => ({
    checkinId: record.checkinId,
    mountainName: record.mountain.name,
    province: record.mountain.province,
    createdAt: record.verifiedAt || record.createdAt,
    altitudeM: record.metrics.altitudeM || record.mountain.altitude,
    photoUrl: record.photoUrl ?? record.mountain.coverImage ?? record.posterUrl ?? null,
  }))

  const shares: ProfileV2SharePreview[] = myPosts.map((post) => ({
    id: post.id,
    checkinId: post.checkinId,
    mountainName: (post.mountain?.name ?? post.title) || '未命名山行',
    province: post.mountain?.province ?? null,
    publishedAt: post.publishedAt,
    likeCount: post.likeCount,
  }))

  return (
    <ProfileV2Client
      identity={resolveIdentity({
        userId: user.id,
        emailName: user.email?.split('@')[0] ?? '登山者',
        joinedAt: user.created_at,
        profile: (profile ?? null) as ProfileRow | null,
      })}
      summary={buildSummary(trips)}
      trips={trips}
      shares={shares}
      reviewRecords={reviewQueueRecords}
      provinceContribution={provinceContribution}
      monthLabel={currentMonth.label}
    />
  )
}
