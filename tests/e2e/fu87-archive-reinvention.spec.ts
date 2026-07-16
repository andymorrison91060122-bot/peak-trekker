import { expect, test, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createTestEmail, fetchMostPopularMountain, registerFreshUser } from './community.helpers'

const OUTPUT_DIR = join(process.cwd(), 'output/fu87-archive-acceptance')
const VIDEO_DIR = join(OUTPUT_DIR, 'videos')
const NORMAL_VIDEO = join(OUTPUT_DIR, 'fu87-archive-normal-375.webm')
const EMPTY_VIDEO = join(OUTPUT_DIR, 'fu87-archive-empty-375.webm')

type ConsoleEntry = {
  type: string
  text: string
  location: ReturnType<ConsoleMessage['location']>
  classification: 'new-this-round' | 'pre-existing' | 'environment'
}

type SeedRow = {
  id: string
  user_id: string
  mountain_id: string | null
  type: 'gps' | 'photo'
  source: 'track_import' | 'historical_photo' | 'screenshot_recognition'
  photo_url: string | null
  verified_at: string | null
  start_time: string
  note: string | null
  created_at: string
  completion_status: 'complete'
  max_elevation_meters: number | null
  elevation_gain_meters: number | null
  distance_meters: number | null
  duration_seconds: number | null
  track_name: string
}

function readEnvValue(key: string) {
  if (process.env[key]) return process.env[key] ?? null
  const text = (() => {
    try {
      return readFileSync('.env.local', 'utf8')
    } catch {
      return ''
    }
  })()
  return text.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
}

function getSupabaseAdminClient() {
  const url = readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase evidence credentials for FU-87.')
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function retryEvidenceOperation<T>(
  label: string,
  operation: () => PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  let lastError: { message: string } | null = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await operation()
    lastError = result.error
    if (!lastError) return result.data
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
  throw new Error(`FU-87 ${label} failed after retries: ${lastError?.message ?? 'unknown error'}`)
}

function classifyMessage(text: string): ConsoleEntry['classification'] {
  if (/analytics|favicon|Failed to load resource|net::ERR|401|403|404/i.test(text)) return 'environment'
  if (/recognitionFailureResponse|requestSource|TrackPoint|feedbackTimersRef|ButtonPrimitive/i.test(text)) return 'pre-existing'
  return 'new-this-round'
}

async function installEvidenceProbe(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    const state = window as unknown as {
      __fu87Frames: number[]
      __fu87LongTasks: Array<{ name: string; startTime: number; duration: number }>
      __fu87LayoutShift: number
    }
    state.__fu87Frames = []
    state.__fu87LongTasks = []
    state.__fu87LayoutShift = 0
    let previous = 0
    const sample = (now: number) => {
      if (previous) state.__fu87Frames.push(now - previous)
      previous = now
      window.requestAnimationFrame(sample)
    }
    window.requestAnimationFrame(sample)
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.__fu87LongTasks.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration })
        }
      }).observe({ type: 'longtask', buffered: true })
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) state.__fu87LayoutShift += entry.value ?? 0
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {
      // Older engines can omit one of these observer entry types.
    }
  })
}

async function attachCapture(page: Page, consoleEntries: ConsoleEntry[], pageErrors: string[]) {
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
      classification: classifyMessage(message.text()),
    })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
}

async function resolveUserId(email: string) {
  const supabase = getSupabaseAdminClient()
  const data = await retryEvidenceOperation('user lookup', () => supabase.auth.admin.listUsers())
  const user = data.users.find((candidate) => candidate.email === email)
  if (!user) throw new Error(`FU-87 user not found: ${email}`)
  return user.id
}

async function markOnboarded(userId: string) {
  const supabase = getSupabaseAdminClient()
  await retryEvidenceOperation('onboarding update', () => supabase.from('profiles').update({
      onboarding_version: '2026-v2',
      onboarding_completed_at: '2026-07-16T00:00:00.000Z',
    }).eq('id', userId),
  )
}

