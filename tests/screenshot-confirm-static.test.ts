import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const screenshotClient = readFileSync('src/app/(flow)/screenshot/ScreenshotClient.tsx', 'utf8')
const importConfirmRoute = readFileSync('src/app/api/import/confirm/route.ts', 'utf8')
const activityPage = readFileSync('src/app/(flow)/activity/[id]/page.tsx', 'utf8')
const activityRouteMap = readFileSync('src/components/activity/ActivityRouteMap.tsx', 'utf8')
const screenshotRecognizeRoute = readFileSync('src/app/api/screenshot/recognize/route.ts', 'utf8')
const screenshotQuotaHelper = readFileSync('src/lib/screenshot/quota.ts', 'utf8')
const screenshotOcrAdapter = readFileSync('src/lib/screenshot/tencent-ocr-adapter.ts', 'utf8')
const screenshotRecognitionStatus = readFileSync('src/lib/screenshot/recognition-status.ts', 'utf8')
const screenshotRecognitionService = readFileSync('src/lib/screenshot/recognition-service.ts', 'utf8')
const screenshotRecognizeErrorCopy = readFileSync('src/lib/screenshot/recognize-error-copy.ts', 'utf8')
const screenshotRecognizeAuthErrors = readFileSync('src/lib/screenshot/recognize-auth-errors.ts', 'utf8')
const screenshotRecognizeClientErrors = readFileSync('src/lib/screenshot/recognize-client-errors.ts', 'utf8')
const screenshotMimoAdapter = readFileSync('src/lib/screenshot/mimo-v25-adapter.ts', 'utf8')
const screenshotMimoAdjudicator = readFileSync('src/lib/screenshot/mimo-v25-text-adjudicator.ts', 'utf8')
const screenshotFieldValidation = readFileSync('src/lib/screenshot-field-validation.ts', 'utf8')
const screenshotQuotaMigration = readFileSync('supabase/migrations/20260517063336_create_screenshot_quota.sql', 'utf8')
const mountainSearchRoute = readFileSync('src/app/api/mountains/search/route.ts', 'utf8')
const trekVerifyHelpers = readFileSync('src/lib/trek-verify-helpers.ts', 'utf8')

test('screenshot confirm path writes through import confirm without requiring track points', () => {
  assert.match(importConfirmRoute, /isScreenshotRecognitionSource\(source\)/)
  assert.match(importConfirmRoute, /handleScreenshotRecognitionConfirm/)
  assert.match(importConfirmRoute, /normalizeScreenshotData/)
  assert.match(importConfirmRoute, /validateScreenshotRouteShape/)
  assert.match(importConfirmRoute, /source:\s*SCREENSHOT_RECOGNITION_SOURCE/)
  assert.match(importConfirmRoute, /track_points:\s*\[\]/)
  assert.match(importConfirmRoute, /screenshot_route_shape:\s*routeShapeResult\.shape/)
  assert.match(importConfirmRoute, /insertCheckinWithFallback/)

  const screenshotBranchIndex = importConfirmRoute.indexOf('isScreenshotRecognitionSource(source)')
  const trackNormalizeIndex = importConfirmRoute.indexOf('normalizeImportedTrackData(rawParsedData)')
  assert.ok(screenshotBranchIndex >= 0)
  assert.ok(trackNormalizeIndex >= 0)
  assert.ok(screenshotBranchIndex < trackNormalizeIndex)
})

test('screenshot recognition checkins are uploaded proof and never GPS ranking records', () => {
  assert.match(importConfirmRoute, /Screenshot recognition is uploaded proof, not GPS\/summit verification\./)
  assert.match(importConfirmRoute, /verified_at:\s*null/)
  assert.match(importConfirmRoute, /ranking_weight:\s*0/)
  assert.match(importConfirmRoute, /track_points:\s*\[\]/)
})

