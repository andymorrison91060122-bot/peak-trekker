export const LOCKED_NUMERIC_FIELDS = [
  'altitude',
  'max_altitude',
  'distance',
  'elevation_gain',
  'duration',
  'max_elevation_meters',
  'distance_meters',
  'elevation_gain_meters',
  'duration_seconds',
  'max_altitude_m',
  'distance_m',
  'ascent_m',
] as const

export const IMMUTABLE_FIELDS = [
  'source_type',
  'source',
  'type',
  'user_id',
  'created_at',
  'session_id',
] as const

export const EDITABLE_FIELDS = [
  'mountain_id',
  'summit_date',
  'start_time',
  'note',
  'visibility',
  'photo_url',
  'poster_template',
  'poster_url',
] as const

export type ActivityFieldPolicyReason = 'locked_numeric' | 'immutable' | 'not_allowed'

export class ActivityFieldPolicyError extends Error {
  field: string
  reason: ActivityFieldPolicyReason
  status = 400

  constructor(field: string, reason: ActivityFieldPolicyReason) {
    super(activityFieldPolicyMessage(field, reason))
    this.name = 'ActivityFieldPolicyError'
    this.field = field
    this.reason = reason
  }
}

type ActivityUpdatePolicyOptions = {
  ignoredFields?: readonly string[]
  allowedFields?: readonly string[]
}

const lockedNumericFieldSet = new Set<string>(LOCKED_NUMERIC_FIELDS)
const immutableFieldSet = new Set<string>(IMMUTABLE_FIELDS)

function activityFieldPolicyMessage(field: string, reason: ActivityFieldPolicyReason) {
  if (reason === 'immutable') {
    return `Field "${field}" is immutable and cannot be modified.`
  }

  if (reason === 'locked_numeric') {
    return `Field "${field}" is locked. System-recorded values cannot be edited.`
  }

  return `Field "${field}" is not allowed in this update.`
}

export function assertActivityUpdatePolicy(
  updates: Record<string, unknown>,
  options: ActivityUpdatePolicyOptions = {}
): void {
  const ignoredFields = new Set(options.ignoredFields ?? [])
  const allowedFields = options.allowedFields ? new Set(options.allowedFields) : null

  for (const field of Object.keys(updates)) {
    if (ignoredFields.has(field)) continue

    if (immutableFieldSet.has(field)) {
      throw new ActivityFieldPolicyError(field, 'immutable')
    }

    if (lockedNumericFieldSet.has(field)) {
      throw new ActivityFieldPolicyError(field, 'locked_numeric')
    }

    if (allowedFields && !allowedFields.has(field)) {
      throw new ActivityFieldPolicyError(field, 'not_allowed')
    }
  }
}
