import { test, expect, type Browser, type BrowserContext, type ConsoleMessage, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { getMountainDistanceKm, matchesMountainLengthBand } from '../../src/lib/mountain-route-display'
import {
  createGpsCheckinViaApi,
  createPngDataUrl,
  createTestEmail,
  fetchMostPopularMountain,
  registerFreshUser,
} from './community.helpers'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu76-p2iii-acceptance'
const FU110_OUTPUT_DIR = join(process.cwd(), 'output/fu86-explore-acceptance/fu110-strong-coupling')
const FU111_OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu111-acceptance'
const STORAGE_STATE = join(OUTPUT_DIR, 'fu76-p2iii-storage-state.json')

type PageKey = 'archive' | 'profile' | 'faq' | 'activity'
type ArchiveFilterId = 'all' | 'summit' | 'proof' | 'unproof'

type ExploreMountainEvidenceRow = {
  id: string
  name: string
  latitude: number
  longitude: number
  altitude: number
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  checkin_count: number
  length_km?: number | null
}

type ExploreReplayReason = 'geo' | 'tag' | 'advancedFilter'
type ExploreReplayReasonLog = {
  queuedReasons: ExploreReplayReason[]
  firedReplayReasons: ExploreReplayReason[]
}

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
      identity: '[data-archive-motion="identity"]',
      filters: '[data-archive-motion="filters"]',
      firstCard: '[data-archive-trip-card]',
    },
    motionTargets: {
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

async function markEvidenceProfileOnboarded(username: string) {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_version: '2026-v2',
      onboarding_completed_at: new Date('2026-07-06T00:00:00.000Z').toISOString(),
    })
    .eq('username', username)
  if (error) throw new Error(`Failed to mark FU-110 evidence profile onboarded: ${error.message}`)
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

async function seedPublishedPostForCheckin(page: Page, baseURL: string, checkinId: string) {
  const imageUrl = createPngDataUrl()
  const assetId = `fu111-share-asset-${Date.now()}`
  const response = await page.request.post(`${baseURL}/api/community/actions`, {
    data: {
      action: 'create_or_update_post',
      checkinId,
      title: 'FU-111 press evidence share',
      body: 'Controlled published post for profile share-row press evidence.',
      visibility: 'public',
      tags: [],
      assets: [
        {
          id: assetId,
          checkin_id: checkinId,
          type: 'image',
          url: imageUrl,
          thumbnail_url: imageUrl,
          created_at: new Date().toISOString(),
          sort_order: 0,
          source: 'record',
        },
      ],
      coverAssetId: assetId,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok() || typeof payload?.postId !== 'string') {
    throw new Error(`Failed to seed FU-111 profile share row: ${JSON.stringify(payload)}`)
  }
  return String(payload.postId)
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
  if (/analytics|favicon|maplibre|Unable to load glyph range|protomaps|basemaps-assets|Failed to load resource|net::ERR|401|403|404/i.test(text)) return 'environment'
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
  geolocation?: 'deny' | 'absent' | {
    latitude: number
    longitude: number
    delayMs: number
  }
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
  if (options.geolocation === 'deny') {
    await context.addInitScript(() => {
      const deniedError = { code: 1, message: 'FU-110 controlled geolocation denied' }
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(_success: PositionCallback, error?: PositionErrorCallback) {
            window.setTimeout(() => error?.(deniedError as GeolocationPositionError), 0)
          },
          watchPosition(_success: PositionCallback, error?: PositionErrorCallback) {
            window.setTimeout(() => error?.(deniedError as GeolocationPositionError), 0)
            return 110
          },
          clearWatch() {},
        },
      })
    })
  } else if (options.geolocation === 'absent') {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: undefined,
      })
    })
  } else if (options.geolocation) {
    await context.grantPermissions(['geolocation'], { origin: baseURL })
    await context.addInitScript((geo) => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback) {
            window.setTimeout(() => {
              success({
                coords: {
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                  accuracy: 5,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: null,
                },
                timestamp: Date.now(),
              } as GeolocationPosition)
            }, geo.delayMs)
          },
          watchPosition(success: PositionCallback) {
            window.setTimeout(() => {
              success({
                coords: {
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                  accuracy: 5,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: null,
                },
                timestamp: Date.now(),
              } as GeolocationPosition)
            }, geo.delayMs)
            return 110
          },
          clearWatch() {},
        },
      })
    }, options.geolocation)
  }
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

function exploreHaversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusKm = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function fetchExploreEvidenceMountains() {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('mountains')
    .select('id, name, latitude, longitude, altitude, difficulty, checkin_count, length_km')
    .eq('is_active', true)
    .order('checkin_count', { ascending: false })
    .limit(80)
  if (error) throw new Error(`Failed to load FU-110 explore evidence mountains: ${error.message}`)
  const rows = (data ?? []) as ExploreMountainEvidenceRow[]
  if (rows.length < 5) throw new Error(`FU-110 geo evidence needs at least 5 active mountains; got ${rows.length}.`)
  return rows
}

function firstFourIds(rows: ExploreMountainEvidenceRow[]) {
  return rows.slice(0, 4).map((mountain) => mountain.id)
}

function chooseSortChangingCoordinate(rows: ExploreMountainEvidenceRow[]) {
  const popularityFirst4 = firstFourIds(rows)
  for (const candidate of rows.slice(4)) {
    const distanceSorted = [...rows].sort((a, b) =>
      exploreHaversine(candidate.latitude, candidate.longitude, a.latitude, a.longitude) -
      exploreHaversine(candidate.latitude, candidate.longitude, b.latitude, b.longitude)
    )
    const distanceFirst4 = firstFourIds(distanceSorted)
    if (distanceFirst4.join('|') !== popularityFirst4.join('|')) {
      return {
        coordinate: {
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          mountainId: candidate.id,
          mountainName: candidate.name,
        },
        predictedFirst4Before: popularityFirst4,
        predictedFirst4After: distanceFirst4,
      }
    }
  }
  throw new Error('FU-110 geo evidence could not find a controlled coordinate that changes first4 ordering.')
}

type ExploreElementState = {
  id: string | null
  opacity: number
  transform: string
  visibility: string
  text: string
  stuck: boolean
}

type ExploreReplaySample = {
  label: string
  atMs: number
  positionState: string | null
  first4Ids: string[]
  listSubheading: ExploreElementState[]
  cards: ExploreElementState[]
  emptyState: ExploreElementState[]
}

type ExploreOpacityTraceSample = {
  atMs: number
  id: string | null
  opacity: number
  visibility: string
  transform: string
  positionState: string | null
  first4: Array<{
    id: string | null
    opacity: number
    visibility: string
    transform: string
  }>
}

type ExploreOpacityTraceScenario = 'denied' | 'absent' | 'spa-cache-hit' | 'spa-cache-miss'

type ExploreOpacityTrace = {
  scenario: ExploreOpacityTraceScenario
  samples: ExploreOpacityTraceSample[]
  firstCardIdUnchanged: boolean
  rises: number
  dipAfterHigh: boolean
  minOpacityAfterFirstHigh: number | null
  listWideResetAfterHigh: boolean
  queuedReasons: ExploreReplayReason[]
  firedReplayReasons: ExploreReplayReason[]
}

