import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const trekClient = readFileSync('src/app/(flow)/trek/TrekClient.tsx', 'utf8')
const trekActions = readFileSync('src/app/api/trek/actions/route.ts', 'utf8')
const trekPhotoUpload = readFileSync('src/app/api/trek/photo-upload/route.ts', 'utf8')
const trekRules = readFileSync('src/lib/trek-verification-rules.ts', 'utf8')
const profilePage = readFileSync('src/app/(main)/profile/page.tsx', 'utf8')
const profileClient = readFileSync('src/components/profile/ProfileV2Client.tsx', 'utf8')
const trekPauseMigration = readFileSync('supabase/migrations/20260517124359_trek_session_pause_state.sql', 'utf8')

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
  assert.match(gpsNearbyEffect, /status !== 'locating' && status !== 'tracking'/)
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
  assert.match(trekClient, /activeSessionIdRef\.current = runtimeSessionId/)
  const watchSuccessBlock =
    trekClient.match(/watchIdRef\.current = navigator\.geolocation\.watchPosition\([\s\S]*?checkNearby\(latitude, longitude\)/)?.[0] ?? ''
  assert.match(watchSuccessBlock, /if \(isPausedRef\.current\) return/)
  assert.match(watchSuccessBlock, /activeSessionIdRef\.current !== runtimeSessionId/)
  assert.match(watchSuccessBlock, /watchIdRef\.current === null/)
  assert.match(watchSuccessBlock, /setStatus\('tracking'\)/)
})

test('active session prevents clearing confirmed mountain id', () => {
  assert.match(trekClient, /isTrackingRuntimeActive\(status\)[\s\S]{0,180}sessionId[\s\S]{0,180}setConfirmedMountainId\(null\)/)
  assert.match(trekClient, /targetMountainId && confirmedMountainId === targetMountainId/)
})

