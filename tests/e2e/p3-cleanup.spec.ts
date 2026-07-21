import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { dismissActivationChecklistIfPresent, seedFreshUserAccountForLogin } from './community.helpers'

const BASE_URL = process.env.P3_CLEANUP_BASE_URL ?? 'http://127.0.0.1:3100'
const OUTPUT_DIR = join(process.cwd(), 'output/p3-cleanup-acceptance')
const RUN_ID = process.env.P3_CLEANUP_RUN_ID ?? `p3-${Date.now()}-${process.pid}`
const RUN_DIR = join(OUTPUT_DIR, 'e2e-runs', RUN_ID)

type CleanupAttempt = { userId: string; deleted: boolean; error: string | null }
type FixtureRunState = {
  pendingUserIds: string[]
  attempts: CleanupAttempt[]
  ledger: { usersCreated: number; usersDeleted: number }
}

function readFixtureRunState(): FixtureRunState {
  try {
    const parsed = JSON.parse(readFileSync(join(RUN_DIR, 'fixture-recovery-manifest.json'), 'utf8')) as Partial<FixtureRunState>
    return {
      pendingUserIds: Array.isArray(parsed.pendingUserIds) ? parsed.pendingUserIds : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      ledger: {
        usersCreated: parsed.ledger?.usersCreated ?? 0,
        usersDeleted: parsed.ledger?.usersDeleted ?? 0,
      },
    }
  } catch {
    return { pendingUserIds: [], attempts: [], ledger: { usersCreated: 0, usersDeleted: 0 } }
  }
}

const persistedFixtureState = readFixtureRunState()
const PENDING_USER_IDS = [...persistedFixtureState.pendingUserIds]
const CLEANUP_ATTEMPTS = [...persistedFixtureState.attempts]
const FIXTURE_LEDGER = { ...persistedFixtureState.ledger }

type LoadingSample = {
  atMs: number
  opacity: number
  animationName: string
  skeletonAnimationName: string | null
}

type ArchiveMotionSample = {
  atMs: number
  target: string
  opacity: number
  visibility: string
  transform: string
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

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase admin credentials for P3 E2E cleanup.')
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function writeFixtureArtifacts() {
  mkdirSync(RUN_DIR, { recursive: true })
  const manifest = {
    runId: RUN_ID,
    pendingUserIds: [...PENDING_USER_IDS],
    attempts: CLEANUP_ATTEMPTS,
    ledger: FIXTURE_LEDGER,
  }
  writeFileSync(join(RUN_DIR, 'fixture-recovery-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(RUN_DIR, 'fixture-ledger.json'), `${JSON.stringify({ runId: RUN_ID, ...FIXTURE_LEDGER }, null, 2)}\n`)
  writeFileSync(join(OUTPUT_DIR, 'fixture-recovery-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function cleanupPendingUsers() {
  const errors: string[] = []
  for (const userId of [...PENDING_USER_IDS]) {
    const attempt = { userId, deleted: false, error: null as string | null }
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.auth.admin.deleteUser(userId)
      if (error) throw new Error(`deleteUser(${userId}) failed: ${error.message}`)

      const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id').eq('id', userId)
      if (profileError) throw new Error(`profile cleanup verification failed: ${profileError.message}`)
      if ((profileRows ?? []).length !== 0) throw new Error(`profile ${userId} still exists after auth deletion`)

      const { data: lookup, error: lookupError } = await supabase.auth.admin.getUserById(userId)
      if (lookupError && !/not found/i.test(lookupError.message)) throw new Error(`auth cleanup verification failed: ${lookupError.message}`)
      if (lookup.user?.id === userId) throw new Error(`auth user ${userId} still exists after deletion`)

      attempt.deleted = true
      PENDING_USER_IDS.splice(PENDING_USER_IDS.indexOf(userId), 1)
      FIXTURE_LEDGER.usersDeleted += 1
    } catch (error) {
      attempt.error = errorMessage(error)
      errors.push(attempt.error)
    } finally {
      CLEANUP_ATTEMPTS.push(attempt)
      writeFixtureArtifacts()
    }
  }
  if (errors.length > 0) throw new Error(`P3 fixture cleanup failed:\n${errors.join('\n')}`)
}

test.afterEach(async () => {
  await cleanupPendingUsers()
  writeFixtureArtifacts()
  expect(PENDING_USER_IDS).toEqual([])
  expect(FIXTURE_LEDGER.usersDeleted).toBe(FIXTURE_LEDGER.usersCreated)
})

async function prepareContext(context: BrowserContext) {
  await context.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.localStorage.setItem('peak_trekker_province_draft', '四川')
  })
}

async function installArchiveMotionTrace(context: BrowserContext) {
  await context.addInitScript(() => {
    const trace: Array<{
      atMs: number
      target: string
      opacity: number
      visibility: string
      transform: string
    }> = []
    let startedAt = performance.now()
    const tracedWindow = window as Window & { __ptArchiveMotionTrace?: typeof trace }
    tracedWindow.__ptArchiveMotionTrace = trace

    const sampleFrame = () => {
      for (const target of ['identity', 'empty-state', 'empty-copy']) {
        const element = document.querySelector<HTMLElement>(`[data-archive-motion="${target}"]`)
        if (!element) continue
        const style = getComputedStyle(element)
        trace.push({
          atMs: Math.round((performance.now() - startedAt) * 10) / 10,
          target,
          opacity: Number.parseFloat(style.opacity || '1'),
          visibility: style.visibility,
          transform: style.transform,
        })
      }
      if (performance.now() - startedAt < 1_200) requestAnimationFrame(sampleFrame)
    }

    const start = () => {
      startedAt = performance.now()
      requestAnimationFrame(sampleFrame)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true })
    } else {
      start()
    }
  })
}