test('screenshot client uses real preview, editable fields, mountain search, and archive-to-share success flow', () => {
  assert.doesNotMatch(screenshotClient, /MockScreenshotPreview/)
  assert.doesNotMatch(screenshotClient, /截图活动生成接口待接入/)
  assert.match(screenshotClient, /ScreenshotProcessingPreview/)
  assert.match(screenshotClient, /buildEditableFields/)
  assert.match(screenshotClient, /\{\s*key:\s*'pace',\s*label:\s*'配速 \/km'/)
  assert.match(screenshotClient, /paceMinPerKm/)
  assert.match(screenshotClient, /validateScreenshotEditableFields/)
  assert.match(screenshotClient, /buildPersistableScreenshotRouteShape/)
  assert.match(screenshotClient, /validateScreenshotRouteShape\(routeShape\)/)
  assert.match(screenshotClient, /measureScreenshotRouteShape\(routeShape\)/)
  assert.match(screenshotClient, /aria-label=\{config\.label\}/)
  assert.match(screenshotClient, /aria-label="时长"/)
  assert.match(screenshotClient, /\{\s*key:\s*'elevationLoss',\s*label:\s*'下降 m'/)
  assert.match(screenshotClient, /\/api\/mountains\/search\?q=/)
  assert.match(screenshotClient, /source:\s*SCREENSHOT_RECOGNITION_SOURCE/)
  assert.match(screenshotClient, /\/api\/import\/confirm/)
  assert.match(screenshotClient, /data-testid="screenshot-archive-moment"/)
  assert.match(screenshotClient, /setStep\('success'\)/)
  assert.match(screenshotClient, /router\.replace\(`\/share\?checkinId=\$\{submitResult\.checkinId\}`\)/)
  assert.match(screenshotClient, /router\.replace\(`\/activity\/\$\{submitResult\.checkinId\}`\)/)
  assert.doesNotMatch(screenshotClient, /router\.push\(`\/activity\/\$\{payload\.checkinId\}`\)/)
})

test('screenshot upload back exits to explore with replace and completed actions stay replace-based', () => {
  assert.match(screenshotClient, /if \(step === 'upload'\) \{[\s\S]{0,80}router\.replace\('\/explore'\)/)
  assert.doesNotMatch(screenshotClient, /if \(step === 'upload'\) \{[\s\S]{0,80}router\.back\(\)/)
  assert.match(screenshotClient, /router\.replace\(`\/activity\/\$\{submitResult\.checkinId\}`\)/)
  assert.match(screenshotClient, /router\.replace\(`\/share\?checkinId=\$\{submitResult\.checkinId\}`\)/)
  assert.match(screenshotClient, /function handleArchiveBack\(\) \{[\s\S]{0,120}router\.replace\(`\/activity\/\$\{submitResult\.checkinId\}`\)/)
  assert.match(screenshotClient, /function handleArchiveContinue\(\) \{[\s\S]{0,120}router\.replace\(`\/share\?checkinId=\$\{submitResult\.checkinId\}`\)/)
  assert.doesNotMatch(screenshotClient, /SCREENSHOT_COMPLETION_EXIT_REDIRECT_KEY/)
  assert.doesNotMatch(screenshotClient, /completion_exit_redirect_until/)
  assert.doesNotMatch(screenshotClient, /consumeScreenshotCompletionExitRedirectFlag/)
  assert.doesNotMatch(screenshotClient, /consumeScreenshotCompletionExitRedirectFlag\(\)[\s\S]{0,120}router\.replace\('\/explore'\)/)
})

test('screenshot confirm treats elevation and duration as optional sanitized fields', () => {
  assert.match(importConfirmRoute, /normalizeScreenshotData/)
  assert.doesNotMatch(importConfirmRoute, /typeof distanceMeters !== 'number' \|\| typeof maxElevation !== 'number'/)
  assert.match(importConfirmRoute, /max_elevation_meters:\s*parsedData\.maxElevation \?\? null/)
  assert.doesNotMatch(importConfirmRoute, /speedKmh/)
  assert.doesNotMatch(importConfirmRoute, /paceMinPerKm/)
  assert.match(screenshotClient, /validateScreenshotEditableFields\(\{[\s\S]*fields: editableFields,[\s\S]*toggles: fieldToggles,[\s\S]*fileName: imageFile\?\.name,[\s\S]*\}\)/)
  assert.doesNotMatch(screenshotClient, /请检查总距离和已填写的数据/)
  assert.match(screenshotClient, /data-field-error/)
  assert.match(screenshotFieldValidation, /格式不对，本次不会保存该字段/)
})

test('screenshot route shape invalid path is explicit and never silently downgrades calibration', () => {
  assert.match(importConfirmRoute, /validateScreenshotRouteShape\(body\.routeShape\)/)
  assert.match(importConfirmRoute, /code:\s*'route_shape_invalid'/)
  assert.doesNotMatch(importConfirmRoute, /detail:\s*error\?\.message/)
  assert.doesNotMatch(importConfirmRoute, /detail:\s*routeShapeResult\.error/)
  assert.match(importConfirmRoute, /console\.error\('screenshot route shape checkin insert failed'/)
  assert.match(importConfirmRoute, /shapeMetrics:\s*measureScreenshotRouteShape\(routeShapeResult\.shape\)/)
  assert.match(importConfirmRoute, /校准路线太复杂，无法保存。请减少控制点后再确认，或清空校准路线后只保存文字数据。/)
  assert.match(screenshotClient, /仅保存文字数据/)
  assert.match(screenshotClient, /routeShapeRecoveryOpen/)
  assert.doesNotMatch(screenshotClient, /routeShapeValidation\.ok[\s\S]{0,300}routeShape:\s*null/)
})

test('activity read fallback drops only screenshot route shape before legacy stats-less select', () => {
  assert.match(activityPage, /CHECKIN_SELECT_FULL/)
  assert.match(activityPage, /CHECKIN_SELECT_WITHOUT_SCREENSHOT_ROUTE_SHAPE/)
  assert.match(activityPage, /CHECKIN_SELECT_LEGACY/)
  const intermediateIndex = activityPage.indexOf('CHECKIN_SELECT_WITHOUT_SCREENSHOT_ROUTE_SHAPE')
  const legacyIndex = activityPage.indexOf('CHECKIN_SELECT_LEGACY')
  assert.ok(intermediateIndex >= 0)
  assert.ok(legacyIndex >= 0)
  assert.ok(intermediateIndex < legacyIndex)
  const intermediateSelect = activityPage.match(/const CHECKIN_SELECT_WITHOUT_SCREENSHOT_ROUTE_SHAPE = `([\s\S]*?)`/)?.[1] ?? ''
  assert.match(intermediateSelect, /distance_meters/)
  assert.match(intermediateSelect, /duration_seconds/)
  assert.match(intermediateSelect, /elevation_gain_meters/)
  assert.match(intermediateSelect, /track_points/)
  assert.doesNotMatch(intermediateSelect, /screenshot_route_shape/)
})

test('screenshot route shape is not optional-stripped on insert', () => {
  const optionalColumns = trekVerifyHelpers.match(/const OPTIONAL_CHECKIN_COLUMNS = \[([\s\S]*?)\]/)?.[1] ?? ''
  assert.doesNotMatch(optionalColumns, /screenshot_route_shape/)
})

test('activity screenshot route card uses fixed square display frame instead of original screenshot dimensions', () => {
  const cardSource = activityRouteMap.match(/function ScreenshotRouteShapeCard[\s\S]*?function ScreenshotTextOnlyRouteCard/)?.[0] ?? ''
  assert.match(cardSource, /const frameSize = 343/)
  assert.match(cardSource, /aria-label="截图校准路线"/)
  assert.match(cardSource, /aspectRatio:\s*'1 \/ 1'/)
  assert.match(cardSource, /viewBox=\{`0 0 \$\{frameSize\} \$\{frameSize\}`\}/)
  assert.match(cardSource, /width:\s*frameSize/)
  assert.match(cardSource, /height:\s*frameSize/)
  assert.match(cardSource, /SHARE_TRACK_RENDER_PROFILES\.activityScreenshotCard/)
  assert.doesNotMatch(cardSource, /SHARE_TRACK_RENDER_PROFILES\.activityCard/)
  assert.doesNotMatch(cardSource, /<span>截图校准路线<\/span>/)
  assert.doesNotMatch(cardSource, /shape\?\.image\.width/)
  assert.doesNotMatch(cardSource, /shape\?\.image\.height/)
  assert.doesNotMatch(cardSource, /aspectRatio:\s*`\$\{width\} \/ \$\{height\}`/)
})

test('mountain search supports recognized mountain name candidates such as Taishan', () => {
  assert.match(mountainSearchRoute, /\.ilike\('name', `%\$\{query\}%`\)/)
  assert.match(mountainSearchRoute, /select\('id, name, altitude, province, latitude, longitude'\)/)
  assert.match(screenshotClient, /setSelectedMountainId\(options\[0\]\?\.id \?\? null\)/)
})

test('screenshot recognition route enforces quota with service-role RPC only', () => {
  assert.match(screenshotRecognizeRoute, /export async function GET/)
  assert.match(screenshotRecognizeRoute, /export const runtime = 'nodejs'/)
  assert.match(screenshotRecognizeRoute, /export const maxDuration = 60/)
  assert.match(screenshotRecognizeRoute, /getScreenshotQuotaState/)
  assert.match(screenshotRecognizeRoute, /recognizeThenConsumeScreenshotQuota\(\{[\s\S]*adminClient:\s*createSupabaseAdminClient\(\)/)
  assert.match(readFileSync('src/lib/screenshot/recognition-quota.ts', 'utf8'), /const recognition = await recognize\(imageBase64,\s*mimeType\)[\s\S]*const quotaResult = await consume\(adminClient,\s*userId,\s*quota\)/)
  assert.match(screenshotRecognizeRoute, /status:\s*402/)
  assert.match(screenshotRecognizeRoute, /screenshot_quota_exhausted/)
  assert.match(screenshotRecognizeRoute, /ocrSource/)
  assert.match(readFileSync('src/lib/screenshot/recognition-quota.ts', 'utf8'), /recognizeScreenshotText/)
  assert.match(screenshotRecognizeRoute, /screenshotRecognitionErrorStatus/)
  assert.match(screenshotRecognizeRoute, /recognitionMeta/)
  assert.doesNotMatch(screenshotRecognitionStatus, /limit\|quota\|rate/)
  assert.match(screenshotRecognitionStatus, /rate\.\?limit/)
  assert.match(screenshotRecognitionStatus, /too many requests/)

  assert.match(screenshotQuotaMigration, /REVOKE ALL ON FUNCTION public\.consume_screenshot_quota\(UUID, TEXT, INTEGER, INTEGER\)\s+FROM PUBLIC, authenticated, anon;/)
  assert.match(screenshotQuotaMigration, /GRANT EXECUTE ON FUNCTION public\.consume_screenshot_quota\(UUID, TEXT, INTEGER, INTEGER\)\s+TO service_role;/)
  assert.doesNotMatch(screenshotQuotaMigration, /GRANT EXECUTE ON FUNCTION public\.consume_screenshot_quota\(UUID, TEXT, INTEGER, INTEGER\)\s+TO authenticated;/)
  assert.match(screenshotQuotaHelper, /\.rpc\('consume_screenshot_quota'/)
})

test('screenshot recognition transient errors use friendly copy and do not consume quota', async () => {
  const { recognizeThenConsumeScreenshotQuota } = await import('../src/lib/screenshot/recognition-quota.ts')
  let consumed = false
  const quota = {
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
  } as const

  await assert.rejects(
    () => recognizeThenConsumeScreenshotQuota({
      imageBase64: 'base64',
      mimeType: 'image/png',
      userId: 'user-id',
      quota,
      adminClient: {} as never,
      recognize: async () => {
        throw new TypeError('fetch failed')
      },
      consume: async (_adminClient, _userId, nextQuota) => {
        consumed = true
        return { success: true, bucket: 'free', quota: nextQuota }
      },
    }),
    /fetch failed/,
  )
  assert.equal(consumed, false)

  assert.match(screenshotRecognizeErrorCopy, /识别服务暂时不可用，请稍后重试。本次未消耗识别次数。/)
  assert.match(screenshotRecognizeRoute, /return recognitionFailureResponse\(error\)/)
  assert.doesNotMatch(screenshotRecognizeRoute, /\{ error: error instanceof Error \? error\.message/)
})

test('screenshot recognize route sanitizes auth, quota, and client network error surfaces', () => {
  assert.match(screenshotRecognizeRoute, /resolveScreenshotAuthState/)
  assert.match(screenshotRecognizeAuthErrors, /isAuthRetryableFetchError/)
  assert.match(screenshotRecognizeAuthErrors, /isAuthSessionMissingError/)
  assert.match(screenshotRecognizeRoute, /authUnavailableResponse\(auth\.error\)/)
  assert.match(screenshotRecognizeRoute, /SCREENSHOT_RECOGNITION_RETRY_MESSAGE/)
  assert.match(screenshotRecognizeRoute, /console\.error\('screenshot quota consumption failed'/)
  assert.match(screenshotRecognizeRoute, /\{ error: TEMPORARY_QUOTA_ERROR_MESSAGE \}/)
  assert.doesNotMatch(screenshotRecognizeRoute, /\{ error: quotaResult\.error/)
  assert.doesNotMatch(screenshotRecognizeRoute, /quotaResult\.error \?\?/)
  assert.match(screenshotRecognizeClientErrors, /kind === 'network'/)
  assert.match(screenshotRecognizeClientErrors, /SCREENSHOT_RECOGNITION_RETRY_MESSAGE/)
  assert.match(screenshotRecognizeClientErrors, /if \(kind === 'network'\) \{[\s\S]*SCREENSHOT_RECOGNITION_RETRY_MESSAGE[\s\S]*\}/)
})

test('screenshot client surfaces quota state and upgrade placeholder', () => {
  assert.match(screenshotClient, /function QuotaBar/)
  assert.match(screenshotClient, /data-screenshot-quota-bar/)
  assert.match(screenshotClient, /function UpgradeSheet/)
  assert.match(screenshotClient, /本月识别次数已用完/)
  assert.match(screenshotClient, /data-screenshot-ocr-source/)
  assert.match(screenshotClient, /setUpgradeSheetOpen\(true\)/)
})

test('Tencent OCR adapter supports BasicOCR to AccurateOCR fallback', () => {
  assert.match(screenshotOcrAdapter, /GeneralBasicOCR/)
  assert.match(screenshotOcrAdapter, /GeneralAccurateOCR/)
  assert.match(screenshotOcrAdapter, /recognizeScreenshotWithFallback/)
  assert.match(screenshotOcrAdapter, /basic_empty_result/)
})

test('mimo text route uses primary adapter with Tencent fallback and no track-processing copy', () => {
  assert.match(screenshotRecognitionService, /recognizeScreenshotWithMimoV25Text/)
  assert.match(screenshotRecognitionService, /recognizeScreenshotWithFallback/)
  assert.match(screenshotMimoAdjudicator, /mimo_missing_required_distance/)
  assert.match(screenshotMimoAdapter, /MIMO_TEXT_TIMEOUT_MS = 32_000/)
  assert.match(screenshotMimoAdapter, /MIMO_API_KEY is not configured/)
  assert.match(screenshotMimoAdapter, /thinking: \{ type: 'disabled' \}/)
  assert.match(screenshotRecognitionService, /noTextDetected/)
  assert.match(screenshotRecognitionService, /tencent_accurate:no_text/)
  assert.match(screenshotClient, /provider: 'mimo_v25_primary'/)
  assert.doesNotMatch(screenshotClient, /轨迹路线识别中/)
})
