import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createTestEmail, registerFreshUser } from './community.helpers'

test.setTimeout(120_000)

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
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for profile nickname edit spec.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function resolveUserIdByEmail(email: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw new Error(`Failed to list users for profile nickname test: ${error.message}`)
  const user = data.users.find((candidate) => candidate.email === email)
  if (!user) throw new Error(`Failed to resolve test user ${email}`)
  return user.id
}

async function fetchProfile(userId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, province, province_code')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`Failed to fetch test profile: ${error.message}`)
  return data
}

async function countBusinessRows(userId: string) {
  const supabase = getSupabaseAdminClient()
  const [checkins, posts, trekSessions] = await Promise.all([
    supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('trek_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])

  return {
    checkins: checkins.count ?? 0,
    posts: posts.count ?? 0,
    trek_sessions: trekSessions.count ?? 0,
  }
}

async function cleanupTestUser(page: Page, userId: string, email: string) {
  const supabase = getSupabaseAdminClient()
  await page.context().clearCookies()
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  }).catch(() => undefined)

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId)
  if (profileError) throw new Error(`Failed to delete test profile ${userId}: ${profileError.message}`)
  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) throw new Error(`Failed to delete test auth user ${userId}: ${authError.message}`)

  const { data: profileAfter, error: profileAfterError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (profileAfterError) throw new Error(`Failed to verify profile cleanup: ${profileAfterError.message}`)
  const { data: usersAfter, error: usersAfterError } = await supabase.auth.admin.listUsers()
  if (usersAfterError) throw new Error(`Failed to verify auth cleanup: ${usersAfterError.message}`)
  const authStillExists = usersAfter.users.some((user) => user.id === userId || user.email === email)
  if (profileAfter || authStillExists) {
    throw new Error(`Profile nickname test cleanup failed for ${email}`)
  }
}

test('profile nickname editor saves, persists after reload, and preserves back navigation', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const email = createTestEmail('fu90-nickname')
  const initialName = `初始山友${Date.now().toString().slice(-4)}`
  const nextName = `山友新名${Date.now().toString().slice(-4)}`
  let userId: string | null = null

  try {
    await registerFreshUser(page, root, {
      returnTo: '/profile',
      email,
      username: initialName,
      province: '浙江',
    })
    userId = await resolveUserIdByEmail(email)
    await expect(page.getByTestId('profile-nickname-value')).toHaveText(initialName)

    await page.goto(`${root}/explore`, { waitUntil: 'domcontentloaded' })
    await page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })

    await page.getByTestId('profile-nickname-edit-trigger').click()
    await expect(page.getByTestId('profile-nickname-sheet')).toBeVisible()
    await expect(page.getByTestId('profile-nickname-save')).toBeDisabled()

    await page.getByTestId('profile-nickname-input').fill('山')
    await expect(page.getByTestId('profile-nickname-helper')).toContainText('昵称至少 2 个字')
    await expect(page.getByTestId('profile-nickname-save')).toBeDisabled()

    await page.getByTestId('profile-nickname-input').fill('一二三四五六七八九十甲乙丙')
    await expect(page.getByTestId('profile-nickname-input')).toHaveValue('一二三四五六七八九十甲乙')
    await expect(page.getByTestId('profile-nickname-helper')).toContainText('已达 12 字上限')

    await page.goBack()
    await expect(page).toHaveURL(/\/profile/)
    await expect(page.getByTestId('profile-nickname-sheet')).toHaveCount(0)

    await page.goBack()
    await expect(page).toHaveURL(/\/explore/)

    await page.goto(`${root}/profile`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('profile-nickname-edit-trigger').click()
    await page.getByTestId('profile-nickname-input').fill(nextName)
    await expect(page.getByTestId('profile-nickname-save')).toBeEnabled()
    await page.getByTestId('profile-nickname-save').click()

    await expect(page.getByTestId('profile-nickname-sheet')).toHaveCount(0)
    await expect(page.getByTestId('profile-nickname-value')).toHaveText(nextName)
    await expect(page.getByTestId('profile-nickname-updated-badge')).toContainText('已更新')

    const profileAfterSave = await fetchProfile(userId)
    expect(profileAfterSave?.username).toBe(nextName)
    expect(profileAfterSave?.province).toBe('浙江')
    expect(profileAfterSave?.province_code).toBe('ZJ')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('profile-nickname-value')).toHaveText(nextName)

    const businessRows = await countBusinessRows(userId)
    expect(businessRows).toEqual({ checkins: 0, posts: 0, trek_sessions: 0 })
  } finally {
    if (userId) {
      const beforeCleanup = await countBusinessRows(userId)
      expect(beforeCleanup).toEqual({ checkins: 0, posts: 0, trek_sessions: 0 })
      await cleanupTestUser(page, userId, email)
      const afterCleanup = await countBusinessRows(userId)
      expect(afterCleanup).toEqual({ checkins: 0, posts: 0, trek_sessions: 0 })
    }
  }
})
