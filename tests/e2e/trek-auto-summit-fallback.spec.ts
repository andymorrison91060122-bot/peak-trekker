import { expect, test, type Page } from '@playwright/test'
import { backdateTrekSessionForTest } from './community.helpers'
import {
  HUASHAN,
  appendSummitServerGpsPoints,
  captureOptionalE2EScreenshot,
  expectNoRuntimeIssueBadge,
  feedSummitGpsPoints,
  fetchCheckinForE2E,
  openAuthenticatedTrek,
  setMockGps,
} from './trek-regression.helpers'

function offsetFromMountain(distanceMeters: number) {
  const bearingRadians = Math.PI / 4
  const northMeters = Math.cos(bearingRadians) * distanceMeters
  const eastMeters = Math.sin(bearingRadians) * distanceMeters

  return {
    latitude: HUASHAN.latitude - northMeters / 111_320,
    longitude: HUASHAN.longitude - eastMeters / (111_320 * Math.cos((HUASHAN.latitude * Math.PI) / 180)),
  }
}

async function startTracking(page: Page) {
  const confirmButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  if (!(await confirmButton.isEnabled({ timeout: 20_000 }).catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  await expect(confirmButton).toBeEnabled({ timeout: 20_000 })
  await confirmButton.click()
  await expect(page.getByTestId('trek-dev-threshold-chip')).toContainText('1 点 / 10s')
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeEnabled({ timeout: 20_000 })

  const startResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"start_trek_session"') ?? false
  })
  await page.getByRole('button', { name: '从这里开始' }).click()
  const startResponse = await startResponsePromise
  const startBody = await startResponse.json().catch(() => ({}))
  expect(startResponse.status(), JSON.stringify(startBody)).toBe(200)
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })
  return String(startBody?.sessionId ?? '')
}

async function appendFarServerGpsPoints(page: Page, sessionId: string) {
  const startedAt = Date.now() - 120_000
  const base = offsetFromMountain(650)
  const points = Array.from({ length: 8 }, (_, index) => ({
    lat: base.latitude - index * 0.000003,
    lng: base.longitude - index * 0.000003,
    altitude: HUASHAN.altitude - 260 - index,
    accuracy: 5,
    ts: startedAt + index * 12_000,
  }))

  for (const point of points) {
    const response = await page.request.post('/api/trek/actions', {
      data: {
        action: 'append_trek_point',
        sessionId,
        point,
      },
    })
    const body = await response.json().catch(() => ({}))
    expect(response.ok(), JSON.stringify(body)).toBeTruthy()
  }
}

async function waitForClientElapsedAtLeast(page: Page, minSeconds: number) {
  await page.waitForFunction(
    (thresholdSeconds) => {
      const matches = [...document.body.innerText.matchAll(/\b(\d+):([0-5]\d):([0-5]\d)\b/g)]
      return matches.some((match) => {
        const hours = Number(match[1])
        const minutes = Number(match[2])
        const seconds = Number(match[3])
        return hours * 3600 + minutes * 60 + seconds >= thresholdSeconds
      })
    },
    minSeconds,
    { timeout: 20_000 }
  )
}

test('ending after summit reach and descent auto-creates verified checkin', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const descentPoint = offsetFromMountain(650)

  await openAuthenticatedTrek({
    page,
    root,
    initialGps: {
      latitude: HUASHAN.latitude - 0.02,
      longitude: HUASHAN.longitude - 0.02,
      altitude: 1329,
      accuracy: 5,
    },
  })

  const sessionId = await startTracking(page)
  await feedSummitGpsPoints(page)
  await appendSummitServerGpsPoints(page, sessionId)
  await backdateTrekSessionForTest(sessionId, 120_000)

  await setMockGps(page, {
    latitude: descentPoint.latitude,
    longitude: descentPoint.longitude,
    altitude: HUASHAN.altitude - 260,
    accuracy: 5,
  })
  await waitForClientElapsedAtLeast(page, 10)
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '暂停' }).click()
  await expect(page.getByRole('button', { name: '结束并保存' })).toBeVisible({ timeout: 10_000 })

  const finishResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"finish_incomplete_trek"') ?? false
  })
  await page.getByRole('button', { name: '结束并保存' }).click()
  const finishResponse = await finishResponsePromise
  const finishBody = await finishResponse.json().catch(() => ({}))
  expect(finishResponse.status(), JSON.stringify(finishBody)).toBe(200)
  expect(finishBody?.autoVerified).toBe(true)
  expect(finishBody?.completionStatus).toBe('complete')
  const checkinId = String(finishBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)

  await expect(page.locator('[role="alert"]').filter({ hasText: '已自动确认登顶' })).toBeVisible({ timeout: 20_000 })
  await captureOptionalE2EScreenshot(page, 'auto-summit-after-descent-1024.png')
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })

  const checkin = await fetchCheckinForE2E(checkinId)
  expect(checkin.completion_status ?? 'complete').toBe('complete')
  expect(checkin.verified_at).toBeTruthy()
  expect(checkin.verification_distance_m ?? 9999).toBeLessThanOrEqual(300)
  await expectNoRuntimeIssueBadge(page)
})

test('ending without entering summit range stays incomplete', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const farPoint = offsetFromMountain(650)

  await openAuthenticatedTrek({
    page,
    root,
    initialGps: {
      latitude: farPoint.latitude,
      longitude: farPoint.longitude,
      altitude: HUASHAN.altitude - 260,
      accuracy: 5,
    },
  })

  const sessionId = await startTracking(page)
  await appendFarServerGpsPoints(page, sessionId)
  await backdateTrekSessionForTest(sessionId, 120_000)
  await waitForClientElapsedAtLeast(page, 10)

  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '暂停' }).click()
  await expect(page.getByRole('button', { name: '结束并保存' })).toBeVisible({ timeout: 10_000 })

  const finishResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"finish_incomplete_trek"') ?? false
  })
  await page.getByRole('button', { name: '结束并保存' }).click()
  const finishResponse = await finishResponsePromise
  const finishBody = await finishResponse.json().catch(() => ({}))
  expect(finishResponse.status(), JSON.stringify(finishBody)).toBe(200)
  expect(finishBody?.autoVerified).toBeUndefined()
  expect(finishBody?.completionStatus).toBe('incomplete')
  const checkinId = String(finishBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)

  const checkin = await fetchCheckinForE2E(checkinId)
  expect(checkin.completion_status).toBe('incomplete')
  expect(checkin.verified_at).toBeNull()
  await expectNoRuntimeIssueBadge(page)
})
