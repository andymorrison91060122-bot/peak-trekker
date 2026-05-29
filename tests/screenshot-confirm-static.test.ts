import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const screenshotClient = readFileSync('src/app/(flow)/screenshot/ScreenshotClient.tsx', 'utf8')
const importConfirmRoute = readFileSync('src/app/api/import/confirm/route.ts', 'utf8')
const screenshotRecognizeRoute = readFileSync('src/app/api/screenshot/recognize/route.ts', 'utf8')
const screenshotQuotaHelper = readFileSync('src/lib/screenshot/quota.ts', 'utf8')
const screenshotOcrAdapter = readFileSync('src/lib/screenshot/tencent-ocr-adapter.ts', 'utf8')
const screenshotQuotaMigration = readFileSync('supabase/migrations/20260517061630_create_screenshot_quota.sql', 'utf8')
const mountainSearchRoute = readFileSync('src/app/api/mountains/search/route.ts', 'utf8')

test('screenshot confirm path writes through import confirm without requiring track points', () => {
  assert.match(importConfirmRoute, /source === 'screenshot_recognition'/)
  assert.match(importConfirmRoute, /handleScreenshotRecognitionConfirm/)
  assert.match(importConfirmRoute, /normalizeScreenshotData/)
  assert.match(importConfirmRoute, /source:\s*'screenshot_recognition'/)
  assert.match(importConfirmRoute, /track_points:\s*\[\]/)
  assert.match(importConfirmRoute, /insertCheckinWithFallback/)

  const screenshotBranchIndex = importConfirmRoute.indexOf("source === 'screenshot_recognition'")
  const trackNormalizeIndex = importConfirmRoute.indexOf('normalizeImportedTrackData(rawParsedData)')
  assert.ok(screenshotBranchIndex >= 0)
  assert.ok(trackNormalizeIndex >= 0)
  assert.ok(screenshotBranchIndex < trackNormalizeIndex)
})

test('screenshot client uses real preview, editable fields, mountain search, and activity redirect', () => {
  assert.doesNotMatch(screenshotClient, /MockScreenshotPreview/)
  assert.doesNotMatch(screenshotClient, /截图活动生成接口待接入/)
  assert.match(screenshotClient, /ScreenshotProcessingPreview/)
  assert.match(screenshotClient, /buildEditableFields/)
  assert.match(screenshotClient, /\{\s*key:\s*'pace',\s*label:\s*'配速'/)
  assert.match(screenshotClient, /paceMinPerKm/)
  assert.match(screenshotClient, /parsePaceInput\(fields\.pace\)/)
  assert.match(screenshotClient, /aria-label=\{config\.label\}/)
  assert.match(screenshotClient, /aria-label="时长小时"/)
  assert.match(screenshotClient, /aria-label="时长分钟"/)
  assert.match(screenshotClient, /aria-label="时长秒"/)
  assert.match(screenshotClient, /\/api\/mountains\/search\?q=/)
  assert.match(screenshotClient, /source:\s*'screenshot_recognition'/)
  assert.match(screenshotClient, /\/api\/import\/confirm/)
  assert.match(screenshotClient, /router\.push\(`\/activity\/\$\{payload\.checkinId\}`\)/)
})

test('screenshot confirm treats elevation and duration as optional sanitized fields', () => {
  assert.match(importConfirmRoute, /normalizeScreenshotData/)
  assert.doesNotMatch(importConfirmRoute, /typeof distanceMeters !== 'number' \|\| typeof maxElevation !== 'number'/)
  assert.match(importConfirmRoute, /max_elevation_meters:\s*parsedData\.maxElevation \?\? null/)
  assert.doesNotMatch(importConfirmRoute, /speedKmh/)
  assert.doesNotMatch(importConfirmRoute, /paceMinPerKm/)
  assert.match(screenshotClient, /const durationSeconds = toggles\.duration/)
  assert.match(screenshotClient, /parseDurationParts\(fields\.durationHours, fields\.durationMinutes, fields\.durationSeconds\)/)
  assert.match(screenshotClient, /setSubmitError\('请先补全总距离。'\)/)
})

test('mountain search supports recognized mountain name candidates such as Taishan', () => {
  assert.match(mountainSearchRoute, /\.ilike\('name', `%\$\{query\}%`\)/)
  assert.match(mountainSearchRoute, /select\('id, name, altitude, province, latitude, longitude'\)/)
  assert.match(screenshotClient, /setSelectedMountainId\(options\[0\]\?\.id \?\? null\)/)
})

test('screenshot recognition route enforces quota with service-role RPC only', () => {
  assert.match(screenshotRecognizeRoute, /export async function GET/)
  assert.match(screenshotRecognizeRoute, /getScreenshotQuotaState/)
  assert.match(screenshotRecognizeRoute, /consumeScreenshotQuota\(createSupabaseAdminClient\(\)/)
  assert.match(screenshotRecognizeRoute, /status:\s*402/)
  assert.match(screenshotRecognizeRoute, /screenshot_quota_exhausted/)
  assert.match(screenshotRecognizeRoute, /ocrSource/)
  assert.match(screenshotRecognizeRoute, /recognizeScreenshotWithFallback/)

  assert.match(screenshotQuotaMigration, /REVOKE ALL ON FUNCTION public\.consume_screenshot_quota\(UUID, TEXT, INTEGER, INTEGER\)\s+FROM PUBLIC, authenticated, anon;/)
  assert.match(screenshotQuotaMigration, /GRANT EXECUTE ON FUNCTION public\.consume_screenshot_quota\(UUID, TEXT, INTEGER, INTEGER\)\s+TO service_role;/)
  assert.doesNotMatch(screenshotQuotaMigration, /GRANT EXECUTE ON FUNCTION public\.consume_screenshot_quota\(UUID, TEXT, INTEGER, INTEGER\)\s+TO authenticated;/)
  assert.match(screenshotQuotaHelper, /\.rpc\('consume_screenshot_quota'/)
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