function serializeExploreStateChanged(left: ExploreElementState | undefined, right: ExploreElementState | undefined) {
  if (!left || !right) return false
  return left.opacity !== right.opacity ||
    left.transform !== right.transform ||
    left.visibility !== right.visibility ||
    left.text !== right.text
}

function exploreReplayHasMotion(samples: ExploreReplaySample[]) {
  const initial = samples[0]?.cards[0] ?? samples[0]?.emptyState[0] ?? samples[0]?.listSubheading[0]
  const mid = samples.find((sample) => sample.label === 'mid')?.cards[0] ??
    samples.find((sample) => sample.label === 'mid')?.emptyState[0] ??
    samples.find((sample) => sample.label === 'mid')?.listSubheading[0]
  const final = samples.at(-1)?.cards[0] ?? samples.at(-1)?.emptyState[0] ?? samples.at(-1)?.listSubheading[0]
  return serializeExploreStateChanged(initial, mid) && serializeExploreStateChanged(mid, final)
}

function noSourceReplayReasons(log: ExploreReplayReasonLog) {
  return log.queuedReasons.length === 0 && log.firedReplayReasons.length === 0
}

function expectSingleVisualRise(trace: ExploreOpacityTrace) {
  expect(trace.samples.length).toBeGreaterThan(60)
  expect(trace.rises).toBe(1)
  expect(trace.dipAfterHigh).toBe(false)
  expect(trace.minOpacityAfterFirstHigh ?? 1).toBeGreaterThan(0.2)
  expect(trace.listWideResetAfterHigh).toBe(false)
}

async function getExploreReplayReasonLog(page: Page): Promise<ExploreReplayReasonLog> {
  return page.evaluate(() => {
    const win = window as Window & { __fu110ExploreReplayReasons?: ExploreReplayReasonLog }
    return win.__fu110ExploreReplayReasons ?? { queuedReasons: [], firedReplayReasons: [] }
  })
}

async function captureExplorePlainLoadOpacityTrace(
  page: Page,
  scenario: ExploreOpacityTraceScenario,
  durationMs = 1700,
): Promise<ExploreOpacityTrace> {
  return page.evaluate(async ({ traceScenario, traceDurationMs }) => {
    const samples: ExploreOpacityTraceSample[] = []
    const startedAt = performance.now()
    const getCards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]')).slice(0, 4)
    const serializeCard = (card: HTMLElement) => {
      const style = window.getComputedStyle(card)
      const href = card.getAttribute('href') ?? ''
      return {
        id: href.split('/').filter(Boolean).at(-1) ?? null,
        opacity: Number.parseFloat(style.opacity || '1'),
        visibility: style.visibility,
        transform: style.transform,
      }
    }

    const sample = () => {
      const cards = getCards()
      const card = cards[0]
      if (!card) return
      const first4 = cards.map(serializeCard)
      const first = first4[0]
      samples.push({
        atMs: Number((performance.now() - startedAt).toFixed(2)),
        id: first.id,
        opacity: first.opacity,
        visibility: first.visibility,
        transform: first.transform,
        positionState: document.querySelector<HTMLElement>('.explore-page-shell')?.dataset.explorePositionState ?? null,
        first4,
      })
    }

    await new Promise<void>((resolve) => {
      const tick = () => {
        sample()
        if (performance.now() - startedAt >= traceDurationMs) {
          resolve()
          return
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })

    const ids = samples.map((trace) => trace.id).filter(Boolean)
    let rises = 0
    let armedForRise = true
    let hasBeenHigh = false
    let dipAfterHigh = false
    let minOpacityAfterFirstHigh: number | null = null
    let listWideResetAfterHigh = false
    for (const trace of samples) {
      if (trace.opacity <= 0.2) armedForRise = true
      if (armedForRise && trace.opacity >= 0.85) {
        rises += 1
        armedForRise = false
      }
      if (hasBeenHigh) {
        minOpacityAfterFirstHigh = minOpacityAfterFirstHigh === null
          ? trace.opacity
          : Math.min(minOpacityAfterFirstHigh, trace.opacity)
        if (trace.opacity <= 0.2) dipAfterHigh = true
        const resetCount = trace.first4.filter((card) => card.opacity <= 0.2 || card.visibility === 'hidden').length
        if (resetCount >= Math.min(3, trace.first4.length)) listWideResetAfterHigh = true
      }
      if (trace.opacity >= 0.85) hasBeenHigh = true
    }
    const win = window as Window & { __fu110ExploreReplayReasons?: ExploreReplayReasonLog }
    const reasons = win.__fu110ExploreReplayReasons ?? { queuedReasons: [], firedReplayReasons: [] }

    return {
      scenario: traceScenario,
      samples,
      firstCardIdUnchanged: ids.length > 0 && new Set(ids).size === 1,
      rises,
      dipAfterHigh,
      minOpacityAfterFirstHigh,
      listWideResetAfterHigh,
      queuedReasons: reasons.queuedReasons,
      firedReplayReasons: reasons.firedReplayReasons,
    }
  }, { traceScenario: scenario, traceDurationMs: durationMs })
}

async function installExploreSpaRouteTrace(page: Page, scenario: ExploreOpacityTraceScenario, durationMs = 2400) {
  await page.evaluate(({ traceScenario, traceDurationMs }) => {
    const win = window as Window & { __fu110ExploreSpaTracePromise?: Promise<ExploreOpacityTrace> }
    win.__fu110ExploreSpaTracePromise = new Promise<ExploreOpacityTrace>((resolve) => {
      const samples: ExploreOpacityTraceSample[] = []
      let startedAt: number | null = null
      const getCards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]')).slice(0, 4)
      const serializeCard = (card: HTMLElement) => {
        const style = window.getComputedStyle(card)
        const href = card.getAttribute('href') ?? ''
        return {
          id: href.split('/').filter(Boolean).at(-1) ?? null,
          opacity: Number.parseFloat(style.opacity || '1'),
          visibility: style.visibility,
          transform: style.transform,
        }
      }
      const finish = () => {
        const ids = samples.map((trace) => trace.id).filter(Boolean)
        let rises = 0
        let armedForRise = true
        let hasBeenHigh = false
        let dipAfterHigh = false
        let minOpacityAfterFirstHigh: number | null = null
        let listWideResetAfterHigh = false
        for (const trace of samples) {
          if (trace.opacity <= 0.2) armedForRise = true
          if (armedForRise && trace.opacity >= 0.85) {
            rises += 1
            armedForRise = false
          }
          if (hasBeenHigh) {
            minOpacityAfterFirstHigh = minOpacityAfterFirstHigh === null
              ? trace.opacity
              : Math.min(minOpacityAfterFirstHigh, trace.opacity)
            if (trace.opacity <= 0.2) dipAfterHigh = true
            const resetCount = trace.first4.filter((card) => card.opacity <= 0.2 || card.visibility === 'hidden').length
            if (resetCount >= Math.min(3, trace.first4.length)) listWideResetAfterHigh = true
          }
          if (trace.opacity >= 0.85) hasBeenHigh = true
        }
        const reasons = win.__fu110ExploreReplayReasons ?? { queuedReasons: [], firedReplayReasons: [] }
        resolve({
          scenario: traceScenario,
          samples,
          firstCardIdUnchanged: ids.length > 0 && new Set(ids).size === 1,
          rises,
          dipAfterHigh,
          minOpacityAfterFirstHigh,
          listWideResetAfterHigh,
          queuedReasons: reasons.queuedReasons,
          firedReplayReasons: reasons.firedReplayReasons,
        })
      }
      const tick = () => {
        const cards = getCards()
        const firstCard = cards[0]
        if (firstCard && window.location.pathname === '/explore') {
          if (startedAt === null) startedAt = performance.now()
          const first4 = cards.map(serializeCard)
          const first = first4[0]
          samples.push({
            atMs: Number((performance.now() - startedAt).toFixed(2)),
            id: first.id,
            opacity: first.opacity,
            visibility: first.visibility,
            transform: first.transform,
            positionState: document.querySelector<HTMLElement>('.explore-page-shell')?.dataset.explorePositionState ?? null,
            first4,
          })
          if (performance.now() - startedAt >= traceDurationMs) {
            finish()
            return
          }
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, { traceScenario: scenario, traceDurationMs: durationMs })
}

async function readExploreSpaRouteTrace(page: Page): Promise<ExploreOpacityTrace> {
  return page.evaluate(() => {
    const win = window as Window & { __fu110ExploreSpaTracePromise?: Promise<ExploreOpacityTrace> }
    if (!win.__fu110ExploreSpaTracePromise) throw new Error('FU-110 SPA route trace was not installed.')
    return win.__fu110ExploreSpaTracePromise
  })
}

async function bypassIntroOverlayForExploreEvidence(page: Page) {
  await page.evaluate(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.dispatchEvent(new CustomEvent('peak-trekker:onboarding-update'))
  })
  const skipButton = page.getByRole('button', { name: '跳过' })
  await skipButton.waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
  if (await skipButton.count()) {
    await skipButton.click({ force: true, timeout: 15_000 })
    await expect(skipButton).not.toBeVisible({ timeout: 10_000 })
  }
  const provincePrompt = page.getByText('先选一个与你有连接的地方。')
  await provincePrompt.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {})
  if (await provincePrompt.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '四川' }).click()
    await page.getByRole('button', { name: '生成空白执照' }).click()
    await expect(provincePrompt).not.toBeVisible({ timeout: 10_000 })
  }
}

async function snapshotExploreReplayState(page: Page, label: string, startedAt: number): Promise<ExploreReplaySample> {
  return page.evaluate(({ sampleLabel, sampleStartedAt }) => {
    const serialize = (element: HTMLElement): ExploreElementState => {
      const style = window.getComputedStyle(element)
      const opacity = Number.parseFloat(style.opacity || '1')
      const href = element.getAttribute('href') ?? ''
      const id = href.split('/').filter(Boolean).at(-1) ?? element.dataset.exploreMotion ?? null
      return {
        id,
        opacity,
        transform: style.transform,
        visibility: style.visibility,
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        stuck: opacity < 0.99 || style.visibility === 'hidden' || style.transform !== 'none',
      }
    }
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]')).slice(0, 4)
    return {
      label: sampleLabel,
      atMs: Math.round(performance.now() - sampleStartedAt),
      positionState: document.querySelector<HTMLElement>('.explore-page-shell')?.dataset.explorePositionState ?? null,
      first4Ids: cards.map((card) => (card.getAttribute('href') ?? '').split('/').filter(Boolean).at(-1) ?? ''),
      listSubheading: Array.from(document.querySelectorAll<HTMLElement>('[data-explore-motion="list-subheading"]')).map(serialize),
      cards: cards.map(serialize),
      emptyState: Array.from(document.querySelectorAll<HTMLElement>('[data-explore-list-empty]')).map(serialize),
    }
  }, { sampleLabel: label, sampleStartedAt: startedAt })
}

