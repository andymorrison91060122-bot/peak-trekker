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

export type WaypointType = (typeof WAYPOINT_TYPE_KEYS)[number]

export type Waypoint = {
  id: string
  mountain_id: string
  type: WaypointType
  name: string
  description: string
  elevation: number | null
  sort_order: number
  created_at: string
}

export type WaypointInput = {
  type: WaypointType
  name: string
  description?: string
  elevation?: number | null
}
