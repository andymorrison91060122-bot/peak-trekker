import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { dismissActivationChecklistIfPresent, registerFreshUser } from './community.helpers'
import { captureOptionalE2EScreenshot } from './trek-regression.helpers'

const fixtureDir = join(process.cwd(), 'tests/fixtures/import-dedupe')
const duplicateTrackPath = join(fixtureDir, 'duplicate-track.gpx')
const SEEDED_CHECKIN_IDS: string[] = []

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
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for import dedupe E2E tests.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function cleanupSeededCheckins() {
  if (SEEDED_CHECKIN_IDS.length === 0) return
  const ids = SEEDED_CHECKIN_IDS.splice(0, SEEDED_CHECKIN_IDS.length)
  const { error } = await getSupabaseAdminClient()
    .from('checkins')
    .delete()
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to clean up import dedupe E2E checkins: ${error.message}`)
  }
}

async function parseTrack(page: Page, root: string, filePath: string) {
  await page.goto(`${root}/import`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[aria-label="轨迹文件"]').setInputFiles(filePath)
  await expect(page.getByRole('button', { name: '开始解析' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '开始解析' }).click()
  await expect(page.getByText('解析完成')).toBeVisible({ timeout: 30_000 })
}

function waitForImportConfirm(page: Page) {
  return page.waitForResponse((response) => {
    if (!response.url().includes('/api/import/confirm') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"source":"track_import"') ?? false
  })
}

async function saveParsedTrack(page: Page) {
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.locator('body')).toContainText(/确认是这一座|选择关联的山|作为未收录山行保存/, { timeout: 20_000 })

  const matchButton = page.getByRole('button', { name: '确认是这一座' })
  if (await matchButton.isVisible().catch(() => false)) {
    const responsePromise = waitForImportConfirm(page)
    await matchButton.click()
    return responsePromise
  }

  const noMatchButton = page.getByRole('button', { name: '作为未收录山行保存' })
  if (await noMatchButton.isVisible().catch(() => false)) {
    const responsePromise = waitForImportConfirm(page)
    await noMatchButton.click()
    return responsePromise
  }

  await page.getByRole('button', { name: '保存为未关联山行' }).click()
  const responsePromise = waitForImportConfirm(page)
  await page.getByRole('button', { name: '确认选择' }).click()
  return responsePromise
}

test.afterEach(async () => {
  await cleanupSeededCheckins()
})

test('import blocks the same user from uploading identical track content twice', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await page.setViewportSize({ width: 375, height: 812 })

  await registerFreshUser(page, root, { returnTo: '/import' })
  await dismissActivationChecklistIfPresent(page)

  await parseTrack(page, root, duplicateTrackPath)
  const confirmResponse = await saveParsedTrack(page)
  const confirmBody = await confirmResponse.json().catch(() => ({}))
  expect(confirmResponse.status(), JSON.stringify(confirmBody)).toBe(200)

  const checkinId = String(confirmBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)
  SEEDED_CHECKIN_IDS.push(checkinId)
  await expect(page.getByText('已带回档案')).toBeVisible({ timeout: 20_000 })

  await parseTrack(page, root, duplicateTrackPath)
  await expect(page.getByText('这份轨迹已经上传过')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: '查看已存在活动' })).toBeVisible()
  await expect(page.getByRole('button', { name: '选择其他文件' })).toBeVisible()
  await expect(page.getByRole('button', { name: '继续' })).toHaveCount(0)
  await captureOptionalE2EScreenshot(page, 'import-dedupe-duplicate-banner.png')

  await page.getByRole('button', { name: '查看已存在活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })

  const { data, error } = await getSupabaseAdminClient()
    .from('checkins')
    .select('id, user_id, track_content_hash')
    .eq('id', checkinId)
    .single()

  expect(error).toBeNull()
  expect(data?.track_content_hash).toMatch(/^[a-f0-9]{64}$/)

  const { count, error: countError } = await getSupabaseAdminClient()
    .from('checkins')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', data?.user_id)
    .eq('track_content_hash', data?.track_content_hash)

  expect(countError).toBeNull()
  expect(count).toBe(1)
})
