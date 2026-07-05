import { test, expect, type Browser, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  createGpsCheckinViaApi,
  createPngDataUrl,
  createTestEmail,
  fetchMostPopularMountain,
  registerFreshUser,
} from './community.helpers'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu76-p2iii-acceptance'
const STORAGE_STATE = join(OUTPUT_DIR, 'fu76-p2iii-storage-state.json')

type PageKey = 'archive' | 'profile' | 'faq' | 'activity'
type ArchiveFilterId = 'all' | 'summit' | 'proof' | 'unproof'

type ConsoleEntry = {
  type: string
  text: string
  location: ReturnType<ConsoleMessage['location']>
  classification: 'new-this-round' | 'pre-existing' | 'environment'
}

type MotionSnapshot = {
  label: string
  opacity: string
  transform: string
  visibility: string
  text: string
  box: { x: number; y: number; width: number; height: number } | null
}

type PageEvidence = {
  page: PageKey
  path: string
  evidenceKind: 'controlled-local-production-build'
  normalVideo: string | null
  reducedScreenshot: string
  visibilitySamples: Array<{ atMs: number; items: Record<string, boolean> }>
  motionCoverage: Array<{
    label: string
    initial: MotionSnapshot | null
    mid: MotionSnapshot | null
    final: MotionSnapshot | null
    changedInitialToMid: boolean
    changedMidToFinal: boolean
  }>
  clickability: Record<string, boolean>
  console: ConsoleEntry[]
  pageErrors: Array<{ message: string; classification: ConsoleEntry['classification'] }>
  activityTiming?: {
    frameIntervals: number[]
    longFrames: Array<{ start: number; duration: number }>
    longTasks: Array<{ name: string; startTime: number; duration: number }>
  }
}

const pageConfigs: Record<PageKey, {
  path: string
  visibility: Record<string, string>
  motionTargets: Record<string, string>
}> = {
  archive: {
    path: '/archive',
    visibility: {
      header: '[data-archive-motion="header"]',
      identity: '[data-archive-motion="identity"]',
      filters: '[data-archive-motion="filters"]',
      firstCard: '[data-archive-trip-card]',
    },
    motionTargets: {
      header: '[data-archive-motion="header"]',
      identity: '[data-archive-motion="identity"]',
      filters: '[data-archive-motion="filters"]',
      firstCard: '[data-archive-trip-card]',
      firstStat: '[data-archive-stat-value]',
    },
  },
  profile: {
    path: '/profile',
    visibility: {
      identity: '[data-profile-motion="identity"]',
      summary: '[data-profile-motion="summary"]',
      archivePreview: '[data-profile-motion="archive-preview"]',
      firstTrip: '[data-profile-archive-card]',
    },
    motionTargets: {
      identity: '[data-profile-motion="identity"]',
      summary: '[data-profile-motion="summary"]',
      firstSummaryTile: '[data-profile-summary-tile]',
      firstSummaryValue: '[data-profile-summary-value]',
      firstArchiveCard: '[data-profile-archive-card]',
    },
  },
  faq: {
    path: '/faq',
    visibility: {
      header: '[data-faq-motion="header"]',
      search: '[data-faq-motion="search"]',
      firstGroup: '[data-faq-group-card]',
    },
    motionTargets: {
      header: '[data-faq-motion="header"]',
      search: '[data-faq-motion="search"]',
      firstGroup: '[data-faq-group-card]',
      secondGroup: '[data-faq-group-card]:nth-of-type(2)',
    },
  },
  activity: {
    path: '',
    visibility: {
      hero: '[data-activity-motion="hero-background"]',
      heroText: '[data-activity-hero-text]',
      memo: '[data-activity-motion="memo-card"]',
      summit: '[data-activity-motion="summit-card"]',
      keyData: '[data-activity-motion="key-data"]',
    },
    motionTargets: {
      hero: '[data-activity-motion="hero-background"]',
      heroText: '[data-activity-hero-text]',
      memo: '[data-activity-motion="memo-card"]',
      summit: '[data-activity-motion="summit-card"]',
      firstKeyCell: '[data-activity-key-data-cell]',
      firstCount: '[data-activity-count-value]',
      routeMap: '[data-activity-motion="route-map"]',
    },
  },
}

