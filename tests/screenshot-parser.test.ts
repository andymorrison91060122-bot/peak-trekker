import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OcrTextBlock } from '../src/lib/screenshot/types'
import { SCREENSHOT_OCR_FIXTURES, type ScreenshotOcrFixtureExpected } from './fixtures/screenshots/ocr-fixtures.ts'

const sourceExtension = 'ts'

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

async function loadFieldParser() {
  return import(`../src/lib/screenshot/field-parser.${sourceExtension}`)
}

function blocks(lines: string[]): OcrTextBlock[] {
  return lines.map((text, index) => ({
    text,
    confidence: 98,
    x: 0,
    y: index * 24,
    width: 200,
    height: 20,
  }))
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

function readRecordedBlocks(fixtureId: string): OcrTextBlock[] {
  const fixture = JSON.parse(
    readFileSync(join('tests/fixtures/screenshots/raw-ocr', `${fixtureId}.json`), 'utf8')
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

function assertNear(actual: number | undefined, expected: number, label: string, tolerance = 0.02) {
  assert.equal(typeof actual, 'number', `${label} should be parsed`)
  assert.ok(Math.abs((actual ?? 0) - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`)
}

function assertOptionalNear(actual: number | undefined, expected: number | undefined, label: string, tolerance = 0.02) {
  if (typeof expected !== 'number') {
    assert.equal(actual, undefined, `${label} should be absent`)
    return
  }
  assertNear(actual, expected, label, tolerance)
}

function assertOptionalEqual<T>(actual: T | undefined, expected: T | null | undefined, label: string) {
  if (expected === null || expected === undefined) {
    assert.equal(actual, undefined, `${label} should be absent`)
    return
  }
  assert.equal(actual, expected, label)
}

function assertParsedFixture(
  actual: ReturnType<(typeof import('../src/lib/screenshot/field-parser'))['parseFieldsFromOcr']>,
  expected: ScreenshotOcrFixtureExpected,
  label: string
) {
  assertOptionalNear(actual.distance?.value, expected.distanceKm, `${label} distance`)
  assertOptionalNear(actual.duration?.value, expected.durationSeconds, `${label} duration`, 1)
  assertOptionalNear(actual.speed?.value, expected.speedKmh, `${label} speed`, 0.05)
  assertOptionalNear(actual.elevationGain?.value, expected.elevationGainM, `${label} elevation gain`, 0.2)
  assertOptionalNear(actual.elevation?.value, expected.maxElevationM, `${label} max elevation`, 0.2)
  assertOptionalEqual(actual.date?.value, expected.date, `${label} date`)
  assertOptionalEqual(actual.location?.value, expected.location, `${label} location`)
}

for (const fixture of SCREENSHOT_OCR_FIXTURES) {
  test(`parses-${fixture.id}`, async () => {
    const { parseFieldsFromOcr } = await loadFieldParser()
    const parsed = parseFieldsFromOcr(readRecordedBlocks(fixture.id))
    assertParsedFixture(parsed, fixture.expected, fixture.id)
  })
}

test('parses European comma decimal distance values', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['5,31km'])).distance?.value, 5.31)
})

test('parses distance label and value split across lines', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['路线距离', '5.9 km'])).distance?.value, 5.9)
})

test('parses thousand-separated elevation values', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['海拔', '1.545 m'])).elevation?.value, 1545)
})

test('filters generic single-character location labels', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['山'])).location, undefined)
})

test('extracts mountain name candidates from screenshot title text', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['登顶了泰山', '泰山·山东'])).location?.value, '泰山')
})

test('parses split cumulative climb labels', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['累计爬升', '1051 m'])).elevationGain?.value, 1051)
})

test('parses date variants', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['2026/04/22'])).date?.value, '2026-04-22')
  assert.equal(parseFieldsFromOcr(blocks(['2026-04-22'])).date?.value, '2026-04-22')
  assert.equal(parseFieldsFromOcr(blocks(['2026.04.22'])).date?.value, '2026-04-22')
  assert.equal(parseFieldsFromOcr(blocks(['12.03.2026'])).date?.value, '2026-03-12')
})

test('rejects implausible elevation and percentage climb candidates', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['最高海拔', '1265439m'])).elevation, undefined)
  assert.equal(parseFieldsFromOcr(blocks(['累计爬升', '35%'])).elevationGain, undefined)
})

test('prefers average speed over fastest speed', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(blocks(['2.4', '9.7', '全程均速(公里/小时) 最快速度(公里/小时)']))
  assert.equal(parsed.speed?.value, 2.4)
})

test('distinguishes Suunto duration from pace-like values by anchors', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['运动时长', "6:42'54"])).duration?.value, 6 * 3600 + 42 * 60 + 54)
  assert.equal(parseFieldsFromOcr(blocks(['平均配速', "6:42'54"])).duration, undefined)
})

test('parses-two-bulu-hiking-with-step-count', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(readRecordedBlocks('two-bulu-15-53-actual'))

  assert.equal(parsed.elevationGain?.value, 551)
  assert.equal(parsed.speed?.value, 1.9)
  assert.equal(parsed.elevation?.value, 3556)
})

test('parses-two-bulu-other-mode-with-fake-location', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(readRecordedBlocks('liangbulu-631'))

  assert.equal(parsed.location, undefined)
})

test('parses-coros-walking-short-mmss-duration', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(readRecordedBlocks('coros-walking-6-81-actual'))

  assert.equal(parsed.duration?.value, 48 * 60 + 44)
})

test('parses-coros-walking-low-elevation-gain', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(readRecordedBlocks('coros-walking-6-81-actual'))

  assert.equal(parsed.elevationGain?.value, 11)
})

test('parses-coros-walking-no-speed-fabrication', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(readRecordedBlocks('coros-walking-6-81-actual'))

  assert.equal(parsed.speed, undefined)
})

test('excludes-step-unit-from-elevation-and-speed', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(blocks(['18108步', '步数', '累计爬升', '平均速度']))

  assert.equal(parsed.elevationGain, undefined)
  assert.equal(parsed.speed, undefined)
})

test('field-uniqueness-prevents-double-consumption', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(blocks(['18108步', '579', '3.1', '步数', '累计爬升(米)', '全程均速(公里/小时)']))

  assert.notEqual(parsed.elevationGain?.value, 18108)
  assert.notEqual(parsed.speed?.value, 18108)
})

test('altitude-prefers-highest-deterministically', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  const parsed = parseFieldsFromOcr(blocks(['27', '368', '最低海拔', '最高海拔']))

  assert.equal(parsed.elevation?.value, 368)
})

test('location-strict-whitelist-rejects-id-format', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['zs_0472469'])).location, undefined)
  assert.equal(parseFieldsFromOcr(blocks(['#9757360'])).location, undefined)
})

test('duration-mmss-vs-hhmm-disambiguation', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['运动时间', '48:44'])).duration?.value, 48 * 60 + 44)
  assert.equal(parseFieldsFromOcr(blocks(['全程耗时', '3:12'])).duration?.value, 3 * 3600 + 12 * 60)
})
