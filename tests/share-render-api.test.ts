import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sourceExtension = 'ts'

async function loadPolicy() {
  return import(`../src/lib/share-render-policy.${sourceExtension}`)
}

async function loadShareTemplateTypes() {
  return import(`../src/lib/share-templates/types.${sourceExtension}`)
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

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('share render API field policy regression', () => {
  test('registered share templates match the v0.4 ten-template pool', async () => {
    const {
      BASIC_SHARE_TEMPLATE_IDS,
      PREMIUM_SHARE_TEMPLATE_IDS,
      SHARE_RENDER_TEMPLATE_IDS,
    } = await loadShareTemplateTypes()

    assert.deepEqual([...BASIC_SHARE_TEMPLATE_IDS], ['base-classic', 'base-data'])
    assert.deepEqual([...PREMIUM_SHARE_TEMPLATE_IDS], [
      'premium-photo-composite',
      'premium-photo-overlay',
      'premium-bold-number',
      'premium-data-scatter',
      'premium-mono-film',
      'premium-altitude-profile',
      'premium-summit-certificate',
      'premium-vertical-story',
    ])
    assert.equal(SHARE_RENDER_TEMPLATE_IDS.length, 10)
    const registeredTemplates = [...SHARE_RENDER_TEMPLATE_IDS] as readonly string[]
    const removedBasicTemplate = ['base', 'minimal'].join('-')
    const removedPremiumTemplate = ['premium', 'split', 'view'].join('-')
    assert.equal(registeredTemplates.includes(removedBasicTemplate), false)
    assert.equal(registeredTemplates.includes(removedPremiumTemplate), false)
  })

  test('server render passes uploaded photos into summit certificate template', () => {
    const routeSource = readSource('../src/app/api/share/render/route.ts')

    assert.match(
      routeSource,
      /template === 'premium-summit-certificate'\) return PremiumSummitCertificateTemplate\(\{\s*data,\s*photoDataUrl\s*\}\)/,
    )
  })

  test('transparent watermark render follows selected template and ignores photo data', () => {
    const routeSource = readSource('../src/app/api/share/render/route.ts')
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')

    assert.match(
      routeSource,
      /TransparentWatermarkTemplate\(\{\s*data: payload\.data,\s*template: payload\.template,\s*\}\)/,
    )
    assert.doesNotMatch(transparentSource, /photoDataUrl/)
    assert.doesNotMatch(transparentSource, /PhotoLayer/)
    assert.doesNotMatch(transparentSource, /PhotoShade/)
    assert.doesNotMatch(transparentSource, /function WatermarkPhoto\(/)

    for (const template of [
      'base-data',
      'premium-photo-composite',
      'premium-photo-overlay',
      'premium-bold-number',
      'premium-data-scatter',
      'premium-mono-film',
      'premium-altitude-profile',
      'premium-summit-certificate',
      'premium-vertical-story',
    ]) {
      assert.match(transparentSource, new RegExp(`template === '${template}'`), `${template} should have a transparent watermark branch`)
    }
  })

  test('transparent render skips photo decoding', () => {
    const routeSource = readSource('../src/app/api/share/render/route.ts')

    assert.match(
      routeSource,
      /payload\.transparent\s*\?\s*null\s*:\s*photoDataUrlForTemplate\(payload\.template,\s*payload\.photoBase64\)/,
    )
  })

  test('premium mono-film template does not render trail', () => {
    const monoFilmSource = readSource('../src/lib/share-templates/premium-mono-film.tsx')

    assert.doesNotMatch(monoFilmSource, /buildShareTrackPath/)
    assert.doesNotMatch(monoFilmSource, /ShareTrackPreview/)
    assert.doesNotMatch(monoFilmSource, /MonoFilmTrailSvg/)
    assert.doesNotMatch(monoFilmSource, /trackPreview/)
    assert.doesNotMatch(monoFilmSource, /<TrailSvg/)
  })

  test('transparent watermark mono-film does not render trail', () => {
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')
    const monoBranch = transparentSource.match(/function WatermarkMonoFilm[\s\S]*?function WatermarkAltitudeProfile/)?.[0]

    assert.ok(monoBranch)
    assert.doesNotMatch(monoBranch, /TrailSvg/)
    assert.doesNotMatch(monoBranch, /MonoFilmTrailSvg/)
    assert.doesNotMatch(monoBranch, /trackPreview/)
    assert.doesNotMatch(monoBranch, /PhotoLayer/)
    assert.doesNotMatch(monoBranch, /photoDataUrl/)
  })

  test('mono-film thumbnail uses photo altitude layout instead of trail', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const advancedThumb = clientSource.match(/function AdvancedThumb[\s\S]*?function Tabs/)?.[0]
    const monoBranch = advancedThumb?.match(/template\.kind === 'mono-film'\s*\?\s*\([\s\S]*?\)\s*:\s*template\.kind === 'summit-certificate'/)?.[0]

    assert.ok(monoBranch)
    assert.match(monoBranch, /1265m/)
    assert.doesNotMatch(monoBranch, /M12 94 Q 26 72 40 76/)
  })

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
