import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadPolicy() {
  return import(`../src/lib/activity-field-policy.${sourceExtension}`)
}

function matchesPolicyError(
  error: unknown,
  errorClass: typeof import('../src/lib/activity-field-policy.ts').ActivityFieldPolicyError,
  field: string,
  reason: string
) {
  if (!(error instanceof errorClass)) return false

  return error.field === field && error.reason === reason
}

test('activity field policy rejects locked numeric field aliases', async (t) => {
  const { ActivityFieldPolicyError, LOCKED_NUMERIC_FIELDS, assertActivityUpdatePolicy } = await loadPolicy()

  for (const field of LOCKED_NUMERIC_FIELDS) {
    await t.test(field, () => {
      assert.throws(
        () => assertActivityUpdatePolicy({ [field]: 9999 }),
        (error) => matchesPolicyError(error, ActivityFieldPolicyError, field, 'locked_numeric')
      )
    })
  }
})

test('activity field policy rejects immutable trust-root fields', async (t) => {
  const { ActivityFieldPolicyError, IMMUTABLE_FIELDS, assertActivityUpdatePolicy } = await loadPolicy()

  for (const field of IMMUTABLE_FIELDS) {
    await t.test(field, () => {
      assert.throws(
        () => assertActivityUpdatePolicy({ [field]: 'GPS_VERIFIED' }),
        (error) => matchesPolicyError(error, ActivityFieldPolicyError, field, 'immutable')
      )
    })
  }
})

test('activity field policy allows known editable fields', async (t) => {
  const { assertActivityUpdatePolicy } = await loadPolicy()
  const allowedValues = {
    note: '今天风很大。',
    photo_url: 'https://example.com/checkin.jpg',
    poster_template: 'summit_card',
    poster_url: '/api/poster?checkinId=1',
    mountain_id: 'mountain-1',
    start_time: '2026-05-11T08:00:00.000Z',
    summit_date: '2026-05-11',
    visibility: 'private',
  }

  for (const [field, value] of Object.entries(allowedValues)) {
    await t.test(field, () => {
      assert.doesNotThrow(() => assertActivityUpdatePolicy({ [field]: value }))
    })
  }
})

test('activity field policy does not let admin bypass locked trust fields', async () => {
  const { ActivityFieldPolicyError, assertActivityUpdatePolicy } = await loadPolicy()

  assert.throws(
    () => assertActivityUpdatePolicy({ distance_meters: 9999 }, { allowedFields: ['status'], ignoredFields: ['id'] }),
    (error) => matchesPolicyError(error, ActivityFieldPolicyError, 'distance_meters', 'locked_numeric')
  )

  assert.throws(
    () => assertActivityUpdatePolicy({ source: 'realtime_gps' }, { allowedFields: ['status'] }),
    (error) => matchesPolicyError(error, ActivityFieldPolicyError, 'source', 'immutable')
  )
})

test('activity field policy rejects fields outside a narrow update allowlist', async () => {
  const { ActivityFieldPolicyError, assertActivityUpdatePolicy } = await loadPolicy()

  assert.throws(
    () => assertActivityUpdatePolicy({ note: 'ok', arbitrary_field: true }, { allowedFields: ['note'] }),
    (error) => matchesPolicyError(error, ActivityFieldPolicyError, 'arbitrary_field', 'not_allowed')
  )
})