async function readArchiveMotionTrace(page: Page) {
  return page.evaluate(() => (
    (window as Window & { __ptArchiveMotionTrace?: ArchiveMotionSample[] }).__ptArchiveMotionTrace ?? []
  ))
}

async function openExplore(page: Page, query = '') {
  await page.goto(`${BASE_URL}/explore${query}`, { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page.locator('[data-testid="explore-mountain-card"]').first()).toBeVisible({ timeout: 30_000 })
}

async function installControlledRscGate(page: Page, pathname: string) {
  let delayedRequests = 0
  let releaseGate: (() => void) | null = null
  const gate = new Promise<void>((resolve) => { releaseGate = resolve })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = request.headers()
    if (url.pathname === pathname && headers.rsc === '1' && headers['next-router-prefetch'] !== '1') {
      delayedRequests += 1
      await gate
    }
    await route.continue()
  }
  await page.route('**/*', handler)
  return {
    readCount: () => delayedRequests,
    release: () => releaseGate?.(),
    dispose: () => page.unroute('**/*', handler),
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1)
  return widths
}

async function sampleLoadingAnimation(page: Page, checkpoints: number[]) {
  const loading = page.locator('[data-route-loading="main"]')
  await loading.waitFor({ state: 'attached', timeout: 15_000 })
  return loading.evaluate(async (element, sampleTimes) => {
    const animation = element.getAnimations().find((candidate) => (
      candidate instanceof CSSAnimation && candidate.animationName === 'pt-route-loading-reveal'
    ))
    if (!animation) throw new Error('Route loading reveal animation was not found.')
    const computedTiming = animation.effect?.getComputedTiming()
    const samples: LoadingSample[] = []
    animation.pause()
    for (const atMs of sampleTimes) {
      animation.currentTime = atMs
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      const style = getComputedStyle(element)
      const skeleton = element.querySelector('.pt-skeleton')
      samples.push({
        atMs,
        opacity: Number.parseFloat(style.opacity || '1'),
        animationName: style.animationName,
        skeletonAnimationName: skeleton ? getComputedStyle(skeleton).animationName : null,
      })
    }
    return {
      delayMs: Number(computedTiming?.delay ?? 0),
      durationMs: Number(computedTiming?.duration ?? 0),
      samples,
    }
  }, checkpoints)
}

async function seekLoadingAnimation(page: Page, atMs: number) {
  const loading = page.locator('[data-route-loading="main"]')
  await loading.evaluate(async (element, checkpoint) => {
    const animation = element.getAnimations().find((candidate) => (
      candidate instanceof CSSAnimation && candidate.animationName === 'pt-route-loading-reveal'
    ))
    if (!animation) throw new Error('Route loading reveal animation was not found.')
    animation.pause()
    animation.currentTime = checkpoint
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }, atMs)
}