async function getExploreFirst4Ids(page: Page) {
  return page.locator('[data-testid="explore-mountain-card"]').evaluateAll((cards) =>
    cards.slice(0, 4).map((card) => (card.getAttribute('href') ?? '').split('/').filter(Boolean).at(-1) ?? '')
  )
}

async function collectExploreVisibility(page: Page) {
  return {
    listHeading: await page.locator('[data-explore-motion="list-heading"]').first().isVisible().catch(() => false),
    quickTags: await page.locator('.explore-filter-chip').first().isVisible().catch(() => false),
    listSubheading: await page.locator('[data-explore-motion="list-subheading"]').first().isVisible().catch(() => false),
    firstCard: await page.locator('[data-testid="explore-mountain-card"]').first().isVisible().catch(() => false),
    emptyState: await page.locator('[data-explore-list-empty]').first().isVisible().catch(() => false),
  }
}

async function collectExploreTerminalState(page: Page) {
  return page.evaluate(() => {
    const serialize = (element: HTMLElement) => {
      const style = window.getComputedStyle(element)
      const opacity = Number.parseFloat(style.opacity || '1')
      return {
        marker: element.dataset.exploreMotion ?? element.getAttribute('href') ?? element.dataset.exploreListEmpty ?? element.className,
        opacity,
        transform: style.transform,
        visibility: style.visibility,
        stuck: opacity < 0.99 || style.visibility === 'hidden' || style.transform !== 'none',
      }
    }
    return [
      ...Array.from(document.querySelectorAll<HTMLElement>('[data-explore-motion]')),
      ...Array.from(document.querySelectorAll<HTMLElement>('.explore-filter-chip')),
      ...Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]')).slice(0, 4),
      ...Array.from(document.querySelectorAll<HTMLElement>('[data-explore-list-empty]')),
    ].map(serialize)
  })
}

const EXPLORE_DIFFICULTY_LABEL: Record<ExploreMountainEvidenceRow['difficulty'] | 'all', string> = {
  all: '全部',
  beginner: '入门线',
  intermediate: '进阶线',
  advanced: '高阶线',
  expert: '专家线',
}

const EXPLORE_ALTITUDE_LABEL = {
  all: '全部',
  low: '<2000m',
  mid: '2000-4000m',
  high: '>4000m',
} as const

const EXPLORE_LENGTH_LABEL = {
  all: '全部',
  short: '短线',
  mid: '中线',
  long: '长线',
} as const

type ExploreFilterCombo = {
  difficulty: keyof typeof EXPLORE_DIFFICULTY_LABEL
  altitude: keyof typeof EXPLORE_ALTITUDE_LABEL
  length: keyof typeof EXPLORE_LENGTH_LABEL
}

function chooseEmptyExploreFilterCombo(rows: ExploreMountainEvidenceRow[]): ExploreFilterCombo {
  const difficulties = ['beginner', 'intermediate', 'advanced', 'expert'] as const
  const altitudes = ['low', 'mid', 'high'] as const
  const lengths = ['short', 'mid', 'long'] as const
  const matches = (row: ExploreMountainEvidenceRow, combo: ExploreFilterCombo) => {
    const length = getMountainDistanceKm(row)
    const altitudeMatch =
      combo.altitude === 'low' ? row.altitude < 2000 :
        combo.altitude === 'mid' ? row.altitude >= 2000 && row.altitude < 4000 :
          row.altitude >= 4000
    const lengthMatch = matchesMountainLengthBand(length, combo.length)
    return row.difficulty === combo.difficulty && altitudeMatch && lengthMatch
  }
  for (const difficulty of difficulties) {
    for (const altitude of altitudes) {
      for (const length of lengths) {
        const combo = { difficulty, altitude, length }
        if (!rows.some((row) => matches(row, combo))) return combo
      }
    }
  }
  throw new Error('FU-110 empty-state evidence could not find an advanced-filter combination with zero results.')
}

