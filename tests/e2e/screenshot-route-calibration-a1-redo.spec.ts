import { readFileSync } from 'node:fs'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import {
  measureScreenshotRouteShape,
  validateScreenshotRouteShape,
  type PersistedScreenshotRouteShape,
} from '@/lib/screenshot-route-shape'
import {
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu36-track-calib-sprintA-acceptance/a1-full-loop'
const BUILD_DIR = join(OUTPUT_DIR, 'browser-build-screens')
const MOTION_DIR = join(OUTPUT_DIR, 'motion')
const DESIGN_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu36-design-source/road001/project/screenshots'
const SAMPLE_CROP_IMAGE = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu36-track-v2-acceptance/crops/keep-648-map-crop.jpg'
const TALL_SAMPLE_IMAGE = join(OUTPUT_DIR, 'tall-full-screen-upload-fixture.png')

type StepLog = {
  step: string
  passed: boolean
  detail: string
}

type TapError = {
  kind: 'tap' | 'drag'
  index: number
  targetClientX: number
  targetClientY: number
  renderedClientX: number
  renderedClientY: number
  errorPx: number
}

async function ensureEvidenceDirs() {
  await mkdir(BUILD_DIR, { recursive: true })
  await mkdir(MOTION_DIR, { recursive: true })
}

async function ensureTallUploadFixture() {
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

async function mockScreenshotRecognition(page: Page) {
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
          location: { value: '户外路线', raw: 'Keep 登山' },
          distance: { value: 10.32, unit: 'km', raw: '10.32 公里' },
          duration: { value: 8168, raw: '02:16:08' },
          elevationGain: { value: 632, raw: '632 米' },
          date: { value: '2026-06-06', raw: '2026-06-06' },
        },
      }),
    })
  })
}

