import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import sharp from 'sharp'
import { parseFieldsFromOcr } from '../src/lib/screenshot/field-parser.ts'
import { SCREENSHOT_OCR_FIXTURES } from '../tests/fixtures/screenshots/ocr-fixtures.ts'
import type { OcrTextBlock, ParsedScreenshotFields } from '../src/lib/screenshot/types.ts'

const MODEL = 'mimo-v2.5'
const OPENAI_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions'
const ANTHROPIC_ENDPOINT = 'https://api.xiaomimimo.com/anthropic/v1/messages'
const IMAGE_DIR = join(process.cwd(), '爬山轨迹结果参考图片')
const RAW_OCR_DIR = join(process.cwd(), 'tests/fixtures/screenshots/raw-ocr')
const OUTPUT_DIR = join(process.cwd(), 'output/mimo-spike-acceptance')
const RESULT_DIR = join(OUTPUT_DIR, 'results')
const OVERLAY_DIR = join(OUTPUT_DIR, 'overlays')
const TRACK_PROBE_DIR = join(OUTPUT_DIR, 'track-probe')
const FULL_TRACK_DIR = join(OUTPUT_DIR, 'track-overlays')
const STABILITY_DIR = join(OUTPUT_DIR, 'stability')
const SCHEMA_VERSION = 'mimo-v25-spike-all-v2'

const ADOPTED_PRICE_CNY_PER_MILLION = {
  inputCacheMiss: 1,
  inputCacheHit: 0.02,
  output: 2,
  source: 'user-provided 2026-05-27 mimo-v2.5 price screenshot',
  discrepancy:
    'Official public docs previously showed higher pay-as-you-go values; report both if live docs still differ.',
}

const OFFICIAL_PRICE_REFERENCE = {
  payAsYouGoUrl: 'https://platform.xiaomimimo.com/docs/en-US/price/pay-as-you-go',
  priceUpdateUrl: 'https://platform.xiaomimimo.com/docs/en-US/news/v2.5-price-update',
  checkedAt: '2026-06-01',
  accessiblePayAsYouGoSnapshot:
    'Search/index snippets still showed older pay-as-you-go rows updated 2026-05-22: cache hit ¥0.56/M, cache miss ¥2.80/M, output ¥14/M.',
  priceUpdateSnapshot:
    'The MiMo-V2.5 price-adjustment announcement is dated 2026-05-27 and states reduced MiMo-V2.5 API prices effective 2026-05-27 00:00 Beijing time; the user-provided 2026-05-27 screenshot is used as the adopted billing rate.',
}

const STABILITY_SAMPLE_IDS = ['liangbulu-631', 'apple-watch-639'] as const

type Mode = 'dry-run' | 'smoke' | 'all' | 'track-probe'

type GroundTruthField<T> = {
  value: T
  raw?: string
}

type GroundTruth = {
  distanceKm?: GroundTruthField<number>
  durationSeconds?: GroundTruthField<number>
  speedKmh?: GroundTruthField<number>
  paceMinPerKm?: GroundTruthField<number>
  elevationMeters?: GroundTruthField<number>
  elevationGainMeters?: GroundTruthField<number>
  caloriesKcal?: GroundTruthField<number>
  date?: GroundTruthField<string>
  location?: GroundTruthField<string>
}

type Sample = {
  id: string
  app: string
  fileName: string
  imageId: string
  mapStyle: 'stats_only' | 'dark_map_bright_line' | 'satellite_red_line' | 'map_route' | 'unclear'
  notes: string
  groundTruth: GroundTruth
  fixtureId?: string
  tencentBaseline?: ParsedScreenshotFields | null
  tencentBaselineNote?: string
}

type MimoUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  raw: unknown
}

type RoutePoint = { x: number; y: number }
type RouteTopology = 'through' | 'loop' | 'unknown'
type RouteTruth = 'map_track' | 'stats_only' | 'unclear'
type TextFieldKey =
  | 'distanceKm'
  | 'durationSeconds'
  | 'speedKmh'
  | 'paceMinPerKm'
  | 'elevationMeters'
  | 'elevationGainMeters'
  | 'caloriesKcal'
  | 'date'
  | 'location'
type TruthVisibility = 'visible' | 'not_visible' | 'ambiguous'
type FieldScoreStatus = 'match' | 'mismatch' | 'missing' | 'false_positive' | 'not_scored' | 'wrong_field'
type FieldWinner = 'mimo_only' | 'tencent_only' | 'both_correct' | 'both_wrong' | 'both_missing' | 'not_scored'

type VisibleTruthField = {
  value: number | string | null
  raw: string | null
  visibility: TruthVisibility
  source: string
}

type VisibleGroundTruth = {
  routeTruth: RouteTruth
  fields: Record<TextFieldKey, VisibleTruthField>
  notes?: string
}

type RouteMarker = {
  kind: 'start' | 'end' | 'intermediate'
  x: number
  y: number
  label?: string | null
  confidence?: number | null
  evidence?: string | null
}

type ProbeGrade = 'faithful' | 'rough' | 'poor' | 'no-track'

type TrackProbeMetrics = {
  candidateToReferenceP95: number | null
  referenceToCandidateP95: number | null
  candidateOnReferenceRatio: number | null
  referenceCoverageRatio: number | null
  referenceComponentCount: number
  endpointErrorPx: number | null
  markerToRouteMeanPx: number | null
  maxSegmentGapPx: number | null
  tortuosity: number | null
  referenceTortuosity: number | null
  tortuosityRatio: number | null
  turnDensity: number | null
  referenceTurnDensity: number | null
  turnDensityRatio: number | null
}

type TrackProbeCandidate = {
  sampleId: string
  method: 'mimo-hd' | 'cv'
  routeType: 'Type A' | 'Type B' | 'no-track' | 'unclear'
  topology?: RouteTopology
  points: RoutePoint[]
  markers: RouteMarker[]
  grade: ProbeGrade
  metrics: TrackProbeMetrics
  notes: string[]
  overlayPath?: string
  debugMaskPath?: string
  api?: {
    latencyMs: number
    status: number
    jsonParseable: boolean
    parsePath: string
    usage?: MimoUsage
    costCny: number
    thinkingAccepted?: boolean | null
    reusedFromCache?: boolean
  }
}

type TrackProbeResult = {
  sample: Omit<Sample, 'tencentBaseline'>
  width: number
  height: number
  referenceMask: {
    routePixelCount: number
    componentCount: number
    selectedComponentCount: number
    falsePositiveComponentCount: number
    redRoadInterference?: string
  }
  candidates: TrackProbeCandidate[]
}

type MimoParsedPayload = {
  sampleId?: string
  app?: string | null
  imageType?: 'map_track' | 'stats_only' | 'unclear'
  stats?: Record<string, unknown>
  route?: {
    classification?: 'map_track' | 'stats_only' | 'unclear'
    routeType?: 'Type A' | 'Type B' | 'no-track' | 'unclear' | string | null
    topologyHint?: RouteTopology | string | null
    mapStyle?: string | null
    lineColor?: string | null
    lineColors?: Array<{
      name?: string | null
      hex?: string | null
      hsv?: { h?: number | null; s?: number | null; v?: number | null } | null
      confidence?: number | null
      evidence?: string | null
    }>
    strokeSamples?: Array<RoutePoint & { color?: string | null; evidence?: string | null }>
    markers?: RouteMarker[]
    points?: RoutePoint[]
    bbox?: { x?: number; y?: number; width?: number; height?: number } | null
    confidence?: number | null
    description?: string | null
    failureReason?: string | null
  }
  confusions?: unknown[]
  evidence?: unknown[]
}

type MimoRunResult = {
  schemaVersion?: string
  sample: Omit<Sample, 'tencentBaseline'>
  api: {
    endpoint: 'openai-compatible' | 'anthropic-compatible'
    model: string
    thinkingAccepted: boolean | null
    repairAttempts: number
    anthropicFallbackUsed: boolean
    latencyMs: number
    status: number
  }
  usage: MimoUsage
  pricing: {
    adoptedCny: number
    adoptedRate: typeof ADOPTED_PRICE_CNY_PER_MILLION
  }
  json: {
    parseable: boolean
    parsePath: string
    error?: string
  }
  parsed: MimoParsedPayload | null
  rawModelText: string
  overlayPath?: string
  comparison?: Record<string, unknown>
}

type TencentTextDetection = {
  DetectedText?: string
  Confidence?: number
  Polygon?: Array<{ X?: number; Y?: number }>
}

type RecordedOcrFixture = {
  tencentOcrRaw: {
    TextDetections?: TencentTextDetection[]
  }
}

function parseArgs(): Mode {
  const modeArg = process.argv.find((arg) => arg === '--dry-run' || arg === '--smoke' || arg === '--all' || arg === '--track-probe')
  if (!modeArg) {
    throw new Error('Usage: node --experimental-strip-types --env-file=.env.local scripts/mimo-v25-spike.ts --smoke|--all|--dry-run|--track-probe')
  }
  return modeArg.replace('--', '') as Mode
}

function requireMimoApiKey() {
  const value = process.env.MIMO_API_KEY
  if (!value) {
    throw new Error('MIMO_API_KEY is missing. Load it with --env-file=.env.local or export it in the shell.')
  }
  return value
}

function fixtureTruthToGroundTruth(fixture: (typeof SCREENSHOT_OCR_FIXTURES)[number]): GroundTruth {
  const expected = fixture.expected
  return {
    ...(typeof expected.distanceKm === 'number' ? { distanceKm: { value: expected.distanceKm } } : {}),
    ...(typeof expected.durationSeconds === 'number' ? { durationSeconds: { value: expected.durationSeconds } } : {}),
    ...(typeof expected.speedKmh === 'number' ? { speedKmh: { value: expected.speedKmh } } : {}),
    ...(typeof expected.elevationGainM === 'number' ? { elevationGainMeters: { value: expected.elevationGainM } } : {}),
    ...(typeof expected.maxElevationM === 'number' ? { elevationMeters: { value: expected.maxElevationM } } : {}),
    ...(typeof expected.date === 'string' ? { date: { value: expected.date } } : {}),
    ...(typeof expected.location === 'string' ? { location: { value: expected.location } } : {}),
  }
}

function mapStyleForFixture(fixture: (typeof SCREENSHOT_OCR_FIXTURES)[number]): Sample['mapStyle'] {
  const source = `${fixture.id} ${fixture.app} ${fixture.notes}`.toLowerCase()
  if (/apple|watch|oppo|sigma|watermark|running|keep-watermark/u.test(source)) return 'stats_only'
  if (/strava|两步路|liangbulu|foooooot|六只脚|keep|悦动圈|petal|奥维|ovital/u.test(source)) return 'map_route'
  if (/coros|suunto|zepp|xiaomi|huawei|咕咚|codoon/u.test(source)) return 'dark_map_bright_line'
  return 'unclear'
}

function buildManualSamples(): Sample[] {
  return [
    {
      id: 'wechat-711',
      app: '两步路',
      fileName: '微信图片_20260601143833_711_2.jpg',
      imageId: '711',
      mapStyle: 'satellite_red_line',
      notes: 'No Tencent raw fixture. Key smoke sample with satellite basemap, red route, speed and pace both visible.',
      groundTruth: {
        distanceKm: { value: 12.05, raw: '12.05公里' },
        durationSeconds: { value: 4 * 3600 + 33 * 60 + 2, raw: '04:33:02 全程耗时' },
        speedKmh: { value: 2.6, raw: '2.6 全程均速(公里/小时)' },
        paceMinPerKm: { value: 18 + 47 / 60, raw: '18′47″ 平均配速' },
        elevationGainMeters: { value: 634, raw: '634 累计爬升(米)' },
        elevationMeters: { value: 373, raw: '373 最高海拔(米)' },
        date: { value: '2026-05-31', raw: '2026.05.31 13:14' },
        location: { value: '广州龙眼洞森林公园/凤凰山附近', raw: 'map labels near 龙眼洞森林公园 / 凤凰山' },
      },
      tencentBaseline: null,
      tencentBaselineNote: 'missing: no raw OCR fixture exists for _711',
    },
    {
      id: 'wechat-712',
      app: 'COROS',
      fileName: '微信图片_20260601144052_712_2.jpg',
      imageId: '712',
      mapStyle: 'dark_map_bright_line',
      notes:
        'No Tencent raw fixture. COROS style group only; do not borrow coros-629 stats baseline.',
      groundTruth: {
        distanceKm: { value: 10.32, raw: '10.32 km 距离' },
        durationSeconds: { value: 3 * 3600 + 34 * 60 + 19, raw: '3:34:19 运动时间' },
        speedKmh: { value: 2.9, raw: '2.9 km/h 平均速度' },
        elevationGainMeters: { value: 544, raw: '544 m 累计上升' },
        caloriesKcal: { value: 2453, raw: '2453 kcal 卡路里' },
        date: { value: '2026-05-02', raw: '2026年5月2日 上午9:00' },
        location: { value: '阳江市', raw: '阳江市 登山' },
      },
      tencentBaseline: null,
      tencentBaselineNote: 'missing: no raw OCR fixture exists for _712; style group only, no stats baseline borrowing',
    },
  ]
}

const TEXT_FIELD_KEYS: TextFieldKey[] = [
  'distanceKm',
  'durationSeconds',
  'speedKmh',
  'paceMinPerKm',
  'elevationMeters',
  'elevationGainMeters',
  'caloriesKcal',
  'date',
  'location',
]

const FIELD_TOLERANCE: Record<TextFieldKey, number> = {
  distanceKm: 0.05,
  durationSeconds: 60,
  speedKmh: 0.1,
  paceMinPerKm: 0.12,
  elevationMeters: 2,
  elevationGainMeters: 2,
  caloriesKcal: 5,
  date: 0,
  location: 0,
}

const VISIBLE_GROUND_TRUTH: Record<string, { routeTruth: RouteTruth; notes?: string }> = {
  'coros-629': { routeTruth: 'map_track', notes: 'Visible dark map with lime route.' },
  'coros-cropped-630': { routeTruth: 'map_track', notes: 'Visible dark map with lime route; cropped stats remain visible.' },
  'liangbulu-631': { routeTruth: 'map_track', notes: 'Visible two-bulu route preview and stats stack.' },
  'two-bulu-15-53-actual': { routeTruth: 'map_track', notes: 'Fixture may be absent from current 26-image source folder.' },
  'coros-walking-6-81-actual': { routeTruth: 'map_track', notes: 'Fixture may be absent from current 26-image source folder.' },
  'zepp-trex3-632': { routeTruth: 'map_track', notes: 'Visible satellite map with yellow route.' },
  'zepp-balance-633': { routeTruth: 'map_track', notes: 'Visible stitched map panels with yellow route.' },
  'zepp-trex3pro-634': { routeTruth: 'map_track', notes: 'Visible satellite map with green route.' },
  'suunto-635': { routeTruth: 'map_track', notes: 'Visible map route near top.' },
  'ovital-636': { routeTruth: 'map_track', notes: 'Visible route-planning map with multiple colored tracks.' },
  'suunto-coros-637': { routeTruth: 'map_track', notes: 'Visible stitched route comparison panels.' },
  'oppo-watch-638': { routeTruth: 'map_track', notes: 'Watch summary includes visible map route.' },
  'apple-watch-639': { routeTruth: 'map_track', notes: 'Workout summary includes a small visible map route.' },
  'xiaomi-640': { routeTruth: 'map_track', notes: 'Visible map with orange/green route.' },
  'xiaomi-taishan-641': { routeTruth: 'map_track', notes: 'Visible map route in the mountain area.' },
  'huawei-642': { routeTruth: 'map_track', notes: 'Visible map route with marker dots.' },
  'huawei-shenzhen-643': { routeTruth: 'map_track', notes: 'Visible map route with marker dots.' },
  'strava-suzhou-644': { routeTruth: 'map_track', notes: 'Visible Strava route crop.' },
  'strava-huangshan-645': { routeTruth: 'map_track', notes: 'Visible Strava route crop.' },
  'yuedongquan-646': { routeTruth: 'map_track', notes: 'Visible map section; route evidence may be low contrast.' },
  'codoon-647': { routeTruth: 'map_track', notes: 'Visible route map with numbered dots.' },
  'keep-648': { routeTruth: 'map_track', notes: 'Visible route map in activity summary.' },
  'petal-maps-649': { routeTruth: 'map_track', notes: 'Visible Petal Maps route line.' },
  'foooooot-650': { routeTruth: 'map_track', notes: 'Visible route map with multi-color route.' },
  'sigma-652': { routeTruth: 'map_track', notes: 'Watermarked Sigma screenshot still includes a visible route line.' },
  'keep-watermark-653': { routeTruth: 'map_track', notes: 'Watermarked Keep screenshot still includes a visible route line.' },
  'wechat-711': { routeTruth: 'map_track', notes: 'User-accepted faithful v2 route probe; satellite red route.' },
  'wechat-712': { routeTruth: 'map_track', notes: 'User-accepted faithful v2 route probe; dark COROS lime route.' },
}