async function clickExploreFilterAndSample(page: Page, locator: ReturnType<Page['locator']>, label: string) {
  const startedAt = await page.evaluate(() => performance.now())
  await locator.click()
  const samples: ExploreReplaySample[] = []
  samples.push(await snapshotExploreReplayState(page, 'initial', startedAt))
  await page.waitForTimeout(180)
  samples.push(await snapshotExploreReplayState(page, 'mid', startedAt))
  await page.waitForTimeout(560)
  samples.push(await snapshotExploreReplayState(page, 'final', startedAt))
  return {
    label,
    samples,
    motionChanged: exploreReplayHasMotion(samples),
  }
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
    clickability['archive-no-page-back'] = await page.getByRole('button', { name: '返回' }).count()
      .then((count) => count === 0)
      .catch(() => false)
    clickability['archive-tabbar'] = await page.locator('.pt-tab-link[href="/archive"]').isVisible()
      .catch(() => false)
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

type PressStyleSnapshot = {
  opacity: string
  transform: string
  filter: string
  backgroundColor: string
  borderColor: string
  afterOpacity: string
  afterBorderRadius: string
  afterBoxShadow: string
  box: { x: number; y: number; width: number; height: number }
}

type PressEvidence = {
  label: string
  selector: string
  before: PressStyleSnapshot
  pressed: PressStyleSnapshot
  released: PressStyleSnapshot
  visualChanged: boolean
  returnedToTerminal: boolean
  screenshot: string
}

async function snapshotPressStyle(locator: Locator): Promise<PressStyleSnapshot> {
  return locator.evaluate((element) => {
    const style = window.getComputedStyle(element as HTMLElement)
    const afterStyle = window.getComputedStyle(element as HTMLElement, '::after')
    const box = (element as HTMLElement).getBoundingClientRect()
    return {
      opacity: style.opacity,
      transform: style.transform,
      filter: style.filter,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      afterOpacity: afterStyle.opacity,
      afterBorderRadius: afterStyle.borderRadius,
      afterBoxShadow: afterStyle.boxShadow,
      box: {
        x: Number(box.x.toFixed(2)),
        y: Number(box.y.toFixed(2)),
        width: Number(box.width.toFixed(2)),
        height: Number(box.height.toFixed(2)),
      },
    }
  })
}

function pressStyleChanged(before: PressStyleSnapshot, pressed: PressStyleSnapshot) {
  return before.transform !== pressed.transform ||
    before.filter !== pressed.filter ||
    before.backgroundColor !== pressed.backgroundColor ||
    before.borderColor !== pressed.borderColor ||
    before.opacity !== pressed.opacity ||
    before.afterOpacity !== pressed.afterOpacity
}

function normalizeTerminalTransform(value: string) {
  return value === 'none' || value === 'matrix(1, 0, 0, 1, 0, 0)' ? 'identity' : value
}

async function collectHeldPressEvidence(page: Page, label: string, target: string | Locator, screenshotPath: string): Promise<PressEvidence> {
  const locator = typeof target === 'string' ? page.locator(target).first() : target.first()
  const selector = typeof target === 'string' ? target : label
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate((element) => new Promise<void>((resolve) => {
    const deadline = performance.now() + 5000
    const isTerminalTransform = (value: string) => value === 'none' || value === 'matrix(1, 0, 0, 1, 0, 0)'
    const tick = () => {
      const style = window.getComputedStyle(element as HTMLElement)
      if (Number(style.opacity) > 0.99 && style.visibility !== 'hidden' && isTerminalTransform(style.transform)) {
        resolve()
        return
      }
      if (performance.now() >= deadline) {
        resolve()
        return
      }
      window.requestAnimationFrame(tick)
    }
    tick()
  }))
  const before = await snapshotPressStyle(locator)
  const box = await locator.boundingBox()
  if (!box) throw new Error(`FU-111 press target has no box: ${label}`)
  await locator.evaluate((element) => {
    const target = element as HTMLElement
    const preventClickOnce = (event: MouseEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      target.removeEventListener('click', preventClickOnce, true)
    }
    target.addEventListener('click', preventClickOnce, true)
  })
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(180)
  const pressed = await snapshotPressStyle(locator)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  await page.mouse.up()
  await page.mouse.move(1, 1)
  await page.waitForTimeout(180)
  const released = await snapshotPressStyle(locator)
  return {
    label,
    selector,
    before,
    pressed,
    released,
    visualChanged: pressStyleChanged(before, pressed),
    returnedToTerminal: normalizeTerminalTransform(released.transform) === normalizeTerminalTransform(before.transform) && released.filter === before.filter,
    screenshot: screenshotPath,
  }
}

async function collectPointerFallbackReset(page: Page, selector: string) {
  const locator = page.locator(selector).first()
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error(`FU-111 pointer fallback target has no box: ${selector}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const activeAfterDown = await locator.evaluate((element) => (element as HTMLElement).dataset.ptPressActive === 'true')
  await page.mouse.up()
  const activeAfterUp = await locator.evaluate((element) => (element as HTMLElement).dataset.ptPressActive === 'true')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 32, box.y + box.height + 32)
  const activeAfterLeave = await locator.evaluate((element) => (element as HTMLElement).dataset.ptPressActive === 'true')
  await page.mouse.up().catch(() => undefined)
  await locator.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await locator.dispatchEvent('pointercancel', { pointerType: 'touch', bubbles: true })
  const activeAfterCancel = await locator.evaluate((element) => (element as HTMLElement).dataset.ptPressActive === 'true')
  await locator.focus()
  await locator.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await locator.evaluate((element) => (element as HTMLElement).blur())
  const activeAfterBlur = await locator.evaluate((element) => (element as HTMLElement).dataset.ptPressActive === 'true')
  return {
    activeAfterDown,
    activeAfterUp,
    activeAfterLeave,
    activeAfterCancel,
    activeAfterBlur,
    resetOk: activeAfterDown && !activeAfterUp && !activeAfterLeave && !activeAfterCancel && !activeAfterBlur,
  }
}

test('FU-111 global L1 press feedback evidence', async ({ browser, page, baseURL }) => {
  test.setTimeout(240_000)
  if (!baseURL) throw new Error('Playwright baseURL is required for FU-111 press evidence.')
  await mkdir(OUTPUT_DIR, { recursive: true })
  await mkdir(FU111_OUTPUT_DIR, { recursive: true })

  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  const registeredUser = await registerFreshUser(page, baseURL, {
    returnTo: '/explore',
    email: createTestEmail('fu111'),
    username: `fu111-${Date.now()}`,
    province: '四川',
  })
  await markEvidenceProfileOnboarded(registeredUser.username)
  const mountain = await fetchMostPopularMountain()
  const checkinId = await createGpsCheckinViaApi(page, mountain, `fu111-${Date.now()}`)
  await seedActivityPhoto(checkinId)
  await seedPublishedPostForCheckin(page, baseURL, checkinId)
  await seedArchiveReplayRows({ page, email: registeredUser.email, mountain })
  await page.context().storageState({ path: STORAGE_STATE })

  const videoDir = join(FU111_OUTPUT_DIR, 'videos')
  await mkdir(videoDir, { recursive: true })
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: PageEvidence['pageErrors'] = []
  const context = await newEvidenceContext(browser, baseURL, {
    recordVideo: true,
    videoDir,
    reducedMotion: 'no-preference',
    geolocation: { latitude: mountain.latitude, longitude: mountain.longitude, delayMs: 0 },
  })
  const pressPage = await context.newPage()
  await attachCapture(pressPage, consoleEntries, pageErrors)

  const pressEvidence: PressEvidence[] = []
  const addPress = async (label: string, selector: string | Locator) => {
    const safeLabel = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const screenshotPath = join(FU111_OUTPUT_DIR, `${safeLabel}-pressed.png`)
    pressEvidence.push(await collectHeldPressEvidence(pressPage, label, selector, screenshotPath))
  }

  await pressPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-explore-pathway-card="导入记录"]').waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('tabbar-archive-icon', '.pt-tab-link[href="/archive"] .pt-tab-icon')
  await addPress('explore-import-hero', '[data-explore-pathway-button="导入记录"]')
  await addPress('explore-screenshot-hero', '[data-explore-pathway-button="识别截图"]')
  const pathwayTransformSeparation = await pressPage.evaluate(() => {
    const scenePanel = document.querySelector<HTMLElement>('[data-explore-motion="pathways"]')
    const pathwayTarget = document.querySelector<HTMLElement>('[data-explore-pathway-card="导入记录"]')
    const button = document.querySelector<HTMLElement>('[data-explore-pathway-button="导入记录"]')
    return {
      sameNode: pathwayTarget === button,
      scenePanelHasPressClass: Boolean(scenePanel?.className?.includes('pt-pathway-press')),
      buttonHasPressClass: Boolean(button?.className?.includes('pt-pathway-press')),
      scenePanelTransform: scenePanel ? window.getComputedStyle(scenePanel).transform : null,
      buttonTransform: button ? window.getComputedStyle(button).transform : null,
    }
  })
  await addPress('explore-mountain-inner-card', '[data-testid="explore-mountain-card"] .explore-card')
  const exploreTransformSeparation = await pressPage.evaluate(() => {
    const outer = document.querySelector<HTMLElement>('[data-testid="explore-mountain-card"]')
    const inner = document.querySelector<HTMLElement>('[data-testid="explore-mountain-card"] .explore-card')
    return {
      outerHasPressClass: Boolean(outer?.className?.includes('pt-pressable')),
      innerHasPressClass: Boolean(inner?.className?.includes('pt-pressable-card')),
      outerTransform: outer ? window.getComputedStyle(outer).transform : null,
      innerTransform: inner ? window.getComputedStyle(inner).transform : null,
    }
  })

  await pressPage.locator('.pt-tab-link[href="/archive"]').click()
  await pressPage.waitForURL(/\/archive/, { timeout: 20_000 })
  await pressPage.locator('[data-archive-filter-tab="summit"]').waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('archive-filter-summit', '[data-archive-filter-tab="summit"]')
  await addPress('archive-trip-card', '[data-archive-trip-card]')

  await pressPage.goto('/profile', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-profile-archive-card]').first().waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('profile-archive-row', '[data-profile-archive-card] [data-testid="profile-trip-activity-link"]')
  await addPress('profile-share-row', '[data-profile-share-row]')

  await pressPage.goto('/faq', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-faq-group-card]').first().waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('faq-group-card', '[data-faq-group-card] > button')

  await pressPage.goto(`/activity/${checkinId}`, { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-testid="activity-inline-actions"]').waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('activity-share-cta', '[data-testid="activity-inline-actions"] .pt-pressable-hero')
  await addPress('activity-photo-card', '[data-testid="activity-photo-tile-0"]')

  await pressPage.goto('/import', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-import-entry-motion="footer-primary"]').waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('import-main-cta', '[data-import-entry-motion="footer-primary"]')

  await pressPage.goto('/screenshot', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-screenshot-upload-motion="footer-primary"]').waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('screenshot-main-cta', '[data-screenshot-upload-motion="footer-primary"]')

  await pressPage.goto(`/share?checkinId=${checkinId}`, { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-testid="share-share-button"]').waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('share-primary-button', '[data-testid="share-share-button"]')
  await addPress('share-save-button', '[data-testid="share-save-button"]')
  await addPress('share-template-card', '[data-template-thumb]')
  await addPress('share-field-chip', '[data-field-key]')

  await pressPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-explore-pathway-button="导入记录"]').click()
  await pressPage.waitForURL(/\/import/, { timeout: 20_000 })
  const exploreImportClickNavigates = /\/import$/.test(new URL(pressPage.url()).pathname)
  await pressPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-explore-pathway-button="识别截图"]').click()
  await pressPage.waitForURL(/\/screenshot/, { timeout: 20_000 })
  const exploreScreenshotClickNavigates = /\/screenshot$/.test(new URL(pressPage.url()).pathname)
  await pressPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-testid="explore-mountain-card"]').first().click()
  await pressPage.waitForURL(/\/mountain\//, { timeout: 20_000 })
  const exploreCardClickNavigates = /\/mountain\//.test(pressPage.url())

  await pressPage.goto(`/trek?mountainId=${mountain.id}`, { waitUntil: 'domcontentloaded' })
  const trekStartControl = pressPage.locator('[data-onboarding="trek-start"]')
  const trekPermissionControl = pressPage.locator('.ui-btn-root:not([disabled])')
  const trekControl = await trekStartControl.first().isVisible().catch(() => false)
    ? trekStartControl
    : trekPermissionControl
  await trekControl.first().waitFor({ state: 'visible', timeout: 20_000 })
  await addPress('trek-record-or-permission-cta', trekControl)

  await pressPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await pressPage.locator('[data-explore-pathway-card="导入记录"]').waitFor({ state: 'visible', timeout: 20_000 })
  const pointerFallback = await collectPointerFallbackReset(pressPage, '[data-explore-pathway-button="导入记录"]')
  await pressPage.locator('.pt-tab-link[href="/profile"]').dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await pressPage.locator('.pt-tab-link[href="/profile"]').click()
  await pressPage.waitForURL(/\/profile/, { timeout: 20_000 })
  const stuckPressAfterFastRoute = await pressPage.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-pt-press-active="true"]')).map((element) => element.outerHTML.slice(0, 160))
  )
  const noHorizontalOverflow = await pressPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  const terminalScreenshot = join(FU111_OUTPUT_DIR, 'fu111-terminal.png')
  await pressPage.screenshot({ path: terminalScreenshot, fullPage: true })
  const video = pressPage.video()
  await context.close()
  const videoPath = video ? await video.path() : null

  const reducedContext = await newEvidenceContext(browser, baseURL, {
    reducedMotion: 'reduce',
  })
  const reducedPage = await reducedContext.newPage()
  await reducedPage.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await reducedPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await reducedPage.locator('[data-explore-pathway-button="导入记录"]').waitFor({ state: 'visible', timeout: 20_000 })
  const reducedEvidence = await collectHeldPressEvidence(
    reducedPage,
    'reduced-motion-explore-import',
    '[data-explore-pathway-button="导入记录"]',
    join(FU111_OUTPUT_DIR, 'reduced-motion-pressed.png'),
  )
  const reducedScreenshot = join(FU111_OUTPUT_DIR, 'reduced-motion-terminal.png')
  await reducedPage.screenshot({ path: reducedScreenshot, fullPage: true })
  await reducedContext.close()

  const summary = {
    evidenceKind: 'controlled-local-production-build',
    scope: 'FU-111 global L1 click/tap feedback',
    viewport: { width: 375, height: 812 },
    video: videoPath,
    terminalScreenshot,
    reducedScreenshot,
    pressEvidence,
    reducedMotion: {
      evidence: reducedEvidence,
      noTransformResidue: reducedEvidence.pressed.transform === 'none' && reducedEvidence.released.transform === 'none',
      noHaloWhilePressed: reducedEvidence.pressed.afterOpacity === '0',
    },
    pointerFallback,
    fastRouteSwitch: {
      stuckPressAfterFastRoute,
      resetOk: stuckPressAfterFastRoute.length === 0,
    },
    clickNavigation: {
      exploreImportClickNavigates,
      exploreScreenshotClickNavigates,
      exploreCardClickNavigates,
    },
    pathwayTransformSeparation,
    exploreTransformSeparation,
    noHorizontalOverflow,
    console: consoleEntries,
    pageErrors,
  }
  const summaryPath = join(FU111_OUTPUT_DIR, 'fu111-press-summary.json')
  await writeFile(summaryPath, JSON.stringify(summary, null, 2))

  expect(videoPath).toContain(FU111_OUTPUT_DIR)
  expect(pressEvidence.every((entry) => entry.visualChanged)).toBe(true)
  expect(pressEvidence.every((entry) => entry.returnedToTerminal)).toBe(true)
  expect(pointerFallback.resetOk).toBe(true)
  expect(stuckPressAfterFastRoute).toEqual([])
  expect(exploreImportClickNavigates).toBe(true)
  expect(exploreScreenshotClickNavigates).toBe(true)
  expect(exploreCardClickNavigates).toBe(true)
  expect(pathwayTransformSeparation.sameNode).toBe(true)
  expect(pathwayTransformSeparation.scenePanelHasPressClass).toBe(false)
  expect(pathwayTransformSeparation.buttonHasPressClass).toBe(true)
  expect(exploreTransformSeparation.outerHasPressClass).toBe(false)
  expect(exploreTransformSeparation.innerHasPressClass).toBe(true)
  expect(reducedEvidence.pressed.transform).toBe('none')
  expect(reducedEvidence.pressed.afterOpacity).toBe('0')
  expect(reducedEvidence.released.transform).toBe('none')
  expect(noHorizontalOverflow).toBe(true)
  expect(consoleEntries.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
  expect(pageErrors.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
})

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
  clickability['archive-no-page-back'] = await evidencePage.getByRole('button', { name: '返回' }).count()
    .then((count) => count === 0)
    .catch(() => false)
  clickability['archive-tabbar'] = await evidencePage.locator('.pt-tab-link[href="/archive"]').isVisible()
    .catch(() => false)
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

test('FU-110 Explore entrance and async source replay evidence', async ({ browser, page, baseURL }) => {
  test.setTimeout(210_000)
  if (!baseURL) throw new Error('Playwright baseURL is required for FU-110 explore evidence.')
  await mkdir(FU110_OUTPUT_DIR, { recursive: true })

  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })

  const email = createTestEmail('fu110-explore')
  const registeredUser = await registerFreshUser(page, baseURL, {
    returnTo: '/explore',
    email,
    username: `fu110-explore-${Date.now()}`,
    province: '四川',
  })
  await markEvidenceProfileOnboarded(registeredUser.username)
  await page.context().storageState({ path: STORAGE_STATE })

  const mountains = await fetchExploreEvidenceMountains()
  const geoChoice = chooseSortChangingCoordinate(mountains)
  const emptyCombo = chooseEmptyExploreFilterCombo(mountains)
  const videoDir = join(FU110_OUTPUT_DIR, 'videos')
  await mkdir(videoDir, { recursive: true })

  const runPlainNoGeoScenario = async (
    scenario: ExploreOpacityTrace['scenario'],
    geolocation: 'deny' | 'absent',
  ) => {
    const consoleEntries: ConsoleEntry[] = []
    const pageErrors: PageEvidence['pageErrors'] = []
    const context = await newEvidenceContext(browser, baseURL, {
      recordVideo: true,
      videoDir,
      reducedMotion: 'no-preference',
      geolocation,
    })
    const noGeoPage = await context.newPage()
    await attachCapture(noGeoPage, consoleEntries, pageErrors)
    await noGeoPage.goto('/explore', { waitUntil: 'domcontentloaded' })
    await noGeoPage.locator('[data-testid="explore-mountain-card"]').first().waitFor({ state: 'attached', timeout: 20_000 })
    const trace = await captureExplorePlainLoadOpacityTrace(noGeoPage, scenario, 1700)
    const visibility = await collectExploreVisibility(noGeoPage)
    const terminalState = await collectExploreTerminalState(noGeoPage)
    const video = noGeoPage.video()
    await context.close()
    return {
      scenario,
      video: video ? await video.path() : null,
      trace,
      visibility,
      terminalState,
      console: consoleEntries,
      pageErrors,
    }
  }

  const noGeoDenied = await runPlainNoGeoScenario('denied', 'deny')
  const noGeoAbsent = await runPlainNoGeoScenario('absent', 'absent')

  const runSpaRouteReturnScenario = async (
    scenario: 'spa-cache-hit' | 'spa-cache-miss',
    startPath: '/explore' | '/profile',
    geoDelayMs: number,
  ) => {
    const consoleEntries: ConsoleEntry[] = []
    const pageErrors: PageEvidence['pageErrors'] = []
    const context = await newEvidenceContext(browser, baseURL, {
      recordVideo: true,
      videoDir,
      reducedMotion: 'no-preference',
      geolocation: {
        latitude: geoChoice.coordinate.latitude,
        longitude: geoChoice.coordinate.longitude,
        delayMs: geoDelayMs,
      },
    })
    const spaPage = await context.newPage()
    await attachCapture(spaPage, consoleEntries, pageErrors)

    const waitForBottomExploreTab = async () => {
      let hasExploreTab = false
      for (let attempt = 0; attempt < 40; attempt += 1) {
        hasExploreTab = await spaPage.evaluate(() =>
          Boolean(document.querySelector('nav a[href="/explore"], nav a[href$="/explore"]'))
        ).catch(() => false)
        if (hasExploreTab) break
        await spaPage.waitForTimeout(500)
      }
      const routeReturnDebug = hasExploreTab ? null : await spaPage.evaluate(() => ({
        href: window.location.href,
        pathname: window.location.pathname,
        navHtml: document.querySelector('nav')?.outerHTML ?? null,
        links: Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).map((link) => ({
          href: link.getAttribute('href'),
          text: link.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        })),
        bodyText: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 800) ?? '',
      }))
      expect(hasExploreTab, JSON.stringify(routeReturnDebug, null, 2)).toBe(true)
    }

    await spaPage.goto('/profile', { waitUntil: 'domcontentloaded' })
    await spaPage.waitForURL((url) => url.pathname === '/profile', { timeout: 20_000 })
    await bypassIntroOverlayForExploreEvidence(spaPage)

    if (startPath === '/explore') {
      await waitForBottomExploreTab()
      await spaPage.locator('nav a[href="/explore"]').first().click({ timeout: 20_000 })
      await spaPage.waitForURL((url) => url.pathname === '/explore', { timeout: 20_000 })
      await spaPage.locator('[data-testid="explore-mountain-card"]').first().waitFor({ state: 'attached', timeout: 20_000 })
      await spaPage.waitForFunction(() =>
        document.querySelector<HTMLElement>('.explore-page-shell')?.dataset.explorePositionState === 'resolved',
        null,
        { timeout: 20_000 }
      )
      await spaPage.waitForTimeout(700)
      await spaPage.goBack()
      await spaPage.waitForURL((url) => url.pathname === '/profile', { timeout: 20_000 })
    }

    await waitForBottomExploreTab()
    await spaPage.evaluate(() => {
      const win = window as Window & { __fu110ExploreReplayReasons?: ExploreReplayReasonLog }
      win.__fu110ExploreReplayReasons = { queuedReasons: [], firedReplayReasons: [] }
    })
    await installExploreSpaRouteTrace(spaPage, scenario, 2400)
    await spaPage.locator('nav a[href="/explore"]').first().click({ timeout: 20_000 })
    await expect(spaPage).toHaveURL(/\/explore/)
    await spaPage.locator('[data-testid="explore-mountain-card"]').first().waitFor({ state: 'attached', timeout: 20_000 })
    const trace = await readExploreSpaRouteTrace(spaPage)
    const reasonLog = await getExploreReplayReasonLog(spaPage)
    const terminalState = await collectExploreTerminalState(spaPage)
    const first4 = await getExploreFirst4Ids(spaPage)
    const video = spaPage.video()
    await context.close()
    return {
      scenario,
      video: video ? await video.path() : null,
      trace,
      reasonLog,
      terminalState,
      first4,
      console: consoleEntries,
      pageErrors,
    }
  }

  const spaCacheHit = await runSpaRouteReturnScenario('spa-cache-hit', '/explore', 140)
  const spaCacheMiss = await runSpaRouteReturnScenario('spa-cache-miss', '/profile', 780)

  const geoConsole: ConsoleEntry[] = []
  const geoPageErrors: PageEvidence['pageErrors'] = []
  const geoContext = await newEvidenceContext(browser, baseURL, {
    recordVideo: true,
    videoDir,
    reducedMotion: 'no-preference',
    geolocation: {
      latitude: geoChoice.coordinate.latitude,
      longitude: geoChoice.coordinate.longitude,
      delayMs: 520,
    },
  })
  const geoPage = await geoContext.newPage()
  await attachCapture(geoPage, geoConsole, geoPageErrors)
  await geoPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await geoPage.locator('[data-testid="explore-mountain-card"]').first().waitFor({ state: 'attached', timeout: 20_000 })
  const first4Before = await getExploreFirst4Ids(geoPage)
  await geoPage.evaluate(() => {
    const win = window as unknown as { __fu110ExploreGeoReplaySamples?: unknown[] }
    const serialize = (element: HTMLElement) => {
      const style = window.getComputedStyle(element)
      const opacity = Number.parseFloat(style.opacity || '1')
      const href = element.getAttribute('href') ?? ''
      return {
        id: href.split('/').filter(Boolean).at(-1) ?? element.dataset.exploreMotion ?? null,
        opacity,
        transform: style.transform,
        visibility: style.visibility,
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        stuck: opacity < 0.99 || style.visibility === 'hidden' || style.transform !== 'none',
      }
    }
    const sample = (label: string, startedAt: number) => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]')).slice(0, 4)
      return {
        label,
        atMs: Math.round(performance.now() - startedAt),
        positionState: document.querySelector<HTMLElement>('.explore-page-shell')?.dataset.explorePositionState ?? null,
        first4Ids: cards.map((card) => (card.getAttribute('href') ?? '').split('/').filter(Boolean).at(-1) ?? ''),
        listSubheading: Array.from(document.querySelectorAll<HTMLElement>('[data-explore-motion="list-subheading"]')).map(serialize),
        cards: cards.map(serialize),
        emptyState: Array.from(document.querySelectorAll<HTMLElement>('[data-explore-list-empty]')).map(serialize),
      }
    }
    const startSampling = () => {
      const startedAt = performance.now()
      win.__fu110ExploreGeoReplaySamples = [sample('initial', startedAt)]
      window.setTimeout(() => win.__fu110ExploreGeoReplaySamples?.push(sample('mid', startedAt)), 180)
      window.setTimeout(() => win.__fu110ExploreGeoReplaySamples?.push(sample('final', startedAt)), 720)
    }
    window.addEventListener('fu110:explore-replay-fired', (event) => {
      const reasons = ((event as CustomEvent).detail?.reasons ?? []) as string[]
      if (!reasons.includes('geo')) return
      startSampling()
    })
    const existingReasons = (
      window as Window & { __fu110ExploreReplayReasons?: ExploreReplayReasonLog }
    ).__fu110ExploreReplayReasons
    if (existingReasons?.firedReplayReasons.includes('geo')) startSampling()
  })
  await geoPage.waitForFunction(() =>
    document.querySelector<HTMLElement>('.explore-page-shell')?.dataset.explorePositionState === 'resolved',
    null,
    { timeout: 20_000 }
  )
  await geoPage.waitForFunction(() => {
    const state = window as unknown as { __fu110ExploreGeoReplaySamples?: unknown[] }
    return (state.__fu110ExploreGeoReplaySamples ?? []).length >= 3
  }, null, { timeout: 20_000 })
  const geoReplaySamples = await geoPage.evaluate(() => {
    const state = window as unknown as { __fu110ExploreGeoReplaySamples?: ExploreReplaySample[] }
    return state.__fu110ExploreGeoReplaySamples ?? []
  })
  const first4After = geoReplaySamples.at(-1)?.first4Ids ?? await getExploreFirst4Ids(geoPage)
  const sortChanged = first4Before.join('|') !== first4After.join('|')
  const geoReplayReasonLog = await getExploreReplayReasonLog(geoPage)

  await geoPage.getByRole('button', { name: '展开高级筛选' }).click()
  const emptyActions = [
    {
      label: `difficulty:${emptyCombo.difficulty}`,
      locator: geoPage.getByRole('button', { name: EXPLORE_DIFFICULTY_LABEL[emptyCombo.difficulty], exact: true }).last(),
    },
    {
      label: `altitude:${emptyCombo.altitude}`,
      locator: geoPage.getByRole('button', { name: EXPLORE_ALTITUDE_LABEL[emptyCombo.altitude], exact: true }),
    },
    {
      label: `length:${emptyCombo.length}`,
      locator: geoPage.getByRole('button', { name: EXPLORE_LENGTH_LABEL[emptyCombo.length], exact: true }),
    },
  ]
  const emptyReplays = []
  let emptyReplay = null as Awaited<ReturnType<typeof clickExploreFilterAndSample>> | null
  for (const action of emptyActions) {
    const replay = await clickExploreFilterAndSample(geoPage, action.locator, action.label)
    emptyReplays.push(replay)
    if ((replay.samples.at(-1)?.emptyState.length ?? 0) > 0) {
      emptyReplay = replay
      break
    }
  }
  if (!emptyReplay) {
    throw new Error(`FU-110 empty-state evidence did not reach an empty result for ${JSON.stringify(emptyCombo)}.`)
  }

  const restoreReplays = []
  let restoreReplay = null as Awaited<ReturnType<typeof clickExploreFilterAndSample>> | null
  for (const [index, label] of ['restore-difficulty', 'restore-altitude', 'restore-length'].entries()) {
    const replay = await clickExploreFilterAndSample(
      geoPage,
      geoPage.getByRole('button', { name: '全部', exact: true }).nth(index),
      label,
    )
    restoreReplays.push(replay)
    if ((replay.samples.at(-1)?.cards.length ?? 0) > 0) {
      restoreReplay = replay
      break
    }
  }
  if (!restoreReplay) {
    throw new Error('FU-110 restore evidence did not return to a non-empty result set.')
  }
  const geoVideo = geoPage.video()
  await geoContext.close()
  const geoVideoPath = geoVideo ? await geoVideo.path() : null

  const collisionConsole: ConsoleEntry[] = []
  const collisionErrors: PageEvidence['pageErrors'] = []
  const collisionContext = await newEvidenceContext(browser, baseURL, {
    reducedMotion: 'no-preference',
    geolocation: {
      latitude: geoChoice.coordinate.latitude,
      longitude: geoChoice.coordinate.longitude,
      delayMs: 520,
    },
  })
  const collisionPage = await collisionContext.newPage()
  await attachCapture(collisionPage, collisionConsole, collisionErrors)
  await collisionPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await collisionPage.locator('.explore-filter-chip').first().waitFor({ state: 'visible', timeout: 20_000 })
  for (const label of ['5000m+', '进阶线', '附近', '入门线', '附近']) {
    const chip = collisionPage.getByRole('button', { name: label, exact: true })
    if (await chip.isVisible().catch(() => false)) await chip.click()
  }
  await collisionPage.waitForFunction(() =>
    document.querySelector<HTMLElement>('.explore-page-shell')?.dataset.explorePositionState === 'resolved',
    null,
    { timeout: 20_000 }
  )
  await collisionPage.waitForTimeout(900)
  const collisionTerminalState = await collectExploreTerminalState(collisionPage)
  await collisionContext.close()

  const reducedContext = await newEvidenceContext(browser, baseURL, {
    reducedMotion: 'reduce',
    geolocation: 'deny',
  })
  const reducedPage = await reducedContext.newPage()
  await reducedPage.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await reducedPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await reducedPage.locator('[data-explore-motion="list-heading"]').waitFor({ state: 'visible', timeout: 20_000 })
  await reducedPage.waitForTimeout(600)
  const reducedTerminalState = await collectExploreTerminalState(reducedPage)
  const reducedScreenshot = join(FU110_OUTPUT_DIR, 'explore-reduced-terminal.png')
  await reducedPage.screenshot({ path: reducedScreenshot, fullPage: true })
  await reducedContext.close()

  const allConsole = [
    ...noGeoDenied.console,
    ...noGeoAbsent.console,
    ...spaCacheHit.console,
    ...spaCacheMiss.console,
    ...geoConsole,
    ...collisionConsole,
  ]
  const allPageErrors = [
    ...noGeoDenied.pageErrors,
    ...noGeoAbsent.pageErrors,
    ...spaCacheHit.pageErrors,
    ...spaCacheMiss.pageErrors,
    ...geoPageErrors,
    ...collisionErrors,
  ]
  const summary = {
    evidenceKind: 'controlled-local-production-build',
    page: 'explore',
    path: '/explore',
    noGeo: {
      denied: noGeoDenied,
      absent: noGeoAbsent,
    },
    spaRouteReturn: {
      cacheHit: spaCacheHit,
      cacheMiss: spaCacheMiss,
    },
    geo: {
      video: geoVideoPath,
      coordinate: geoChoice.coordinate,
      predictedFirst4Before: geoChoice.predictedFirst4Before,
      predictedFirst4After: geoChoice.predictedFirst4After,
      first4Before,
      first4After,
      sortChanged,
      replayReasons: geoReplayReasonLog,
      replaySamples: geoReplaySamples,
      motionChanged: exploreReplayHasMotion(geoReplaySamples),
    },
    emptyState: {
      combo: emptyCombo,
      replays: emptyReplays,
      selectedReplay: emptyReplay,
      restoreReplays,
      selectedRestoreReplay: restoreReplay,
    },
    rapidTagGeoCollision: {
      noStuckHidden: collisionTerminalState.every((state) => !state.stuck),
      terminalState: collisionTerminalState,
    },
    reducedMotion: {
      screenshot: reducedScreenshot,
      terminalVisible: reducedTerminalState.every((state) => !state.stuck),
      terminalState: reducedTerminalState,
    },
    console: allConsole,
    pageErrors: allPageErrors,
  }
  const summaryPath = join(FU110_OUTPUT_DIR, 'fu110-explore-summary.json')
  await writeFile(summaryPath, JSON.stringify(summary, null, 2))

  for (const noGeoRun of [noGeoDenied, noGeoAbsent]) {
    expect(noGeoRun.video).toContain(FU110_OUTPUT_DIR)
    expectSingleVisualRise(noGeoRun.trace)
    expect(noGeoRun.trace.samples.every((sample) => sample.positionState === 'null')).toBe(true)
    expect(noGeoRun.trace.firstCardIdUnchanged).toBe(true)
    expect(noSourceReplayReasons(noGeoRun.trace)).toBe(true)
    expect(noGeoRun.visibility.listHeading).toBe(true)
    expect(noGeoRun.visibility.quickTags).toBe(true)
    expect(noGeoRun.visibility.listSubheading).toBe(true)
    expect(noGeoRun.visibility.firstCard).toBe(true)
    expect(noGeoRun.terminalState.every((state) => !state.stuck)).toBe(true)
  }
  for (const spaRun of [spaCacheHit, spaCacheMiss]) {
    expect(spaRun.video).toContain(FU110_OUTPUT_DIR)
    expectSingleVisualRise(spaRun.trace)
    expect(spaRun.terminalState.every((state) => !state.stuck)).toBe(true)
  }
  expect(noSourceReplayReasons(spaCacheHit.reasonLog)).toBe(true)
  expect(sortChanged).toBe(true)
  expect(geoReplayReasonLog.queuedReasons).toContain('geo')
  expect(geoReplayReasonLog.firedReplayReasons).toContain('geo')
  expect(exploreReplayHasMotion(geoReplaySamples)).toBe(true)
  expect(emptyReplay.motionChanged).toBe(true)
  expect(emptyReplay.samples.at(-1)?.emptyState.every((state) => !state.stuck)).toBe(true)
  expect(restoreReplay.motionChanged).toBe(true)
  expect(restoreReplay.samples.at(-1)?.cards.length ?? 0).toBeGreaterThan(0)
  expect(collisionTerminalState.every((state) => !state.stuck)).toBe(true)
  expect(reducedTerminalState.every((state) => !state.stuck)).toBe(true)
  expect(allConsole.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
  expect(allPageErrors.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
})