test('FU-107 preserves the selected template and FU-118 avoids Archive loading and empty-state flash', async ({ browser }) => {
  test.setTimeout(240_000)
  mkdirSync(RUN_DIR, { recursive: true })
  const navigationEvidence: Record<string, unknown> = {}
  const guestContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    recordVideo: { dir: RUN_DIR, size: { width: 375, height: 812 } },
  })
  await prepareContext(guestContext)
  const guestPage = await guestContext.newPage()
  const guestVideo = guestPage.video()
  let authenticatedStorageState: Awaited<ReturnType<BrowserContext['storageState']>> | null = null

  try {
    await openExplore(guestPage, '?shareTemplate=premium-mono-film')
    await expect(guestPage).toHaveURL(`${BASE_URL}/explore`)

    const mountainHref = await guestPage.locator('[data-testid="explore-mountain-card"]').first().getAttribute('href')
    expect(mountainHref).toMatch(/^\/mountain\//)
    const mountainId = mountainHref!.split('/').pop()!
    await guestPage.locator('[data-testid="explore-mountain-card"]').first().click()
    await expect(guestPage).toHaveURL(new RegExp(`/mountain/${mountainId}$`), { timeout: 30_000 })
    await guestPage.getByRole('link', { name: '登录后开始记录' }).click()
    await expect(guestPage).toHaveURL(/\/auth\/login\?from=/)

    const loginUrl = new URL(guestPage.url())
    const expectedTrekUrl = `/trek?mountainId=${mountainId}&shareTemplate=premium-mono-film`
    expect(loginUrl.searchParams.get('from')).toBe(expectedTrekUrl)
    const account = await seedFreshUserAccountForLogin({ username: `qa-p3-${Date.now()}`, province: '四川' })
    PENDING_USER_IDS.push(account.userId)
    FIXTURE_LEDGER.usersCreated += 1
    writeFixtureArtifacts()
    await guestPage.evaluate(() => sessionStorage.removeItem('peak_trekker:imprint-template'))
    await guestPage.getByPlaceholder('your@email.com').fill(account.email)
    await guestPage.getByPlaceholder(/至少6位|••••••••/).fill(account.password)
    await guestPage.getByRole('button', { name: '▶ 开始登山' }).click()
    await expect(guestPage).toHaveURL(new RegExp(`/trek\\?mountainId=${mountainId}&shareTemplate=premium-mono-film`), { timeout: 30_000 })
    expect(await guestPage.evaluate(() => sessionStorage.getItem('peak_trekker:imprint-template'))).toBeNull()
    authenticatedStorageState = await guestContext.storageState()
    navigationEvidence.templateFlow = {
      mountainId,
      loginFrom: loginUrl.searchParams.get('from'),
      finalUrl: guestPage.url(),
      pendingClearedBeforeLogin: true,
      evidenceBoundary: 'real browser/auth/middleware navigation; no trek completion or checkin created',
    }

    const ordinaryContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
    await prepareContext(ordinaryContext)
    try {
      const ordinaryPage = await ordinaryContext.newPage()
      await openExplore(ordinaryPage)
      const ordinaryHref = await ordinaryPage.locator('[data-testid="explore-mountain-card"]').first().getAttribute('href')
      const ordinaryMountainId = ordinaryHref!.split('/').pop()!
      await ordinaryPage.goto(`${BASE_URL}${ordinaryHref}`, { waitUntil: 'domcontentloaded' })
      await ordinaryPage.getByRole('link', { name: '登录后开始记录' }).click()
      await expect(ordinaryPage).toHaveURL(/\/auth\/login\?from=/)
      const ordinaryLoginUrl = new URL(ordinaryPage.url())
      expect(ordinaryLoginUrl.searchParams.get('from')).toBe(`/mountain/${ordinaryMountainId}`)
      navigationEvidence.ordinaryGuestFlow = { loginFrom: ordinaryLoginUrl.searchParams.get('from') }
    } finally {
      await ordinaryContext.close()
    }
  } finally {
    await guestContext.close()
    if (guestVideo) copyFileSync(await guestVideo.path(), join(OUTPUT_DIR, 'fu107-guest-template-login-trek-375.webm'))
  }

  if (!authenticatedStorageState) throw new Error('Authenticated storage state was not captured.')
  const loadingEvidence: Record<string, unknown> = {}
  const emptyContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: authenticatedStorageState,
    recordVideo: { dir: RUN_DIR, size: { width: 375, height: 812 } },
  })
  await prepareContext(emptyContext)
  await installArchiveMotionTrace(emptyContext)
  const emptyPage = await emptyContext.newPage()
  const emptyVideo = emptyPage.video()
  try {
    await emptyPage.goto(`${BASE_URL}/archive`, { waitUntil: 'domcontentloaded' })
    await expect(emptyPage.locator('[data-archive-motion="empty-state"]')).toBeVisible()
    await expect(emptyPage.locator('[data-archive-motion="empty-copy"]')).toBeVisible()
    await emptyPage.waitForTimeout(900)
    const terminalStyles = await emptyPage.locator('[data-archive-motion="identity"], [data-archive-motion="empty-state"], [data-archive-motion="empty-copy"]').evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node)
      return {
        selector: (node as HTMLElement).dataset.archiveMotion ?? '',
        opacity: Number.parseFloat(style.opacity || '1'),
        visibility: style.visibility,
        transform: style.transform,
      }
    }))
    expect(terminalStyles).toHaveLength(3)
    expect(terminalStyles.every((sample) => sample.opacity >= 0.99 && sample.visibility !== 'hidden' && sample.transform === 'none')).toBe(true)
    const motionTrace = await readArchiveMotionTrace(emptyPage)
    const emptyStateTrace = motionTrace.filter((sample) => sample.target === 'empty-state')
    expect(emptyStateTrace.length).toBeGreaterThan(3)
    expect(emptyStateTrace[0]?.opacity).toBeLessThanOrEqual(0.01)
    const firstIntermediateIndex = emptyStateTrace.findIndex((sample) => sample.opacity > 0.01 && sample.opacity < 0.99)
    expect(firstIntermediateIndex).toBeGreaterThan(0)
    const revealedBeforeTimeline = emptyStateTrace.slice(0, firstIntermediateIndex).some((sample) => sample.opacity >= 0.99)
    expect(revealedBeforeTimeline).toBe(false)
    expect(emptyStateTrace.at(-1)?.opacity).toBeGreaterThanOrEqual(0.99)
    const firstVisibleIndex = emptyStateTrace.findIndex((sample) => sample.opacity >= 0.99)
    expect(firstVisibleIndex).toBeGreaterThan(0)
    const replayedToHidden = emptyStateTrace.slice(firstVisibleIndex).some((sample) => sample.opacity <= 0.05)
    writeFileSync(join(RUN_DIR, 'archive-empty-motion-trace.json'), `${JSON.stringify(motionTrace, null, 2)}\n`)
    expect(replayedToHidden).toBe(false)
    await emptyPage.screenshot({ path: join(OUTPUT_DIR, 'archive-empty-profile-style-normal-375.png') })
    loadingEvidence.archiveEmpty = {
      terminalStyles,
      motionTrace,
      firstFrameHidden: emptyStateTrace[0]?.opacity <= 0.01,
      hasIntermediateFrame: firstIntermediateIndex > 0,
      noRevealBeforeTimeline: !revealedBeforeTimeline,
      noVisibleThenHiddenReplay: !replayedToHidden,
      allTerminalVisible: true,
      overflow: await expectNoHorizontalOverflow(emptyPage),
      evidenceBoundary: 'real production Archive SSR plus hydration using the spec-created empty account; no Archive data was created.',
    }
  } finally {
    await emptyContext.close()
    if (emptyVideo) copyFileSync(await emptyVideo.path(), join(OUTPUT_DIR, 'archive-empty-profile-style-normal-375.webm'))
  }

  const profileContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: authenticatedStorageState,
    recordVideo: { dir: RUN_DIR, size: { width: 375, height: 812 } },
  })
  await prepareContext(profileContext)
  const profilePage = await profileContext.newPage()
  const profileVideo = profilePage.video()
  try {
    await profilePage.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' })
    await dismissActivationChecklistIfPresent(profilePage)
    await expect(profilePage.locator('[data-profile-motion="identity"]')).toBeVisible()
    await profilePage.waitForTimeout(900)
    await profilePage.screenshot({ path: join(OUTPUT_DIR, 'profile-entrance-reference-normal-375.png') })
    loadingEvidence.profileReference = {
      terminalStyle: await profilePage.locator('[data-profile-motion="identity"]').evaluate((node) => {
        const style = getComputedStyle(node)
        return { opacity: Number.parseFloat(style.opacity || '1'), visibility: style.visibility, transform: style.transform }
      }),
      evidenceBoundary: 'real production Profile entrance recorded with the same empty authenticated account for motion-scale comparison.',
    }
  } finally {
    await profileContext.close()
    if (profileVideo) copyFileSync(await profileVideo.path(), join(OUTPUT_DIR, 'profile-entrance-reference-normal-375.webm'))
  }

  const reducedArchiveContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: authenticatedStorageState,
    reducedMotion: 'reduce',
  })
  await prepareContext(reducedArchiveContext)
  await installArchiveMotionTrace(reducedArchiveContext)
  try {
    const reducedArchivePage = await reducedArchiveContext.newPage()
    await reducedArchivePage.goto(`${BASE_URL}/archive`, { waitUntil: 'domcontentloaded' })
    await expect(reducedArchivePage.locator('[data-archive-motion="empty-state"]')).toBeVisible()
    await reducedArchivePage.waitForTimeout(180)
    const reducedTrace = await readArchiveMotionTrace(reducedArchivePage)
    const reducedTargets = reducedTrace.filter((sample) => ['identity', 'empty-state', 'empty-copy'].includes(sample.target))
    expect(reducedTargets.length).toBeGreaterThan(0)
    expect(reducedTargets.every((sample) => sample.opacity >= 0.99 && sample.visibility !== 'hidden' && sample.transform === 'none')).toBe(true)
    await reducedArchivePage.screenshot({ path: join(OUTPUT_DIR, 'archive-empty-reduced-terminal-375.png') })
    loadingEvidence.archiveEmptyReduced = {
      motionTrace: reducedTrace,
      terminalFromFirstSample: true,
      overflow: await expectNoHorizontalOverflow(reducedArchivePage),
      evidenceBoundary: 'real production Archive with browser prefers-reduced-motion=reduce; no controlled animation clock.',
    }
  } finally {
    await reducedArchiveContext.close()
  }

  if (process.env.P3_ARCHIVE_MOTION_ONLY === '1') {
    writeFileSync(join(OUTPUT_DIR, 'fu107-navigation.json'), `${JSON.stringify(navigationEvidence, null, 2)}\n`)
    writeFileSync(join(OUTPUT_DIR, 'fu118-loading-traces.json'), `${JSON.stringify({
      ...loadingEvidence,
      evidenceBoundary: 'real production Archive and Profile entrance evidence only; route-loading interception is intentionally outside this focused run.',
    }, null, 2)}\n`)
    return
  }

  const normalContext = await browser.newContext({ viewport: { width: 375, height: 812 }, storageState: authenticatedStorageState })
  await prepareContext(normalContext)
  try {
    const page = await normalContext.newPage()
    const gate = await installControlledRscGate(page, '/archive')
    await openExplore(page)
    await page.locator('.pt-tab-link[href="/archive"]').click({ noWaitAfter: true })
    await expect.poll(gate.readCount).toBeGreaterThan(0)
    const slowTracePromise = sampleLoadingAnimation(page, [0, 100, 169, 180, 181, 270, 360])
    const slowTrace = await slowTracePromise
    await seekLoadingAnimation(page, 100)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-loading-fast-controlled-normal-375.png') })
    await seekLoadingAnimation(page, 360)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-loading-slow-normal-375.png') })
    const beforeDelay = slowTrace.samples.filter((sample) => sample.atMs < 170)
    expect(slowTrace.delayMs).toBe(180)
    expect(beforeDelay.length).toBeGreaterThan(0)
    expect(beforeDelay.every((sample) => sample.opacity === 0)).toBe(true)
    expect(slowTrace.samples.some((sample) => sample.atMs >= 180 && sample.opacity > 0)).toBe(true)
    expect(slowTrace.samples.at(-1)?.opacity).toBeGreaterThan(0.95)
    gate.release()
    await expect(page).toHaveURL(/\/archive/)
    await expect(page.locator('[data-route-loading="main"]')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('[data-archive-motion-root]')).toBeVisible()
    await gate.dispose()
    loadingEvidence.normal = {
      slowTrace,
      fastTrace: beforeDelay,
      overflow: await expectNoHorizontalOverflow(page),
    }

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reducedGate = await installControlledRscGate(page, '/archive')
    await openExplore(page)
    await page.locator('.pt-tab-link[href="/archive"]').click({ noWaitAfter: true })
    await expect.poll(reducedGate.readCount).toBeGreaterThan(0)
    const trace = await sampleLoadingAnimation(page, [0, 100, 169, 180.02])
    const reducedBeforeDelay = trace.samples.filter((sample) => sample.atMs < 170)
    expect(trace.delayMs).toBe(180)
    expect(trace.durationMs).toBeLessThanOrEqual(0.01)
    expect(reducedBeforeDelay.length).toBeGreaterThan(0)
    expect(reducedBeforeDelay.every((sample) => sample.opacity === 0)).toBe(true)
    const afterDelay = trace.samples.filter((sample) => sample.atMs >= 180.01)
    expect(afterDelay.length).toBeGreaterThan(0)
    expect(afterDelay.every((sample) => sample.opacity === 1)).toBe(true)
    expect(afterDelay.every((sample) => sample.skeletonAnimationName === 'none')).toBe(true)
    await seekLoadingAnimation(page, 100)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-loading-fast-controlled-reduced-375.png') })
    await seekLoadingAnimation(page, 180.02)
    await page.screenshot({ path: join(OUTPUT_DIR, 'archive-loading-slow-reduced-375.png') })
    reducedGate.release()
    await expect(page).toHaveURL(/\/archive/)
    await expect(page.locator('[data-route-loading="main"]')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('[data-archive-motion-root]')).toBeVisible()
    await reducedGate.dispose()
    loadingEvidence.reduced = {
      trace,
      fastTrace: reducedBeforeDelay,
      overflow: await expectNoHorizontalOverflow(page),
    }
  } finally {
    await normalContext.close()
  }

  writeFileSync(join(OUTPUT_DIR, 'fu107-navigation.json'), `${JSON.stringify(navigationEvidence, null, 2)}\n`)
  writeFileSync(join(OUTPUT_DIR, 'fu118-loading-traces.json'), `${JSON.stringify({
    ...loadingEvidence,
    evidenceBoundary: 'real production Archive loading fallback under a controlled delayed RSC; fast-path frames are controlled CSS-animation checkpoints before 180ms',
  }, null, 2)}\n`)
})

