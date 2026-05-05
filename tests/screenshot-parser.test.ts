import test from 'node:test'
import assert from 'node:assert/strict'
import type { OcrTextBlock } from '../src/lib/screenshot/types'

const sourceExtension = 'ts'

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

test('parses screenshot distance values in km and meters', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['12.5km'])).distance?.value, 12.5)
  assert.equal(parseFieldsFromOcr(blocks(['12.5公里'])).distance?.value, 12.5)
  assert.equal(parseFieldsFromOcr(blocks(['12500m'])).distance?.value, 12.5)
  assert.equal(parseFieldsFromOcr(blocks(['12500m'])).distance?.unit, 'km')
})

test('parses screenshot duration formats into seconds', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['3:45:00'])).duration?.value, 13500)
  assert.equal(parseFieldsFromOcr(blocks(['3小时45分'])).duration?.value, 13500)
  assert.equal(parseFieldsFromOcr(blocks(['用时 2小时30分钟'])).duration?.value, 9000)
})

test('parses elevation values', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['海拔1234m'])).elevation?.value, 1234)
  assert.equal(parseFieldsFromOcr(blocks(['最高海拔 2000'])).elevation?.value, 2000)
})

test('parses elevation gain and loss values', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['↑500m'])).elevationGain?.value, 500)
  assert.equal(parseFieldsFromOcr(blocks(['累计爬升 800米'])).elevationGain?.value, 800)
  assert.equal(parseFieldsFromOcr(blocks(['D+ 1200'])).elevationGain?.value, 1200)
  assert.equal(parseFieldsFromOcr(blocks(['下降 300米'])).elevationLoss?.value, 300)
})

test('parses screenshot date formats into ISO date strings', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['2026年1月1日'])).date?.value, '2026-01-01')
  assert.equal(parseFieldsFromOcr(blocks(['2026-05-05'])).date?.value, '2026-05-05')
  assert.equal(parseFieldsFromOcr(blocks(['2026.01.01'])).date?.value, '2026-01-01')
})

test('parses speed, pace, calories, and a combined Liangbulu-style result', async () => {
  const { parseFieldsFromOcr } = await loadFieldParser()

  assert.equal(parseFieldsFromOcr(blocks(['平均速度 4.8 km/h'])).speed?.value, 4.8)
  assert.equal(parseFieldsFromOcr(blocks(["配速 12'00\""])).speed?.value, 5)
  assert.equal(parseFieldsFromOcr(blocks(['消耗 860kcal'])).calories?.value, 860)

  const parsed = parseFieldsFromOcr(
    blocks([
      '灵山徒步',
      '距离 12.5公里',
      '用时 3小时45分',
      '最高海拔 2303m',
      '累计爬升 860米',
      'D- 430',
      '2026年5月5日',
    ])
  )

  assert.equal(parsed.location?.value, '灵山徒步')
  assert.equal(parsed.distance?.value, 12.5)
  assert.equal(parsed.duration?.value, 13500)
  assert.equal(parsed.elevation?.value, 2303)
  assert.equal(parsed.elevationGain?.value, 860)
  assert.equal(parsed.elevationLoss?.value, 430)
  assert.equal(parsed.date?.value, '2026-05-05')
})
