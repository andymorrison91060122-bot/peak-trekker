import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

const fetchedAt = '2026-05-05T12:00:00.000Z'

test('QWeather adapter parses current and 3-day forecast responses', async () => {
  const { parseQWeather } = await import(`../src/lib/weather/qweather-adapter.${sourceExtension}`)
  const weather = parseQWeather({
    nowResponse: {
      code: '200',
      now: {
        temp: '18',
        feelsLike: '16',
        humidity: '72',
        windSpeed: '14',
        windDir: '西北风',
        text: '多云',
        icon: '101',
        pressure: '1008',
      },
    },
    forecastResponse: {
      code: '200',
      daily: [
        { fxDate: '2026-05-05', tempMax: '21', tempMin: '12', textDay: '多云', iconDay: '101', precip: '0.2' },
        { fxDate: '2026-05-06', tempMax: '19', tempMin: '10', textDay: '小雨', iconDay: '305', precip: '3.8' },
        { fxDate: '2026-05-07', tempMax: '20', tempMin: '11', textDay: '晴', iconDay: '100', precip: '0' },
      ],
    },
    fetchedAt,
  })

  assert.equal(weather.provider, 'qweather')
  assert.equal(weather.current.temperature, 18)
  assert.equal(weather.current.feelsLike, 16)
  assert.equal(weather.current.humidity, 72)
  assert.equal(weather.current.windDirection, '西北风')
  assert.equal(weather.forecast.length, 3)
  assert.deepEqual(weather.forecast[1], {
    date: '2026-05-06',
    tempMax: 19,
    tempMin: 10,
    description: '小雨',
    icon: '305',
    precipitation: 3.8,
  })
})

test('Open-Meteo adapter parses current and 3-day forecast responses', async () => {
  const { parseOpenMeteoWeather } = await import(`../src/lib/weather/openmeteo-adapter.${sourceExtension}`)
  const weather = parseOpenMeteoWeather({
    response: {
      current_weather: {
        temperature: 9.6,
        windspeed: 22.3,
        winddirection: 315,
        weathercode: 3,
      },
      daily: {
        time: ['2026-05-05', '2026-05-06', '2026-05-07'],
        temperature_2m_max: [14.2, 15.1, 13.8],
        temperature_2m_min: [4.4, 5.2, 3.9],
        precipitation_sum: [0, 6.5, 1.1],
        weathercode: [3, 61, 80],
      },
    },
    fetchedAt,
  })

  assert.equal(weather.provider, 'openmeteo')
  assert.equal(weather.current.temperature, 9.6)
  assert.equal(weather.current.feelsLike, 9.6)
  assert.equal(weather.current.windSpeed, 22.3)
  assert.equal(weather.current.windDirection, 'NW')
  assert.equal(weather.current.description, '多云')
  assert.equal(weather.forecast[1].description, '小雨')
  assert.equal(weather.forecast[1].precipitation, 6.5)
})

test('weather service falls back to Open-Meteo when QWeather fails', async () => {
  const { getWeatherForMountainWithDeps } = await import(`../src/lib/weather/weather-core.${sourceExtension}`)
  const store = createMemoryStore(null)
  const openMeteoData = buildWeatherData('openmeteo')

  const weather = await getWeatherForMountainWithDeps({
    mountainId: 'mountain-1',
    latitude: 31.1,
    longitude: 103.4,
    tier: 'S',
    cacheStore: store,
    fetchQWeather: async () => {
      throw new Error('qweather rate limited')
    },
    fetchOpenMeteo: async () => openMeteoData,
  })

  assert.equal(weather.provider, 'openmeteo')
  assert.equal(weather.stale, undefined)
  assert.equal(store.upserts.length, 1)
  assert.equal(store.upserts[0].provider, 'openmeteo')
})

test('weather service returns stale cache when both providers fail', async () => {
  const { getWeatherForMountainWithDeps } = await import(`../src/lib/weather/weather-core.${sourceExtension}`)
  const staleData = buildWeatherData('qweather', '2026-05-05T08:00:00.000Z')
  const store = createMemoryStore({
    mountainId: 'mountain-1',
    tier: 'A',
    provider: 'qweather',
    data: staleData,
    fetchedAt: staleData.fetchedAt,
    expiresAt: '2026-05-05T09:00:00.000Z',
  })

  const weather = await getWeatherForMountainWithDeps({
    mountainId: 'mountain-1',
    latitude: 31.1,
    longitude: 103.4,
    tier: 'A',
    now: new Date('2026-05-05T12:00:00.000Z'),
    cacheStore: store,
    fetchQWeather: async () => {
      throw new Error('qweather failed')
    },
    fetchOpenMeteo: async () => {
      throw new Error('openmeteo failed')
    },
  })

  assert.equal(weather.provider, 'qweather')
  assert.equal(weather.stale, true)
  assert.equal(weather.expiresAt, '2026-05-05T09:00:00.000Z')
})

function buildWeatherData(provider: 'qweather' | 'openmeteo', fetchedAtValue = fetchedAt) {
  return {
    provider,
    fetchedAt: fetchedAtValue,
    current: {
      temperature: 12,
      feelsLike: 10,
      humidity: 60,
      windSpeed: 18,
      windDirection: 'NW',
      description: '多云',
      icon: 'cloudy',
      pressure: 1006,
    },
    forecast: [
      {
        date: '2026-05-05',
        tempMax: 15,
        tempMin: 7,
        description: '多云',
        icon: 'cloudy',
        precipitation: 0,
      },
    ],
  }
}

type CacheRow = {
  mountainId: string
  tier: 'S' | 'A' | 'B' | 'C'
  provider: 'qweather' | 'openmeteo'
  data: ReturnType<typeof buildWeatherData>
  fetchedAt: string
  expiresAt: string
} | null

type CacheUpsert = {
  mountainId: string
  tier: 'S' | 'A' | 'B' | 'C'
  provider: 'qweather' | 'openmeteo'
  data: ReturnType<typeof buildWeatherData>
  expiresAt: string
}

function createMemoryStore(initial: CacheRow) {
  let cache = initial
  const upserts: CacheUpsert[] = []

  return {
    upserts,
    async get() {
      return cache
    },
    async upsert(entry: CacheUpsert) {
      upserts.push(entry)
      cache = {
        mountainId: entry.mountainId,
        tier: entry.tier,
        provider: entry.provider,
        data: entry.data,
        fetchedAt: entry.data.fetchedAt,
        expiresAt: entry.expiresAt,
      }
    },
  }
}
