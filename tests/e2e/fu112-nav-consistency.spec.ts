import { test, expect, type Browser, type ConsoleMessage, type Page } from '@playwright/test'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createGpsCheckinViaApi,
  createTestEmail,
  fetchMostPopularMountain,
  registerFreshUser,
} from './community.helpers'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu112-acceptance'

type ConsoleEntry = {
  type: string
  text: string
  location: ReturnType<ConsoleMessage['location']>
  classification: 'new-this-round' | 'pre-existing' | 'environment'
}

function classifyConsole(type: string, text: string): ConsoleEntry['classification'] {
  if (/Failed to load resource|favicon|net::ERR|WebGL|maplibre/i.test(text)) return 'environment'
  if (/recognitionFailureResponse|requestSource|TrackPoint|feedbackTimersRef|ButtonPrimitive/i.test(text)) return 'pre-existing'
  return type === 'warning' ? 'pre-existing' : 'new-this-round'
}

async function newEvidencePage(browser: Browser, baseURL: string) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 375, height: 812 },
    },
  })
  await context.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.localStorage.setItem('peak_trekker_province_draft', '四川')
  })

  const page = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: Array<{ message: string; classification: ConsoleEntry['classification'] }> = []
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
      classification: classifyConsole(message.type(), message.text()),
    })
  })
  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      classification: classifyConsole('error', error.message),
    })
  })

  return { context, page, consoleEntries, pageErrors }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  return overflow
}