function truthFieldFromSample(sample: Sample, key: TextFieldKey): VisibleTruthField {
  const source = sample.fixtureId ? 'visible-ledger seeded from OCR fixture expectation' : 'visible-ledger manual transcription'
  const truth = sample.groundTruth
  const value =
    key === 'distanceKm'
      ? truth.distanceKm
      : key === 'durationSeconds'
        ? truth.durationSeconds
        : key === 'speedKmh'
          ? truth.speedKmh
          : key === 'paceMinPerKm'
            ? truth.paceMinPerKm
            : key === 'elevationMeters'
              ? truth.elevationMeters
              : key === 'elevationGainMeters'
                ? truth.elevationGainMeters
                : key === 'caloriesKcal'
                  ? truth.caloriesKcal
                  : key === 'date'
                    ? truth.date
                    : truth.location
  if (!value) {
    return { value: null, raw: null, visibility: 'not_visible', source }
  }
  return {
    value: value.value,
    raw: value.raw ?? String(value.value),
    visibility: 'visible',
    source,
  }
}

function visibleGroundTruthForSample(sample: Sample): VisibleGroundTruth {
  const fields = Object.fromEntries(TEXT_FIELD_KEYS.map((key) => [key, truthFieldFromSample(sample, key)])) as Record<
    TextFieldKey,
    VisibleTruthField
  >
  const visible = VISIBLE_GROUND_TRUTH[sample.id]
  return {
    routeTruth: visible?.routeTruth ?? (sample.mapStyle === 'stats_only' ? 'stats_only' : 'map_track'),
    fields,
    notes: visible?.notes ?? 'No explicit visible-ledger note; route truth inferred from manifest style.',
  }
}

function imageIdFromSourceFile(fileName: string) {
  return fileName.match(/_(\d+)_\d+\.jpg$/u)?.[1] ?? fileName
}

function bounds(polygon: TencentTextDetection['Polygon']) {
  const points = (polygon ?? []).flatMap((point) => {
    const x = Number(point.X)
    const y = Number(point.Y)
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : []
  })
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

async function readRecordedBlocks(fixtureId: string): Promise<OcrTextBlock[]> {
  const fixture = JSON.parse(
    await readFile(join(RAW_OCR_DIR, `${fixtureId}.json`), 'utf8')
  ) as RecordedOcrFixture

  return (fixture.tencentOcrRaw.TextDetections ?? []).flatMap((item) => {
    const text = item.DetectedText?.trim()
    if (!text) return []
    return [
      {
        text,
        confidence: Number(item.Confidence ?? 0),
        ...bounds(item.Polygon),
      },
    ]
  })
}

async function buildSamples(): Promise<Sample[]> {
  const fixtureSamples = await Promise.all(
    SCREENSHOT_OCR_FIXTURES
      .filter((fixture) => existsSync(join(IMAGE_DIR, fixture.sourceFileName)))
      .map(async (fixture) => {
        const blocks = await readRecordedBlocks(fixture.id)
        const tencentBaseline = parseFieldsFromOcr(blocks)
        return {
          id: fixture.id,
          app: fixture.app,
          fileName: fixture.sourceFileName,
          imageId: imageIdFromSourceFile(fixture.sourceFileName),
          mapStyle: mapStyleForFixture(fixture),
          notes: fixture.notes,
          groundTruth: fixtureTruthToGroundTruth(fixture),
          fixtureId: fixture.id,
          tencentBaseline,
          tencentBaselineNote: 'available from raw OCR fixture + field-parser.ts',
        } satisfies Sample
      })
  )

  return [...fixtureSamples, ...buildManualSamples()].sort((a, b) => a.imageId.localeCompare(b.imageId, 'en', { numeric: true }))
}

function promptForSample(sample: Sample, width: number, height: number) {
  return `You are evaluating a hiking activity screenshot for Peak Trekker.

Return JSON only. Do not wrap in Markdown. Use the original image pixel coordinate system: x=0..${width}, y=0..${height}, origin at the top-left.

Product goal:
- Extract activity stats from the screenshot.
- If a map route is visible, trace only the visible route shape as pixel points. This is not GPS and must not claim geographic precision.
- If no map route is visible, say stats_only and do not hallucinate route points.

Critical disambiguation:
- Speed is km/h, pace is min/km. Do not convert fastest speed into average speed.
- Elevation/highest altitude is not elevation gain/climb/ascent.
- Calories, heart rate, steps, training load, fastest kilometer, and fastest speed are not the primary hiking stats unless explicitly requested in their own fields.

Known sample context:
- sampleId: ${sample.id}
- expected app/style hint: ${sample.app}, ${sample.mapStyle}
- notes: ${sample.notes}

JSON schema:
{
  "sampleId": "${sample.id}",
  "app": string | null,
  "imageType": "map_track" | "stats_only" | "unclear",
  "stats": {
    "distanceKm": {"value": number | null, "raw": string | null, "confidence": number},
    "durationSeconds": {"value": number | null, "raw": string | null, "confidence": number},
    "speedKmh": {"value": number | null, "raw": string | null, "confidence": number},
    "paceMinPerKm": {"value": number | null, "raw": string | null, "confidence": number},
    "elevationMeters": {"value": number | null, "raw": string | null, "confidence": number},
    "elevationGainMeters": {"value": number | null, "raw": string | null, "confidence": number},
    "caloriesKcal": {"value": number | null, "raw": string | null, "confidence": number},
    "date": {"value": "YYYY-MM-DD" | null, "raw": string | null, "confidence": number},
    "location": {"value": string | null, "raw": string | null, "confidence": number}
  },
  "route": {
    "classification": "map_track" | "stats_only" | "unclear",
    "routeType": "Type A" | "Type B" | "no-track" | "unclear",
    "topologyHint": "through" | "loop" | "unknown",
    "mapStyle": string | null,
    "lineColor": string | null,
    "lineColors": [
      {
        "name": string | null,
        "hex": "#RRGGBB" | null,
        "hsv": {"h": number | null, "s": number | null, "v": number | null},
        "confidence": number,
        "evidence": string | null
      }
    ],
    "strokeSamples": [{"x": number, "y": number, "color": "#RRGGBB" | null, "evidence": string | null}],
    "points": [{"x": number, "y": number}],
    "markers": [{"kind": "start" | "end" | "intermediate", "x": number, "y": number, "label": string | null, "confidence": number, "evidence": string | null}],
    "bbox": {"x": number, "y": number, "width": number, "height": number} | null,
    "confidence": number,
    "description": string | null,
    "failureReason": string | null
  },
  "confusions": [{"kind": string, "description": string}],
  "evidence": [{"field": string, "text": string}]
}

For route points:
- Return 20 to 100 ordered seed points for visible map routes. These are only seeds for local CV; preserve turns but do not invent precision.
- Return 4 to 12 strokeSamples on the visible route line and identify the route line color. If multiple route colors are present, list each visible route color in lineColors.
- Identify start/end markers when visible. For Type B routes, include visible intermediate marker centers; do not include numeric marker labels in the route shape itself.
- Use an empty array for stats_only or unclear route.
- Avoid points on UI labels, cards, buttons, or markers unless the route passes underneath them.
- If no route is visible, classification must be stats_only and points/markers/strokeSamples must be empty.`
}

function openAiPayload(sample: Sample, dataUri: string, width: number, height: number, includeThinking: boolean) {
  return {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptForSample(sample, width, height) },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 4500,
    ...(includeThinking ? { thinking: { type: 'disabled' } } : {}),
  }
}

function repairPayload(sample: Sample, invalidText: string) {
  return {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Fix this model output into valid JSON only, matching the requested schema for sample ${sample.id}. Do not add Markdown or explanation.\n\n${invalidText}`,
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 4500,
  }
}

function anthropicPayload(sample: Sample, dataUri: string, width: number, height: number) {
  const base64 = dataUri.replace(/^data:image\/jpeg;base64,/u, '')
  return {
    model: MODEL,
    max_tokens: 4500,
    temperature: 0,
    tools: [
      {
        name: 'record_screenshot_benchmark',
        description: 'Record structured stats and route extraction from a hiking screenshot.',
        input_schema: {
          type: 'object',
          properties: {
            sampleId: { type: 'string' },
            app: { type: ['string', 'null'] },
            imageType: { enum: ['map_track', 'stats_only', 'unclear'] },
            stats: { type: 'object' },
            route: { type: 'object' },
            confusions: { type: 'array' },
            evidence: { type: 'array' },
          },
          required: ['sampleId', 'imageType', 'stats', 'route'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_screenshot_benchmark' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptForSample(sample, width, height) },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        ],
      },
    ],
  }
}

async function postJson(endpoint: string, apiKey: string, body: unknown, headerMode: 'openai' | 'anthropic') {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': apiKey,
  }
  if (headerMode === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01'
  }

  const started = performance.now()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const latencyMs = Math.round(performance.now() - started)
  const responseText = await response.text()
  let json: unknown = null
  try {
    json = responseText ? JSON.parse(responseText) : null
  } catch {
    json = { raw: responseText }
  }

  return { status: response.status, ok: response.ok, json, responseText, latencyMs }
}

function extractOpenAiContent(responseJson: unknown): string {
  const choices = (responseJson as { choices?: Array<{ message?: { content?: unknown } }> })?.choices
  const content = choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text: unknown }).text)
        return ''
      })
      .join('')
  }
  return ''
}

function extractAnthropicToolInput(responseJson: unknown): MimoParsedPayload | null {
  const content = (responseJson as { content?: unknown[] })?.content
  if (!Array.isArray(content)) return null
  for (const part of content) {
    if (part && typeof part === 'object' && (part as { type?: string }).type === 'tool_use') {
      return ((part as { input?: MimoParsedPayload }).input ?? null)
    }
  }
  return null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return 0
}

function usageFromResponse(responseJson: unknown): MimoUsage {
  const usage = (responseJson as { usage?: Record<string, unknown> })?.usage ?? {}
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined
  const inputDetails = usage.input_tokens_details as Record<string, unknown> | undefined
  const inputTokens = firstNumber(usage.prompt_tokens, usage.input_tokens)
  const outputTokens = firstNumber(usage.completion_tokens, usage.output_tokens)
  const cachedInputTokens = firstNumber(
    promptDetails?.cached_tokens,
    inputDetails?.cached_tokens,
    inputDetails?.cache_read_input_tokens,
    usage.cached_input_tokens
  )
  const totalTokens = firstNumber(usage.total_tokens, inputTokens + outputTokens)
  return { inputTokens, cachedInputTokens, outputTokens, totalTokens, raw: usage }
}

function costCny(usage: MimoUsage) {
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens)
  return (
    (uncached * ADOPTED_PRICE_CNY_PER_MILLION.inputCacheMiss +
      usage.cachedInputTokens * ADOPTED_PRICE_CNY_PER_MILLION.inputCacheHit +
      usage.outputTokens * ADOPTED_PRICE_CNY_PER_MILLION.output) /
    1_000_000
  )
}

function tryParseJsonObject(text: string): { ok: true; value: MimoParsedPayload; path: string } | { ok: false; error: string } {
  const candidates = [
    { path: 'direct', text },
    { path: 'fenced', text: text.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1] ?? '' },
    { path: 'first-object', text: text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) },
  ].filter((candidate) => candidate.text.trim())

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate.text) as MimoParsedPayload
      return { ok: true, value, path: candidate.path }
    } catch {
      // Continue through parse strategies.
    }
  }

  return { ok: false, error: 'No valid JSON object could be parsed from model output.' }
}

function sanitizeForOutput(result: MimoRunResult) {
  return result
}

function numericFromMimo(stats: Record<string, unknown> | undefined, key: string): number | undefined {
  const field = stats?.[key]
  if (!field || typeof field !== 'object') return undefined
  const value = Number((field as { value?: unknown }).value)
  return Number.isFinite(value) ? value : undefined
}

function compareField(actual: number | undefined, expected: number | undefined, tolerance: number) {
  if (typeof expected !== 'number') return { expected: null, actual: actual ?? null, status: 'not_scored' }
  if (typeof actual !== 'number') return { expected, actual: null, status: 'missing' }
  const delta = actual - expected
  return { expected, actual, delta, status: Math.abs(delta) <= tolerance ? 'match' : 'mismatch' }
}

function compareResult(parsed: MimoParsedPayload | null, sample: Sample) {
  const stats = parsed?.stats
  const truth = sample.groundTruth
  return {
    distanceKm: compareField(numericFromMimo(stats, 'distanceKm'), truth.distanceKm?.value, 0.05),
    durationSeconds: compareField(numericFromMimo(stats, 'durationSeconds'), truth.durationSeconds?.value, 60),
    speedKmh: compareField(numericFromMimo(stats, 'speedKmh'), truth.speedKmh?.value, 0.1),
    paceMinPerKm: compareField(numericFromMimo(stats, 'paceMinPerKm'), truth.paceMinPerKm?.value, 0.1),
    elevationMeters: compareField(numericFromMimo(stats, 'elevationMeters'), truth.elevationMeters?.value, 2),
    elevationGainMeters: compareField(numericFromMimo(stats, 'elevationGainMeters'), truth.elevationGainMeters?.value, 2),
    caloriesKcal: compareField(numericFromMimo(stats, 'caloriesKcal'), truth.caloriesKcal?.value, 5),
  }
}

function rawFieldFromMimo(stats: Record<string, unknown> | undefined, key: TextFieldKey) {
  const field = stats?.[key]
  if (!field || typeof field !== 'object') return ''
  const raw = (field as { raw?: unknown }).raw
  return typeof raw === 'string' ? raw : ''
}

function valueFromMimo(result: MimoRunResult | undefined, key: TextFieldKey) {
  const field = result?.parsed?.stats?.[key]
  if (!field || typeof field !== 'object') return { value: null as number | string | null, raw: '' }
  const raw = rawFieldFromMimo(result?.parsed?.stats, key)
  const value = (field as { value?: unknown }).value
  if (key === 'date' || key === 'location') {
    return { value: typeof value === 'string' && value.trim() ? value.trim() : null, raw }
  }
  const numberValue = Number(value)
  return { value: Number.isFinite(numberValue) ? numberValue : null, raw }
}

function valueFromTencent(sample: Sample, key: TextFieldKey) {
  const baseline = sample.tencentBaseline
  if (!baseline) return { value: null as number | string | null, raw: '', available: false }
  const field =
    key === 'distanceKm'
      ? baseline.distance
      : key === 'durationSeconds'
        ? baseline.duration
        : key === 'speedKmh'
          ? baseline.speed
          : key === 'paceMinPerKm'
            ? baseline.paceMinPerKm
            : key === 'elevationMeters'
              ? baseline.elevation
              : key === 'elevationGainMeters'
                ? baseline.elevationGain
                : key === 'caloriesKcal'
                  ? baseline.calories
                  : key === 'date'
                    ? baseline.date
                    : baseline.location
  if (!field) return { value: null as number | string | null, raw: '', available: true }
  return { value: field.value, raw: field.raw, available: true }
}

function normalizeTextValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/gu, '').replace(/[，,。.\-_/]/gu, '')
}

function valuesClose(a: number | string | null, b: number | string | null, tolerance: number) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tolerance
  if (typeof a === 'string' && typeof b === 'string') {
    const left = normalizeTextValue(a)
    const right = normalizeTextValue(b)
    if (!left || !right) return false
    return left === right || left.includes(right) || right.includes(left)
  }
  return false
}

function wrongFieldNote(field: TextFieldKey, actual: number | string | null, truth: VisibleGroundTruth) {
  if (typeof actual !== 'number') return null
  const pairings: Array<[TextFieldKey, string]> =
    field === 'speedKmh'
      ? [['paceMinPerKm', 'pace_as_speed']]
      : field === 'paceMinPerKm'
        ? [['speedKmh', 'speed_as_pace']]
        : field === 'elevationMeters'
          ? [['elevationGainMeters', 'gain_as_elevation']]
          : field === 'elevationGainMeters'
            ? [['elevationMeters', 'elevation_as_gain']]
            : []
  for (const [otherField, note] of pairings) {
    const other = truth.fields[otherField]
    if (other.visibility === 'visible' && typeof other.value === 'number' && valuesClose(actual, other.value, FIELD_TOLERANCE[otherField])) {
      return note
    }
  }
  return null
}

function scoreValue(
  field: TextFieldKey,
  actual: { value: number | string | null; raw: string },
  truth: VisibleGroundTruth
): { status: FieldScoreStatus; note: string } {
  const expected = truth.fields[field]
  if (expected.visibility === 'ambiguous') return { status: 'not_scored', note: 'truth_ambiguous' }
  if (expected.visibility === 'not_visible') {
    return actual.value === null ? { status: 'missing', note: 'truth_not_visible' } : { status: 'false_positive', note: 'field_not_visible_in_truth' }
  }
  if (actual.value === null) return { status: 'missing', note: 'visible_truth_missing_in_engine' }
  if (valuesClose(actual.value, expected.value, FIELD_TOLERANCE[field])) return { status: 'match', note: 'within_tolerance' }
  const wrong = wrongFieldNote(field, actual.value, truth)
  if (wrong) return { status: 'wrong_field', note: wrong }
  return { status: 'mismatch', note: 'outside_tolerance' }
}

function winnerFor(mimo: FieldScoreStatus, tencent: FieldScoreStatus | 'n/a', truthVisibility: TruthVisibility): FieldWinner {
  if (truthVisibility !== 'visible') return 'not_scored'
  const mimoOk = mimo === 'match'
  const tencentOk = tencent === 'match'
  if (mimoOk && tencentOk) return 'both_correct'
  if (mimoOk && !tencentOk) return 'mimo_only'
  if (!mimoOk && tencentOk) return 'tencent_only'
  if (mimo === 'missing' && (tencent === 'missing' || tencent === 'n/a')) return 'both_missing'
  return 'both_wrong'
}

function buildTextComparisons(samples: Sample[], results: MimoRunResult[]): FieldComparison[] {
  const resultById = new Map(results.map((result) => [result.sample.id, result]))
  return samples.flatMap((sample) => {
    const result = resultById.get(sample.id)
    const truth = visibleGroundTruthForSample(sample)
    return TEXT_FIELD_KEYS.map((field): FieldComparison => {
      const mimoValue = valueFromMimo(result, field)
      const tencentValue = valueFromTencent(sample, field)
      const mimoScore = scoreValue(field, mimoValue, truth)
      const tencentScore = tencentValue.available ? scoreValue(field, tencentValue, truth) : { status: 'n/a' as const, note: 'no_tencent_fixture' }
      const winner = winnerFor(mimoScore.status, tencentScore.status, truth.fields[field].visibility)
      return {
        sampleId: sample.id,
        app: sample.app,
        field,
        truthValue: truth.fields[field].value === null ? '' : String(truth.fields[field].value),
        truthRaw: truth.fields[field].raw ?? '',
        truthVisibility: truth.fields[field].visibility,
        mimoValue: mimoValue.value === null ? '' : String(mimoValue.value),
        mimoRaw: mimoValue.raw,
        mimoStatus: mimoScore.status,
        tencentValue: tencentValue.value === null ? '' : String(tencentValue.value),
        tencentRaw: tencentValue.raw,
        tencentStatus: tencentScore.status,
        winner,
        note: [mimoScore.note, tencentScore.note].filter(Boolean).join(' | '),
      }
    })
  })
}

async function writeTextComparisonOutputs(samples: Sample[], results: MimoRunResult[]) {
  const rows = buildTextComparisons(samples, results)
  const comparisonCsv = [
    [
      'sampleId',
      'app',
      'field',
      'truthValue',
      'truthRaw',
      'truthVisibility',
      'mimoValue',
      'mimoRaw',
      'mimoStatus',
      'tencentValue',
      'tencentRaw',
      'tencentStatus',
      'winner',
      'note',
    ].join(','),
    ...rows.map((row) =>
      [
        row.sampleId,
        row.app,
        row.field,
        row.truthValue,
        row.truthRaw,
        row.truthVisibility,
        row.mimoValue,
        row.mimoRaw,
        row.mimoStatus,
        row.tencentValue,
        row.tencentRaw,
        row.tencentStatus,
        row.winner,
        row.note,
      ]
        .map(csvValue)
        .join(',')
    ),
  ]
  const comparisonPath = join(OUTPUT_DIR, 'text-comparison.csv')
  await writeFile(comparisonPath, comparisonCsv.join('\n'))

  const summaryRows = [
    'field,visibleTruthRows,mimoMatch,mimoWrongField,mimoMismatch,mimoMissing,mimoFalsePositive,tencentMatch,tencentWrongField,tencentMismatch,tencentMissing,tencentFalsePositive,mimoOnly,tencentOnly,bothCorrect,bothWrong,bothMissing',
    ...TEXT_FIELD_KEYS.map((field) => {
      const subset = rows.filter((row) => row.field === field)
      const count = (predicate: (row: FieldComparison) => boolean) => subset.filter(predicate).length
      return [
        field,
        count((row) => row.truthVisibility === 'visible'),
        count((row) => row.mimoStatus === 'match'),
        count((row) => row.mimoStatus === 'wrong_field'),
        count((row) => row.mimoStatus === 'mismatch'),
        count((row) => row.mimoStatus === 'missing'),
        count((row) => row.mimoStatus === 'false_positive'),
        count((row) => row.tencentStatus === 'match'),
        count((row) => row.tencentStatus === 'wrong_field'),
        count((row) => row.tencentStatus === 'mismatch'),
        count((row) => row.tencentStatus === 'missing'),
        count((row) => row.tencentStatus === 'false_positive'),
        count((row) => row.winner === 'mimo_only'),
        count((row) => row.winner === 'tencent_only'),
        count((row) => row.winner === 'both_correct'),
        count((row) => row.winner === 'both_wrong'),
        count((row) => row.winner === 'both_missing'),
      ].join(',')
    }),
  ]
  const summaryPath = join(OUTPUT_DIR, 'field-accuracy-summary.csv')
  await writeFile(summaryPath, summaryRows.join('\n'))
  return { rows, comparisonPath, summaryPath }
}

async function imageData(sample: Sample) {
  const path = join(IMAGE_DIR, sample.fileName)
  const buffer = await readFile(path)
  const metadata = await sharp(buffer).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read dimensions for ${sample.fileName}`)
  }
  return {
    path,
    dataUri: `data:image/jpeg;base64,${buffer.toString('base64')}`,
    width: metadata.width,
    height: metadata.height,
  }
}

