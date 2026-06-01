import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import sharp from 'sharp'
import { FIELD_VALIDATION, parseFieldsFromOcr } from '../src/lib/screenshot/field-parser.ts'
import type { OcrTextBlock, ParsedScreenshotFields } from '../src/lib/screenshot/types.ts'
import { SCREENSHOT_OCR_FIXTURES } from '../tests/fixtures/screenshots/ocr-fixtures.ts'

const MODEL = 'mimo-v2.5'
const OPENAI_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions'
const SCHEMA_VERSION = 'mimo-v25-text-generalization-v1'
const IMAGE_DIR = join(process.cwd(), '爬山轨迹结果参考图片')
const RAW_OCR_DIR = join(process.cwd(), 'tests/fixtures/screenshots/raw-ocr')
const OUTPUT_DIR = join(process.cwd(), 'output/mimo-text-v2-acceptance')
const RESULT_DIR = join(OUTPUT_DIR, 'results')
const CARD_DIR = join(OUTPUT_DIR, 'evidence-cards')
const BASELINE_DIR = join(process.cwd(), 'output/mimo-spike-acceptance')

const FIELD_KEYS = [
  'distanceKm',
  'durationSeconds',
  'speedKmh',
  'paceMinPerKm',
  'elevationMeters',
  'elevationGainMeters',
  'caloriesKcal',
  'date',
  'location',
] as const

const FIELD_LABELS: Record<FieldKey, string> = {
  distanceKm: 'Distance',
  durationSeconds: 'Duration',
  speedKmh: 'Speed km/h',
  paceMinPerKm: 'Pace min/km',
  elevationMeters: 'Elevation',
  elevationGainMeters: 'Gain',
  caloriesKcal: 'Calories',
  date: 'Date',
  location: 'Location',
}

const NUMERIC_TOLERANCE: Record<NumericFieldKey, number> = {
  distanceKm: 0.05,
  durationSeconds: 60,
  speedKmh: 0.12,
  paceMinPerKm: 0.12,
  elevationMeters: 2,
  elevationGainMeters: 2,
  caloriesKcal: 8,
}

const ADOPTED_PRICE_CNY_PER_MILLION = {
  inputCacheMiss: 1,
  inputCacheHit: 0.02,
  output: 2,
  source: 'user-provided 2026-05-27 mimo-v2.5 price screenshot',
}

type Mode = 'dry-run' | 'all' | 'evidence-only'
type FieldKey = (typeof FIELD_KEYS)[number]
type NumericFieldKey = Exclude<FieldKey, 'date' | 'location'>
type Visibility = 'visible' | 'not_visible' | 'ambiguous'
type SourceKind = 'activity_title' | 'map_label' | 'city_label' | 'route_name' | 'metric_label' | 'unknown'
type FieldStatus = 'match' | 'mismatch' | 'missing' | 'false_positive' | 'wrong_field' | 'not_scored'
type Winner = 'mimo_only' | 'tencent_only' | 'both_correct' | 'both_wrong' | 'both_missing' | 'not_scored'

type BBox = {
  x: number | null
  y: number | null
  width: number | null
  height: number | null
}

export type EvidenceCandidate = {
  raw: string | null
  labelRaw: string | null
  unitRaw: string | null
  bbox: BBox | null
  sourceKind: SourceKind
  visibility: Visibility
  confidence: number
  reason: string | null
}

type MimoTextPayload = {
  app: string | null
  imageType: string | null
  fields: Partial<Record<FieldKey, EvidenceCandidate[]>>
  derivedOnly?: Array<{ field: FieldKey | string; value: string | number | null; reason: string | null }>
  notes?: string[]
}

type MimoUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  raw: unknown
}

type ApiMeta = {
  endpoint: 'openai-compatible'
  model: typeof MODEL
  latencyMs: number
  status: number
  thinkingAccepted: boolean
  repairAttempts: number
  cacheHit: boolean
  imageReencoded?: boolean
}

type Sample = {
  id: string
  imageId: string
  fileName: string
  imagePath: string
  appHintForReport: string
  fixtureId?: string
  tencentBaseline?: ParsedScreenshotFields | null
  isHoldout: boolean
}

type TruthField = {
  value: number | string | null
  raw: string | null
  visibility: Visibility
  source: string
}

type TruthRecord = {
  sampleId: string
  fields: Record<FieldKey, TruthField>
  notes: string[]
}

export type AdjudicatedField = {
  value: number | string | null
  raw: string | null
  labelRaw: string | null
  unitRaw: string | null
  sourceKind: SourceKind | null
  visibility: Visibility
  confidence: number
  candidateCount: number
  rejectedCount: number
  hints: string[]
  topCandidates: EvidenceCandidate[]
}

type ResultRecord = {
  schemaVersion: typeof SCHEMA_VERSION
  sample: Omit<Sample, 'tencentBaseline'>
  api: ApiMeta
  usage: MimoUsage | null
  pricing: { adoptedCny: number; adoptedRate: typeof ADOPTED_PRICE_CNY_PER_MILLION } | null
  json: { parseable: boolean; parsePath: string }
  prompt: { noSampleHints: true; genericOnly: true }
  parsed: MimoTextPayload | null
  adjudicated: Record<FieldKey, AdjudicatedField>
}

type ComparisonRow = {
  sampleId: string
  field: FieldKey
  truthVisibility: Visibility
  truthValue: string
  truthRaw: string
  mimoValue: string
  mimoRaw: string
  mimoLabelRaw: string
  mimoUnitRaw: string
  mimoSourceKind: string
  mimoStatus: FieldStatus
  tencentValue: string
  tencentRaw: string
  tencentStatus: FieldStatus | 'n/a'
  winner: Winner
  hints: string
  evidenceCardPath: string
}

