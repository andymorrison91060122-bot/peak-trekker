import { expect, test, type Browser, type ConsoleMessage, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  createGpsCheckinViaApi,
  createSolidColorPngBuffer,
  createTestEmail,
  fetchMostPopularMountain,
  registerFreshUser,
} from './community.helpers'

const OUTPUT_DIR = join(process.cwd(), 'output/fu76-sprint-b-copy-acceptance')
const SEEDED_CHECKIN_IDS: string[] = []

function readEnvValue(key: string) {
  const value = process.env[key]
  if (value) return value
  try {
    return readFileSync('.env.local', 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function getSupabaseAdminClient() {
  const url = readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return null
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function cleanupSeededCheckins() {
  if (SEEDED_CHECKIN_IDS.length === 0) return
  const supabase = getSupabaseAdminClient()
  if (!supabase) return
  const ids = SEEDED_CHECKIN_IDS.splice(0, SEEDED_CHECKIN_IDS.length)
  await supabase.from('checkins').delete().in('id', ids)
}

type ConsoleEntry = {
  type: string
  text: string
  location: ReturnType<ConsoleMessage['location']>
}

async function newEvidencePage(browser: Browser, baseURL: string) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
  })
  await context.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))
  await context.addInitScript(() => {
    window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    window.localStorage.setItem('peak_trekker_province_draft', '四川')
  })
  const page = await context.newPage()
  const consoleEntries: ConsoleEntry[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { context, page, consoleEntries, pageErrors }
}

async function capture(page: Page, name: string) {
  const path = join(OUTPUT_DIR, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

async function expectBodyDoesNotLeakRaw(page: Page, rawPattern: RegExp) {
  await expect(page.locator('body')).not.toContainText(rawPattern)
}

function gpxBuffer() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Peak Trekker E2E">
  <trk><name>controlled-copy-track</name><trkseg>
    <trkpt lat="34.4800" lon="110.0900"><ele>1200</ele><time>2026-01-01T00:00:00Z</time></trkpt>
    <trkpt lat="34.4810" lon="110.0910"><ele>1220</ele><time>2026-01-01T00:10:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`)
}

function kmlNoCoordinatesBuffer() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>controlled-empty-kml</name></Document>
</kml>`)
}

function controlledParsedTrack() {
  return {
    format: 'gpx',
    fileName: 'controlled-copy-track.gpx',
    name: 'controlled-copy-track',
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-01-01T00:10:00.000Z',
    durationSeconds: 600,
    distanceMeters: 850,
    elevationGainMeters: 20,
    maxElevation: 1220,
    trackPoints: [
      { latitude: 34.48, longitude: 110.09, elevation: 1200, timestamp: '2026-01-01T00:00:00.000Z' },
      { latitude: 34.481, longitude: 110.091, elevation: 1220, timestamp: '2026-01-01T00:10:00.000Z' },
    ],
    suggestedMountain: null,
  }
}

test.afterEach(async () => {
  await cleanupSeededCheckins()
})