function normalizePoints(points: RoutePoint[] | undefined, width: number, height: number) {
  if (!Array.isArray(points)) return []
  const finite = points
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (!finite.length) return []

  const maxX = Math.max(...finite.map((point) => point.x))
  const maxY = Math.max(...finite.map((point) => point.y))
  const percentLike = maxX <= 100 && maxY <= 100 && (maxX > 1.2 || maxY > 1.2)
  const unitLike = maxX <= 1.2 && maxY <= 1.2

  return finite.map((point) => ({
    x: Math.max(0, Math.min(width, unitLike ? point.x * width : percentLike ? (point.x / 100) * width : point.x)),
    y: Math.max(0, Math.min(height, unitLike ? point.y * height : percentLike ? (point.y / 100) * height : point.y)),
  }))
}

async function writeOverlay(sample: Sample, imagePath: string, parsed: MimoParsedPayload | null, width: number, height: number) {
  const points = normalizePoints(parsed?.route?.points, width, height)
  if (points.length < 2) return undefined

  await mkdir(OVERLAY_DIR, { recursive: true })
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <polyline points="${polyline}" fill="none" stroke="rgba(0,0,0,0.82)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="${polyline}" fill="none" stroke="#7ef0b4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${points[0].x.toFixed(1)}" cy="${points[0].y.toFixed(1)}" r="11" fill="#4ade80" stroke="#0f172a" stroke-width="3"/>
  <circle cx="${points.at(-1)?.x.toFixed(1)}" cy="${points.at(-1)?.y.toFixed(1)}" r="11" fill="#fb7185" stroke="#0f172a" stroke-width="3"/>
</svg>`
  const overlayPath = join(OVERLAY_DIR, `${sample.id}.png`)
  await sharp(imagePath)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png()
    .toFile(overlayPath)
  return overlayPath
}

async function runMimo(sample: Sample, apiKey: string): Promise<MimoRunResult> {
  const { path, dataUri, width, height } = await imageData(sample)
  let response = await postJson(OPENAI_ENDPOINT, apiKey, openAiPayload(sample, dataUri, width, height, true), 'openai')
  let thinkingAccepted: boolean | null = response.ok
  let endpoint: MimoRunResult['api']['endpoint'] = 'openai-compatible'

  if (!response.ok && /thinking|unsupported|unknown|invalid/i.test(response.responseText)) {
    response = await postJson(OPENAI_ENDPOINT, apiKey, openAiPayload(sample, dataUri, width, height, false), 'openai')
    thinkingAccepted = false
  }

  if (!response.ok) {
    throw new Error(`MiMo OpenAI-compatible request failed with HTTP ${response.status}.`)
  }

  let usage = usageFromResponse(response.json)
  let rawModelText = extractOpenAiContent(response.json)
  let parsedAttempt = tryParseJsonObject(rawModelText)
  let repairAttempts = 0
  let anthropicFallbackUsed = false

  if (!parsedAttempt.ok) {
    repairAttempts += 1
    const repair = await postJson(OPENAI_ENDPOINT, apiKey, repairPayload(sample, rawModelText), 'openai')
    if (repair.ok) {
      usage = {
        inputTokens: usage.inputTokens + usageFromResponse(repair.json).inputTokens,
        cachedInputTokens: usage.cachedInputTokens + usageFromResponse(repair.json).cachedInputTokens,
        outputTokens: usage.outputTokens + usageFromResponse(repair.json).outputTokens,
        totalTokens: usage.totalTokens + usageFromResponse(repair.json).totalTokens,
        raw: { primary: usage.raw, repair: usageFromResponse(repair.json).raw },
      }
      rawModelText = extractOpenAiContent(repair.json)
      parsedAttempt = tryParseJsonObject(rawModelText)
    }
  }

  let parsed: MimoParsedPayload | null = parsedAttempt.ok ? parsedAttempt.value : null
  let parsePath = parsedAttempt.ok ? parsedAttempt.path : 'failed'
  let status = response.status
  let latencyMs = response.latencyMs

  if (!parsed) {
    const anthropic = await postJson(ANTHROPIC_ENDPOINT, apiKey, anthropicPayload(sample, dataUri, width, height), 'anthropic')
    anthropicFallbackUsed = true
    endpoint = 'anthropic-compatible'
    status = anthropic.status
    latencyMs += anthropic.latencyMs
    if (!anthropic.ok) {
      throw new Error(`MiMo Anthropic-compatible fallback failed with HTTP ${anthropic.status}.`)
    }
    const fallbackUsage = usageFromResponse(anthropic.json)
    usage = {
      inputTokens: usage.inputTokens + fallbackUsage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens + fallbackUsage.cachedInputTokens,
      outputTokens: usage.outputTokens + fallbackUsage.outputTokens,
      totalTokens: usage.totalTokens + fallbackUsage.totalTokens,
      raw: { primary: usage.raw, anthropic: fallbackUsage.raw },
    }
    parsed = extractAnthropicToolInput(anthropic.json)
    rawModelText = parsed ? JSON.stringify(parsed) : ''
    parsePath = parsed ? 'anthropic-tool-use' : 'failed'
  }

  const overlayPath = await writeOverlay(sample, path, parsed, width, height)
  const result: MimoRunResult = {
    schemaVersion: SCHEMA_VERSION,
    sample: {
      id: sample.id,
      app: sample.app,
      fileName: sample.fileName,
      imageId: sample.imageId,
      mapStyle: sample.mapStyle,
      notes: sample.notes,
      groundTruth: sample.groundTruth,
      fixtureId: sample.fixtureId,
      tencentBaselineNote: sample.tencentBaselineNote,
    },
    api: {
      endpoint,
      model: MODEL,
      thinkingAccepted,
      repairAttempts,
      anthropicFallbackUsed,
      latencyMs,
      status,
    },
    usage,
    pricing: {
      adoptedCny: costCny(usage),
      adoptedRate: ADOPTED_PRICE_CNY_PER_MILLION,
    },
    json: {
      parseable: Boolean(parsed),
      parsePath,
      ...(parsed ? {} : { error: parsedAttempt.ok ? undefined : parsedAttempt.error }),
    },
    parsed,
    rawModelText,
    overlayPath,
    comparison: compareResult(parsed, sample),
  }
  return sanitizeForOutput(result)
}

async function writeManifest(samples: Sample[]) {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(
    join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(
      samples.map((sample) => ({
        ...sample,
        tencentBaseline: sample.tencentBaseline ?? null,
        visibleGroundTruth: visibleGroundTruthForSample(sample),
      })),
      null,
      2
    )
  )
}

async function writeResult(result: MimoRunResult) {
  await mkdir(RESULT_DIR, { recursive: true })
  await writeFile(join(RESULT_DIR, `${result.sample.id}.json`), JSON.stringify(result, null, 2))
}

function statusCounts(results: MimoRunResult[]) {
  return {
    total: results.length,
    jsonParseable: results.filter((result) => result.json.parseable).length,
    repaired: results.filter((result) => result.api.repairAttempts > 0).length,
    anthropicFallbacks: results.filter((result) => result.api.anthropicFallbackUsed).length,
    overlays: results.filter((result) => Boolean(result.overlayPath)).length,
  }
}

async function writeSummary(results: MimoRunResult[]) {
  const rows = [
    'sampleId,imageId,app,mapStyle,jsonParseable,parsePath,latencyMs,inputTokens,cachedInputTokens,outputTokens,totalTokens,adoptedCostCny,overlayPath',
    ...results.map((result) =>
      [
        result.sample.id,
        result.sample.imageId,
        result.sample.app,
        result.sample.mapStyle,
        result.json.parseable,
        result.json.parsePath,
        result.api.latencyMs,
        result.usage.inputTokens,
        result.usage.cachedInputTokens,
        result.usage.outputTokens,
        result.usage.totalTokens,
        result.pricing.adoptedCny.toFixed(6),
        result.overlayPath ? result.overlayPath.replace(process.cwd() + '/', '') : '',
      ].join(',')
    ),
  ]
  await writeFile(join(OUTPUT_DIR, 'summary.csv'), rows.join('\n'))

  const counts = statusCounts(results)
  const totalCost = results.reduce((sum, result) => sum + result.pricing.adoptedCny, 0)
  const avgLatency = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.api.latencyMs, 0) / results.length)
    : 0
  const report = `# mimo-v2.5 Spike Report

Generated: ${new Date().toISOString()}

## Scope
- Model: ${MODEL}
- Endpoint: OpenAI-compatible first; Anthropic-compatible tool-use fallback only after JSON repair failure.
- Dataset: ${results.length} screenshot(s) from \`爬山轨迹结果参考图片/\`.
- Tencent+regex baseline is a reference column only where raw OCR fixtures exist. Ground truth is the scoring source.

## Pricing
- Adopted rate: cache-miss input ¥${ADOPTED_PRICE_CNY_PER_MILLION.inputCacheMiss}/M, cache-hit input ¥${ADOPTED_PRICE_CNY_PER_MILLION.inputCacheHit}/M, output ¥${ADOPTED_PRICE_CNY_PER_MILLION.output}/M.
- Source: ${ADOPTED_PRICE_CNY_PER_MILLION.source}.
- B13: ${ADOPTED_PRICE_CNY_PER_MILLION.discrepancy}

## Run Summary
- JSON parseable: ${counts.jsonParseable}/${counts.total}
- Repair retries: ${counts.repaired}
- Anthropic fallbacks: ${counts.anthropicFallbacks}
- Overlays generated: ${counts.overlays}
- Average latency: ${avgLatency} ms
- Total adopted cost: ¥${totalCost.toFixed(6)}
- Average adopted cost/image: ¥${(totalCost / Math.max(1, results.length)).toFixed(6)}

## B13 Notes
- _711 and _712 have no Tencent raw OCR fixture; their Tencent+regex baseline is N/A.
- _712 is not mapped to coros-629 for stats baseline. Any grouping is route/style only.
- Screenshot route extraction is pixel-shape redraw evidence, not GPX-grade geographic reconstruction.
`
  await writeFile(join(OUTPUT_DIR, 'report.md'), report)
}

const TRACK_PROBE_SAMPLE_IDS = new Set(['wechat-711', 'wechat-712'])
const LOOP_RADIUS_PX = 90
const SNAP_RADIUS_PX = 70
const END_RADIUS_PX = 55
const SOFT_JOIN_LIMIT_PX = 55
const HARD_JOIN_LIMIT_PX = 95

type Mask = Uint8Array

type PixelImage = {
  path: string
  width: number
  height: number
  channels: number
  data: Buffer
}

type TrackAnchor = {
  kind: 'start' | 'end' | 'intermediate'
  x: number
  y: number
  label?: string
}

type CvProfile = {
  sampleId: string
  description: string
  roi: { x: number; y: number; width: number; height: number }
  anchors: TrackAnchor[]
  threshold: (r: number, g: number, b: number, x: number, y: number) => boolean
}