function readEnvValue(key: string) {
  if (process.env[key]) return process.env[key] ?? null
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
  const url = readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for FU-76 evidence seeding.')
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function seedActivityPhoto(checkinId: string) {
  const supabase = getSupabaseAdminClient()
  const url = createPngDataUrl()
  const { error: assetError } = await supabase.from('checkin_assets').insert({
    checkin_id: checkinId,
    type: 'image',
    url,
    thumbnail_url: url,
    sort_order: 0,
  })
  if (assetError) throw new Error(`Failed to seed activity evidence photo: ${assetError.message}`)

  const { error: coverError } = await supabase.from('checkins').update({ photo_url: url }).eq('id', checkinId)
  if (coverError) throw new Error(`Failed to seed activity evidence cover: ${coverError.message}`)
}

async function resolveEvidenceUserId(email: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw new Error(`Failed to list FU-76 evidence users: ${error.message}`)
  const user = data.users.find((candidate) => candidate.email === email)
  if (!user) throw new Error(`Could not resolve FU-76 evidence user ${email}`)
  return user.id
}

async function seedArchiveReplayRows({
  page,
  email,
  mountain,
}: {
  page: Page
  email: string
  mountain: {
    id: string
    name: string
    latitude: number
    longitude: number
    altitude: number
  }
}) {
  const summitCheckinId = await createGpsCheckinViaApi(page, mountain, `fu76-p2iii-archive-summit-${Date.now()}`)
  await seedActivityPhoto(summitCheckinId)

  const userId = await resolveEvidenceUserId(email)
  const supabase = getSupabaseAdminClient()
  const now = Date.now()
  const proofPhotoUrl = createPngDataUrl()
  const { error } = await supabase.from('checkins').insert([
    {
      user_id: userId,
      mountain_id: mountain.id,
      type: 'photo',
      source: 'historical_photo',
      photo_url: proofPhotoUrl,
      verified_at: null,
      created_at: new Date(now - 86_400_000).toISOString(),
      completion_status: 'complete',
      max_elevation_meters: Math.max(0, Math.round(mountain.altitude - 80)),
      track_name: `${mountain.name} 留证样本`,
    },
    {
      user_id: userId,
      mountain_id: null,
      type: 'gps',
      source: 'track_import',
      photo_url: null,
      verified_at: null,
      created_at: new Date(now - 172_800_000).toISOString(),
      completion_status: 'complete',
      max_elevation_meters: Math.max(0, Math.round(mountain.altitude - 160)),
      track_name: '未关联筛选样本',
    },
  ])
  if (error) throw new Error(`Failed to seed archive replay rows: ${error.message}`)

  return { summitCheckinId }
}

function classifyMessage(text: string): ConsoleEntry['classification'] {
  if (/analytics|favicon|maplibre|Failed to load resource|net::ERR|401|403|404/i.test(text)) return 'environment'
  if (/recognitionFailureResponse|requestSource|TrackPoint|feedbackTimersRef|ButtonPrimitive/i.test(text)) return 'pre-existing'
  return 'new-this-round'
}

async function attachCapture(page: Page, consoleEntries: ConsoleEntry[], pageErrors: PageEvidence['pageErrors']) {
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return
    const text = message.text()
    consoleEntries.push({
      type: message.type(),
      text,
      location: message.location(),
      classification: classifyMessage(text),
    })
  })
  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      classification: classifyMessage(error.message),
    })
  })
  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
}

async function installTimingProbe(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    const state = window as unknown as {
      __fu76Frames?: number[]
      __fu76LongFrames?: Array<{ start: number; duration: number }>
      __fu76LongTasks?: Array<{ name: string; startTime: number; duration: number }>
    }
    state.__fu76Frames = []
    state.__fu76LongFrames = []
    state.__fu76LongTasks = []
    let previous = 0
    const tick = (now: number) => {
      if (previous > 0) {
        const delta = now - previous
        state.__fu76Frames?.push(Number(delta.toFixed(2)))
        if (delta > 50) state.__fu76LongFrames?.push({ start: Number(previous.toFixed(2)), duration: Number(delta.toFixed(2)) })
      }
      previous = now
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.__fu76LongTasks?.push({
            name: entry.name,
            startTime: Number(entry.startTime.toFixed(2)),
            duration: Number(entry.duration.toFixed(2)),
          })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // Long Task API is optional evidence.
    }
  })
}

