import { NextResponse } from 'next/server'
import { handleProfileNicknameRequest } from '@/lib/profile-nickname-update'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  const body = await request.json().catch(() => null)
  const result = await handleProfileNicknameRequest({
    supabase,
    userId: authError || !user ? null : user.id,
    body,
  })

  return NextResponse.json(result.body, { status: result.status })
}