type MaskComponent = {
  id: number
  pixels: number[]
  pixelCount: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type CvExtraction = {
  points: RoutePoint[]
  markers: RouteMarker[]
  topology: RouteTopology
  routeType: TrackProbeCandidate['routeType']
  referenceMask: Mask
  debugMask: Mask
  componentCount: number
  selectedComponentCount: number
  falsePositiveComponentCount: number
  routePixelCount: number
  redRoadInterference?: string
  notes: string[]
}

type ProbeCacheResult = TrackProbeResult & {
  candidates: Array<TrackProbeCandidate & { api?: TrackProbeCandidate['api'] }>
}

type FullTrackExtraction = {
  sample: Omit<Sample, 'tencentBaseline'>
  routeTruth: RouteTruth
  mimoClassification: RouteTruth
  lineColorCue: string
  colorCueStatus: 'usable' | 'ambiguous' | 'missing' | 'stats_only'
  failureMode: string | null
  candidate: TrackProbeCandidate
  referenceMask: {
    routePixelCount: number
    componentCount: number
    selectedComponentCount: number
    falsePositiveComponentCount: number
  }
  referenceMaskData?: Mask
  debugMaskData?: Mask
  overlayPath: string
  debugMaskPath?: string
  referenceMaskPath?: string
}

type FieldComparison = {
  sampleId: string
  app: string
  field: TextFieldKey
  truthValue: string
  truthRaw: string
  truthVisibility: TruthVisibility
  mimoValue: string
  mimoRaw: string
  mimoStatus: FieldScoreStatus
  tencentValue: string
  tencentRaw: string
  tencentStatus: FieldScoreStatus | 'n/a'
  winner: FieldWinner
  note: string
}

class MinHeap {
  private readonly heap: Array<{ node: number; priority: number }> = []

  get size() {
    return this.heap.length
  }

  push(node: number, priority: number) {
    this.heap.push({ node, priority })
    this.bubbleUp(this.heap.length - 1)
  }

  pop() {
    const first = this.heap[0]
    const last = this.heap.pop()
    if (!first || !last) return null
    if (this.heap.length) {
      this.heap[0] = last
      this.bubbleDown(0)
    }
    return first
  }

  private bubbleUp(index: number) {
    let current = index
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2)
      if (this.heap[parent].priority <= this.heap[current].priority) break
      ;[this.heap[parent], this.heap[current]] = [this.heap[current], this.heap[parent]]
      current = parent
    }
  }

  private bubbleDown(index: number) {
    let current = index
    while (true) {
      const left = current * 2 + 1
      const right = left + 1
      let smallest = current
      if (left < this.heap.length && this.heap[left].priority < this.heap[smallest].priority) smallest = left
      if (right < this.heap.length && this.heap[right].priority < this.heap[smallest].priority) smallest = right
      if (smallest === current) break
      ;[this.heap[current], this.heap[smallest]] = [this.heap[smallest], this.heap[current]]
      current = smallest
    }
  }
}

function scaledAnchor(anchor: TrackAnchor, width: number, height: number): TrackAnchor {
  return {
    ...anchor,
    x: (anchor.x / 1080) * width,
    y: (anchor.y / 2400) * height,
  }
}

function cvProfileForSample(sample: Sample, width: number, height: number): CvProfile {
  if (sample.id === 'wechat-711') {
    const baseAnchors: TrackAnchor[] = [
      { kind: 'start', x: 315, y: 1287, label: 'start' },
      { kind: 'intermediate', x: 190, y: 1162, label: '1' },
      { kind: 'intermediate', x: 153, y: 1015, label: '2' },
      { kind: 'intermediate', x: 174, y: 847, label: '3' },
      { kind: 'intermediate', x: 178, y: 665, label: '4' },
      { kind: 'intermediate', x: 264, y: 497, label: '5' },
      { kind: 'intermediate', x: 386, y: 428, label: '6' },
      { kind: 'intermediate', x: 538, y: 398, label: '7' },
      { kind: 'intermediate', x: 700, y: 458, label: '8' },
      { kind: 'intermediate', x: 800, y: 338, label: '9' },
      { kind: 'intermediate', x: 842, y: 500, label: '10' },
      { kind: 'intermediate', x: 902, y: 610, label: '11' },
      { kind: 'intermediate', x: 877, y: 735, label: '12' },
      { kind: 'end', x: 867, y: 770, label: 'end' },
    ]
    const anchors = baseAnchors.map((anchor) => scaledAnchor(anchor, width, height))

    return {
      sampleId: sample.id,
      description: 'HSV threshold: red/orange route on satellite map; visible numbered route markers are probe anchors only.',
      roi: {
        x: 0,
        y: Math.round((105 / 2400) * height),
        width,
        height: Math.round((1335 / 2400) * height),
      },
      anchors,
      threshold: (r, g, b, _x, y) => {
        const { h, s, v } = rgbToHsv(r, g, b)
        return y < (1360 / 2400) * height && v > 0.28 && s > 0.26 && (h <= 32 || h >= 345) && r > 115 && g < 175 && b < 155
      },
    }
  }

  if (sample.id === 'wechat-712') {
    const baseAnchors: TrackAnchor[] = [
      { kind: 'start', x: 638, y: 1075, label: 'start' },
      { kind: 'intermediate', x: 750, y: 865, label: '1' },
      { kind: 'intermediate', x: 785, y: 673, label: '2' },
      { kind: 'intermediate', x: 810, y: 462, label: '3' },
      { kind: 'intermediate', x: 850, y: 226, label: '3.48' },
      { kind: 'intermediate', x: 748, y: 626, label: '4.48' },
      { kind: 'intermediate', x: 540, y: 646, label: '5.48' },
      { kind: 'intermediate', x: 420, y: 823, label: '6.48' },
      { kind: 'intermediate', x: 418, y: 889, label: '7.48' },
      { kind: 'intermediate', x: 337, y: 1082, label: '8.48' },
      { kind: 'intermediate', x: 232, y: 1115, label: '9.48' },
      { kind: 'end', x: 195, y: 1335, label: 'end' },
    ]
    const anchors = baseAnchors.map((anchor) => scaledAnchor(anchor, width, height))

    return {
      sampleId: sample.id,
      description: 'HSV threshold: lime route on dark COROS map; visible distance markers are probe anchors only.',
      roi: {
        x: 0,
        y: Math.round((140 / 2400) * height),
        width,
        height: Math.round((1285 / 2400) * height),
      },
      anchors,
      threshold: (r, g, b, _x, y) => {
        const { h, s, v } = rgbToHsv(r, g, b)
        return y < (1445 / 2400) * height && h >= 50 && h <= 102 && s > 0.28 && v > 0.32 && r > 90 && g > 130 && b < 150
      },
    }
  }

  throw new Error(`No CV track profile for sample ${sample.id}`)
}

async function readPixelImage(sample: Sample): Promise<PixelImage> {
  const path = join(IMAGE_DIR, sample.fileName)
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { path, width: info.width, height: info.height, channels: info.channels, data }
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }
  if (h < 0) h += 360
  const s = max === 0 ? 0 : delta / max
  return { h, s, v: max }
}

function buildRawRouteMask(image: PixelImage, profile: CvProfile): Mask {
  const mask = new Uint8Array(image.width * image.height)
  const maxX = Math.min(image.width, profile.roi.x + profile.roi.width)
  const maxY = Math.min(image.height, profile.roi.y + profile.roi.height)
  for (let y = Math.max(0, profile.roi.y); y < maxY; y += 1) {
    for (let x = Math.max(0, profile.roi.x); x < maxX; x += 1) {
      const offset = (y * image.width + x) * image.channels
      const r = image.data[offset] ?? 0
      const g = image.data[offset + 1] ?? 0
      const b = image.data[offset + 2] ?? 0
      if (profile.threshold(r, g, b, x, y)) {
        mask[y * image.width + x] = 1
      }
    }
  }
  return mask
}

function dilateMask(mask: Mask, width: number, height: number, radius: number): Mask {
  const output = new Uint8Array(mask.length)
  const offsets: Array<[number, number]> = []
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy])
    }
  }
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    const x = index % width
    const y = Math.floor(index / width)
    for (const [dx, dy] of offsets) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        output[ny * width + nx] = 1
      }
    }
  }
  return output
}

function erodeMask(mask: Mask, width: number, height: number, radius: number): Mask {
  const output = new Uint8Array(mask.length)
  const offsets: Array<[number, number]> = []
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy])
    }
  }
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      let keep = true
      for (const [dx, dy] of offsets) {
        if (!mask[(y + dy) * width + x + dx]) {
          keep = false
          break
        }
      }
      if (keep) output[y * width + x] = 1
    }
  }
  return output
}

function countMask(mask: Mask) {
  let count = 0
  for (const value of mask) {
    if (value) count += 1
  }
  return count
}

function connectedComponents(mask: Mask, width: number, height: number, minimumPixels: number): MaskComponent[] {
  const visited = new Uint8Array(mask.length)
  const components: MaskComponent[] = []
  const queue = new Int32Array(mask.length)
  let componentId = 0

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue
    let head = 0
    let tail = 0
    queue[tail] = start
    tail += 1
    visited[start] = 1
    const pixels: number[] = []
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0

    while (head < tail) {
      const index = queue[head]
      head += 1
      pixels.push(index)
      const x = index % width
      const y = Math.floor(index / width)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const next = ny * width + nx
          if (!mask[next] || visited[next]) continue
          visited[next] = 1
          queue[tail] = next
          tail += 1
        }
      }
    }

    if (pixels.length >= minimumPixels) {
      componentId += 1
      components.push({ id: componentId, pixels, pixelCount: pixels.length, minX, minY, maxX, maxY })
    }
  }

  return components
}

function maskFromComponents(components: MaskComponent[], width: number, height: number) {
  const mask = new Uint8Array(width * height)
  for (const component of components) {
    for (const index of component.pixels) {
      mask[index] = 1
    }
  }
  return mask
}

function distance(a: RoutePoint, b: RoutePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function snapToMask(point: RoutePoint, mask: Mask, width: number, height: number, radius: number): RoutePoint | null {
  const cx = Math.round(point.x)
  const cy = Math.round(point.y)
  let best: RoutePoint | null = null
  let bestDistance = Infinity
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || x >= width || y < 0 || y >= height) continue
      if (!mask[y * width + x]) continue
      const currentDistance = Math.hypot(dx, dy)
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance
        best = { x, y }
      }
    }
  }
  return best
}

function astarPath(start: RoutePoint, end: RoutePoint, walkMask: Mask, preferredMask: Mask, width: number, height: number): RoutePoint[] | null {
  const margin = 180
  const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - margin))
  const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - margin))
  const maxX = Math.min(width - 1, Math.ceil(Math.max(start.x, end.x) + margin))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(start.y, end.y) + margin))
  const localWidth = maxX - minX + 1
  const localHeight = maxY - minY + 1
  const localLength = localWidth * localHeight
  if (localLength > 650_000) return null
  const startLocal = (Math.round(start.y) - minY) * localWidth + (Math.round(start.x) - minX)
  const endLocal = (Math.round(end.y) - minY) * localWidth + (Math.round(end.x) - minX)
  const cameFrom = new Int32Array(localLength)
  cameFrom.fill(-1)
  const score = new Float32Array(localLength)
  score.fill(Infinity)
  const closed = new Uint8Array(localLength)
  const heap = new MinHeap()
  score[startLocal] = 0
  heap.push(startLocal, distance(start, end))
  let expanded = 0

  while (heap.size) {
    const item = heap.pop()
    if (!item) break
    const current = item.node
    if (closed[current]) continue
    expanded += 1
    if (expanded > 220_000) return null
    if (current === endLocal) {
      const path: RoutePoint[] = []
      let cursor = current
      while (cursor >= 0) {
        const x = (cursor % localWidth) + minX
        const y = Math.floor(cursor / localWidth) + minY
        path.push({ x, y })
        cursor = cameFrom[cursor]
      }
      return path.reverse()
    }

    closed[current] = 1
    const x = current % localWidth
    const y = Math.floor(current / localWidth)
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= localWidth || ny < 0 || ny >= localHeight) continue
        const neighbor = ny * localWidth + nx
        if (closed[neighbor]) continue
        const gx = nx + minX
        const gy = ny + minY
        const globalIndex = gy * width + gx
        if (!walkMask[globalIndex]) continue
        const diagonal = dx !== 0 && dy !== 0
        const baseCost = diagonal ? 1.4142 : 1
        const colorCost = preferredMask[globalIndex] ? 1 : 25
        const tentative = score[current] + baseCost * colorCost
        if (tentative < score[neighbor]) {
          cameFrom[neighbor] = current
          score[neighbor] = tentative
          heap.push(neighbor, tentative + Math.hypot(gx - end.x, gy - end.y))
        }
      }
    }
  }

  return null
}

function lineSupportRatio(a: RoutePoint, b: RoutePoint, supportMask: Mask, width: number, height: number) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 4))
  let supported = 0
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const x = Math.round(a.x + (b.x - a.x) * t)
    const y = Math.round(a.y + (b.y - a.y) * t)
    if (x >= 0 && x < width && y >= 0 && y < height && supportMask[y * width + x]) {
      supported += 1
    }
  }
  return supported / (steps + 1)
}

function mergeSegment(path: RoutePoint[], segment: RoutePoint[]) {
  if (!path.length) return segment
  if (!segment.length) return path
  return [...path, ...segment.slice(1)]
}

function resamplePath(points: RoutePoint[], stepPx: number) {
  if (points.length < 2) return points
  const output: RoutePoint[] = [points[0]]
  let carried = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const segmentLength = distance(previous, current)
    carried += segmentLength
    if (carried >= stepPx) {
      output.push(current)
      carried = 0
    }
  }
  const last = points.at(-1)
  if (last && distance(output.at(-1) ?? last, last) > 0.5) output.push(last)
  return output
}

function densifyPolyline(points: RoutePoint[], stepPx: number) {
  if (points.length < 2) return points
  const output: RoutePoint[] = [points[0]]
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const steps = Math.max(1, Math.ceil(distance(previous, current) / stepPx))
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      output.push({
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t,
      })
    }
  }
  return output
}

function buildAnchoredCvPath(profile: CvProfile, refinedMask: Mask, walkMask: Mask, supportMask: Mask, width: number, height: number) {
  const notes: string[] = []
  const startAnchor = profile.anchors.find((anchor) => anchor.kind === 'start')
  const endAnchor = profile.anchors.find((anchor) => anchor.kind === 'end')
  const topology: RouteTopology = startAnchor && endAnchor ? (distance(startAnchor, endAnchor) > LOOP_RADIUS_PX ? 'through' : 'loop') : 'unknown'
  const snapped = profile.anchors.map((anchor) => ({ anchor, point: snapToMask(anchor, walkMask, width, height, SNAP_RADIUS_PX) }))
  const missing = snapped.filter((item) => !item.point)
  if (missing.length) {
    notes.push(`Missing snapped anchors within ${SNAP_RADIUS_PX}px: ${missing.map((item) => item.anchor.label ?? item.anchor.kind).join(', ')}`)
  }

  let path: RoutePoint[] = []
  for (let index = 0; index < snapped.length - 1; index += 1) {
    const current = snapped[index]
    const next = snapped[index + 1]
    if (!current.point || !next.point) {
      notes.push(`Skipped segment ${current.anchor.label ?? index} -> ${next.anchor.label ?? index + 1}: anchor snap missing.`)
      break
    }

    const gapFromExisting = path.length ? distance(path.at(-1) ?? current.point, current.point) : 0
    if (gapFromExisting > SOFT_JOIN_LIMIT_PX) {
      const support = lineSupportRatio(path.at(-1) ?? current.point, current.point, supportMask, width, height)
      if (gapFromExisting > HARD_JOIN_LIMIT_PX || support < 0.35) {
        notes.push(`Stopped before ${current.anchor.label ?? current.anchor.kind}: unsupported join gap ${gapFromExisting.toFixed(1)}px, support ${(support * 100).toFixed(0)}%.`)
        break
      }
    }

    const segment = astarPath(current.point, next.point, walkMask, refinedMask, width, height)
    if (!segment) {
      notes.push(`Stopped at ${current.anchor.label ?? current.anchor.kind}: no supported route-color path to ${next.anchor.label ?? next.anchor.kind}.`)
      break
    }
    path = mergeSegment(path, segment)

    if (topology === 'through' && next.anchor.kind === 'end') {
      const endPoint = snapped.find((item) => item.anchor.kind === 'end')?.point
      if (endPoint && distance(path.at(-1) ?? endPoint, endPoint) <= END_RADIUS_PX) {
        notes.push(`Through topology: stopped within ${END_RADIUS_PX}px of end anchor and discarded remaining fragments.`)
        break
      }
    }
  }

  if (topology === 'loop' && path.length > 1) {
    const first = path[0]
    const last = path.at(-1) ?? first
    const support = lineSupportRatio(last, first, supportMask, width, height)
    if (distance(first, last) <= LOOP_RADIUS_PX && support >= 0.35) {
      path.push(first)
      notes.push('Loop topology: allowed closure because start/end are near and line support exists.')
    }
  }

  return { points: resamplePath(path, 5), topology, notes }
}

function rasterizePolyline(points: RoutePoint[], width: number, height: number, radius: number): Mask {
  const mask = new Uint8Array(width * height)
  if (points.length === 1) {
    const x = Math.round(points[0].x)
    const y = Math.round(points[0].y)
    if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1
    return radius > 0 ? dilateMask(mask, width, height, radius) : mask
  }

  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const steps = Math.max(1, Math.ceil(distance(a, b)))
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = Math.round(a.x + (b.x - a.x) * t)
      const y = Math.round(a.y + (b.y - a.y) * t)
      if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1
    }
  }

  return radius > 0 ? dilateMask(mask, width, height, radius) : mask
}