async function newEvidenceContext(browser: Browser, baseURL: string, options: {
  recordVideo?: boolean
  reducedMotion?: 'reduce' | 'no-preference'
  videoDir?: string
}) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    storageState: STORAGE_STATE,
    reducedMotion: options.reducedMotion ?? 'no-preference',
    recordVideo: options.recordVideo && options.videoDir
      ? { dir: options.videoDir, size: { width: 375, height: 812 } }
      : undefined,
  })
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
  })
  return context
}

async function snapshotTarget(page: Page, label: string, selector: string): Promise<MotionSnapshot | null> {
  return page.evaluate(({ targetLabel, targetSelector }) => {
    const element = document.querySelector<HTMLElement>(targetSelector)
    if (!element) return null
    const style = window.getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      label: targetLabel,
      opacity: style.opacity,
      transform: style.transform,
      visibility: style.visibility,
      text: element.textContent?.trim() ?? '',
      box: box.width || box.height
        ? {
            x: Number(box.x.toFixed(2)),
            y: Number(box.y.toFixed(2)),
            width: Number(box.width.toFixed(2)),
            height: Number(box.height.toFixed(2)),
          }
        : null,
    }
  }, { targetLabel: label, targetSelector: selector })
}

function changed(left: MotionSnapshot | null, right: MotionSnapshot | null) {
  if (!left || !right) return false
  return left.opacity !== right.opacity || left.transform !== right.transform || left.visibility !== right.visibility || left.text !== right.text
}

type ArchiveCardState = {
  id: string | null
  opacity: number
  transform: string
  visibility: string
  text: string
}

type ArchiveReplaySample = {
  label: string
  atMs: number
  cards: ArchiveCardState[]
  dividers: ArchiveCardState[]
}

function archiveStateChanged(left: ArchiveCardState | undefined, right: ArchiveCardState | undefined) {
  if (!left || !right) return false
  return left.opacity !== right.opacity ||
    left.transform !== right.transform ||
    left.visibility !== right.visibility ||
    left.text !== right.text
}

function archiveStateIsTerminal(state: ArchiveCardState) {
  return state.opacity >= 0.99 && state.visibility !== 'hidden' && state.transform === 'none'
}

function archiveReplayHasMotion(samples: ArchiveReplaySample[]) {
  const initial = samples[0]?.cards[0] ?? samples[0]?.dividers[0]
  const mid = samples.find((sample) => sample.label === 'mid')?.cards[0] ??
    samples.find((sample) => sample.label === 'mid')?.dividers[0]
  const final = samples.at(-1)?.cards[0] ?? samples.at(-1)?.dividers[0]
  return archiveStateChanged(initial, mid) && archiveStateChanged(mid, final)
}

function archiveReplayHasFirstFrameFlash(samples: ArchiveReplaySample[]) {
  const first = samples[0]
  if (!first || first.cards.length === 0) return false
  return first.cards.every(archiveStateIsTerminal)
}

async function snapshotArchiveReplayState(page: Page, label: string, startedAt: number): Promise<ArchiveReplaySample> {
  return page.evaluate(({ sampleLabel, sampleStartedAt }) => {
    const serialize = (element: HTMLElement): ArchiveCardState => {
      const style = window.getComputedStyle(element)
      return {
        id: element.dataset.archiveTripCard ?? element.dataset.archiveMotion ?? null,
        opacity: Number.parseFloat(style.opacity || '1'),
        transform: style.transform,
        visibility: style.visibility,
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      }
    }
    return {
      label: sampleLabel,
      atMs: Math.round(performance.now() - sampleStartedAt),
      cards: Array.from(document.querySelectorAll<HTMLElement>('[data-archive-trip-card]')).slice(0, 4).map(serialize),
      dividers: Array.from(document.querySelectorAll<HTMLElement>('[data-archive-motion="year-divider"]')).map(serialize),
    }
  }, { sampleLabel: label, sampleStartedAt: startedAt })
}