async function seedArchiveRows(userId: string, mountain: Awaited<ReturnType<typeof fetchMostPopularMountain>>) {
  const photo = '/images/default-mountain-cover.png'
  const rows: SeedRow[] = [
    {
      id: randomUUID(), user_id: userId, mountain_id: mountain.id, type: 'gps', source: 'track_import',
      photo_url: photo, verified_at: null, start_time: '2026-05-18T06:00:00.000Z',
      note: '风从垭口吹过，回头还能看见来路。', created_at: '2026-05-20T06:00:00.000Z',
      completion_status: 'complete', max_elevation_meters: 6200, elevation_gain_meters: 1380,
      distance_meters: 12600, duration_seconds: 21840, track_name: 'FU87 实测最高处',
    },
    {
      id: randomUUID(), user_id: userId, mountain_id: mountain.id, type: 'photo', source: 'historical_photo',
      photo_url: null, verified_at: '2025-12-12T09:00:00.000Z', start_time: '2025-12-12T05:30:00.000Z',
      note: null, created_at: '2025-12-20T03:00:00.000Z', completion_status: 'complete',
      max_elevation_meters: null, elevation_gain_meters: null, distance_meters: null, duration_seconds: null,
      track_name: 'FU87 登顶资料海拔兜底',
    },
    {
      id: randomUUID(), user_id: userId, mountain_id: mountain.id, type: 'photo', source: 'historical_photo',
      photo_url: null, verified_at: null, start_time: '2025-09-03T06:00:00.000Z', note: '天气转坏，在安全的位置折返。',
      created_at: '2025-09-10T03:00:00.000Z', completion_status: 'complete', max_elevation_meters: null,
      elevation_gain_meters: null, distance_meters: null, duration_seconds: null, track_name: 'FU87 未登顶无实测',
    },
    {
      id: randomUUID(), user_id: userId, mountain_id: mountain.id, type: 'gps', source: 'track_import',
      photo_url: null, verified_at: null, start_time: '2025-05-02T06:00:00.000Z', note: null,
      created_at: '2025-05-04T03:00:00.000Z', completion_status: 'complete', max_elevation_meters: 3200,
      elevation_gain_meters: 820, distance_meters: 9400, duration_seconds: 17400, track_name: 'FU87 春季山行',
    },
    {
      id: randomUUID(), user_id: userId, mountain_id: mountain.id, type: 'gps', source: 'track_import',
      photo_url: null, verified_at: null, start_time: '2025-01-05T06:00:00.000Z', note: null,
      created_at: '2025-01-08T03:00:00.000Z', completion_status: 'complete', max_elevation_meters: 2700,
      elevation_gain_meters: 610, distance_meters: 7600, duration_seconds: 13920, track_name: 'FU87 冬季山行',
    },
    {
      id: randomUUID(), user_id: userId, mountain_id: mountain.id, type: 'gps', source: 'track_import',
      photo_url: null, verified_at: null, start_time: '2024-06-17T06:00:00.000Z', note: null,
      created_at: '2024-06-19T03:00:00.000Z', completion_status: 'complete', max_elevation_meters: 2400,
      elevation_gain_meters: 540, distance_meters: 6500, duration_seconds: 11880, track_name: 'FU87 旧年山行',
    },
    {
      id: randomUUID(), user_id: userId, mountain_id: mountain.id, type: 'gps', source: 'track_import',
      photo_url: null, verified_at: null, start_time: '2022-03-09T06:00:00.000Z', note: '真实山行发生在 2022 年。',
      created_at: '2026-07-15T03:00:00.000Z', completion_status: 'complete', max_elevation_meters: 2100,
      elevation_gain_meters: 460, distance_meters: 5200, duration_seconds: 9720, track_name: 'FU87 跨年导入记录',
    },
  ]
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase.from('checkins').insert(rows)
  if (error) throw new Error(`FU-87 checkin seed failed: ${error.message}`)
  return {
    ids: rows.map((row) => row.id),
    measuredHighestId: rows[0].id,
    summitFallbackId: rows[1].id,
    noMeasuredId: rows[2].id,
    crossYearId: rows[6].id,
  }
}

async function seedUnmatchedScreenshotWithoutAltitude(userId: string) {
  const row: SeedRow = {
    id: randomUUID(),
    user_id: userId,
    mountain_id: null,
    type: 'photo',
    source: 'screenshot_recognition',
    photo_url: null,
    verified_at: null,
    start_time: '2026-07-17T06:00:00.000Z',
    note: null,
    created_at: '2026-07-17T06:02:00.000Z',
    completion_status: 'complete',
    max_elevation_meters: null,
    elevation_gain_meters: null,
    distance_meters: 10340,
    duration_seconds: null,
    track_name: '<![CDATA[20260717_060000 其它]]>',
  }
  const supabase = getSupabaseAdminClient()
  await retryEvidenceOperation('screenshot checkin seed', () => supabase.from('checkins').insert(row))
  return row
}

async function cleanupSeed(userId: string, checkinIds: string[]) {
  const supabase = getSupabaseAdminClient()
  if (checkinIds.length) {
    const { error } = await supabase.from('checkins').delete().in('id', checkinIds)
    if (error) throw new Error(`FU-87 checkin cleanup failed: ${error.message}`)
    const { data, error: verifyError } = await supabase.from('checkins').select('id').in('id', checkinIds)
    if (verifyError) throw new Error(`FU-87 cleanup verification failed: ${verifyError.message}`)
    if ((data ?? []).length) throw new Error(`FU-87 cleanup left ${(data ?? []).length} checkins behind.`)
  }
  let deleteUserError: { message: string } | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase.auth.admin.deleteUser(userId)
    deleteUserError = result.error
    if (!deleteUserError) return
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
  throw new Error(`FU-87 auth cleanup failed after retries: ${deleteUserError?.message ?? 'unknown error'}`)
}

async function getTerminalResidue(page: Page) {
  return page.locator('[data-archive-trip-card], [data-archive-motion="filter-empty"], [data-archive-year-toggle]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node)
      return {
        selector: node.getAttribute('data-archive-trip-card') ?? node.getAttribute('data-archive-year-toggle') ?? 'filter-empty',
        opacity: Number(style.opacity),
        visibility: style.visibility,
        transform: style.transform,
        stuck: style.visibility === 'hidden' || Number(style.opacity) < 0.99,
      }
    }),
  )
}

