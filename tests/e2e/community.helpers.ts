import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TestMountain = {
  id: string
  name: string
  latitude: number
  longitude: number
  altitude: number
}

type TrekTestTrackPoint = {
  lat: number
  lng: number
  ts: number
  altitude: number
  accuracy: number
}

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
  await page.goto(`${baseURL}/auth/register?from=${encodeURIComponent(returnTo)}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('至少6位').fill(password)
  await page.getByRole('button', { name: '下一步 →' }).click()

  await page.getByPlaceholder('你的登山代号').fill(username)
  await page.locator('select').selectOption(province)
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()

  await page.waitForLoadState('domcontentloaded')
  if (/\/auth\/register/.test(page.url())) {
    await page.waitForURL((url) => !/\/auth\/register/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
  }
  if (/\/auth\/register/.test(page.url())) {
    const loginHref =
      returnTo === '/explore'
        ? `${baseURL}/auth/login`
        : `${baseURL}/auth/login?from=${encodeURIComponent(returnTo)}`
    await page.goto(loginHref, { waitUntil: 'domcontentloaded' })
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

function getSupabaseBrowserAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? readEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY')

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

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for E2E helpers.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function offsetCoordinate(latitude: number, longitude: number, distanceMeters: number) {
  const bearingRadians = Math.PI / 4
  const northMeters = Math.cos(bearingRadians) * distanceMeters
  const eastMeters = Math.sin(bearingRadians) * distanceMeters
  const lat = latitude - northMeters / 111_320
  const lng = longitude - eastMeters / (111_320 * Math.cos((latitude * Math.PI) / 180))

  return { lat, lng }
}

export function buildTrekTestTrackPoints(
  mountain: Pick<TestMountain, 'latitude' | 'longitude' | 'altitude'>,
  {
    count = 8,
    startedAt = Date.now() - 120_000,
    offsetMeters,
  }: {
    count?: number
    startedAt?: number
    offsetMeters?: number
  } = {}
): TrekTestTrackPoint[] {
  const pointCount = Math.max(1, count)
  const stepMs = pointCount === 1 ? 0 : Math.floor(120_000 / (pointCount - 1))

  return Array.from({ length: pointCount }, (_, index) => {
    const factor = pointCount === 1 ? 0 : (pointCount - 1 - index) / (pointCount - 1)
    const distanceMeters = typeof offsetMeters === 'number'
      ? offsetMeters + factor * 80
      : factor * 120
    const position = offsetCoordinate(mountain.latitude, mountain.longitude, distanceMeters)

    return {
      lat: position.lat,
      lng: position.lng,
      ts: Math.min(startedAt + index * stepMs, Date.now()),
      altitude: Math.max(0, Math.round(mountain.altitude - 60 * factor)),
      accuracy: 5,
    }
  })
}

export async function backdateTrekSessionForTest(sessionId: string, millisecondsAgo = 120_000) {
  if (!UUID_PATTERN.test(sessionId)) {
    return
  }

  const supabase = getSupabaseAdminClient()
  const startedAt = new Date(Date.now() - millisecondsAgo).toISOString()
  const { data, error } = await supabase
    .from('trek_sessions')
    .update({ started_at: startedAt })
    .eq('id', sessionId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    throw new Error(`Failed to backdate trek session for E2E test: ${error?.message ?? 'session not found'}`)
  }
}

export async function countVerifiedCheckinsForSession(sessionId: string) {
  const supabase = getSupabaseAdminClient()
  const { count, error } = await supabase
    .from('checkins')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .not('verified_at', 'is', null)

  if (error) {
    throw new Error(`Failed to count verified checkins for E2E test: ${error.message}`)
  }

  return count ?? 0
}

export async function getCheckinPhotoUrlForTest(checkinId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('checkins')
    .select('photo_url')
    .eq('id', checkinId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load checkin photo_url for E2E test: ${error.message}`)
  }

  return typeof data?.photo_url === 'string' ? data.photo_url : null
}