type Args = {
  mode: Mode
  holdoutDir?: string
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

const SOURCE_KIND_VALUES = new Set<SourceKind>(['activity_title', 'map_label', 'city_label', 'route_name', 'metric_label', 'unknown'])

const VISIBLE_TRUTH_OVERRIDES: Record<string, Partial<Record<FieldKey, Omit<TruthField, 'source'> & { source?: string }>> & { notes?: string[] }> = {
  'coros-629': {
    distanceKm: visible(10.32, '10.32 km'),
    durationSeconds: visible(12859, '3:34:19'),
    speedKmh: visible(2.9, '2.9 km/h'),
    elevationGainMeters: visible(544, '544 m'),
    date: visible('2026-05-02', '2026年5月2日 上午9:00'),
    location: visible('阳江市', '阳江市 登山'),
  },
  'coros-cropped-630': {
    distanceKm: visible(10.32, '10.32 km'),
    durationSeconds: visible(12859, '3:34:19'),
    speedKmh: visible(2.9, '2.9 km/h'),
    elevationGainMeters: visible(544, '544 m'),
    caloriesKcal: visible(2453, '2453 kcal'),
    date: visible('2026-05-02', '2026年5月2日 上午9:00'),
    location: visible('阳江市', '阳江市 登山'),
    notes: ['Corrects prior duration scoring bug: 3:34:19 is 12859 seconds, not 12259.'],
  },
  'liangbulu-631': {
    distanceKm: visible(13.42, '13.42公里'),
    durationSeconds: visible(19820, '05:30:20'),
    speedKmh: visible(2.4, '2.4 全程均速'),
    paceMinPerKm: visible(23 + 18 / 60, '23\'18" 平均配速'),
    elevationMeters: visible(1265, '1265 最高海拔'),
    elevationGainMeters: visible(897, '897 累计爬升'),
    date: visible('2026-05-02', '2026.05.02'),
    notes: ['Pace was under-marked in the previous ledger.'],
  },
  'zepp-trex3-632': {
    distanceKm: visible(11.58, '11.58'),
    durationSeconds: visible(19278, '05:21:18'),
    speedKmh: visible(2.16, '2.16'),
    elevationGainMeters: visible(886, '886'),
    caloriesKcal: visible(2810, '2810'),
    date: visible('2025-06-21', '2025年6月21日 11:24'),
  },
  'zepp-balance-633': {
    distanceKm: visible(30.5, '30.50'),
    durationSeconds: visible(35713, '09:55:13'),
    speedKmh: visible(3.08, '3.08'),
    elevationGainMeters: visible(1943, '1,943'),
    caloriesKcal: visible(4259, '4,259'),
    date: visible('03-22 07:04', '3月22日 07:04'),
    location: ambiguous('浦口区', '浦口区'),
    notes: ['Date is partial because the visible text does not show a year.'],
  },
  'zepp-trex3pro-634': {
    distanceKm: visible(57.59, '57.59'),
    durationSeconds: visible(121684, '33:48:04'),
    speedKmh: visible(1.7, '1.70'),
    elevationGainMeters: visible(4781, '4,781'),
    caloriesKcal: visible(9811, '9,811'),
    date: visible('09-29 14:34', '9月29日 14:34'),
    notes: ['Date is partial because the visible text does not show a year.'],
  },
  'suunto-635': {
    distanceKm: visible(19.33, '19.33 公里'),
    durationSeconds: visible(24174, "6:42'54"),
    elevationMeters: visible(289, '289 米'),
    elevationGainMeters: visible(1242, '1,242 米'),
    caloriesKcal: visible(1854, '1,854 千卡'),
    date: visible('2026-03-12', '12.03.2026'),
    location: visible('长沙市', '长沙市'),
  },
  'ovital-636': {
    distanceKm: visible(16, '16.0 公里'),
    durationSeconds: visible(11520, '3:12'),
    speedKmh: visible(5, '5.0 公里/小时'),
    elevationGainMeters: visible(998, '998 米'),
    location: visible('4号线六山一圈', '4号线六山一圈'),
  },
  'suunto-coros-637': {
    distanceKm: visible(156.56, '156.56'),
    durationSeconds: visible(70440, '19:34'),
    speedKmh: visible(3, '平均速度 3'),
    elevationGainMeters: visible(7963, '7963 米'),
    location: visible('2026蜀道山160K最终版', '2026蜀道山160K最终版'),
    notes: ['Current baseline MIMO picked a competing 8.0 km/h candidate; corrected truth keeps the main average-speed value.'],
  },
  'oppo-watch-638': {
    distanceKm: visible(12.17, '12.17'),
    durationSeconds: visible(16224, '4:30:24'),
    elevationGainMeters: visible(342, '342'),
    caloriesKcal: visible(1219, '1219'),
    date: visible('2024-06-01', '2024年6月1日 10:51'),
    location: ambiguous('钟山风景名胜区', '钟山风景名胜区'),
  },
  'apple-watch-639': {
    distanceKm: visible(26.38, '26.38 公里'),
    durationSeconds: visible(24379, '6:46:19'),
    paceMinPerKm: visible(15 + 24 / 60, '15\'24"/公里'),
    elevationGainMeters: visible(509, '509 米'),
    caloriesKcal: visible(1968, '1,968 大卡'),
    date: visible('06-01', '6月1日 周日'),
    location: visible('奥维耶多', '奥维耶多'),
    notes: ['Speed is derived from visible pace and therefore is not a primary visible speed field.'],
  },
  'xiaomi-640': {
    distanceKm: visible(27.45, '27.45 公里'),
    durationSeconds: visible(24538, '06:48:58'),
    speedKmh: visible(4, '4 km/h'),
    caloriesKcal: visible(1781, '1781 kcal'),
    date: visible('2024-02-24', '2024/2/24 09:04'),
    location: visible('重庆', '重庆'),
  },
  'xiaomi-taishan-641': {
    distanceKm: visible(7.85, '7.85 公里'),
    durationSeconds: visible(16730, '04:38:50'),
    speedKmh: visible(1.7, '1.7 km/h'),
    caloriesKcal: visible(1895, '1895 kcal'),
    date: visible('2025-06-14', '2025/6/14 07:00'),
    location: visible('泰山风景名胜区', '泰山风景名胜区'),
  },
  'huawei-642': {
    distanceKm: visible(20.53, '20.53 公里'),
    durationSeconds: visible(23096, '06:24:56'),
    elevationGainMeters: visible(991.1, '991.1米'),
    caloriesKcal: visible(3401, '3,401千卡'),
    date: visible('2025-09-24', '2025年9月24日 上午9:28'),
    notes: ['Speed-like values are treated as derived or competing unless a visible average-speed label supports them.'],
  },
  'huawei-shenzhen-643': {
    distanceKm: visible(23.56, '23.56 公里'),
    durationSeconds: visible(16728, '04:38:48'),
    elevationGainMeters: visible(2143.8, '2,143.8 米'),
    caloriesKcal: visible(2953, '2,953 千卡'),
    date: visible('2024-11-27', '2024年11月27日 09:39'),
    location: visible('深圳', '深圳'),
  },
  'strava-suzhou-644': {
    distanceKm: visible(9, '9.00 公里'),
    durationSeconds: visible(4133, '1:08:53'),
    speedKmh: visible(7.8, '7.8 km/h'),
    elevationGainMeters: visible(322, '322 米'),
    caloriesKcal: visible(936, '936'),
    date: visible('04-15 20:48', '4月15日 @ 下午8:48'),
    location: visible('苏州市', '苏州市 登山'),
    notes: ['Date is partial because the visible text does not show a year.'],
  },
  'strava-huangshan-645': {
    distanceKm: visible(11.56, '11.56 公里'),
    durationSeconds: visible(21493, '5:58:13'),
    paceMinPerKm: visible(30 + 59 / 60, '30:59 /公里'),
    elevationGainMeters: visible(1455, '1,455 米'),
    caloriesKcal: visible(1461, '1,461'),
    date: visible('05-29 07:26', '5月29日 @ 07:26'),
    location: visible('黄山市', '黄山市 徒步'),
    notes: ['Speed is derived from visible pace and therefore is not a primary visible speed field.'],
  },
  'yuedongquan-646': {
    distanceKm: visible(10.34, '10.34'),
    durationSeconds: visible(4167, '1:09:27'),
    speedKmh: visible(8.94, '8.94'),
    paceMinPerKm: visible(6 + 42 / 60, '6\'42"'),
    caloriesKcal: visible(535, '535.0'),
    date: visible('2026-01-10', '2026-01-10 16:36'),
    location: visible('杭州站', '杭州站'),
  },
  'codoon-647': {
    distanceKm: visible(13.03, '13.03'),
    durationSeconds: visible(13784, '03:49:44'),
    speedKmh: visible(3.4, '3.4'),
    elevationMeters: visible(781, '781'),
    elevationGainMeters: visible(1120, '1120'),
    caloriesKcal: visible(1762.5, '1762.5'),
    date: visible('10-17 09:35', '10月17日 09:35'),
    notes: ['Date is partial because the visible text does not show a year.'],
  },
  'keep-648': {
    distanceKm: visible(6.8, '6.80'),
    durationSeconds: visible(13349, '03:42:29'),
    elevationGainMeters: visible(342, '342'),
    caloriesKcal: visible(1237, '1237'),
  },
  'petal-maps-649': {
    distanceKm: visible(823.59, '823.59 km'),
    durationSeconds: visible(158802, '44:06:42'),
    speedKmh: visible(18.7, '18.7 km/h'),
    elevationGainMeters: visible(5523, '5523 m'),
    date: visible('2022-01-12', '2022-01-12'),
    location: ambiguous('海南 / 海口 / 儋州 / 三亚', '海口, 儋州, 三亚'),
    notes: ['Location is source-ambiguous: province-level truth and visible city labels are both useful evidence.'],
  },
  'foooooot-650': {
    distanceKm: visible(22.92, '22.92'),
    durationSeconds: visible(29367, '8:09:27'),
    speedKmh: visible(3.5, '3.5'),
    elevationMeters: visible(1022, '1022'),
    elevationGainMeters: visible(1560, '1560'),
    date: visible('2026-02-18', '2026.02.18'),
    location: visible('浙江 温州 乐清市', '浙江 温州 乐清市'),
  },
  'sigma-652': {
    distanceKm: visible(13.01, '13.01'),
    durationSeconds: visible(5649, '01:34:09'),
    paceMinPerKm: visible(7 + 14 / 60, '07\'14"'),
    caloriesKcal: visible(989, '989'),
    date: visible('2026-01-23', '2026-1-23'),
    notes: ['Speed is derived from visible pace and therefore is not a primary visible speed field.'],
  },
  'keep-watermark-653': {
    distanceKm: visible(10.3, '10.30'),
    durationSeconds: visible(3842, '01:04:02'),
    paceMinPerKm: visible(6 + 13 / 60, '06\'13"'),
    caloriesKcal: visible(736, '736'),
    notes: ['Speed is derived from visible pace and therefore is not a primary visible speed field.'],
  },
  'wechat-711': {
    distanceKm: visible(12.05, '12.05公里'),
    durationSeconds: visible(16382, '04:33:02 全程耗时'),
    speedKmh: visible(2.6, '2.6 全程均速(公里/小时)'),
    paceMinPerKm: visible(18 + 47 / 60, '18′47″ 平均配速'),
    elevationMeters: visible(373, '373 最高海拔(米)'),
    elevationGainMeters: visible(634, '634 累计爬升(米)'),
    date: visible('2026-05-31', '2026.05.31 13:14'),
    location: visible('龙眼洞森林公园 / 凤凰山', 'map labels near 龙眼洞森林公园 / 凤凰山'),
  },
  'wechat-712': {
    distanceKm: visible(10.32, '10.32 km 距离'),
    durationSeconds: visible(12859, '3:34:19 运动时间'),
    speedKmh: visible(2.9, '2.9 km/h 平均速度'),
    elevationGainMeters: visible(544, '544 m 累计上升'),
    caloriesKcal: visible(2453, '2453 kcal 卡路里'),
    date: visible('2026-05-02', '2026年5月2日 上午9:00'),
    location: visible('阳江市', '阳江市 登山'),
    notes: ['No Tencent fixture; kept as manual-review sample. Duration corrects previous 12259-second mismatch.'],
  },
}

function visible(value: number | string, raw: string) {
  return { value, raw, visibility: 'visible' as const }
}

function ambiguous(value: number | string, raw: string) {
  return { value, raw, visibility: 'ambiguous' as const }
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const modeFlag = argv.find((arg) => arg === '--dry-run' || arg === '--all' || arg === '--evidence-only')
  if (!modeFlag) {
    throw new Error('Usage: node --experimental-strip-types scripts/mimo-v25-text-generalization.ts --dry-run|--all|--evidence-only [--holdout-dir <abs path>]')
  }

  const holdoutIndex = argv.indexOf('--holdout-dir')
  const holdoutDir = holdoutIndex >= 0 ? argv[holdoutIndex + 1] : undefined
  if (holdoutIndex >= 0 && !holdoutDir) throw new Error('--holdout-dir requires an absolute directory path')

  return { mode: modeFlag.slice(2) as Mode, holdoutDir }
}

function apiKey() {
  const key = process.env.MIMO_API_KEY
  if (!key) throw new Error('MIMO_API_KEY is missing. Load it with --env-file=.env.local or export it in the shell.')
  return key
}

function candidate(field: string, overrides: Partial<EvidenceCandidate>): EvidenceCandidate {
  const sourceKind = SOURCE_KIND_VALUES.has(overrides.sourceKind ?? 'unknown') ? (overrides.sourceKind ?? 'unknown') : 'unknown'
  return {
    raw: null,
    labelRaw: null,
    unitRaw: null,
    bbox: null,
    sourceKind: sourceKind === 'unknown' && field !== 'location' ? 'metric_label' : sourceKind,
    visibility: 'visible',
    confidence: 0,
    reason: null,
    ...overrides,
  }
}

function blankTruthField(): TruthField {
  return { value: null, raw: null, visibility: 'not_visible', source: 'corrected-visible-ledger' }
}

function truthRecordForSample(sample: Sample): TruthRecord {
  const override = VISIBLE_TRUTH_OVERRIDES[sample.id]
  const fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, blankTruthField()])) as Record<FieldKey, TruthField>

  if (sample.isHoldout) {
    for (const key of FIELD_KEYS) {
      fields[key] = { value: null, raw: null, visibility: 'ambiguous', source: 'holdout-unscored' }
    }
    return { sampleId: sample.id, fields, notes: ['Holdout sample is included for manual review only unless a visible-truth row is added.'] }
  }

  for (const key of FIELD_KEYS) {
    const value = override?.[key]
    if (!value) continue
    fields[key] = {
      value: value.value,
      raw: value.raw,
      visibility: value.visibility,
      source: value.source ?? 'corrected-visible-ledger',
    }
  }

  return { sampleId: sample.id, fields, notes: override?.notes ?? [] }
}

