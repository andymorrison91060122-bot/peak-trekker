import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const trekClient = readFileSync('src/app/(flow)/trek/TrekClient.tsx', 'utf8')
const trekActions = readFileSync('src/app/api/trek/actions/route.ts', 'utf8')
const trekPhotoUpload = readFileSync('src/app/api/trek/photo-upload/route.ts', 'utf8')
const trekRules = readFileSync('src/lib/trek-verification-rules.ts', 'utf8')
const profilePage = readFileSync('src/app/(main)/profile/page.tsx', 'utf8')

test('near summit continue CTA is wired to summit photo flow', () => {
  assert.match(trekClient, /status === 'summit_photo'/)
  assert.match(trekClient, /function handleApproachContinue\(\)/)
  assert.match(trekClient, /<SummitPhotoView/)
  assert.doesNotMatch(trekClient, /data-testid="trek-near-summit-cta"[\s\S]{0,180}onClick=\{\(\) => \{\}\}/)
})

test('trek start validates current GPS location against target mountain', () => {
  assert.match(trekClient, /checkTrekStartDistance/)
  assert.match(trekClient, /entryValidationStatus/)
  assert.match(trekClient, /isEntryValidationPending/)
  assert.match(trekClient, /const entryMountain = suggestedMountain/)
  assert.match(trekClient, /validateCurrentPositionForMountain\(entryMountain,\s*\{\s*fresh:\s*true\s*\}\)/)
  assert.match(trekClient, /window\.location\.replace\('\/explore'\)/)
  assert.match(trekClient, /window\.location\.replace\('\/explore'\)/)
  assert.match(trekClient, /validateCurrentPositionForMountain\(targetMountain,\s*\{\s*fresh:\s*true\s*\}\)/)
  assert.match(trekClient, /trek_start_too_far/)
})

test('trek mountain list loader retries transient network failures', () => {
  assert.match(trekClient, /async function loadActiveMountains\(\)/)
  assert.match(trekClient, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/)
  assert.match(trekClient, /window\.setTimeout\(resolve, 500 \* \(attempt \+ 1\)\)/)
})

test('entry validation GPS snapshot cannot drive tracking state before a session exists', () => {
  const gpsNearbyEffect = trekClient.match(/useEffect\(\(\) => \{[\s\S]*?checkNearby\(gps\.lat, gps\.lng\)[\s\S]*?\}, \[checkNearby, gps, sessionId, status, targetMountain\]\)/)?.[0] ?? ''
  assert.match(gpsNearbyEffect, /if \(!gps\) return/)
  assert.match(gpsNearbyEffect, /if \(!sessionId\) return/)
  assert.match(gpsNearbyEffect, /checkNearby\(gps\.lat, gps\.lng\)/)
})