export async function seedTestMountain(overrides: Partial<TestMountain> = {}) {
  const supabase = getSupabaseAdminClient()
  const unique = Date.now()
  const { data, error } = await supabase
    .from('mountains')
    .insert({
      name: overrides.name ?? `E2E Server Session 山 ${unique}`,
      altitude: overrides.altitude ?? 1888,
      province: '四川',
      province_code: 'SC',
      difficulty: 'beginner',
      min_license: 'none',
      latitude: overrides.latitude ?? 30.6502,
      longitude: overrides.longitude ?? 104.0748,
      description: 'E2E server session test mountain',
      is_active: true,
    })
    .select('id, name, latitude, longitude, altitude')
    .single()

  if (error || !data) {
    throw new Error(`Failed to seed E2E test mountain: ${error?.message ?? 'no data'}`)
  }

  return data as TestMountain
}

export async function deleteTestMountainById(mountainId: string) {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('mountains')
    .delete()
    .eq('id', mountainId)

  if (error) {
    throw new Error(`Failed to clean up E2E test mountain: ${error.message}`)
  }
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
  await page.goto(`/trek?mountainId=${mountain.id}`, { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)

  const startedAt = Date.now() - 120_000
  const trackPoints = buildTrekTestTrackPoints(mountain, { startedAt })
  const startResponse = await page.request.post('/api/trek/actions', {
    data: {
      action: 'start_trek_session',
      mountainId: mountain.id,
    },
  })
  const startBody = await startResponse.json().catch(() => ({}))
  const sessionId = typeof startBody?.sessionId === 'string' ? startBody.sessionId : ''

  if (!startResponse.ok() || !sessionId) {
    throw new Error(`Failed to start GPS check-in session: ${JSON.stringify(startBody)}`)
  }

  if (sessionId.startsWith('local-trek-session:')) {
    throw new Error(`Unexpected local trek session in server-session helper: ${sessionId}`)
  }

  for (const point of trackPoints) {
    const appendResponse = await page.request.post('/api/trek/actions', {
      data: {
        action: 'append_trek_point',
        sessionId,
        point,
      },
    })
    const appendBody = await appendResponse.json().catch(() => ({}))
    if (!appendResponse.ok() || appendBody?.ok !== true) {
      throw new Error(`Failed to append GPS check-in point: ${JSON.stringify(appendBody)}`)
    }
  }

  await backdateTrekSessionForTest(sessionId, 120_000)

  const verifyResponse = await page.request.post('/api/trek/actions', {
    data: {
      action: 'verify_summit_checkin',
      sessionId,
      mountainId: mountain.id,
      note,
      startedAt,
      trackPoints,
    },
  })
  const verifyBody = await verifyResponse.json().catch(() => ({}))

  if (!verifyResponse.ok() || !verifyBody?.checkinId) {
    throw new Error(`Failed to seed approved GPS check-in: ${JSON.stringify(verifyBody)}`)
  }

  return String(verifyBody.checkinId)
}

export async function getFirstMountain(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/explore`, { waitUntil: 'domcontentloaded' })
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
  await page.goto(`/trek?mountainId=${mountainId}`, { waitUntil: 'domcontentloaded' })
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
  await page.goto('/explore', { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  const mountainLinks = page.locator('[data-testid="explore-mountain-card"]')
  const count = await mountainLinks.count()
  const hrefs = count > 0
    ? await Promise.all(
        Array.from({ length: count }, async (_, index) => mountainLinks.nth(index).getAttribute('href'))
      )
    : await page.locator('a[href^="/explore/"], a[href^="/mountain/"]').evaluateAll((links) =>
        links
          .map((link) => link.getAttribute('href'))
          .filter((href): href is string => Boolean(href))
      )
  const seen = new Set<string>()
  const mountains = hrefs
    .map((href) => {
      const path = href?.split('?')[0] ?? ''
      const parts = path.split('/').filter(Boolean)
      const section = parts[0]
      const id = (section === 'explore' || section === 'mountain') ? parts[1]?.trim() : null
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
  await page.goto(`/trek?mountainId=${mountainId}`, { waitUntil: 'domcontentloaded' })
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

  if (!response.ok || typeof response.body?.checkinId !== 'string') {
    throw new Error(`Failed to seed historical check-in: ${JSON.stringify(response.body)}`)
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