function imageIdFromSourceFile(fileName: string) {
  return fileName.match(/_(\d+)(?:_\d+)?\.jpg$/u)?.[1] ?? fileName.match(/(\d+)/u)?.[1] ?? fileName
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
  const fixture = JSON.parse(await readFile(join(RAW_OCR_DIR, `${fixtureId}.json`), 'utf8')) as RecordedOcrFixture
  return (fixture.tencentOcrRaw.TextDetections ?? []).flatMap((item) => {
    const text = item.DetectedText?.trim()
    if (!text) return []
    return [{ text, confidence: Number(item.Confidence ?? 0), ...bounds(item.Polygon) }]
  })
}

async function buildSamples(holdoutDir?: string): Promise<Sample[]> {
  const fixtureSamples = await Promise.all(
    SCREENSHOT_OCR_FIXTURES.filter((fixture) => existsSync(join(IMAGE_DIR, fixture.sourceFileName))).map(async (fixture) => {
      const blocks = await readRecordedBlocks(fixture.id)
      return {
        id: fixture.id,
        imageId: imageIdFromSourceFile(fixture.sourceFileName),
        fileName: fixture.sourceFileName,
        imagePath: join(IMAGE_DIR, fixture.sourceFileName),
        appHintForReport: fixture.app,
        fixtureId: fixture.id,
        tencentBaseline: parseFieldsFromOcr(blocks),
        isHoldout: false,
      } satisfies Sample
    })
  )

  const manualSamples: Sample[] = [
    {
      id: 'wechat-711',
      imageId: '711',
      fileName: '微信图片_20260601143833_711_2.jpg',
      imagePath: join(IMAGE_DIR, '微信图片_20260601143833_711_2.jpg'),
      appHintForReport: '两步路',
      isHoldout: false,
    },
    {
      id: 'wechat-712',
      imageId: '712',
      fileName: '微信图片_20260601144052_712_2.jpg',
      imagePath: join(IMAGE_DIR, '微信图片_20260601144052_712_2.jpg'),
      appHintForReport: 'COROS',
      isHoldout: false,
    },
  ].filter((sample) => existsSync(sample.imagePath))

  const holdoutSamples: Sample[] = holdoutDir ? await buildHoldoutSamples(holdoutDir) : []
  return [...fixtureSamples, ...manualSamples, ...holdoutSamples].sort((a, b) => a.imageId.localeCompare(b.imageId, 'en', { numeric: true }))
}

async function buildHoldoutSamples(holdoutDir: string): Promise<Sample[]> {
  const absolute = resolve(holdoutDir)
  if (!absolute.startsWith('/')) throw new Error('--holdout-dir must resolve to an absolute path')
  const entries = await readdir(absolute)
  return entries
    .filter((name) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((fileName, index) => ({
      id: `holdout-${String(index + 1).padStart(2, '0')}`,
      imageId: `holdout-${String(index + 1).padStart(2, '0')}`,
      fileName,
      imagePath: join(absolute, fileName),
      appHintForReport: 'holdout',
      isHoldout: true,
    }))
}

function promptForImage(width: number, height: number) {
  return `You are a visual evidence extraction engine for hiking, trekking, running, cycling, and outdoor activity screenshots.

Return JSON only. Do not use Markdown.
Use the original image pixel coordinate system: x=0..${width}, y=0..${height}, origin at top-left.

Hard rules:
- No sample id, app/style hint, expected value, or prior knowledge is available. Read only the image.
- Extract visible evidence candidates. Do not calculate derived stats.
- Do not translate place names. Preserve the visible original text.
- Do not infer a missing year. If only month/day is visible, keep only the partial visible date.
- Do not collapse conflicting values into one. Return multiple candidates with reasons.
- Speed is km/h. Pace is min/km. They are separate fields.
- Elevation/highest altitude/current altitude is not cumulative gain/ascent/climb.
- Calories, heart rate, steps, cadence, training load, fastest speed, and fastest pace must not be used as another field.

Return this schema:
{
  "app": string | null,
  "imageType": "activity_summary" | "route_summary" | "watch_summary" | "map_route" | "unclear",
  "fields": {
    "distanceKm": [candidate],
    "durationSeconds": [candidate],
    "speedKmh": [candidate],
    "paceMinPerKm": [candidate],
    "elevationMeters": [candidate],
    "elevationGainMeters": [candidate],
    "caloriesKcal": [candidate],
    "date": [candidate],
    "location": [candidate]
  },
  "derivedOnly": [{"field": string, "value": string | number | null, "reason": string | null}],
  "notes": [string]
}

candidate:
{
  "raw": string | null,
  "labelRaw": string | null,
  "unitRaw": string | null,
  "bbox": {"x": number | null, "y": number | null, "width": number | null, "height": number | null} | null,
  "sourceKind": "activity_title" | "map_label" | "city_label" | "route_name" | "metric_label" | "unknown",
  "visibility": "visible" | "not_visible" | "ambiguous",
  "confidence": number,
  "reason": string | null
}

Field-specific guidance:
- distanceKm: visible distance/route length only. raw should be the visible value text, e.g. "10.32".
- durationSeconds: visible duration/time only. raw should remain visible time text, e.g. "3:34:19"; do not convert to seconds.
- speedKmh: visible average speed in km/h only. Exclude fastest/max/slowest speed unless it is the only clearly labeled average speed candidate and explain ambiguity.
- paceMinPerKm: visible average pace in min/km only. Exclude fastest pace.
- elevationMeters: highest/current altitude/elevation only.
- elevationGainMeters: cumulative ascent/gain/climb/up only.
- caloriesKcal: visible calories/kcal only.
- date: visible date/time text only. Preserve partial month/day if no year is visible.
- location: visible title, city, route name, or map label candidates. Preserve original text, do not translate.
`
}

function openAiPayload(dataUri: string, width: number, height: number, includeThinking: boolean) {
  return {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptForImage(width, height) },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 4200,
    ...(includeThinking ? { thinking: { type: 'disabled' } } : {}),
  }
}