test('FU-76 Sprint B copy and controlled error evidence', async ({ browser, baseURL }) => {
  test.setTimeout(240_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  await mkdir(OUTPUT_DIR, { recursive: true })

  const { context, page, consoleEntries, pageErrors } = await newEvidencePage(browser, root)
  const screenshots: Record<string, string> = {}
  const controlledEvidence: string[] = []

  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com').fill(`missing-${Date.now()}@example.com`)
  await page.getByPlaceholder(/至少6位|••••••••/).fill('DefinitelyWrong123!')
  await page.getByRole('button', { name: /开始登山/ }).click()
  await expect(page.locator('body')).toContainText(/邮箱或密码错误|登录失败，请检查邮箱和密码后重试。/, { timeout: 20_000 })
  await expectBodyDoesNotLeakRaw(page, /Invalid login credentials|AuthApiError|Supabase/i)
  screenshots.invalidLogin = await capture(page, 'invalid-login-real-375.png')

  await page.goto('/auth/register', { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com').fill(createTestEmail('copy-invalid'))
  await page.getByPlaceholder('至少6位').fill('PeakTrekker123!')
  await page.getByRole('button', { name: '下一步 →' }).click()
  await page.getByPlaceholder('给自己起个名字').fill('a')
  await page.locator('select').selectOption('四川')
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()
  await expect(page.locator('body')).toContainText('昵称至少 2 个字')
  screenshots.invalidRegister = await capture(page, 'invalid-register-real-375.png')

  await registerFreshUser(page, root, {
    returnTo: '/import',
    email: createTestEmail('copy'),
    username: `copy-${Date.now()}`,
    province: '四川',
  })

  await page.route('**/api/import/parse', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'PostgREST search_failed: relation missing' }),
  }))
  controlledEvidence.push('import parse failure is controlled by Playwright route interception')
  await page.goto('/import', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('轨迹文件').setInputFiles({
    name: 'controlled-copy-track.gpx',
    mimeType: 'application/gpx+xml',
    buffer: gpxBuffer(),
  })
  await page.getByRole('button', { name: '开始解析' }).click()
  await expect(page.locator('body')).toContainText('轨迹文件解析失败，请换一个文件重试。')
  await expectBodyDoesNotLeakRaw(page, /PostgREST|search_failed|relation missing/i)
  screenshots.importParseFailure = await capture(page, 'controlled-import-parse-failure-375.png')
  await page.unroute('**/api/import/parse')

  await page.route('**/api/import/parse', (route) => route.fulfill({
    status: 422,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'no usable track points' }),
  }))
  controlledEvidence.push('import KML no-coordinate 422 is controlled by Playwright route interception')
  await page.goto('/import', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('轨迹文件').setInputFiles({
    name: 'controlled-copy-empty.kml',
    mimeType: 'application/vnd.google-earth.kml+xml',
    buffer: kmlNoCoordinatesBuffer(),
  })
  await page.getByRole('button', { name: '开始解析' }).click()
  await expect(page.locator('body')).toContainText('建议从原平台导出 GPX 格式重试。')
  await expectBodyDoesNotLeakRaw(page, /no usable track points/i)
  screenshots.importParseKml422 = await capture(page, 'controlled-import-parse-kml-422-375.png')
  await page.unroute('**/api/import/parse')

  await page.route('**/api/import/parse', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, parsedData: controlledParsedTrack() }),
  }))
  await page.route('**/api/import/confirm', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Supabase insert failed: duplicate key value violates constraint' }),
  }))
  controlledEvidence.push('import confirm failure is controlled by Playwright route interception')
  await page.goto('/import', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('轨迹文件').setInputFiles({
    name: 'controlled-copy-track.gpx',
    mimeType: 'application/gpx+xml',
    buffer: gpxBuffer(),
  })
  await page.getByRole('button', { name: '开始解析' }).click()
  await expect(page.getByRole('button', { name: '继续' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '继续' }).click()
  await page.getByRole('button', { name: '保存为未关联山行' }).click()
  await expect(page.locator('body')).toContainText('活动记录暂时没有生成成功，请再试一次。')
  await expectBodyDoesNotLeakRaw(page, /Supabase|duplicate key|violates constraint/i)
  screenshots.importConfirmFailure = await capture(page, 'controlled-import-confirm-failure-375.png')
  await page.unroute('**/api/import/parse')
  await page.unroute('**/api/import/confirm')

  const png = await createSolidColorPngBuffer({ width: 390, height: 780, red: 24, green: 28, blue: 34 })
  await page.route('**/api/screenshot/recognize', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      ocrResult: { rawText: '泰山 5.9km 2h', textBlocks: [] },
      parsedFields: {
        location: { value: '泰山', raw: '泰山' },
        distance: { value: 5.9, unit: 'km', raw: '5.9km' },
        duration: { value: 7200, raw: '2h' },
      },
      ocrSource: 'mimo_v25',
    }),
  }))
  await page.route('**/api/mountains/search**', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'search_failed: PostgREST timeout' }),
  }))
  controlledEvidence.push('screenshot mountain search failure is controlled by Playwright route interception')
  await page.goto('/screenshot', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'controlled-copy-screenshot.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '重新匹配' }).click()
  await expect(page.locator('body')).toContainText('山峰匹配暂时不可用，请稍后重试。')
  await expectBodyDoesNotLeakRaw(page, /search_failed|PostgREST|timeout/i)
  screenshots.screenshotSearchFailure = await capture(page, 'controlled-screenshot-search-failure-375.png')
  await page.unroute('**/api/mountains/search**')

  await page.route('**/api/import/confirm', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'PostgREST checkins insert exploded' }),
  }))
  controlledEvidence.push('screenshot submit failure is controlled by Playwright route interception')
  await page.getByRole('button', { name: '确认并生成活动' }).click()
  await expect(page.locator('body')).toContainText('活动生成失败，请稍后再试。')
  await expectBodyDoesNotLeakRaw(page, /PostgREST|insert exploded/i)
  screenshots.screenshotSubmitFailure = await capture(page, 'controlled-screenshot-submit-failure-375.png')
  await page.unroute('**/api/import/confirm')
  await page.unroute('**/api/screenshot/recognize')

  const mountain = await fetchMostPopularMountain()
  const checkinId = await createGpsCheckinViaApi(page, mountain, `copy evidence ${Date.now()}`)
  SEEDED_CHECKIN_IDS.push(checkinId)

  await page.goto(`/activity/${checkinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('GPS 实测')).toBeVisible({ timeout: 20_000 })
  screenshots.sourceLabelPage = await capture(page, 'source-label-page-gps-chinese-375.png')
  const posterResponse = await page.request.get(`/api/poster?checkinId=${checkinId}&format=svg`)
  const posterText = await posterResponse.text()
  expect(posterText).toContain('GPS VERIFIED')
  await writeFile(join(OUTPUT_DIR, 'source-label-poster-english.svg'), posterText)

  await page.route('**/api/activity/actions', async (route) => {
    const postData = route.request().postData() ?? ''
    if (postData.includes('update_activity_note')) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'PostgREST note update failed' }),
      })
      return
    }
    if (postData.includes('add_activity_image')) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Supabase storage upload failed' }),
      })
      return
    }
    await route.continue()
  })
  controlledEvidence.push('activity note/photo failures are controlled by Playwright route interception')
  const editNoteButton = page.getByRole('button', { name: '编辑' }).first()
  if (await editNoteButton.isVisible().catch(() => false)) {
    await editNoteButton.click()
  } else {
    await page.getByRole('button', { name: '写一句' }).click()
  }
  await page.getByTestId('activity-note-editor').fill('这是一条受控失败测试手记。')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('body')).toContainText('攀登日记保存失败，请稍后重试。')
  await expectBodyDoesNotLeakRaw(page, /PostgREST|note update failed/i)
  screenshots.activityNoteFailure = await capture(page, 'controlled-activity-note-failure-375.png')

  await page.getByTestId('activity-photo-upload-input').setInputFiles({
    name: 'controlled-activity-photo.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.locator('body')).toContainText('现场照片上传失败，请稍后重试。')
  await expectBodyDoesNotLeakRaw(page, /Supabase|storage upload failed/i)
  screenshots.activityPhotoFailure = await capture(page, 'controlled-activity-photo-failure-375.png')
  await page.unroute('**/api/activity/actions')

  await page.route('**/api/weather/**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'weather refresh failed: upstream timeout' }),
  }))
  controlledEvidence.push('weather unavailable is controlled by Playwright route interception')
  await page.goto(`/mountain/${mountain.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('body')).toContainText(/天气暂不可用|天气暂时不可用/)
  await expectBodyDoesNotLeakRaw(page, /upstream timeout|weather refresh failed/i)
  screenshots.weatherUnavailable = await capture(page, 'controlled-weather-unavailable-375.png')
  await page.unroute('**/api/weather/**')

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

  const summary = {
    label: 'FU-76 Sprint B Copy Humanization evidence',
    baseURL: root,
    controlledEvidence,
    screenshots,
    sourceLabelPoster: join(OUTPUT_DIR, 'source-label-poster-english.svg'),
    consoleEntries,
    pageErrors,
    overflow,
  }
  await writeFile(join(OUTPUT_DIR, 'fu76-sprint-b-copy-summary.json'), JSON.stringify(summary, null, 2))
  await context.close()
})
