export const WAYPOINT_TYPES = {
  viewpoint: { label: '观景点', icon: 'eye' },
  supply: { label: '补给点', icon: 'package' },
  turnaround: { label: '折返点', icon: 'corner-down-left' },
  campsite: { label: '营地', icon: 'tent' },
  danger: { label: '危险点', icon: 'alert-triangle' },
  transport: { label: '交通点', icon: 'car' },
} as const

export const WAYPOINT_TYPE_KEYS = [
  'viewpoint',
  'supply',
  'turnaround',
  'campsite',
  'danger',
  'transport',
] as const

export const MAX_WAYPOINTS_PER_TYPE = 10

export const WAYPOINT_COORDINATE_RANGES = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
} as const

export type WaypointType = (typeof WAYPOINT_TYPE_KEYS)[number]
export type WaypointCoordinateField = keyof typeof WAYPOINT_COORDINATE_RANGES

export type Waypoint = {
  id: string
  mountain_id: string
  type: WaypointType
  name: string
  description: string
  elevation: number | null
  latitude: number | null
  longitude: number | null
  sort_order: number
  created_at: string
}

export type WaypointInput = {
  type: WaypointType
  name: string
  description?: string
  elevation?: number | null
  latitude?: number | null
  longitude?: number | null
}

export function normalizeWaypointCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

export function isWaypointCoordinateInRange(
  field: WaypointCoordinateField,
  value: number | null
) {
  if (value === null) return true
  const range = WAYPOINT_COORDINATE_RANGES[field]
  return value >= range.min && value <= range.max
}

export function parseWaypointCoordinateInput(
  field: WaypointCoordinateField,
  value: unknown
): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) return undefined
  if (!isWaypointCoordinateInRange(field, normalized)) return undefined
  return normalized
}

export function parseWaypointCoordinatePatch(
  input: Partial<WaypointInput>,
  field: WaypointCoordinateField
): { ok: true; patch: Partial<Pick<WaypointInput, WaypointCoordinateField>> } | { ok: false } {
  if (!Object.prototype.hasOwnProperty.call(input, field)) return { ok: true, patch: {} }

  const coordinate = parseWaypointCoordinateInput(field, input[field])
  if (coordinate === undefined) return { ok: false }

  return { ok: true, patch: { [field]: coordinate } }
}
