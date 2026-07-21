import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

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

function loadPhotoPreprocessor() {
  const routePath = new URL('../src/app/api/share/render/route.ts', import.meta.url)
  const source = readFileSync(routePath, 'utf8')
  const sourceFile = ts.createSourceFile(routePath.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'photoDataUrlForTemplate',
  )
  assert.ok(declaration, 'photoDataUrlForTemplate must remain extractable from the production route')
  const printed = ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, sourceFile)
  const compiled = ts.transpileModule(`${printed}\nmodule.exports = { photoDataUrlForTemplate }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const runtimeModule = {
    exports: {} as {
      photoDataUrlForTemplate: (template: string, photoBase64?: string) => Promise<string | null>
    },
  }
  return { runtimeModule, compiled }
}

async function measureChannelDelta(
  image: Buffer | Uint8Array,
  crop: { left: number; top: number; width: number; height: number },
) {
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(image).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  let max = 0
  let count = 0
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index] ?? 0
    const green = data[index + 1] ?? 0
    const blue = data[index + 2] ?? 0
    const delta = Math.max(red, green, blue) - Math.min(red, green, blue)
    sum += delta
    max = Math.max(max, delta)
    count += 1
  }
  return { mean: sum / Math.max(1, count), max }
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

  test('server render delegates template selection to the shared pure registry', () => {
    const routeSource = readSource('../src/app/api/share/render/route.ts')
    const registrySource = readSource('../src/lib/share-templates/registry.tsx')

    assert.match(routeSource, /import \{ getShareTemplateComponent \} from '@\/lib\/share-templates\/registry'/)
    assert.match(routeSource, /const Template = getShareTemplateComponent\(template\)/)
    assert.match(routeSource, /return Template\(\{\s*data,\s*photoDataUrl\s*\}\)/)
    assert.match(registrySource, /id: 'premium-summit-certificate'[\s\S]*Component: PremiumSummitCertificateTemplate/)
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

  test('share altitude hero is measured-only and relabeled', () => {
    const sharePageSource = readSource('../src/app/(flow)/share/page.tsx')
    const renderRouteSource = readSource('../src/app/api/share/render/route.ts')
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const fontSource = readSource('../src/lib/fonts/load-share-fonts.ts')
    const serverTemplateSources = [
      '../src/lib/share-templates/base-classic.tsx',
      '../src/lib/share-templates/base-data.tsx',
      '../src/lib/share-templates/premium-photo-composite.tsx',
      '../src/lib/share-templates/premium-photo-overlay.tsx',
      '../src/lib/share-templates/premium-bold-number.tsx',
      '../src/lib/share-templates/premium-data-scatter.tsx',
      '../src/lib/share-templates/premium-mono-film.tsx',
      '../src/lib/share-templates/premium-altitude-profile.tsx',
      '../src/lib/share-templates/premium-summit-certificate.tsx',
      '../src/lib/share-templates/premium-vertical-story.tsx',
      '../src/lib/share-templates/transparent-watermark.tsx',
    ].map(readSource)

    assert.match(sharePageSource, /resolveMeasuredShareAltitude\(row\.max_elevation_meters,\s*session\?\.max_altitude_m\)/)
    assert.match(renderRouteSource, /resolveMeasuredShareAltitude\(row\.max_elevation_meters,\s*session\?\.max_altitude_m\)/)
    assert.doesNotMatch(sharePageSource, /mountain\?\.altitude|mountain\.altitude/)
    assert.doesNotMatch(renderRouteSource, /mountain\?\.altitude|mountain\.altitude/)

    for (const source of [clientSource, renderRouteSource, fontSource, ...serverTemplateSources]) {
      assert.doesNotMatch(source, /峰顶海拔/)
    }
    assert.match(clientSource, /最高海拔/)
    assert.match(renderRouteSource, /最高海拔/)
    assert.match(fontSource, /最高海拔/)

    for (const source of serverTemplateSources) {
      assert.match(source, /hasShareAltitude\(data\)/)
      assert.doesNotMatch(source, /formatPlainNumber\(data\.altitude\)/)
    }
    assert.match(clientSource, /hasShareAltitude\(data\)/)
    assert.match(clientSource, /formatShareAltitude\(data\)/)
  })

  test('/api/poster altitude source labels and coordinate text align with share semantics', () => {
    const posterSource = readSource('../src/app/api/poster/route.ts')

    assert.match(posterSource, /resolveMeasuredShareAltitude\(checkin\.max_elevation_meters,\s*session\?\.max_altitude_m\)/)
    assert.doesNotMatch(posterSource, /mountain\?\.altitude|mountain\.altitude/)
    assert.doesNotMatch(posterSource, /峰顶海拔/)
    assert.doesNotMatch(posterSource, /MOUNTAIN VERIFIED STORY/)
    assert.doesNotMatch(posterSource, /formatShortCoordinates|footerCoordinates|formatCoordinate/)
    assert.match(posterSource, /headlineLabel:\s*altitudeLabel\s*\?\s*'最高海拔'\s*:\s*undefined/)
    assert.match(posterSource, /value === 'none' \|\| value === 'null' \|\| value === 'absent'/)

    assert.match(posterSource, /source === 'realtime_gps'/)
    assert.match(posterSource, /source === 'historical_photo'/)
    assert.match(posterSource, /model\.source === 'track_import' \|\| isScreenshotRecognitionSource\(model\.source\)/)
    assert.match(posterSource, /'GPS VERIFIED'/)
    assert.match(posterSource, /'PHOTO RECORD'/)
    assert.match(posterSource, /'UPLOADED'/)
  })

  test('/api/poster keeps altitude-derived metrics demo-only', () => {
    const posterSource = readSource('../src/app/api/poster/route.ts')
    const realCheckinModelBlock = posterSource.match(/const measuredAltitude[\s\S]*?const coverImageHref/)?.[0] ?? ''

    assert.match(posterSource, /function deriveDemoMetrics\(/)
    assert.match(posterSource, /if \(model\.isDemo\) {\s*return deriveDemoMetrics\(model\.altitude \?\? 6250, model\.metricOverrides\)/)
    assert.match(posterSource, /metrics:\s*\{\s*distanceKm:\s*typeof distanceMeters === 'number' \? distanceMeters \/ 1000 : undefined,/)
    assert.doesNotMatch(realCheckinModelBlock, /deriveDemoMetrics|altitude \/ 260/)
  })

  test('premium mono-film template does not render trail', () => {
    const monoFilmSource = readSource('../src/lib/share-templates/premium-mono-film.tsx')

    assert.doesNotMatch(monoFilmSource, /buildShareTrackPath/)
    assert.doesNotMatch(monoFilmSource, /ShareTrackPreview/)
    assert.doesNotMatch(monoFilmSource, /MonoFilmTrailSvg/)
    assert.doesNotMatch(monoFilmSource, /trackPreview/)
    assert.doesNotMatch(monoFilmSource, /<TrailSvg/)
  })

  test('premium mono-film export preprocesses photos to grayscale while the browser preview stays grayscale', () => {
    const routeSource = readSource('../src/app/api/share/render/route.ts')
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const monoFilmSource = readSource('../src/lib/share-templates/premium-mono-film.tsx')
    const photoPreprocess = routeSource.match(/async function photoDataUrlForTemplate[\s\S]*?\n}\n\nfunction renderTemplate/)?.[0] ?? ''

    assert.ok(photoPreprocess)
    assert.match(photoPreprocess, /template !== 'premium-vertical-story' && template !== 'premium-mono-film'/)
    assert.match(photoPreprocess, /sharp\(Buffer\.from\(photoBase64, 'base64'\)\)[\s\S]*\.grayscale\(\)/)
    assert.match(clientSource, /const monoFilm = template === 'premium-mono-film'/)
    assert.match(clientSource, /if \(monoFilm\)[\s\S]*<PreviewPhotoBackground photoDataUrl=\{photoDataUrl\} grayscale>/)
    assert.match(clientSource, /filter: grayscale \? 'grayscale\(1\)' : 'none'/)
    assert.match(monoFilmSource, /<PhotoLayer photoDataUrl=\{photoDataUrl\} width=\{1080\} height=\{900\} grayscale \/>/)
  })

  test('premium mono-film production preprocessor survives an actual DB-free Satori PNG render as grayscale', async () => {
    const React = await import('react')
    const sharp = (await import('sharp')).default
    const { renderSharePng } = await import('../src/lib/share-render-png.ts')
    const { runtimeModule, compiled } = loadPhotoPreprocessor()
    new Function('module', 'exports', 'sharp', 'Buffer', compiled)(runtimeModule, runtimeModule.exports, sharp, Buffer)

    const blueHalf = await sharp({
      create: { width: 540, height: 900, channels: 3, background: { r: 22, g: 118, b: 245 } },
    }).png().toBuffer()
    const colorPhoto = await sharp({
      create: { width: 1080, height: 900, channels: 3, background: { r: 232, g: 42, b: 76 } },
    }).composite([{ input: blueHalf, left: 540, top: 0 }]).png().toBuffer()
    const rawPhotoDataUrl = `data:image/png;base64,${colorPhoto.toString('base64')}`
    const processedPhotoDataUrl = await runtimeModule.exports.photoDataUrlForTemplate(
      'premium-mono-film',
      colorPhoto.toString('base64'),
    )
    assert.match(processedPhotoDataUrl ?? '', /^data:image\/jpeg;base64,/)

    const renderPhoto = (photoDataUrl: string) => React.createElement(
      'div',
      { style: { display: 'flex', position: 'relative', width: 1080, height: 1920, background: '#0a0c0e' } },
      React.createElement('img', {
        src: photoDataUrl,
        width: 1080,
        height: 900,
        alt: '',
        style: { position: 'absolute', left: 0, top: 0, width: 1080, height: 900, objectFit: 'cover' },
      }),
    )
    const baselinePng = await renderSharePng({ element: renderPhoto(rawPhotoDataUrl) })
    const fixedPng = await renderSharePng({ element: renderPhoto(processedPhotoDataUrl!) })
    const crop = { left: 300, top: 180, width: 480, height: 260 }
    const beforeDelta = await measureChannelDelta(baselinePng, crop)
    const afterDelta = await measureChannelDelta(fixedPng, crop)
    assert.ok(beforeDelta.mean > 40, `baseline photo should retain color, mean delta=${beforeDelta.mean}`)
    assert.ok(afterDelta.mean < 2, `fixed photo should be grayscale, mean delta=${afterDelta.mean}`)

    const outputDir = join(process.cwd(), 'output', 'p3-cleanup-acceptance')
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(join(outputDir, 'mono-film-export-before-color.png'), baselinePng)
    writeFileSync(join(outputDir, 'mono-film-export-after-grayscale.png'), fixedPng)
    writeFileSync(join(outputDir, 'fu106-satori-pixel-metrics.json'), `${JSON.stringify({
      baselinePhotoRegionChannelDelta: beforeDelta,
      fixedPhotoRegionChannelDelta: afterDelta,
      evidenceBoundary: 'production photoDataUrlForTemplate extracted from route.ts and rendered by the actual DB-free Satori PNG pipeline',
    }, null, 2)}\n`)
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
      /buildShareTrackRender\(trackPreview,\s*\{\s*x:\s*230,\s*y:\s*390,\s*width:\s*620,\s*height:\s*620,\s*padding:\s*74,[\s\S]*?\.\.\.SHARE_TRACK_CONTENT_FIT/,
    )
    assert.match(verticalStorySource, /strokeWidth=\{route\.glowWidth\}/)
    assert.match(verticalStorySource, /vectorEffect="non-scaling-stroke"/)
    assert.doesNotMatch(verticalStorySource, /\{!photoDataUrl \? <VerticalStoryRidgeSvg \/> : null\}/)
  })

  test('share editor and poster templates use the shared route render pipeline', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const sharedTemplateSource = readSource('../src/lib/share-templates/shared.tsx')

    assert.match(clientSource, /trackPreview:\s*buildShareTrackPreview\(SHARE_PREVIEW_MOCK_TRACK_POINTS\)/)
    assert.match(clientSource, /mountainName: '玉山主峰'/)
    assert.match(clientSource, /location: '台湾'/)
    assert.match(clientSource, /altitude: 3952/)
    assert.match(clientSource, /elevationGain: 1350/)
    assert.match(clientSource, /altitude: 2602[\s\S]*altitude: 3952/)
    assert.match(clientSource, /buildShareTrackRender\(trackPreview/)
    assert.doesNotMatch(clientSource, /buildShareTrackPath/)
    assert.match(clientSource, /data-role="draw" d="M26 222 C 58 190/)
    assert.match(sharedTemplateSource, /buildShareTrackRender\(trackPreview/)
    assert.doesNotMatch(sharedTemplateSource, /filter id="poster-trail-glow"|filter id="share-trail-glow"/)
    assert.match(sharedTemplateSource, /vectorEffect="non-scaling-stroke"/)
  })

  test('share editor entrance motion registers normal and reduced motion branches', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const entranceBlock = clientSource.match(/useGSAP\(\(\) => \{[\s\S]*?mm\.revert\(\)[\s\S]*?\}, \{ scope: rootRef \}\)/)?.[0]
    const relightBlock = clientSource.match(/function buildPosterRelightTimeline\(root: HTMLElement\) \{[\s\S]*?function getExportMotionTargets/)?.[0]
    const playPosterRelightBlock = clientSource.match(/function playPosterRelight\(animate: boolean\) \{[\s\S]*?function safeSetExportingAction/)?.[0]

    assert.ok(entranceBlock)
    assert.ok(relightBlock)
    assert.ok(playPosterRelightBlock)
    assert.match(clientSource, /data-motion-pending="true"/)
    assert.match(clientSource, /\.share-editor-root\[data-motion-pending="true"\] \[data-stage\]/)
    assert.match(clientSource, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(clientSource, /<noscript>/)
    assert.match(clientSource, /function clearShareMotionPending/)
    assert.match(clientSource, /function preparePosterMotionInitialState/)
    assert.match(entranceBlock, /allowMotion:\s*'\(prefers-reduced-motion: no-preference\)'/)
    assert.match(entranceBlock, /reduceMotion:\s*'\(prefers-reduced-motion: reduce\)'/)
    assert.match(entranceBlock, /if \(reduceMotion \|\| !allowMotion\)/)
    assert.match(entranceBlock, /if \(reduceMotion \|\| !allowMotion\)[\s\S]*?playPosterRelight\(false\)[\s\S]*?return/)
    assert.doesNotMatch(entranceBlock.match(/if \(reduceMotion \|\| !allowMotion\)[\s\S]*?return/)?.[0] ?? '', /preparePosterMotionInitialState/)
    assert.match(entranceBlock, /gsap\.set\(stages,[\s\S]*?preparePosterMotionInitialState\(root\)[\s\S]*?clearShareMotionPending\(root\)/)
    assert.match(entranceBlock, /clearShareMotionPending\(root\)/)
    assert.match(entranceBlock, /SHARE_STAGE_ORDER/)
    assert.match(entranceBlock, /stagger:\s*0\.08/)
    assert.match(playPosterRelightBlock, /preparePosterMotionInitialState\(root\)[\s\S]*?buildPosterRelightTimeline\(root\)/)
    assert.doesNotMatch(relightBlock, /strokeDasharray:\s*length/)
    assert.doesNotMatch(relightBlock, /strokeDashoffset:\s*length/)
    assert.doesNotMatch(relightBlock, /getTotalLength\(\)/)
  })

  test('share editor altitude profile preview does not add a profile-only TIME DATE column', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const premiumPreview = clientSource.match(/function PremiumHeroPreview[\s\S]*?function HeroPreview/)?.[0]

    assert.ok(premiumPreview)
    assert.doesNotMatch(premiumPreview, /profile \? \(\s*<div style=\{\{ position: 'absolute', right: 16, bottom: 112/)
    assert.doesNotMatch(premiumPreview, /label="TIME" value=\{formatDuration\(data\.duration\)\} align="right"/)
    assert.doesNotMatch(premiumPreview, /label="DATE" value=\{data\.date\} align="right"/)
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

  test('share editor thumbnails use real registry templates inside scaled poster previews', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const posterPreview = clientSource.match(/function TemplatePosterPreview[\s\S]*?function TemplateThumb/)?.[0]
    const thumbnailRow = clientSource.match(/function ThumbnailRow[\s\S]*?function TrashIcon/)?.[0]

    assert.ok(posterPreview)
    assert.match(posterPreview, /getShareTemplateComponent\(template\)/)
    assert.match(posterPreview, /POSTER_WIDTH/)
    assert.match(posterPreview, /POSTER_HEIGHT/)
    assert.match(posterPreview, /transform: `scale\(\$\{scale\}\)`/)
    assert.match(posterPreview, /textAlign: 'left'/)
    assert.doesNotMatch(posterPreview, /1265m|M12 94 Q 26 72 40 76/)

    assert.ok(thumbnailRow)
    assert.match(thumbnailRow, /data-testid="share-template-progress"/)
    assert.match(thumbnailRow, /共 10 款/)
    assert.match(thumbnailRow, /scrollPaddingInline: 16/)
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
    assert.match(clientSource, /data-testid="share-template-strip"/)
    assert.match(clientSource, /data-testid="share-locked-field-strip"/)
    assert.match(clientSource, /flex: 1\.25/)
    assert.match(clientSource, /NavBarTitle title="导出透明水印"/)
  })

  test('share editor locked fields and optional chips expose missing values honestly', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const fieldSelector = clientSource.match(/function FieldSelector[\s\S]*?function ActionBar/)?.[0]
    const fieldChip = clientSource.match(/function FieldChip[\s\S]*?function FieldSelector/)?.[0]

    assert.ok(fieldSelector)
    assert.match(clientSource, /function formatDisplayValue[\s\S]*return value === '--' \? '未记录' : value/)
    assert.match(fieldSelector, /海拔 <span[\s\S]*formatDisplayValue\('altitude', data\)/)
    assert.match(fieldSelector, /距离 <span[\s\S]*formatDisplayValue\('distance', data\)/)
    assert.match(fieldSelector, /const selectableFields = FIELD_CONFIGS\.filter\(\(field\) => !field\.locked\)/)

    assert.ok(fieldChip)
    assert.match(fieldChip, /const missing = isFieldMissing\(field\.key, data\)/)
    assert.match(fieldChip, /const value = missing \? '未记录' : formatFieldValue\(field\.key, data\)/)
    assert.match(fieldChip, /const unavailable = missing \|\| disabled/)
    assert.match(fieldChip, /disabled=\{unavailable\}/)
    assert.match(fieldChip, /pointerEvents: unavailable \? 'none' : 'auto'/)
    assert.match(fieldChip, /cursor: missing \? 'not-allowed' : disabled \? 'wait' : 'pointer'/)
  })

  test('share editor export pipeline snapshots payload and freezes editing during generation', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')

    assert.match(clientSource, /type ExportSnapshot = \{[\s\S]*template: TemplateId[\s\S]*fieldToggles: Record<ShareFieldKey, boolean>[\s\S]*photoDataUrl: string \| null[\s\S]*transparent: boolean/)
    assert.match(clientSource, /function createExportSnapshot\(action: ActiveExportAction, transparent: boolean\): ExportSnapshot/)
    assert.match(clientSource, /fieldToggles: \{ \.\.\.fieldToggles \}/)
    assert.match(clientSource, /async function renderPosterBlob\(snapshot: ExportSnapshot\)/)
    assert.match(clientSource, /template: snapshot\.template/)
    assert.match(clientSource, /duration: snapshot\.fieldToggles\.duration/)
    assert.match(clientSource, /photoBase64: stripDataUrlPrefix\(snapshot\.photoDataUrl\)/)
    assert.match(clientSource, /transparent: snapshot\.transparent/)
    assert.match(clientSource, /exportInFlightRef\.current = true/)
    assert.match(clientSource, /if \(exportFrozen \|\| exportInFlightRef\.current\) return/)
    assert.match(clientSource, /disabled=\{disabled\}/)
    assert.match(clientSource, /disabled=\{disabled \|\| transparentExporting\}/)
    assert.match(clientSource, /disabled=\{unavailable\}/)
    assert.match(clientSource, /data-export-dim="true"/)
  })

  test('share editor export ceremony distinguishes save, native share, fallback, abort, and failure semantics', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')

    assert.match(clientSource, /function buildGeneratingTimeline\(root: HTMLElement\)/)
    assert.match(clientSource, /repeat: -1/)
    assert.match(clientSource, /duration: 1\.6/)
    assert.match(clientSource, /yPercent: -150/)
    assert.match(clientSource, /yPercent: 300/)
    assert.doesNotMatch(clientSource, /xPercent: 130/)
    assert.match(clientSource, /linear-gradient\(180deg, transparent 0%, rgba\(255,255,255,\.07\) 38%, rgba\(110,231,161,\.13\) 52%, rgba\(255,255,255,\.05\) 66%, transparent 100%\)/)
    assert.match(clientSource, /height: 46%/)
    assert.match(clientSource, /waitForMinimumExportDuration\(720\)/)
    assert.match(clientSource, /Promise\.all\(\[\s*renderPosterBlob\(snapshot\),\s*waitForMinimumExportDuration\(720\),\s*\]\)/)
    assert.match(clientSource, /const SHARE_POSTER_BASE_WIDTH = 246/)
    assert.match(clientSource, /const DEFAULT_SHARE_POSTER_SCALE = 232 \/ SHARE_POSTER_BASE_WIDTH/)
    assert.match(clientSource, /function syncSharePosterScale\(shell: HTMLElement\)[\s\S]*shell\.style\.setProperty\('--share-poster-scale'/)
    assert.match(clientSource, /useLayoutEffect\(\(\) => \{[\s\S]*new ResizeObserver/)
    assert.match(clientSource, /transform: 'scale\(var\(--share-poster-scale, 0\.9430894309\)\)'/)
    assert.match(clientSource, /transformOrigin: 'top left'/)
    assert.match(clientSource, /data-testid="share-poster-scale-layer"/)
    assert.match(clientSource, /const heroPreviewInnerCardStyle: CSSProperties = \{[\s\S]*width: SHARE_POSTER_BASE_WIDTH/)
    assert.doesNotMatch(clientSource, /width: 'min\(65vw, 246px\)'/)
    assert.match(clientSource, /innerCard: root\.querySelector<HTMLElement>\('\[data-testid="share-poster-inner-card"\]'\)/)
    assert.match(clientSource, /data-testid="share-poster-inner-card"/)
    assert.match(clientSource, /data-testid="share-export-sweep-clip"/)
    assert.match(clientSource, /\.share-export-sweep-clip \{[\s\S]*?inset: 0;[\s\S]*?overflow: hidden;/)
    assert.match(clientSource, /border-radius: inherit/)
    assert.match(clientSource, /function buildSuccessTimeline\(root: HTMLElement, targetButton: HTMLElement \| null\)/)
    assert.match(clientSource, /function playSaveSuccess\(action: Exclude<ExportSuccessAction, null>\)[\s\S]*if \(root\) setPosterMotionTerminal\(root\)/)
    assert.match(clientSource, /strokeDashoffset: 0,[\s\S]*duration: 1\.45,[\s\S]*stagger: 0\.08/)
    assert.match(clientSource, /gsap\.set\(targets\.rim, \{ scale: 1, willChange: 'opacity' \}\)/)
    assert.doesNotMatch(clientSource, /fromTo\(targets\.rim, \{ autoAlpha: 0, scale:/)
    assert.match(clientSource, /const ghostSource = targets\.innerCard \?\? targets\.poster/)
    assert.match(clientSource, /autoAlpha: 0\.82/)
    assert.match(clientSource, /0 0 44px 6px rgba\(110,231,161,\.56\)/)
    assert.match(clientSource, /playSaveSuccess\('save'\)/)
    assert.match(clientSource, /playSaveSuccess\('share-fallback'\)/)
    assert.match(clientSource, /playSaveSuccess\('transparent-save'\)/)
    assert.match(clientSource, /playNativeShareSettle\(\)/)
    assert.match(clientSource, /error instanceof Error && error\.name === 'AbortError'[\s\S]*finishExportIdle\(\)/)
    assert.match(clientSource, /failExport\(error, '分享图生成失败，请稍后再试'\)/)
    assert.match(clientSource, /failExport\(error, '透明水印保存失败，请稍后再试'\)/)
    assert.match(clientSource, /data-testid="share-save-toast"/)
    assert.match(clientSource, /已保存到相册/)
  })

  test('share editor watermark back clears motion pending instead of remounting hidden stages', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')

    assert.match(clientSource, /const \[motionPending, setMotionPending\] = useState\(true\)/)
    assert.match(clientSource, /function handleWatermarkPreviewBack\(\) \{[\s\S]*cleanupExportTimeline\(\)[\s\S]*setMotionPending\(false\)[\s\S]*setViewMode\('editor'\)/)
    assert.match(clientSource, /data-motion-pending=\{motionPending \? 'true' : undefined\}/)
    assert.match(clientSource, /setMotionPending\(false\)[\s\S]*playPosterRelight\(false\)/)
  })

  test('archive filter tabs use one selected style helper for every tab', () => {
    const archiveSource = readSource('../src/app/(main)/archive/ArchiveClient.tsx')
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

  test('rejects client-supplied title and name overrides', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    for (const field of ['title', 'mountainName', 'mountain_name', 'trackName', 'track_name']) {
      assert.throws(
        () => assertShareRenderPayload({ template: 'base-classic', checkinId: 'fake-id', [field]: '鸡笼顶大草原' }),
        (error) => matchesPolicyError(error, ShareRenderPayloadPolicyError, {
          field,
          message: /cannot be overridden/i,
        }),
        `${field} should be rejected`,
      )
    }
  })

  test('rejects client-supplied track shapes and route paths', async () => {
    const { ShareRenderPayloadPolicyError, assertShareRenderPayload } = await loadPolicy()

    for (const field of ['track', 'trackPoints', 'track_points', 'trackPreview', 'routePath', 'routeShape', 'screenshot_route_shape']) {
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

  test('share data loaders use screenshot route shape without falling back to GPS track points for screenshot rows', () => {
    const sharePageSource = readSource('../src/app/(flow)/share/page.tsx')
    const renderRouteSource = readSource('../src/app/api/share/render/route.ts')

    for (const source of [sharePageSource, renderRouteSource]) {
      assert.match(source, /screenshot_route_shape/)
      assert.match(source, /source:\s*resolveShareRenderSource\(row\.source\)/)
      assert.match(
        source,
        /const trackPreview = isScreenshotRecognition\s*\?\s*buildShareTrackPreviewFromScreenshotRouteShape\(row\.screenshot_route_shape\)\s*:\s*buildShareTrackPreview\(row\.track_points\) \?\? buildShareTrackPreview\(session\?\.track_points\)/,
      )
      assert.match(source, /const isScreenshotRecognition = isScreenshotRecognitionSource\(row\.source\)/)
      assert.doesNotMatch(source, /function sourceFor(?:Share|Render)\(/)
    }
  })

  test('share data loaders resolve title from mountain, track_name, then share fallback', () => {
    const sharePageSource = readSource('../src/app/(flow)/share/page.tsx')
    const renderRouteSource = readSource('../src/app/api/share/render/route.ts')

    for (const source of [sharePageSource, renderRouteSource]) {
      assert.match(source, /resolveShareMountainName/)
      assert.match(source, /track_name/)
      assert.match(source, /trackName:\s*row\.track_name/)
      assert.doesNotMatch(source, /mountainName:\s*mountain\?\.name\s*\?\?\s*'未知山峰'/)
    }
  })

  test('uploaded screenshot share templates keep GPS verification copy out of the uploaded branch', () => {
    const sharedSource = readSource('../src/lib/share-templates/shared.tsx')
    const sourcePill = sharedSource.match(/export function SourcePill[\s\S]*?export function BrandFooter/)?.[0] ?? ''
    const uploadedBranch = sourcePill.match(/:\s*\(\s*<>[\s\S]*?<span[^>]*style=\{\{ fontSize: 22[\s\S]*?UPLOADED[\s\S]*?<\/>\s*\)/)?.[0] ?? ''

    assert.ok(sourcePill)
    assert.ok(uploadedBranch)
    assert.doesNotMatch(uploadedBranch, /GPS VERIFIED|GPS 真实轨迹|verified/i)
    assert.match(uploadedBranch, /UPLOADED/)
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
