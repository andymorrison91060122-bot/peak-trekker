import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationPath = fs.readdirSync(path.join(repoRoot, 'supabase/migrations'))
  .filter((name) => /quota_001|screenshot_finalize/.test(name))
  .map((name) => path.join(repoRoot, 'supabase/migrations', name))
  .sort()
  .at(-1)

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8')
}

const screenshotClientSource = read('src/app/(flow)/screenshot/ScreenshotClient.tsx')

test('QUOTA-001 keeps request idempotency and atomic finalize without product-level leases', () => {
  assert.ok(migrationPath, 'a QUOTA-001 forward migration must exist')
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const screenshotClient = read('src/app/(flow)/screenshot/ScreenshotClient.tsx')
  const confirmRoute = read('src/app/api/import/confirm/route.ts')
  const quota = read('src/lib/screenshot/quota.ts')
  const recognizeRoute = read('src/app/api/screenshot/recognize/route.ts')
  const mimoAdapter = read('src/lib/screenshot/mimo-v25-adapter.ts')
  const recovery = read('src/lib/screenshot/recognition-recovery.ts')

  assert.match(migration, /status IN \('reserved', 'recognized', 'consumed', 'refunded', 'expired'\)/)
  assert.doesNotMatch(migration, /lease_expires_at|get_screenshot_active_lease_count|resume_screenshot_recognition_lease/)
  assert.match(migration, /checkin_id UUID/)
  assert.match(migration, /CREATE (?:OR REPLACE )?FUNCTION public\.finalize_screenshot_recognition\(/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.finalize_screenshot_recognition\([^)]*\)\s+TO service_role/s)
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /recognition_result_bytes.*65536|65536.*recognition_result_bytes/s)
  assert.doesNotMatch(migration, /DROP TABLE public\.screenshot_quota_attempts/)
  assert.match(migration, /status IN \('reserved', 'recognized', 'consumed', 'refunded', 'expired'\)/)
  assert.match(migration, /SET status = 'expired'[\s\S]*recognition_result = NULL/)
  assert.match(migration, /a\.request_id <> p_request_id/)
  assert.doesNotMatch(migration, /reason := 'lease_required'/)

  assert.match(quota, /reserveScreenshotRecognitionLease/)
  assert.match(quota, /completeScreenshotRecognitionAttempt/)
  assert.match(quota, /finalizeScreenshotRecognition/)
  assert.doesNotMatch(quota, /active_lease|resumeScreenshotRecognitionLease|getScreenshotActiveLeaseCount|withScreenshotQuotaStartability/)
  assert.match(recognizeRoute, /reserveScreenshotRecognitionLease/)
  assert.match(recognizeRoute, /completeScreenshotRecognitionAttempt/)
  assert.doesNotMatch(recognizeRoute, /reserveScreenshotQuota\(/)

  assert.match(confirmRoute, /finalizeScreenshotRecognition/)
  assert.match(confirmRoute, /requestId/)
  assert.match(screenshotClient, /requestId/)
  assert.doesNotMatch(screenshotClient, /sessionStorage|method: 'PUT'|已有识别任务正在进行|\.canStart/)
  assert.match(mimoAdapter, /MIMO_TEXT_TIMEOUT_MS = 90_000/)
  assert.match(recognizeRoute, /maxDuration = 120/)
  assert.match(recovery, /SCREENSHOT_RECOGNITION_RECOVERY_DEADLINE_MS = 115_000/)
  assert.doesNotMatch(recovery, /recognizeScreenshot(?:WithMimoV25Text|Text)/)
})

