import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

export function createTestEmail(prefix = 'qa-community') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

export function createPngDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wm0WZ0AAAAASUVORK5CYII='
}

export function createTinyPngBuffer() {
  return Buffer.from(createPngDataUrl().replace(/^data:image\/png;base64,/, ''), 'base64')
}

export async function createSolidColorPngBuffer({
  width = 240,
  height = 360,
  red,
  green,
  blue,
  alpha = 1,
}: {
  width?: number
  height?: number
  red: number
  green: number
  blue: number
  alpha?: number
}) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: red,
        g: green,
        b: blue,
        alpha,
      },
    },
  })
    .png()
    .toBuffer()
}

export async function registerFreshUser(
  page: Page,
  baseURL: string,
  {
    returnTo = '/profile',
    email = createTestEmail(),
    password = 'PeakTrekker123!',
    username = `qa-${Date.now()}`,
    province = '四川',
  }: {
    returnTo?: string
    email?: string
    password?: string
    username?: string
    province?: string
  } = {}
) {
  await page.goto(`${baseURL}/auth/register?from=${encodeURIComponent(returnTo)}`)
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('至少6位').fill(password)
  await page.getByRole('button', { name: '下一步 →' }).click()

  await page.getByPlaceholder('你的登山代号').fill(username)
  await page.locator('select').selectOption(province)
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()

  await page.waitForLoadState('networkidle')
  if (/\/auth\/register/.test(page.url())) {
    await page.waitForURL((url) => !/\/auth\/register/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
  }
  if (/\/auth\/register/.test(page.url())) {
    const loginHref =
      returnTo === '/explore'
        ? `${baseURL}/auth/login`
        : `${baseURL}/auth/login?from=${encodeURIComponent(returnTo)}`
    await page.goto(loginHref)
  }
  if (/\/auth\/login/.test(page.url())) {
    await page.getByPlaceholder('your@email.com').fill(email)
    await page.getByPlaceholder('••••••••').fill(password)
    await page.getByRole('button', { name: '▶ 开始登山' }).click()
  }

  await expect(page).toHaveURL(new RegExp(returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 60_000 })
  return { email, password, username }
}

export async function dismissActivationChecklistIfPresent(page: Page) {
  const dismissButton = page.getByRole('button', { name: '先自己逛逛' })
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click()
    await expect(dismissButton).not.toBeVisible({ timeout: 10000 })
  }
}

function getSupabaseBrowserAnonClient() {
  const envText = (() => {
    try {
      return readFileSync('.env.local', 'utf8')
    } catch {
      return ''
    }
  })()
  const envUrl = envText.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
  const envAnonKey = envText.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envUrl
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? envAnonKey

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for E2E helpers.')
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function promoteUserToAdmin({
  email,
  password,
}: {
  email: string
  password: string
}) {
  const supabase = getSupabaseBrowserAnonClient()
  const signIn = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signIn.error || !signIn.data.user) {
    throw new Error(`Failed to sign in test admin user: ${signIn.error?.message ?? 'unknown error'}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_admin: true })
    .eq('id', signIn.data.user.id)

  if (error) {
    throw new Error(`Failed to promote test user to admin: ${error.message}`)
  }
}

export async function fetchMostPopularMountain() {
  const supabase = getSupabaseBrowserAnonClient()
  const { data, error } = await supabase
    .from('mountains')
    .select('id, name, latitude, longitude, altitude')
    .eq('is_active', true)
    .order('checkin_count', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(`Failed to load a mountain for E2E tests: ${error?.message ?? 'no data'}`)
  }

  return data as {
    id: string
    name: string
    latitude: number
    longitude: number
    altitude: number
  }
}

export async function createGpsCheckinViaApi(
  page: Page,
  mountain: {
    id: string
    name: string
    latitude: number
    longitude: number
    altitude: number
  },
  note: string
) {
  await page.goto(`/trek?mountainId=${mountain.id}`)
  await dismissActivationChecklistIfPresent(page)

  const now = Date.now()
  const response = await page.evaluate(
    async ({ currentMountain, currentNote, currentStartedAt, currentNow }) => {
      const trackPoints = Array.from({ length: 8 }, (_, index) => {
        const factor = (7 - index) / 7
        return {
          lat: currentMountain.latitude - 0.001 * factor,
          lng: currentMountain.longitude - 0.001 * factor,
          ts: Math.min(currentStartedAt + index * 15_000, currentNow),
          altitude: Math.max(0, currentMountain.altitude - Math.round(56 * factor)),
          accuracy: 5,
        }
      })

      const res = await fetch('/api/trek/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_summit_checkin',
          sessionId: `local-trek-session:${crypto.randomUUID()}`,
          mountainId: currentMountain.id,
          note: currentNote,
          startedAt: currentStartedAt,
          trackPoints,
        }),
      })

      return {
        ok: res.ok,
        status: res.status,
        body: await res.json().catch(() => ({})),
      }
    },
    {
      currentMountain: mountain,
      currentNote: note,
      currentStartedAt: now - 120_000,
      currentNow: now,
    }
  )

  if (!response.ok || !response.body?.checkinId) {
    throw new Error(`Failed to seed approved GPS check-in: ${JSON.stringify(response.body)}`)
  }

  return String(response.body.checkinId)
}

export async function getFirstMountain(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/explore`)
  await dismissActivationChecklistIfPresent(page)
  const firstMountainLink = page.locator('a[href^="/explore/"]').first()
  await expect(firstMountainLink).toBeVisible()
  const href = await firstMountainLink.getAttribute('href')

  if (!href) {
    throw new Error('Expected at least one mountain detail link on the explore page.')
  }

  const mountainId = href.split('/').pop()
  if (!mountainId) {
    throw new Error(`Could not parse mountain id from href: ${href}`)
  }

  return { href, mountainId }
}

export async function fetchMountainByIdViaApi(page: Page, mountainId: string) {
  await page.goto(`/trek?mountainId=${mountainId}`)
  await dismissActivationChecklistIfPresent(page)

  const mountain = await page.evaluate(async (targetMountainId) => {
    const response = await fetch('/api/trek/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_active_mountains' }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(payload?.mountains)) {
      throw new Error(String(payload?.error ?? 'Failed to load mountains for test.'))
    }

    const match = payload.mountains.find((item: { id: string }) => item.id === targetMountainId)
    if (!match) {
      throw new Error(`Could not find target mountain ${targetMountainId} for test.`)
    }

    return match as {
      id: string
      name: string
      latitude: number
      longitude: number
      altitude: number
    }
  }, mountainId)

  return mountain
}

