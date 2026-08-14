import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const sourceExtension = 'ts'

async function loadPolicy() {
  return import(`../src/lib/share-render-policy.${sourceExtension}`)
}

async function loadShareTemplateTypes() {
  return import(`../src/lib/share-templates/types.${sourceExtension}`)
}

async function loadShareFonts() {
  return import(`../src/lib/fonts/load-share-fonts.${sourceExtension}`)
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

function executeCommonJsModule<T>(source: string, requireImpl: (id: string) => unknown): T {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText
  const runtimeModule = { exports: {} as Record<string, unknown> }
  new Function('module', 'exports', 'require', compiled)(runtimeModule, runtimeModule.exports, requireImpl)
  return runtimeModule.exports as T
}

async function loadShareClientDiagnosticParser() {
  const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
  const diagnosticBlock = clientSource.match(
    /type ShareRenderDiagnosticCode =[\s\S]*?(?=\nfunction markPressFallback)/,
  )?.[0]
  assert.ok(diagnosticBlock, 'ShareClient diagnostic parser block must be extractable')

  return executeCommonJsModule<{
    readShareRenderDiagnostic: (
      response: Response,
      fallbackErrorId: string,
    ) => Promise<ShareRenderDiagnosticResult>
    readShareRenderResult: (
      request: () => Promise<Response>,
      fallbackErrorId: string,
    ) => Promise<ShareRenderResult>
    ShareRenderResponseError: new (diagnostic: ShareRenderDiagnosticResult) => Error
  }>(
    `${diagnosticBlock}\nexport { readShareRenderDiagnostic, readShareRenderResult, ShareRenderResponseError }\n`,
    (id) => {
      throw new Error(`Unexpected ShareClient diagnostic dependency: ${id}`)
    },
  )
}

type ShareRenderDiagnosticResult = {
  code: string
  errorId: string
  phase: string
  status: number | null
  contentType: string
  responseRequestId: string
  svgStage?: string
}

type ShareRenderResult =
  | { ok: true; blob: Blob }
  | { ok: false; diagnostic: ShareRenderDiagnosticResult }

function streamResponse(body: Uint8Array, headers: HeadersInit = {}, status = 500) {
  let canceled = false
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body)
      },
      cancel() {
        canceled = true
      },
    }),
    { headers, status },
  )

  return { response, wasCanceled: () => canceled }
}

function assertShareRenderFailure(result: ShareRenderResult): ShareRenderDiagnosticResult {
  assert.equal(result.ok, false, 'the diagnostic fixture must return a failure result')
  if (result.ok) assert.fail('expected a share render failure result')
  return result.diagnostic
}

const SHARE_RENDER_ERROR_ID = '11111111-1111-4111-8111-111111111111'

function shareRenderRequest(body: Record<string, unknown>, requestId = SHARE_RENDER_ERROR_ID) {
  return new Request('https://example.test/api/share/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-peak-trekker-render-id': requestId,
    },
    body: JSON.stringify(body),
  })
}

function validShareRenderBody(overrides: Record<string, unknown> = {}) {
  return {
    template: 'base-classic',
    checkinId: 'checkin-1',
    fieldVisibility: {},
    transparent: false,
    ...overrides,
  }
}

function loadShareRenderRoute({
  user = { id: 'user-1' },
  workerSvgResponse = async () => null,
  getShareTemplateComponent = () => (props: unknown) => props,
  renderShareSvg = async () => '<svg />',
  renderSvgPng = async () => ({ buffer: new Uint8Array([1, 2, 3]) }),
  applyPhotoGrayscaleSvgFilter = (svg: string) => svg,
}: {
  user?: { id: string } | null
  workerSvgResponse?: (args: unknown) => Promise<Response | null>
  getShareTemplateComponent?: () => (props: unknown) => unknown
  renderShareSvg?: (args: unknown) => Promise<string>
  renderSvgPng?: (args: unknown) => Promise<{ buffer: Uint8Array }>
  applyPhotoGrayscaleSvgFilter?: (svg: string, photoDataUrl: string) => string
} = {}) {
  const routeSource = readSource('../src/app/api/share/render/route.ts')
  const checkin = {
    id: 'checkin-1',
    user_id: 'user-1',
    source: 'gpx',
    created_at: '2026-08-14T00:00:00.000Z',
    start_time: null,
    end_time: null,
    distance_meters: 21300,
    duration_seconds: 1440,
    elevation_gain_meters: 625,
    max_elevation_meters: 5077,
    session_id: null,
    track_name: 'Test track',
    track_points: null,
    screenshot_route_shape: null,
    mountains: { id: 'mountain-1', name: 'Test mountain', altitude: 5077, province: 'Test province' },
  }
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user } }),
    },
    from: (table: string) => {
      assert.equal(table, 'checkins')
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: checkin, error: null }),
          }),
        }),
      }
    },
  }

  return executeCommonJsModule<{
    POST: (request: Request) => Promise<Response>
  }>(routeSource, (id) => {
    switch (id) {
      case '@/lib/brand-assets.server':
        return { loadBrandMarkMaskDataUri: async () => 'data:image/png;base64,brand' }
      case '@/lib/share-templates/shared':
        return { RenderRoot: (props: unknown) => props }
      case '@/lib/share-templates/registry':
        return { getShareTemplateComponent }
      case '@/lib/share-templates/transparent-watermark':
        return { TransparentWatermarkTemplate: (props: unknown) => props }
      case '@/lib/share-templates/types':
        return { SHARE_RENDER_TEMPLATE_IDS: ['base-classic', 'premium-mono-film'] }
      case '@/lib/fonts/load-share-fonts':
        return { loadShareFonts: async () => [] }
      case '@/lib/premium':
        return { checkTemplateAccess: async () => ({ allowed: true }), isPremiumPaywallEnabled: () => false }
      case '@/lib/schema-compat':
        return { isSchemaCompatibilityErrorMessage: () => false }
      case '@/lib/share-render-png':
        return { renderShareSvg, renderSvgPng }
      case '@/lib/share-render-runtime':
        return { createWorkerSvgResponse: workerSvgResponse }
      case '@/lib/share-render-policy':
        return {
          ShareRenderPayloadPolicyError: class ShareRenderPayloadPolicyError extends Error {},
          assertShareRenderPayload: () => undefined,
        }
      case '@/lib/share-svg-filters':
        return { applyPhotoGrayscaleSvgFilter }
      case '@/lib/share-track-preview':
        return {
          buildShareTrackPreview: () => null,
          buildShareTrackPreviewFromScreenshotRouteShape: () => null,
        }
      case '@/lib/share-data':
        return {
          resolveMeasuredShareAltitude: (altitude: number | null) => altitude,
          resolveShareMountainName: ({ mountainName }: { mountainName?: string | null }) => mountainName ?? '',
          resolveShareRenderSource: () => 'uploaded',
        }
      case '@/lib/supabase-server':
        return { createSupabaseServerClient: async () => supabase }
      case '@/lib/trek-utils':
        return { isScreenshotRecognitionSource: () => false }
      default:
        throw new Error(`Unexpected share route dependency: ${id}`)
    }
  })
}