test('QUOTA-001 finalize payload preserves every screenshot confirm field and defaults', () => {
  assert.ok(migrationPath, 'a QUOTA-001 forward migration must exist')
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const confirmRoute = read('src/app/api/import/confirm/route.ts')
  const expectedKeys = [
    'user_id', 'mountain_id', 'type', 'source', 'completion_status', 'latitude', 'longitude',
    'note', 'verified_at', 'verification_distance_m', 'ranking_weight', 'distance_meters',
    'duration_seconds', 'elevation_gain_meters', 'elevation_loss_meters', 'max_elevation_meters',
    'min_elevation_meters', 'start_time', 'end_time', 'track_name', 'track_points',
    'screenshot_route_shape',
  ]
  for (const key of expectedKeys) {
    assert.match(confirmRoute, new RegExp(key.replaceAll('_', '_')))
    assert.match(migration, new RegExp(key.replaceAll('_', '_')))
  }
  assert.match(confirmRoute, /type:\s*'gps'/)
  assert.match(confirmRoute, /source:\s*SCREENSHOT_RECOGNITION_SOURCE/)
  assert.match(confirmRoute, /completion_status:\s*'complete'/)
  assert.match(confirmRoute, /ranking_weight:\s*0/)
  assert.match(confirmRoute, /track_points:\s*\[\]/)
  assert.match(confirmRoute, /track_name:\s*parsedData\.name \?\? parsedData\.location \?\? parsedData\.fileName \?\? '截图识别活动'/)
})

