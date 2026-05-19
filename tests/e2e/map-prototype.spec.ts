import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './community.helpers'

type PrototypeProbe = {
  name: string
  x: number
  y: number
}

type BrowserPrototypeHook = {
  geojson: {
    features: Array<{
      geometry: {
        coordinates: [number, number]
      }
      properties: {
        name: string
      }
    }>
  }
  map: {
    jumpTo(options: { center: [number, number], zoom: number }): void
    once(event: 'idle', listener: () => void): void
    project(coordinates: [number, number]): { x: number, y: number }
    getContainer(): HTMLElement
  }
}

const geoJsonFixture = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [110.0833, 34.4833],
      },
      properties: {
        id: 'huashan',
        name: '华山',
        altitude: 2154,
        difficulty: 'hard',
      },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [86.925, 27.9881],
      },
      properties: {
        id: 'qomolangma',
        name: '珠穆朗玛峰',
        altitude: 8848,
        difficulty: 'expert',
      },
    },
  ],
}

async function mockMountainGeoJson(page: Page) {
  await page.route('**/api/mountains/geojson', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(geoJsonFixture),
      headers: {
        'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=86400',
      },
    })
  })
}

test('map prototype renders self-hosted PMTiles and mountain markers', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const tileRequests: string[] = []
  await mockMountainGeoJson(page)

  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('.pmtiles') || url.includes('/map-tiles/')) {
      tileRequests.push(url)
    }
  })

  await registerFreshUser(page, root, { returnTo: '/debug/map-prototype' })

  await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('map-prototype-canvas').locator('canvas').first()).toBeVisible()
  await expect(page.getByText('地图仅作轻量参考')).toBeVisible()

  const markerCount = Number(await page.getByTestId('map-prototype-marker-count').textContent())
  expect(markerCount).toBeGreaterThan(0)
  expect(tileRequests.some((url) => url.includes('supabase.co/storage/v1/object/public/map-tiles/'))).toBe(true)
  expect(tileRequests.some((url) => url.includes('build.protomaps.com'))).toBe(false)

  await page.getByTestId('map-prototype-canvas').scrollIntoViewIfNeeded()
  const probe = await page.evaluate(async () => {
    const prototype = (window as Window & { __peakTrekkerMapPrototype?: BrowserPrototypeHook })
      .__peakTrekkerMapPrototype
    if (!prototype) throw new Error('Map prototype hook not ready')
    const feature = prototype.geojson.features.find((item) => !item.properties.name.startsWith('测试山峰-'))
      ?? prototype.geojson.features[0]
    prototype.map.jumpTo({ center: feature.geometry.coordinates, zoom: 6 })
    await new Promise((resolve) => prototype.map.once('idle', resolve))
    const point = prototype.map.project(feature.geometry.coordinates)
    const rect = prototype.map.getContainer().getBoundingClientRect()
    return {
      name: feature.properties.name,
      x: rect.left + point.x,
      y: rect.top + point.y,
    }
  }) as PrototypeProbe

  await page.mouse.move(probe.x, probe.y)
  await expect(page.getByText(probe.name).first()).toBeVisible()
  await page.mouse.click(probe.x, probe.y)
  await expect(page.getByTestId('map-prototype-selected')).toContainText(probe.name)
})

test('map prototype keeps the debug layout inside a 375px viewport', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await mockMountainGeoJson(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/debug/map-prototype' })

  await expect(page.locator('[data-map-status="ready"]')).toBeVisible({ timeout: 45_000 })
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

  expect(noHorizontalOverflow).toBe(true)
})
