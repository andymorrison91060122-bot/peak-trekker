import { expect, test, type Page } from '@playwright/test'
import { backdateTrekSessionForTest } from './community.helpers'
import {
  HUASHAN,
  captureOptionalE2EScreenshot,
  expectNoRuntimeIssueBadge,
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

async function confirmTargetIfNeeded(page: Page) {
  const confirmButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  const startButton = page.getByRole('button', { name: '从这里开始' })
  if (!(await startButton.isVisible().catch(() => false))) {
    await expect(confirmButton).toBeEnabled({ timeout: 20_000 })
    await confirmButton.click()
  }
  await expect(page.getByTestId('trek-dev-threshold-chip')).toContainText('1 点 / 10s')
}

async function startTracking(page: Page) {
  await confirmTargetIfNeeded(page)
  const startButton = page.getByRole('button', { name: '从这里开始' })
  await expect(startButton).toBeEnabled({ timeout: 20_000 })
  const startResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"start_trek_session"') ?? false
  })
  await startButton.click()
  const startResponse = await startResponsePromise
  const startBody = await startResponse.json().catch(() => ({}))
  expect(startResponse.status(), JSON.stringify(startBody)).toBe(200)
  await expect(page.locator('[data-testid="trek-near-summit-view"], button:has-text("暂停")')).toBeVisible({ timeout: 20_000 })
  return String(startBody?.sessionId ?? '')
}

async function finishSession(page: Page, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return
  await page.request.post('/api/trek/actions', {
    data: {
      action: 'finish_trek_session',
      sessionId,
      finalStatus: 'aborted',
    },
  }).catch(() => undefined)
}

test('refreshing during a live trek restores tracking state and elapsed time', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

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
  try {
    await backdateTrekSessionForTest(sessionId, 125_000)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('trek-status-chip')).toContainText('记录中')
    await expect(page.locator('body')).toContainText(/02:\d{2}/, { timeout: 20_000 })
    await captureOptionalE2EScreenshot(page, 'trek-refresh-resume.png')
    await expectNoRuntimeIssueBadge(page)
  } finally {
    await finishSession(page, sessionId)
  }
})

test('manual refresh button refreshes GPS data and applies cooldown', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

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
  try {
    const refreshButton = page.getByRole('button', { name: '刷新数据' })
    await expect(refreshButton).toBeEnabled({ timeout: 20_000 })
    await refreshButton.click()
    await expect(page.locator('[role="alert"]').filter({ hasText: '数据已刷新' })).toBeVisible({ timeout: 20_000 })

    await refreshButton.click()
    await expect(page.locator('[role="alert"]').filter({ hasText: '刷新太频繁' })).toBeVisible({ timeout: 20_000 })
    await captureOptionalE2EScreenshot(page, 'trek-manual-refresh-button.png')
    await expectNoRuntimeIssueBadge(page)
  } finally {
    await finishSession(page, sessionId)
  }
})

test('near summit CTA only becomes summit confirmation inside 100m', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const nearButNotReady = offsetFromMountain(150)

  await openAuthenticatedTrek({
    page,
    root,
    initialGps: {
      latitude: nearButNotReady.latitude,
      longitude: nearButNotReady.longitude,
      altitude: HUASHAN.altitude - 24,
      accuracy: 5,
    },
  })

  const sessionId = await startTracking(page)
  try {
    await expect(page.getByTestId('trek-near-summit-view')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('trek-near-summit-cta')).toHaveText('继续靠近峰顶')
    await page.getByTestId('trek-near-summit-cta').click()
    await expect(page.locator('[role="alert"]').filter({ hasText: '进入 100m 登顶确认范围' })).toBeVisible({
      timeout: 20_000,
    })

    await setMockGps(page, {
      latitude: HUASHAN.latitude,
      longitude: HUASHAN.longitude,
      altitude: HUASHAN.altitude,
      accuracy: 5,
    })
    await expect(page.getByTestId('trek-near-summit-cta')).toHaveText('我已登顶', { timeout: 20_000 })
    await expect(page.getByTestId('trek-near-summit-stats')).toContainText('就绪', { timeout: 20_000 })
    await page.getByTestId('trek-near-summit-cta').click()
    await expect(page.getByTestId('trek-summit-photo-view')).toBeVisible({ timeout: 20_000 })
    await captureOptionalE2EScreenshot(page, 'trek-summit-zone-cta.png')
    await expectNoRuntimeIssueBadge(page)
  } finally {
    await finishSession(page, sessionId)
  }
})