function selectReferenceMask(refinedMask: Mask, components: MaskComponent[], points: RoutePoint[], width: number, height: number) {
  const corridor = rasterizePolyline(points, width, height, 24)
  const selected = new Uint8Array(width * height)
  let selectedComponentCount = 0

  for (const component of components) {
    const touchesPath = component.pixels.some((index) => corridor[index])
    if (!touchesPath) continue
    selectedComponentCount += 1
    for (const index of component.pixels) {
      if (refinedMask[index]) selected[index] = 1
    }
  }

  return {
    mask: selected,
    selectedComponentCount,
    falsePositiveComponentCount: Math.max(0, components.length - selectedComponentCount),
  }
}

function routeMarkersFromProfile(profile: CvProfile): RouteMarker[] {
  return profile.anchors.map((anchor) => ({
    kind: anchor.kind,
    x: anchor.x,
    y: anchor.y,
    label: anchor.kind === 'intermediate' ? anchor.label ?? null : null,
    confidence: anchor.kind === 'intermediate' ? 0.8 : 0.9,
    evidence:
      anchor.kind === 'intermediate'
        ? `Visible route marker ${anchor.label}; used as bounded probe anchor, not production automation.`
        : `Visible ${anchor.kind} marker; used as bounded probe anchor.`,
  }))
}

function extractCvRoute(sample: Sample, image: PixelImage): CvExtraction {
  const profile = cvProfileForSample(sample, image.width, image.height)
  const rawMask = buildRawRouteMask(image, profile)
  const closed = erodeMask(dilateMask(rawMask, image.width, image.height, 2), image.width, image.height, 1)
  const components = connectedComponents(closed, image.width, image.height, 8)
  const refinedMask = maskFromComponents(components, image.width, image.height)
  const supportMask = dilateMask(refinedMask, image.width, image.height, 14)
  const walkMask = dilateMask(refinedMask, image.width, image.height, 32)
  const built = buildAnchoredCvPath(profile, refinedMask, walkMask, supportMask, image.width, image.height)
  const selectedReference = selectReferenceMask(refinedMask, components, built.points, image.width, image.height)
  const routePixelCount = countMask(selectedReference.mask)
  const redRoadInterference =
    sample.id === 'wechat-711'
      ? selectedReference.falsePositiveComponentCount > 0
        ? `possible: ${selectedReference.falsePositiveComponentCount} non-selected red/orange components were filtered from the route mask`
        : 'none detected after HSV filtering'
      : undefined

  return {
    points: built.points,
    markers: routeMarkersFromProfile(profile),
    topology: built.topology,
    routeType: 'Type B',
    referenceMask: selectedReference.mask,
    debugMask: selectedReference.mask,
    componentCount: components.length,
    selectedComponentCount: selectedReference.selectedComponentCount,
    falsePositiveComponentCount: selectedReference.falsePositiveComponentCount,
    routePixelCount,
    redRoadInterference,
    notes: [
      profile.description,
      `Topology=${built.topology}; start/end distance ${
        profile.anchors.find((anchor) => anchor.kind === 'start') && profile.anchors.find((anchor) => anchor.kind === 'end')
          ? distance(profile.anchors.find((anchor) => anchor.kind === 'start')!, profile.anchors.find((anchor) => anchor.kind === 'end')!).toFixed(1)
          : 'n/a'
      }px.`,
      ...built.notes,
      'Metrics are biased upward because the CV candidate and reference mask share the same color source.',
      ...(redRoadInterference ? [`711 red-road interference: ${redRoadInterference}`] : []),
    ],
  }
}

function routeClassification(parsed: MimoParsedPayload | null): RouteTruth {
  const value = parsed?.route?.classification ?? parsed?.imageType
  return value === 'map_track' || value === 'stats_only' || value === 'unclear' ? value : 'unclear'
}

function normalizeMarkers(markers: RouteMarker[] | undefined, width: number, height: number): RouteMarker[] {
  if (!Array.isArray(markers)) return []
  return markers
    .map((marker) => ({
      kind: marker.kind,
      x: Number(marker.x),
      y: Number(marker.y),
      label: marker.label ?? null,
      confidence: typeof marker.confidence === 'number' ? marker.confidence : null,
      evidence: marker.evidence ?? null,
    }))
    .filter(
      (marker) =>
        (marker.kind === 'start' || marker.kind === 'end' || marker.kind === 'intermediate') &&
        Number.isFinite(marker.x) &&
        Number.isFinite(marker.y)
    )
    .map((marker): RouteMarker => ({
      ...marker,
      kind: marker.kind as RouteMarker['kind'],
      x: Math.max(0, Math.min(width, marker.x)),
      y: Math.max(0, Math.min(height, marker.y)),
    }))
}

function markerAnchorsFromMimo(markers: RouteMarker[], points: RoutePoint[]): TrackAnchor[] {
  const sortedMarkers = markers.length
    ? [
        ...markers.filter((marker) => marker.kind === 'start').slice(0, 1),
        ...markers.filter((marker) => marker.kind === 'intermediate'),
        ...markers.filter((marker) => marker.kind === 'end').slice(0, 1),
      ]
    : []
  if (sortedMarkers.length >= 2) {
    return sortedMarkers.map((marker, index) => ({
      kind: marker.kind,
      x: marker.x,
      y: marker.y,
      label: marker.label ?? (marker.kind === 'intermediate' ? String(index) : marker.kind),
    }))
  }
  if (points.length >= 2) {
    return [
      { kind: 'start', x: points[0].x, y: points[0].y, label: 'seed-start' },
      ...points.slice(1, -1).filter((_point, index) => index % Math.max(1, Math.floor(points.length / 8)) === 0).map((point, index) => ({
        kind: 'intermediate' as const,
        x: point.x,
        y: point.y,
        label: `seed-${index + 1}`,
      })),
      { kind: 'end', x: points.at(-1)!.x, y: points.at(-1)!.y, label: 'seed-end' },
    ]
  }
  return []
}

function hexToRgb(hex: string | null | undefined) {
  if (!hex) return null
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/iu)
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function hueDistance(a: number, b: number) {
  const diff = Math.abs(a - b) % 360
  return Math.min(diff, 360 - diff)
}

function hueSeedsForColorName(name: string | null | undefined) {
  const text = (name ?? '').toLowerCase()
  const seeds: number[] = []
  if (/red|orange|红|橙/u.test(text)) seeds.push(8, 24)
  if (/yellow|黄|金/u.test(text)) seeds.push(52)
  if (/lime|green|绿|青绿/u.test(text)) seeds.push(88, 128)
  if (/cyan|teal|蓝绿|青/u.test(text)) seeds.push(178)
  if (/blue|蓝/u.test(text)) seeds.push(215)
  if (/purple|violet|紫/u.test(text)) seeds.push(275)
  if (/pink|magenta|粉|玫/u.test(text)) seeds.push(318)
  return seeds
}

function routeBbox(parsed: MimoParsedPayload | null, points: RoutePoint[], width: number, height: number) {
  const bbox = parsed?.route?.bbox
  const fromBbox =
    bbox &&
    [bbox.x, bbox.y, bbox.width, bbox.height].every((value) => typeof value === 'number' && Number.isFinite(value))
      ? {
          x: Number(bbox.x),
          y: Number(bbox.y),
          width: Number(bbox.width),
          height: Number(bbox.height),
        }
      : null
  if (fromBbox && fromBbox.width > 10 && fromBbox.height > 10) {
    const margin = 90
    return {
      x: Math.max(0, Math.floor(fromBbox.x - margin)),
      y: Math.max(0, Math.floor(fromBbox.y - margin)),
      width: Math.min(width, Math.ceil(fromBbox.x + fromBbox.width + margin)) - Math.max(0, Math.floor(fromBbox.x - margin)),
      height: Math.min(height, Math.ceil(fromBbox.y + fromBbox.height + margin)) - Math.max(0, Math.floor(fromBbox.y - margin)),
    }
  }
  if (points.length >= 2) {
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const margin = 140
    const minX = Math.max(0, Math.floor(Math.min(...xs) - margin))
    const minY = Math.max(0, Math.floor(Math.min(...ys) - margin))
    const maxX = Math.min(width, Math.ceil(Math.max(...xs) + margin))
    const maxY = Math.min(height, Math.ceil(Math.max(...ys) + margin))
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }
  return { x: 0, y: 0, width, height: Math.round(height * 0.78) }
}

function samplePixelHsv(image: PixelImage, point: RoutePoint) {
  const x = Math.round(point.x)
  const y = Math.round(point.y)
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) return null
  const offset = (y * image.width + x) * image.channels
  return rgbToHsv(image.data[offset] ?? 0, image.data[offset + 1] ?? 0, image.data[offset + 2] ?? 0)
}

function colorCuesFromMimo(parsed: MimoParsedPayload | null, points: RoutePoint[], image: PixelImage) {
  const route = parsed?.route
  const cues: Array<{ h: number; s: number; v: number; source: string }> = []
  for (const color of route?.lineColors ?? []) {
    const fromHex = hexToRgb(color.hex)
    if (fromHex) {
      const hsv = rgbToHsv(fromHex.r, fromHex.g, fromHex.b)
      cues.push({ ...hsv, source: `hex:${color.hex}` })
    }
    if (color.hsv && typeof color.hsv.h === 'number') {
      cues.push({
        h: color.hsv.h,
        s: typeof color.hsv.s === 'number' ? color.hsv.s : 0.45,
        v: typeof color.hsv.v === 'number' ? color.hsv.v : 0.55,
        source: `hsv:${color.name ?? 'unnamed'}`,
      })
    }
    for (const hue of hueSeedsForColorName(color.name)) {
      cues.push({ h: hue, s: 0.55, v: 0.55, source: `name:${color.name}` })
    }
  }
  for (const hue of hueSeedsForColorName(route?.lineColor)) {
    cues.push({ h: hue, s: 0.55, v: 0.55, source: `lineColor:${route?.lineColor}` })
  }
  for (const sample of route?.strokeSamples ?? []) {
    const fromHex = hexToRgb(sample.color)
    if (fromHex) {
      const hsv = rgbToHsv(fromHex.r, fromHex.g, fromHex.b)
      cues.push({ ...hsv, source: `stroke:${sample.color}` })
    }
    const pixel = samplePixelHsv(image, sample)
    if (pixel && pixel.s > 0.18 && pixel.v > 0.18) cues.push({ ...pixel, source: 'stroke-pixel' })
  }
  for (const point of points.slice(0, 18)) {
    const pixel = samplePixelHsv(image, point)
    if (pixel && pixel.s > 0.22 && pixel.v > 0.22) cues.push({ ...pixel, source: 'seed-pixel' })
  }
  const deduped: typeof cues = []
  for (const cue of cues) {
    if (!Number.isFinite(cue.h) || cue.s < 0.12 || cue.v < 0.12) continue
    if (deduped.some((existing) => hueDistance(existing.h, cue.h) < 6 && Math.abs(existing.s - cue.s) < 0.08)) continue
    deduped.push(cue)
  }
  return deduped.slice(0, 8)
}

function lineColorCueText(parsed: MimoParsedPayload | null, cues: Array<{ h: number; s: number; v: number; source: string }>) {
  const colorNames = [
    parsed?.route?.lineColor,
    ...((parsed?.route?.lineColors ?? []).map((color) => color.name ?? color.hex ?? '').filter(Boolean) as string[]),
  ].filter(Boolean)
  const hsvText = cues.map((cue) => `${cue.source}@${cue.h.toFixed(0)}/${cue.s.toFixed(2)}/${cue.v.toFixed(2)}`).join('; ')
  return [colorNames.join('|'), hsvText].filter(Boolean).join(' / ') || 'n/a'
}

function genericColorMask(image: PixelImage, bbox: { x: number; y: number; width: number; height: number }, cues: Array<{ h: number; s: number; v: number }>) {
  const mask = new Uint8Array(image.width * image.height)
  if (!cues.length) return mask
  const maxX = Math.min(image.width, bbox.x + bbox.width)
  const maxY = Math.min(image.height, bbox.y + bbox.height)
  for (let y = Math.max(0, bbox.y); y < maxY; y += 1) {
    for (let x = Math.max(0, bbox.x); x < maxX; x += 1) {
      const offset = (y * image.width + x) * image.channels
      const hsv = rgbToHsv(image.data[offset] ?? 0, image.data[offset + 1] ?? 0, image.data[offset + 2] ?? 0)
      const match = cues.some((cue) => {
        const hueTol = cue.s > 0.45 ? 24 : 34
        const saturationFloor = Math.max(0.18, Math.min(0.58, cue.s * 0.45))
        const valueFloor = Math.max(0.16, Math.min(0.62, cue.v * 0.42))
        return hueDistance(hsv.h, cue.h) <= hueTol && hsv.s >= saturationFloor && hsv.v >= valueFloor
      })
      if (match) mask[y * image.width + x] = 1
    }
  }
  return mask
}

