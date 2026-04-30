import { NextRequest, NextResponse } from 'next/server'

import { canAccessAdminTools } from '@/lib/admin-access'
import { LICENSE_UI_ORDER } from '@/lib/license-ui'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { Mountain } from '@/types'

type UpdateableMountainFields = Pick<
  Mountain,
  'name' | 'description' | 'altitude' | 'difficulty' | 'min_license'
>

type MountainActionBody = {
  action?: 'update'
  mountainId?: string
  updates?: Partial<UpdateableMountainFields> | null
}

const DIFFICULTY_OPTIONS: Mountain['difficulty'][] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]

function isDifficultyValue(value: string): value is Mountain['difficulty'] {
  return DIFFICULTY_OPTIONS.includes(value as Mountain['difficulty'])
}

function isLicenseValue(value: string): value is Mountain['min_license'] {
  return LICENSE_UI_ORDER.includes(value as Mountain['min_license'])
}

async function requireAdminAccess() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
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
    return {
      errorResponse: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  return { errorResponse: null }
}

function parseMountainUpdates(
  updates: Partial<UpdateableMountainFields> | null | undefined
) {
  if (!updates || typeof updates !== 'object') return null

  const patch: Partial<UpdateableMountainFields> = {}

  if (typeof updates.name === 'string') {
    const normalizedName = updates.name.trim()
    if (!normalizedName) {
      return { error: '名称不能为空' as const }
    }
    patch.name = normalizedName
  }

  if (typeof updates.description === 'string') {
    patch.description = updates.description
  }

  if (typeof updates.altitude === 'number') {
    if (!Number.isInteger(updates.altitude) || updates.altitude <= 0) {
      return { error: '海拔必须是大于 0 的整数' as const }
    }
    patch.altitude = updates.altitude
  }

  if (typeof updates.difficulty === 'string') {
    if (!isDifficultyValue(updates.difficulty)) {
      return { error: '难度参数非法' as const }
    }
    patch.difficulty = updates.difficulty
  }

  if (typeof updates.min_license === 'string') {
    if (!isLicenseValue(updates.min_license)) {
      return { error: '最低执照参数非法' as const }
    }
    patch.min_license = updates.min_license
  }

  if (!Object.keys(patch).length) {
    return { error: 'invalid params' as const }
  }

  return { patch }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as MountainActionBody | null

  if (body?.action !== 'update' || !body.mountainId) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const { errorResponse } = await requireAdminAccess()
  if (errorResponse) return errorResponse

  const parsed = parseMountainUpdates(body.updates)
  if (!parsed || 'error' in parsed) {
    return NextResponse.json({ error: parsed?.error ?? 'invalid params' }, { status: 400 })
  }

  try {
    const supabase = createSupabaseAdminClient()

    const { data: existing, error: existingError } = await supabase
      .from('mountains')
      .select('id')
      .eq('id', body.mountainId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: 'mountain not found' }, { status: 404 })
    }

    const { data: mountain, error } = await supabase
      .from('mountains')
      .update(parsed.patch)
      .eq('id', body.mountainId)
      .select('id, name, description, altitude, province, difficulty, min_license, checkin_count, cover_image, gallery_images')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!mountain) {
      return NextResponse.json({ error: 'mountain not found' }, { status: 404 })
    }

    return NextResponse.json({ mountain })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status: 500 }
    )
  }
}