test('QUOTA-001 leaves ordinary track import on its existing checkin insertion path', () => {
  const confirmRoute = read('src/app/api/import/confirm/route.ts')
  assert.match(confirmRoute, /const trackContentHash = computeTrackContentHash/)
  assert.match(confirmRoute, /normalizeImportedTrackData/)
  assert.match(confirmRoute, /\.from\('checkins'\)\s*\.insert\(/)
})

test('quota start eligibility depends only on real remaining usage', async () => {
  const { computeScreenshotQuotaState } = await import('../src/lib/screenshot/quota.ts')
  const input = {
    rows: [
      { month_key: '2026-07', free_used: 2, paid_used: 0 },
      { month_key: '2026-08', free_used: 1, paid_used: 0 },
    ],
    profile: { subscription_tier: 'free' },
    monthKey: '2026-08',
  }

  const available = computeScreenshotQuotaState(input)
  const exhausted = computeScreenshotQuotaState({
    ...input,
    rows: [
      { month_key: '2026-07', free_used: 2, paid_used: 0 },
      { month_key: '2026-08', free_used: 2, paid_used: 0 },
    ],
  })

  assert.equal(available.remaining, 1)
  assert.equal(exhausted.remaining, 0)
  assert.equal('canStart' in available, false)
  assert.equal('canStart' in exhausted, false)
})

test('screenshot upload gate blocks only exhausted quota', () => {
  assert.match(screenshotClientSource, /if \(quotaState && quotaState\.remaining <= 0\) \{/)
  assert.doesNotMatch(screenshotClientSource, /canStart|已有识别任务正在进行，请稍后再试。/)
  assert.doesNotMatch(screenshotClientSource, /SCREENSHOT_RECOGNITION_REQUEST_STORAGE_KEY|sessionStorage|method: 'PUT'/)
})

test('an exhausted reservation rejects before provider work begins', async () => {
  const { recognizeWithReservedScreenshotQuota } = await import('../src/lib/screenshot/recognition-quota.ts')
  let providerCalls = 0
  const quota = {
    monthKey: '2026-08',
    isFirstMonth: false,
    subscriptionTier: 'free',
    freeLimit: 2,
    freeUsed: 2,
    paidLimit: 0,
    paidUsed: 0,
    freeRemaining: 0,
    paidRemaining: 0,
    remaining: 0,
    totalLimit: 2,
  }

  const result = await recognizeWithReservedScreenshotQuota({
    imageBase64: 'base64',
    mimeType: 'image/png',
    userId: 'user-a',
    quota,
    requestId: '65ed6ea4-79bf-4f2f-9dbb-055c71df9ad6',
    adminClient: {},
    reserve: async (_client, _userId, nextQuota, requestId) => ({
      success: false,
      requestId,
      reason: 'exhausted',
      quota: nextQuota,
    }),
    recognize: async () => {
      providerCalls += 1
      throw new Error('provider must not run when quota is exhausted')
    },
  })

  assert.equal(result.reserveResult.success, false)
  assert.equal(providerCalls, 0)
})

test('provider failure releases the lease without changing quota usage or calling OCR twice', async () => {
  const {
    ScreenshotRecognitionAttemptError,
    recognizeWithReservedScreenshotQuota,
  } = await import('../src/lib/screenshot/recognition-quota.ts')
  const quota = {
    monthKey: '2026-08',
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
  }
  let recognitionCalls = 0
  let releaseCalls = 0
  let finalizeCalls = 0

  await assert.rejects(
    recognizeWithReservedScreenshotQuota({
      imageBase64: 'base64',
      mimeType: 'image/png',
      userId: 'user-a',
      quota,
      requestId: '5e37e1aa-8d92-4a7f-b78c-52b4cb8b0c3e',
      adminClient: {},
      reserve: async (_client, _userId, nextQuota, requestId) => ({
        success: true,
        requestId,
        bucket: 'free',
        quota: nextQuota,
      }),
      recognize: async () => {
        recognitionCalls += 1
        throw new TypeError('provider transport failed')
      },
      finalize: async () => {
        finalizeCalls += 1
        throw new Error('finalize must not run')
      },
      release: async (_client, _userId, requestId) => {
        releaseCalls += 1
        return { success: true, requestId }
      },
    }),
    (error) => error instanceof ScreenshotRecognitionAttemptError && error.quotaRefunded,
  )

  assert.equal(recognitionCalls, 1)
  assert.equal(releaseCalls, 1)
  assert.equal(finalizeCalls, 0)
  assert.equal(quota.freeUsed, 0)
  assert.equal(quota.remaining, 2)
})

test('a new request atomically expires older unfinished attempts before it starts', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const reserveStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.reserve_screenshot_recognition_lease(')
  const completeStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.complete_screenshot_recognition_attempt(')
  const reserve = migration.slice(reserveStart, completeStart)
  const quotaLock = reserve.indexOf('SELECT q.*\n  INTO locked_row')
  const cleanupStart = reserve.indexOf('-- Expired recognition payloads are cleanup-only.')
  const sameRequestLookup = reserve.indexOf('SELECT a.*\n  INTO existing_attempt')
  const quotaCheck = reserve.indexOf('locked_row.free_used >= p_free_limit')
  const expireOld = reserve.indexOf("SET status = 'expired'")
  const insertNew = reserve.indexOf('INSERT INTO public.screenshot_quota_attempts')

  assert.ok(quotaLock >= 0)
  assert.ok(cleanupStart > quotaLock)
  assert.ok(sameRequestLookup > cleanupStart)
  const cleanup = reserve.slice(cleanupStart, sameRequestLookup)
  assert.match(cleanup, /SET recognition_result = NULL,[\s\S]*recognition_result_bytes = NULL,[\s\S]*result_expires_at = NULL/)
  assert.match(cleanup, /a\.result_expires_at IS NOT NULL[\s\S]*a\.result_expires_at <= now\(\)/)
  assert.doesNotMatch(cleanup, /SET status/)
  assert.ok(quotaCheck >= 0)
  assert.ok(expireOld > quotaCheck)
  assert.ok(insertNew > expireOld)
  assert.match(reserve, /a\.request_id <> p_request_id/)
  assert.match(reserve, /a\.status IN \('reserved', 'recognized'\)/)
  assert.doesNotMatch(reserve, /active_lease/)
})

test('finalize migration increments quota before atomic checkin/attempt completion and keeps retry idempotent', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8')
  const finalizeStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.finalize_screenshot_recognition(')
  assert.ok(finalizeStart >= 0)
  const finalize = migration.slice(finalizeStart)
  const quotaLock = finalize.indexOf('SELECT q.*\n  INTO locked_row')
  const attemptLock = finalize.indexOf('SELECT a.*\n  INTO attempt_row')
  assert.ok(quotaLock >= 0)
  assert.ok(attemptLock > quotaLock)
  const usageUpdate = finalize.indexOf('SET free_used = q.free_used + 1')
  const expiredAttempt = finalize.indexOf("IF attempt_row.status = 'expired'")
  const checkinInsert = finalize.indexOf('INSERT INTO public.checkins')
  const attemptConsumed = finalize.indexOf("SET status = 'consumed'")
  assert.ok(usageUpdate >= 0)
  assert.ok(expiredAttempt >= 0)
  assert.ok(expiredAttempt < usageUpdate)
  assert.ok(checkinInsert > usageUpdate)
  assert.ok(attemptConsumed > checkinInsert)
  assert.match(finalize, /IF attempt_row\.status = 'consumed'/)
  assert.match(finalize, /reason := 'already_finalized'/)
  assert.match(finalize, /checkin_id := attempt_row\.checkin_id/)
})