function buildFullCvCandidate(sample: Sample, result: MimoRunResult, image: PixelImage): FullTrackExtraction {
  const truth = visibleGroundTruthForSample(sample)
  const parsed = result.parsed
  const classification = routeClassification(parsed)
  const seedPoints = normalizePoints(parsed?.route?.points, image.width, image.height)
  const markers = normalizeMarkers(parsed?.route?.markers, image.width, image.height)
  const lineCues = colorCuesFromMimo(parsed, seedPoints, image)
  const lineColorCue = lineColorCueText(parsed, lineCues)
  const topologyHint = parsed?.route?.topologyHint === 'through' || parsed?.route?.topologyHint === 'loop' ? parsed.route.topologyHint : 'unknown'
  const routeType =
    classification === 'stats_only'
      ? 'no-track'
      : parsed?.route?.routeType === 'Type A' || parsed?.route?.routeType === 'Type B'
        ? parsed.route.routeType
        : markers.some((marker) => marker.kind === 'intermediate')
          ? 'Type B'
          : classification === 'map_track'
          ? 'Type A'
          : 'unclear'

  if (image.width * image.height > 4_500_000) {
    const candidate: TrackProbeCandidate = {
      sampleId: sample.id,
      method: 'cv',
      routeType,
      topology: topologyHint,
      points: [],
      markers,
      grade: 'no-track',
      metrics: computeTrackMetrics([], markers, new Uint8Array(image.width * image.height), image.width, image.height),
      notes: [
        `MIMO classification=${classification}; truth route=${truth.routeTruth}.`,
        `Image dimensions ${image.width}x${image.height} exceed the bounded local CV probe limit; fail-closed instead of running unbounded pathfinding.`,
      ],
    }
    return {
      sample: stripTencentBaseline(sample),
      routeTruth: truth.routeTruth,
      mimoClassification: classification,
      lineColorCue,
      colorCueStatus: lineCues.length ? 'usable' : 'missing',
      failureMode: 'image_too_large_for_cv_probe',
      candidate,
      referenceMask: { routePixelCount: 0, componentCount: 0, selectedComponentCount: 0, falsePositiveComponentCount: 0 },
      referenceMaskData: new Uint8Array(image.width * image.height),
      debugMaskData: new Uint8Array(image.width * image.height),
      overlayPath: '',
    }
  }

  if (truth.routeTruth === 'stats_only' || classification === 'stats_only') {
    const failureMode = truth.routeTruth !== 'stats_only' && classification === 'stats_only' ? 'missed_visible_track' : truth.routeTruth === 'stats_only' && classification !== 'stats_only' ? 'hallucinated_track' : null
    const candidate: TrackProbeCandidate = {
      sampleId: sample.id,
      method: 'cv',
      routeType: truth.routeTruth === 'stats_only' ? 'no-track' : routeType,
      topology: 'unknown',
      points: [],
      markers: [],
      grade: truth.routeTruth === 'stats_only' && classification === 'stats_only' ? 'no-track' : 'poor',
      metrics: computeTrackMetrics([], [], new Uint8Array(image.width * image.height), image.width, image.height),
      notes: [
        `MIMO classification=${classification}; truth route=${truth.routeTruth}.`,
        failureMode ? `Failure mode: ${failureMode}.` : 'No CV route attempted for stats_only classification.',
      ],
    }
    return {
      sample: stripTencentBaseline(sample),
      routeTruth: truth.routeTruth,
      mimoClassification: classification,
      lineColorCue,
      colorCueStatus: classification === 'stats_only' ? 'stats_only' : 'missing',
      failureMode,
      candidate,
    referenceMask: { routePixelCount: 0, componentCount: 0, selectedComponentCount: 0, falsePositiveComponentCount: 0 },
      referenceMaskData: new Uint8Array(image.width * image.height),
      debugMaskData: new Uint8Array(image.width * image.height),
      overlayPath: '',
    }
  }

  if (!lineCues.length || seedPoints.length < 2) {
    const candidate: TrackProbeCandidate = {
      sampleId: sample.id,
      method: 'cv',
      routeType,
      topology: topologyHint,
      points: [],
      markers,
      grade: 'no-track',
      metrics: computeTrackMetrics([], markers, new Uint8Array(image.width * image.height), image.width, image.height),
      notes: [
        `MIMO classification=${classification}; truth route=${truth.routeTruth}.`,
        `Color/seed unusable: cues=${lineCues.length}, seedPoints=${seedPoints.length}.`,
      ],
    }
    return {
      sample: stripTencentBaseline(sample),
      routeTruth: truth.routeTruth,
      mimoClassification: classification,
      lineColorCue,
      colorCueStatus: lineCues.length ? 'ambiguous' : 'missing',
      failureMode: 'color_unusable',
      candidate,
      referenceMask: { routePixelCount: 0, componentCount: 0, selectedComponentCount: 0, falsePositiveComponentCount: 0 },
      referenceMaskData: new Uint8Array(image.width * image.height),
      debugMaskData: new Uint8Array(image.width * image.height),
      overlayPath: '',
    }
  }

  const bbox = routeBbox(parsed, seedPoints, image.width, image.height)
  const rawMask = genericColorMask(image, bbox, lineCues)
  const closed = erodeMask(dilateMask(rawMask, image.width, image.height, 2), image.width, image.height, 1)
  const components = connectedComponents(closed, image.width, image.height, 8)
  const refinedMask = maskFromComponents(components, image.width, image.height)
  const selectedReference = selectReferenceMask(refinedMask, components, seedPoints, image.width, image.height)
  const anchors = markerAnchorsFromMimo(markers, seedPoints)
  const snapMask = dilateMask(selectedReference.mask, image.width, image.height, 18)
  const snappedSeeds = seedPoints
    .map((point) => snapToMask(point, snapMask, image.width, image.height, 42) ?? point)
    .filter((point, index, list) => index === 0 || distance(point, list[index - 1]) > 1)
  const topology =
    topologyHint !== 'unknown'
      ? topologyHint
      : snappedSeeds.length >= 2 && distance(snappedSeeds[0], snappedSeeds.at(-1) ?? snappedSeeds[0]) > LOOP_RADIUS_PX
        ? 'through'
        : snappedSeeds.length >= 2
          ? 'loop'
          : 'unknown'
  const points = densifyPolyline(snappedSeeds, 5)
  const boundedNotes = [
    'Full-mode generic CV uses MIMO seed order snapped to the MIMO-colored mask; A* pathfinding is disabled here to prevent unbounded local searches and false long bridges.',
    topology === 'through' ? 'Through topology: kept open; no return-to-start closure attempted.' : `Topology=${topology}.`,
  ]
  const candidateMarkers =
    markers.length > 0
      ? markers
      : anchors.map((anchor) => ({
          kind: anchor.kind,
          x: anchor.x,
          y: anchor.y,
          label: anchor.kind === 'intermediate' ? anchor.label ?? null : null,
          confidence: 0.55,
          evidence: 'Fallback marker from MIMO seed point.',
        }))
  const metrics = computeTrackMetrics(points, candidateMarkers, selectedReference.mask, image.width, image.height)
  const candidate: TrackProbeCandidate = {
    sampleId: sample.id,
    method: 'cv',
    routeType,
    topology,
    points,
    markers: candidateMarkers,
    grade: 'no-track',
    metrics,
    notes: [
      `MIMO classification=${classification}; truth route=${truth.routeTruth}.`,
      `MIMO-driven color cue: ${lineColorCue}.`,
      `Generic CV bbox=${bbox.x},${bbox.y},${bbox.width},${bbox.height}; components selected ${selectedReference.selectedComponentCount}/${components.length}.`,
      ...boundedNotes,
    ],
  }
  candidate.grade = gradeCandidate(candidate)
  const failureMode =
    candidate.grade === 'faithful'
      ? null
      : !countMask(selectedReference.mask)
        ? 'no_color_component'
        : (candidate.metrics.maxSegmentGapPx ?? 0) > HARD_JOIN_LIMIT_PX
          ? 'unsupported_long_join'
          : candidate.grade === 'no-track'
            ? 'no_ordered_path'
            : 'low_shape_fidelity'
  return {
    sample: stripTencentBaseline(sample),
    routeTruth: truth.routeTruth,
    mimoClassification: classification,
    lineColorCue,
    colorCueStatus: lineCues.length ? 'usable' : 'missing',
    failureMode,
    candidate,
    referenceMask: {
      routePixelCount: countMask(selectedReference.mask),
      componentCount: components.length,
      selectedComponentCount: selectedReference.selectedComponentCount,
      falsePositiveComponentCount: selectedReference.falsePositiveComponentCount,
    },
    referenceMaskData: selectedReference.mask,
    debugMaskData: rawMask,
    overlayPath: '',
    debugMaskPath: '',
    referenceMaskPath: '',
  }
}

function distanceTransform(sourceMask: Mask, width: number, height: number) {
  const inf = 1_000_000
  const distances = new Float32Array(sourceMask.length)
  for (let index = 0; index < sourceMask.length; index += 1) {
    distances[index] = sourceMask[index] ? 0 : inf
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (x > 0) distances[index] = Math.min(distances[index], distances[index - 1] + 1)
      if (y > 0) distances[index] = Math.min(distances[index], distances[index - width] + 1)
      if (x > 0 && y > 0) distances[index] = Math.min(distances[index], distances[index - width - 1] + 1.4142)
      if (x + 1 < width && y > 0) distances[index] = Math.min(distances[index], distances[index - width + 1] + 1.4142)
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x
      if (x + 1 < width) distances[index] = Math.min(distances[index], distances[index + 1] + 1)
      if (y + 1 < height) distances[index] = Math.min(distances[index], distances[index + width] + 1)
      if (x + 1 < width && y + 1 < height) distances[index] = Math.min(distances[index], distances[index + width + 1] + 1.4142)
      if (x > 0 && y + 1 < height) distances[index] = Math.min(distances[index], distances[index + width - 1] + 1.4142)
    }
  }

  return distances
}

function valuesFromMask(mask: Mask, distances: Float32Array) {
  const values: number[] = []
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) values.push(distances[index])
  }
  return values
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
}

function ratioWithin(values: number[], limit: number): number | null {
  if (!values.length) return null
  return values.filter((value) => value <= limit).length / values.length
}

function pathLength(points: RoutePoint[]) {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index])
  }
  return total
}

function maxSegmentGap(points: RoutePoint[]) {
  if (points.length < 2) return null
  let max = 0
  for (let index = 1; index < points.length; index += 1) {
    max = Math.max(max, distance(points[index - 1], points[index]))
  }
  return max
}

function tortuosity(points: RoutePoint[]) {
  if (points.length < 2) return null
  const direct = distance(points[0], points.at(-1) ?? points[0])
  if (direct < 1) return null
  return pathLength(points) / direct
}

function turnDensity(points: RoutePoint[]) {
  if (points.length < 3) return null
  let turns = 0
  for (let index = 2; index < points.length; index += 1) {
    const a = points[index - 2]
    const b = points[index - 1]
    const c = points[index]
    const ab = { x: b.x - a.x, y: b.y - a.y }
    const bc = { x: c.x - b.x, y: c.y - b.y }
    const denom = Math.hypot(ab.x, ab.y) * Math.hypot(bc.x, bc.y)
    if (denom < 1) continue
    const angle = Math.acos(Math.max(-1, Math.min(1, (ab.x * bc.x + ab.y * bc.y) / denom)))
    if (angle > Math.PI / 7) turns += 1
  }
  const length = pathLength(points)
  return length > 0 ? (turns / length) * 100 : null
}

function endpointError(points: RoutePoint[], markers: RouteMarker[]) {
  if (points.length < 2) return null
  const start = markers.find((marker) => marker.kind === 'start')
  const end = markers.find((marker) => marker.kind === 'end')
  if (!start || !end) return null
  return (distance(points[0], start) + distance(points.at(-1) ?? points[0], end)) / 2
}

function markerToRouteMean(markers: RouteMarker[], candidateDistance: Float32Array, width: number, height: number) {
  const distances = markers.flatMap((marker) => {
    const x = Math.round(marker.x)
    const y = Math.round(marker.y)
    if (x < 0 || x >= width || y < 0 || y >= height) return []
    return [candidateDistance[y * width + x]]
  })
  if (!distances.length) return null
  return distances.reduce((sum, value) => sum + value, 0) / distances.length
}

function computeTrackMetrics(points: RoutePoint[], markers: RouteMarker[], referenceMask: Mask, width: number, height: number): TrackProbeMetrics {
  const candidateMask = rasterizePolyline(points, width, height, 5)
  const referenceDistance = distanceTransform(referenceMask, width, height)
  const candidateDistance = distanceTransform(candidateMask, width, height)
  const candidateDistances = valuesFromMask(candidateMask, referenceDistance)
  const referenceDistances = valuesFromMask(referenceMask, candidateDistance)
  const candidateTortuosity = tortuosity(points)
  const referenceTortuosity = candidateTortuosity
  const candidateTurnDensity = turnDensity(points)
  const referenceTurnDensity = candidateTurnDensity
  return {
    candidateToReferenceP95: percentile(candidateDistances, 0.95),
    referenceToCandidateP95: percentile(referenceDistances, 0.95),
    candidateOnReferenceRatio: ratioWithin(candidateDistances, 8),
    referenceCoverageRatio: ratioWithin(referenceDistances, 14),
    referenceComponentCount: connectedComponents(referenceMask, width, height, 1).length,
    endpointErrorPx: endpointError(points, markers),
    markerToRouteMeanPx: markerToRouteMean(markers, candidateDistance, width, height),
    maxSegmentGapPx: maxSegmentGap(points),
    tortuosity: candidateTortuosity,
    referenceTortuosity,
    tortuosityRatio: candidateTortuosity && referenceTortuosity ? candidateTortuosity / referenceTortuosity : null,
    turnDensity: candidateTurnDensity,
    referenceTurnDensity,
    turnDensityRatio: candidateTurnDensity && referenceTurnDensity ? candidateTurnDensity / referenceTurnDensity : null,
  }
}

function gradeCandidate(candidate: TrackProbeCandidate) {
  if (candidate.points.length < 2) return 'no-track' satisfies ProbeGrade
  const metrics = candidate.metrics
  const maxGap = metrics.maxSegmentGapPx ?? Infinity
  if (maxGap > HARD_JOIN_LIMIT_PX) return 'poor' satisfies ProbeGrade
  const c2r = metrics.candidateToReferenceP95 ?? Infinity
  const r2c = metrics.referenceToCandidateP95 ?? Infinity
  const coverage = metrics.referenceCoverageRatio ?? 0
  const onReference = metrics.candidateOnReferenceRatio ?? 0
  const endpoint = metrics.endpointErrorPx ?? Infinity
  if (c2r <= 25 && r2c <= 18 && coverage >= 0.9 && onReference >= 0.8 && endpoint <= 75) return 'faithful' satisfies ProbeGrade
  if (c2r <= 35 && r2c <= 36 && coverage >= 0.65 && onReference >= 0.55 && endpoint <= 120) return 'rough' satisfies ProbeGrade
  return 'poor' satisfies ProbeGrade
}

function formatMetric(value: number | null | undefined, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a'
}

function xmlEscape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function markerCounts(markers: RouteMarker[]) {
  return {
    start: markers.filter((marker) => marker.kind === 'start').length,
    end: markers.filter((marker) => marker.kind === 'end').length,
    intermediate: markers.filter((marker) => marker.kind === 'intermediate').length,
  }
}

function svgPolyline(points: RoutePoint[]) {
  if (points.length < 2) return ''
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  return `
  <polyline points="${polyline}" fill="none" stroke="rgba(2,6,23,0.86)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="${polyline}" fill="none" stroke="#7ef0b4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
}

function svgMarkers(markers: RouteMarker[]) {
  return markers
    .map((marker) => {
      const fill = marker.kind === 'start' ? '#22c55e' : marker.kind === 'end' ? '#fb7185' : '#a7f3d0'
      const radius = marker.kind === 'intermediate' ? 7 : 13
      const stroke = marker.kind === 'intermediate' ? '#065f46' : '#0f172a'
      return `<circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`
    })
    .join('\n  ')
}

async function writeMaskDebug(path: string, sourceImage: string, mask: Mask, width: number, height: number) {
  const overlay = Buffer.alloc(width * height * 4)
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    const offset = index * 4
    overlay[offset] = 56
    overlay[offset + 1] = 189
    overlay[offset + 2] = 248
    overlay[offset + 3] = 165
  }
  await sharp(sourceImage)
    .composite([{ input: overlay, raw: { width, height, channels: 4 }, blend: 'over' }])
    .png()
    .toFile(path)
}

async function writeTrackOverlay(sample: Sample, imagePath: string, candidate: TrackProbeCandidate, width: number, height: number) {
  await mkdir(TRACK_PROBE_DIR, { recursive: true })
  const label = `${candidate.method} · ${candidate.grade} · ${candidate.topology ?? 'unknown'} · c2r ${formatMetric(candidate.metrics.candidateToReferenceP95)} · cov ${
    typeof candidate.metrics.referenceCoverageRatio === 'number' ? `${Math.round(candidate.metrics.referenceCoverageRatio * 100)}%` : 'n/a'
  } · gap ${formatMetric(candidate.metrics.maxSegmentGapPx, 0)}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="14" y="15" width="${Math.min(width - 28, 780)}" height="44" rx="10" fill="rgba(15,23,42,0.86)"/>
  <text x="30" y="45" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#f8fafc">${xmlEscape(label)}</text>
  ${svgPolyline(candidate.points)}
  ${svgMarkers(candidate.markers)}
</svg>`
  const overlayPath = join(TRACK_PROBE_DIR, `${sample.id}-${candidate.method}-overlay.png`)
  await sharp(imagePath)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png()
    .toFile(overlayPath)
  return overlayPath
}

async function writeSideBySide(sample: Sample, leftPath: string, rightPath: string) {
  const left = sharp(leftPath)
  const right = sharp(rightPath)
  const leftMeta = await left.metadata()
  const rightMeta = await right.metadata()
  const width = (leftMeta.width ?? 0) + (rightMeta.width ?? 0)
  const height = Math.max(leftMeta.height ?? 0, rightMeta.height ?? 0)
  if (!width || !height) throw new Error(`Could not build side-by-side overlay for ${sample.id}`)
  const output = join(TRACK_PROBE_DIR, `${sample.id}-side-by-side.png`)
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#000000',
    },
  })
    .composite([
      { input: await left.png().toBuffer(), left: 0, top: 0 },
      { input: await right.png().toBuffer(), left: leftMeta.width ?? 0, top: 0 },
    ])
    .png()
    .toFile(output)
  return output
}

async function writeFullNoTrackCheck(sample: Sample, imagePath: string, extraction: FullTrackExtraction, width: number, height: number) {
  await mkdir(FULL_TRACK_DIR, { recursive: true })
  const label = `cv · ${extraction.candidate.grade} · ${extraction.mimoClassification} · ${extraction.failureMode ?? 'no route drawn'}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="14" y="15" width="${Math.min(width - 28, 900)}" height="48" rx="10" fill="rgba(15,23,42,0.88)"/>
  <text x="30" y="47" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#f8fafc">${xmlEscape(label)}</text>
</svg>`
  const outputPath = join(FULL_TRACK_DIR, `${sample.id}-no-track-check.png`)
  await sharp(imagePath)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png()
    .toFile(outputPath)
  return outputPath
}

async function writeFullTrackOverlay(sample: Sample, imagePath: string, extraction: FullTrackExtraction, width: number, height: number) {
  await mkdir(FULL_TRACK_DIR, { recursive: true })
  const candidate = extraction.candidate
  const label = `${candidate.method} · ${candidate.grade} · ${candidate.topology ?? 'unknown'} · truth ${extraction.routeTruth} · c2r ${formatMetric(candidate.metrics.candidateToReferenceP95)} · cov ${
    typeof candidate.metrics.referenceCoverageRatio === 'number' ? `${Math.round(candidate.metrics.referenceCoverageRatio * 100)}%` : 'n/a'
  }`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="14" y="15" width="${Math.min(width - 28, 960)}" height="48" rx="10" fill="rgba(15,23,42,0.88)"/>
  <text x="30" y="47" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#f8fafc">${xmlEscape(label)}</text>
  ${svgPolyline(candidate.points)}
  ${svgMarkers(candidate.markers)}
</svg>`
  const outputPath = join(FULL_TRACK_DIR, `${sample.id}-cv-overlay.png`)
  await sharp(imagePath)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png()
    .toFile(outputPath)
  return outputPath
}

