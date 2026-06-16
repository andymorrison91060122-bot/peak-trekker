import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { backdateTrekSessionForTest } from './community.helpers'
import {
  HUASHAN,
  appendSummitServerGpsPoints,
  captureOptionalE2EScreenshot,
  expectNoRuntimeIssueBadge,
  feedSummitGpsPoints,
  openAuthenticatedTrek,
} from './trek-regression.helpers'

type CreatedAccount = {
  email: string
  password: string
  username: string
}

const CREATED_EMAILS = new Set<string>()
const CREATED_CHECKINS = new Set<string>()
const CREATED_SESSIONS = new Set<string>()

function readEnvValue(key: string) {
  const envText = (() => {
    try {
      return readFileSync('.env.local', 'utf8')
    } catch {
      return ''
    }
  })()

  return envText.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for FU-102 E2E cleanup.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function resolveUserId(email: string) {
  const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers()
  if (error) throw new Error(`Failed to list auth users for FU-102 cleanup: ${error.message}`)
  return data.users.find((user) => user.email === email)?.id ?? null
}

async function cleanupCreatedRows() {
  const supabase = getSupabaseAdminClient()
  const userIds = new Set<string>()

  for (const email of CREATED_EMAILS) {
    const userId = await resolveUserId(email)
    if (userId) userIds.add(userId)
  }

  const checkinIds = [...CREATED_CHECKINS]
  if (checkinIds.length > 0) {
    const { error } = await supabase.from('checkins').delete().in('id', checkinIds)
    if (error) throw new Error(`Failed to clean FU-102 checkins: ${error.message}`)
  }

  const sessionIds = [...CREATED_SESSIONS]
  if (sessionIds.length > 0) {
    const { error } = await supabase.from('trek_sessions').delete().in('id', sessionIds)
    if (error) throw new Error(`Failed to clean FU-102 trek sessions: ${error.message}`)
  }

  for (const userId of userIds) {
    await supabase.from('checkins').delete().eq('user_id', userId)
    await supabase.from('trek_sessions').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) throw new Error(`Failed to clean FU-102 auth user ${userId}: ${error.message}`)
  }

  for (const email of CREATED_EMAILS) {
    const userId = await resolveUserId(email)
    if (userId) throw new Error(`FU-102 cleanup left auth user for ${email}`)
  }

  CREATED_EMAILS.clear()
  CREATED_CHECKINS.clear()
  CREATED_SESSIONS.clear()
}

async function startTrekToSummitApproach(page: Page, root: string) {
  const account = await openAuthenticatedTrek({
    page,
    root,
    initialGps: {
      latitude: HUASHAN.latitude - 0.02,
      longitude: HUASHAN.longitude - 0.02,
      altitude: 1329,
      accuracy: 5,
    },
  }) as CreatedAccount
  CREATED_EMAILS.add(account.email)

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
  const sessionId = String(startBody?.sessionId ?? '')
  expect(sessionId).toMatch(/[0-9a-f-]{36}/i)
  CREATED_SESSIONS.add(sessionId)
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })

  await feedSummitGpsPoints(page)
  await appendSummitServerGpsPoints(page, sessionId)
  await backdateTrekSessionForTest(sessionId, 120_000)
  await expect(page.getByTestId('trek-near-summit-view')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('就绪')).toBeVisible({ timeout: 20_000 })

  return { account, sessionId }
}

async function enterSummitPhoto(page: Page) {
  await page.getByTestId('trek-near-summit-cta').click()
  await expect(page.getByTestId('trek-summit-photo-view')).toBeVisible({ timeout: 10_000 })
}

async function returnFromSummitPhoto(page: Page) {
  await page.getByTestId('trek-summit-photo-view').getByRole('button', { name: '返回' }).click()
  await expect(page.getByTestId('trek-near-summit-view')).toBeVisible({ timeout: 10_000 })
}

async function confirmSummitWithoutPhoto(page: Page) {
  const verifyResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"verify_summit_checkin"') ?? false
  })
  await page.getByRole('button', { name: '确认登顶' }).click()
  const verifyResponse = await verifyResponsePromise
  const verifyBody = await verifyResponse.json().catch(() => ({}))
  expect(verifyResponse.status(), JSON.stringify(verifyBody)).toBe(200)
  const checkinId = String(verifyBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)
  CREATED_CHECKINS.add(checkinId)
  await expect(page.getByTestId('trek-summit-confirmed-view')).toBeVisible({ timeout: 20_000 })
  return checkinId
}

test.afterEach(async () => {
  await cleanupCreatedRows()
})

test('FU-102 accumulated trek pause guards are neutralized before explore exit', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await startTrekToSummitApproach(page, root)
  await enterSummitPhoto(page)
  await returnFromSummitPhoto(page)
  await enterSummitPhoto(page)
  await returnFromSummitPhoto(page)
  await enterSummitPhoto(page)
  await confirmSummitWithoutPhoto(page)

  await page.waitForTimeout(600)
  await expect(page.getByTestId('trek-summit-confirmed-view')).toBeVisible({ timeout: 10_000 })
  await captureOptionalE2EScreenshot(page, 'fu102-trek-result-survives-neutralize.png')

  await page.getByTestId('trek-summit-explore-exit').click()
  await expect(page).toHaveURL(/\/explore/, { timeout: 20_000 })
  await page.goBack()
  await expect(page).not.toHaveURL(/\/trek/, { timeout: 10_000 })
  await expectNoRuntimeIssueBadge(page)
})

test('FU-102 summit share action remains a forward replace destination', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await startTrekToSummitApproach(page, root)
  await enterSummitPhoto(page)
  const shareCheckinId = await confirmSummitWithoutPhoto(page)
  await page.getByTestId('trek-summit-primary-cta').click()
  await expect(page).toHaveURL(new RegExp(`/share\\?checkinId=${shareCheckinId}`), { timeout: 20_000 })
  await page.goBack()
  await expect(page).not.toHaveURL(/\/trek/, { timeout: 10_000 })
  await expectNoRuntimeIssueBadge(page)
})

test('FU-102 summit activity action remains a forward replace destination', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await startTrekToSummitApproach(page, root)
  await enterSummitPhoto(page)
  const activityCheckinId = await confirmSummitWithoutPhoto(page)
  await page.getByTestId('trek-summit-activity-cta').click()
  await expect(page).toHaveURL(new RegExp(`/activity/${activityCheckinId}`), { timeout: 20_000 })
  await page.goBack()
  await expect(page).not.toHaveURL(/\/trek/, { timeout: 10_000 })
  await expectNoRuntimeIssueBadge(page)
})
