import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const screenshotClient = readFileSync('src/app/(flow)/screenshot/ScreenshotClient.tsx', 'utf8')
const importConfirmRoute = readFileSync('src/app/api/import/confirm/route.ts', 'utf8')
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
  assert.match(screenshotClient, /const durationSeconds = toggles\.duration/)
  assert.match(screenshotClient, /parseDurationParts\(fields\.durationHours, fields\.durationMinutes, fields\.durationSeconds\)/)
  assert.match(screenshotClient, /setSubmitError\('请先补全总距离。'\)/)
})

test('mountain search supports recognized mountain name candidates such as Taishan', () => {
  assert.match(mountainSearchRoute, /\.ilike\('name', `%\$\{query\}%`\)/)
  assert.match(mountainSearchRoute, /select\('id, name, altitude, province, latitude, longitude'\)/)
  assert.match(screenshotClient, /setSelectedMountainId\(options\[0\]\?\.id \?\? null\)/)
})
