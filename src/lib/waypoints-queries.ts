import { createSupabaseAdminClient } from './supabase-admin'
import { createSupabaseServerClient } from './supabase-server'
import {
  MAX_WAYPOINTS_PER_TYPE,
  WAYPOINT_TYPE_KEYS,
  normalizeWaypointCoordinate,
  type Waypoint,
  type WaypointInput,
  type WaypointType,
} from './waypoints'

type WaypointQueryErrorCode =
  | 'WAYPOINT_LIMIT'
  | 'WAYPOINT_NOT_FOUND'
  | 'WAYPOINT_INVALID_REORDER'

type WaypointQueryError = Error & { code: WaypointQueryErrorCode }

function createWaypointQueryError(code: WaypointQueryErrorCode, message: string): WaypointQueryError {
  return Object.assign(new Error(message), { code })
}

function isWaypointType(value: string): value is WaypointType {
  return WAYPOINT_TYPE_KEYS.includes(value as WaypointType)
}

function normalizeWaypointRecord(record: Partial<Waypoint> | null | undefined): Waypoint {
  if (
    !record?.id
    || !record.mountain_id
    || !record.type
    || !record.name
    || typeof record.sort_order !== 'number'
    || !record.created_at
    || !isWaypointType(record.type)
  ) {
    throw new Error('invalid waypoint record shape')
  }

  return {
    id: record.id,
    mountain_id: record.mountain_id,
    type: record.type,
    name: record.name,
    description: record.description ?? '',
    elevation: record.elevation ?? null,
    latitude: normalizeWaypointCoordinate(record.latitude),
    longitude: normalizeWaypointCoordinate(record.longitude),
    sort_order: record.sort_order,
    created_at: record.created_at,
  }
}

function buildWaypointPatch(updates: Partial<WaypointInput>) {
  const patch: Partial<Waypoint> = {}

  if (typeof updates.name === 'string') patch.name = updates.name
  if (typeof updates.description === 'string') patch.description = updates.description
  if (updates.elevation === null || typeof updates.elevation === 'number') {
    patch.elevation = updates.elevation
  }
  if (updates.latitude === null || typeof updates.latitude === 'number') {
    patch.latitude = updates.latitude
  }
  if (updates.longitude === null || typeof updates.longitude === 'number') {
    patch.longitude = updates.longitude
  }
  if (typeof updates.type === 'string' && isWaypointType(updates.type)) {
    patch.type = updates.type
  }

  return patch
}

async function getTypeCountAndMaxSortOrder(
  mountainId: string,
  type: WaypointType
): Promise<{ count: number; maxSortOrder: number }> {
  const supabase = createSupabaseAdminClient()
  const { data, count, error } = await supabase
    .from('mountain_waypoints')
    .select('id, sort_order', { count: 'exact' })
    .eq('mountain_id', mountainId)
    .eq('type', type)
    .order('sort_order', { ascending: false })
    .limit(1)

  if (error) throw error

  return {
    count: count ?? 0,
    maxSortOrder: typeof data?.[0]?.sort_order === 'number' ? data[0].sort_order : -1,
  }
}

export async function listWaypointsByMountain(mountainId: string): Promise<Waypoint[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('mountain_waypoints')
    .select('*')
    .eq('mountain_id', mountainId)
    .order('type', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((record) => normalizeWaypointRecord(record as Partial<Waypoint>))
}

export async function addWaypoint(mountainId: string, input: WaypointInput): Promise<Waypoint> {
  const supabase = createSupabaseAdminClient()
  const { count, maxSortOrder } = await getTypeCountAndMaxSortOrder(mountainId, input.type)

  if (count >= MAX_WAYPOINTS_PER_TYPE) {
    throw createWaypointQueryError('WAYPOINT_LIMIT', '该类型点位最多 10 个')
  }

  const { data, error } = await supabase
    .from('mountain_waypoints')
    .insert({
      mountain_id: mountainId,
      type: input.type,
      name: input.name,
      description: input.description ?? '',
      elevation: input.elevation ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      sort_order: maxSortOrder + 1,
    })
    .select('*')
    .single()

  if (error) throw error

  return normalizeWaypointRecord(data as Partial<Waypoint>)
}

export async function updateWaypoint(
  waypointId: string,
  updates: Partial<WaypointInput>
): Promise<Waypoint> {
  const supabase = createSupabaseAdminClient()
  const { data: existing, error: existingError } = await supabase
    .from('mountain_waypoints')
    .select('*')
    .eq('id', waypointId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) {
    throw createWaypointQueryError('WAYPOINT_NOT_FOUND', '点位不存在')
  }

  const current = normalizeWaypointRecord(existing as Partial<Waypoint>)
  const patch = buildWaypointPatch(updates)

  if (!Object.keys(patch).length) {
    return current
  }

  if (patch.type && patch.type !== current.type) {
    const { count, maxSortOrder } = await getTypeCountAndMaxSortOrder(current.mountain_id, patch.type)

    if (count >= MAX_WAYPOINTS_PER_TYPE) {
      throw createWaypointQueryError('WAYPOINT_LIMIT', '该类型点位最多 10 个')
    }

    patch.sort_order = maxSortOrder + 1
  }

  const { data, error } = await supabase
    .from('mountain_waypoints')
    .update(patch)
    .eq('id', waypointId)
    .select('*')
    .single()

  if (error) throw error

  return normalizeWaypointRecord(data as Partial<Waypoint>)
}

export async function deleteWaypoint(waypointId: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('mountain_waypoints')
    .delete()
    .eq('id', waypointId)

  if (error) throw error
}

export async function reorderWaypoints(waypointIds: string[]): Promise<void> {
  if (!waypointIds.length) return

  const uniqueIds = new Set(waypointIds)
  if (uniqueIds.size !== waypointIds.length) {
    throw createWaypointQueryError('WAYPOINT_INVALID_REORDER', '排序点位 id 不能重复')
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('mountain_waypoints')
    .select('id, mountain_id, type')
    .in('id', waypointIds)

  if (error) throw error

  const rows = (data ?? []) as Array<Pick<Waypoint, 'id' | 'mountain_id' | 'type'>>
  if (rows.length !== waypointIds.length) {
    throw createWaypointQueryError('WAYPOINT_INVALID_REORDER', '排序点位不存在或数量不匹配')
  }

  const mountainIds = new Set(rows.map((row) => row.mountain_id))
  const types = new Set(rows.map((row) => row.type))

  if (mountainIds.size !== 1 || types.size !== 1) {
    throw createWaypointQueryError('WAYPOINT_INVALID_REORDER', '只能对同一山峰同一类型的点位排序')
  }

  await Promise.all(
    waypointIds.map(async (id, index) => {
      const { error: updateError } = await supabase
        .from('mountain_waypoints')
        .update({ sort_order: index })
        .eq('id', id)

      if (updateError) throw updateError
    })
  )
}