async function writeFullTrackEvidence(sample: Sample, extraction: FullTrackExtraction) {
  const image = await readPixelImage(sample)
  if (extraction.candidate.points.length < 2) {
    const noTrackPath = await writeFullNoTrackCheck(sample, image.path, extraction, image.width, image.height)
    extraction.overlayPath = noTrackPath
    extraction.candidate.overlayPath = noTrackPath
    return extraction
  }
  const referenceMaskPath = join(FULL_TRACK_DIR, `${sample.id}-reference-mask.png`)
  const debugMaskPath = join(FULL_TRACK_DIR, `${sample.id}-debug-mask.png`)
  await writeMaskDebug(
    referenceMaskPath,
    image.path,
    extraction.referenceMaskData ?? rasterizePolyline(extraction.candidate.points, image.width, image.height, 5),
    image.width,
    image.height
  )
  await writeMaskDebug(
    debugMaskPath,
    image.path,
    extraction.debugMaskData ?? rasterizePolyline(extraction.candidate.points, image.width, image.height, 2),
    image.width,
    image.height
  )
  const overlayPath = await writeFullTrackOverlay(sample, image.path, extraction, image.width, image.height)
  extraction.overlayPath = overlayPath
  extraction.referenceMaskPath = referenceMaskPath
  extraction.debugMaskPath = debugMaskPath
  extraction.candidate.overlayPath = overlayPath
  extraction.candidate.debugMaskPath = debugMaskPath
  return extraction
}

function normalizeCandidateFromCache(candidate: TrackProbeCandidate, width: number, height: number): TrackProbeCandidate {
  const points = normalizePoints(candidate.points, width, height)
  const markers = (candidate.markers ?? []).map((marker) => ({
    ...marker,
    x: Math.max(0, Math.min(width, Number(marker.x))),
    y: Math.max(0, Math.min(height, Number(marker.y))),
  }))
  return {
    ...candidate,
    topology: candidate.topology ?? 'unknown',
    points,
    markers,
    notes: [
      ...(candidate.notes ?? []),
      'mimo-hd candidate reused from existing track-probe cache; no fresh API call in v2 rerun.',
    ],
    api: candidate.api ? { ...candidate.api, reusedFromCache: true } : undefined,
  }
}

async function loadCachedMimoCandidates(samples: Sample[]) {
  const cachePath = join(TRACK_PROBE_DIR, 'track-probe-results.json')
  if (!existsSync(cachePath)) {
    throw new Error(`Track-probe cache is missing at ${cachePath}; refusing to call MIMO in --track-probe mode.`)
  }

  const cached = JSON.parse(await readFile(cachePath, 'utf8')) as ProbeCacheResult[]
  const result = new Map<string, TrackProbeCandidate>()
  for (const sample of samples) {
    const cacheItem = cached.find((item) => item.sample.id === sample.id)
    const candidate = cacheItem?.candidates.find((item) => item.method === 'mimo-hd')
    if (!cacheItem || !candidate) {
      throw new Error(`Missing cached mimo-hd candidate for ${sample.id}; refusing to call MIMO in --track-probe mode.`)
    }
    result.set(sample.id, normalizeCandidateFromCache(candidate, cacheItem.width, cacheItem.height))
  }
  return result
}

async function preserveBaselineArtifacts() {
  await mkdir(TRACK_PROBE_DIR, { recursive: true })
  const reportPath = join(TRACK_PROBE_DIR, 'track-probe-report.md')
  if (!existsSync(reportPath)) return null
  const report = await readFile(reportPath, 'utf8')
  const entries = await readdir(TRACK_PROBE_DIR, { withFileTypes: true })
  const existingBaselines = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('baseline-v1-'))
    .map((entry) => join(TRACK_PROBE_DIR, entry.name))
    .sort()
  if (report.includes('Track Probe v2')) return existingBaselines.at(-1) ?? null
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')
  const baselineDir = join(TRACK_PROBE_DIR, `baseline-v1-${timestamp}`)
  await mkdir(baselineDir, { recursive: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.(?:md|json|csv|png)$/u.test(entry.name)) continue
    await copyFile(join(TRACK_PROBE_DIR, entry.name), join(baselineDir, entry.name))
  }
  return baselineDir
}

function stripTencentBaseline(sample: Sample): Omit<Sample, 'tencentBaseline'> {
  return {
    id: sample.id,
    app: sample.app,
    fileName: sample.fileName,
    imageId: sample.imageId,
    mapStyle: sample.mapStyle,
    notes: sample.notes,
    groundTruth: sample.groundTruth,
    fixtureId: sample.fixtureId,
    tencentBaselineNote: sample.tencentBaselineNote,
  }
}

async function buildTrackProbeResult(sample: Sample, cachedMimo: TrackProbeCandidate) {
  const image = await readPixelImage(sample)
  const cv = extractCvRoute(sample, image)
  const cvCandidate: TrackProbeCandidate = {
    sampleId: sample.id,
    method: 'cv',
    routeType: cv.routeType,
    topology: cv.topology,
    points: cv.points,
    markers: cv.markers,
    grade: 'no-track',
    metrics: computeTrackMetrics(cv.points, cv.markers, cv.referenceMask, image.width, image.height),
    notes: cv.notes,
  }
  cvCandidate.grade = gradeCandidate(cvCandidate)

  const mimoCandidate: TrackProbeCandidate = {
    ...cachedMimo,
    metrics: computeTrackMetrics(cachedMimo.points, cachedMimo.markers, cv.referenceMask, image.width, image.height),
  }
  mimoCandidate.grade = gradeCandidate(mimoCandidate)

  cvCandidate.debugMaskPath = join(TRACK_PROBE_DIR, `${sample.id}-reference-mask.png`)
  await writeMaskDebug(cvCandidate.debugMaskPath, image.path, cv.debugMask, image.width, image.height)
  mimoCandidate.overlayPath = await writeTrackOverlay(sample, image.path, mimoCandidate, image.width, image.height)
  cvCandidate.overlayPath = await writeTrackOverlay(sample, image.path, cvCandidate, image.width, image.height)
  const sideBySidePath = await writeSideBySide(sample, mimoCandidate.overlayPath, cvCandidate.overlayPath)
  cvCandidate.notes.push(`Side-by-side acceptance overlay: ${sideBySidePath}`)

  return {
    result: {
      sample: stripTencentBaseline(sample),
      width: image.width,
      height: image.height,
      referenceMask: {
        routePixelCount: cv.routePixelCount,
        componentCount: cv.componentCount,
        selectedComponentCount: cv.selectedComponentCount,
        falsePositiveComponentCount: cv.falsePositiveComponentCount,
        ...(cv.redRoadInterference ? { redRoadInterference: cv.redRoadInterference } : {}),
      },
      candidates: [mimoCandidate, cvCandidate],
    } satisfies TrackProbeResult,
    sideBySidePath,
  }
}

function csvValue(value: string | number | boolean | null | undefined) {
  if (value === null || typeof value === 'undefined') return 'n/a'
  const text = String(value)
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

async function writeTrackProbeOutputs(results: TrackProbeResult[], sideBySidePaths: Map<string, string>, baselineDir: string | null) {
  const resultPath = join(TRACK_PROBE_DIR, 'track-probe-results.json')
  await writeFile(resultPath, JSON.stringify(results, null, 2))

  const rows = [
    [
      'sampleId',
      'method',
      'grade',
      'routeType',
      'topology',
      'pointCount',
      'markerCount',
      'candidateToReferenceP95',
      'referenceToCandidateP95',
      'candidateOnReferenceRatio',
      'referenceCoverageRatio',
      'endpointErrorPx',
      'markerToRouteMeanPx',
      'maxSegmentGapPx',
      'tortuosityRatio',
      'turnDensityRatio',
      'overlayPath',
      'debugMaskPath',
    ].join(','),
    ...results.flatMap((result) =>
      result.candidates.map((candidate) =>
        [
          result.sample.id,
          candidate.method,
          candidate.grade,
          candidate.routeType,
          candidate.topology ?? 'unknown',
          candidate.points.length,
          candidate.markers.length,
          formatMetric(candidate.metrics.candidateToReferenceP95),
          formatMetric(candidate.metrics.referenceToCandidateP95),
          formatMetric(candidate.metrics.candidateOnReferenceRatio, 3),
          formatMetric(candidate.metrics.referenceCoverageRatio, 3),
          formatMetric(candidate.metrics.endpointErrorPx),
          formatMetric(candidate.metrics.markerToRouteMeanPx),
          formatMetric(candidate.metrics.maxSegmentGapPx),
          formatMetric(candidate.metrics.tortuosityRatio, 3),
          formatMetric(candidate.metrics.turnDensityRatio, 3),
          candidate.overlayPath ?? '',
          candidate.debugMaskPath ?? '',
        ]
          .map(csvValue)
          .join(',')
      )
    ),
  ]
  await writeFile(join(TRACK_PROBE_DIR, 'track-probe-summary.csv'), rows.join('\n'))

  const freshCalls = 0
  const reusedCalls = results.flatMap((result) => result.candidates).filter((candidate) => candidate.method === 'mimo-hd').length
  const cachedCost = results
    .flatMap((result) => result.candidates)
    .filter((candidate) => candidate.method === 'mimo-hd')
    .reduce((sum, candidate) => sum + (candidate.api?.costCny ?? 0), 0)
  const overlayLines = results.flatMap((result) => {
    const sideBySide = sideBySidePaths.get(result.sample.id)
    return [
      `### ${result.sample.id}`,
      ...(sideBySide ? [`- Side-by-side: \`${sideBySide}\``] : []),
      ...result.candidates.flatMap((candidate) => [
        `- ${candidate.method} overlay: \`${candidate.overlayPath ?? 'n/a'}\``,
        ...(candidate.debugMaskPath ? [`- ${candidate.method} debug mask: \`${candidate.debugMaskPath}\``] : []),
      ]),
    ]
  })

  const resultTables = results
    .map((result) => {
      const rowsForSample = result.candidates
        .map((candidate) => {
          const counts = markerCounts(candidate.markers)
          return `| ${candidate.method} | ${candidate.grade} | ${candidate.topology ?? 'unknown'} | ${candidate.points.length} | start ${counts.start} / end ${counts.end} / mid ${counts.intermediate} | ${formatMetric(candidate.metrics.candidateToReferenceP95)} | ${formatMetric(candidate.metrics.referenceToCandidateP95)} | ${
            typeof candidate.metrics.referenceCoverageRatio === 'number' ? `${Math.round(candidate.metrics.referenceCoverageRatio * 100)}%` : 'n/a'
          } | ${formatMetric(candidate.metrics.maxSegmentGapPx, 0)} | ${candidate.overlayPath ?? 'n/a'} |`
        })
        .join('\n')
      const cv = result.candidates.find((candidate) => candidate.method === 'cv')
      const closureNote =
        result.sample.id === 'wechat-711'
          ? (cv?.metrics.maxSegmentGapPx ?? Infinity) <= HARD_JOIN_LIMIT_PX
            ? '711 horizontal false closure: removed.'
            : '711 horizontal false closure: not removed.'
          : (cv?.metrics.maxSegmentGapPx ?? Infinity) <= HARD_JOIN_LIMIT_PX
            ? '712 top false straight segment: removed.'
            : '712 top false straight segment: not removed.'
      return `### ${result.sample.id} (${result.sample.app})

- Reference mask pixels: ${result.referenceMask.routePixelCount}
- Reference components: ${result.referenceMask.selectedComponentCount}/${result.referenceMask.componentCount} selected
- Red-road interference: ${result.referenceMask.redRoadInterference ?? 'n/a'}
- ${closureNote}

| Method | Grade | Topology | Points | Markers | C2R P95 px | R2C P95 px | Coverage | Max gap px | Overlay |
|---|---:|---:|---:|---|---:|---:|---:|---:|---|
${rowsForSample}`
    })
    .join('\n\n')

  const report = `# mimo-v2.5 Track Probe v2 Report

Generated: ${new Date().toISOString()}

## Scope
- Samples: wechat-711 and wechat-712 only.
- No app UI, route, Tencent OCR pipeline, migration, schema, or production operation touched.
- MIMO-HD candidates were loaded from the existing track-probe cache; no fresh MIMO request was made.
- CV implementation was rebuilt because the prior untracked track-probe source was lost; previous output artifacts were treated as v1 baseline evidence.

## B13
- Lost-source disclosure: live \`scripts/mimo-v25-spike.ts\` no longer had \`orderComponentPaths\` / CV track-probe code, so v2 rebuilds the probe from current requirements and surviving output evidence.
- Baseline artifact copy: ${baselineDir ? `\`${baselineDir}\`` : 'not created because current report was already v2 or no previous report existed'}.
- CV metrics remain biased because the candidate and reference mask share the same color source; human overlay review remains authoritative.
- 711 waypoint anchors are visible numbered route markers used for this bounded probe, not production automation.

## Acceptance Standard
- Only \`faithful\` is acceptable for screenshot route posters.
- Dimensions: on-line fidelity, coverage, shape character, topology/order, and point semantics.
- Through routes stop at the end anchor; only loop routes may close back near the start.

## Cost / Latency
- MiMo API records: ${reusedCalls} (${freshCalls} fresh this run, ${reusedCalls} reused from existing output cache)
- Adopted recorded cached cost: ¥${cachedCost.toFixed(6)}
- Pricing basis: ${ADOPTED_PRICE_CNY_PER_MILLION.source}; B13 discrepancy remains ${ADOPTED_PRICE_CNY_PER_MILLION.discrepancy}

## Results
${resultTables}

## Evidence Paths
${overlayLines.join('\n')}

## Output Files
- Candidate JSON: \`${resultPath}\`
- Summary CSV: \`${join(TRACK_PROBE_DIR, 'track-probe-summary.csv')}\`
`

  await writeFile(join(TRACK_PROBE_DIR, 'track-probe-report.md'), report)
}

async function runTrackProbe(samples: Sample[]) {
  const selected = samples.filter((sample) => TRACK_PROBE_SAMPLE_IDS.has(sample.id))
  if (selected.length !== TRACK_PROBE_SAMPLE_IDS.size) {
    throw new Error(`Expected track-probe samples wechat-711 and wechat-712, found ${selected.map((sample) => sample.id).join(', ')}`)
  }
  const cachedMimo = await loadCachedMimoCandidates(selected)
  const baselineDir = await preserveBaselineArtifacts()
  const results: TrackProbeResult[] = []
  const sideBySidePaths = new Map<string, string>()

  for (const sample of selected) {
    const cached = cachedMimo.get(sample.id)
    if (!cached) throw new Error(`Missing cached mimo-hd candidate for ${sample.id}`)
    const built = await buildTrackProbeResult(sample, cached)
    results.push(built.result)
    sideBySidePaths.set(sample.id, built.sideBySidePath)
    const cv = built.result.candidates.find((candidate) => candidate.method === 'cv')
    console.log(
      [
        `sample=${sample.id}`,
        'mimo=fresh:no',
        `cvGrade=${cv?.grade ?? 'n/a'}`,
        `topology=${cv?.topology ?? 'unknown'}`,
        `maxGapPx=${formatMetric(cv?.metrics.maxSegmentGapPx, 0)}`,
        `coverage=${typeof cv?.metrics.referenceCoverageRatio === 'number' ? `${Math.round(cv.metrics.referenceCoverageRatio * 100)}%` : 'n/a'}`,
        `sideBySide=${built.sideBySidePath}`,
      ].join(' ')
    )
  }

  await writeTrackProbeOutputs(results, sideBySidePaths, baselineDir)
}

async function buildFullTrackGeneralization(samples: Sample[], results: MimoRunResult[]) {
  const resultById = new Map(results.map((result) => [result.sample.id, result]))
  const extractions: FullTrackExtraction[] = []
  await mkdir(FULL_TRACK_DIR, { recursive: true })
  for (const sample of samples) {
    const result = resultById.get(sample.id)
    if (!result) throw new Error(`Missing MIMO result for ${sample.id}; cannot build full track generalization.`)
    const image = await readPixelImage(sample)
    const extraction = buildFullCvCandidate(sample, result, image)
    await writeFullTrackEvidence(sample, extraction)
    extractions.push(extraction)
    console.log(
      [
        `track sample=${sample.id}`,
        `truth=${extraction.routeTruth}`,
        `mimo=${extraction.mimoClassification}`,
        `cvGrade=${extraction.candidate.grade}`,
        `topology=${extraction.candidate.topology ?? 'unknown'}`,
        `colorCue=${extraction.colorCueStatus}`,
        `failure=${extraction.failureMode ?? 'none'}`,
        `overlay=${basename(extraction.overlayPath)}`,
      ].join(' ')
    )
  }
  return extractions
}

function sanitizeTrackExtraction(extraction: FullTrackExtraction) {
  const safe: Partial<FullTrackExtraction> = { ...extraction }
  delete safe.referenceMaskData
  delete safe.debugMaskData
  return safe
}

