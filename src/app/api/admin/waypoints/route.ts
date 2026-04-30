import { NextRequest, NextResponse } from 'next/server'

import { canAccessAdminTools } from '../../../../lib/admin-access'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import {
  addWaypoint,
  deleteWaypoint,
  listWaypointsByMountain,
  updateWaypoint,
} from '../../../../lib/waypoints-queries'
import { WAYPOINT_TYPE_KEYS, type WaypointInput } from '../../../../lib/waypoints'

type WaypointAction = 'list' | 'add' | 'update' | 'delete'

type WaypointActionBody = {
  action?: WaypointAction
  mountainId?: string
  waypointId?: string
  waypoint?: Partial<WaypointInput> | null
  updates?: Partial<WaypointInput> | null
}

type AppErrorWithCode = Error & { code?: string }

function isWaypointType(value: string): value is WaypointInput['type'] {
  return WAYPOINT_TYPE_KEYS.includes(value as WaypointInput['type'])
}

function parseWaypointInput(input: Partial<WaypointInput> | null | undefined): WaypointInput | null {
  if (!input || typeof input.type !== 'string' || typeof input.name !== 'string') return null
  if (!isWaypointType(input.type)) return null

  return {
    type: input.type,
    name: input.name,
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(input.elevation === null || typeof input.elevation === 'number'
      ? { elevation: input.elevation }
      : {}),
  }
}

function parseWaypointUpdates(
  updates: Partial<WaypointInput> | null | undefined
): Partial<WaypointInput> | null {
  if (!updates || typeof updates !== 'object') return null

  const patch: Partial<WaypointInput> = {}
  if (typeof updates.name === 'string') patch.name = updates.name
  if (typeof updates.description === 'string') patch.description = updates.description
  if (updates.elevation === null || typeof updates.elevation === 'number') {
    patch.elevation = updates.elevation
  }
  if (typeof updates.type === 'string' && isWaypointType(updates.type)) {
    patch.type = updates.type
  }

  return Object.keys(patch).length ? patch : null
}

async function requireAdminAccess() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      supabase,
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
      supabase,
      errorResponse: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  return { supabase, errorResponse: null }
}

function toErrorResponse(error: unknown) {
  const typedError = error as AppErrorWithCode | undefined

  if (typedError?.code === 'WAYPOINT_LIMIT') {
    return NextResponse.json({ error: typedError.message }, { status: 400 })
  }

  if (typedError?.code === 'WAYPOINT_NOT_FOUND') {
    return NextResponse.json({ error: typedError.message }, { status: 404 })
  }

  return NextResponse.json(
    { error: typedError instanceof Error ? typedError.message : 'internal error' },
    { status: 500 }
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as WaypointActionBody | null
  const action = body?.action

  if (!action || !['list', 'add', 'update', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const { errorResponse } = await requireAdminAccess()
  if (errorResponse) return errorResponse

  try {
    if (action === 'list') {
      if (!body?.mountainId) {
        return NextResponse.json({ error: 'invalid params' }, { status: 400 })
      }

      const waypoints = await listWaypointsByMountain(body.mountainId)
      return NextResponse.json({ waypoints })
    }

    if (action === 'add') {
      if (!body?.mountainId) {
        return NextResponse.json({ error: 'invalid params' }, { status: 400 })
      }

      const waypoint = parseWaypointInput(body.waypoint)
      if (!waypoint) {
        return NextResponse.json({ error: 'invalid params' }, { status: 400 })
      }

      const createdWaypoint = await addWaypoint(body.mountainId, waypoint)
      return NextResponse.json({ waypoint: createdWaypoint })
    }

    if (action === 'update') {
      if (!body?.waypointId) {
        return NextResponse.json({ error: 'invalid params' }, { status: 400 })
      }

      const updates = parseWaypointUpdates(body.updates)
      if (!updates) {
        return NextResponse.json({ error: 'invalid params' }, { status: 400 })
      }

      const waypoint = await updateWaypoint(body.waypointId, updates)
      return NextResponse.json({ waypoint })
    }

    if (!body?.waypointId) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 })
    }

    await deleteWaypoint(body.waypointId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
