import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import {
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'
import { HUASHAN } from './trek-regression.helpers'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu36-a2-archive-share-acceptance'
const BUILD_DIR = join(OUTPUT_DIR, 'browser-build-screens')
const POSTER_DIR = join(OUTPUT_DIR, 'server-posters')
const FU65_OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu65-location-title-acceptance'
const FU65_BUILD_DIR = join(FU65_OUTPUT_DIR, 'browser-build-screens')
const FU65_POSTER_DIR = join(FU65_OUTPUT_DIR, 'server-posters')
const DESIGN_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu36-design-source/road001-a2/project/screenshots'
const SAMPLE_CROP_IMAGE = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu36-track-v2-acceptance/crops/keep-648-map-crop.jpg'
const TALL_SAMPLE_IMAGE = join(OUTPUT_DIR, 'a2-upload-fixture.png')
const DEFAULT_UNMATCHED_LOCATION = '鸡笼顶大草原'
const THIRTY_CHAR_LOCATION = '广东阳江鸡笼顶大草原北坡风车山脊观景入口一号路线清晨云海环线'

if (Array.from(THIRTY_CHAR_LOCATION).length !== 30) {
  throw new Error('FU-65 long location fixture must stay at 30 characters.')
}

const CREATED_CHECKINS: string[] = []

function readEnvValue(key: string) {
  try {
    const envText = readFileSync('.env.local', 'utf8')
    return envText.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for FU-66 A2 E2E cleanup.')
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function ensureEvidenceDirs() {
  await mkdir(BUILD_DIR, { recursive: true })
  await mkdir(POSTER_DIR, { recursive: true })
  await mkdir(FU65_BUILD_DIR, { recursive: true })
  await mkdir(FU65_POSTER_DIR, { recursive: true })
}

async function ensureUploadFixture() {
  await ensureEvidenceDirs()
  const crop = await sharp(SAMPLE_CROP_IMAGE).resize({ width: 960, fit: 'inside' }).png().toBuffer()
  await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: '#111417',
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
            <rect width="1080" height="1920" fill="#111417"/>
            <text x="72" y="170" font-size="86" font-family="Arial" font-weight="700" fill="#f0f4f2">10.32 公里</text>
            <text x="72" y="260" font-size="38" font-family="Arial" fill="#9ba4a0">Keep · 户外路线</text>
            <rect x="48" y="330" width="984" height="1090" rx="36" fill="#1d2224"/>
            <text x="72" y="1580" font-size="42" font-family="Arial" fill="#c7d0cc">用时 02:16:08 · 爬升 632m</text>
          </svg>`,
        ),
        left: 0,
        top: 0,
      },
      { input: crop, left: 72, top: 390 },
    ])
    .png()
    .toFile(TALL_SAMPLE_IMAGE)
  return TALL_SAMPLE_IMAGE
}

async function mockScreenshotRecognition(page: Page, {
  location = DEFAULT_UNMATCHED_LOCATION,
}: {
  location?: string | null
} = {}) {
  await page.route('**/api/screenshot/recognize', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          quota: {
            monthKey: '2026-06',
            isFirstMonth: false,
            subscriptionTier: 'free',
            freeLimit: 2,
            freeUsed: 0,
            paidLimit: 0,
            paidUsed: 0,
            freeRemaining: 2,
            paidRemaining: 0,
            remaining: 2,
            totalLimit: 2,
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ocrSource: 'mimo_v25',
        ocrResult: {
          rawText: ['Keep', '登山', '距离', '10.32 公里', '用时', '02:16:08', '爬升', '632 米'].join('\n'),
          textBlocks: [],
        },
        parsedFields: {
          ...(location
            ? { location: { value: location, raw: location } }
            : {}),
          distance: { value: 10.32, unit: 'km', raw: '10.32 公里' },
          duration: { value: 8168, raw: '02:16:08' },
          elevationGain: { value: 632, raw: '632 米' },
          date: { value: '2026-06-06', raw: '2026-06-06' },
        },
      }),
    })
  })
}

async function capture(page: Page, name: string) {
  const path = join(BUILD_DIR, name)
  await page.screenshot({ path, fullPage: false })
  return path
}

async function captureFu65(page: Page, name: string) {
  const path = join(FU65_BUILD_DIR, name)
  await page.screenshot({ path, fullPage: false })
  return path
}

async function captureLocator(locator: Locator, name: string) {
  const path = join(BUILD_DIR, name)
  await locator.screenshot({ path })
  return path
}

async function hideDevelopmentChrome(page: Page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dialog-overlay],
      [data-nextjs-dialog],
      [data-nextjs-dev-tools-button] {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `,
  }).catch(() => undefined)
}

async function writeSideBySide({
  design,
  build,
  output,
}: {
  design: string
  build: string
  output: string
}) {
  const [left, right] = await Promise.all([
    sharp(design)
      .extract({ left: 468, top: 74, width: 344, height: 744 })
      .resize({ width: 375, height: 812, fit: 'cover', background: '#08090a' })
      .png()
      .toBuffer({ resolveWithObject: true }),
    sharp(build).resize({ width: 375, height: 812, fit: 'cover', background: '#08090a' }).png().toBuffer({ resolveWithObject: true }),
  ])
  const height = Math.max(left.info.height, right.info.height)
  await sharp({
    create: {
      width: 750,
      height,
      channels: 4,
      background: '#08090a',
    },
  })
    .composite([
      { input: left.data, left: 0, top: 0 },
      { input: right.data, left: 375, top: 0 },
    ])
    .png()
    .toFile(output)
}

async function viewBoxPointToClient(page: Page, point: { x: number; y: number }) {
  return page.locator('[data-route-editor-canvas="true"]').evaluate((node, unit) => {
    const svg = node as SVGSVGElement
    const width = Number(svg.dataset.routeContentWidth)
    const height = Number(svg.dataset.routeContentHeight)
    const svgPoint = svg.createSVGPoint()
    svgPoint.x = unit.x * width
    svgPoint.y = unit.y * height
    const matrix = svg.getScreenCTM()
    if (!matrix) throw new Error('missing SVG CTM')
    const clientPoint = svgPoint.matrixTransform(matrix)
    return { x: clientPoint.x, y: clientPoint.y }
  }, point)
}

async function clickUnitPoint(page: Page, point: { x: number; y: number }, index: number) {
  const target = await viewBoxPointToClient(page, point)
  await page.mouse.click(target.x, target.y)
  await expect(page.locator(`[data-route-control-point-index="${index}"]`)).toBeVisible({ timeout: 5000 })
}

async function calibrateRoute(page: Page, points: Array<{ x: number; y: number }>) {
  await page.getByRole('button', { name: '开始描绘' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toBeVisible()
  for (const [index, point] of points.entries()) {
    await clickUnitPoint(page, point, index)
    if (index === 1) {
      await expect(page.locator('[data-route-line="true"]').first()).toBeVisible({ timeout: 5000 })
    }
  }
  await page.getByRole('button', { name: '确认轨迹' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toHaveCount(0, { timeout: 5000 })
}

async function uploadRecognizedScreenshot(
  page: Page,
  root: string,
  options: Parameters<typeof mockScreenshotRecognition>[1] = {},
) {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockScreenshotRecognition(page, options)
  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await hideDevelopmentChrome(page)
  await dismissActivationChecklistIfPresent(page)
  await page.locator('input[type="file"]').first().setInputFiles(await ensureUploadFixture())
  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('总距离 km')).toHaveValue('10.32')
}

async function submitAndWaitForArchive(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/import/confirm') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '确认并生成活动' }).click()
  const response = await responsePromise
  const payload = (await response.json()) as { ok?: boolean; checkinId?: string }
  expect(response.status(), JSON.stringify(payload)).toBe(200)
  expect(payload.ok).toBe(true)
  expect(payload.checkinId).toBeTruthy()
  CREATED_CHECKINS.push(payload.checkinId!)
  await expect(page.getByTestId('screenshot-archive-moment')).toBeVisible({ timeout: 10_000 })
  return payload.checkinId!
}

async function expectNoGpsVerifiedCopy(page: Page) {
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/GPS VERIFIED|GPS 真实轨迹|verified/i)
}

async function expectNoAltitudeHeroCopy(page: Page) {
  const preview = page.getByTestId('share-hero-preview')
  await expect(preview.getByText('最高海拔')).toHaveCount(0)
  await expect(preview.getByText('峰顶海拔')).toHaveCount(0)
}

async function writeRound2DeliveryReport() {
  await writeFile(
    join(OUTPUT_DIR, 'round2-delivery-report.md'),
    [
      '# FU-66 / FU-36 A2 Round 2 Evidence',
      '',
      'No visual PASS claim. User and Claude perform final visual acceptance.',
      '',
      '## Product Owner Decision',
      '',
      '- Share/poster hero altitude is measured-only and relabeled from `峰顶海拔` to `最高海拔`.',
      '- Missing measured elevation hides the entire hero altitude block in editor previews and server-rendered posters.',
      '',
      '## Evidence Paths',
      '',
      `- Design/build archive diff: ${join(OUTPUT_DIR, 'design-build-diff-archive.png')}`,
      `- Calibrated archive screenshot: ${join(BUILD_DIR, 'calibrated-archive-build.png')}`,
      `- Text-only archive screenshot: ${join(BUILD_DIR, 'text-only-archive-build.png')}`,
      `- Calibrated share editor screenshot: ${join(BUILD_DIR, 'share-editor-calibrated-route-build.png')}`,
      `- Text-only share editor screenshot: ${join(BUILD_DIR, 'share-editor-text-only-no-route-build.png')}`,
      `- Calibrated server poster PNG: ${join(POSTER_DIR, 'server-poster-calibrated.png')}`,
      `- Text-only server poster PNG: ${join(POSTER_DIR, 'server-poster-text-only.png')}`,
      `- Round 5 short-vs-long evidence grid: ${join(OUTPUT_DIR, 'short-vs-long-route-evidence.png')}`,
      `- Long/complex archive: ${join(BUILD_DIR, 'long-archive-build.png')}`,
      `- Long/complex share editor: ${join(BUILD_DIR, 'long-share-editor-build.png')}`,
      `- Long/complex activity card: ${join(BUILD_DIR, 'activity-card-long.png')}`,
      `- Zoomed long activity-card line crop: ${join(BUILD_DIR, 'activity-card-long-line-zoom.png')}`,
      `- Long/complex server poster: ${join(POSTER_DIR, 'server-poster-long.png')}`,
      `- Short archive: ${join(BUILD_DIR, 'short-archive-build.png')}`,
      `- Short share editor: ${join(BUILD_DIR, 'short-share-editor-build.png')}`,
      `- Short activity card: ${join(BUILD_DIR, 'activity-card-short.png')}`,
      `- Zoomed short activity-card line crop: ${join(BUILD_DIR, 'activity-card-short-line-zoom.png')}`,
      `- Short server poster: ${join(POSTER_DIR, 'server-poster-short.png')}`,
      `- Design deviations: ${join(OUTPUT_DIR, 'design-deviations.md')}`,
      '',
      '## Round 5 Addendum Checks',
      '',
      '- Browser preview and server poster route rendering share the target-space render pipeline.',
      '- Route stroke and endpoint sizes remain stable under content fitting; short routes are capped by the degenerate guard and long routes retain padding.',
      '- Short and long/complex route evidence is captured side-by-side for archive medallion, share editor, server poster, and Activity route card.',
      '',
      '## Follow-ups Registered For Closeout',
      '',
      '- Verified-summit ceremonial slot: optionally restore catalog `峰顶海拔` only for summit-verified checkins.',
      '- DEM elevation backfill for coordinate-bearing uploaded tracks lacking `<ele>`, gated by China-mainland accessibility and MVP cost.',
      '- Neutral consistency label for uploaded tracks reaching summit area, e.g. `轨迹达峰`, pending product discussion.',
      '',
    ].join('\n'),
  )
}

async function renderServerPoster(
  page: Page,
  checkinId: string,
  name: string,
  directory = POSTER_DIR,
  {
    template = 'base-classic',
    transparent = false,
  }: {
    template?: string
    transparent?: boolean
  } = {},
) {
  const response = await page.request.post('/api/share/render', {
    data: {
      template,
      checkinId,
      fieldVisibility: {},
      transparent,
    },
  })
  const body = await response.body()
  expect(response.status(), body.toString('utf8')).toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')
  const output = join(directory, name)
  await writeFile(output, body)
  const metadata = await sharp(body).metadata()
  expect(metadata.width).toBe(1080)
  expect(metadata.height).toBe(1920)
  return output
}

async function expectShareTitleVisible(page: Page, title: string) {
  const preview = page.getByTestId('share-hero-preview')
  const titleNode = preview.getByText(title).first()
  await expect(titleNode).toBeVisible({ timeout: 10_000 })
  return titleNode
}

async function expectShareTitleWithinPreview(page: Page, title: string) {
  const titleNode = await expectShareTitleVisible(page, title)
  const metrics = await titleNode.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const preview = node.closest('[data-testid="share-hero-preview"]')
    const previewRect = preview?.getBoundingClientRect()
    return {
      titleWidth: rect.width,
      titleLeft: rect.left,
      titleRight: rect.right,
      previewLeft: previewRect?.left ?? 0,
      previewRight: previewRect?.right ?? 0,
      overflow: getComputedStyle(node).overflow,
      textOverflow: getComputedStyle(node).textOverflow,
      whiteSpace: getComputedStyle(node).whiteSpace,
    }
  })

  expect(metrics.titleLeft).toBeGreaterThanOrEqual(metrics.previewLeft - 1)
  expect(metrics.titleRight).toBeLessThanOrEqual(metrics.previewRight + 1)
  expect(metrics.overflow).toBe('hidden')
  expect(metrics.textOverflow).toBe('ellipsis')
  expect(metrics.whiteSpace).toBe('nowrap')
}

async function getShareRouteTopLineBounds(page: Page) {
  const preview = page.getByTestId('share-hero-preview')
  const paths = preview.locator('path[data-real-track="true"]')
  await expect(paths).toHaveCount(2)
  return paths.nth(1).evaluate((node) => {
    const bbox = (node as SVGGraphicsElement).getBBox()
    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      maxX: bbox.x + bbox.width,
      maxY: bbox.y + bbox.height,
    }
  })
}

