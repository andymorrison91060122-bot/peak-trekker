export const SHARE_RENDER_REJECTED_FIELDS = [
  'altitude',
  'distance',
  'duration',
  'elevationGain',
  'altitude_m',
  'distance_m',
  'duration_seconds',
  'elevation_gain_meters',
  'max_altitude',
  'max_altitude_m',
  'max_elevation_meters',
  'title',
  'mountainName',
  'mountain_name',
  'trackName',
  'track_name',
  'track',
  'trackPoints',
  'track_points',
  'trackPreview',
  'routePath',
  'routeShape',
  'screenshot_route_shape',
  'data',
] as const

export type ShareRenderPayloadPolicyReason =
  | 'metric_override'
  | 'legacy_data'
  | 'checkin_id_required'

export class ShareRenderPayloadPolicyError extends Error {
  reason: ShareRenderPayloadPolicyReason
  field?: string
  hint?: string

  constructor(
    message: string,
    reason: ShareRenderPayloadPolicyReason,
    field?: string,
    hint?: string,
  ) {
    super(message)
    this.name = 'ShareRenderPayloadPolicyError'
    this.reason = reason
    this.field = field
    this.hint = hint
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function metricOverrideError(field: string) {
  return new ShareRenderPayloadPolicyError(
    `Field "${field}" cannot be overridden; values are read from server-side records`,
    'metric_override',
    field,
    'Use checkinId to identify the activity; metrics come from the database.',
  )
}

export function assertShareRenderPayload(
  body: Record<string, unknown>,
): asserts body is Record<string, unknown> & { checkinId: string } {
  for (const field of SHARE_RENDER_REJECTED_FIELDS) {
    if (!(field in body)) continue

    if (field === 'data') {
      throw new ShareRenderPayloadPolicyError(
        'Client-side render data cannot be supplied; values are read from server-side records',
        'legacy_data',
        field,
        'Use checkinId and fieldVisibility; metrics come from the database.',
      )
    }

    throw metricOverrideError(field)
  }

  const rawFieldVisibility = isObject(body.fieldVisibility) ? body.fieldVisibility : {}
  if ('altitude' in rawFieldVisibility) throw metricOverrideError('fieldVisibility.altitude')
  if ('distance' in rawFieldVisibility) throw metricOverrideError('fieldVisibility.distance')

  if (typeof body.checkinId !== 'string' || !body.checkinId.trim()) {
    throw new ShareRenderPayloadPolicyError('checkinId required', 'checkin_id_required', 'checkinId')
  }
}
