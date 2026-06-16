import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260614120000_append_trek_points_rpc.sql', 'utf8')
const trekActions = readFileSync('src/app/api/trek/actions/route.ts', 'utf8')
const trekClient = readFileSync('src/app/(flow)/trek/TrekClient.tsx', 'utf8')
const trekOutbox = readFileSync('src/lib/trek-outbox.ts', 'utf8')

test('append_trek_points RPC uses auth.uid ownership with row lock and no trusted p_user_id', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.append_trek_points/)
  assert.doesNotMatch(migration, /p_user_id/i)
  assert.match(migration, /auth\.uid\(\) IS NULL/)
  assert.match(migration, /trek_sessions\.user_id = auth\.uid\(\)/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /SET search_path = ''/)
})

test('append_trek_points RPC pins caps, validation, deterministic order, and ack semantics', () => {
  assert.match(migration, /batch_count > 500/)
  assert.doesNotMatch(migration, /existing_count \+ batch_count >/)
  assert.match(migration, /array_length\(stored_points, 1\), 0\) > 30000/)
  assert.match(migration, /point_lat IS NULL/)
  assert.match(migration, /jsonb_typeof\(raw_point -> 'captureSeq'\) <> 'number'/)
  assert.match(migration, /rejected_ids := array_append\(rejected_ids, point_id\)/)
  assert.match(migration, /point_id := lower\(NULLIF\(BTRIM\(raw_point ->> 'id'\), ''\)\)/)
  assert.match(migration, /ORDER BY \(point ->> 'ts'\)::DOUBLE PRECISION,\s*COALESCE\(\(point ->> 'captureSeq'\)::DOUBLE PRECISION, 9007199254740991\), point ->> 'id'/)
  assert.match(migration, /accepted_ids := array_append\(accepted_ids, point_id\)/)
  assert.match(migration, /rejected_ids := array_append\(rejected_ids, point_id\)/)
})

test('append_trek_points RPC grants are explicit and hardened by DO assertion', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.append_trek_points\(UUID, JSONB\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.append_trek_points\(UUID, JSONB\) TO authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.append_trek_points\(UUID, JSONB\) TO service_role/)
  assert.match(migration, /append_trek_points must be SECURITY DEFINER/)
  assert.match(migration, /append_trek_points must set search_path/)
})