test('entry validation blocked state owns a delayed hard explore redirect', () => {
  const blockedRedirectEffect = trekClient.match(/useEffect\(\(\) => \{[\s\S]*?entryValidationStatus !== 'blocked'[\s\S]*?window\.location\.replace\('\/explore'\)[\s\S]*?\}, \[entryValidationStatus\]\)/)?.[0] ?? ''
  assert.match(blockedRedirectEffect, /entryRedirectFallbackTimerRef\.current/)
  assert.match(blockedRedirectEffect, /window\.setTimeout\([\s\S]*1200/)
})

test('trek dev test mode persists only through non-production session storage', () => {
  assert.match(trekClient, /const queryTrekTestMode = useMemo/)
  assert.match(trekClient, /process\.env\.NODE_ENV === 'production'[\s\S]{0,120}setStoredTrekTestMode\(false\)/)
  assert.match(trekClient, /TREK_TEST_MODE_STORAGE_KEY/)
  assert.match(trekClient, /window\.sessionStorage\.setItem\(TREK_TEST_MODE_STORAGE_KEY, '1'\)/)
  assert.match(trekClient, /window\.sessionStorage\.getItem\(TREK_TEST_MODE_STORAGE_KEY\) === '1'/)
})

test('watchPosition errors preserve trek session state for paused save', () => {
  const watchErrorBlock = trekClient.match(/\(error\) => \{[\s\S]*?showToast\(\{ key: 'location_error', message \}\)/)?.[0] ?? ''
  assert.match(watchErrorBlock, /clearTrackingRuntime\(\)/)
  assert.match(watchErrorBlock, /setIsPaused\(true\)/)
  assert.match(watchErrorBlock, /elapsedBeforePauseRef\.current = elapsedSecondsRef\.current/)
  assert.doesNotMatch(watchErrorBlock, /resetLiveTrekState\(\)/)
  assert.doesNotMatch(watchErrorBlock, /finishSession\(nextSessionId/)
})

test('paused watchPosition callback does not mutate active tracking data', () => {
  assert.match(trekClient, /if \(isPausedRef\.current\) return/)
})

test('stale watchPosition callback cannot re-enter tracking after runtime cleanup', () => {
  assert.match(trekClient, /const activeSessionIdRef = useRef<string \| null>\(null\)/)
  assert.match(trekClient, /const clearTrackingRuntime = useCallback\(\(\) => \{[\s\S]{0,80}activeSessionIdRef\.current = null/)
  assert.match(trekClient, /activeSessionIdRef\.current = nextSessionId/)
  const watchSuccessBlock =
    trekClient.match(/watchIdRef\.current = navigator\.geolocation\.watchPosition\([\s\S]*?checkNearby\(latitude, longitude\)/)?.[0] ?? ''
  assert.match(watchSuccessBlock, /if \(isPausedRef\.current\) return/)
  assert.match(watchSuccessBlock, /activeSessionIdRef\.current !== nextSessionId/)
  assert.match(watchSuccessBlock, /watchIdRef\.current === null/)
  assert.match(watchSuccessBlock, /setStatus\('tracking'\)/)
})

test('active session prevents clearing confirmed mountain id', () => {
  assert.match(trekClient, /isTrackingRuntimeActive\(status\)[\s\S]{0,180}sessionId[\s\S]{0,180}setConfirmedMountainId\(null\)/)
  assert.match(trekClient, /targetMountainId && confirmedMountainId === targetMountainId/)
})

test('incomplete trek save uses pending status and completion_status marker', () => {
  assert.match(trekActions, /'finish_incomplete_trek'/)
  assert.match(trekActions, /MIN_INCOMPLETE_TREK_SECONDS\s*=\s*60/)
  assert.match(trekClient, /incompleteRecordMinSeconds/)
  assert.match(trekClient, /formatShortRecordThreshold\(incompleteRecordMinSeconds\)/)
  assert.match(trekActions, /status:\s*'pending'/)
  assert.match(trekActions, /completion_status:\s*'incomplete'/)
  assert.match(trekClient, /action:\s*'finish_incomplete_trek'[\s\S]{0,320}testMode:\s*trekTestMode/)
})

test('trek GPS failure UI no longer offers temporary skip GPS entry', () => {
  assert.doesNotMatch(trekClient, /暂时跳过 GPS/)
  assert.doesNotMatch(trekClient, /handleSkipGps/)
  assert.doesNotMatch(trekClient, /onSkipGps/)
  assert.doesNotMatch(trekClient, /onManualEntry/)
})

test('summit photo empty state centers icon and copy vertically', () => {
  const summitPhotoView = trekClient.match(/function SummitPhotoView\([\s\S]*?<BottomActionBar>/)?.[0] ?? ''
  assert.match(summitPhotoView, /data-testid="trek-summit-photo-empty-state"/)
  assert.match(summitPhotoView, /display:\s*'flex'/)
  assert.match(summitPhotoView, /flexDirection:\s*'column'/)
  assert.match(summitPhotoView, /alignItems:\s*'center'/)
  assert.match(summitPhotoView, /justifyContent:\s*'center'/)
})

test('summit confirmed page uses share primary and activity secondary CTAs only', () => {
  const summitConfirmedView = trekClient.match(/function SummitConfirmedView\([\s\S]*?function SummitRidgeDivider/)?.[0] ?? ''
  assert.match(summitConfirmedView, /data-testid="trek-summit-primary-cta"[\s\S]{0,320}生成分享/)
  assert.match(summitConfirmedView, /data-testid="trek-summit-activity-cta"/)
  assert.match(summitConfirmedView, /查看登山档案/)
  assert.match(summitConfirmedView, /gridTemplateColumns:\s*'repeat\(3, minmax\(0, 1fr\)\)'/)
  assert.doesNotMatch(summitConfirmedView, /留下峰顶记录/)
  assert.doesNotMatch(summitConfirmedView, /保存这次登顶/)
  assert.doesNotMatch(summitConfirmedView, /稍后整理/)
})

test('summit confirmed CTA routes to share by checkinId and activity detail', () => {
  assert.match(trekClient, /router\.push\(`\/share\?checkinId=\$\{encodeURIComponent\(createdCheckinId\)\}`\)/)
  assert.match(trekClient, /router\.push\(`\/activity\/\$\{createdCheckinId\}`\)/)
})

test('trek photo upload route and client normalize thrown fetch failures', () => {
  assert.match(trekPhotoUpload, /try \{[\s\S]*uploadSupabase\.storage\.from\(CHECKIN_PHOTOS_BUCKET\)\.upload/)
  assert.match(trekPhotoUpload, /catch \(error\) \{[\s\S]*normalizeStorageUploadError/)
  assert.match(trekPhotoUpload, /isTrekServerDevBypassAllowed/)
  assert.match(trekPhotoUpload, /createSupabaseAdminClient/)
  assert.match(trekClient, /formData\.set\('sessionId', options\.sessionId\)/)
  assert.match(trekClient, /formData\.set\('testMode', '1'\)/)
  assert.match(trekPhotoUpload, /照片上传失败，请稍后重试。/)
  assert.match(trekClient, /async function uploadTrekPhoto\(file: File, options/)
  assert.match(trekClient, /catch \{[\s\S]*throw new Error\('照片上传失败，请稍后重试。'\)/)
  assert.doesNotMatch(trekClient, /TypeError: fetch failed/)
})

test('profile summary excludes incomplete completion_status records', () => {
  assert.match(profilePage, /trip\.status === 'approved' && \(trip\.completionStatus \?\? 'complete'\) === 'complete'/)
})

test('summit verification can persist uploaded summit photo url', () => {
  assert.match(trekActions, /const photoUrl = toSafePhotoUrl\(body\?\.photoUrl\)/)
  assert.match(trekActions, /function persistSummitPhotoUrl/)
  assert.match(trekActions, /createSupabaseAdminClient\(\)[\s\S]*\.from\('checkins'\)[\s\S]*\.update\(update\)[\s\S]*\.eq\('id', checkinId\)[\s\S]*\.eq\('user_id', userId\)[\s\S]*\.select\('id'\)[\s\S]*\.single\(\)/)
  assert.match(trekActions, /photo_persistence_failed/)
  assert.match(trekClient, /action:\s*'verify_summit_checkin'[\s\S]{0,260}testMode:\s*trekTestMode/)
})

test('summit confirmed state keeps success toast visible', () => {
  const fullScreenToastClearEffect = trekClient.match(/const fullScreenStates: TrekViewState\[] = \[[^\]]+\]/)?.[0] ?? ''
  assert.doesNotMatch(fullScreenToastClearEffect, /summitConfirmed/)
  assert.match(trekClient, /showToast\(\{ key: 'summit_verify_success', durationMs: 5200 \}\)/)
})

test('summit and incomplete server actions use dev rules only behind non-production guard', () => {
  assert.match(trekActions, /resolveTrekServerVerificationRules/)
  assert.match(trekActions, /requestedTestMode:\s*isRequestedTrekTestMode\(body\?\.testMode\)/)
  assert.match(trekActions, /verificationRules\.minTrackPoints/)
  assert.match(trekActions, /verificationRules\.minSessionSeconds/)
  assert.match(trekRules, /nodeEnv === 'production'/)
  assert.match(trekRules, /ALLOW_TREK_DEV_BYPASS/)
  assert.match(trekRules, /isLocalSession/)
  assert.match(trekRules, /STRICT_TREK_MIN_TRACK_POINTS = 8/)
  assert.match(trekRules, /STRICT_TREK_MIN_SESSION_SECONDS = 90/)
})

test('current altitude uses GPS or elevation API without mountain altitude fallback', () => {
  assert.match(trekClient, /fetchOpenMeteoElevation/)
  assert.match(trekClient, /const currentAltitude = hasGpsAltitude \? Math\.round\(gps\.altitude as number\) : queriedElevationM/)
  assert.match(trekClient, /海拔采集中/)
  assert.match(trekClient, /<ElevationHero[\s\S]{0,220}value=\{currentAltitude\}/)
  assert.doesNotMatch(trekClient, /GPS 海拔暂不可用 · 当前显示目标山峰标称海拔/)
  assert.doesNotMatch(trekClient, /const currentAltitude =[\s\S]{0,120}mountain\.altitude/)
})