async function clickArchiveFilterAndCollectReplay(page: Page, filterId: ArchiveFilterId) {
  const tab = page.locator(`[data-archive-filter-tab="${filterId}"]`)
  const startedAt = await page.evaluate(() => performance.now())
  await tab.click()
  const samples: ArchiveReplaySample[] = []
  samples.push(await snapshotArchiveReplayState(page, 'initial', startedAt))
  await page.waitForTimeout(180)
  samples.push(await snapshotArchiveReplayState(page, 'mid', startedAt))
  await page.waitForTimeout(520)
  samples.push(await snapshotArchiveReplayState(page, 'final', startedAt))
  return {
    filterId,
    samples,
    motionChanged: archiveReplayHasMotion(samples),
    firstFrameFlashDetected: archiveReplayHasFirstFrameFlash(samples),
  }
}

async function collectArchivePressFeedback(page: Page) {
  const tab = page.locator('[data-archive-filter-tab="all"]')
  await tab.waitFor({ state: 'visible', timeout: 10_000 })
  const readStyle = async () => tab.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      background: style.backgroundColor,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
    }
  })
  const before = await readStyle()
  const box = await tab.boundingBox()
  if (!box) throw new Error('Archive all filter tab should have a bounding box for press evidence.')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(80)
  let active = await readStyle()
  let method = 'mouse'
  await page.mouse.up()
  await page.mouse.move(0, 0)
  if (before.background === active.background && before.borderColor === active.borderColor && before.boxShadow === active.boxShadow) {
    method = 'synthetic-mousedown'
    await tab.dispatchEvent('mousedown', { button: 0, buttons: 1, bubbles: true })
    await page.waitForTimeout(80)
    active = await readStyle()
    await tab.dispatchEvent('mouseup', { button: 0, buttons: 0, bubbles: true })
    await tab.dispatchEvent('mouseleave', { bubbles: true })
  }
  const after = await readStyle()
  return {
    method,
    before,
    active,
    after,
    changedDuringPress: before.background !== active.background ||
      before.borderColor !== active.borderColor ||
      before.boxShadow !== active.boxShadow,
  }
}

async function collectArchiveTerminalState(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-archive-trip-card]')).map((element) => {
    const style = window.getComputedStyle(element)
    return {
      id: element.dataset.archiveTripCard ?? null,
      opacity: Number.parseFloat(style.opacity || '1'),
      transform: style.transform,
      visibility: style.visibility,
      stuck: Number.parseFloat(style.opacity || '1') < 0.99 || style.visibility === 'hidden' || style.transform !== 'none',
    }
  }))
}

async function sampleVisibility(page: Page, selectors: Record<string, string>) {
  const result: Record<string, boolean> = {}
  for (const [label, selector] of Object.entries(selectors)) {
    result[label] = await page.locator(selector).first().isVisible().catch(() => false)
  }
  return result
}

async function waitUntil(startedAt: number, targetMs: number) {
  const elapsed = Date.now() - startedAt
  if (elapsed < targetMs) await new Promise((resolve) => setTimeout(resolve, targetMs - elapsed))
}

async function collectClickability(page: Page, key: PageKey) {
  const clickability: Record<string, boolean> = {}
  const trial = async (label: string, locator = page.getByRole('button', { name: label }).first()) => {
    clickability[label] = await locator.scrollIntoViewIfNeeded({ timeout: 5000 })
      .then(() => locator.click({ trial: true, timeout: 5000 }))
      .then(() => true)
      .catch(() => false)
  }

  if (key === 'archive') {
    await trial('archive-back', page.getByRole('button', { name: '返回' }))
    await trial('archive-filter', page.locator('[data-archive-motion="filters"] button').filter({ hasText: /^登顶/ }).first())
    await trial('archive-card', page.locator('[data-archive-trip-card]').first())
  }

  if (key === 'profile') {
    await trial('profile-license', page.getByTestId('profile-license-badge'))
    await trial('profile-archive', page.getByTestId('profile-trip-activity-link').first())
    await trial('profile-share', page.getByTestId('profile-trip-share-link').first())
    await trial('profile-support', page.getByTestId('profile-support-section').getByRole('link').first())
    await trial('profile-logout', page.locator('[data-profile-motion="logout"] button').first())
  }

  if (key === 'faq') {
    const input = page.getByTestId('faq-search-input')
    clickability['faq-search'] = await input.fill('执照').then(() => true).catch(() => false)
    clickability['faq-clear'] = await page.getByRole('button', { name: '清除搜索' }).click().then(() => true).catch(() => false)
    clickability['faq-expand'] = await page.locator('[data-faq-group-card]').first().getByRole('button').first().click().then(() => true).catch(() => false)
  }

  if (key === 'activity') {
    await trial('activity-top-share', page.getByRole('button', { name: '分享' }).first())
    await trial('activity-fixed-share-cta', page.getByRole('link', { name: '生成分享' }).first())
    const firstPhoto = page.locator('[data-testid^="activity-photo-tile-"]').first()
    clickability['activity-photo-lightbox'] = await firstPhoto.click().then(async () => {
      await expect(page.getByTestId('activity-photo-lightbox')).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: '关闭照片查看' }).click()
      return true
    }).catch(() => false)
  }

  return clickability
}

