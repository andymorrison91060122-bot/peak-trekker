import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const MIN_SEARCH_LENGTH = 2
const MAX_SEARCH_LENGTH = 40

function normalizeMountainQuery(value: string | null) {
  return value
    ?.trim()
    .replace(/\s+/g, ' ')
    .replace(/[%_\\]/g, '')
    .slice(0, MAX_SEARCH_LENGTH) ?? ''
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    if (authError) console.error('[mountains-search] auth failed', authError)
    return NextResponse.json({ error: '登录后即可搜索山峰。' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const query = normalizeMountainQuery(searchParams.get('q'))

  if (query.length < MIN_SEARCH_LENGTH) {
    return NextResponse.json({ ok: true, mountains: [] })
  }

  const { data, error } = await supabase
    .from('mountains')
    .select('id, name, altitude, province, latitude, longitude')
    .eq('is_active', true)
    .ilike('name', `%${query}%`)
    .order('checkin_count', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[mountains-search] search failed', error)
    return NextResponse.json({ error: '山峰匹配暂时不可用，请稍后重试。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mountains: data ?? [] })
}