async function capture(page: Page, name: string) {
  const path = join(OUTPUT_DIR, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

async function createPublishedPost(page: Page, baseURL: string, checkinId: string) {
  const response = await page.request.post(`${baseURL}/api/community/actions`, {
    data: {
      action: 'create_or_update_post',
      checkinId,
      title: `FU-112 route preserved ${Date.now()}`,
      body: 'FU-112 controlled community post validates direct routes remain renderable while entries are withdrawn.',
      visibility: 'public',
      tags: [],
      assets: [],
      coverAssetId: null,
    },
  })
  const payload = await response.json().catch(() => ({}))
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy()
  expect(typeof payload?.postId).toBe('string')
  return String(payload.postId)
}

test('FU-112 navigation consistency withdraws community entries while preserving routes', async ({ browser, baseURL }) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await mkdir(OUTPUT_DIR, { recursive: true })

  const evidence = await newEvidencePage(browser, root)
  const { context, page, consoleEntries, pageErrors } = evidence
  const screenshots: Record<string, string> = {}

  await registerFreshUser(page, root, {
    returnTo: '/archive',
    email: createTestEmail('fu112'),
    username: `fu112-${Date.now()}`,
    province: '四川',
  })

  await expect(page.locator('.pt-tab-link')).toHaveCount(4)
  await expect(page.locator('.pt-tab-link', { hasText: '山友圈' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '返回' })).toHaveCount(0)
  await expect(page.getByText('想分享时再分享 · Peak Trekker 不会替你声张。')).toBeVisible()
  screenshots.archiveEmpty = await capture(page, 'archive-empty-neutral-copy-375.png')

  const mountain = await fetchMostPopularMountain()
  const checkinId = await createGpsCheckinViaApi(page, mountain, `fu112-${Date.now()}`)
  const postId = await createPublishedPost(page, root, checkinId)

  await page.goto('/archive', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Peak Trekker').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '我的山行档案' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回' })).toHaveCount(0)
  await expect(page.locator('[data-archive-motion="filters"]')).toBeVisible()
  await expect(page.locator('[data-archive-trip-card]').first()).toBeVisible()
  await page.locator('[data-archive-motion="footer"]').scrollIntoViewIfNeeded()
  const archiveClearance = await page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>('[data-archive-motion="footer"]')?.getBoundingClientRect()
    const tab = document.querySelector<HTMLElement>('.pt-tab-link')?.closest('nav')?.getBoundingClientRect()
    return footer && tab ? { footerBottom: footer.bottom, tabTop: tab.top, clear: footer.bottom <= tab.top - 4 } : null
  })
  expect(archiveClearance?.clear).toBeTruthy()
  screenshots.archive = await capture(page, 'archive-tier1-chrome-375.png')

  await page.goto('/imprint', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('imprint-facade')).toBeVisible()
  await expect(page.getByText('Peak Trekker').first()).toBeVisible()
  await expect(page.locator('.pt-tab-link')).toHaveCount(4)
  await page.waitForTimeout(1600)
  const imprintLayout = await page.getByTestId('imprint-facade').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const screen = node.querySelector<HTMLElement>('[data-imprint-screen="facade"]')?.getBoundingClientRect()
    const card = node.querySelector<HTMLElement>('[data-imprint-card]')?.getBoundingClientRect()
    const ctaElement = node.querySelector<HTMLElement>('.imprint-cta')
    const cta = ctaElement?.getBoundingClientRect()
    const ctaStyle = ctaElement ? getComputedStyle(ctaElement) : null
    return {
      rootHeight: rect.height,
      rootTop: rect.top,
      rootBottom: rect.bottom,
      screenBottomGap: screen ? rect.bottom - screen.bottom : null,
      cardHeight: card?.height ?? 0,
      cardFits: card ? card.top >= rect.top && card.bottom <= rect.bottom : false,
      ctaBottomGap: cta ? rect.bottom - cta.bottom : null,
      ctaFits: cta ? cta.top >= rect.top && cta.bottom <= rect.bottom : false,
      ctaVisible: ctaStyle ? ctaStyle.visibility === 'visible' && Number(ctaStyle.opacity) >= 0.98 : false,
    }
  })
  expect(imprintLayout.rootHeight).toBeGreaterThan(560)
  expect(imprintLayout.cardHeight).toBeGreaterThan(300)
  expect(imprintLayout.cardFits).toBeTruthy()
  expect(imprintLayout.screenBottomGap ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1)
  expect(imprintLayout.ctaBottomGap ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(0)
  expect(imprintLayout.ctaBottomGap ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(48)
  expect(imprintLayout.ctaFits).toBeTruthy()
  expect(imprintLayout.ctaVisible).toBeTruthy()
  screenshots.imprint = await capture(page, 'imprint-tier1-facade-375.png')

  await page.goto('/profile', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('我的分享')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '我的山行档案' })).toBeVisible()
  await expect(page.getByText('头像已更新，个人主页会同步展示。')).toHaveCount(0)
  await expect(page.getByText('头像更新成功，个人主页会同步刷新。')).toHaveCount(0)
  screenshots.profile = await capture(page, 'profile-community-share-hidden-clean-375.png')
  await page.evaluate(() => {
    window.sessionStorage.setItem('peak-trekker:avatar-uploaded', '1')
    window.sessionStorage.setItem('peak-trekker:avatar-status', 'success')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('头像已更新，个人主页会同步展示。')).toBeVisible()
  await expect(page.getByText('头像更新成功，个人主页会同步刷新。')).toBeVisible()
  await expect(page.getByText(/山友圈会同步/)).toHaveCount(0)

  await page.goto(`/activity/${checkinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('发布到山友圈')).toHaveCount(0)
  await expect(page.getByText('什么样能发到山友圈')).toHaveCount(0)
  const shareAction = page.getByRole('link', { name: '生成分享' }).last()
  await expect(shareAction).toBeVisible()
  const activityActionLayout = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.act-actions__grid')?.getBoundingClientRect()
    const action = Array.from(document.querySelectorAll<HTMLElement>('.act-actions__button'))
      .find((element) => element.textContent?.includes('生成分享'))?.getBoundingClientRect()
    return grid && action ? { gridWidth: grid.width, actionWidth: action.width } : null
  })
  expect(activityActionLayout?.actionWidth ?? 0).toBeGreaterThan((activityActionLayout?.gridWidth ?? 0) * 0.9)
  screenshots.activity = await capture(page, 'activity-community-publish-hidden-375.png')

  await page.goto(`/mountain/${mountain.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('精选攻略')).toHaveCount(0)
  screenshots.mountain = await capture(page, 'mountain-featured-section-hidden-375.png')

  await page.goto('/faq?anchor=review.community-eligibility', { waitUntil: 'domcontentloaded' })
  for (const anchor of [
    'review.community-eligibility',
    'review.community-scope',
    'privacy.visibility',
    'privacy.delete-published',
  ]) {
    await expect(page.locator(`[data-faq-anchor="${anchor}"]`)).toHaveCount(0)
  }
  await expect(page.getByText('什么样的山行能发到山友圈')).toHaveCount(0)
  await page.getByRole('button', { name: /分享与隐私/ }).click({ timeout: 10_000 })
  await page.getByRole('button', { name: /我的轨迹数据谁能看到/ }).click({ timeout: 10_000 })
  await expect(page.getByText('生成分享图时，只会包含你在分享编辑里选择展示的字段')).toBeVisible()
  await expect(page.getByText('哪怕你把这次山行发到山友圈')).toHaveCount(0)
  screenshots.faq = await capture(page, 'faq-community-anchors-hidden-375.png')

  const feedResponse = await page.goto('/community', { waitUntil: 'domcontentloaded' })
  expect(feedResponse?.status() ?? 0).toBeLessThan(400)
  await expect(page.getByTestId('community-feed')).toBeVisible()
  const detailResponse = await page.goto(`/community/${postId}`, { waitUntil: 'domcontentloaded' })
  expect(detailResponse?.status() ?? 0).toBeLessThan(400)
  await expect(page.getByTestId('community-detail')).toBeVisible()
  const publishResponse = await page.goto(`/community/publish/${checkinId}`, { waitUntil: 'domcontentloaded' })
  expect(publishResponse?.status() ?? 0).toBeLessThan(400)
  await expect(page.getByTestId('publish-editor-preview')).toBeVisible()
  screenshots.routePreservation = await capture(page, 'community-routes-preserved-375.png')

  await expectNoHorizontalOverflow(page)

  const video = page.video()
  await context.close()
  const videoPath = video ? await video.path() : null
  const copiedVideoPath = videoPath ? join(OUTPUT_DIR, 'fu112-nav-consistency-375.webm') : null
  if (videoPath && copiedVideoPath) await copyFile(videoPath, copiedVideoPath)

  const onboardingContext = await browser.newContext({
    baseURL: root,
    viewport: { width: 375, height: 812 },
  })
  await onboardingContext.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  const onboardingPage = await onboardingContext.newPage()
  await onboardingPage.goto('/explore', { waitUntil: 'domcontentloaded' })
  await expect(onboardingPage.getByText('分享图')).toBeVisible()
  await expect(onboardingPage.getByText('山友圈')).toHaveCount(0)
  screenshots.onboarding = await onboardingPage.screenshot({
    path: join(OUTPUT_DIR, 'onboarding-community-copy-neutral-375.png'),
    fullPage: true,
  }).then(() => join(OUTPUT_DIR, 'onboarding-community-copy-neutral-375.png'))
  await onboardingContext.close()

  const summary = {
    scope: 'FU-112 navigation consistency + v1 community entry withdrawal',
    baseURL: root,
    checkinId,
    postId,
    mountainId: mountain.id,
    screenshots,
    video: copiedVideoPath,
    archiveClearance,
    imprintLayout,
    activityActionLayout,
    console: consoleEntries,
    pageErrors,
    horizontalOverflow: false,
  }

  await writeFile(join(OUTPUT_DIR, 'fu112-nav-consistency-summary.json'), JSON.stringify(summary, null, 2))
  expect(consoleEntries.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
  expect(pageErrors.filter((entry) => entry.classification === 'new-this-round')).toEqual([])
})