function repairPayload(invalidText: string) {
  return {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Repair this model response into valid JSON matching the same schema. Return JSON only. Do not add or infer values.\n\n${invalidText.slice(0, 12000)}`,
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 4200,
  }
}

async function requestMimo(payload: unknown, key: string) {
  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  if (!response.ok) {
    const safeText = text.replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]')
    throw new Error(`MIMO request failed: HTTP ${response.status} ${safeText.slice(0, 400)}`)
  }
  return { status: response.status, body: JSON.parse(text) as Record<string, unknown> }
}

function messageText(body: Record<string, unknown>) {
  const choices = Array.isArray(body.choices) ? body.choices : []
  const first = choices[0] as { message?: { content?: unknown } } | undefined
  const content = first?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n')
  }
  return ''
}

function usageFromBody(body: Record<string, unknown>): MimoUsage {
  const usage = (body.usage ?? {}) as {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
  return {
    inputTokens: Number(usage.prompt_tokens ?? 0),
    cachedInputTokens: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
    raw: usage,
  }
}

function adoptedCost(usage: MimoUsage) {
  const cached = usage.cachedInputTokens
  const uncached = Math.max(0, usage.inputTokens - cached)
  return (
    (uncached / 1_000_000) * ADOPTED_PRICE_CNY_PER_MILLION.inputCacheMiss +
    (cached / 1_000_000) * ADOPTED_PRICE_CNY_PER_MILLION.inputCacheHit +
    (usage.outputTokens / 1_000_000) * ADOPTED_PRICE_CNY_PER_MILLION.output
  )
}

function parseJsonText(text: string): { ok: true; value: MimoTextPayload; path: string } | { ok: false; error: string } {
  const candidates = [
    { path: 'direct', text },
    { path: 'fenced', text: text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1] ?? '' },
    { path: 'braced', text: text.slice(Math.max(0, text.indexOf('{')), text.lastIndexOf('}') + 1) },
  ].filter((item) => item.text.trim())

  for (const candidateText of candidates) {
    try {
      return { ok: true, value: normalizePayload(JSON.parse(candidateText.text) as MimoTextPayload), path: candidateText.path }
    } catch {
      // Try next candidate.
    }
  }
  return { ok: false, error: 'Could not parse JSON from model response.' }
}

function normalizePayload(payload: MimoTextPayload): MimoTextPayload {
  const fields = {} as Partial<Record<FieldKey, EvidenceCandidate[]>>
  const rawFields = payload.fields ?? {}
  for (const key of FIELD_KEYS) {
    const rawValue = rawFields[key] ?? (payload as unknown as Partial<Record<FieldKey, EvidenceCandidate[]>>)[key]
    const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue as EvidenceCandidate] : []
    fields[key] = values.map((item) => normalizeCandidate(key, item))
  }
  return {
    app: typeof payload.app === 'string' ? payload.app : null,
    imageType: typeof payload.imageType === 'string' ? payload.imageType : null,
    fields,
    derivedOnly: Array.isArray(payload.derivedOnly) ? payload.derivedOnly : [],
    notes: Array.isArray(payload.notes) ? payload.notes.filter((note): note is string => typeof note === 'string') : [],
  }
}

function normalizeCandidate(key: FieldKey, value: EvidenceCandidate): EvidenceCandidate {
  return candidate(key, {
    raw: toNullableString(value?.raw),
    labelRaw: toNullableString(value?.labelRaw),
    unitRaw: toNullableString(value?.unitRaw),
    bbox: normalizeBBox(value?.bbox),
    sourceKind: SOURCE_KIND_VALUES.has(value?.sourceKind) ? value.sourceKind : key === 'location' ? 'unknown' : 'metric_label',
    visibility: value?.visibility === 'ambiguous' || value?.visibility === 'not_visible' ? value.visibility : 'visible',
    confidence: clampNumber(value?.confidence, 0, 1, 0),
    reason: toNullableString(value?.reason),
  })
}

function toNullableString(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function normalizeBBox(value: BBox | null | undefined): BBox | null {
  if (!value) return null
  return {
    x: finiteOrNull(value.x),
    y: finiteOrNull(value.y),
    width: finiteOrNull(value.width),
    height: finiteOrNull(value.height),
  }
}

function finiteOrNull(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(max, Math.max(min, numberValue))
}

async function extractWithMimo(sample: Sample, key: string): Promise<ResultRecord> {
  const metadata = await sharp(sample.imagePath).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  const started = performance.now()
  let imageReencoded = false
  let response: Awaited<ReturnType<typeof requestMimo>>
  let thinkingAccepted = true

  try {
    const sent = await sendVisionRequest(await imageDataUri(sample, false), width, height, key)
    response = sent.response
    thinkingAccepted = sent.thinkingAccepted
  } catch (error) {
    if (!(error instanceof Error) || !/Multimodal data is corrupted|cannot be processed|BadRequestError/i.test(error.message)) throw error
    imageReencoded = true
    const sent = await sendVisionRequest(await imageDataUri(sample, true), width, height, key)
    response = sent.response
    thinkingAccepted = sent.thinkingAccepted
  }

  const latencyMs = Math.round(performance.now() - started)
  const usage = usageFromBody(response.body)
  const text = messageText(response.body)
  let parsed = parseJsonText(text)
  let repairAttempts = 0
  let parsePath = parsed.ok ? parsed.path : 'failed'

  if (!parsed.ok) {
    repairAttempts = 1
    const repaired = await requestMimo(repairPayload(text), key)
    usage.inputTokens += usageFromBody(repaired.body).inputTokens
    usage.cachedInputTokens += usageFromBody(repaired.body).cachedInputTokens
    usage.outputTokens += usageFromBody(repaired.body).outputTokens
    usage.totalTokens += usageFromBody(repaired.body).totalTokens
    parsed = parseJsonText(messageText(repaired.body))
    parsePath = parsed.ok ? `repair:${parsed.path}` : 'failed'
  }

  const payload = parsed.ok ? parsed.value : null
  const adjudicated = adjudicatePayload(payload)
  return {
    schemaVersion: SCHEMA_VERSION,
    sample: {
      id: sample.id,
      imageId: sample.imageId,
      fileName: sample.fileName,
      imagePath: sample.imagePath,
      appHintForReport: sample.appHintForReport,
      fixtureId: sample.fixtureId,
      isHoldout: sample.isHoldout,
    },
    api: {
      endpoint: 'openai-compatible',
      model: MODEL,
      latencyMs,
      status: response.status,
      thinkingAccepted,
      repairAttempts,
      cacheHit: false,
      imageReencoded,
    },
    usage,
    pricing: { adoptedCny: adoptedCost(usage), adoptedRate: ADOPTED_PRICE_CNY_PER_MILLION },
    json: { parseable: Boolean(payload), parsePath },
    prompt: { noSampleHints: true, genericOnly: true },
    parsed: payload,
    adjudicated,
  }
}

async function imageDataUri(sample: Sample, reencode: boolean) {
  if (reencode) {
    const buffer = await sharp(sample.imagePath).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  }
  const base64 = await readFile(sample.imagePath, 'base64')
  const mime = extname(sample.fileName).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${base64}`
}

async function sendVisionRequest(dataUri: string, width: number, height: number, key: string) {
  try {
    return {
      response: await requestMimo(openAiPayload(dataUri, width, height, true), key),
      thinkingAccepted: true,
    }
  } catch (error) {
    if (!(error instanceof Error) || !/thinking|unsupported|invalid/i.test(error.message)) throw error
    return {
      response: await requestMimo(openAiPayload(dataUri, width, height, false), key),
      thinkingAccepted: false,
    }
  }
}

function adjudicatePayload(payload: MimoTextPayload | null): Record<FieldKey, AdjudicatedField> {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, adjudicateField(key, payload?.fields[key] ?? [])])) as Record<FieldKey, AdjudicatedField>
}

export function adjudicateField(key: FieldKey, candidates: EvidenceCandidate[]): AdjudicatedField {
  const normalized = candidates.map((item) => normalizeCandidate(key, item))
  const accepted: Array<{ candidate: EvidenceCandidate; value: number | string; hints: string[]; score: number }> = []
  const rejectedHints: string[] = []

  for (const item of normalized) {
    const result = parseCandidateValue(key, item)
    if (result.value === null) {
      if (result.hints.length) rejectedHints.push(...result.hints)
      continue
    }
    const sanity = sanityCheck(key, result.value)
    if (sanity) {
      rejectedHints.push(sanity)
      continue
    }
    accepted.push({
      candidate: item,
      value: result.value,
      hints: result.hints,
      score: item.confidence * 100 + labelScore(key, item) + visibilityScore(item),
    })
  }

  accepted.sort((a, b) => b.score - a.score)
  const best = accepted[0]
  const hints = [...new Set([...(best?.hints ?? []), ...rejectedHints])]
  if (!best) {
    return {
      value: null,
      raw: null,
      labelRaw: null,
      unitRaw: null,
      sourceKind: null,
      visibility: normalized.length ? 'ambiguous' : 'not_visible',
      confidence: 0,
      candidateCount: normalized.length,
      rejectedCount: normalized.length,
      hints: normalized.length ? [...hints, 'no accepted candidate'] : ['raw missing'],
      topCandidates: normalized.slice(0, 3),
    }
  }

  return {
    value: best.value,
    raw: best.candidate.raw,
    labelRaw: best.candidate.labelRaw,
    unitRaw: best.candidate.unitRaw,
    sourceKind: best.candidate.sourceKind,
    visibility: best.candidate.visibility,
    confidence: Math.min(1, Math.max(0, best.score / 140)),
    candidateCount: normalized.length,
    rejectedCount: normalized.length - accepted.length,
    hints: consistencyHints().concat(hints),
    topCandidates: normalized.slice(0, 3),
  }
}