async function collectNormalEvidence(browser: Browser, baseURL: string, key: PageKey, path: string) {
  const videoDir = join(OUTPUT_DIR, 'videos')
  await mkdir(videoDir, { recursive: true })
  const context = await newEvidenceContext(browser, baseURL, {
    recordVideo: true,
    videoDir,
    reducedMotion: 'no-preference',
  })
  if (key === 'activity') await installTimingProbe(context)
  const page = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: PageEvidence['pageErrors'] = []
  await attachCapture(page, consoleEntries, pageErrors)

  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.locator(pageConfigs[key].visibility[Object.keys(pageConfigs[key].visibility)[0]]).first().waitFor({
    state: 'attached',
    timeout: 20_000,
  })
  const startedAt = Date.now()

  const motionSamples = new Map<string, MotionSnapshot[]>()
  for (const [label, selector] of Object.entries(pageConfigs[key].motionTargets)) {
    const snapshot = await snapshotTarget(page, label, selector)
    motionSamples.set(label, snapshot ? [snapshot] : [])
  }

  const visibilitySamples: PageEvidence['visibilitySamples'] = []
  const eventTimes = [20, 40, 80, 160, 260, 300, 420, 500, 620, 700, 820, 900, 1050, 1300]
  for (const target of eventTimes) {
    await waitUntil(startedAt, target)
    if ([300, 500, 700, 900].includes(target)) {
      visibilitySamples.push({ atMs: target, items: await sampleVisibility(page, pageConfigs[key].visibility) })
    }
    if (![300, 500, 700, 900].includes(target)) {
      for (const [label, selector] of Object.entries(pageConfigs[key].motionTargets)) {
        const snapshot = await snapshotTarget(page, label, selector)
        if (snapshot) motionSamples.get(label)?.push(snapshot)
      }
    }
  }

  for (const [label, selector] of Object.entries(pageConfigs[key].motionTargets)) {
    const snapshot = await snapshotTarget(page, label, selector)
    if (snapshot) motionSamples.get(label)?.push(snapshot)
  }

  const clickability = await collectClickability(page, key)
  const activityTiming = key === 'activity'
    ? await page.evaluate(() => {
        const state = window as unknown as {
          __fu76Frames?: number[]
          __fu76LongFrames?: Array<{ start: number; duration: number }>
          __fu76LongTasks?: Array<{ name: string; startTime: number; duration: number }>
        }
        return {
          frameIntervals: (state.__fu76Frames ?? []).slice(0, 180),
          longFrames: state.__fu76LongFrames ?? [],
          longTasks: state.__fu76LongTasks ?? [],
        }
      })
    : undefined

  await page.waitForTimeout(200)
  const video = page.video()
  await context.close()
  const videoPath = video ? await video.path() : null

  return {
    normalVideo: videoPath,
    visibilitySamples,
    motionCoverage: Object.keys(pageConfigs[key].motionTargets).map((label) => {
      const samples = motionSamples.get(label) ?? []
      const initialSnapshot = samples[0] ?? null
      const finalSnapshot = samples[samples.length - 1] ?? null
      const midSnapshot =
        samples.slice(1, -1).find((sample) => changed(initialSnapshot, sample) && changed(sample, finalSnapshot)) ??
        samples.slice(1, -1).find((sample) => changed(initialSnapshot, sample)) ??
        samples.slice(1, -1)[0] ??
        null
      return {
        label,
        initial: initialSnapshot,
        mid: midSnapshot,
        final: finalSnapshot,
        changedInitialToMid: changed(initialSnapshot, midSnapshot),
        changedMidToFinal: changed(midSnapshot, finalSnapshot),
      }
    }),
    clickability,
    console: consoleEntries,
    pageErrors,
    activityTiming,
  }
}