async function captureRimTrace(page: Page, checkinId: string, pressedScreenshot?: string) {
  const shell = page.locator(`[data-archive-trip-card="${checkinId}"]`)
  const surface = shell.locator(`[data-archive-trip-surface="${checkinId}"]`)
  const rim = surface.locator('[data-archive-rim]')
  await surface.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.waitForTimeout(120)
  const before = await surface.evaluate((node) => ({ transform: getComputedStyle(node).transform }))
  const box = await surface.boundingBox()
  if (!box) throw new Error(`Missing FU-87 surface bbox for ${checkinId}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(360)
  const pressed = await surface.evaluate((node) => ({ transform: getComputedStyle(node).transform }))
  const pressedRim = await rim.evaluate((node) => ({ opacity: Number(getComputedStyle(node).opacity), transform: getComputedStyle(node).transform }))
  if (pressedScreenshot) await page.screenshot({ path: join(OUTPUT_DIR, pressedScreenshot) })
  await page.mouse.move(2, 2)
  await page.mouse.up()
  await page.waitForTimeout(460)
  const released = await surface.evaluate((node) => ({ transform: getComputedStyle(node).transform }))
  const releasedRim = await rim.evaluate((node) => ({ opacity: Number(getComputedStyle(node).opacity), transform: getComputedStyle(node).transform }))
  return { checkinId, before, pressed, pressedRim, released, releasedRim }
}

async function sampleNodeSweep(page: Page) {
  const trace: Array<{ scrollY: number; litCount: number; haloMaxOpacity: number }> = []
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  for (let index = 0; index < 18; index += 1) {
    await page.evaluate(() => window.scrollBy({ top: 90, behavior: 'instant' }))
    await page.waitForTimeout(35)
    trace.push(await page.evaluate(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>('[data-archive-node]')]
      const halos = [...document.querySelectorAll<HTMLElement>('[data-archive-node-halo]')]
      return {
        scrollY: window.scrollY,
        litCount: nodes.filter((node) => node.classList.contains('archive-timeline__node--lit')).length,
        haloMaxOpacity: Math.max(0, ...halos.map((halo) => Number(getComputedStyle(halo).opacity))),
      }
    }))
  }
  return trace
}

async function getTerminalMatrix(page: Page) {
  return page.evaluate(() => {
    const style = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector)
      if (!node) return null
      const computed = getComputedStyle(node)
      return { opacity: Number(computed.opacity), visibility: computed.visibility, transform: computed.transform }
    }
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-archive-node]')]
    const rimOpacities = [...document.querySelectorAll<HTMLElement>('[data-archive-rim]')].map((node) => Number(getComputedStyle(node).opacity))
    const haloOpacities = [...document.querySelectorAll<HTMLElement>('[data-archive-node-halo]')].map((node) => Number(getComputedStyle(node).opacity))
    const base = document.querySelector<SVGPathElement>('[data-archive-timeline-base]')
    const progress = document.querySelector<SVGPathElement>('[data-archive-timeline-progress]')
    return {
      shell: style('[data-archive-trip-card]'),
      surface: style('[data-archive-trip-surface]'),
      identity: style('[data-archive-motion="identity"]'),
      emptyState: style('[data-archive-motion="empty-state"]'),
      emptyCopy: style('[data-archive-motion="empty-copy"]'),
      emptyAction: style('[data-archive-empty-cta]'),
      allNodesLit: nodes.every((node) => node.classList.contains('archive-timeline__node--lit')),
      rimMaxOpacity: Math.max(0, ...rimOpacities),
      haloMaxOpacity: Math.max(0, ...haloOpacities),
      baseDashOffset: base ? Number(getComputedStyle(base).strokeDashoffset.replace('px', '')) : null,
      progressDashOffset: progress ? Number(getComputedStyle(progress).strokeDashoffset.replace('px', '')) : null,
    }
  })
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio))]
}

test('FU-87 unmatched screenshot record keeps unknown archive altitude exact', async ({ browser, baseURL }) => {
  test.setTimeout(120_000)
  if (!baseURL) throw new Error('FU-87 requires a production baseURL.')
  await mkdir(OUTPUT_DIR, { recursive: true })
  const email = createTestEmail('fu87-screenshot-altitude')
  const password = 'PeakTrekker123!'
  const username = `fu87-shot-${Date.now()}`
  let userId = ''
  let checkinId = ''
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'no-preference',
  })
  await installEvidenceProbe(context)
  const page = await context.newPage()
  await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))

  try {
    await registerFreshUser(page, baseURL, { returnTo: '/archive', email, password, username, province: '陕西' })
    userId = await resolveUserId(email)
    await markOnboarded(userId)
    const row = await seedUnmatchedScreenshotWithoutAltitude(userId)
    checkinId = row.id
    await page.reload({ waitUntil: 'domcontentloaded' })

    const card = page.locator(`[data-archive-trip-card="${checkinId}"]`)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.getByTestId('archive-trip-title')).toHaveText('未关联山行')
    await expect(card.getByTestId('archive-trip-unmatched-tag')).toHaveText('未关联')
    await expect(card.getByTestId('archive-trip-max-altitude-value')).toHaveText('--')
    await expect(page.getByTestId('archive-summary-max-altitude-value')).toHaveText('--')
    await expect(page.locator('[data-archive-trip-card]')).toHaveCount(1)

    const { data, error } = await getSupabaseAdminClient()
      .from('checkins')
      .select('id,source,mountain_id,max_elevation_meters')
      .eq('id', checkinId)
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({
      id: checkinId,
      source: 'screenshot_recognition',
      mountain_id: null,
      max_elevation_meters: null,
    })
    await page.waitForTimeout(900)
    const screenshot = join(OUTPUT_DIR, 'archive-screenshot-recognition-unmatched-altitude-375x812.png')
    await page.screenshot({ path: screenshot })
    await writeFile(join(OUTPUT_DIR, 'archive-screenshot-recognition-unmatched-altitude.json'), JSON.stringify({
      evidenceKind: 'controlled-authenticated-local-production-build',
      controlledBoundary: 'One exact-id screenshot_recognition checkin is inserted and deleted for this focused FU-87 assertion.',
      checkinId,
      source: data?.source,
      mountainId: data?.mountain_id,
      measuredAltitude: data?.max_elevation_meters,
      cardAltitude: '--',
      summaryAltitude: '--',
      screenshot,
    }, null, 2))
  } finally {
    if (userId) await cleanupSeed(userId, checkinId ? [checkinId] : [])
    await context.close().catch(() => {})
  }
})

test('FU-87 archive reinvention production evidence', async ({ browser, baseURL }) => {
  test.setTimeout(300_000)
  if (!baseURL) throw new Error('FU-87 requires a production baseURL.')
  await mkdir(VIDEO_DIR, { recursive: true })

  const email = createTestEmail('fu87-archive')
  const password = 'PeakTrekker123!'
  const username = `fu87-${Date.now()}`
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: string[] = []
  let userId = ''
  let checkinIds: string[] = []

  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'no-preference',
    recordVideo: { dir: VIDEO_DIR, size: { width: 375, height: 812 } },
  })
  await installEvidenceProbe(context)
  const page = await context.newPage()
  await attachCapture(page, consoleEntries, pageErrors)

  try {
    await registerFreshUser(page, baseURL, { returnTo: '/archive', email, password, username, province: '陕西' })
    userId = await resolveUserId(email)
    await markOnboarded(userId)

    await expect(page.getByText('档案还没有一次山行')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(850)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-true-empty-375.png'), fullPage: true })

    const emptyEvidencePage = await context.newPage()
    await attachCapture(emptyEvidencePage, consoleEntries, pageErrors)
    await emptyEvidencePage.goto('/archive', { waitUntil: 'domcontentloaded' })
    await expect(emptyEvidencePage.getByText('档案还没有一次山行')).toBeVisible({ timeout: 20_000 })
    await emptyEvidencePage.waitForTimeout(850)
    const emptyFind = emptyEvidencePage.locator('[data-archive-empty-cta="find-mountain"]')
    const emptyFindButton = emptyFind.getByRole('button', { name: '去找一座山' })
    const emptyFindBox = await emptyFindButton.boundingBox()
    if (!emptyFindBox) throw new Error('Missing true-empty find CTA bbox.')
    await emptyEvidencePage.mouse.move(emptyFindBox.x + emptyFindBox.width / 2, emptyFindBox.y + emptyFindBox.height / 2)
    await emptyEvidencePage.mouse.down()
    await emptyEvidencePage.waitForTimeout(360)
    const emptyPointerPress = await emptyFind.locator('[data-archive-rim]').evaluate((node) => Number(getComputedStyle(node).opacity))
    await emptyEvidencePage.screenshot({ path: join(OUTPUT_DIR, 'archive-empty-pointer-rim-375x812.png') })
    await emptyEvidencePage.mouse.move(2, 2)
    await emptyEvidencePage.mouse.up()
    await emptyFindButton.click()
    await emptyEvidencePage.waitForURL(/\/explore$/, { timeout: 30_000 })
    await emptyEvidencePage.goBack({ waitUntil: 'domcontentloaded' })
    await expect(emptyEvidencePage.getByText('档案还没有一次山行')).toBeVisible({ timeout: 20_000 })
    await emptyEvidencePage.waitForTimeout(900)
    const emptyBringBack = emptyEvidencePage.locator('[data-archive-empty-cta="bring-back"]')
    const emptyBringBackButton = emptyBringBack.getByRole('button', { name: '把以前的山行带回来' })
    await emptyBringBackButton.focus()
    await emptyEvidencePage.keyboard.down('Space')
    await emptyEvidencePage.waitForTimeout(360)
    const emptyKeyboardPress = await emptyBringBack.locator('[data-archive-rim]').evaluate((node) => Number(getComputedStyle(node).opacity))
    await emptyEvidencePage.screenshot({ path: join(OUTPUT_DIR, 'archive-empty-keyboard-rim-375x812.png') })
    await emptyEvidencePage.keyboard.up('Space')
    await emptyEvidencePage.waitForURL(/\/explore$/, { timeout: 30_000 })
    const emptyVideo = emptyEvidencePage.video()
    await emptyEvidencePage.close()
    if (emptyVideo) await copyFile(await emptyVideo.path(), EMPTY_VIDEO)
    expect(emptyPointerPress).toBeGreaterThan(0.8)
    expect(emptyKeyboardPress).toBeGreaterThan(0.8)

    const authStorage = await context.storageState()
    const reducedEmptyContext = await browser.newContext({
      baseURL,
      viewport: { width: 375, height: 812 },
      reducedMotion: 'reduce',
      storageState: authStorage,
    })
    const reducedEmptyPage = await reducedEmptyContext.newPage()
    await reducedEmptyPage.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
    await reducedEmptyPage.goto('/archive', { waitUntil: 'domcontentloaded' })
    await expect(reducedEmptyPage.getByText('档案还没有一次山行')).toBeVisible({ timeout: 20_000 })
    await expect(reducedEmptyPage.locator('header')).toBeVisible()
    await expect(reducedEmptyPage.locator('nav.fixed')).toBeVisible()
    for (const selector of [
      '[data-archive-motion="identity"]',
      '[data-archive-motion="empty-state"]',
      '[data-archive-motion="empty-copy"]',
      '[data-archive-empty-cta]',
    ]) {
      await expect(reducedEmptyPage.locator(selector).first()).toHaveCSS('opacity', '1')
      await expect(reducedEmptyPage.locator(selector).first()).toHaveCSS('transform', 'none')
    }
    const reducedEmptyTerminal = await getTerminalMatrix(reducedEmptyPage)
    await reducedEmptyPage.screenshot({ path: join(OUTPUT_DIR, 'archive-true-empty-reduced-375x812.png') })
    await reducedEmptyContext.close()
    expect(reducedEmptyTerminal.rimMaxOpacity).toBe(0)

    const mountain = await fetchMostPopularMountain()
    const seeded = await seedArchiveRows(userId, mountain)
    checkinIds = seeded.ids
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-archive-trip-card]').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(900)

    await expect(page.getByTestId('archive-summary-max-altitude-value')).toHaveText('6,200')
    await expect(page.locator('.archive-hero__peak-source')).toContainText(mountain.name)
    await expect(page.locator('.archive-hero__peak-source')).toContainText('2026·05')
    await expect(page.locator(`[data-archive-trip-card="${seeded.noMeasuredId}"]`).getByTestId('archive-trip-max-altitude-value')).toHaveText('--')
    await expect(page.locator(`[data-archive-trip-card="${seeded.noMeasuredId}"]`).getByTestId('archive-trip-media')).toHaveCount(0)
    await expect(page.locator(`[data-archive-trip-card="${seeded.measuredHighestId}"]`).getByTestId('archive-trip-media')).toHaveCount(1)
    await expect(page.locator(`[data-archive-trip-card="${seeded.summitFallbackId}"]`).getByTestId('archive-trip-max-altitude-value')).toContainText(
      new Intl.NumberFormat('zh-CN').format(Math.round(mountain.altitude)),
    )
    await expect(page.locator('[data-archive-year="2022"]')).toBeVisible()
    await expect(page.locator(`[data-archive-trip-card="${seeded.crossYearId}"]`)).toHaveCount(0)
    await page.evaluate(() => {
      const state = window as unknown as {
        __fu87Frames?: number[]
        __fu87LongTasks?: Array<{ name: string; startTime: number; duration: number }>
        __fu87LayoutShift?: number
      }
      state.__fu87Frames = []
      state.__fu87LongTasks = []
      state.__fu87LayoutShift = 0
    })

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-normal-hero-timeline-375x812.png') })
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-normal-full-375.png'), fullPage: true })
    const nodeSweepTrace = await sampleNodeSweep(page)
    expect(Math.max(...nodeSweepTrace.map((entry) => entry.litCount))).toBeGreaterThan(1)
    expect(Math.max(...nodeSweepTrace.map((entry) => entry.haloMaxOpacity))).toBeGreaterThan(0)
    await page.evaluate(() => window.scrollTo({ top: 480, behavior: 'instant' }))
    await page.waitForTimeout(120)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-filter-midscroll-375x812.png') })
    const stickyBboxes = await page.evaluate(() => {
      const read = (selector: string) => {
        const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
        return rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height } : null
      }
      return {
        appHeader: read('header'),
        filterTabs: read('.archive-filter-tabs'),
        yearDivider: read('.archive-year-divider'),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }
    })
    expect(stickyBboxes.appHeader?.top).toBeGreaterThanOrEqual(-1)
    expect(stickyBboxes.appHeader?.top).toBeLessThanOrEqual(1)
    expect(stickyBboxes.filterTabs?.top).toBeGreaterThanOrEqual((stickyBboxes.appHeader?.bottom ?? 0) - 1)
    expect(stickyBboxes.filterTabs?.top).toBeLessThanOrEqual((stickyBboxes.appHeader?.bottom ?? 0) + 1)
    expect(stickyBboxes.yearDivider?.top).toBeGreaterThanOrEqual((stickyBboxes.filterTabs?.bottom ?? 0) - 3)
    expect(stickyBboxes.yearDivider?.top).toBeLessThanOrEqual((stickyBboxes.filterTabs?.bottom ?? 0) + 1)
    const photoRimTrace = await captureRimTrace(page, seeded.measuredHighestId, 'archive-rim-photo-held-375x812.png')
    const noPhotoRimTrace = await captureRimTrace(page, seeded.noMeasuredId, 'archive-rim-no-photo-held-375x812.png')
    expect(photoRimTrace.pressed.transform).not.toBe(photoRimTrace.before.transform)
    expect(noPhotoRimTrace.pressed.transform).not.toBe(noPhotoRimTrace.before.transform)
    expect(photoRimTrace.pressedRim.opacity).toBeGreaterThan(0.8)
    expect(noPhotoRimTrace.pressedRim.opacity).toBeGreaterThan(0.8)
    expect(photoRimTrace.releasedRim.opacity).toBe(0)
    expect(noPhotoRimTrace.releasedRim.opacity).toBe(0)
    await page.locator(`[data-archive-trip-card="${seeded.summitFallbackId}"]`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-altitude-branches-375x812.png') })
    await page.locator(`[data-archive-trip-card="${seeded.noMeasuredId}"]`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-no-measured-altitude-375x812.png') })

    const year2022Toggle = page.locator('[data-archive-year-toggle="2022"]')
    await year2022Toggle.scrollIntoViewIfNeeded()
    await year2022Toggle.focus()
    await page.keyboard.press('Enter')
    await expect(year2022Toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(`[data-archive-trip-card="${seeded.crossYearId}"]`)).toBeVisible()
    await expect(page.locator(`[data-archive-trip-card="${seeded.crossYearId}"]`).getByTestId('archive-trip-secondary')).toContainText('2022·03·09')
    await page.locator(`[data-archive-trip-card="${seeded.crossYearId}"]`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-keyboard-expanded-375x812.png') })
    await year2022Toggle.focus()
    await page.keyboard.press('Space')
    await expect(year2022Toggle).toHaveAttribute('aria-expanded', 'false')

    await page.locator('[data-archive-filter-tab="unproof"]').click()
    await expect(page.getByText('当前筛选下没有山行')).toBeVisible()
    await expect(page.locator('[data-archive-timeline]')).toHaveCount(0)
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-filter-empty-375.png'), fullPage: true })
    const showAll = page.getByRole('button', { name: '查看全部' })
    await showAll.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-archive-filter-tab="all"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-archive-trip-card]').first()).toBeVisible()

    const all2025Toggle = page.locator('[data-archive-year-toggle="2025"]')
    await all2025Toggle.click()
    await expect(all2025Toggle).toHaveAttribute('aria-expanded', 'true')
    await page.locator('[data-archive-filter-tab="proof"]').click()
    const proof2025Toggle = page.locator('[data-archive-year-toggle="2025"]')
    await expect(proof2025Toggle).toHaveAttribute('aria-expanded', 'false')
    await proof2025Toggle.click()
    await expect(proof2025Toggle).toHaveAttribute('aria-expanded', 'true')
    await page.locator('[data-archive-filter-tab="all"]').click()
    await expect(page.locator('[data-archive-year-toggle="2025"]')).toHaveAttribute('aria-expanded', 'true')
    await page.locator('[data-archive-filter-tab="proof"]').click()
    await expect(page.locator('[data-archive-year-toggle="2025"]')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.archive-year-divider').filter({ hasText: '2025' })).toContainText('已留证')
    await expect(page.locator('.archive-footer')).toContainText('筛选 已留证')
    const expandedStateIsolation = { all2025: true, proof2025: true }
    await page.locator('[data-archive-filter-tab="all"]').click()

    for (const filter of ['summit', 'proof', 'all', 'summit', 'all']) {
      await page.locator(`[data-archive-filter-tab="${filter}"]`).click({ timeout: 10_000 })
    }
    await page.waitForTimeout(750)
    const year2025Toggle = page.locator('[data-archive-year-toggle="2025"]')
    await expect(year2025Toggle).toHaveAttribute('aria-expanded', 'true')
    await year2025Toggle.scrollIntoViewIfNeeded({ timeout: 10_000 })
    await year2025Toggle.focus({ timeout: 10_000 })
    await page.keyboard.press('Enter')
    await expect(year2025Toggle).toHaveAttribute('aria-expanded', 'false')
    await year2025Toggle.focus({ timeout: 10_000 })
    await page.keyboard.press('Space')
    await expect(year2025Toggle).toHaveAttribute('aria-expanded', 'true')
    await page.waitForTimeout(650)
    const rapidTerminal = await getTerminalResidue(page)
    expect(rapidTerminal.every((entry) => !entry.stuck)).toBe(true)

    const cleanFlowPage = await context.newPage()
    await attachCapture(cleanFlowPage, consoleEntries, pageErrors)
    await cleanFlowPage.goto('/archive', { waitUntil: 'domcontentloaded' })
    await expect(cleanFlowPage.locator('[data-archive-trip-card]').first()).toBeVisible({ timeout: 30_000 })
    await cleanFlowPage.waitForTimeout(900)
    await sampleNodeSweep(cleanFlowPage)
    for (const filter of ['summit', 'proof', 'unproof', 'all']) {
      await cleanFlowPage.locator(`[data-archive-filter-tab="${filter}"]`).click()
      await cleanFlowPage.waitForTimeout(600)
    }
    for (const filter of ['summit', 'proof', 'all', 'summit', 'all']) {
      await cleanFlowPage.locator(`[data-archive-filter-tab="${filter}"]`).click()
    }
    await cleanFlowPage.waitForTimeout(650)
    const clean2025Toggle = cleanFlowPage.locator('[data-archive-year-toggle="2025"]')
    await clean2025Toggle.scrollIntoViewIfNeeded()
    await clean2025Toggle.click()
    await cleanFlowPage.waitForTimeout(360)
    await clean2025Toggle.click()
    const clean2022Toggle = cleanFlowPage.locator('[data-archive-year-toggle="2022"]')
    await clean2022Toggle.scrollIntoViewIfNeeded()
    await clean2022Toggle.click()
    await cleanFlowPage.waitForTimeout(360)
    await clean2022Toggle.click()
    await captureRimTrace(cleanFlowPage, seeded.measuredHighestId)
    await captureRimTrace(cleanFlowPage, seeded.noMeasuredId)
    const keyboardSurface = cleanFlowPage.locator(`[data-archive-trip-surface="${seeded.noMeasuredId}"]`)
    await keyboardSurface.scrollIntoViewIfNeeded()
    await keyboardSurface.focus()
    await cleanFlowPage.keyboard.down('Space')
    await cleanFlowPage.waitForTimeout(360)
    const keyboardPressed = await keyboardSurface.evaluate((node) => ({
      transform: getComputedStyle(node).transform,
      rimOpacity: Number(getComputedStyle(node.querySelector<HTMLElement>('[data-archive-rim]')!).opacity),
    }))
    await cleanFlowPage.keyboard.up('Space')
    await cleanFlowPage.waitForURL(new RegExp(`/activity/${seeded.noMeasuredId}$`), { timeout: 30_000 })
    await cleanFlowPage.goBack({ waitUntil: 'domcontentloaded' })
    await expect(cleanFlowPage.locator('[data-archive-trip-card]').first()).toBeVisible({ timeout: 30_000 })
    await cleanFlowPage.waitForTimeout(700)
    const cleanFlowVideo = cleanFlowPage.video()
    await cleanFlowPage.close()
    if (cleanFlowVideo) await copyFile(await cleanFlowVideo.path(), NORMAL_VIDEO)
    expect(keyboardPressed.transform).not.toBe('none')
    expect(keyboardPressed.rimOpacity).toBeGreaterThan(0.8)

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await page.waitForTimeout(750)
    const layout = await page.evaluate(() => {
      const nav = document.querySelector('nav.fixed')?.getBoundingClientRect() ?? null
      const footer = document.querySelector('.archive-footer')?.getBoundingClientRect() ?? null
      const root = document.documentElement
      return {
        overflowX: root.scrollWidth - root.clientWidth,
        navTop: nav?.top ?? null,
        footerBottom: footer?.bottom ?? null,
        cls: (window as unknown as { __fu87LayoutShift?: number }).__fu87LayoutShift ?? 0,
      }
    })
    expect(layout.overflowX).toBeLessThanOrEqual(1)
    if (layout.navTop !== null && layout.footerBottom !== null) expect(layout.footerBottom).toBeLessThanOrEqual(layout.navTop + 1)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-bottom-tabbar-clearance-375.png') })

    const timing = await page.evaluate(() => {
      const state = window as unknown as {
        __fu87Frames?: number[]
        __fu87LongTasks?: Array<{ name: string; startTime: number; duration: number }>
      }
      return { frames: state.__fu87Frames ?? [], longTasks: state.__fu87LongTasks ?? [] }
    })
    const intervals = timing.frames.filter((value) => Number.isFinite(value) && value > 0 && value < 1000)
    const performance = {
      sampleCount: intervals.length,
      median: percentile(intervals, 0.5),
      p95: percentile(intervals, 0.95),
      max: intervals.length ? Math.max(...intervals) : 0,
      over32ms: intervals.filter((value) => value > 32).length,
      over50ms: intervals.filter((value) => value > 50).length,
      over100ms: intervals.filter((value) => value > 100).length,
      longTasks: timing.longTasks,
    }

    const firstCard = page.locator('[data-archive-trip-card]').first()
    const firstCardId = await firstCard.getAttribute('data-archive-trip-card')
    const navigationStartedAt = Date.now()
    await firstCard.click()
    await page.waitForURL(new RegExp(`/activity/${firstCardId}$`), { timeout: 30_000 })
    const activityNavigationDurationMs = Date.now() - navigationStartedAt
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-archive-trip-card]').first()).toBeVisible({ timeout: 30_000 })

    await context.close()

    const reducedContext = await browser.newContext({
      baseURL,
      viewport: { width: 375, height: 812 },
      reducedMotion: 'reduce',
    })
    await reducedContext.addCookies([])
    const reducedPage = await reducedContext.newPage()
    await reducedPage.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
    await reducedPage.goto('/auth/login', { waitUntil: 'domcontentloaded' })
    await reducedPage.getByPlaceholder('your@email.com').fill(email)
    await reducedPage.getByPlaceholder(/至少6位|••••••••/).fill(password)
    await reducedPage.getByRole('button', { name: '▶ 开始登山' }).click()
    await reducedPage.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 30_000 })
    await reducedPage.goto('/archive', { waitUntil: 'domcontentloaded' })
    await expect(reducedPage.locator('[data-archive-trip-card]').first()).toBeVisible({ timeout: 30_000 })
    const reducedTerminal = await getTerminalResidue(reducedPage)
    const reducedMatrix = await getTerminalMatrix(reducedPage)
    expect(reducedTerminal.every((entry) => !entry.stuck && entry.transform === 'none')).toBe(true)
    expect(reducedMatrix.surface?.transform).toBe('none')
    expect(reducedMatrix.allNodesLit).toBe(true)
    expect(reducedMatrix.rimMaxOpacity).toBe(0)
    expect(reducedMatrix.haloMaxOpacity).toBe(0)
    expect(reducedMatrix.baseDashOffset).toBe(0)
    expect(reducedMatrix.progressDashOffset).toBe(0)
    await reducedPage.screenshot({ path: join(OUTPUT_DIR, 'archive-reduced-terminal-375x812.png') })
    await reducedContext.close()

    const summary = {
      evidenceKind: 'controlled-authenticated-local-production-build',
      controlledBoundary: 'Checkins are isolated FU-87 seed rows in the configured development database and are deleted by exact id after capture.',
      viewport: { width: 375, height: 812 },
      activityAt: {
        crossYearCheckinId: seeded.crossYearId,
        startTime: '2022-03-09T06:00:00.000Z',
        createdAt: '2026-07-15T03:00:00.000Z',
        renderedYear: '2022',
      },
      altitudeCases: {
        measuredHighest: { checkinId: seeded.measuredHighestId, rendered: 6200 },
        summitMetadataFallback: { checkinId: seeded.summitFallbackId, rendered: Math.round(mountain.altitude) },
        nonSummitNoMeasured: { checkinId: seeded.noMeasuredId, rendered: '--' },
      },
      rapidTerminal,
      expandedStateIsolation,
      stickyBboxes,
      rim: { photo: photoRimTrace, noPhoto: noPhotoRimTrace, keyboard: keyboardPressed },
      nodeSweepTrace,
      reducedTerminal,
      reducedMatrix,
      reducedEmptyTerminal,
      layout,
      performance,
      realActivityNavigation: { checkinId: firstCardId, durationMs: activityNavigationDurationMs },
      console: consoleEntries,
      pageErrors,
      artifacts: {
        video: NORMAL_VIDEO,
        emptyVideo: EMPTY_VIDEO,
        trueEmpty: join(OUTPUT_DIR, 'archive-true-empty-375.png'),
        trueEmptyReduced: join(OUTPUT_DIR, 'archive-true-empty-reduced-375x812.png'),
        emptyPointerRim: join(OUTPUT_DIR, 'archive-empty-pointer-rim-375x812.png'),
        emptyKeyboardRim: join(OUTPUT_DIR, 'archive-empty-keyboard-rim-375x812.png'),
        normal: join(OUTPUT_DIR, 'archive-normal-hero-timeline-375x812.png'),
        fullArchive: join(OUTPUT_DIR, 'archive-normal-full-375.png'),
        filterMidscroll: join(OUTPUT_DIR, 'archive-filter-midscroll-375x812.png'),
        photoRimHeld: join(OUTPUT_DIR, 'archive-rim-photo-held-375x812.png'),
        noPhotoRimHeld: join(OUTPUT_DIR, 'archive-rim-no-photo-held-375x812.png'),
        altitudeBranches: join(OUTPUT_DIR, 'archive-altitude-branches-375x812.png'),
        noMeasuredAltitude: join(OUTPUT_DIR, 'archive-no-measured-altitude-375x812.png'),
        keyboardExpanded: join(OUTPUT_DIR, 'archive-keyboard-expanded-375x812.png'),
        filterEmpty: join(OUTPUT_DIR, 'archive-filter-empty-375.png'),
        bottomClearance: join(OUTPUT_DIR, 'archive-bottom-tabbar-clearance-375.png'),
        reduced: join(OUTPUT_DIR, 'archive-reduced-terminal-375x812.png'),
      },
    }
    await writeFile(join(OUTPUT_DIR, 'fu87-summary.json'), JSON.stringify(summary, null, 2))
    await writeFile(join(OUTPUT_DIR, 'fu87-frame-performance.json'), JSON.stringify(performance, null, 2))
    await writeFile(join(OUTPUT_DIR, 'rim-press-trace.json'), JSON.stringify(summary.rim, null, 2))
    await writeFile(join(OUTPUT_DIR, 'node-lit-halo-trace.json'), JSON.stringify(nodeSweepTrace, null, 2))
    await writeFile(join(OUTPUT_DIR, 'filter-expanded-state-isolation.json'), JSON.stringify(expandedStateIsolation, null, 2))
    await writeFile(join(OUTPUT_DIR, 'sticky-filter-bboxes.json'), JSON.stringify(stickyBboxes, null, 2))
    await writeFile(join(OUTPUT_DIR, 'reduced-terminal-matrix.json'), JSON.stringify({ reducedMatrix, reducedEmptyTerminal }, null, 2))
    expect(consoleEntries.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
    expect(pageErrors).toEqual([])
  } finally {
    if (userId) await cleanupSeed(userId, checkinIds)
    if (!page.isClosed()) await context.close().catch(() => {})
  }
})