function labelScore(key: FieldKey, item: EvidenceCandidate) {
  const context = candidateContext(item)
  if (key === 'speedKmh' && /平均|均速|avg|average/i.test(context)) return 25
  if (key === 'paceMinPerKm' && /平均配速|配速|pace/i.test(context)) return 25
  if (key === 'elevationGainMeters' && /累计|累积|爬升|上升|gain|ascent|climb/i.test(context)) return 28
  if (key === 'elevationMeters' && /最高海拔|最高点|海拔|altitude|elevation/i.test(context)) return 22
  if (key === 'caloriesKcal' && /卡路里|千卡|大卡|kcal|cal/i.test(context)) return 22
  if (key === 'location' && item.sourceKind !== 'unknown') return 18
  return 0
}

function visibilityScore(item: EvidenceCandidate) {
  if (item.visibility === 'visible') return 15
  if (item.visibility === 'ambiguous') return -20
  return -50
}

function candidateContext(item: EvidenceCandidate) {
  return `${item.labelRaw ?? ''} ${item.unitRaw ?? ''} ${item.raw ?? ''} ${item.reason ?? ''}`
}

function parseCandidateValue(key: FieldKey, item: EvidenceCandidate): { value: number | string | null; hints: string[] } {
  const raw = item.raw?.trim() ?? ''
  const context = candidateContext(item)
  if (!raw) return { value: null, hints: ['raw missing'] }
  if (item.visibility === 'not_visible') return { value: null, hints: ['candidate marked not_visible'] }

  if (key === 'distanceKm') return { value: parseDistanceKm(raw, context), hints: [] }
  if (key === 'durationSeconds') return parseDurationCandidate(raw, context)
  if (key === 'speedKmh') return parseSpeedCandidate(raw, context)
  if (key === 'paceMinPerKm') return parsePaceCandidate(raw, context)
  if (key === 'elevationMeters') return parseElevationCandidate(raw, context, 'altitude')
  if (key === 'elevationGainMeters') return parseElevationCandidate(raw, context, 'gain')
  if (key === 'caloriesKcal') return { value: parseNumber(raw), hints: [] }
  if (key === 'date') return parseDateCandidate(raw)
  return parseLocationCandidate(raw, item)
}

function parseDistanceKm(raw: string, context: string) {
  const value = parseNumber(raw)
  if (value === null) return null
  if (/米|meter|metre/i.test(context) && !/千米|公里|km/i.test(context)) return value / 1000
  return value
}

function parseSpeedCandidate(raw: string, context: string): { value: number | null; hints: string[] } {
  const hints: string[] = []
  if (/最快|最快速度|最大速度|最高速度|slowest|fastest|max/i.test(context)) hints.push('candidate conflict: fastest/max speed')
  if (/配速|\/\s*(?:公里|km)|min\/km|pace/i.test(context) && !/km\/h|公里\/小时|公里\/时/i.test(context)) {
    return { value: null, hints: ['derived only: pace is not speed'] }
  }
  const value = parseNumber(raw)
  return { value, hints }
}

function parsePaceCandidate(raw: string, context: string): { value: number | null; hints: string[] } {
  if (/km\/h|公里\/小时|公里\/时/i.test(context) && !/配速|pace/i.test(context)) return { value: null, hints: ['derived only: speed is not pace'] }
  if (/最快配速|fastest pace/i.test(context)) return { value: null, hints: ['candidate conflict: fastest pace'] }
  return { value: parsePaceMinutes(raw), hints: [] }
}

function parseElevationCandidate(raw: string, context: string, kind: 'altitude' | 'gain'): { value: number | null; hints: string[] } {
  if (kind === 'altitude' && /累计|累积|爬升|上升|下降|gain|ascent|climb/i.test(context)) {
    return { value: null, hints: ['candidate conflict: gain label is not elevation'] }
  }
  if (kind === 'gain' && /最高海拔|最低海拔|最高点|最低点|altitude/i.test(context) && !/累计|累积|爬升|上升|gain|ascent|climb/i.test(context)) {
    return { value: null, hints: ['candidate conflict: elevation label is not gain'] }
  }
  return { value: parseNumber(raw), hints: [] }
}

function parseLocationCandidate(raw: string, item: EvidenceCandidate): { value: string | null; hints: string[] } {
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  const hints: string[] = []
  if (!cleaned) return { value: null, hints: ['raw missing'] }
  if (/^[A-Za-z\s,.-]+$/u.test(cleaned) && /[\u4e00-\u9fa5]/u.test(item.reason ?? '')) hints.push('source ambiguous: possible translation')
  if (item.sourceKind === 'unknown') hints.push('source ambiguous')
  return { value: cleaned, hints }
}

export function parseDurationCandidate(raw: string, context = ''): { value: number | null; hints: string[] } {
  const normalized = raw.trim()
  const chinese = normalized.match(/(?:(\d+(?:\.\d+)?)\s*(?:小时|时|h))?\s*(?:(\d+(?:\.\d+)?)\s*(?:分钟|分|m|min))?\s*(?:(\d+(?:\.\d+)?)\s*(?:秒|s))?/iu)
  if (chinese?.[0]?.trim() && (chinese[1] || chinese[2] || chinese[3])) {
    const hours = Number(chinese[1] ?? 0)
    const minutes = Number(chinese[2] ?? 0)
    const seconds = Number(chinese[3] ?? 0)
    return { value: Math.round(hours * 3600 + minutes * 60 + seconds), hints: [] }
  }

  const suunto = normalized.match(/^(\d{1,3}):(\d{2})['′](\d{2})$/u)
  if (suunto) return { value: Number(suunto[1]) * 3600 + Number(suunto[2]) * 60 + Number(suunto[3]), hints: [] }

  const token = normalized.match(/\d{1,3}:\d{2}(?::\d{2}(?:\.\d+)?)?/)?.[0]
  if (!token) return { value: null, hints: ['raw missing'] }
  const parts = token.split(':').map(Number)
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return { value: Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]), hints: [] }
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    const first = parts[0]
    const second = parts[1]
    const hourContext = /耗时|用时|时长|时间|全程耗时|总时长|总时间|总用时|elapsed|moving time/i.test(context)
    if (first >= 24) return { value: first * 60 + second, hints: [] }
    return { value: first * 3600 + second * 60, hints: hourContext ? [] : ['partial duration: interpreted as hours:minutes'] }
  }
  return { value: null, hints: ['raw missing'] }
}

export function parseDateCandidate(raw: string): { value: string | null; hints: string[] } {
  const text = raw.trim()
  const ymd = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/u) ?? text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/u)
  if (ymd) return { value: `${ymd[1]}-${pad2(ymd[2])}-${pad2(ymd[3])}`, hints: [] }

  const dmy = text.match(/(\d{1,2})[.](\d{1,2})[.](20\d{2})/u)
  if (dmy) return { value: `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`, hints: [] }

  const md = text.match(/(\d{1,2})月\s*(\d{1,2})日(?:\s*(?:@)?\s*(?:上午|下午)?\s*(\d{1,2})[:：](\d{2}))?/u)
  if (md) {
    const hour = md[3] ? normalizeHour(text, Number(md[3])) : null
    const minute = md[4] ? pad2(md[4]) : null
    return { value: `${pad2(md[1])}-${pad2(md[2])}${hour !== null && minute ? ` ${pad2(hour)}:${minute}` : ''}`, hints: ['partial date'] }
  }

  return { value: null, hints: ['raw missing'] }
}

function normalizeHour(text: string, hour: number) {
  if (/下午/u.test(text) && hour < 12) return hour + 12
  if (/上午/u.test(text) && hour === 12) return 0
  return hour
}

function pad2(value: string | number) {
  return String(value).padStart(2, '0')
}