function loadWorkerModule({
  renderer,
  openNextFetch,
}: {
  renderer: (args: { transparent: boolean }) => Promise<Uint8Array>
  openNextFetch: (request: Request) => Promise<Response>
}) {
  const workerSource = readSource('../custom-worker.ts')
  return executeCommonJsModule<{
    default: {
      fetch: (request: Request, env: { ASSETS: { fetch: (request: Request) => Promise<Response> } }, context: unknown) => Promise<Response>
    }
  }>(workerSource, (id) => {
    switch (id) {
      case './src/lib/share-render-png.worker':
        return { ensureWorkerShareRenderer: async () => renderer }
      case './node_modules/satori/yoga.wasm?module':
        return { __esModule: true, default: {} }
      case './src/lib/share-render-runtime':
        return {
          WORKER_SVG_RESPONSE_HEADER: 'x-peak-trekker-worker-svg',
          WORKER_SVG_TRANSPARENT_HEADER: 'x-peak-trekker-worker-transparent',
        }
      case './.open-next/worker.js':
        return { __esModule: true, default: { fetch: openNextFetch } }
      default:
        throw new Error(`Unexpected custom worker dependency: ${id}`)
    }
  }).default
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
  test('TYPO-001 registers local Rajdhani only for exercise metric values and Latin units', () => {
    const globalsSource = readSource('../src/app/globals.css')
    const shareFontSource = readSource('../src/lib/fonts/load-share-fonts.ts')
    const sharedSource = readSource('../src/lib/share-templates/shared.tsx')
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')
    const shareClientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const metricTemplateSources = [
      '../src/lib/share-templates/base-vertical-classic.tsx',
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
    ]

    for (const fileName of ['Rajdhani-SemiBold.ttf', 'Rajdhani-Bold.ttf', 'Rajdhani-OFL.txt']) {
      assert.equal(existsSync(new URL(`../public/fonts/${fileName}`, import.meta.url)), true, `the packaged ${fileName} asset is required`)
    }

    assert.match(globalsSource, /font-family: 'Rajdhani';[\s\S]*?Rajdhani-SemiBold\.ttf[\s\S]*?font-weight: 600/)
    assert.match(globalsSource, /font-family: 'Rajdhani';[\s\S]*?Rajdhani-Bold\.ttf[\s\S]*?font-weight: 700/)
    assert.match(globalsSource, /font-family: 'Rajdhani';[\s\S]*?Rajdhani-Bold\.ttf[\s\S]*?font-weight: 800/)
    assert.match(sharedSource, /export const METRIC_FONT_FAMILY = 'Rajdhani'/)
    assert.match(shareFontSource, /Rajdhani-SemiBold\.ttf/)
    assert.match(shareFontSource, /Rajdhani-Bold\.ttf/)
    assert.match(shareFontSource, /name: METRIC_FONT_FAMILY,[\s\S]*?weight: 600/)
    assert.match(shareFontSource, /name: METRIC_FONT_FAMILY,[\s\S]*?weight: 700/)
    assert.match(shareFontSource, /name: METRIC_FONT_FAMILY,[\s\S]*?weight: 800/)

    metricTemplateSources.forEach((templateSource) => {
      assert.match(readSource(templateSource), /METRIC_FONT_FAMILY/, `${templateSource} must apply Rajdhani to its exercise metrics`)
    })
    assert.match(transparentSource, /METRIC_FONT_FAMILY/, 'transparent watermarks must use the same metric family')
    assert.match(transparentSource, /METRIC_FONT_FAMILY/g)
    assert.match(shareClientSource, /METRIC_FONT_FAMILY/, 'the browser editor must match exported metric typography')

    assert.match(sharedSource, /metric = true,[\s\S]*?fontFamily: metric \? METRIC_FONT_FAMILY : 'Noto Sans SC'/, 'shared metric rows must keep an explicit non-metric escape hatch')
    assert.match(readSource('../src/lib/share-templates/premium-altitude-profile.tsx'), /SmallMetric label="日期" value=\{data\.date\} align="right" metric=\{false\}/, 'date metadata must opt out of the metric font')
    assert.match(readSource('../src/lib/share-templates/premium-mono-film.tsx'), /const stats = fourStats\(data\)\.filter\(\(item\) => item\.key !== 'date'\)/, 'mono-film must not duplicate its header date in the stat row')
    assert.match(transparentSource.match(/function WatermarkMonoFilm[\s\S]*?(?=\nfunction WatermarkAltitudeProfile)/)?.[0] ?? '', /const stats = fourStats\(data\)\.filter\(\(item\) => item\.key !== 'date'\)/, 'transparent mono-film must use the same three-stat structure')
    assert.doesNotMatch(sharedSource.match(/export function SourcePill[\s\S]*?(?=export function BrandFooter)/)?.[0] ?? '', /METRIC_FONT_FAMILY/, 'source identity must retain the base font')
    assert.doesNotMatch(sharedSource.match(/export function BrandFooter[\s\S]*?(?=export function PreviewWatermarkLayer)/)?.[0] ?? '', /METRIC_FONT_FAMILY/, 'brand identity must retain the base font')

    const verticalSource = readSource('../src/lib/share-templates/base-vertical-classic.tsx')
    assert.match(verticalSource, /key: 'duration',[\s\S]*?motionFormat: 'duration',[\s\S]*?motionValue: durationToSeconds\(data\.duration\)/, 'the existing duration motion contract must remain intact')
  })

  test('SHARE-001B registers the free vertical classic template first and shares one normal/transparent content skeleton', async () => {
    const {
      BASIC_SHARE_TEMPLATE_IDS,
      SHARE_RENDER_TEMPLATE_IDS,
    } = await loadShareTemplateTypes()
    const verticalTemplatePath = new URL('../src/lib/share-templates/base-vertical-classic.tsx', import.meta.url)

    assert.deepEqual([...BASIC_SHARE_TEMPLATE_IDS], ['base-vertical-classic', 'base-classic', 'base-data'])
    assert.equal(SHARE_RENDER_TEMPLATE_IDS.length, 11)
    assert.equal(SHARE_RENDER_TEMPLATE_IDS[0], 'base-vertical-classic')
    assert.equal(existsSync(verticalTemplatePath), true, 'Vertical must have a dedicated shared template component')

    const registrySource = readSource('../src/lib/share-templates/registry.tsx')
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')
    const shareClientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const imprintClientSource = readSource('../src/app/(main)/imprint/ImprintClient.tsx')
    const typesSource = readSource('../src/lib/share-templates/types.ts')
    const verticalSource = readFileSync(verticalTemplatePath, 'utf8')

    assert.match(registrySource, /id: 'base-vertical-classic', label: 'Vertical', tier: 'basic', Component: BaseVerticalClassicTemplate/)
    assert.match(transparentSource, /template === 'base-vertical-classic'[\s\S]*<BaseVerticalClassicTemplate data=\{data\} transparent brandMarkSrc=\{brandMarkSrc\} \/>/)
    assert.match(typesSource, /transparent\?: boolean/)
    assert.match(verticalSource, /transparent \? null : <PhotoLayer/)
    assert.match(verticalSource, /transparent \? null : <PhotoShade/)
    assert.match(verticalSource, /const heroMetric: VerticalMetric \| null = hasShareAltitude\(data\)[\s\S]*?key: 'altitude',[\s\S]*?label: '最高海拔'/, 'the measured altitude must be the first hero metric')
    assert.match(verticalSource, /data\.visibleFields\.elevationGain[\s\S]*?key: 'elevationGain',[\s\S]*?label: '爬升'/, 'elevation gain must be the truthful hero fallback')
    assert.match(verticalSource, /const distanceMetric: VerticalMetric = \{[\s\S]*?key: 'distance'/)
    assert.match(verticalSource, /const durationMetric: VerticalMetric \| null = data\.visibleFields\.duration[\s\S]*?key: 'duration'/)
    assert.match(verticalSource, /return \[\s*\.\.\.\(heroMetric \? \[heroMetric\] : \[\]\),\s*distanceMetric,\s*\.\.\.\(durationMetric \? \[durationMetric\] : \[\]\)/, 'the hero, distance, and duration order must remain vertical and compact')
    assert.match(verticalSource, /left: 0,\s*width: POSTER_WIDTH,\s*top: 320/, 'the centered data zone needs an explicit Satori-safe canvas width')
    assert.match(verticalSource, /key=\{metric\.key\} style=\{\{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 \}\}/, 'each metric must be a centered vertical group')
    assert.match(verticalSource, /data-motion-kind="metric-label"[\s\S]*?\{metric\.label\}/, 'each metric must render its label before the value row')
    assert.match(verticalSource, /color: isHero \? C\.primary : C\.fg,[\s\S]*?fontSize: isHero \? 92 : 78/, 'only the altitude or gain hero value is green and larger')
    assert.match(verticalSource, /motionFormat\?: 'decimal-1' \| 'duration' \| 'integer'/, 'Vertical must keep duration inside the existing numeric motion contract')
    assert.match(verticalSource, /function durationToSeconds\(duration: string\)/, 'Vertical needs a numeric duration value for the existing counter')
    assert.match(verticalSource, /key: 'duration',[\s\S]*?motionFormat: 'duration',[\s\S]*?motionValue: durationToSeconds\(data\.duration\)/, 'duration must participate in the same numeric entry motion as the other metrics')
    assert.match(verticalSource, /fontFamily: 'Noto Sans SC',[\s\S]*?fontWeight: 700/, 'the label must use the existing Noto Sans SC weight available to both browser and renderer')
    assert.match(verticalSource, /fontFamily: METRIC_FONT_FAMILY,[\s\S]*?fontWeight: 800/, 'metric values and units must use the packaged Rajdhani resource')
    assert.match(verticalSource, /marginLeft: 8,[\s\S]*?fontWeight: 700/, 'units must remain attached to their numeric value without changing the layout zones')
    assert.match(verticalSource, /y: 808,\s*width: 712,\s*height: 420/, 'route bounds must stay in the lower middle zone without changing the shared renderer')
    assert.match(verticalSource, /data-motion-phase="brand"[\s\S]*?left: 0,[\s\S]*?width: POSTER_WIDTH,[\s\S]*?top: 1404,[\s\S]*?flexDirection: 'column',[\s\S]*?gap: 16,[\s\S]*?Peak Trekker[\s\S]*?<SourcePill/, 'brand and source must share one centered lower wrapper')
    assert.doesNotMatch(verticalSource, /data-motion-phase="source"/, 'Vertical must not retain an independent source motion phase')
    assert.match(shareClientSource, /\{ id: 'base-vertical-classic', label: 'Vertical', variant: 'vertical' \}/)
    const verticalPreviewSource = shareClientSource.match(/function VerticalClassicHeroPreview[\s\S]*?(?=\nfunction HeroPreview)/)?.[0]
    assert.ok(verticalPreviewSource, 'the vertical editor preview should be a narrow real-template branch')
    assert.match(verticalPreviewSource, /getShareTemplateComponent\(template\)\(\{ data: templateData, photoDataUrl \}\)/)
    assert.match(shareClientSource, /template === 'base-vertical-classic'[\s\S]*?<VerticalClassicHeroPreview/)
    assert.match(shareClientSource, /phaseTargets: \{ data: \[\], route: \[\], brand: \[\] \}/, 'the Vertical motion path must contain only data, route, and brand phases')
    assert.doesNotMatch(shareClientSource, /timeline\.to\(phaseTargets\.source/, 'brand wrapper must animate with its source pill')
    assert.match(shareClientSource, /if \(format === 'duration'\)/, 'Share must format the shared duration counter instead of treating it as a static third metric')
    assert.match(imprintClientSource, /type MotionFormat = 'comma' \| 'dec1' \| 'plus' \| 'duration'/, 'Imprint must accept the shared duration counter format')
    assert.match(imprintClientSource, /if \(format === 'duration'\)/, 'Imprint must format the duration counter during its existing metric timeline')
    assert.match(shareClientSource, /共 \{SHARE_TEMPLATE_OPTIONS\.length\} 款/)
    assert.match(imprintClientSource, /const TEMPLATE_ITEMS: FacadeTemplate\[\] = \[\s*\{ key: 'vertical', template: 'base-vertical-classic', photoDataUrl: PHOTO_ALPINE \}/)
  })

  test('registered share templates include the SHARE-001B free vertical template', async () => {
    const {
      BASIC_SHARE_TEMPLATE_IDS,
      PREMIUM_SHARE_TEMPLATE_IDS,
      SHARE_RENDER_TEMPLATE_IDS,
    } = await loadShareTemplateTypes()

    assert.deepEqual([...BASIC_SHARE_TEMPLATE_IDS], ['base-vertical-classic', 'base-classic', 'base-data'])
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
    assert.equal(SHARE_RENDER_TEMPLATE_IDS.length, 11)
    const registeredTemplates = [...SHARE_RENDER_TEMPLATE_IDS] as readonly string[]
    const removedBasicTemplate = ['base', 'minimal'].join('-')
    const removedPremiumTemplate = ['premium', 'split', 'view'].join('-')
    assert.equal(registeredTemplates.includes(removedBasicTemplate), false)
    assert.equal(registeredTemplates.includes(removedPremiumTemplate), false)
  })

  test('SHARE-001B scopes its route and endpoint marker treatment to the shared Vertical component', () => {
    const sharedSource = readSource('../src/lib/share-templates/shared.tsx')
    const verticalSource = readSource('../src/lib/share-templates/base-vertical-classic.tsx')
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')

    assert.match(sharedSource, /type ShareTrackRenderStyle/)
    assert.match(sharedSource, /renderStyle\?: ShareTrackRenderStyle/)
    assert.match(sharedSource, /endOutlineWidth\?: number/)
    assert.match(sharedSource, /endOutlineColor\?: string/)
    assert.match(
      sharedSource,
      /SHARE_TRACK_RENDER_PROFILES\.posterTrail\(\{ lineWidth, glow \}\)[\s\S]*?\.\.\.renderStyle/,
      'all callers without a renderStyle must keep the existing posterTrail profile',
    )

    assert.match(
      verticalSource,
      /const VERTICAL_CLASSIC_TRAIL_RENDER_STYLE = \{[\s\S]*?lineWidth: 10,[\s\S]*?glowWidth: 40,[\s\S]*?startRadius: 11,[\s\S]*?startStrokeWidth: 3,[\s\S]*?endRadius: 9,/,
    )
    const verticalRenderStyle = verticalSource.match(/const VERTICAL_CLASSIC_TRAIL_RENDER_STYLE = \{([\s\S]*?)\} as const/)
    assert.ok(verticalRenderStyle)
    assert.doesNotMatch(
      verticalRenderStyle[1],
      /glowOpacity/,
      'Vertical must inherit the posterTrail halo opacity rather than define a second opacity profile',
    )
    assert.match(
      verticalSource,
      /<TrailSvg[\s\S]*?renderStyle=\{VERTICAL_CLASSIC_TRAIL_RENDER_STYLE\}[\s\S]*?endOutlineWidth=\{2\}[\s\S]*?endOutlineColor=\{C\.bgDeep\}/,
    )
    assert.match(
      sharedSource,
      /endOutlineWidth && endOutlineColor \? \{ stroke: endOutlineColor, strokeWidth: endOutlineWidth \} : \{\}/,
      'the End outline must remain a TrailSvg-only presentation option',
    )
    assert.match(
      transparentSource,
      /template === 'base-vertical-classic'[\s\S]*?<BaseVerticalClassicTemplate data=\{data\} transparent brandMarkSrc=\{brandMarkSrc\} \/>/,
      'transparent Vertical export must share the normal component rather than fork its route treatment',
    )
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
      'base-vertical-classic',
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

  test('SHARE-001A compacts only approved transparent watermarks without changing Cert layout or canvas anchors', () => {
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')
    const sharedSource = readSource('../src/lib/share-templates/shared.tsx')
    const certificateSource = transparentSource.match(/function WatermarkCertificate[\s\S]*?(?=\nfunction WatermarkVerticalStory)/)?.[0]

    assert.ok(certificateSource, 'Cert renderer should remain present')
    assert.match(certificateSource, /<CertificateElevationChart \/>/, 'Cert chart must remain present')
    assert.match(certificateSource, /left: 120, top: 870/, 'Cert route anchor must remain unchanged')
    assert.match(certificateSource, /right: 120, top: 190/, 'Cert upper metrics anchor must remain unchanged')
    assert.match(certificateSource, /bottom: 430/, 'Cert primary metric anchor must remain unchanged')
    assert.match(certificateSource, /bottom: 260/, 'Cert brand anchor must remain unchanged')
    assert.match(certificateSource, /fontFamily: METRIC_FONT_FAMILY/, 'TYPO-001 may change only Cert exercise metric typography')

    assert.match(transparentSource, /const TRANSPARENT_WATERMARK_LAYOUT =/)
    for (const template of [
      'classic',
      'data',
      'composite',
      'overlay',
      'boldNumber',
      'dataScatter',
      'monoFilm',
      'altitudeProfile',
      'verticalStory',
    ]) {
      assert.match(transparentSource, new RegExp(`\\b${template}: \\{`), `${template} needs a local compact layout`)
    }
    assert.doesNotMatch(transparentSource, /certificate:\s*\{/, 'Cert must not receive a SHARE-001A layout override')

    assert.match(
      transparentSource,
      /<TrailSvg glow=\{10\} lineWidth=\{5\} trackPreview=\{data\.trackPreview\} contentBounds=\{TRANSPARENT_WATERMARK_LAYOUT\.classic\.trailBounds\}/,
    )
    assert.match(
      transparentSource,
      /<TrailSvg glow=\{14\} lineWidth=\{7\} trackPreview=\{data\.trackPreview\} contentBounds=\{TRANSPARENT_WATERMARK_LAYOUT\.composite\.trailBounds\}/,
    )
    assert.match(sharedSource, /contentBounds\?: Pick<ShareTrackFrame, 'x' \| 'y' \| 'width' \| 'height' \| 'padding'>/)
    assert.match(sharedSource, /x: 240,[\s\S]*y: 120,[\s\S]*width: 720,[\s\S]*height: 800,[\s\S]*padding: 96/)

    assert.match(transparentSource, /width: POSTER_WIDTH,[\s\S]*height: POSTER_HEIGHT/)
    assert.doesNotMatch(transparentSource, /transform:\s*['"]?scale\(/)
    assert.match(transparentSource, /<BottomClassicBlock data=\{data\} layout=\{TRANSPARENT_WATERMARK_LAYOUT\.classic\}/)
    assert.match(transparentSource, /left: 0,[\s\S]*right: 0,[\s\S]*bottom: 0,[\s\S]*height: layout\.gradientHeight/)
    assert.match(transparentSource, /position: 'absolute',[\s\S]*inset: 0,[\s\S]*linear-gradient\(90deg/)
    assert.match(transparentSource, /left: 0,[\s\S]*top: 0,[\s\S]*height: POSTER_HEIGHT/)
    assert.match(transparentSource, /function WatermarkVerticalStory[\s\S]*left: 0,[\s\S]*right: 0,[\s\S]*bottom: 0/)
  })

  test('premium data scatter reserves explicit Satori layout for a four-digit altitude row', () => {
    const photoSource = readSource('../src/lib/share-templates/premium-data-scatter.tsx')
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')
    const transparentRenderer = transparentSource.match(/function WatermarkDataScatter[\s\S]*?(?=\nfunction WatermarkMonoFilm)/)?.[0]

    assert.ok(transparentRenderer, 'transparent data scatter renderer should remain present')

    for (const [kind, source] of [['photo', photoSource], ['transparent', transparentRenderer]] as const) {
      assert.match(source, /display: 'flex', height: 22, flexShrink: 0,[\s\S]*?最高海拔/, `${kind} label needs a reserved Satori line box`)
      assert.match(source, /alignItems: 'baseline',[\s\S]*?height: 96,[\s\S]*?flexShrink: 0,[\s\S]*?whiteSpace: 'nowrap'/, `${kind} 5077m row needs a non-collapsing, non-wrapping line box`)
      assert.match(source, /fontSize: 106,[\s\S]*?flexShrink: 0,[\s\S]*?whiteSpace: 'nowrap'[\s\S]*?formatShareAltitude\(data\)/, `${kind} altitude value must remain on the intentional row`)
      assert.match(source, /fontSize: 42,[\s\S]*?flexShrink: 0,[\s\S]*?whiteSpace: 'nowrap'[\s\S]*?>m</, `${kind} altitude unit must remain on the intentional row`)
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
      '../src/lib/share-templates/base-vertical-classic.tsx',
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

  test('/api/poster supports the anonymous demo smoke input without a Supabase checkin', () => {
    const posterSource = readSource('../src/app/api/poster/route.ts')
    const demoBlock = posterSource.match(/if \(checkinId === 'demo'\) \{[\s\S]*?\n  \}\n\n  const supabase =/)?.[0] ?? ''

    assert.match(demoBlock, /loadBrandMarkMaskDataUri\(request\.nextUrl\.origin\)/)
    assert.match(demoBlock, /createWorkerSvgResponse\(/)
    assert.match(demoBlock, /return renderPngResponse\(/)
    assert.doesNotMatch(demoBlock, /createSupabaseServerClient|createSupabaseAdminClient|auth\.getUser/)
  })

  test('Worker share and poster rendering bundle fonts and Resvg without runtime filesystem or native sharp', () => {
    const fontSource = readSource('../src/lib/fonts/load-share-fonts.ts')
    const pngSource = readSource('../src/lib/share-render-png.ts')
    const workerPngSource = readSource('../src/lib/share-render-png.worker.ts')
    const runtimeSource = readSource('../src/lib/share-render-runtime.ts')
    const customWorkerSource = readSource('../custom-worker.ts')
    const posterSource = readSource('../src/app/api/poster/route.ts')

    assert.doesNotMatch(fontSource, /from 'fs\/promises'|from 'path'|readFile\(|process\.cwd\(\)/)
    assert.match(fontSource, /import \{ getCloudflareContext \} from '@opennextjs\/cloudflare'/)
    assert.match(fontSource, /env\.ASSETS\?\.fetch\(new Request\(assetUrl\)\)/)
    assert.doesNotMatch(pngSource, /from 'fs\/promises'|from 'path'|readFile\(|process\.cwd\(\)/)
    assert.match(pngSource, /renderShareSvg/)
    assert.doesNotMatch(pngSource, /share-render-png\.worker|index_bg\.wasm/)
    assert.match(workerPngSource, /@resvg\/resvg-wasm\/index_bg\.wasm\?module/)
    assert.match(workerPngSource, /Promise<SvgPngRenderer>/)
    assert.match(runtimeSource, /process\.env\.NEXT_PUBLIC_PEAK_TREKKER_RUNTIME === 'cloudflare'/)
    assert.doesNotMatch(runtimeSource, /process\.env\.PEAK_TREKKER_RUNTIME|WORKER_SVG_QUERY_PARAM|__pt_worker_svg/)
    assert.match(runtimeSource, /createWorkerSvgResponse/)
    assert.doesNotMatch(runtimeSource, /photoBase64|checkinId|user_id|access_token/)
    assert.match(customWorkerSource, /renderWorkerSvgResponse/)
    assert.doesNotMatch(customWorkerSource, /WORKER_SVG_QUERY_PARAM|__pt_worker_svg/)
    assert.match(customWorkerSource, /ensureWorkerShareRenderer\(\)/)
    assert.match(posterSource, /renderSvgPng/)
    const renderPngBlock = posterSource.match(/async function renderPngResponse[\s\S]*?\n}\n/)?.[0] ?? ''
    assert.doesNotMatch(renderPngBlock, /import\('sharp'\)|sharp\(/)
  })

  test('Cloudflare share font loading reads all local font assets through the injected asset fetcher', async () => {
    const fontSource = readSource('../src/lib/fonts/load-share-fonts.ts')
    const { loadShareFontBuffersFromAssetFetcher } = await loadShareFonts()
    const requestedPaths: string[] = []

    const buffers = await loadShareFontBuffersFromAssetFetcher('https://peaktrekker.cc', async (assetUrl) => {
      requestedPaths.push(assetUrl.pathname)
      return new Response(new Uint8Array([requestedPaths.length]).buffer, { status: 200 })
    })

    assert.deepEqual(requestedPaths, [
      '/fonts/NotoSansSC-Regular.otf',
      '/fonts/NotoSansSC-Bold.otf',
      '/fonts/Rajdhani-SemiBold.ttf',
      '/fonts/Rajdhani-Bold.ttf',
    ])
    assert.equal(buffers.regular.byteLength, 1)
    assert.equal(buffers.bold.byteLength, 1)
    assert.equal(buffers.rajdhaniSemiBold.byteLength, 1)
    assert.equal(buffers.rajdhaniBold.byteLength, 1)
    assert.match(fontSource, /isCloudflareRuntime\(\)[\s\S]*?env\.ASSETS\?\.fetch\(new Request\(assetUrl\)\)/)
    assert.doesNotMatch(fontSource.match(/if \(isCloudflareRuntime\(\)\)[\s\S]*?return async \(assetUrl: URL\)/)?.[0] ?? '', /fetch\(assetUrl/)
  })

  test('Cloudflare Noto fallback still reads local Rajdhani through the asset fetcher without an origin fetch', async () => {
    const { loadShareFontBuffersWithFetchers } = await loadShareFonts()
    const assetPaths: string[] = []
    const remoteUrls: string[] = []
    const unexpectedOriginFetches: string[] = []
    const originalFetch = globalThis.fetch
    const originalWarn = console.warn

    globalThis.fetch = async (input) => {
      unexpectedOriginFetches.push(typeof input === 'string' ? input : input.toString())
      throw new Error('origin fetch is not allowed in this fallback contract')
    }
    console.warn = () => {}

    try {
      const buffers = await loadShareFontBuffersWithFetchers(
        'https://peaktrekker.cc',
        async (assetUrl) => {
          assetPaths.push(assetUrl.pathname)
          const isNoto = assetUrl.pathname.includes('NotoSansSC')
          return new Response(isNoto ? null : new Uint8Array([assetPaths.length]).buffer, { status: isNoto ? 404 : 200 })
        },
        async (remoteUrl) => {
          remoteUrls.push(remoteUrl)
          return new Uint8Array([remoteUrls.length]).buffer
        },
      )

      assert.deepEqual(assetPaths, [
        '/fonts/NotoSansSC-Regular.otf',
        '/fonts/NotoSansSC-Bold.otf',
        '/fonts/Rajdhani-SemiBold.ttf',
        '/fonts/Rajdhani-Bold.ttf',
        '/fonts/Rajdhani-SemiBold.ttf',
        '/fonts/Rajdhani-Bold.ttf',
      ])
      assert.deepEqual(assetPaths.slice(-2), [
        '/fonts/Rajdhani-SemiBold.ttf',
        '/fonts/Rajdhani-Bold.ttf',
      ])
      assert.equal(remoteUrls.length, 2)
      assert.equal(buffers.regular.byteLength, 1)
      assert.equal(buffers.bold.byteLength, 1)
      assert.equal(buffers.rajdhaniSemiBold.byteLength, 1)
      assert.equal(buffers.rajdhaniBold.byteLength, 1)
      assert.deepEqual(unexpectedOriginFetches, [])
    } finally {
      globalThis.fetch = originalFetch
      console.warn = originalWarn
    }
  })

  test('Worker Satori uses a precompiled Yoga module while Node keeps the default renderer', () => {
    const pngSource = readSource('../src/lib/share-render-png.ts')
    const workerSvgSource = readSource('../src/lib/share-render-svg.worker.ts')
    const nodeSvgSource = readSource('../src/lib/share-render-svg.node.ts')

    assert.doesNotMatch(pngSource, /^import satori from 'satori'$/m)
    assert.match(pngSource, /import\('\.\/share-render-svg\.worker\.ts'\)/)
    assert.match(pngSource, /import\('\.\/share-render-svg\.node\.ts'\)/)
    assert.match(workerSvgSource, /import satori, \{ init \} from 'satori\/standalone'/)
    assert.match(workerSvgSource, /import \{ getCloudflareContext \} from '@opennextjs\/cloudflare'/)
    assert.match(workerSvgSource, /getCloudflareContext\(\{ async: true \}\)/)
    assert.match(workerSvgSource, /env\.PEAK_TREKKER_YOGA_WASM/)
    assert.match(workerSvgSource, /yogaReady \?\?= init\(yogaWasm\)/)
    assert.match(workerSvgSource, /return yogaReady/)
    assert.match(workerSvgSource, /await ensureWorkerYoga\(\)/)
    assert.doesNotMatch(workerSvgSource, /yoga\.wasm|WebAssembly\.compile|fetch\(/)
    const customWorkerSource = readSource('../custom-worker.ts')
    assert.match(customWorkerSource, /import yogaWasm from '\.\/node_modules\/satori\/yoga\.wasm\?module'/)
    assert.match(customWorkerSource, /PEAK_TREKKER_YOGA_WASM: yogaWasm/)
    assert.match(nodeSvgSource, /import satori from 'satori'/)
    assert.doesNotMatch(nodeSvgSource, /yoga\.wasm|satori\/standalone/)
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

  test('premium mono-film server render keeps a vertical hero and three centered stats', () => {
    const normalRenderer = readSource('../src/lib/share-templates/premium-mono-film.tsx')
    const transparentSource = readSource('../src/lib/share-templates/transparent-watermark.tsx')
    const transparentRenderer = transparentSource.match(/function WatermarkMonoFilm[\s\S]*?(?=\nfunction WatermarkAltitudeProfile)/)?.[0]

    assert.ok(transparentRenderer, 'transparent mono-film renderer should remain present')

    for (const [kind, source] of [['normal', normalRenderer], ['transparent', transparentRenderer]] as const) {
      assert.match(source, /const stats = fourStats\(data\)\.filter\(\(item\) => item\.key !== 'date'\)/, `${kind} output must omit the duplicate DATE stat`)
      assert.match(
        source,
        /showAltitude \? \(\s*<div style=\{\{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: 52, gap: 24 \}\}>[\s\S]*?最高海拔[\s\S]*?fontFamily: METRIC_FONT_FAMILY/,
        `${kind} output must keep the altitude label above its Rajdhani value with an explicit vertical gap`,
      )
      assert.doesNotMatch(source, /item\.key === 'date'/, `${kind} output must not retain a fourth date column`)
      assert.match(source, /position: 'absolute', left: 58, right: 58, top:[\s\S]*?alignItems: 'stretch', justifyContent: 'center'/, `${kind} stats must retain their centered canvas region`)
      assert.match(source, /flexDirection: 'column',[\s\S]*?alignItems: 'center',[\s\S]*?width: `\$\{100 \/ Math\.max\(1, stats\.length\)\}%`/, `${kind} output must keep equal-width centered stat columns`)
    }
  })

  test('premium mono-film export applies grayscale after Satori while the browser preview stays grayscale', () => {
    const routeSource = readSource('../src/app/api/share/render/route.ts')
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const monoFilmSource = readSource('../src/lib/share-templates/premium-mono-film.tsx')
    const sharedSource = readSource('../src/lib/share-templates/shared.tsx')
    const filterSource = readSource('../src/lib/share-svg-filters.ts')
    const photoPreprocess = routeSource.match(/async function photoDataUrlForTemplate[\s\S]*?\n}\n\nfunction renderTemplate/)?.[0] ?? ''

    assert.ok(photoPreprocess)
    assert.doesNotMatch(routeSource, /import\('sharp'\)|sharp\(/)
    assert.match(photoPreprocess, /photoBase64\.startsWith\('iVBORw0KGgo'\)/)
    assert.match(photoPreprocess, /photoBase64\.startsWith\('UklGR'\)/)
    assert.match(photoPreprocess, /return `data:\$\{mimeType\};base64,\$\{photoBase64\}`/)
    assert.doesNotMatch(sharedSource, /<feColorMatrix|share-photo-grayscale|grayscale\(1\)/)
    assert.match(routeSource, /'premium-mono-film',[\s\S]*'premium-vertical-story'/)
    assert.match(routeSource, /GRAYSCALE_PHOTO_TEMPLATES\.has\(payload\.template\)\s*&&\s*photoResult\.value/)
    assert.match(routeSource, /svg = applyPhotoGrayscaleSvgFilter\(svg, photoResult\.value\)/)
    assert.match(filterSource, /href="\$\{photoDataUrl\}"/)
    assert.match(filterSource, /<feColorMatrix type="saturate" values="0"\/>/)
    assert.match(clientSource, /const monoFilm = template === 'premium-mono-film'/)
    assert.match(clientSource, /if \(monoFilm\)[\s\S]*<PreviewPhotoBackground photoDataUrl=\{photoDataUrl\} grayscale>/)
    assert.match(clientSource, /filter: grayscale \? 'grayscale\(1\)' : 'none'/)
    assert.match(monoFilmSource, /<PhotoLayer photoDataUrl=\{photoDataUrl\} width=\{1080\} height=\{900\} \/>/)
  })

  test('premium mono-film post-Satori filter targets only the uploaded photo and renders grayscale', async () => {
    const React = await import('react')
    const sharp = (await import('sharp')).default
    const { renderShareSvg, renderSvgPng } = await import('../src/lib/share-render-png.ts')
    const { applyPhotoGrayscaleSvgFilter } = await import('../src/lib/share-svg-filters.ts')

    const blueHalf = await sharp({
      create: { width: 540, height: 900, channels: 3, background: { r: 22, g: 118, b: 245 } },
    }).png().toBuffer()
    const colorPhoto = await sharp({
      create: { width: 1080, height: 900, channels: 3, background: { r: 232, g: 42, b: 76 } },
    }).composite([{ input: blueHalf, left: 540, top: 0 }]).png().toBuffer()
    const rawPhotoDataUrl = `data:image/png;base64,${colorPhoto.toString('base64')}`

    const renderPhoto = () => React.createElement(
      'div',
      { style: { display: 'flex', position: 'relative', width: 1080, height: 1920, background: '#0a0c0e' } },
      React.createElement('img', {
        src: rawPhotoDataUrl,
        width: 1080,
        height: 900,
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          objectFit: 'cover',
        },
      }),
    )
    const svg = await renderShareSvg({ element: renderPhoto() })
    const brandDataUrl = 'data:image/png;base64,YnJhbmQ='
    const svgWithBrand = svg.replace('</svg>', `<image href="${brandDataUrl}" width="1" height="1"/></svg>`)
    const filteredSvg = applyPhotoGrayscaleSvgFilter(svgWithBrand, rawPhotoDataUrl)
    assert.match(filteredSvg, new RegExp(`<image filter="url\\(#share-photo-grayscale\\)"[^>]*href="${rawPhotoDataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
    assert.match(filteredSvg, new RegExp(`<image href="${brandDataUrl}"`))
    assert.doesNotMatch(filteredSvg, new RegExp(`<image filter="url\\(#share-photo-grayscale\\)"[^>]*href="${brandDataUrl}"`))
    const baselinePng = await renderSvgPng({ svg })
    const fixedPng = await renderSvgPng({ svg: filteredSvg })
    const crop = { left: 300, top: 180, width: 480, height: 260 }
    const beforeDelta = await measureChannelDelta(baselinePng, crop)
    const afterDelta = await measureChannelDelta(fixedPng, crop)
    assert.ok(beforeDelta.mean > 40, `baseline photo should retain color, mean delta=${beforeDelta.mean}`)
    assert.ok(afterDelta.mean < 8, `fixed photo should be grayscale, mean delta=${afterDelta.mean}`)

    const outputDir = join(process.cwd(), 'output', 'p3-cleanup-acceptance')
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(join(outputDir, 'mono-film-export-before-color.png'), baselinePng)
    writeFileSync(join(outputDir, 'mono-film-export-after-grayscale.png'), fixedPng)
    writeFileSync(join(outputDir, 'fu106-satori-pixel-metrics.json'), `${JSON.stringify({
      baselinePhotoRegionChannelDelta: beforeDelta,
      fixedPhotoRegionChannelDelta: afterDelta,
      evidenceBoundary: 'production post-Satori photo targeting and SVG grayscale filter rendered by the actual DB-free Satori PNG pipeline',
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

  test('share editor clears route dash state when a relight reaches its terminal frame', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const terminalBlock = clientSource.match(/function setPosterMotionTerminal\(root: HTMLElement\) \{[\s\S]*?\n}\n\nfunction preparePosterMotionInitialState/)?.[0] ?? ''
    const relightBlock = clientSource.match(/function buildPosterRelightTimeline\(root: HTMLElement\) \{[\s\S]*?\n}\n\nfunction getExportMotionTargets/)?.[0] ?? ''

    assert.match(terminalBlock, /settlePosterDrawTargets\(drawTargets\)/)
    assert.match(relightBlock, /timeline\.call\(\(\) => settlePosterDrawTargets\(drawTargets\)\)/)
    assert.match(clientSource, /function settlePosterDrawTargets\(drawTargets: SVGPathElement\[\]\) \{[\s\S]*?strokeDasharray = ''[\s\S]*?strokeDashoffset = '0'/)
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
    assert.match(thumbnailRow, /共 \{SHARE_TEMPLATE_OPTIONS\.length\} 款/)
    assert.doesNotMatch(thumbnailRow, /共 10 款/)
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

  test('share render client diagnostics distinguish every safe failure boundary', async () => {
    const { readShareRenderResult, ShareRenderResponseError } = await loadShareClientDiagnosticParser()
    const serverErrorId = '11111111-1111-4111-8111-111111111111'
    const clientErrorId = '22222222-2222-4222-8222-222222222222'
    const encoder = new TextEncoder()

    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(
          () => Promise.reject(new TypeError('network unavailable')),
          clientErrorId,
        ),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'fetch-transport',
        status: null,
        contentType: 'unavailable',
        responseRequestId: 'unavailable',
      },
      'a transport rejection before Response must remain distinguishable',
    )

    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(
          () => Promise.resolve(new Response('<html>gateway</html>', {
            status: 502,
            headers: {
              'Content-Type': 'text/html',
              'x-peak-trekker-render-id': '33333333-3333-4333-8333-333333333333',
            },
          })),
          clientErrorId,
        ),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'http-non-json',
        status: 502,
        contentType: 'non-json',
        responseRequestId: 'mismatch',
      },
      'a non-JSON HTTP failure must not read or display its body',
    )

    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(
          () => Promise.resolve(new Response(null, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })),
          clientErrorId,
        ),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'http-invalid-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'missing',
      },
      'a missing JSON body must retain only safe response metadata',
    )

    const oversizedPayload = encoder.encode(`${JSON.stringify({ code: 'SR-PNG', errorId: serverErrorId })}${' '.repeat(4097)}`)
    const noLength = streamResponse(oversizedPayload, { 'Content-Type': 'application/json' })
    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(() => Promise.resolve(noLength.response), clientErrorId),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'http-invalid-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'missing',
      },
      'a body without Content-Length must still be capped',
    )
    assert.equal(noLength.wasCanceled(), true, 'oversized streams must be canceled instead of fully consumed')

    const falseSmallLength = streamResponse(oversizedPayload, {
      'Content-Type': 'application/json',
      'Content-Length': '42',
    })
    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(() => Promise.resolve(falseSmallLength.response), clientErrorId),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'http-invalid-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'missing',
      },
      'a forged small Content-Length must not bypass the byte cap',
    )
    assert.equal(falseSmallLength.wasCanceled(), true, 'forged-size streams must also be canceled')

    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(
          () => Promise.resolve(new Response('{not-json', {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'x-peak-trekker-render-id': clientErrorId,
            },
          })),
          clientErrorId,
        ),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'http-invalid-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'match',
      },
      'malformed JSON must retain only safe response metadata',
    )

    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(
          () => Promise.resolve(new Response(JSON.stringify({ code: 'SR-UNKNOWN', errorId: serverErrorId }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'x-peak-trekker-render-id': clientErrorId,
            },
          })),
          clientErrorId,
        ),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: serverErrorId,
        phase: 'http-safe-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'match',
      },
      'a valid safe server envelope must remain distinguishable from a client fallback',
    )

    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(
          () => Promise.resolve(new Response(JSON.stringify({
            code: 'SR-SVG',
            errorId: serverErrorId,
            svgStage: 'satori-render',
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'x-peak-trekker-render-id': clientErrorId,
            },
          })),
          clientErrorId,
        ),
      ),
      {
        code: 'SR-SVG',
        errorId: serverErrorId,
        phase: 'http-safe-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'match',
        svgStage: 'satori-render',
      },
      'a valid SVG failure stage must remain safe, visible, and correlated to the response ID',
    )
    assert.match(
      new ShareRenderResponseError({
        code: 'SR-SVG',
        errorId: serverErrorId,
        phase: 'http-safe-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'match',
        svgStage: 'satori-render',
      }).message,
      /SR-SVG.*satori-render/,
      'the user-visible safe diagnostic must include the fixed SVG stage and never an exception message',
    )

    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(
          () => Promise.resolve(new Response(JSON.stringify({
            code: 'SR-UNKNOWN',
            errorId: '11111111----------------------------',
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'x-peak-trekker-render-id': clientErrorId,
            },
          })),
          clientErrorId,
        ),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'http-invalid-envelope',
        status: 500,
        contentType: 'json',
        responseRequestId: 'match',
      },
      'a malformed server error ID must not become a safe envelope or replace the client UUID',
    )

    const blobFailureResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'image/png',
        'x-peak-trekker-render-id': clientErrorId,
      }),
      blob: async () => {
        throw new TypeError('body read failed')
      },
    } as unknown as Response
    assert.deepEqual(
      assertShareRenderFailure(
        await readShareRenderResult(() => Promise.resolve(blobFailureResponse), clientErrorId),
      ),
      {
        code: 'SR-UNKNOWN',
        errorId: clientErrorId,
        phase: 'blob-read',
        status: 200,
        contentType: 'non-json',
        responseRequestId: 'match',
      },
      'an OK response whose PNG body fails to read must remain distinguishable',
    )
  })

  test('normal share render failures retain only safe diagnostic fields in source contracts', () => {
    const clientSource = readSource('../src/app/(flow)/share/ShareClient.tsx')
    const routeSource = readSource('../src/app/api/share/render/route.ts')
    const workerSource = readSource('../custom-worker.ts')

    assert.match(clientSource, /response\.body\?\.getReader\(\)/)
    assert.match(clientSource, /SHARE_RENDER_DIAGNOSTIC_MAX_BYTES = 4 \* 1024/)
    assert.doesNotMatch(clientSource, /response\.json\(\)/)
    assert.doesNotMatch(clientSource, /response\.text\(\)/)
    assert.match(clientSource, /code:\s*diagnostic\.code/)
    assert.match(clientSource, /render_error_id:\s*diagnostic\.errorId/)
    assert.match(clientSource, /new ShareRenderResponseError\(diagnostic\)/)
    assert.match(clientSource, /const SHARE_RENDER_FAILURE_MESSAGE = '分享图生成失败，请稍后再试'/)
    assert.match(clientSource, /async function readShareRenderResult\(/)
    assert.match(clientSource, /const result = await readShareRenderResult\(/)
    assert.match(clientSource, /super\(`\$\{SHARE_RENDER_FAILURE_MESSAGE\}（\$\{details\.join\(' · '\)\}）`\)/)
    assert.match(clientSource, /render_error_phase:\s*diagnostic\.phase/)
    assert.match(clientSource, /render_svg_stage:\s*diagnostic\.svgStage \?\? null/)
    assert.match(clientSource, /render_http_status:\s*diagnostic\.status/)
    assert.match(clientSource, /render_content_type:\s*diagnostic\.contentType/)
    assert.match(clientSource, /render_response_request_id:\s*diagnostic\.responseRequestId/)
    assert.doesNotMatch(clientSource, /diagnostic\.stack|diagnostic\.hint|diagnostic\.error\b/)

    for (const code of [
      'SR-AUTH',
      'SR-DATA',
      'SR-INVALID',
      'SR-PHOTO',
      'SR-FONT',
      'SR-BRAND',
      'SR-SVG',
      'SR-PNG',
      'SR-UNKNOWN',
    ]) {
      assert.match(routeSource, new RegExp(`shareRenderFailure\\(requestId, '${code}'`), `${code} must map to its route branch`)
    }

    assert.match(
      routeSource,
      /function shareRenderFailure\(\s*requestId: string,\s*code: ShareRenderFailureCode,\s*status: number,\s*svgStage\?: ShareRenderSvgStage,\s*\)/,
    )
    for (const stage of ['template-construction', 'satori-render', 'grayscale-postprocess']) {
      assert.match(routeSource, new RegExp(`shareRenderFailure\\(requestId, 'SR-SVG', 500, '${stage}'`))
    }
    assert.match(routeSource, /loadShareFonts[\s\S]*?SR-FONT/)
    assert.match(routeSource, /photoDataUrlForTemplate[\s\S]*?SR-PHOTO/)
    assert.match(routeSource, /loadBrandMarkMaskDataUri[\s\S]*?SR-BRAND/)
    assert.match(routeSource, /renderShareSvg[\s\S]*?SR-SVG/)
    assert.match(routeSource, /renderSvgPng[\s\S]*?SR-PNG/)
    assert.match(workerSource, /const isShareRender = new URL\(request\.url\)\.pathname === '\/api\/share\/render'/)
    assert.match(workerSource, /workerRenderFailure\(errorId, 'SR-SVG-SIZE'\)/)
    assert.match(workerSource, /workerRenderFailure\(errorId, 'SR-FONT'\)/)
    assert.match(workerSource, /workerRenderFailure\(errorId, 'SR-PNG'\)/)
    assert.match(workerSource, /if \(isShareRender\) return workerRenderFailure/)
    assert.match(workerSource, /throw error/)
    assert.match(workerSource, /errorId/)
    assert.doesNotMatch(workerSource, /stack:/)
  })

  test('share render route executes safe invalid, auth, handoff, and PNG success contracts', async () => {
    const { POST: invalidPost } = loadShareRenderRoute()
    const invalidResponse = await invalidPost(shareRenderRequest(validShareRenderBody({ template: 'unknown-template' })))
    assert.equal(invalidResponse.status, 400)
    assert.deepEqual(await invalidResponse.json(), {
      error: 'Unable to render share image',
      code: 'SR-INVALID',
      errorId: SHARE_RENDER_ERROR_ID,
    })
    assert.equal(invalidResponse.headers.get('cache-control'), 'no-store')
    assert.equal(invalidResponse.headers.get('x-peak-trekker-render-id'), SHARE_RENDER_ERROR_ID)

    const { POST: authPost } = loadShareRenderRoute({ user: null })
    const authResponse = await authPost(shareRenderRequest(validShareRenderBody()))
    assert.equal(authResponse.status, 403)
    assert.deepEqual(await authResponse.json(), {
      error: 'Unable to render share image',
      code: 'SR-AUTH',
      errorId: SHARE_RENDER_ERROR_ID,
    })
    assert.equal(authResponse.headers.get('cache-control'), 'no-store')
    assert.equal(authResponse.headers.get('x-peak-trekker-render-id'), SHARE_RENDER_ERROR_ID)

    const { POST: handoffPost } = loadShareRenderRoute({
      workerSvgResponse: async () => {
        throw new Error('worker handoff failed')
      },
    })
    const handoffResponse = await handoffPost(shareRenderRequest(validShareRenderBody()))
    assert.equal(handoffResponse.status, 500)
    assert.deepEqual(await handoffResponse.json(), {
      error: 'Unable to render share image',
      code: 'SR-UNKNOWN',
      errorId: SHARE_RENDER_ERROR_ID,
    })
    assert.equal(handoffResponse.headers.get('cache-control'), 'no-store')
    assert.equal(handoffResponse.headers.get('x-peak-trekker-render-id'), SHARE_RENDER_ERROR_ID)

    const { POST: successPost } = loadShareRenderRoute()
    for (const transparent of [false, true]) {
      const response = await successPost(shareRenderRequest(validShareRenderBody({ transparent })))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/png')
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3])
    }
  })

  test('share render maps each SVG substage to a fixed safe envelope without changing PNG success', async () => {
    const stageCases = [
      {
        stage: 'template-construction',
        route: loadShareRenderRoute({
          getShareTemplateComponent: () => () => {
            throw new Error('template construction failed')
          },
        }),
        body: validShareRenderBody(),
      },
      {
        stage: 'satori-render',
        route: loadShareRenderRoute({
          renderShareSvg: async () => {
            throw new Error('satori rendering failed')
          },
        }),
        body: validShareRenderBody(),
      },
      {
        stage: 'grayscale-postprocess',
        route: loadShareRenderRoute({
          applyPhotoGrayscaleSvgFilter: () => {
            throw new Error('grayscale postprocess failed')
          },
        }),
        body: validShareRenderBody({
          template: 'premium-mono-film',
          photoBase64: 'YWJjZA==',
        }),
      },
    ] as const

    for (const { stage, route, body } of stageCases) {
      const response = await route.POST(shareRenderRequest(body))
      assert.equal(response.status, 500, `${stage} must remain an HTTP 500 safe failure`)
      assert.deepEqual(await response.json(), {
        error: 'Unable to render share image',
        code: 'SR-SVG',
        errorId: SHARE_RENDER_ERROR_ID,
        svgStage: stage,
      })
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('x-peak-trekker-render-id'), SHARE_RENDER_ERROR_ID)
    }

    const successfulRoute = loadShareRenderRoute()
    for (const transparent of [false, true]) {
      const response = await successfulRoute.POST(shareRenderRequest(validShareRenderBody({ transparent })))
      assert.equal(response.status, 200, `${transparent ? 'transparent' : 'normal'} success must remain PNG`)
      assert.equal(response.headers.get('content-type'), 'image/png')
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3])
    }
  })

  test('custom Worker isolates share JSON failures while poster routes retain their throw contract', async () => {
    const workerRequestId = '33333333-3333-4333-8333-333333333333'
    const internalSvg = (transparent = false) => new Response('<svg/>', {
      headers: {
        'x-peak-trekker-worker-svg': '1',
        'x-peak-trekker-worker-transparent': transparent ? '1' : '0',
        'x-peak-trekker-render-id': workerRequestId,
        'content-length': '6',
        'cache-control': 'no-store',
      },
    })
    const assets = {
      fetch: async () => new Response(new Uint8Array([1, 2, 3])),
    }
    const context = { waitUntil: () => undefined, passThroughOnException: () => undefined }

    const failingWorker = loadWorkerModule({
      renderer: async () => {
        throw new Error('resvg failed')
      },
      openNextFetch: async () => internalSvg(),
    })
    const shareFailure = await failingWorker.fetch(
      new Request('https://example.test/api/share/render'),
      { ASSETS: assets },
      context,
    )
    assert.equal(shareFailure.status, 500)
    assert.deepEqual(await shareFailure.json(), {
      error: 'Unable to render share image',
      code: 'SR-PNG',
      errorId: workerRequestId,
    })
    assert.equal(shareFailure.headers.get('cache-control'), 'no-store')
    assert.equal(shareFailure.headers.get('x-peak-trekker-render-id'), workerRequestId)

    for (const route of ['/api/poster', '/api/poster-preview']) {
      await assert.rejects(
        () => failingWorker.fetch(new Request(`https://example.test${route}`), { ASSETS: assets }, context),
        /resvg failed/,
        `${route} must retain its existing Worker throw behavior`,
      )
    }

    const renderCalls: boolean[] = []
    const successfulWorker = loadWorkerModule({
      renderer: async ({ transparent }) => {
        renderCalls.push(transparent)
        return new Uint8Array([7, 8, 9])
      },
      openNextFetch: async (request) => internalSvg(new URL(request.url).searchParams.get('transparent') === '1'),
    })
    for (const transparent of [false, true]) {
      const response = await successfulWorker.fetch(
        new Request(`https://example.test/api/share/render?transparent=${transparent ? '1' : '0'}`),
        { ASSETS: assets },
        context,
      )
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/png')
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('x-peak-trekker-render-id'), workerRequestId)
      assert.equal(response.headers.get('x-peak-trekker-worker-svg'), null)
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [7, 8, 9])
    }
    assert.deepEqual(renderCalls, [false, true])
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