export async function listActiveMountainsViaApi(page: Page) {
  await page.goto('/explore')
  await dismissActivationChecklistIfPresent(page)
  const mountainLinks = page.locator('a[href^="/explore/"]')
  const count = await mountainLinks.count()
  const hrefs = await Promise.all(
    Array.from({ length: count }, async (_, index) => mountainLinks.nth(index).getAttribute('href'))
  )
  const seen = new Set<string>()
  const mountains = hrefs
    .map((href) => {
      const id = href?.split('/').pop()?.trim()
      return id ? { id } : null
    })
    .filter((item): item is { id: string } => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })

  if (mountains.length === 0) {
    throw new Error('Failed to load mountains for E2E tests: no explore detail links found.')
  }

  return mountains as Array<{
    id: string
    name?: string
    latitude?: number
    longitude?: number
    altitude?: number
    province?: string
  }>
}

export async function createHistoricalCheckinViaApi(page: Page, mountainId: string, note: string) {
  await page.goto(`/trek?mountainId=${mountainId}`)
  await dismissActivationChecklistIfPresent(page)

  const response = await page.evaluate(
    async ({ currentMountainId, currentNote, photoUrl }) => {
      const res = await fetch('/api/trek/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_historical_checkin',
          mountainId: currentMountainId,
          photoUrl,
          note: currentNote,
          qaForceApproved: true,
        }),
      })

      return {
        ok: res.ok,
        status: res.status,
        body: await res.json().catch(() => ({})),
      }
    },
    { currentMountainId: mountainId, currentNote: note, photoUrl: createPngDataUrl() }
  )

  if (!response.ok || response.body?.status !== 'approved') {
    throw new Error(`Failed to seed approved historical check-in: ${JSON.stringify(response.body)}`)
  }

  return String(response.body.checkinId)
}

export async function createPublishedCommunityPostViaApi(
  page: Page,
  {
    mountainId,
    title,
    body,
    tags = [],
  }: {
    mountainId: string
    title: string
    body: string
    tags?: string[]
  }
) {
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, `featured-post-${Date.now()}`)
  const pngDataUrl = createPngDataUrl()
  const assets = [
    {
      id: `featured-asset-${Date.now()}`,
      checkin_id: checkinId,
      type: 'image',
      url: pngDataUrl,
      thumbnail_url: pngDataUrl,
      created_at: new Date().toISOString(),
      sort_order: 0,
      source: 'record',
    },
  ]

  const response = await page.request.post('/api/community/actions', {
    data: {
      action: 'create_or_update_post',
      checkinId,
      title,
      body,
      visibility: 'public',
      tags,
      assets,
      coverAssetId: assets[0].id,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || typeof payload?.postId !== 'string') {
    throw new Error(`Failed to seed published community post: ${JSON.stringify(payload)}`)
  }

  return {
    checkinId,
    postId: String(payload.postId),
    detailUrl: String(payload.detailUrl ?? `/community/${payload.postId}`),
  }
}

export async function createPendingHistoricalCheckinViaApi(page: Page, mountainId: string, note: string) {
  await page.goto(`/trek?mountainId=${mountainId}`)
  await dismissActivationChecklistIfPresent(page)

  const response = await page.evaluate(
    async ({ currentMountainId, currentNote, photoUrl }) => {
      const res = await fetch('/api/trek/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_historical_checkin',
          mountainId: currentMountainId,
          photoUrl,
          note: currentNote,
        }),
      })

      return {
        ok: res.ok,
        status: res.status,
        body: await res.json().catch(() => ({})),
      }
    },
    { currentMountainId: mountainId, currentNote: note, photoUrl: createPngDataUrl() }
  )

  if (!response.ok || response.body?.status !== 'pending') {
    throw new Error(`Failed to seed pending historical check-in: ${JSON.stringify(response.body)}`)
  }

  return String(response.body.checkinId)
}

export async function createRejectedHistoricalCheckinViaApi(
  page: Page,
  mountainId: string,
  note: string,
  reviewNote = '照片不清晰，未能识别峰顶环境。'
) {
  const response = await page.evaluate(
    async ({ currentMountainId, currentNote, currentReviewNote, photoUrl }) => {
      const res = await fetch('/api/trek/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_historical_checkin',
          mountainId: currentMountainId,
          photoUrl,
          note: currentNote,
          qaForceRejected: true,
          qaReviewNote: currentReviewNote,
        }),
      })

      return {
        ok: res.ok,
        status: res.status,
        body: await res.json().catch(() => ({})),
      }
    },
    {
      currentMountainId: mountainId,
      currentNote: note,
      currentReviewNote: reviewNote,
      photoUrl: createPngDataUrl(),
    }
  )

  if (!response.ok || response.body?.status !== 'rejected') {
    throw new Error(`Failed to seed rejected historical check-in: ${JSON.stringify(response.body)}`)
  }

  return {
    checkinId: String(response.body.checkinId),
    reviewNote,
  }
}