function parsePaceMinutes(raw: string) {
  const text = raw.trim()
  const quote = text.match(/(\d{1,2})\s*['′:]\s*(\d{2})/u)
  if (quote) return Number(quote[1]) + Number(quote[2]) / 60
  const decimal = parseNumber(text)
  return decimal
}

function parseNumber(raw: string) {
  const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/u)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

function sanityCheck(key: FieldKey, value: number | string): string | null {
  if (typeof value !== 'number') return null
  if (key === 'distanceKm' && !inRange(value, FIELD_VALIDATION.distance.min, FIELD_VALIDATION.distance.max)) return 'sanity rejected: distance out of range'
  if (key === 'durationSeconds' && !inRange(value, FIELD_VALIDATION.duration.min, FIELD_VALIDATION.duration.max)) return 'sanity rejected: duration out of range'
  if (key === 'speedKmh' && !inRange(value, FIELD_VALIDATION.speed.min, FIELD_VALIDATION.speed.max)) return 'sanity rejected: speed out of range'
  if (key === 'paceMinPerKm' && !inRange(value, FIELD_VALIDATION.pace.min, FIELD_VALIDATION.pace.max)) return 'sanity rejected: pace out of range'
  if (key === 'elevationMeters' && !inRange(value, FIELD_VALIDATION.altitude.min, FIELD_VALIDATION.altitude.max)) return 'sanity rejected: elevation out of range'
  if (key === 'elevationGainMeters' && !inRange(value, FIELD_VALIDATION.elevation_gain.min, FIELD_VALIDATION.elevation_gain.max)) return 'sanity rejected: gain out of range'
  if (key === 'caloriesKcal' && !inRange(value, 0, 50_000)) return 'sanity rejected: calories out of range'
  return null
}

function inRange(value: number, min: number, max: number) {
  return value >= min && value <= max
}

function consistencyHints(): string[] {
  return []
}

function applyCrossFieldConsistency(fields: Record<FieldKey, AdjudicatedField>) {
  const distance = numberValue(fields.distanceKm.value)
  const duration = numberValue(fields.durationSeconds.value)
  const speed = numberValue(fields.speedKmh.value)
  if (!distance || !duration || !speed) return
  const expected = distance / (duration / 3600)
  if (Math.abs(expected - speed) > Math.max(0.4, expected * 0.12)) {
    fields.speedKmh.hints.push(`candidate conflict: speed ${speed.toFixed(2)} differs from distance/duration ${expected.toFixed(2)}`)
    fields.speedKmh.confidence = Math.min(fields.speedKmh.confidence, 0.45)
  }
}

function numberValue(value: number | string | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function compareField(field: FieldKey, actual: AdjudicatedField, truth: TruthField): { status: FieldStatus; note: string } {
  if (truth.visibility === 'ambiguous') return { status: 'not_scored', note: 'truth_ambiguous' }
  if (truth.visibility === 'not_visible') {
    return actual.value === null ? { status: 'missing', note: 'truth_not_visible' } : { status: 'false_positive', note: 'field_not_visible_in_truth' }
  }
  if (actual.value === null) return { status: 'missing', note: 'visible_truth_missing_in_engine' }
  if (field === 'date') return dateMatches(String(actual.value), String(truth.value)) ? { status: 'match', note: 'within_tolerance' } : { status: 'mismatch', note: 'date_mismatch' }
  if (field === 'location') return locationMatches(String(actual.value), String(truth.value), actual.raw) ? { status: 'match', note: 'within_tolerance' } : { status: 'mismatch', note: 'location_mismatch' }
  const tolerance = NUMERIC_TOLERANCE[field as NumericFieldKey]
  return Math.abs(Number(actual.value) - Number(truth.value)) <= tolerance ? { status: 'match', note: 'within_tolerance' } : { status: 'mismatch', note: 'outside_tolerance' }
}

function dateMatches(actual: string, truth: string) {
  return normalizeDateText(actual).includes(normalizeDateText(truth)) || normalizeDateText(truth).includes(normalizeDateText(actual))
}

function normalizeDateText(value: string) {
  return value.replace(/[^\d]/g, '')
}

function locationMatches(actual: string, truth: string, raw: string | null) {
  const normalizedActual = normalizeLocation(raw ?? actual)
  const normalizedTruth = normalizeLocation(truth)
  if (!normalizedTruth || !normalizedActual) return false
  return normalizedActual.includes(normalizedTruth) || normalizedTruth.includes(normalizedActual)
}

function normalizeLocation(value: string) {
  return value.replace(/\s+/g, '').replace(/[·,，/／-]/g, '').replace(/市|省|中国|China/gi, '').toLowerCase()
}

function tencentFieldValue(field: FieldKey, baseline?: ParsedScreenshotFields | null): { value: number | string | null; raw: string | null } | null {
  if (!baseline) return null
  const mapped =
    field === 'distanceKm'
      ? baseline.distance
      : field === 'durationSeconds'
        ? baseline.duration
        : field === 'speedKmh'
          ? baseline.speed
          : field === 'paceMinPerKm'
            ? baseline.paceMinPerKm
            : field === 'elevationMeters'
              ? baseline.elevation
              : field === 'elevationGainMeters'
                ? baseline.elevationGain
                : field === 'caloriesKcal'
                  ? baseline.calories
                  : field === 'date'
                    ? baseline.date
                    : baseline.location
  if (!mapped) return { value: null, raw: null }
  return { value: mapped.value, raw: mapped.raw }
}

function compareTencent(field: FieldKey, value: { value: number | string | null; raw: string | null } | null, truth: TruthField): { status: FieldStatus | 'n/a'; note: string } {
  if (value === null) return { status: 'n/a', note: 'no_tencent_fixture' }
  const pseudo: AdjudicatedField = {
    value: value.value,
    raw: value.raw,
    labelRaw: null,
    unitRaw: null,
    sourceKind: null,
    visibility: value.value === null ? 'not_visible' : 'visible',
    confidence: value.value === null ? 0 : 1,
    candidateCount: value.value === null ? 0 : 1,
    rejectedCount: 0,
    hints: [],
    topCandidates: [],
  }
  return compareField(field, pseudo, truth)
}

function winnerFor(mimo: FieldStatus, tencent: FieldStatus | 'n/a', truth: TruthField): Winner {
  if (truth.visibility !== 'visible') return 'not_scored'
  const mimoCorrect = mimo === 'match'
  const tencentCorrect = tencent === 'match'
  if (mimoCorrect && tencentCorrect) return 'both_correct'
  if (mimoCorrect && !tencentCorrect) return 'mimo_only'
  if (!mimoCorrect && tencentCorrect) return 'tencent_only'
  if (!mimoCorrect && !tencentCorrect) return tencent === 'n/a' || tencent === 'missing' ? 'both_missing' : 'both_wrong'
  return 'not_scored'
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function writeCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))].join('\n') + '\n'
}

async function loadResult(sample: Sample): Promise<ResultRecord | null> {
  const path = join(RESULT_DIR, `${sample.id}.json`)
  if (!existsSync(path)) return null
  try {
    const record = JSON.parse(await readFile(path, 'utf8')) as ResultRecord
    if (record.schemaVersion !== SCHEMA_VERSION || record.sample.id !== sample.id || !record.parsed) return null
    record.adjudicated = adjudicatePayload(record.parsed)
    record.api.cacheHit = true
    return record
  } catch {
    return null
  }
}

async function saveResult(record: ResultRecord) {
  await mkdir(RESULT_DIR, { recursive: true })
  await writeFile(join(RESULT_DIR, `${record.sample.id}.json`), `${JSON.stringify(record, null, 2)}\n`)
}

async function ensureDirs() {
  await mkdir(RESULT_DIR, { recursive: true })
  await mkdir(CARD_DIR, { recursive: true })
}

async function runDryRun(samples: Sample[]) {
  const existing = (await Promise.all(samples.map(loadResult))).filter(Boolean).length
  const missing = samples.length - existing
  console.log(`mimo-text-v2 dry-run`)
  console.log(`samples=${samples.length}`)
  console.log(`existingCurrentSchemaResults=${existing}`)
  console.log(`expectedFreshCalls=${missing}`)
  console.log(`outputDir=${OUTPUT_DIR}`)
  console.log(`resultsDir=${RESULT_DIR}`)
  console.log(`evidenceCardDir=${CARD_DIR}`)
  console.log(`baselineComparison=${join(BASELINE_DIR, 'text-comparison.csv')}`)
}

async function runAll(samples: Sample[]) {
  await ensureDirs()
  const missing = []
  for (const sample of samples) {
    if (!(await loadResult(sample))) missing.push(sample)
  }
  const key = missing.length ? apiKey() : ''
  const records: ResultRecord[] = []
  for (const sample of samples) {
    const cached = await loadResult(sample)
    if (cached) {
      records.push(cached)
      console.log(`[cache] ${sample.id}`)
      continue
    }
    console.log(`[mimo] ${sample.id}`)
    const record = await extractWithMimo(sample, key)
    applyCrossFieldConsistency(record.adjudicated)
    await saveResult(record)
    records.push(record)
  }
  await writeOutputs(samples, records)
}

