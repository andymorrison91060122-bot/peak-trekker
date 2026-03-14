import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const { id, action, note } = await request.json()

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  const { error } = await supabase
    .from('checkins')
    .update({ status: newStatus, ...(note ? { review_note: note } : {}) })
    .eq('id', id)

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
      const m = checkin.mountains as any
      const p = checkin.profiles as any

      await Promise.all([
        // 用户登顶数 +1，最高海拔更新
        supabase.rpc('increment_user_stats', {
          uid: checkin.user_id,
          alt: m?.altitude ?? 0,
        }),
        // 山峰打卡数 +1
        supabase.rpc('increment_checkin_count', { mid: checkin.mountain_id }),
        // 省份积分 +1
        p?.province && supabase.rpc('increment_province_score', { pname: p.province }),
      ])
    }
  }

  return NextResponse.json({ ok: true })
}