test('FU-106 mono-film browser preview keeps its grayscale treatment', async ({ browser }) => {
  test.setTimeout(180_000)
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const colorPhoto = await sharp({
    create: { width: 1080, height: 900, channels: 3, background: { r: 232, g: 42, b: 76 } },
  }).composite([{ input: await sharp({ create: { width: 540, height: 900, channels: 3, background: { r: 22, g: 118, b: 245 } } }).png().toBuffer(), left: 540, top: 0 }]).png().toBuffer()
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  await prepareContext(context)
  try {
    const page = await context.newPage()
    await page.goto(`${BASE_URL}/share?template=premium-mono-film`, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => page.locator('.share-editor-root').getAttribute('data-motion-pending')).toBeNull()
    const photoInput = page.locator('input[type="file"]')
    await photoInput.setInputFiles({ name: 'p3-vivid-photo.png', mimeType: 'image/png', buffer: colorPhoto })
    await expect(page.locator('[data-testid="share-main-poster-preview"]')).toHaveAttribute('data-current-template', 'premium-mono-film')
    const previewPhoto = page.locator('[data-testid="share-main-poster-preview"] img').first()
    await expect(previewPhoto).toHaveCSS('filter', 'grayscale(1)')
    const previewPath = join(OUTPUT_DIR, 'mono-film-browser-preview-grayscale-375.png')
    await page.locator('[data-testid="share-main-poster-preview"]').screenshot({ path: previewPath })
  } finally {
    await context.close()
  }

  writeFileSync(join(OUTPUT_DIR, 'fu106-mono-film-parity.json'), `${JSON.stringify({
    previewFilter: 'grayscale(1)',
    evidenceBoundary: 'real ShareClient browser preview; DB-free production preprocessor and Satori export are covered by share-render-api.test.ts',
  }, null, 2)}\n`)
})