async function runEvidenceOnly(samples: Sample[]) {
  await ensureDirs()
  const records: ResultRecord[] = []
  const missing: string[] = []
  for (const sample of samples) {
    const record = await loadResult(sample)
    if (!record) missing.push(sample.id)
    else records.push(record)
  }
  if (missing.length) throw new Error(`Missing cached no-hint results for evidence-only mode: ${missing.join(', ')}`)
  for (const record of records) applyCrossFieldConsistency(record.adjudicated)
  await writeOutputs(samples, records)
}

async function writeOutputs(samples: Sample[], records: ResultRecord[]) {
  const truthRecords = Object.fromEntries(samples.map((sample) => [sample.id, truthRecordForSample(sample)]))
  const recordById = Object.fromEntries(records.map((record) => [record.sample.id, record]))
  const cardPaths = new Map<string, string>()
  const comparisonRows: ComparisonRow[] = []
  const candidateRows: Array<Record<string, unknown>> = []

  await writeFile(
    join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify(
      samples.map((sample) => ({
        id: sample.id,
        imageId: sample.imageId,
        fileName: sample.fileName,
        imagePath: sample.imagePath,
        fixtureId: sample.fixtureId ?? null,
        tencentBaseline: sample.fixtureId ? 'available' : 'N/A',
        holdout: sample.isHoldout,
      })),
      null,
      2
    )}\n`
  )
  await writeFile(join(OUTPUT_DIR, 'visible-ground-truth.json'), `${JSON.stringify(truthRecords, null, 2)}\n`)

  for (const sample of samples) {
    const record = recordById[sample.id]
    const truth = truthRecords[sample.id]
    if (!record || !truth) continue
    const cardPath = join(CARD_DIR, `${sample.id}-card.png`)
    await writeEvidenceCard(sample, record, truth, cardPath)
    cardPaths.set(sample.id, cardPath)

    for (const field of FIELD_KEYS) {
      const mimo = record.adjudicated[field]
      const truthField = truth.fields[field]
      const tencent = tencentFieldValue(field, sample.tencentBaseline)
      const mimoCompare = compareField(field, mimo, truthField)
      const tencentCompare = compareTencent(field, tencent, truthField)
      comparisonRows.push({
        sampleId: sample.id,
        field,
        truthVisibility: truthField.visibility,
        truthValue: stringifyFieldValue(truthField.value),
        truthRaw: truthField.raw ?? '',
        mimoValue: stringifyFieldValue(mimo.value),
        mimoRaw: mimo.raw ?? '',
        mimoLabelRaw: mimo.labelRaw ?? '',
        mimoUnitRaw: mimo.unitRaw ?? '',
        mimoSourceKind: mimo.sourceKind ?? '',
        mimoStatus: mimoCompare.status,
        tencentValue: stringifyFieldValue(tencent?.value ?? null),
        tencentRaw: tencent?.raw ?? '',
        tencentStatus: tencentCompare.status,
        winner: winnerFor(mimoCompare.status, tencentCompare.status, truthField),
        hints: [...mimo.hints, mimoCompare.note, tencentCompare.note].filter(Boolean).join(' | '),
        evidenceCardPath: cardPath,
      })

      for (const [index, candidateValue] of mimo.topCandidates.entries()) {
        candidateRows.push({
          sampleId: sample.id,
          field,
          rank: index + 1,
          raw: candidateValue.raw ?? '',
          labelRaw: candidateValue.labelRaw ?? '',
          unitRaw: candidateValue.unitRaw ?? '',
          sourceKind: candidateValue.sourceKind,
          visibility: candidateValue.visibility,
          confidence: candidateValue.confidence,
          reason: candidateValue.reason ?? '',
          bbox: candidateValue.bbox ? JSON.stringify(candidateValue.bbox) : '',
          finalValue: stringifyFieldValue(mimo.value),
          hints: mimo.hints.join(' | '),
        })
      }
    }
  }

  await writeFile(
    join(OUTPUT_DIR, 'text-comparison.csv'),
    writeCsv(comparisonRows, [
      'sampleId',
      'field',
      'truthVisibility',
      'truthValue',
      'truthRaw',
      'mimoValue',
      'mimoRaw',
      'mimoLabelRaw',
      'mimoUnitRaw',
      'mimoSourceKind',
      'mimoStatus',
      'tencentValue',
      'tencentRaw',
      'tencentStatus',
      'winner',
      'hints',
      'evidenceCardPath',
    ])
  )

  await writeFile(join(OUTPUT_DIR, 'field-accuracy-summary.csv'), writeCsv(fieldAccuracySummary(comparisonRows), FIELD_SUMMARY_COLUMNS))
  await writeFile(join(OUTPUT_DIR, 'candidate-audit.csv'), writeCsv(candidateRows, CANDIDATE_AUDIT_COLUMNS))
  await writeIndex(samples, records, comparisonRows, cardPaths)
  await writeReport(samples, records, comparisonRows, cardPaths)
}

const FIELD_SUMMARY_COLUMNS = [
  'field',
  'visibleTruthRows',
  'ambiguousRows',
  'mimoMatch',
  'mimoMismatch',
  'mimoMissing',
  'mimoFalsePositive',
  'tencentMatch',
  'tencentMismatch',
  'tencentMissing',
  'mimoOnly',
  'tencentOnly',
  'bothCorrect',
  'bothWrong',
  'bothMissing',
]

const CANDIDATE_AUDIT_COLUMNS = [
  'sampleId',
  'field',
  'rank',
  'raw',
  'labelRaw',
  'unitRaw',
  'sourceKind',
  'visibility',
  'confidence',
  'reason',
  'bbox',
  'finalValue',
  'hints',
]

function fieldAccuracySummary(rows: ComparisonRow[]) {
  return FIELD_KEYS.map((field) => {
    const fieldRows = rows.filter((row) => row.field === field)
    return {
      field,
      visibleTruthRows: count(fieldRows, (row) => row.truthVisibility === 'visible'),
      ambiguousRows: count(fieldRows, (row) => row.truthVisibility === 'ambiguous'),
      mimoMatch: count(fieldRows, (row) => row.mimoStatus === 'match'),
      mimoMismatch: count(fieldRows, (row) => row.mimoStatus === 'mismatch'),
      mimoMissing: count(fieldRows, (row) => row.mimoStatus === 'missing'),
      mimoFalsePositive: count(fieldRows, (row) => row.mimoStatus === 'false_positive'),
      tencentMatch: count(fieldRows, (row) => row.tencentStatus === 'match'),
      tencentMismatch: count(fieldRows, (row) => row.tencentStatus === 'mismatch'),
      tencentMissing: count(fieldRows, (row) => row.tencentStatus === 'missing'),
      mimoOnly: count(fieldRows, (row) => row.winner === 'mimo_only'),
      tencentOnly: count(fieldRows, (row) => row.winner === 'tencent_only'),
      bothCorrect: count(fieldRows, (row) => row.winner === 'both_correct'),
      bothWrong: count(fieldRows, (row) => row.winner === 'both_wrong'),
      bothMissing: count(fieldRows, (row) => row.winner === 'both_missing'),
    }
  })
}

function count<T>(items: T[], predicate: (item: T) => boolean) {
  return items.filter(predicate).length
}

function stringifyFieldValue(value: number | string | null) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/u, '').replace(/\.$/u, '')
  return value ?? ''
}

async function writeEvidenceCard(sample: Sample, record: ResultRecord, truth: TruthRecord, outputPath: string) {
  const maxImageWidth = 620
  const imageMeta = await sharp(sample.imagePath).metadata()
  const originalWidth = imageMeta.width ?? maxImageWidth
  const originalHeight = imageMeta.height ?? maxImageWidth
  const scale = Math.min(1, maxImageWidth / originalWidth)
  const imageWidth = Math.round(originalWidth * scale)
  const imageHeight = Math.round(originalHeight * scale)
  const cardWidth = 760
  const rowHeight = 106
  const headerHeight = 128
  const cardHeight = headerHeight + FIELD_KEYS.length * rowHeight + 90
  const outputWidth = imageWidth + cardWidth
  const outputHeight = Math.max(imageHeight, cardHeight)
  const left = await sharp(sample.imagePath).resize({ width: imageWidth }).png().toBuffer()
  const right = Buffer.from(cardSvg(sample, record, truth, sample.tencentBaseline ?? null, cardWidth, outputHeight, rowHeight, headerHeight))

  await sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: '#f8faf7',
    },
  })
    .composite([
      { input: left, top: 0, left: 0 },
      { input: right, top: 0, left: imageWidth },
    ])
    .png()
    .toFile(outputPath)
}

function cardSvg(
  sample: Sample,
  record: ResultRecord,
  truth: TruthRecord,
  tencentBaseline: ParsedScreenshotFields | null,
  width: number,
  height: number,
  rowHeight: number,
  headerHeight: number
) {
  const rows = FIELD_KEYS.map((field, index) =>
    cardRowSvg(field, record, truth, tencentBaseline, 24, headerHeight + index * rowHeight, width - 48, rowHeight)
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#f8faf7"/>
  <text x="24" y="34" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#17201a">mimo text v2 evidence</text>
  <text x="24" y="64" font-family="Arial, sans-serif" font-size="15" fill="#536156">${escapeXml(sample.id)} · ${escapeXml(sample.fileName)}</text>
  <text x="24" y="88" font-family="Arial, sans-serif" font-size="14" fill="#536156">No app/style/sample hints in prompt · Tencent fixture: ${sample.fixtureId ? 'available' : 'N/A'}</text>
  <text x="24" y="112" font-family="Arial, sans-serif" font-size="14" fill="#536156">User eye review is authoritative. Auto hints are navigation only.</text>
  ${rows.join('\n')}
  </svg>`
}

