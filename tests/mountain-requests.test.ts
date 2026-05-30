import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildMountainRequestFingerprint,
  getMountainRequestDedupeBucketStart,
  normalizeMountainRequestInput,
} from '../src/lib/mountain-requests.ts'

const migration = readFileSync('supabase/migrations/20260530093000_create_mountain_requests_table.sql', 'utf8')
const importClient = readFileSync('src/app/(flow)/import/ImportClient.tsx', 'utf8')
const apiRoute = readFileSync('src/app/api/mountain-requests/route.ts', 'utf8')
const adminClient = readFileSync('src/app/admin/mountains/requests/AdminMountainRequestsClient.tsx', 'utf8')

test('mountain_requests migration locks record-only schema, RLS, grants, and dedupe', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mountain_requests/)
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending'\)\)/)
  assert.match(migration, /import_format TEXT CHECK \(import_format IN \('gpx', 'kml', 'fit'\)\)/)
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_mountain_requests_dedupe/)
  assert.match(migration, /ALTER TABLE public\.mountain_requests ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /CREATE POLICY mountain_requests_insert_own[\s\S]*WITH CHECK \(user_id = auth\.uid\(\)\)/)
  assert.match(migration, /CREATE POLICY mountain_requests_select_admin[\s\S]*profiles\.is_admin = TRUE/)
  assert.match(migration, /GRANT INSERT ON TABLE public\.mountain_requests TO authenticated/)
  assert.match(migration, /GRANT SELECT ON TABLE public\.mountain_requests TO authenticated/)
  assert.match(migration, /GRANT ALL ON TABLE public\.mountain_requests TO service_role/)
})

test('mountain request normalization captures safe import context and supported formats', () => {
  const normalized = normalizeMountainRequestInput({
    requestSource: 'import_distance_blocked',
    locationName: '  <img src=x onerror=alert(1)>  ',
    latitude: '34.1234567',
    longitude: 109.7654321,
    altitudeM: 2154.4,
    importFormat: 'gpx',
    candidateMountainName: '西岳华山南峰',
    candidateDistanceM: 21_234.4,
    referencePointSource: 'highest',
    trackContentHash: 'hash-1',
    context: {
      trackPointCount: 128,
      bad: { nested: true },
      note: 'hello   world',
    },
  }, new Date('2026-05-30T10:07:00.000Z'))

  assert.equal(normalized.ok, true)
  if (!normalized.ok) return
  assert.equal(normalized.request.locationName, '<img src=x onerror=alert(1)>')
  assert.equal(normalized.request.latitude, 34.123457)
  assert.equal(normalized.request.altitudeM, 2154)
  assert.equal(normalized.request.importFormat, 'gpx')
  assert.equal(normalized.request.referencePointSource, 'highest')
  assert.equal(normalized.request.context.trackPointCount, 128)
  assert.equal(normalized.request.context.note, 'hello world')
  assert.equal(Object.hasOwn(normalized.request.context, 'bad'), false)
  assert.equal(normalized.request.dedupeBucketStart, '2026-05-30T10:00:00.000Z')
})

test('mountain request rejects unsupported import formats and invalid source', () => {
  assert.deepEqual(normalizeMountainRequestInput({ requestSource: 'x' }), { ok: false, error: 'invalid requestSource' })
  assert.deepEqual(
    normalizeMountainRequestInput({ requestSource: 'import_no_match', importFormat: 'tcx' }),
    { ok: false, error: 'invalid importFormat' }
  )
})

test('mountain request fingerprint dedupes by track hash or rounded geo context', () => {
  assert.equal(
    buildMountainRequestFingerprint({
      requestSource: 'import_no_match',
      trackContentHash: 'abc',
      candidateMountainName: null,
    }),
    'import_no_match|track:abc|candidate:none'
  )

  assert.equal(
    buildMountainRequestFingerprint({
      requestSource: 'import_no_match',
      latitude: 34.123456,
      longitude: 109.123456,
      altitudeM: 2154,
      locationName: '  华山徒步  ',
    }),
    'import_no_match|geo:34.1235,109.1235,2150|name:华山徒步|candidate:none'
  )

  assert.equal(getMountainRequestDedupeBucketStart(new Date('2026-05-30T10:29:59.000Z')), '2026-05-30T10:15:00.000Z')
})

test('import request entrypoints keep existing feedback and submit backend record', () => {
  assert.match(importClient, /message: '正在提交您的山峰反馈…'/)
  assert.match(importClient, /message: '已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放'/)
  assert.match(importClient, /clearToasts\(\)/)
  assert.match(importClient, /openHelpSheet\('start\.mountain-not-listed'\)/)
  assert.match(importClient, /fetch\('\/api\/mountain-requests'/)
  assert.match(importClient, /buildMountainRequestPayload\(parseResult, 'import_no_match'\)/)
  assert.match(importClient, /buildMountainRequestPayload\(result, 'import_distance_blocked', requestCandidate\)/)
})

test('request route inserts as authenticated user without exposing read access', () => {
  assert.match(apiRoute, /supabase\.auth\.getUser\(\)/)
  assert.match(apiRoute, /\.from\('mountain_requests'\)[\s\S]*\.insert\(/)
  assert.doesNotMatch(apiRoute, /\.select\('id'\)/)
  assert.match(apiRoute, /isUniqueViolation\(error\)[\s\S]*deduped: true/)
})

test('admin request list renders untrusted values as React text and has no mutation action', () => {
  assert.match(adminClient, /data-testid="admin-mountain-requests-list"/)
  assert.match(adminClient, /data-testid="admin-mountain-request-card"/)
  assert.doesNotMatch(adminClient, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(adminClient, /fetch\(/)
  assert.doesNotMatch(adminClient, /审核通过|标记|删除|入库/)
})
