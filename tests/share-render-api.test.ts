import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadPolicy() {
  return import(`../src/lib/share-render-policy.${sourceExtension}`)
}

function matchesPolicyError(
  error: unknown,
  errorClass: typeof import('../src/lib/share-render-policy.ts').ShareRenderPayloadPolicyError,
  {
    field,
    reason,
    message,
  }: {
    field?: string
    reason?: string
    message?: RegExp
  },
) {
  if (!(error instanceof errorClass)) return false
  if (field && error.field !== field) return false
  if (reason && error.reason !== reason) return false
  if (message && !message.test(error.message)) return false

  return true
}

describe('share render API field policy regression', () => {
  test('rejects request without checkinId', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    assert.throws(
      () => assertShareRenderPayload({ template: 'base-classic' }),
      (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
        reason: 'checkin_id_required',
        message: /checkinId required/i,
      }),
    )
  })

  test('rejects altitude override', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    assert.throws(
      () => assertShareRenderPayload({ template: 'base-classic', checkinId: 'fake-id', altitude: 9999 }),
      (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
        field: 'altitude',
        message: /altitude.*cannot be overridden/i,
      }),
    )
  })

  test('rejects distance/duration/elevationGain override individually', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    for (const field of ['distance', 'duration', 'elevationGain']) {
      assert.throws(
        () => assertShareRenderPayload({ template: 'base-classic', checkinId: 'fake-id', [field]: 9999 }),
        (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
          field,
          message: new RegExp(`${field}.*cannot be overridden`, 'i'),
        }),
        `${field} should be rejected`,
      )
    }
  })

  test('rejects legacy data payload', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    assert.throws(
      () => assertShareRenderPayload({ template: 'base-classic', checkinId: 'fake-id', data: { altitude: 9999 } }),
      (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
        field: 'data',
        message: /data cannot be supplied|render data cannot be supplied/i,
      }),
    )
  })

  test('rejects DB alias field names as defense in depth', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    for (const field of [
      'altitude_m',
      'distance_m',
      'duration_seconds',
      'elevation_gain_meters',
      'max_altitude',
      'max_altitude_m',
      'max_elevation_meters',
    ]) {
      assert.throws(
        () => assertShareRenderPayload({ template: 'base-classic', checkinId: 'fake-id', [field]: 9999 }),
        (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
          field,
          message: /cannot be overridden/i,
        }),
        `${field} alias should be rejected`,
      )
    }
  })

  test('rejects client-supplied track shapes and route paths', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    for (const field of ['track', 'trackPoints', 'track_points', 'trackPreview', 'routePath']) {
      assert.throws(
        () => assertShareRenderPayload({ template: 'base-classic', checkinId: 'fake-id', [field]: [] }),
        (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
          field,
          message: /cannot be overridden/i,
        }),
        `${field} should be rejected`,
      )
    }
  })

  test('rejects visibility attempts for locked altitude and distance fields', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    for (const field of ['altitude', 'distance']) {
      assert.throws(
        () =>
          assertShareRenderPayload({
            template: 'base-classic',
            checkinId: 'fake-id',
            fieldVisibility: { [field]: false },
          }),
        (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
          field: `fieldVisibility.${field}`,
          message: /cannot be overridden/i,
        }),
        `fieldVisibility.${field} should be rejected`,
      )
    }
  })

  test('allows checkinId with optional non-locked display visibility fields', async () => {
    const { assertShareRenderPayload } = await loadPolicy()

    assert.doesNotThrow(() => {
      assertShareRenderPayload({
        template: 'base-classic',
        checkinId: 'fake-id',
        fieldVisibility: {
          duration: false,
          elevationGain: true,
          date: false,
          location: true,
          pace: false,
          mountainName: true,
        },
      })
    })
  })
})