async function collectReducedScreenshot(browser: Browser, baseURL: string, key: PageKey, path: string) {
  const context = await newEvidenceContext(browser, baseURL, { reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const screenshotPath = join(OUTPUT_DIR, `${key}-375-reduced-terminal.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await context.close()
  return screenshotPath
}

test('FU-76 Phase 2-III 4-page client subset motion evidence', async ({ browser, page, baseURL }) => {
  test.setTimeout(180_000)
  if (!baseURL) throw new Error('Playwright baseURL is required for FU-76 evidence.')
  await mkdir(OUTPUT_DIR, { recursive: true })

  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await registerFreshUser(page, baseURL, {
    returnTo: '/explore',
    email: createTestEmail('fu76-p2iii'),
    username: `fu76-p2iii-${Date.now()}`,
    province: '四川',
  })

  const mountain = await fetchMostPopularMountain()
  const checkinId = await createGpsCheckinViaApi(page, mountain, `fu76-p2iii-${Date.now()}`)
  await seedActivityPhoto(checkinId)
  await page.context().storageState({ path: STORAGE_STATE })

  const paths: Record<PageKey, string> = {
    archive: pageConfigs.archive.path,
    profile: pageConfigs.profile.path,
    faq: pageConfigs.faq.path,
    activity: `/activity/${checkinId}`,
  }

  const results: PageEvidence[] = []
  for (const key of Object.keys(paths) as PageKey[]) {
    const normal = await collectNormalEvidence(browser, baseURL, key, paths[key])
    const reducedScreenshot = await collectReducedScreenshot(browser, baseURL, key, paths[key])
    const evidence: PageEvidence = {
      page: key,
      path: paths[key],
      evidenceKind: 'controlled-local-production-build',
      normalVideo: normal.normalVideo,
      reducedScreenshot,
      visibilitySamples: normal.visibilitySamples,
      motionCoverage: normal.motionCoverage,
      clickability: normal.clickability,
      console: normal.console,
      pageErrors: normal.pageErrors,
      activityTiming: normal.activityTiming,
    }
    results.push(evidence)
    await writeFile(join(OUTPUT_DIR, `${key}-summary.json`), JSON.stringify(evidence, null, 2))
  }

  await writeFile(join(OUTPUT_DIR, 'fu76-p2iii-summary.json'), JSON.stringify({
    evidenceKind: 'controlled-local-production-build',
    generatedAt: new Date().toISOString(),
    checkinId,
    pages: results,
  }, null, 2))

  for (const pageEvidence of results) {
    expect(pageEvidence.reducedScreenshot).toContain(OUTPUT_DIR)
    expect(Object.values(pageEvidence.clickability).every(Boolean)).toBe(true)
    expect(Object.values(pageEvidence.visibilitySamples.at(-1)?.items ?? {}).every(Boolean)).toBe(true)
    expect(pageEvidence.motionCoverage.every((item) => item.initial && item.mid && item.final)).toBe(true)
  }
})

test('FU-76 Phase 2-III Round 1 archive filter replay evidence', async ({ browser, page, baseURL }) => {
  test.setTimeout(180_000)
  if (!baseURL) throw new Error('Playwright baseURL is required for FU-76 archive replay evidence.')
  await mkdir(OUTPUT_DIR, { recursive: true })

  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })

  const email = createTestEmail('fu76-p2iii-archive-replay')
  await registerFreshUser(page, baseURL, {
    returnTo: '/explore',
    email,
    username: `fu76-archive-replay-${Date.now()}`,
    province: '四川',
  })

  const mountain = await fetchMostPopularMountain()
  await seedArchiveReplayRows({ page, email, mountain })
  await page.context().storageState({ path: STORAGE_STATE })

  const videoDir = join(OUTPUT_DIR, 'videos')
  await mkdir(videoDir, { recursive: true })
  const context = await newEvidenceContext(browser, baseURL, {
    recordVideo: true,
    videoDir,
    reducedMotion: 'no-preference',
  })
  const evidencePage = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: PageEvidence['pageErrors'] = []
  await attachCapture(evidencePage, consoleEntries, pageErrors)

  await evidencePage.goto('/archive', { waitUntil: 'domcontentloaded' })
  await evidencePage.locator('[data-archive-trip-card]').first().waitFor({ state: 'visible', timeout: 20_000 })
  await evidencePage.waitForTimeout(900)

  const pressFeedback = await collectArchivePressFeedback(evidencePage)
  const replaySequences = [
    await clickArchiveFilterAndCollectReplay(evidencePage, 'summit'),
    await clickArchiveFilterAndCollectReplay(evidencePage, 'proof'),
    await clickArchiveFilterAndCollectReplay(evidencePage, 'unproof'),
  ]

  const rapidTabs: ArchiveFilterId[] = ['all', 'summit', 'proof', 'unproof', 'all']
  for (const filterId of rapidTabs) {
    await evidencePage.locator(`[data-archive-filter-tab="${filterId}"]`).click()
  }
  await evidencePage.waitForTimeout(900)
  const rapidTerminalState = await collectArchiveTerminalState(evidencePage)
  const rapidNoStuckHidden = rapidTerminalState.every((state) => !state.stuck)
  const clickability: Record<string, boolean> = {}
  const trial = async (label: string, locator = evidencePage.getByRole('button', { name: label }).first()) => {
    clickability[label] = await locator.scrollIntoViewIfNeeded({ timeout: 5000 })
      .then(() => locator.click({ trial: true, timeout: 5000 }))
      .then(() => true)
      .catch(() => false)
  }
  await trial('archive-back', evidencePage.getByRole('button', { name: '返回' }))
  await trial('archive-filter', evidencePage.locator('[data-archive-filter-tab="summit"]'))
  await trial('archive-card', evidencePage.locator('[data-archive-trip-card]').first())

  const moreButtonGone = await evidencePage.getByRole('button', { name: '更多' }).count().then((count) => count === 0)
  const finalScreenshot = join(OUTPUT_DIR, 'archive-filter-replay-final-no-more.png')
  await evidencePage.screenshot({ path: finalScreenshot, fullPage: true })
  const video = evidencePage.video()
  await context.close()
  const videoPath = video ? await video.path() : null

  const reducedContext = await newEvidenceContext(browser, baseURL, { reducedMotion: 'reduce' })
  const reducedPage = await reducedContext.newPage()
  await reducedPage.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await reducedPage.goto('/archive', { waitUntil: 'domcontentloaded' })
  await reducedPage.waitForTimeout(600)
  const reducedTerminalState = await collectArchiveTerminalState(reducedPage)
  const reducedTerminalVisible = reducedTerminalState.every((state) => !state.stuck)
  const reducedScreenshot = join(OUTPUT_DIR, 'archive-filter-replay-reduced-terminal.png')
  await reducedPage.screenshot({ path: reducedScreenshot, fullPage: true })
  await reducedContext.close()

  const summary = {
    evidenceKind: 'controlled-local-production-build',
    page: 'archive',
    path: '/archive',
    normalVideo: videoPath,
    finalScreenshot,
    reducedScreenshot,
    pressFeedback,
    replaySequences,
    noFlashConfirmed: replaySequences.every((sequence) => !sequence.firstFrameFlashDetected),
    rapidSwitch: {
      tabs: rapidTabs,
      noStuckHidden: rapidNoStuckHidden,
      terminalState: rapidTerminalState,
    },
    reducedMotion: {
      terminalVisible: reducedTerminalVisible,
      terminalState: reducedTerminalState,
    },
    moreButtonGone,
    clickability,
    console: consoleEntries,
    pageErrors,
  }
  await writeFile(join(OUTPUT_DIR, 'archive-filter-replay-summary.json'), JSON.stringify(summary, null, 2))

  expect(videoPath).toContain(OUTPUT_DIR)
  expect(pressFeedback.changedDuringPress).toBe(true)
  expect(replaySequences.every((sequence) => sequence.motionChanged)).toBe(true)
  expect(replaySequences.every((sequence) => !sequence.firstFrameFlashDetected)).toBe(true)
  expect(rapidNoStuckHidden).toBe(true)
  expect(reducedTerminalVisible).toBe(true)
  expect(moreButtonGone).toBe(true)
  expect(Object.values(clickability).every(Boolean)).toBe(true)
  expect(consoleEntries.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
  expect(pageErrors.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
})
