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
  assert.match(migration, /existing_count \+ batch_count > 20000/)
  assert.match(migration, /invalid point id/)
  assert.match(migration, /invalid point coordinates/)
  assert.match(migration, /invalid point accuracy/)
  assert.match(migration, /invalid point timestamp/)
  assert.match(migration, /invalid point captureSeq/)
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
  assert.match(trekActions, /\.rpc\('append_trek_points',\s*\{[\s\S]*p_session_id:\s*sessionId,[\s\S]*p_points:\s*points/)
  assert.match(trekActions, /acceptedIds/)
  assert.match(trekActions, /rejectedIds/)
  assert.doesNotMatch(trekActions, /action === 'append_trek_point'[\s\S]{0,800}\.from\('trek_sessions'\)[\s\S]{0,800}\.update\(/)
})

test('client outbox writes before drain and clears only after finish or abort confirmation', () => {
  assert.match(trekClient, /putTrekOutboxPoint\(sid, point\)/)
  assert.match(trekClient, /action:\s*'append_trek_points'/)
  assert.match(trekClient, /markTrekOutboxPointsSynced\(sid, acceptedIds\)/)
  assert.match(trekClient, /markTrekOutboxPointsRejected\(sid, rejectedIds\)/)
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
})