function cardRowSvg(
  field: FieldKey,
  record: ResultRecord,
  truth: TruthRecord,
  tencentBaseline: ParsedScreenshotFields | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const value = record.adjudicated[field]
  const truthField = truth.fields[field]
  const tencent = tencentFieldValue(field, tencentBaseline)
  const hints = value.hints.slice(0, 3).join(' | ')
  return `<g>
    <rect x="${x}" y="${y + 8}" width="${width}" height="${height - 14}" rx="8" fill="#ffffff" stroke="#d8ded7"/>
    <text x="${x + 14}" y="${y + 34}" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#1f2a22">${FIELD_LABELS[field]}</text>
    <text x="${x + 180}" y="${y + 30}" font-family="Arial, sans-serif" font-size="14" fill="#334139">mimo: ${escapeXml(formatCardValue(value.value))}</text>
    <text x="${x + 180}" y="${y + 52}" font-family="Arial, sans-serif" font-size="13" fill="#5c6b60">raw: ${escapeXml(truncate(value.raw ?? '', 72))}</text>
    <text x="${x + 180}" y="${y + 74}" font-family="Arial, sans-serif" font-size="13" fill="#5c6b60">label/unit/source: ${escapeXml(truncate([value.labelRaw, value.unitRaw, value.sourceKind].filter(Boolean).join(' / '), 72))}</text>
    <text x="${x + 14}" y="${y + 58}" font-family="Arial, sans-serif" font-size="12" fill="#6f796f">truth: ${escapeXml(truthField.visibility)} ${escapeXml(formatCardValue(truthField.value))}</text>
    <text x="${x + 14}" y="${y + 78}" font-family="Arial, sans-serif" font-size="12" fill="#6f796f">tx: ${escapeXml(formatCardValue(tencent?.value ?? null))}</text>
    <text x="${x + 14}" y="${y + 96}" font-family="Arial, sans-serif" font-size="12" fill="#9a6b16">${escapeXml(truncate(hints, 88))}</text>
  </g>`
}

function formatCardValue(value: number | string | null) {
  return stringifyFieldValue(value) || '—'
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function writeIndex(samples: Sample[], records: ResultRecord[], rows: ComparisonRow[], cardPaths: Map<string, string>) {
  const lines = [
    '# mimo-v2.5 Text v2 Acceptance Index',
    '',
    'Human eye review is authoritative. Automatic hints only help navigation.',
    '',
    '## Root Files',
    `- Report: \`${join(OUTPUT_DIR, 'report.md')}\``,
    `- Text comparison: \`${join(OUTPUT_DIR, 'text-comparison.csv')}\``,
    `- Field summary: \`${join(OUTPUT_DIR, 'field-accuracy-summary.csv')}\``,
    `- Candidate audit: \`${join(OUTPUT_DIR, 'candidate-audit.csv')}\``,
    `- Visible truth ledger: \`${join(OUTPUT_DIR, 'visible-ground-truth.json')}\``,
    '',
    '## Evidence Cards',
  ]

  for (const sample of samples) {
    const sampleRows = rows.filter((row) => row.sampleId === sample.id && row.truthVisibility === 'visible')
    const mismatches = sampleRows.filter((row) => row.mimoStatus !== 'match').length
    const status = sample.isHoldout ? 'holdout manual review' : mismatches ? `${mismatches} auto-review item(s)` : 'auto hints quiet'
    lines.push(`- ${sample.id}: ${status}`)
    lines.push(`  - card: \`${cardPaths.get(sample.id) ?? ''}\``)
    lines.push(`  - result: \`${join(RESULT_DIR, `${sample.id}.json`)}\``)
  }

  await writeFile(join(OUTPUT_DIR, 'index.md'), `${lines.join('\n')}\n`)

  void records
}

async function writeReport(samples: Sample[], records: ResultRecord[], rows: ComparisonRow[], cardPaths: Map<string, string>) {
  const summary = fieldAccuracySummary(rows)
  const totalCost = records.reduce((sum, record) => sum + (record.pricing?.adoptedCny ?? 0), 0)
  const freshCalls = records.filter((record) => !record.api.cacheHit).length
  const cachedRecords = records.length - freshCalls
  const parseable = records.filter((record) => record.json.parseable).length
  const repairAttempts = records.reduce((sum, record) => sum + record.api.repairAttempts, 0)
  const reencodedInputs = records.filter((record) => record.api.imageReencoded).length
  const latencyValues = records.filter((record) => !record.api.cacheHit).map((record) => record.api.latencyMs)
  const storedLatencyValues = records.map((record) => record.api.latencyMs).filter((value) => value > 0)
  const avgLatency = latencyValues.length ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : 0
  const avgStoredLatency = storedLatencyValues.length
    ? Math.round(storedLatencyValues.reduce((sum, value) => sum + value, 0) / storedLatencyValues.length)
    : 0

  const lines = [
    '# mimo-v2.5 Text Generalization v2 Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Scope',
    '- Research-only: no production recognize route, Tencent adapter, parser behavior, schema, migration, or UI was modified.',
    '- Prompt is no-hint: no sample id, app/style hint, notes, or expected values are sent to mimo.',
    '- Mimo is treated as a visual evidence extractor; deterministic code adjudicates final fields.',
    '- This is a no-hint rejudge on the existing 26 screenshots unless holdout rows are present.',
    '',
    '## B13',
    '- Previous `--all` result used per-sample hints and under-marked visible truth for pace, calories, partial dates, and location variants.',
    '- The corrected visible-truth ledger is still a benchmark artifact and must be eye-reviewed against the evidence cards.',
    '- Date values without visible year are preserved as partial dates and should not be scored as inferred full-year dates.',
    '- Speed/pace and elevation/gain are adjudicated separately; derived conversions are not promoted into primary fields.',
    '',
    '## Reliability / Cost',
    `- Samples: ${samples.length}`,
    `- Stored current-schema no-hint records: ${records.length}`,
    `- Fresh MIMO calls in final invocation: ${freshCalls}`,
    `- Cached records reused in final invocation: ${cachedRecords}`,
    `- JSON parseable records: ${parseable}/${records.length}`,
    `- Repair attempts: ${repairAttempts}`,
    `- Re-encoded image retries recorded: ${reencodedInputs}`,
    `- Average fresh-call latency: ${avgLatency} ms`,
    `- Average stored API latency: ${avgStoredLatency} ms`,
    `- Adopted cost for stored records: ¥${totalCost.toFixed(6)}`,
    '',
    '## Field Summary',
    '| Field | Visible Truth | MIMO Match | Tencent Match | MIMO-only | Tencent-only | Both wrong/missing |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...summary.map(
      (row) =>
        `| ${row.field} | ${row.visibleTruthRows} | ${row.mimoMatch} | ${row.tencentMatch} | ${row.mimoOnly} | ${row.tencentOnly} | ${Number(row.bothWrong) + Number(row.bothMissing)} |`
    ),
    '',
    '## Output Paths',
    `- \`${join(OUTPUT_DIR, 'manifest.json')}\``,
    `- \`${join(OUTPUT_DIR, 'visible-ground-truth.json')}\``,
    `- \`${join(OUTPUT_DIR, 'text-comparison.csv')}\``,
    `- \`${join(OUTPUT_DIR, 'field-accuracy-summary.csv')}\``,
    `- \`${join(OUTPUT_DIR, 'candidate-audit.csv')}\``,
    `- \`${join(OUTPUT_DIR, 'index.md')}\``,
    `- \`${join(OUTPUT_DIR, 'report.md')}\``,
    '',
    '## Per-sample Evidence Paths',
  ]

  for (const sample of samples) {
    lines.push(`- ${sample.id}`)
    lines.push(`  - card: \`${cardPaths.get(sample.id) ?? ''}\``)
    lines.push(`  - result JSON: \`${join(RESULT_DIR, `${sample.id}.json`)}\``)
  }

  await writeFile(join(OUTPUT_DIR, 'report.md'), `${lines.join('\n')}\n`)
}

async function main() {
  const args = parseArgs()
  const samples = await buildSamples(args.holdoutDir)
  if (args.mode === 'dry-run') await runDryRun(samples)
  else if (args.mode === 'all') await runAll(samples)
  else await runEvidenceOnly(samples)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