function readEnvValue(key: string) {
  try {
    const envText = readFileSync('.env.local', 'utf8')
    return envText.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function getSupabaseAdminClientForScreenshotTest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for screenshot route shape assertions.')
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function capture(page: Page, name: string) {
  const path = join(BUILD_DIR, name)
  await page.screenshot({ path, fullPage: false })
  return path
}

async function captureElement(page: Page, selector: string, name: string) {
  const path = join(BUILD_DIR, name)
  const locator = page.locator(selector).first()
  await locator.scrollIntoViewIfNeeded()
  await locator.screenshot({ path })
  return path
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
      .resize({ width: 375, fit: 'contain', background: '#08090a' })
      .png()
      .toBuffer({ resolveWithObject: true }),
    sharp(build)
      .resize({ width: 375, fit: 'contain', background: '#08090a' })
      .png()
      .toBuffer({ resolveWithObject: true }),
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

async function controlPointCenter(page: Page, index: number) {
  const box = await page.locator(`[data-route-control-point-index="${index}"]`).boundingBox()
  if (!box) throw new Error(`missing control point ${index}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function clickUnitPoint(page: Page, point: { x: number; y: number }, index: number): Promise<TapError> {
  const target = await viewBoxPointToClient(page, point)
  await page.mouse.click(target.x, target.y)
  await expect(page.locator(`[data-route-control-point-index="${index}"]`)).toBeVisible({ timeout: 5000 })
  const rendered = await controlPointCenter(page, index)
  return {
    kind: 'tap',
    index,
    targetClientX: Number(target.x.toFixed(2)),
    targetClientY: Number(target.y.toFixed(2)),
    renderedClientX: Number(rendered.x.toFixed(2)),
    renderedClientY: Number(rendered.y.toFixed(2)),
    errorPx: Number(Math.hypot(rendered.x - target.x, rendered.y - target.y).toFixed(2)),
  }
}

async function dragControlPoint(page: Page, index: number, targetUnit: { x: number; y: number }): Promise<TapError> {
  const start = await controlPointCenter(page, index)
  const target = await viewBoxPointToClient(page, targetUnit)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator(`[data-route-control-point-index="${index}"]`)).toBeVisible({ timeout: 5000 })
  const rendered = await controlPointCenter(page, index)
  return {
    kind: 'drag',
    index,
    targetClientX: Number(target.x.toFixed(2)),
    targetClientY: Number(target.y.toFixed(2)),
    renderedClientX: Number(rendered.x.toFixed(2)),
    renderedClientY: Number(rendered.y.toFixed(2)),
    errorPx: Number(Math.hypot(rendered.x - target.x, rendered.y - target.y).toFixed(2)),
  }
}

async function pinchZoomCanvas(page: Page) {
  return page.locator('[data-route-editor-canvas="true"]').evaluate(async (node) => {
    const svg = node as SVGSVGElement
    const before = {
      x: svg.viewBox.baseVal.x,
      y: svg.viewBox.baseVal.y,
      width: svg.viewBox.baseVal.width,
      height: svg.viewBox.baseVal.height,
    }
    const rect = svg.getBoundingClientRect()
    const eventInit = (pointerId: number, clientX: number, clientY: number): PointerEventInit => ({
      pointerId,
      pointerType: 'touch',
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    })
    svg.dispatchEvent(new PointerEvent('pointerdown', eventInit(11, rect.left + rect.width * 0.38, rect.top + rect.height * 0.42)))
    svg.dispatchEvent(new PointerEvent('pointerdown', eventInit(12, rect.left + rect.width * 0.62, rect.top + rect.height * 0.58)))
    svg.dispatchEvent(new PointerEvent('pointermove', eventInit(11, rect.left + rect.width * 0.30, rect.top + rect.height * 0.34)))
    svg.dispatchEvent(new PointerEvent('pointermove', eventInit(12, rect.left + rect.width * 0.70, rect.top + rect.height * 0.66)))
    svg.dispatchEvent(new PointerEvent('pointerup', eventInit(11, rect.left + rect.width * 0.30, rect.top + rect.height * 0.34)))
    svg.dispatchEvent(new PointerEvent('pointerup', eventInit(12, rect.left + rect.width * 0.70, rect.top + rect.height * 0.66)))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const after = {
      x: svg.viewBox.baseVal.x,
      y: svg.viewBox.baseVal.y,
      width: svg.viewBox.baseVal.width,
      height: svg.viewBox.baseVal.height,
    }
    return {
      before,
      after,
      zoomed: after.width < before.width && after.height < before.height,
    }
  })
}

async function readEditorViewBox(page: Page) {
  return page.locator('[data-route-editor-canvas="true"]').evaluate((node) => {
    const svg = node as SVGSVGElement
    return {
      x: svg.viewBox.baseVal.x,
      y: svg.viewBox.baseVal.y,
      width: svg.viewBox.baseVal.width,
      height: svg.viewBox.baseVal.height,
    }
  })
}

async function clickZoomButton(page: Page, name: string) {
  const before = await readEditorViewBox(page)
  await page.getByRole('button', { name }).click()
  await page.waitForTimeout(80)
  const after = await readEditorViewBox(page)
  return { before, after }
}

async function routeLineCount(page: Page) {
  return page.locator('[data-route-line="true"]').count()
}

async function bodyText(page: Page) {
  return page.locator('body').innerText()
}

function csvEscape(value: string | number | boolean) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

test.use({ video: 'on' })

test('A1 full loop persists calibrated screenshot shape and renders it on activity', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const uploadFixture = await ensureTallUploadFixture()
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const steps: StepLog[] = []
  const tapErrors: TapError[] = []

  await page.setViewportSize({ width: 375, height: 812 })
  await mockScreenshotRecognition(page)
  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)

  await page.locator('input[type="file"]').first().setInputFiles(uploadFixture)
  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('截图路线 · 可校准')).toBeVisible()
  await expect(page.getByLabel('总距离 km')).toHaveValue('10.32')
  await expect(page.getByText('点击查看完整截图轨迹')).toBeVisible()
  await expect(page.getByText('也可只保存文字数据', { exact: true })).toHaveCount(0)
  await expect(page.getByText('校准路线可选；只确认文字数据也能生成活动。')).toBeVisible()
  const confirmEntry = await capture(page, 'confirm-entry-build.png')
  steps.push({ step: 'upload_to_confirm_entry', passed: true, detail: '确认页显示轨迹校准入口和文字字段' })

  await page.getByRole('button', { name: '校准轨迹' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toBeVisible()
  const emptyEditor = await capture(page, 'empty-editor-build.png')
  const coach = await capture(page, 'coach-build.png')

  const points = [
    { x: 0.24, y: 0.06 },
    { x: 0.48, y: 0.50 },
    { x: 0.72, y: 0.94 },
  ]
  tapErrors.push(await clickUnitPoint(page, points[0], 0))
  tapErrors.push(await clickUnitPoint(page, points[1], 1))
  await page.waitForFunction(() => document.querySelectorAll('[data-route-line="true"]').length >= 1)
  const linesAfterSecond = await routeLineCount(page)
  steps.push({ step: 'line_after_second_point', passed: linesAfterSecond >= 1, detail: `lineCount=${linesAfterSecond}` })

  tapErrors.push(await clickUnitPoint(page, points[2], 2))
  await page.waitForFunction(() => document.querySelectorAll('[data-route-line="true"]').length >= 2)
  const linesAfterThird = await routeLineCount(page)
  steps.push({ step: 'route_extends_after_third_point', passed: linesAfterThird >= 2, detail: `lineCount=${linesAfterThird}` })
  const retrace = await capture(page, 'retrace-build.png')

  const initialViewBox = await readEditorViewBox(page)
  steps.push({
    step: 'editor_opens_full_screenshot_at_1x',
    passed: Math.abs(initialViewBox.x) < 0.01 && Math.abs(initialViewBox.y) < 0.01,
    detail: `viewBox=${JSON.stringify(initialViewBox)}`,
  })

  const zoomIn = await clickZoomButton(page, '放大底图')
  steps.push({
    step: 'button_zoom_in_changes_viewbox',
    passed: zoomIn.after.width < zoomIn.before.width && zoomIn.after.height < zoomIn.before.height,
    detail: `before=${zoomIn.before.width.toFixed(1)}x${zoomIn.before.height.toFixed(1)}; after=${zoomIn.after.width.toFixed(1)}x${zoomIn.after.height.toFixed(1)}`,
  })
  const zoomedEditor = await capture(page, 'zoomed-editor-build.png')
  steps.push({ step: 'zoomed_editor_screenshot_captured', passed: true, detail: zoomedEditor })

  tapErrors.push(await clickUnitPoint(page, { x: 0.60, y: 0.62 }, 3))
  await page.waitForFunction(() => document.querySelectorAll('[data-route-line="true"]').length >= 3)
  tapErrors.push(await dragControlPoint(page, 1, { x: 0.50, y: 0.42 }))
  const zoomOut = await clickZoomButton(page, '缩小底图')
  steps.push({
    step: 'button_zoom_out_changes_viewbox',
    passed: zoomOut.after.width > zoomOut.before.width && zoomOut.after.height > zoomOut.before.height,
    detail: `before=${zoomOut.before.width.toFixed(1)}x${zoomOut.before.height.toFixed(1)}; after=${zoomOut.after.width.toFixed(1)}x${zoomOut.after.height.toFixed(1)}`,
  })

  const pinch = await pinchZoomCanvas(page)
  steps.push({
    step: 'pinch_zoom_changes_viewbox',
    passed: pinch.zoomed,
    detail: `before=${pinch.before.width.toFixed(1)}x${pinch.before.height.toFixed(1)}; after=${pinch.after.width.toFixed(1)}x${pinch.after.height.toFixed(1)}`,
  })

  const maxError = Math.max(...tapErrors.map((entry) => entry.errorPx))
  const topTap = tapErrors.find((entry) => entry.kind === 'tap' && entry.index === 0)
  const bottomTap = tapErrors.find((entry) => entry.kind === 'tap' && entry.index === 2)
  const zoomedTap = tapErrors.find((entry) => entry.kind === 'tap' && entry.index === 3)
  const dragError = tapErrors.find((entry) => entry.kind === 'drag')
  steps.push({
    step: 'extreme_tap_and_drag_error_under_4px',
    passed: maxError <= 4 && Boolean(topTap && bottomTap && zoomedTap && dragError),
    detail: `maxError=${maxError}px; top=${topTap?.errorPx}; bottom=${bottomTap?.errorPx}; zoomedTap=${zoomedTap?.errorPx}; drag=${dragError?.errorPx}`,
  })

  const forbiddenText = await bodyText(page)
  const forbiddenPatterns = [
    /第\s*\d+\s*段/,
    /低证据/,
    /确认直连/,
    /接受断点/,
    /confirmed_straight|user_confirmed_shape|needs_more_anchor|low_evidence_straight|honest_gap/,
  ]
  const forbiddenHits = forbiddenPatterns.filter((pattern) => pattern.test(forbiddenText)).map(String)
  steps.push({ step: 'zero_engineering_state_in_ui', passed: forbiddenHits.length === 0, detail: forbiddenHits.join('; ') || 'none' })

  const lockBeforeViewBox = await readEditorViewBox(page)
  await page.getByRole('button', { name: '确认轨迹' }).click()
  await expect(page.getByText('已锁定')).toBeVisible({ timeout: 3000 })
  const lockAfterViewBox = await readEditorViewBox(page)
  const lock = await capture(page, 'lock-build.png')
  steps.push({
    step: 'lock_resets_to_full_screenshot_viewbox',
    passed:
      lockBeforeViewBox.width < initialViewBox.width &&
      lockBeforeViewBox.height < initialViewBox.height &&
      Math.abs(lockAfterViewBox.x) < 0.01 &&
      Math.abs(lockAfterViewBox.y) < 0.01 &&
      Math.abs(lockAfterViewBox.width - initialViewBox.width) < 0.01 &&
      Math.abs(lockAfterViewBox.height - initialViewBox.height) < 0.01,
    detail: `before=${JSON.stringify(lockBeforeViewBox)}; after=${JSON.stringify(lockAfterViewBox)}; screenshot=${lock}`,
  })
  await expect(page.locator('[data-route-calibration-editor="true"]')).toHaveCount(0, { timeout: 5000 })
  await expect(page.getByText('确认识别结果')).toBeVisible()
  const editorVisible = await page.locator('[data-route-calibration-editor="true"]').count()
  const breakSheetVisible = await page.getByText('这段轨迹是断开的').count()
  const confirmMain = page.locator('[data-screenshot-confirm-main="true"]')
  const confirmScrollBefore = await confirmMain.evaluate((node) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    scrollTop: node.scrollTop,
  }))
  steps.push({
    step: 'confirm_page_has_single_scroll_container_after_calibration',
    passed: confirmScrollBefore.scrollHeight > confirmScrollBefore.clientHeight,
    detail: `scrollHeight=${confirmScrollBefore.scrollHeight}; clientHeight=${confirmScrollBefore.clientHeight}; scrollTop=${confirmScrollBefore.scrollTop}`,
  })
  steps.push({
    step: 'confirm_returns_to_confirm_page_without_trap',
    passed: editorVisible === 0 && breakSheetVisible === 0,
    detail: `editorVisible=${editorVisible > 0}; breakSheetVisible=${breakSheetVisible > 0}`,
  })

  await confirmMain.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await expect(page.getByText('请检查总距离和已填写的数据。')).toHaveCount(0)
  const submitButton = page.getByRole('button', { name: '确认并生成活动' })
  const submitBox = await submitButton.boundingBox()
  const viewport = page.viewportSize()
  const footerClickable = Boolean(
    submitBox &&
    viewport &&
    submitBox.y >= 0 &&
    submitBox.y + submitBox.height <= viewport.height,
  )
  steps.push({
    step: 'submit_footer_visible_after_manual_scroll_without_scroll_into_view',
    passed: footerClickable,
    detail: submitBox && viewport ? `buttonY=${submitBox.y.toFixed(1)}; buttonBottom=${(submitBox.y + submitBox.height).toFixed(1)}; viewportH=${viewport.height}` : 'missing box',
  })

  await submitButton.click()
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+/u, { timeout: 20_000 })
  await expect(page.locator('[data-route-source="screenshot-shape"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-map-mode="screenshot-shape"]')).toBeVisible()
  const activityScreenshot = await captureElement(page, '[data-testid="activity-route-map"]', 'activity-screenshot-shape-build.png')
  const activityText = await bodyText(page)
  const gpsLeak = /GPS VERIFIED|GPS 已验证|轨迹 · 海拔 · 登顶点位均完整/u.test(activityText)
  steps.push({
    step: 'activity_shows_screenshot_shape_not_gps',
    passed: !gpsLeak && (await page.locator('[data-route-source="screenshot-shape"]').count()) === 1,
    detail: `gpsLeak=${gpsLeak}; screenshotShapeCard=visible; screenshot=${activityScreenshot}`,
  })

  await page.goto(`${root}/screenshot`)
  await mockScreenshotRecognition(page)
  await page.locator('input[type="file"]').first().setInputFiles(uploadFixture)
  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '校准轨迹' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('peak-trekker:route-calibration-show-honest-gap')))
  await expect(page.getByText('这段轨迹是断开的')).toBeVisible()
  const honestGap = await capture(page, 'honest-gap-build.png')

  await writeSideBySide({
    design: join(DESIGN_DIR, 'v3-confirm.png'),
    build: confirmEntry,
    output: join(OUTPUT_DIR, 'design-build-diff-confirm-entry.png'),
  })
  await writeSideBySide({
    design: join(DESIGN_DIR, 'state-c.png'),
    build: emptyEditor,
    output: join(OUTPUT_DIR, 'design-build-diff-empty-editor.png'),
  })
  await writeSideBySide({
    design: join(DESIGN_DIR, 'v2-editor-coach.png'),
    build: coach,
    output: join(OUTPUT_DIR, 'design-build-diff-coach.png'),
  })
  await writeSideBySide({
    design: join(DESIGN_DIR, 'heroA.png'),
    build: retrace,
    output: join(OUTPUT_DIR, 'design-build-diff-retrace.png'),
  })
  await writeSideBySide({
    design: join(DESIGN_DIR, 'heroB.png'),
    build: honestGap,
    output: join(OUTPUT_DIR, 'design-build-diff-honest-gap.png'),
  })
  await writeSideBySide({
    design: join(DESIGN_DIR, '01-v3-lock.png'),
    build: lock,
    output: join(OUTPUT_DIR, 'design-build-diff-lock.png'),
  })

  await writeFile(
    join(OUTPUT_DIR, 'tap-error.csv'),
    [
      'kind,index,targetClientX,targetClientY,renderedClientX,renderedClientY,errorPx',
      ...tapErrors.map((entry) => [
        entry.kind,
        entry.index,
        entry.targetClientX,
        entry.targetClientY,
        entry.renderedClientX,
        entry.renderedClientY,
        entry.errorPx,
      ].map(csvEscape).join(',')),
    ].join('\n'),
  )
  await writeFile(join(OUTPUT_DIR, 'tap-error.json'), `${JSON.stringify(tapErrors, null, 2)}\n`)
  await writeFile(join(OUTPUT_DIR, 'zoom-metrics.json'), `${JSON.stringify({ buttonZoomIn: zoomIn, buttonZoomOut: zoomOut, pinch, lock: { before: lockBeforeViewBox, after: lockAfterViewBox } }, null, 2)}\n`)
  await writeFile(
    join(OUTPUT_DIR, 'a1-redo-fix-passfail.md'),
    [
      '# FU-36 A1-REDO-Minimal Interaction Fix Self-Test',
      '',
      `Video: ${join(MOTION_DIR, 'interaction.webm')}`,
      `Tall upload fixture: ${uploadFixture}`,
      `Tap/drag max error: ${maxError}px`,
      '',
      '| Step | Result | Detail |',
      '|---|---:|---|',
      ...steps.map((step) => `| ${step.step} | ${step.passed ? 'pass' : 'fail'} | ${step.detail.replace(/\|/g, '\\|')} |`),
      '',
      'No PASS claim. This log records objective gates for user + Claude review.',
      '',
    ].join('\n'),
  )
  await writeFile(join(OUTPUT_DIR, 'a1-redo-fix-passfail.json'), `${JSON.stringify({ steps, tapErrors, zoom: { buttonZoomIn: zoomIn, buttonZoomOut: zoomOut, pinch, lock: { before: lockBeforeViewBox, after: lockAfterViewBox } } }, null, 2)}\n`)

  const failed = steps.filter((step) => !step.passed)
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([])

  const video = page.video()
  await page.close()
  const videoPath = await video?.path()
  if (videoPath) {
    await copyFile(videoPath, join(MOTION_DIR, 'interaction.webm'))
  }
})

test('A1 full loop text-only screenshot creates activity with no fake route fallback', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const uploadFixture = await ensureTallUploadFixture()
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  await mockScreenshotRecognition(page)
  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)

  await page.locator('input[type="file"]').first().setInputFiles(uploadFixture)
  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('总距离 km')).toHaveValue('10.32')
  await expect(page.getByText('请检查总距离和已填写的数据。')).toHaveCount(0)
  await page.getByRole('button', { name: '确认并生成活动' }).click()
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+/u, { timeout: 20_000 })
  await expect(page.locator('[data-route-source="screenshot-text-only"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-route-source="screenshot-shape"]')).toHaveCount(0)
  await expect(page.locator('[data-map-mode="screenshot-shape"]')).toBeVisible()
  await captureElement(page, '[data-testid="activity-route-map"]', 'activity-screenshot-text-only-build.png')
})

test('A1 full loop persists a dense multi-point calibrated route after route-shape simplification', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const uploadFixture = await ensureTallUploadFixture()
  const root = baseURL ?? 'http://127.0.0.1:3100'
  let capturedRouteShape: PersistedScreenshotRouteShape | null = null

  await page.setViewportSize({ width: 375, height: 812 })
  await mockScreenshotRecognition(page)
  await page.route('**/api/import/confirm', async (route) => {
    const payload = route.request().postDataJSON() as { routeShape?: PersistedScreenshotRouteShape | null } | null
    capturedRouteShape = payload?.routeShape ?? null
    await route.fallback()
  })
  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)

  await page.locator('input[type="file"]').first().setInputFiles(uploadFixture)
  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('总距离 km')).toHaveValue('10.32')
  await page.getByRole('button', { name: '校准轨迹' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toBeVisible()

  const densePoints = Array.from({ length: 24 }, (_, index) => {
    const t = index / 23
    return {
      x: 0.12 + 0.76 * t,
      y: 0.18 + ((index % 2 === 0 ? 0.18 : 0.72) + Math.sin(index * 0.7) * 0.04) * 0.72,
    }
  })

  for (let index = 0; index < densePoints.length; index += 1) {
    await clickUnitPoint(page, densePoints[index]!, index)
    if (index >= 1) {
      await expect(page.locator('[data-route-line="true"]').first()).toBeVisible({ timeout: 5000 })
    }
  }

  await expect(page.locator('[data-route-control-point="true"]')).toHaveCount(densePoints.length)
  await page.getByRole('button', { name: '确认轨迹' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toHaveCount(0, { timeout: 5000 })
  await expect(page.getByText('确认识别结果')).toBeVisible()
  await expect(page.getByText('校准路线太复杂')).toHaveCount(0)
  const confirmMain = page.locator('[data-screenshot-confirm-main="true"]')
  await confirmMain.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await page.getByRole('button', { name: '确认并生成活动' }).click()
  await expect(page).toHaveURL(/\/activity\/[0-9a-f-]+/u, { timeout: 20_000 })

  const activityId = page.url().match(/\/activity\/([0-9a-f-]+)/u)?.[1]
  expect(activityId).toBeTruthy()
  const routeShapeMetrics = measureScreenshotRouteShape(capturedRouteShape)
  const routeShapeValidation = validateScreenshotRouteShape(capturedRouteShape)
  expect(routeShapeValidation.ok, JSON.stringify(routeShapeValidation)).toBe(true)
  expect(routeShapeMetrics.controlPoints).toBe(densePoints.length)
  expect(routeShapeMetrics.segments).toBe(densePoints.length - 1)
  expect(routeShapeMetrics.segments).toBeGreaterThan(20)
  expect(routeShapeMetrics.serializedByteSize).toBeLessThanOrEqual(256 * 1024)

  const supabase = getSupabaseAdminClientForScreenshotTest()
  const { data, error } = await supabase
    .from('checkins')
    .select('id, screenshot_route_shape, track_points')
    .eq('id', activityId!)
    .maybeSingle()
  expect(error).toBeNull()
  expect(data?.screenshot_route_shape).toBeTruthy()
  expect(data?.track_points).toEqual([])
  await expect(page.locator('[data-route-source="screenshot-shape"]')).toBeVisible({ timeout: 20_000 })
  await captureElement(page, '[data-testid="activity-route-map"]', 'activity-screenshot-dense-shape-build.png')

  await writeFile(
    join(OUTPUT_DIR, 'dense-route-shape-metrics.json'),
    `${JSON.stringify({
      activityId,
      routeShapeMetrics,
      dbShapePresent: Boolean(data?.screenshot_route_shape),
      dbTrackPointsLength: Array.isArray(data?.track_points) ? data.track_points.length : null,
    }, null, 2)}\n`,
  )
})

test('over-complex calibrated route requires explicit text-only choice before creating activity', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const uploadFixture = await ensureTallUploadFixture()
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const confirmRequests: Array<{ routeShape?: unknown }> = []

  await page.setViewportSize({ width: 375, height: 812 })
  await mockScreenshotRecognition(page)
  await page.route('**/api/import/confirm', async (route) => {
    const payload = route.request().postDataJSON() as { routeShape?: unknown }
    confirmRequests.push(payload)
    if (confirmRequests.length === 1) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: '校准路线太复杂，无法保存。请减少控制点后再确认，或清空校准路线后只保存文字数据。',
          code: 'route_shape_invalid',
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, checkinId: '00000000-0000-4000-8000-000000000001' }),
    })
  })
  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)

  await page.locator('input[type="file"]').first().setInputFiles(uploadFixture)
  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '校准轨迹' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toBeVisible()
  await clickUnitPoint(page, { x: 0.18, y: 0.32 }, 0)
  await clickUnitPoint(page, { x: 0.52, y: 0.6 }, 1)
  await clickUnitPoint(page, { x: 0.82, y: 0.34 }, 2)
  await page.getByRole('button', { name: '确认轨迹' }).click()
  await expect(page.locator('[data-route-calibration-editor="true"]')).toHaveCount(0, { timeout: 5000 })

  const confirmMain = page.locator('[data-screenshot-confirm-main="true"]')
  await confirmMain.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await page.getByRole('button', { name: '确认并生成活动' }).click()
  await expect(page.getByText('校准路线太复杂')).toBeVisible({ timeout: 5000 })
  await expect(page).not.toHaveURL(/\/activity\/[0-9a-f-]+/u)
  expect(confirmRequests).toHaveLength(1)
  expect(confirmRequests[0]?.routeShape).toBeTruthy()

  await page.getByRole('button', { name: '仅保存文字数据' }).click()
  await expect(page).toHaveURL(/\/activity\/00000000-0000-4000-8000-000000000001/u, { timeout: 10_000 })
  expect(confirmRequests).toHaveLength(2)
  expect(confirmRequests[1]?.routeShape).toBeNull()

  await writeFile(
    join(OUTPUT_DIR, 'explicit-text-only-after-route-shape-invalid.json'),
    `${JSON.stringify({
      firstSubmitCreatedActivity: false,
      firstPayloadHadRouteShape: Boolean(confirmRequests[0]?.routeShape),
      secondPayloadRouteShape: confirmRequests[1]?.routeShape ?? null,
    }, null, 2)}\n`,
  )
})