async function captureActivityRouteCard(page: Page, checkinId: string, name: string) {
  await page.goto(`/activity/${checkinId}`, { waitUntil: 'domcontentloaded' })
  const routeCard = page.getByTestId('activity-route-map')
  await routeCard.scrollIntoViewIfNeeded()
  await expect(routeCard.locator('[data-route-source="screenshot-shape"]')).toBeVisible({ timeout: 20_000 })
  return captureLocator(routeCard, name)
}

async function writeZoomedActivityLineCrop(sourceName: string, outputName: string) {
  const sourcePath = join(BUILD_DIR, sourceName)
  const metadata = await sharp(sourcePath).metadata()
  const width = metadata.width ?? 375
  const height = metadata.height ?? 420
  const cropWidth = Math.min(width, 210)
  const cropHeight = Math.min(height, 300)
  const left = Math.max(0, Math.round((width - cropWidth) / 2))
  const top = Math.max(0, Math.round(height * 0.12))
  await sharp(sourcePath)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ width: cropWidth * 2, height: cropHeight * 2, fit: 'fill' })
    .png()
    .toFile(join(BUILD_DIR, outputName))
}

async function writeShortLongComparisonGrid() {
  const rows = [
    { label: 'Archive medallion', long: 'long-archive-build.png', short: 'short-archive-build.png', height: 420, dir: BUILD_DIR },
    { label: 'Share editor', long: 'long-share-editor-build.png', short: 'short-share-editor-build.png', height: 420, dir: BUILD_DIR },
    { label: 'Server poster', long: 'server-poster-long.png', short: 'server-poster-short.png', height: 640, dir: POSTER_DIR },
    { label: 'Activity card', long: 'activity-card-long.png', short: 'activity-card-short.png', height: 360, dir: BUILD_DIR },
    { label: 'Activity line zoom crop', long: 'activity-card-long-line-zoom.png', short: 'activity-card-short-line-zoom.png', height: 360, dir: BUILD_DIR },
  ]
  const tileWidth = 375
  const labelHeight = 34
  const rowBuffers: Array<{ data: Buffer; height: number }> = []

  for (const row of rows) {
    const label = Buffer.from(
      `<svg width="${tileWidth * 2}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#08090a"/>
        <text x="14" y="23" font-family="Arial" font-size="18" font-weight="700" fill="#f5f7f8">${row.label} · LONG / COMPLEX</text>
        <text x="${tileWidth + 14}" y="23" font-family="Arial" font-size="18" font-weight="700" fill="#f5f7f8">${row.label} · SHORT</text>
      </svg>`,
    )
    const [longImage, shortImage] = await Promise.all([
      sharp(join(row.dir, row.long)).resize({ width: tileWidth, height: row.height, fit: 'contain', background: '#08090a' }).png().toBuffer(),
      sharp(join(row.dir, row.short)).resize({ width: tileWidth, height: row.height, fit: 'contain', background: '#08090a' }).png().toBuffer(),
    ])
    const rowImage = await sharp({
      create: {
        width: tileWidth * 2,
        height: labelHeight + row.height,
        channels: 4,
        background: '#08090a',
      },
    })
      .composite([
        { input: label, left: 0, top: 0 },
        { input: longImage, left: 0, top: labelHeight },
        { input: shortImage, left: tileWidth, top: labelHeight },
      ])
      .png()
      .toBuffer()
    rowBuffers.push({ data: rowImage, height: labelHeight + row.height })
  }

  const totalHeight = rowBuffers.reduce((sum, row) => sum + row.height, 0)
  let top = 0
  await sharp({
    create: {
      width: tileWidth * 2,
      height: totalHeight,
      channels: 4,
      background: '#08090a',
    },
  })
    .composite(rowBuffers.map((row) => {
      const rowTop = top
      top += row.height
      return { input: row.data, left: 0, top: rowTop }
    }))
    .png()
    .toFile(join(OUTPUT_DIR, 'short-vs-long-route-evidence.png'))
}