test('trek action route forwards append batches to RPC and requires ack before success', () => {
  assert.match(trekActions, /'append_trek_points'/)
  assert.match(trekActions, /points\.length > TREK_APPEND_BATCH_LIMIT/)
  assert.doesNotMatch(trekActions, /normalized\.some\(\(point\) => point === null\)/)
  assert.match(trekActions, /\.rpc\('append_trek_points',\s*\{[\s\S]*p_session_id:\s*sessionId,[\s\S]*p_points:\s*points/)
  assert.match(trekActions, /acceptedIds/)
  assert.match(trekActions, /rejectedIds/)
  assert.doesNotMatch(trekActions, /action === 'append_trek_point'[\s\S]{0,800}\.from\('trek_sessions'\)[\s\S]{0,800}\.update\(/)
})

test('client outbox writes before drain and clears only after finish or abort confirmation', () => {
  assert.match(trekClient, /putTrekOutboxPoint\(sid, point\)/)
  assert.match(trekClient, /drainQueueRef/)
  assert.match(trekClient, /for \(;;\) \{[\s\S]*listTrekOutboxPoints\(sid\)/)
  assert.match(trekClient, /classifyDrainState\(\{[\s\S]*hasPoints:\s*points\.length > 0/)
  const drainBlock = trekClient.match(/const runDrainToEmpty = async \(\): Promise<TrekOutboxDrainResult> => \{[\s\S]*?const previous = drainQueueRef/)?.[0] ?? ''
  assert.ok(drainBlock.indexOf('classifyDrainState') > -1, 'drain should use the pure early-return classifier')
  assert.ok(
    drainBlock.indexOf("if (drainState !== 'continue') return drainState") < drainBlock.indexOf("action: 'append_trek_points'"),
    'offline/degraded/empty state must be classified before appending batches'
  )
  assert.doesNotMatch(trekClient, /if \(drainInFlightRef\.current\) return drainInFlightRef\.current/)
  assert.match(trekClient, /action:\s*'append_trek_points'/)
  assert.match(trekClient, /markTrekOutboxPointsSynced\(sid, acceptedIds\)/)
  assert.match(trekClient, /markTrekOutboxPointsRejected\(sid, rejectedIds\)/)
  assert.match(trekClient, /status:\s*'terminal'/)
  assert.match(trekClient, /writeTrekFinishIntent\({[\s\S]*kind:\s*'finish_incomplete'/)
  assert.match(trekClient, /writeTrekFinishIntent\({[\s\S]*kind:\s*'verify_summit'/)
  assert.match(trekClient, /clearTrekOutboxSession\(activeSessionId\)/)
  assert.match(trekClient, /clearTrekOutboxSession\(sessionId\)/)
})

test('IndexedDB outbox schema is session-scoped and stores finish intents separately', () => {
  assert.match(trekOutbox, /const DB_NAME = 'peak_trekker_trek_v1'/)
  assert.match(trekOutbox, /const POINTS_STORE = 'points'/)
  assert.match(trekOutbox, /const FINISH_STORE = 'finishIntents'/)
  assert.match(trekOutbox, /store\.createIndex\('sessionId', 'sessionId'\)/)
  assert.match(trekOutbox, /state:\s*'pending' \| 'synced' \| 'rejected'/)
  assert.match(trekOutbox, /markTrekOutboxPoints\(sessionId, ids, 'synced'\)/)
  assert.match(trekOutbox, /markTrekOutboxPoints\(sessionId, ids, 'rejected'\)/)
  assert.match(trekOutbox, /pendingCount > 0 && !options\.allowPending/)
  assert.match(trekClient, /clearTrekOutboxSession\(activeSessionId, \{ allowPending: true \}\)/)
})

test('offline finalize fallbacks preserve finish intent and do not bounce or clear outbox', () => {
  const stopTrekBlock = trekClient.match(/async function stopTrek\(\) \{[\s\S]*?\n  async function handleGpsCheckin/)?.[0] ?? ''
  const finishFallback = stopTrekBlock.match(/action:\s*'finish_incomplete_trek'[\s\S]*?catch \(error\) \{([\s\S]*?)\n\s*\}\n\s*const checkinId/)?.[1] ?? ''
  assert.match(finishFallback, /if \(!isNetworkTrekActionError\(error\)\) throw error/)
  assert.match(finishFallback, /writeTrekFinishIntent\({[\s\S]*kind:\s*'finish_incomplete'/)
  assert.match(finishFallback, /已进入待同步状态，网络恢复后会先补传轨迹再保存活动。/)
  assert.doesNotMatch(finishFallback, /resetLiveTrekState\(/)
  assert.doesNotMatch(finishFallback, /clearTrekOutboxSession\(/)

  const gpsBlock = trekClient.match(/async function handleGpsCheckin\(photoUrl\?: string \| null\) \{[\s\S]*?\n  function handleApproachContinue/)?.[0] ?? ''
  const verifyFallback = gpsBlock.match(/action:\s*'verify_summit_checkin'[\s\S]*?catch \(error\) \{([\s\S]*?)\n\s*\}\n\s*const checkinId/)?.[1] ?? ''
  assert.match(verifyFallback, /if \(!isNetworkTrekActionError\(error\)\) throw error/)
  assert.match(verifyFallback, /writeTrekFinishIntent\({[\s\S]*kind:\s*'verify_summit'/)
  assert.match(verifyFallback, /已进入待同步状态，网络恢复后会先补传轨迹再确认登顶。/)
  assert.doesNotMatch(verifyFallback, /resetLiveTrekState\(/)
  assert.doesNotMatch(verifyFallback, /clearTrekOutboxSession\(/)
})

test('network errors use friendly copy and pending finish processing keeps intent for retry', () => {
  assert.match(trekClient, /function isNetworkTrekActionError\(error: unknown\)/)
  assert.match(trekClient, /normalized\.includes\('failed to fetch'\)/)
  assert.match(trekClient, /if \(isNetworkTrekActionError\(error\)\) return '网络不可用，请联网后重试。'/)
  assert.match(trekClient, /key:\s*'trek_session_create_failure'[\s\S]*网络不可用，请联网后再开始记录。/)

  const pendingBlock = trekClient.match(/const processPendingFinishIntent = useCallback\([\s\S]*?\n  const persistPauseTrekSession/)?.[0] ?? ''
  assert.match(pendingBlock, /if \(isNetworkTrekActionError\(error\)\) \{[\s\S]*网络不可用，待同步任务会在联网后继续。[\s\S]*return false/)
  const pendingNetworkFallback = pendingBlock.match(/if \(isNetworkTrekActionError\(error\)\) \{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
  assert.doesNotMatch(pendingNetworkFallback, /clearTrekOutboxSession\(/)
  assert.doesNotMatch(pendingNetworkFallback, /resetLiveTrekState\(/)
})