test('incomplete trek save uses completion_status marker without checkin status', () => {
  assert.match(trekActions, /'finish_incomplete_trek'/)
  assert.match(trekActions, /MIN_INCOMPLETE_TREK_SECONDS\s*=\s*60/)
  assert.match(trekClient, /incompleteRecordMinSeconds/)
  assert.match(trekClient, /formatShortRecordThreshold\(incompleteRecordMinSeconds\)/)
  assert.doesNotMatch(trekActions, /status:\s*'pending'/)
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

test('summit confirmation uses 300m range and summit photo is optional', () => {
  assert.match(trekClient, /MIN_SUMMIT_CONFIRM_RADIUS_M\s*=\s*300/)
  assert.match(trekClient, /Math\.max\([^)]*summit_radius_m[\s\S]{0,120}MIN_SUMMIT_CONFIRM_RADIUS_M/)
  assert.doesNotMatch(trekClient, /SUMMIT_READY_RADIUS_M\s*=\s*100/)
  assert.doesNotMatch(trekClient, /进入 100m 登顶确认范围/)

  const summitSubmit = trekClient.match(/async function handleSummitPhotoSubmit\(\)[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.doesNotMatch(summitSubmit, /请先选择一张登顶照片/)
  assert.match(summitSubmit, /: null[\s\S]{0,120}handleGpsCheckin\(photoUrl\)/)
  assert.match(trekClient, /照片.*可选/)
  assert.match(trekClient, /GPS.*到达.*范围.*视为登顶/)
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
  assert.match(profilePage, /\(trip\.completionStatus \?\? 'complete'\) === 'complete'/)
  assert.doesNotMatch(profilePage, /trip\.status === 'approved'/)
})

test('profile archive cards open the new share editor without deleting legacy poster generation', () => {
  assert.match(profileClient, /data-testid="profile-trip-share-link"/)
  assert.match(profileClient, /href=\{`\/share\?checkinId=\$\{encodeURIComponent\(trip\.checkinId\)\}`\}/)
  assert.doesNotMatch(profileClient, /\/api\/poster\?checkinId=/)
  assert.match(trekActions, /if \(action === 'generate_share_card'\)/)
  assert.match(trekActions, /\/api\/poster\?checkinId=\$\{encodeURIComponent\(checkin\.id\)\}/)
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

test('trek restore action uses 24h freshness gate and returns stale reason without mutation', () => {
  assert.match(trekActions, /'get_in_progress_trek_session'/)
  assert.match(trekActions, /TREK_RESTORE_WINDOW_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
  assert.match(trekActions, /\.from\('trek_sessions'\)[\s\S]{0,300}\.in\('status', \['tracking', 'paused'\]\)/)
  assert.match(trekActions, /const freshnessAnchorMs = isPausedSession \? pausedAtMs : startedAtMs/)
  assert.match(trekActions, /ignoredReason:\s*'stale'/)
  assert.match(trekActions, /ignoredReason:\s*'invalid_paused_at'/)
  assert.match(trekActions, /session:\s*null/)
})

test('trek restore pauses entry validation only while checking and rehydrates tracking or paused runtime', () => {
  assert.match(trekClient, /type TrekRestoreStatus = 'idle' \| 'checking' \| 'restored' \| 'none'/)
  assert.match(trekClient, /const \[restoreStatus, setRestoreStatus\]/)
  assert.match(trekClient, /restoreCheckStartedRef/)
  assert.match(trekClient, /TREK_RESTORE_REQUEST_TIMEOUT_MS\s*=\s*3500/)
  assert.match(trekClient, /restoreStatus === 'idle' \|\| restoreStatus === 'checking'[\s\S]{0,120}!sessionId[\s\S]{0,120}return/)
  assert.match(trekClient, /if \(sessionId\) return/)
  assert.match(trekClient, /const isEntryValidationPending =\s*!sessionId/)
  assert.match(trekClient, /function restoreActiveTrekSession/)
  assert.match(trekClient, /restoredSession\.status === 'paused'/)
  assert.match(trekClient, /setIsPaused\(restoredSession\.status === 'paused'\)/)
  assert.match(trekClient, /trackingTickStartedAtRef\.current = restoredSession\.status === 'paused' \? null : Date\.now\(\)/)
  assert.match(trekClient, /if \(restoredSession\.status === 'tracking'\) \{[\s\S]{0,120}startTrackingRuntime\(restoredSession\.sessionId\)/)
  assert.match(trekClient, /已恢复暂停中的记录/)
  assert.match(trekClient, /Math\.floor\(restoredSession\.pausedElapsedSeconds\)/)
})

test('trek elapsed timer is independent from GPS runtime cleanup', () => {
  const clearTrackingRuntimeBlock =
    trekClient.match(/const clearTrackingRuntime = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\)/)?.[0] ?? ''
  assert.match(trekClient, /const elapsedTimerRef = useRef/)
  assert.doesNotMatch(clearTrackingRuntimeBlock, /elapsedTimerRef/)
  assert.match(trekClient, /elapsedTimerRef\.current = setInterval\(tick, 1000\)/)
  assert.match(trekClient, /clearInterval\(elapsedTimerRef\.current\)/)
})

test('trek elapsed displays use unambiguous H:MM:SS formatting', () => {
  assert.match(trekClient, /formatElapsedHMS\(elapsedSeconds\)/)
  assert.doesNotMatch(trekClient, /formatElapsedCompact/)
  assert.doesNotMatch(trekClient, /formatElapsedForNearSummit/)
})

test('trek top bar exposes manual GPS refresh with spam guard and hanging GPS fallback', () => {
  assert.match(trekClient, /RefreshIcon/)
  assert.match(trekClient, /ariaLabel="刷新数据"/)
  assert.match(trekClient, /manualGpsRefreshLastAtRef/)
  assert.match(trekClient, /MANUAL_REFRESH_COOLDOWN_MS\s*=\s*5000/)
  assert.match(trekClient, /MANUAL_REFRESH_TIMEOUT_MS\s*=\s*2500/)
  assert.match(trekClient, /MANUAL_REFRESH_SNAPSHOT_FALLBACK_ACCURACY_M\s*=\s*100/)
  assert.match(
    trekClient,
    /if \(now - manualGpsRefreshLastAtRef\.current < MANUAL_REFRESH_COOLDOWN_MS\)[\s\S]{0,260}if \(manualRefreshLoading\) return/
  )
  assert.match(trekClient, /requestCurrentGpsPosition\(\)/)
  assert.match(trekClient, /Promise\.race\(\[[\s\S]{0,500}MANUAL_REFRESH_TIMEOUT_MS/)
  assert.match(trekClient, /使用最近一次定位/)
  assert.match(trekClient, /定位暂时无响应，请稍后再试。/)
  assert.match(trekClient, /checkNearby\(nextGps\.lat, nextGps\.lng\)/)
})

test('trek session pause migration persists paused audit fields and allows paused status', () => {
  assert.match(trekPauseMigration, /ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ/)
  assert.match(trekPauseMigration, /ADD COLUMN IF NOT EXISTS paused_elapsed_seconds INTEGER/)
  assert.match(trekPauseMigration, /'paused'::text/)
  assert.match(trekPauseMigration, /trek_sessions_paused_elapsed_seconds_check/)
  assert.match(trekPauseMigration, /paused_elapsed_seconds IS NULL OR paused_elapsed_seconds >= 0/)
})

test('trek pause and resume actions are server-persistent and idempotent', () => {
  assert.match(trekActions, /'pause_trek_session'/)
  assert.match(trekActions, /'resume_trek_session'/)
  assert.match(trekActions, /MAX_TREK_PAUSE_ELAPSED_SECONDS/)
  assert.match(trekActions, /function clampTrekPauseElapsedSeconds/)
  assert.match(trekActions, /if \(session\.status === 'paused'\)[\s\S]{0,260}ignored:\s*true/)
  assert.match(trekActions, /status:\s*'paused'/)
  assert.match(trekActions, /paused_at:\s*pausedAt/)
  assert.match(trekActions, /paused_elapsed_seconds:\s*pausedElapsedSeconds/)
  assert.match(trekActions, /if \(session\.status === 'tracking'\)[\s\S]{0,260}ignored:\s*true/)
  assert.match(trekActions, /started_at:\s*nextStartedAt/)
  assert.match(trekActions, /paused_at:\s*null/)
  assert.match(trekActions, /paused_elapsed_seconds:\s*null/)
})

test('trek exit path auto-pauses before navigation and browser back is intercepted once', () => {
  assert.match(trekClient, /function isAutoPauseEligibleStatus\(status: TrekStatus\)/)
  assert.match(trekClient, /const persistPauseTrekSession = useCallback/)
  assert.match(trekClient, /action:\s*'pause_trek_session'/)
  assert.match(trekClient, /elapsedSeconds:\s*elapsedSecondsRef\.current/)
  assert.match(trekClient, /const pauseAndNavigateAway = useCallback/)
  assert.match(trekClient, /window\.history\.pushState\(\{ peakTrekkerPauseGuard: true \}/)
  assert.match(trekClient, /window\.addEventListener\('popstate', handlePopState\)/)
  assert.match(trekClient, /popstatePauseGuardRef\.current = false/)
  assert.match(trekClient, /function handleBack\(\)[\s\S]{0,120}pauseAndNavigateAway\(false\)/)
})

test('trek incomplete finish is idempotent across duplicate submits', () => {
  assert.match(trekActions, /function isCheckinSessionUniqueViolation\(error: unknown\)/)
  assert.match(trekActions, /record\.code === '23505'/)
  assert.match(trekActions, /idx_checkins_session_id_unique_not_null/)
  assert.match(trekActions, /const findExistingCheckinForSession = async \(\)/)
  assert.match(trekActions, /const buildAlreadyFinishedResponse = async/)
  assert.match(trekActions, /alreadyFinished:\s*true/)
  assert.match(trekActions, /isCheckinSessionUniqueViolation\(createError\)/)
})

test('trek incomplete finish button has in-flight guard and loading state', () => {
  assert.match(trekClient, /const \[finishTrekLoading, setFinishTrekLoading\] = useState\(false\)/)
  assert.match(trekClient, /const finishInFlightRef = useRef\(false\)/)
  assert.match(trekClient, /if \(finishInFlightRef\.current\) return/)
  assert.match(trekClient, /finishInFlightRef\.current = true/)
  assert.match(trekClient, /finally \{[\s\S]{0,120}finishInFlightRef\.current = false/)
  assert.match(trekClient, /loading=\{finishTrekLoading\}/)
  assert.match(trekClient, /disabled=\{finishTrekLoading\}/)
})

test('trek resume button persists server resume before restarting GPS runtime', () => {
  assert.match(trekClient, /async function resumeTrek\(\)/)
  assert.match(trekClient, /action:\s*'resume_trek_session'/)
  assert.match(trekClient, /startTimeRef\.current = resumedStartedAt/)
  assert.match(trekClient, /isPausedRef\.current = false/)
  assert.match(trekClient, /startTrackingRuntime\(sessionId\)/)
  assert.match(trekClient, /trek_resume_failed/)
})

test('near summit CTA switches to summit-ready copy at the 300m confirm radius', () => {
  assert.match(trekClient, /MIN_SUMMIT_CONFIRM_RADIUS_M\s*=\s*300/)
  assert.match(trekClient, /const isSummitReadyZone =[\s\S]{0,120}distanceToTarget <= summitConfirmRadiusM/)
  assert.match(trekClient, /ctaLabel=\{isSummitReadyZone \? '我已登顶' : '继续靠近峰顶'\}/)
  assert.match(trekClient, /canContinue=\{canConfirmSummit\}/)
  assert.match(trekClient, /distanceToTarget !== null && distanceToTarget <= summitConfirmRadiusM/)
})

test('server summit verification uses 300m hard fallback and closest-point distance details', () => {
  assert.match(trekActions, /SERVER_SUMMIT_VERIFY_RADIUS_M\s*=\s*300/)
  assert.match(trekActions, /const maxVerifyDistance = Math\.max\(summitRadius, SERVER_SUMMIT_VERIFY_RADIUS_M\)/)
  assert.match(trekActions, /resolveSummitEvidencePoint/)
  assert.match(trekActions, /!evidence\.insideVerifyRadius/)
  assert.match(trekActions, /distanceMeters:\s*Math\.round\(evidence\.distanceM\)/)
  assert.match(trekActions, /maxMeters:\s*maxVerifyDistance/)
})
