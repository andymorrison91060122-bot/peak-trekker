import { expect, test, type Page } from '@playwright/test'
import {
  HUASHAN,
  captureOptionalE2EScreenshot,
  expectNoRuntimeIssueBadge,
  openAuthenticatedTrek,
} from './trek-regression.helpers'

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
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })
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

async function readElapsedSeconds(page: Page) {
  const bodyText = await page.locator('body').innerText()
  const matches = [...bodyText.matchAll(/\b(\d+):([0-5]\d):([0-5]\d)\b/g)]
  if (matches.length === 0) {
    throw new Error(`No H:MM:SS elapsed value found in page text: ${bodyText.slice(0, 500)}`)
  }
  return Math.max(
    ...matches.map((match) => Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]))
  )
}

async function postIncompleteFinish(page: Page, sessionId: string, elapsedSeconds: number) {
  const response = await page.request.post('/api/trek/actions', {
    data: {
      action: 'finish_incomplete_trek',
      sessionId,
      mountainId: HUASHAN.id,
      note: '',
      elapsedSeconds,
      distanceMeters: 0,
      ascentMeters: 0,
      testMode: true,
    },
  })
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

test('leaving an active trek auto-pauses and restoring lets the user continue', async ({ page, baseURL }) => {
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
    await expect(page.locator('body')).toContainText(/0:00:0[1-9]/, { timeout: 12_000 })

    const pauseResponsePromise = page.waitForResponse((response) => {
      if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
      return response.request().postData()?.includes('"action":"pause_trek_session"') ?? false
    })
    await page.getByRole('button', { name: '返回' }).click()
    const pauseResponse = await pauseResponsePromise
    const pauseBody = await pauseResponse.json().catch(() => ({}))
    expect(pauseResponse.status(), JSON.stringify(pauseBody)).toBe(200)
    expect(pauseBody.status).toBe('paused')
    expect(Number(pauseBody.pausedElapsedSeconds)).toBeGreaterThan(0)
    await expect(page).toHaveURL(/\/explore/, { timeout: 20_000 })

    await page.goto(`${root}/trek?mountainId=${HUASHAN.id}&testMode=1`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('trek-status-chip')).toContainText('已暂停', { timeout: 30_000 })
    await expect(page.getByRole('button', { name: '继续记录' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('body')).toContainText(/0:00:0[1-9]/, { timeout: 20_000 })
    const pausedElapsed = await readElapsedSeconds(page)
    await page.waitForTimeout(3500)
    expect(await readElapsedSeconds(page)).toBe(pausedElapsed)

    const resumeResponsePromise = page.waitForResponse((response) => {
      if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
      return response.request().postData()?.includes('"action":"resume_trek_session"') ?? false
    })
    await page.getByRole('button', { name: '继续记录' }).click()
    const resumeResponse = await resumeResponsePromise
    const resumeBody = await resumeResponse.json().catch(() => ({}))
    expect(resumeResponse.status(), JSON.stringify(resumeBody)).toBe(200)
    expect(resumeBody.status).toBe('tracking')
    await expect(page.getByTestId('trek-status-chip')).toContainText('记录中', { timeout: 20_000 })
    await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => readElapsedSeconds(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(pausedElapsed + 5)

    await captureOptionalE2EScreenshot(page, 'trek-exit-auto-pause.png')
    await expectNoRuntimeIssueBadge(page)
  } finally {
    await finishSession(page, sessionId)
  }
})

test('duplicate incomplete finish requests are idempotent and UI still navigates', async ({ page, baseURL }) => {
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
  await expect.poll(() => readElapsedSeconds(page), { timeout: 75_000 }).toBeGreaterThanOrEqual(60)
  await page.getByRole('button', { name: '暂停' }).click()
  const finishButton = page.getByRole('button', { name: '结束并保存' })
  await expect(finishButton).toBeVisible({ timeout: 10_000 })

  const elapsedAtPause = Math.max(60, await readElapsedSeconds(page))
  const firstFinish = await postIncompleteFinish(page, sessionId, elapsedAtPause)
  expect(firstFinish.response.status(), JSON.stringify(firstFinish.body)).toBe(200)
  const checkinId = String(firstFinish.body?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)

  const secondFinish = await postIncompleteFinish(page, sessionId, elapsedAtPause)
  expect(secondFinish.response.status(), JSON.stringify(secondFinish.body)).toBe(200)
  expect(secondFinish.body?.checkinId).toBe(checkinId)
  expect(secondFinish.body?.alreadyFinished).toBe(true)

  const uiFinishResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"finish_incomplete_trek"') ?? false
  })
  await finishButton.click()
  const uiFinishResponse = await uiFinishResponsePromise
  const uiFinishBody = await uiFinishResponse.json().catch(() => ({}))
  expect(uiFinishResponse.status(), JSON.stringify(uiFinishBody)).toBe(200)
  expect(uiFinishBody?.checkinId).toBe(checkinId)
  expect(uiFinishBody?.alreadyFinished).toBe(true)

  await expect(page.locator('body')).not.toContainText(/duplicate key|idx_checkins_session_id_unique_not_null|保存失败/)
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })
  await expectNoRuntimeIssueBadge(page)
})
