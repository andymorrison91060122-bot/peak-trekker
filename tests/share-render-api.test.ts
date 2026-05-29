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

  test('share previews do not contain hardcoded fallback trail paths', () => {
    const sharedSource = readSource('../src/lib/share-templates/shared.tsx')
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')

    assert.doesNotMatch(sharedSource, /DEFAULT_MINI_TRAIL_PATH|DEFAULT_POSTER_TRAIL_PATH/)
    assert.doesNotMatch(clientSource, /DEFAULT_PREVIEW_TRAIL_PATH/)
    assert.doesNotMatch(sharedSource, /route\?\.d\s*\?\?/)
    assert.doesNotMatch(clientSource, /route\?\.d\s*\?\?/)
  })

  test('premium mono-film template does not render trail', () => {
    const monoFilmSource = readSource('../src/lib/share-templates/premium-mono-film.tsx')

    assert.doesNotMatch(monoFilmSource, /buildShareTrackPath/)
    assert.doesNotMatch(monoFilmSource, /ShareTrackPreview/)
    assert.doesNotMatch(monoFilmSource, /MonoFilmTrailSvg/)
    assert.doesNotMatch(monoFilmSource, /trackPreview/)
    assert.doesNotMatch(monoFilmSource, /<TrailSvg/)
  })

  test('premium vertical story uses real track layer before ridge fallback', () => {
    const verticalStorySource = readSource('../src/lib/share-templates/premium-vertical-story.tsx')

    assert.match(verticalStorySource, /hasShareTrackPoint\(data\.trackPreview\)/)
    assert.match(verticalStorySource, /<VerticalStoryTrailSvg trackPreview=\{data\.trackPreview\} \/>/)
    assert.match(verticalStorySource, /<VerticalStoryRidgeSvg \/>/)
    assert.match(verticalStorySource, /data-testid="premium-vertical-story-trail"/)
    assert.match(verticalStorySource, /data-real-track="true"/)
    assert.match(
      verticalStorySource,
      /buildShareTrackPath\(trackPreview,\s*\{\s*x:\s*230,\s*y:\s*390,\s*width:\s*620,\s*height:\s*620,\s*padding:\s*56,\s*\}/,
    )
    assert.doesNotMatch(verticalStorySource, /\{!photoDataUrl \? <VerticalStoryRidgeSvg \/> : null\}/)
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
    const advancedThumb = clientSource.match(/function AdvancedThumb[\s\S]*?function ThumbnailRow/)?.[0]
    const monoBranch = advancedThumb?.match(/template\.kind === 'mono-film'\s*\?\s*\([\s\S]*?\)\s*:\s*template\.kind === 'summit-certificate'/)?.[0]

    assert.ok(monoBranch)
    assert.match(monoBranch, /1265m/)
    assert.doesNotMatch(monoBranch, /M12 94 Q 26 72 40 76/)
  })

  test('share editor removes path B disabled controls and renders one template row', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')

    assert.doesNotMatch(clientSource, /type ShareTab/)
    assert.doesNotMatch(clientSource, /data-testid="share-template-tabs"/)
    assert.doesNotMatch(clientSource, /function Tabs\(/)
    assert.doesNotMatch(clientSource, /activeTab/)
    assert.doesNotMatch(clientSource, /showMap|setShowMap|onToggleMap/)
    assert.doesNotMatch(clientSource, /MapIcon|InlineSwitch|MapLabel|PeakGlyph|HutGlyph/)
    assert.doesNotMatch(clientSource, /玉山北峰|3858m|圆峰山屋|塔塔加/)
    assert.doesNotMatch(clientSource, /MoreIcon|aria-label="更多"/)
    assert.match(clientSource, /SHARE_TEMPLATE_OPTIONS/)
    assert.match(clientSource, /gridTemplateColumns:\s*'1fr 1fr'/)
  })

  test('archive filter tabs use one selected style helper for every tab', () => {
    const archiveSource = readSource('../src/app/(flow)/archive/ArchiveClient.tsx')
    const filterTabsSource = archiveSource.match(/function FilterTabs[\s\S]*?function YearDivider/)?.[0]

    assert.ok(filterTabsSource)
    assert.match(filterTabsSource, /getArchiveTabStyle\(isActive\)/)
    assert.match(filterTabsSource, /getArchiveTabCountStyle\(isActive\)/)
    assert.doesNotMatch(filterTabsSource, /color-warning|tone === 'warn'|tab\.id === 'unproof'|tab\.id === 'proof'/)
  })

  test('server-side PNG renderer outputs real-track raster data and transparent alpha', async () => {
    const React = await import('react')
    const { renderSharePng } = await import('../src/lib/share-render-png.ts')
    const { buildShareTrackPreview, buildShareTrackPath } = await import('../src/lib/share-track-preview.ts')
    const sharp = (await import('sharp')).default
    const rawTrack = [
      { lat: 22.9678, lng: 113.3911, ele: 84 },
      { lat: 22.9712, lng: 113.3954, ele: 220 },
      { lat: 22.9756, lng: 113.4018, ele: 438 },
      { lat: 22.9798, lng: 113.4074, ele: 691 },
      { lat: 22.9841, lng: 113.4112, ele: 915 },
    ]
    const preview = buildShareTrackPreview(rawTrack)
    const route = buildShareTrackPath(preview, { x: 120, y: 240, width: 840, height: 980, padding: 72 })

    assert.ok(route)

    const element = React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          width: 1080,
          height: 1920,
          position: 'relative',
          background: 'transparent',
        },
      },
      React.createElement(
        'svg',
        { width: 1080, height: 1920, viewBox: '0 0 1080 1920', style: { position: 'absolute', inset: 0 } },
        React.createElement('path', {
          d: route.d,
          fill: 'none',
          stroke: '#6ee7a1',
          strokeWidth: 34,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      ),
    )

    const solidPng = await renderSharePng({ element, transparent: false })
    const solidMeta = await sharp(solidPng).metadata()
    assert.equal(solidMeta.width, 1080)
    assert.equal(solidMeta.height, 1920)

    const { data: solidPixels, info: solidInfo } = await sharp(solidPng).raw().toBuffer({ resolveWithObject: true })
    let greenPixelCount = 0
    for (let index = 0; index < solidPixels.length; index += solidInfo.channels) {
      const red = solidPixels[index] ?? 0
      const green = solidPixels[index + 1] ?? 0
      const blue = solidPixels[index + 2] ?? 0
      if (green > 180 && red > 70 && red < 150 && blue > 110 && blue < 190) greenPixelCount += 1
    }
    assert.ok(greenPixelCount > 500, `expected route accent pixels, found ${greenPixelCount}`)

    const transparentPng = await renderSharePng({ element, transparent: true })
    const transparentMeta = await sharp(transparentPng).metadata()
    assert.equal(transparentMeta.hasAlpha, true)

    const { data: transparentPixels, info: transparentInfo } = await sharp(transparentPng)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let transparentPixelCount = 0
    let opaquePixelCount = 0
    for (let index = 3; index < transparentPixels.length; index += transparentInfo.channels) {
      const alpha = transparentPixels[index] ?? 0
      if (alpha === 0) transparentPixelCount += 1
      if (alpha > 0) opaquePixelCount += 1
    }
    assert.ok(transparentPixelCount > 500, `expected transparent background pixels, found ${transparentPixelCount}`)
    assert.ok(opaquePixelCount > 500, `expected visible route pixels, found ${opaquePixelCount}`)
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