async function cleanupCreatedCheckins() {
  if (!CREATED_CHECKINS.length) return
  const ids = CREATED_CHECKINS.splice(0, CREATED_CHECKINS.length)
  const { error } = await getSupabaseAdminClient()
    .from('checkins')
    .delete()
    .in('id', ids)
  if (error) {
    throw new Error(`Failed to clean up FU-66 A2 checkins: ${error.message}`)
  }
}

test.afterEach(async () => {
  await cleanupCreatedCheckins()
})

test('FU-66 A2 calibrated screenshot archives, opens share, and renders screenshot route without GPS copy', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await uploadRecognizedScreenshot(page, root)
  await calibrateRoute(page, [
    { x: 0.18, y: 0.12 },
    { x: 0.34, y: 0.22 },
    { x: 0.48, y: 0.48 },
    { x: 0.66, y: 0.68 },
    { x: 0.84, y: 0.9 },
  ])

  const checkinId = await submitAndWaitForArchive(page)
  await hideDevelopmentChrome(page)
  await page.waitForTimeout(1200)
  const archiveScreenshot = await capture(page, 'calibrated-archive-build.png')
  await capture(page, 'long-archive-build.png')
  await writeSideBySide({
    design: join(DESIGN_DIR, 'v3-archive.png'),
    build: archiveScreenshot,
    output: join(OUTPUT_DIR, 'design-build-diff-archive.png'),
  })

  await page.getByRole('button', { name: '去分享' }).click()
  await expect(page).toHaveURL(new RegExp(`/share\\?checkinId=${checkinId}`), { timeout: 20_000 })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await expectShareTitleVisible(page, DEFAULT_UNMATCHED_LOCATION)
  await expect(page.getByTestId('share-hero-preview').locator('path[data-real-track="true"]')).toHaveCount(2)
  const longBounds = await getShareRouteTopLineBounds(page)
  expect(longBounds.x).toBeGreaterThanOrEqual(50)
  expect(longBounds.maxX).toBeLessThanOrEqual(230)
  expect(longBounds.y).toBeGreaterThanOrEqual(62)
  expect(longBounds.maxY).toBeLessThanOrEqual(330)
  await expectNoAltitudeHeroCopy(page)
  await expectNoGpsVerifiedCopy(page)
  await capture(page, 'share-editor-calibrated-route-build.png')
  await captureFu65(page, 'fu65-share-editor-unmatched-location.png')
  await capture(page, 'long-share-editor-build.png')
  await renderServerPoster(page, checkinId, 'server-poster-calibrated.png')
  await renderServerPoster(page, checkinId, 'fu65-server-poster-unmatched-location.png', FU65_POSTER_DIR)
  await renderServerPoster(page, checkinId, 'server-poster-long.png')
  await captureActivityRouteCard(page, checkinId, 'activity-card-long.png')
  await writeZoomedActivityLineCrop('activity-card-long.png', 'activity-card-long-line-zoom.png')

  const matchedCheckinId = await createHistoricalCheckinViaApi(page, HUASHAN.id, `fu65-share-matched-${Date.now()}`)
  CREATED_CHECKINS.push(matchedCheckinId)
  await page.goto(`/share?checkinId=${matchedCheckinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await expectShareTitleVisible(page, HUASHAN.name)
  await captureFu65(page, 'fu65-share-editor-matched-regression.png')
  await renderServerPoster(page, matchedCheckinId, 'fu65-server-poster-matched-regression.png', FU65_POSTER_DIR)

  await writeFile(
    join(OUTPUT_DIR, 'design-deviations.md'),
    [
      '# FU-66 / FU-36 A2 Design Deviations',
      '',
      '- Approved: text-only checkins use a brand-green mountain/peak glyph in the archive medallion.',
      '- Approved: waypoint step is skipped; archive follows confirm success directly.',
      '',
      'No visual PASS claim. User and Claude perform final design acceptance.',
      '',
    ].join('\n'),
  )
  await writeRound2DeliveryReport()
})

test('FU-66 A2 short screenshot route stays restrained across archive, share, poster, and activity evidence', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await uploadRecognizedScreenshot(page, root)
  await calibrateRoute(page, [
    { x: 0.46, y: 0.42 },
    { x: 0.54, y: 0.48 },
  ])

  const checkinId = await submitAndWaitForArchive(page)
  await hideDevelopmentChrome(page)
  await page.waitForTimeout(1200)
  await capture(page, 'short-archive-build.png')

  await page.getByRole('button', { name: '去分享' }).click()
  await expect(page).toHaveURL(new RegExp(`/share\\?checkinId=${checkinId}`), { timeout: 20_000 })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  const shortBounds = await getShareRouteTopLineBounds(page)
  expect(shortBounds.width).toBeGreaterThanOrEqual(8)
  expect(shortBounds.width).toBeLessThanOrEqual(100)
  expect(shortBounds.height).toBeLessThanOrEqual(100)
  await expectNoAltitudeHeroCopy(page)
  await expectNoGpsVerifiedCopy(page)
  await capture(page, 'short-share-editor-build.png')
  await renderServerPoster(page, checkinId, 'server-poster-short.png')
  await captureActivityRouteCard(page, checkinId, 'activity-card-short.png')
  await writeZoomedActivityLineCrop('activity-card-short.png', 'activity-card-short-line-zoom.png')
  await writeShortLongComparisonGrid()
  await writeRound2DeliveryReport()
})

test('FU-66 A2 text-only screenshot archives, can go back to activity, and shares with no route fallback', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await uploadRecognizedScreenshot(page, root, { location: null })
  const checkinId = await submitAndWaitForArchive(page)
  await expect(page.getByTestId('screenshot-archive-text-medallion')).toBeVisible()
  await hideDevelopmentChrome(page)
  await page.waitForTimeout(1200)
  await capture(page, 'text-only-archive-build.png')

  await page.getByRole('button', { name: '返回活动' }).click()
  await expect(page).toHaveURL(new RegExp(`/activity/${checkinId}`), { timeout: 20_000 })

  await page.goto(`/share?checkinId=${checkinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await expectShareTitleVisible(page, '未知山峰')
  await expect(page.getByTestId('share-hero-preview').locator('[data-real-track]')).toHaveCount(0)
  await expect(page.getByTestId('share-hero-preview').locator('path[data-real-track="true"]')).toHaveCount(0)
  await expectNoAltitudeHeroCopy(page)
  await expectNoGpsVerifiedCopy(page)
  await capture(page, 'share-editor-text-only-no-route-build.png')
  await captureFu65(page, 'fu65-share-editor-no-location.png')
  await renderServerPoster(page, checkinId, 'server-poster-text-only.png')
  await renderServerPoster(page, checkinId, 'fu65-server-poster-no-location.png', FU65_POSTER_DIR)
  await writeRound2DeliveryReport()
})

test('FU-65 share title chain keeps a 30-character location inside share and poster layouts', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await uploadRecognizedScreenshot(page, root, { location: THIRTY_CHAR_LOCATION })
  const checkinId = await submitAndWaitForArchive(page)
  await page.getByRole('button', { name: '去分享' }).click()
  await expect(page).toHaveURL(new RegExp(`/share\\?checkinId=${checkinId}`), { timeout: 20_000 })
  await expect(page.getByTestId('share-hero-preview')).toBeVisible({ timeout: 20_000 })
  await expectShareTitleWithinPreview(page, THIRTY_CHAR_LOCATION)
  await captureFu65(page, 'fu65-share-editor-30-char-location.png')
  await renderServerPoster(page, checkinId, 'fu65-server-poster-30-char-location.png', FU65_POSTER_DIR)
  await renderServerPoster(page, checkinId, 'fu65-server-poster-30-char-transparent-watermark.png', FU65_POSTER_DIR, {
    template: 'premium-photo-overlay',
    transparent: true,
  })
})
