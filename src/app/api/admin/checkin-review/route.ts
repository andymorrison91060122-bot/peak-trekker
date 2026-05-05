import { NextRequest, NextResponse } from 'next/server'
import { canAccessAdminTools } from '@/lib/admin-access'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type CheckinReviewStatsRow = {
  user_id: string
  mountain_id: string | null
  mountains: { altitude: number | null; province: string | null } | { altitude: number | null; province: string | null }[] | null
  profiles: { province: string | null } | { province: string | null }[] | null
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id, action, note } = await request.json()

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  let { error } = await supabase
    .from('checkins')
    .update({ status: newStatus, ...(note ? { review_note: note } : {}) })
    .eq('id', id)

  if (error && note && /review_note/i.test(error.message)) {
    const fallbackUpdate = await supabase
      .from('checkins')
      .update({ status: newStatus, admin_note: note })
      .eq('id', id)
    error = fallbackUpdate.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 通过时：更新用户登顶数 + 山峰打卡数 + 省份积分
  if (action === 'approve') {
    const { data: checkin } = await supabase
      .from('checkins')
      .select('user_id, mountain_id, mountains(altitude, province), profiles(province)')
      .eq('id', id)
      .single()

    if (checkin) {
      const row = checkin as unknown as CheckinReviewStatsRow
      const m = firstRelation(row.mountains)
      const p = firstRelation(row.profiles)

      await Promise.all([
        // 用户登顶数 +1，最高海拔更新
        supabase.rpc('increment_user_stats', {
          uid: row.user_id,
          alt: m?.altitude ?? 0,
        }),
        // 山峰打卡数 +1
        supabase.rpc('increment_checkin_count', { mid: row.mountain_id }),
        // 省份积分 +1
        p?.province && supabase.rpc('increment_province_score', { pname: p.province }),
      ])
    }
  }

  return NextResponse.json({ ok: true })
}