async function writeTrackGeneralizationOutputs(extractions: FullTrackExtraction[]) {
  const resultPath = join(OUTPUT_DIR, 'track-generalization-results.json')
  await writeFile(resultPath, JSON.stringify(extractions.map(sanitizeTrackExtraction), null, 2))
  const summaryPath = join(OUTPUT_DIR, 'track-generalization-summary.csv')
  const rows = [
    [
      'sampleId',
      'app',
      'routeTruth',
      'mimoClassification',
      'cvGrade',
      'routeType',
      'topology',
      'pointCount',
      'markerCount',
      'lineColorCue',
      'colorCueStatus',
      'failureMode',
      'routePixelCount',
      'componentCount',
      'selectedComponentCount',
      'falsePositiveComponentCount',
      'candidateToReferenceP95',
      'referenceToCandidateP95',
      'referenceCoverageRatio',
      'maxSegmentGapPx',
      'overlayPath',
      'referenceMaskPath',
      'debugMaskPath',
    ].join(','),
    ...extractions.map((extraction) =>
      [
        extraction.sample.id,
        extraction.sample.app,
        extraction.routeTruth,
        extraction.mimoClassification,
        extraction.candidate.grade,
        extraction.candidate.routeType,
        extraction.candidate.topology ?? 'unknown',
        extraction.candidate.points.length,
        extraction.candidate.markers.length,
        extraction.lineColorCue,
        extraction.colorCueStatus,
        extraction.failureMode ?? '',
        extraction.referenceMask.routePixelCount,
        extraction.referenceMask.componentCount,
        extraction.referenceMask.selectedComponentCount,
        extraction.referenceMask.falsePositiveComponentCount,
        formatMetric(extraction.candidate.metrics.candidateToReferenceP95),
        formatMetric(extraction.candidate.metrics.referenceToCandidateP95),
        formatMetric(extraction.candidate.metrics.referenceCoverageRatio, 3),
        formatMetric(extraction.candidate.metrics.maxSegmentGapPx),
        extraction.overlayPath,
        extraction.referenceMaskPath ?? '',
        extraction.debugMaskPath ?? '',
      ]
        .map(csvValue)
        .join(',')
    ),
  ]
  await writeFile(summaryPath, rows.join('\n'))
  return { resultPath, summaryPath }
}

async function runStabilityRepeats(samples: Sample[], apiKey: string) {
  await mkdir(STABILITY_DIR, { recursive: true })
  const stabilityResults: MimoRunResult[] = []
  for (const sampleId of STABILITY_SAMPLE_IDS) {
    const sample = samples.find((item) => item.id === sampleId)
    if (!sample) throw new Error(`Stability sample ${sampleId} was not found in manifest.`)
    const outputPath = join(STABILITY_DIR, `${sample.id}-repeat-2.json`)
    if (existsSync(outputPath)) {
      const existing = JSON.parse(await readFile(outputPath, 'utf8')) as MimoRunResult
      stabilityResults.push(existing)
      console.log(`stability sample=${sample.id} fresh=no`)
      continue
    }
    const result = await runMimo(sample, apiKey)
    await writeFile(outputPath, JSON.stringify(result, null, 2))
    stabilityResults.push(result)
    console.log(
      [
        `stability sample=${sample.id}`,
        'fresh=yes',
        `json=${result.json.parseable ? 'yes' : 'no'}`,
        `latencyMs=${result.api.latencyMs}`,
        `costCny=${result.pricing.adoptedCny.toFixed(6)}`,
      ].join(' ')
    )
  }
  return stabilityResults
}

function fieldVariance(primary: MimoRunResult | undefined, repeat: MimoRunResult | undefined, field: TextFieldKey) {
  if (!primary || !repeat) return ''
  const a = valueFromMimo(primary, field).value
  const b = valueFromMimo(repeat, field).value
  if (typeof a === 'number' && typeof b === 'number') return String(Number((b - a).toFixed(4)))
  if (typeof a === 'string' || typeof b === 'string') return a === b ? 'same' : 'changed'
  return ''
}

async function writeStabilitySummary(primaryResults: MimoRunResult[], stabilityResults: MimoRunResult[]) {
  const primaryById = new Map(primaryResults.map((result) => [result.sample.id, result]))
  const path = join(OUTPUT_DIR, 'stability-summary.csv')
  const rows = [
    [
      'sampleId',
      'primaryParsePath',
      'repeatParsePath',
      'primaryLatencyMs',
      'repeatLatencyMs',
      'primaryCostCny',
      'repeatCostCny',
      ...TEXT_FIELD_KEYS.map((field) => `${field}Delta`),
      'repeatJsonPath',
    ].join(','),
    ...stabilityResults.map((repeat) => {
      const primary = primaryById.get(repeat.sample.id)
      return [
        repeat.sample.id,
        primary?.json.parsePath ?? '',
        repeat.json.parsePath,
        primary?.api.latencyMs ?? '',
        repeat.api.latencyMs,
        primary?.pricing.adoptedCny.toFixed(6) ?? '',
        repeat.pricing.adoptedCny.toFixed(6),
        ...TEXT_FIELD_KEYS.map((field) => fieldVariance(primary, repeat, field)),
        join(STABILITY_DIR, `${repeat.sample.id}-repeat-2.json`),
      ]
        .map(csvValue)
        .join(',')
    }),
  ]
  await writeFile(path, rows.join('\n'))
  return path
}

function percentileNumber(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
}

async function writeRootRunSummary(results: MimoRunResult[]) {
  const path = join(OUTPUT_DIR, 'summary.csv')
  const rows = [
    'sampleId,imageId,app,mapStyle,schemaVersion,jsonParseable,parsePath,anthropicFallback,repairAttempts,latencyMs,inputTokens,cachedInputTokens,outputTokens,totalTokens,adoptedCostCny,officialLegacyCostCny,routeClassification,lineColor,overlayPath,resultJsonPath',
    ...results.map((result) => {
      const officialLegacyCost =
        ((Math.max(0, result.usage.inputTokens - result.usage.cachedInputTokens) * 2.8 +
          result.usage.cachedInputTokens * 0.56 +
          result.usage.outputTokens * 14) /
          1_000_000)
      return [
        result.sample.id,
        result.sample.imageId,
        result.sample.app,
        result.sample.mapStyle,
        result.schemaVersion ?? 'legacy',
        result.json.parseable,
        result.json.parsePath,
        result.api.anthropicFallbackUsed,
        result.api.repairAttempts,
        result.api.latencyMs,
        result.usage.inputTokens,
        result.usage.cachedInputTokens,
        result.usage.outputTokens,
        result.usage.totalTokens,
        result.pricing.adoptedCny.toFixed(6),
        officialLegacyCost.toFixed(6),
        routeClassification(result.parsed),
        result.parsed?.route?.lineColor ?? '',
        result.overlayPath ?? '',
        join(RESULT_DIR, `${result.sample.id}.json`),
      ]
        .map(csvValue)
        .join(',')
    }),
  ]
  await writeFile(path, rows.join('\n'))
  return path
}

async function writeFullBenchmarkReport({
  samples,
  results,
  stabilityResults,
  textRows,
  textComparisonPath,
  fieldSummaryPath,
  trackExtractions,
  trackSummaryPath,
  trackResultPath,
  stabilitySummaryPath,
  summaryPath,
}: {
  samples: Sample[]
  results: MimoRunResult[]
  stabilityResults: MimoRunResult[]
  textRows: FieldComparison[]
  textComparisonPath: string
  fieldSummaryPath: string
  trackExtractions: FullTrackExtraction[]
  trackSummaryPath: string
  trackResultPath: string
  stabilitySummaryPath: string
  summaryPath: string
}) {
  const counts = statusCounts(results)
  const latencies = results.map((result) => result.api.latencyMs)
  const totalCost = results.reduce((sum, result) => sum + result.pricing.adoptedCny, 0)
  const stabilityCost = stabilityResults.reduce((sum, result) => sum + result.pricing.adoptedCny, 0)
  const freshPrimary = results.filter((result) => result.schemaVersion === SCHEMA_VERSION).length
  const legacyPrimary = results.length - freshPrimary
  const tencentAvailable = samples.filter((sample) => Boolean(sample.tencentBaseline)).length
  const mimoWins = textRows.filter((row) => row.winner === 'mimo_only').length
  const tencentWins = textRows.filter((row) => row.winner === 'tencent_only').length
  const bothWrong = textRows.filter((row) => row.winner === 'both_wrong').length
  const speedPaceRows = textRows.filter((row) => row.field === 'speedKmh' || row.field === 'paceMinPerKm')
  const elevationRows = textRows.filter((row) => row.field === 'elevationMeters' || row.field === 'elevationGainMeters')
  const routeCounts = {
    faithful: trackExtractions.filter((item) => item.candidate.grade === 'faithful').length,
    rough: trackExtractions.filter((item) => item.candidate.grade === 'rough').length,
    poor: trackExtractions.filter((item) => item.candidate.grade === 'poor').length,
    noTrack: trackExtractions.filter((item) => item.candidate.grade === 'no-track').length,
    hallucinated: trackExtractions.filter((item) => item.failureMode === 'hallucinated_track').length,
    colorUnusable: trackExtractions.filter((item) => item.failureMode === 'color_unusable').length,
  }
  const evidencePaths = [
    summaryPath,
    textComparisonPath,
    fieldSummaryPath,
    trackSummaryPath,
    trackResultPath,
    stabilitySummaryPath,
    join(OUTPUT_DIR, 'manifest.json'),
    ...results.map((result) => join(RESULT_DIR, `${result.sample.id}.json`)),
    ...stabilityResults.map((result) => join(STABILITY_DIR, `${result.sample.id}-repeat-2.json`)),
    ...trackExtractions.flatMap((item) => [item.overlayPath, item.referenceMaskPath ?? '', item.debugMaskPath ?? ''].filter(Boolean)),
  ]
  const report = `# mimo-v2.5 Full Spike Report

Generated: ${new Date().toISOString()}

## Scope
- Dataset: ${samples.length} screenshots from \`爬山轨迹结果参考图片/\`.
- Research-only: no app UI, route, Tencent OCR pipeline, migration, schema, or production operation touched.
- Model: ${MODEL}; temperature=0; OpenAI-compatible first, JSON repair once, Anthropic-compatible tool-use fallback only if JSON remains invalid.
- Tencent+regex baseline: reference column only where raw OCR fixtures exist (${tencentAvailable}/${samples.length}); \`wechat-711\` and \`wechat-712\` remain Tencent baseline N/A.

## B13
- \`wechat-711\` primary result may be legacy smoke cache if \`${join(RESULT_DIR, 'wechat-711.json')}\` existed before this run; report labels legacy schema in \`${summaryPath}\`.
- \`wechat-712\` had no full stats cache before this sprint; if present now, it was created by this \`--all\` run and still does not borrow \`coros-629\`.
- Route extraction is pixel-shape redraw evidence from screenshots, not GPX-grade geography.
- Full-mode CV is driven by MIMO-reported route color/seed cues; no 711/712 hard-coded HSV profile is used in \`--all\`.
- CV metrics are supportive and biased by the image-derived color mask; human overlay review remains authoritative.
- Pricing B13: adopted billing uses ${ADOPTED_PRICE_CNY_PER_MILLION.source}. Official reference checked ${OFFICIAL_PRICE_REFERENCE.checkedAt}: ${OFFICIAL_PRICE_REFERENCE.accessiblePayAsYouGoSnapshot} ${OFFICIAL_PRICE_REFERENCE.priceUpdateSnapshot}

## Reliability / Cost
- JSON parseable: ${counts.jsonParseable}/${counts.total}
- Repair retries: ${counts.repaired}
- Anthropic fallbacks: ${counts.anthropicFallbacks}
- Primary records: ${results.length} (${freshPrimary} current schema, ${legacyPrimary} legacy cache)
- Stability repeats: ${stabilityResults.length}
- Average latency: ${latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0} ms
- P95 latency: ${Math.round(percentileNumber(latencies, 0.95))} ms
- Primary adopted cost: ¥${totalCost.toFixed(6)}
- Stability adopted cost: ¥${stabilityCost.toFixed(6)}
- Average adopted cost / primary image: ¥${(totalCost / Math.max(1, results.length)).toFixed(6)}

## Text Accuracy
- MIMO-only wins: ${mimoWins}
- Tencent-only wins: ${tencentWins}
- Both wrong: ${bothWrong}
- Speed/pace wrong-field cases: ${speedPaceRows.filter((row) => row.mimoStatus === 'wrong_field' || row.tencentStatus === 'wrong_field').length}
- Elevation/gain wrong-field cases: ${elevationRows.filter((row) => row.mimoStatus === 'wrong_field' || row.tencentStatus === 'wrong_field').length}
- Full three-column comparison: \`${textComparisonPath}\`
- Field accuracy summary: \`${fieldSummaryPath}\`

## Route Generalization
- Faithful: ${routeCounts.faithful}
- Rough: ${routeCounts.rough}
- Poor: ${routeCounts.poor}
- No-track: ${routeCounts.noTrack}
- Hallucinated-track failures: ${routeCounts.hallucinated}
- Color-unusable failures: ${routeCounts.colorUnusable}
- Summary: \`${trackSummaryPath}\`
- Candidate JSON: \`${trackResultPath}\`

## Evidence Paths
${evidencePaths.map((path) => `- \`${path}\``).join('\n')}
`
  const reportPath = join(OUTPUT_DIR, 'report.md')
  await writeFile(reportPath, report)
  return reportPath
}

async function writeFullBenchmarkOutputs(samples: Sample[], results: MimoRunResult[], stabilityResults: MimoRunResult[]) {
  const summaryPath = await writeRootRunSummary(results)
  const { rows: textRows, comparisonPath: textComparisonPath, summaryPath: fieldSummaryPath } = await writeTextComparisonOutputs(samples, results)
  const trackExtractions = await buildFullTrackGeneralization(samples, results)
  const { resultPath: trackResultPath, summaryPath: trackSummaryPath } = await writeTrackGeneralizationOutputs(trackExtractions)
  const stabilitySummaryPath = await writeStabilitySummary(results, stabilityResults)
  return writeFullBenchmarkReport({
    samples,
    results,
    stabilityResults,
    textRows,
    textComparisonPath,
    fieldSummaryPath,
    trackExtractions,
    trackSummaryPath,
    trackResultPath,
    stabilitySummaryPath,
    summaryPath,
  })
}

async function main() {
  const mode = parseArgs()
  const samples = await buildSamples()
  await writeManifest(samples)

  if (mode === 'dry-run') {
    const existingPrimary = samples.filter((sample) => existsSync(join(RESULT_DIR, `${sample.id}.json`))).length
    const expectedFreshPrimary = samples.length - existingPrimary
    const existingStability = STABILITY_SAMPLE_IDS.filter((sampleId) => existsSync(join(STABILITY_DIR, `${sampleId}-repeat-2.json`))).length
    const expectedFreshStability = STABILITY_SAMPLE_IDS.length - existingStability
    console.log(
      [
        `manifest_ready samples=${samples.length}`,
        `existingPrimaryResults=${existingPrimary}`,
        `expectedFreshPrimaryCalls=${expectedFreshPrimary}`,
        `existingStabilityResults=${existingStability}`,
        `expectedFreshStabilityCalls=${expectedFreshStability}`,
        `wechat712FullStatsCache=${existsSync(join(RESULT_DIR, 'wechat-712.json')) ? 'present' : 'missing'}`,
        `output=${OUTPUT_DIR}`,
      ].join(' ')
    )
    return
  }

  if (mode === 'track-probe') {
    await runTrackProbe(samples)
    return
  }

  const apiKey = requireMimoApiKey()
  const selected = mode === 'smoke' ? samples.filter((sample) => sample.id === 'wechat-711') : samples
  if (mode === 'smoke' && selected.length !== 1) {
    throw new Error('Smoke sample _711 was not found in the manifest.')
  }

  const results: MimoRunResult[] = []
  for (const sample of selected) {
    const resultPath = join(RESULT_DIR, `${sample.id}.json`)
    if (mode === 'all' && existsSync(resultPath)) {
      const existing = JSON.parse(await readFile(resultPath, 'utf8')) as MimoRunResult
      results.push(existing)
      console.log(`skip_existing sample=${sample.id}`)
      continue
    }

    const result = await runMimo(sample, apiKey)
    await writeResult(result)
    results.push(result)
    console.log(
      [
        `sample=${sample.id}`,
        `json=${result.json.parseable ? 'yes' : 'no'}`,
        `parse=${result.json.parsePath}`,
        `thinking=${result.api.thinkingAccepted === true ? 'accepted' : result.api.thinkingAccepted === false ? 'rejected_retry_without' : 'unknown'}`,
        `latencyMs=${result.api.latencyMs}`,
        `inputTokens=${result.usage.inputTokens}`,
        `cachedInputTokens=${result.usage.cachedInputTokens}`,
        `outputTokens=${result.usage.outputTokens}`,
        `totalTokens=${result.usage.totalTokens}`,
        `costCny=${result.pricing.adoptedCny.toFixed(6)}`,
        `overlay=${result.overlayPath ? basename(result.overlayPath) : 'none'}`,
      ].join(' ')
    )
  }

  if (mode === 'all') {
    const stabilityResults = await runStabilityRepeats(samples, apiKey)
    const reportPath = await writeFullBenchmarkOutputs(samples, results, stabilityResults)
    console.log(`full_report=${reportPath}`)
    return
  }

  await writeSummary(results)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
