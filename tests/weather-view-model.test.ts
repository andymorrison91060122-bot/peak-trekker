import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

test('daily weather view model renders live weather and departure window', async () => {
  const { toDailyWeatherViewModel } = await import(`../src/lib/weather/weather-view-model.${sourceExtension}`)
  const viewModel = toDailyWeatherViewModel(buildWeatherResponse(), { altitude: 2888 }, new Date('2026-05-19T12:00:00+09:00'))

  assert.ok(viewModel)
  assert.equal(viewModel.state, 'live')
  assert.equal(viewModel.updateLabel, '更新于 1 小时内')
  assert.equal(viewModel.current.temperature, '18°')
  assert.equal(viewModel.current.feelsLike, '体感 15°')
  assert.equal(viewModel.current.altitude, '2888m')
  assert.deepEqual(viewModel.departureWindow, { label: '可出发', tone: 'ok', reasons: [] })
  assert.deepEqual(viewModel.forecast.map((day) => day.label), ['今日', '明日'])
  assert.equal(viewModel.forecast[0].temperature, '22° / 11°')
  assert.equal(viewModel.forecast[0].precipitation, '1.8 mm')
  assert.equal(viewModel.kpis[0].value, '18 km/h')
  assert.equal(viewModel.kpis[1].value, '1.8 mm')
  assert.equal(viewModel.riskNote.tone, 'ok')
})

test('daily weather view model marks stale responses for review', async () => {
  const { toDailyWeatherViewModel } = await import(`../src/lib/weather/weather-view-model.${sourceExtension}`)
  const response = buildWeatherResponse({
    fetchedAt: '2026-05-19T04:10:00+09:00',
    stale: true,
  })
  const viewModel = toDailyWeatherViewModel(response, { altitude: 4099 }, new Date('2026-05-19T12:00:00+09:00'))

  assert.ok(viewModel)
  assert.equal(viewModel.state, 'stale')
  assert.equal(viewModel.updateLabel, '数据已 8 小时未更新')
  assert.equal(viewModel.staleHours, 8)
  assert.equal(viewModel.departureWindow.label, '需复核')
  assert.deepEqual(viewModel.departureWindow.reasons, ['stale'])
  assert.equal(viewModel.riskNote.title, '数据已 8 小时未更新')
})

test('departure window requires review for high wind or high precipitation', async () => {
  const { buildDepartureWindow } = await import(`../src/lib/weather/weather-view-model.${sourceExtension}`)

  assert.deepEqual(
    buildDepartureWindow({ stale: false, windSpeed: 39, precipitation: 0 }),
    { label: '需复核', tone: 'review', reasons: ['wind'] }
  )
  assert.deepEqual(
    buildDepartureWindow({ stale: false, windSpeed: 8, precipitation: 5 }),
    { label: '需复核', tone: 'review', reasons: ['precipitation'] }
  )
  assert.deepEqual(
    buildDepartureWindow({ stale: false, windSpeed: 8, precipitation: 4.9 }),
    { label: '可出发', tone: 'ok', reasons: [] }
  )
})

test('daily weather view model tolerates missing tomorrow forecast', async () => {
  const { toDailyWeatherViewModel } = await import(`../src/lib/weather/weather-view-model.${sourceExtension}`)
  const response = buildWeatherResponse({
    forecast: [buildForecastDay({ date: '2026-05-19', precipitation: 0 })],
  })
  const viewModel = toDailyWeatherViewModel(response, { altitude: 1500 }, new Date('2026-05-19T12:00:00+09:00'))

  assert.ok(viewModel)
  assert.equal(viewModel.forecast.length, 2)
  assert.equal(viewModel.forecast[1].label, '明日')
  assert.equal(viewModel.forecast[1].temperature, '--')
  assert.equal(viewModel.forecast[1].description, '暂未返回')
  assert.equal(viewModel.forecast[1].precipitation, '--')
})

test('daily weather view model returns null without usable current weather or forecast', async () => {
  const { toDailyWeatherViewModel } = await import(`../src/lib/weather/weather-view-model.${sourceExtension}`)

  assert.equal(
    toDailyWeatherViewModel(buildWeatherResponse({ current: null as never }), { altitude: 1500 }),
    null
  )
  assert.equal(
    toDailyWeatherViewModel(buildWeatherResponse({ forecast: [] }), { altitude: 1500 }),
    null
  )
})

function buildWeatherResponse(overrides: Partial<ReturnType<typeof buildBaseWeatherResponse>> = {}) {
  return {
    ...buildBaseWeatherResponse(),
    ...overrides,
  }
}

function buildBaseWeatherResponse() {
  return {
    mountainId: 'mountain-1',
    tier: 'A' as const,
    provider: 'qweather' as const,
    fetchedAt: '2026-05-19T11:40:00+09:00',
    expiresAt: '2026-05-19T17:40:00+09:00',
    current: {
      temperature: 18,
      feelsLike: 15,
      humidity: 66,
      windSpeed: 18,
      windDirection: '西北风',
      description: '多云间晴',
      icon: '101',
      pressure: 1007,
    },
    forecast: [
      buildForecastDay({ date: '2026-05-19', tempMax: 22, tempMin: 11, precipitation: 1.8 }),
      buildForecastDay({ date: '2026-05-20', tempMax: 19, tempMin: 10, description: '小雨', precipitation: 4.2 }),
      buildForecastDay({ date: '2026-05-21', tempMax: 20, tempMin: 9, description: '晴', precipitation: 0 }),
    ],
  }
}

function buildForecastDay(overrides: {
  date: string
  tempMax?: number
  tempMin?: number
  description?: string
  precipitation?: number
}) {
  return {
    tempMax: 20,
    tempMin: 10,
    description: '多云',
    icon: '101',
    precipitation: 0,
    ...overrides,
  }
}
