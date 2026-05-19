import { expect, test, type Page, type Route } from '@playwright/test'
import { dismissActivationChecklistIfPresent } from './community.helpers'

test.use({ viewport: { width: 375, height: 812 } })

type WeatherMockPayload = ReturnType<typeof baseWeatherPayload> & {
  stale?: boolean
  refreshError?: string
}

test('mountain weather section renders live daily-only data', async ({ page }) => {
  await mockWeather(page, liveWeatherPayload())
  await gotoFirstMountain(page)

  const section = page.getByTestId('mountain-weather-section')
  await expect(section).toBeVisible()
  await expect(section).toHaveAttribute('data-weather-state', 'live')
  await expect(section.getByText('天气参考')).toBeVisible()
  await expect(section.getByText('18°', { exact: true })).toBeVisible()
  await expect(section.getByText('体感 15°')).toBeVisible()
  await expect(section.getByText(/多云间晴/)).toBeVisible()
  await expect(section.getByText('可出发')).toBeVisible()
  const forecast = section.getByTestId('mountain-weather-forecast-row')
  await expect(forecast.getByText('今日', { exact: true })).toBeVisible()
  await expect(forecast.getByText('明日', { exact: true })).toBeVisible()
  await expect(forecast.getByText('22° / 11°')).toBeVisible()
  const kpis = section.getByTestId('mountain-weather-kpis')
  await expect(kpis.getByText('风', { exact: true })).toBeVisible()
  await expect(kpis.getByText('18 km/h')).toBeVisible()
  await expect(kpis.getByText('降水', { exact: true })).toBeVisible()
  await expect(kpis.getByText('0 mm')).toBeVisible()
  await expect(section.getByText('仅作决策参考 · Peak Trekker 不是专业天气产品')).toBeVisible()
  await expect(section.getByText('能见度')).toHaveCount(0)
  await expect(section.getByText('04')).toHaveCount(0)
})

test('mountain weather section renders stale review state', async ({ page }) => {
  await mockWeather(page, liveWeatherPayload({
    fetchedAt: new Date(Date.now() - 7.5 * 3_600_000).toISOString(),
    stale: true,
  }))
  await gotoFirstMountain(page)

  const section = page.getByTestId('mountain-weather-section')
  await expect(section).toHaveAttribute('data-weather-state', 'stale')
  await expect(section.getByText('建议评估')).toBeVisible()
  await expect(section.getByText(/数据已 [78] 小时未更新/).first()).toBeVisible()
  await expect(section.getByText('出发前请通过其他渠道复核当前状况。')).toBeVisible()
})

test('mountain weather section renders review state for moderate weather risk', async ({ page }) => {
  await mockWeather(page, liveWeatherPayload({
    current: {
      ...baseWeatherPayload().current,
      windSpeed: 29,
      description: '多云',
    },
    forecast: [
      {
        ...baseWeatherPayload().forecast[0],
        precipitation: 0,
        description: '多云',
      },
      baseWeatherPayload().forecast[1],
    ],
  }))
  await gotoFirstMountain(page)

  const section = page.getByTestId('mountain-weather-section')
  await expect(section).toHaveAttribute('data-weather-state', 'live')
  await expect(section.getByText('建议评估')).toBeVisible()
  await expect(section.getByText('风速需评估')).toBeVisible()
  await expect(section.getByText('可出发')).toHaveCount(0)
})

test('mountain weather section renders not recommended for extreme cold and snow', async ({ page }) => {
  await mockWeather(page, liveWeatherPayload({
    current: {
      ...baseWeatherPayload().current,
      temperature: -14,
      feelsLike: -17,
      windSpeed: 45,
      description: '大雪',
      icon: 'snow',
    },
    forecast: [
      {
        ...baseWeatherPayload().forecast[0],
        tempMax: -9,
        tempMin: -19,
        description: '大雪',
        icon: 'snow',
        precipitation: 8,
      },
      baseWeatherPayload().forecast[1],
    ],
  }))
  await gotoFirstMountain(page)

  const section = page.getByTestId('mountain-weather-section')
  await expect(section).toHaveAttribute('data-weather-state', 'live')
  await expect(section.getByText('不建议出发')).toBeVisible()
  await expect(section.getByText('天气风险过高')).toBeVisible()
  await expect(section.getByText('可出发')).toHaveCount(0)
})

test('mountain weather section renders unavailable state and retries', async ({ page }) => {
  let calls = 0
  await page.route('**/api/weather/**', async (route) => {
    calls += 1
    if (calls === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weather unavailable' }),
      })
      return
    }
    await fulfillWeather(route, liveWeatherPayload())
  })

  await gotoFirstMountain(page)
  const section = page.getByTestId('mountain-weather-section')
  await expect(section).toHaveAttribute('data-weather-state', 'unavailable')
  await expect(section.getByText('天气暂时拿不到')).toBeVisible()
  await expect(section.getByText('区域气象点没有响应，出发前请通过其他渠道复核。')).toBeVisible()

  await section.getByRole('button', { name: '重试' }).click()
  await expect(section).toHaveAttribute('data-weather-state', 'live')
  await expect(section.getByText('可出发')).toBeVisible()
})

test('mountain weather section shows loading before weather returns', async ({ page }) => {
  let releaseWeather!: () => void
  const weatherGate = new Promise<void>((resolve) => {
    releaseWeather = resolve
  })

  await page.route('**/api/weather/**', async (route) => {
    await weatherGate
    await fulfillWeather(route, liveWeatherPayload())
  })

  await gotoFirstMountain(page)
  const section = page.getByTestId('mountain-weather-section')
  await expect(section).toHaveAttribute('data-weather-state', 'loading')
  await expect(section.getByText('加载中')).toBeVisible()

  releaseWeather()
  await expect(section).toHaveAttribute('data-weather-state', 'live')
})

async function gotoFirstMountain(page: Page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)

  const firstMountainLink = page.locator('[data-testid="explore-mountain-card"]').first()
  await expect(firstMountainLink).toBeVisible()
  const href = await firstMountainLink.getAttribute('href')
  if (!href) {
    throw new Error('Expected at least one mountain detail link on the explore page.')
  }

  await page.goto(href, { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
}

async function mockWeather(page: Page, payload: WeatherMockPayload) {
  await page.route('**/api/weather/**', async (route) => {
    await fulfillWeather(route, payload)
  })
}

async function fulfillWeather(route: Route, payload: WeatherMockPayload) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })
}

function liveWeatherPayload(overrides: Partial<WeatherMockPayload> = {}): WeatherMockPayload {
  return {
    ...baseWeatherPayload(),
    ...overrides,
  }
}

function baseWeatherPayload() {
  return {
    mountainId: 'mock-mountain',
    tier: 'A',
    provider: 'qweather',
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
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
      {
        date: '2026-05-19',
        tempMax: 22,
        tempMin: 11,
        description: '多云',
        icon: '101',
        precipitation: 0,
      },
      {
        date: '2026-05-20',
        tempMax: 19,
        tempMin: 10,
        description: '小雨',
        icon: '305',
        precipitation: 4.2,
      },
    ],
  }
}
