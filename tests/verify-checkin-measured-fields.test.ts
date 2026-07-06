import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260623090000_verify_checkin_measured_fields_fu99.sql',
  'utf8'
)
const sourceFunctionMigration = readFileSync(
  'supabase/migrations/20260522104503_drop_checkins_status_finalize_fu42.sql',
  'utf8'
)
const trekActions = readFileSync('src/app/api/trek/actions/route.ts', 'utf8')
const activityDetail = readFileSync('src/app/(flow)/activity/[id]/page.tsx', 'utf8')
const sharePage = readFileSync('src/app/(flow)/share/page.tsx', 'utf8')
const shareRender = readFileSync('src/app/api/share/render/route.ts', 'utf8')
const posterRoute = readFileSync('src/app/api/poster/route.ts', 'utf8')
const profileRecords = readFileSync('src/lib/profile-records-server.ts', 'utf8')
const archivePage = readFileSync('src/app/(main)/archive/page.tsx', 'utf8')
const analyticsKpis = readFileSync('src/lib/analytics/kpis.ts', 'utf8')

const measuredColumns = [
  'distance_meters',
  'duration_seconds',
  'elevation_gain_meters',
  'elevation_loss_meters',
  'max_elevation_meters',
  'start_time',
  'end_time',
  'track_points',
] as const

function extractBlock(pattern: RegExp, description: string) {
  const match = migration.match(pattern)
  assert.ok(match, `${description} not found`)
  return match[0]
}

test('FU-99 migration is deploy-gated and preserves verify_and_record_checkin contract', () => {
  assert.match(migration, /Deploy-gated: do not apply to the shared production project without explicit/)
  assert.match(migration, /SECURITY DEFINER safety: the function rejects missing\/mismatched auth\.uid\(\)/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.verify_and_record_checkin\(\s*p_session_id UUID,\s*p_user_id UUID,\s*p_mountain_id UUID,\s*p_latitude NUMERIC,\s*p_longitude NUMERIC,\s*p_note TEXT,\s*p_verified_at TIMESTAMPTZ,\s*p_verification_distance_m INTEGER,\s*p_ranking_weight INTEGER\s*\)/)
  assert.match(migration, /RETURNS TABLE\(checkin_id UUID, duplicated BOOLEAN\)/)
  assert.match(migration, /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/)
  assert.match(migration, /auth\.uid\(\) IS NULL OR auth\.uid\(\) <> p_user_id/)
  assert.doesNotMatch(migration, /public\.auth\.uid/)
  assert.match(migration, /FROM public\.trek_sessions[\s\S]*FOR UPDATE/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.verify_and_record_checkin\(\s*UUID,\s*UUID,\s*UUID,\s*NUMERIC,\s*NUMERIC,\s*TEXT,\s*TIMESTAMPTZ,\s*INTEGER,\s*INTEGER\s*\) FROM PUBLIC, anon, service_role;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.verify_and_record_checkin\(\s*UUID,\s*UUID,\s*UUID,\s*NUMERIC,\s*NUMERIC,\s*TEXT,\s*TIMESTAMPTZ,\s*INTEGER,\s*INTEGER\s*\) TO authenticated;/)

  const sourceSignature = sourceFunctionMigration.match(/CREATE OR REPLACE FUNCTION public\.verify_and_record_checkin\([\s\S]*?\)\nRETURNS TABLE/)?.[0]
  const newSignature = migration.match(/CREATE OR REPLACE FUNCTION public\.verify_and_record_checkin\([\s\S]*?\)\nRETURNS TABLE/)?.[0]
  assert.equal(newSignature, sourceSignature)
})

test('SECURITY DEFINER body is schema-qualified and guarded against silent no-op updates', () => {
  assert.match(migration, /locked_session public\.trek_sessions%ROWTYPE/)
  assert.match(migration, /FROM public\.trek_sessions\s+WHERE id = p_session_id\s+AND user_id = p_user_id\s+FOR UPDATE;/)
  assert.match(migration, /FROM public\.checkins\s+WHERE session_id = p_session_id/)
  assert.match(migration, /UPDATE public\.checkins/)
  assert.match(migration, /UPDATE public\.trek_sessions/)

  assert.doesNotMatch(migration, /\bFROM trek_sessions\b/)
  assert.doesNotMatch(migration, /\bFROM checkins\b/)
  assert.doesNotMatch(migration, /\bUPDATE trek_sessions\b/)
  assert.doesNotMatch(migration, /\bUPDATE checkins\b/)

  const diagnosticsCount = migration.match(/GET DIAGNOSTICS updated_count = ROW_COUNT;/g)?.length ?? 0
  assert.equal(diagnosticsCount, 3)

  const existingCheckinBranch = extractBlock(
    /IF existing_checkin_verified_at IS NULL THEN[\s\S]*?END IF;\s+UPDATE public\.trek_sessions/,
    'existing-checkin unverified branch'
  )
  assert.match(existingCheckinBranch, /GET DIAGNOSTICS updated_count = ROW_COUNT;/)
  assert.match(existingCheckinBranch, /IF updated_count <> 1 THEN\s+RAISE EXCEPTION 'verify_and_record_checkin failed to update existing checkin'/)

  const sessionUpdateGuards = migration.match(/RAISE EXCEPTION 'verify_and_record_checkin failed to update trek session'/g)?.length ?? 0
  assert.equal(sessionUpdateGuards, 2)
})

test('INSERT branch writes the approved session-derived measured fields', () => {
  const insertBlock = extractBlock(
    /INSERT INTO public\.checkins \([\s\S]*?\)\s*VALUES \([\s\S]*?\)\s*RETURNING id INTO inserted_checkin_id;/,
    'insert branch'
  )

  for (const column of measuredColumns) {
    assert.match(insertBlock, new RegExp(`\\b${column}\\b`), `INSERT should include ${column}`)
  }
  assert.match(insertBlock, /locked_session\.distance_m/)
  assert.match(insertBlock, /session_duration_seconds/)
  assert.match(insertBlock, /locked_session\.ascent_m/)
  assert.match(insertBlock, /locked_session\.descent_m/)
  assert.match(insertBlock, /locked_session\.max_altitude_m/)
  assert.match(insertBlock, /locked_session\.started_at/)
  assert.match(insertBlock, /session_end_time/)
  assert.match(insertBlock, /locked_session\.track_points/)
})

test('UPDATE branch fills only NULL measured fields and never clobbers existing measured data', () => {
  const updateBlock = extractBlock(
    /UPDATE public\.checkins\s+SET[\s\S]*?WHERE id = existing_checkin_id/,
    'existing-checkin update branch'
  )

  assert.match(updateBlock, /distance_meters = COALESCE\(distance_meters, locked_session\.distance_m\)/)
  assert.match(updateBlock, /duration_seconds = COALESCE\(duration_seconds, session_duration_seconds\)/)
  assert.match(updateBlock, /elevation_gain_meters = COALESCE\(elevation_gain_meters, locked_session\.ascent_m\)/)
  assert.match(updateBlock, /elevation_loss_meters = COALESCE\(elevation_loss_meters, locked_session\.descent_m\)/)
  assert.match(updateBlock, /max_elevation_meters = COALESCE\(max_elevation_meters, locked_session\.max_altitude_m\)/)
  assert.match(updateBlock, /start_time = COALESCE\(start_time, locked_session\.started_at\)/)
  assert.match(updateBlock, /end_time = COALESCE\(end_time, session_end_time\)/)
  assert.match(updateBlock, /track_points = COALESCE\(track_points, locked_session\.track_points\)/)
})

test('duration and track point semantics stay honest', () => {
  assert.match(migration, /session_duration_seconds := CASE\s+WHEN p_verified_at IS NOT NULL AND locked_session\.started_at IS NOT NULL\s+THEN GREATEST\(0, FLOOR\(EXTRACT\(EPOCH FROM \(p_verified_at - locked_session\.started_at\)\)\)\)::INTEGER\s+ELSE NULL\s+END;/)
  assert.match(migration, /session_end_time := COALESCE\(locked_session\.ended_at, p_verified_at\);/)
  assert.doesNotMatch(migration, /COALESCE\(locked_session\.track_points,\s*'\[\]'/)
  assert.doesNotMatch(migration, /'\[\]'::JSONB/)
})

test('migration does not synthesize fields without authoritative trek session sources', () => {
  assert.doesNotMatch(migration, /\bmin_elevation_meters\b/)
  assert.doesNotMatch(migration, /\btrack_name\b/)
})

test('app fallback insert paths are left as the writers for already-measured non-RPC checkins', () => {
  const finishBlock = trekActions.match(/if \(action === 'finish_incomplete_trek'\) \{[\s\S]*?if \(action === 'verify_summit_checkin'\)/)?.[0] ?? ''
  assert.match(finishBlock, /distance_meters:\s*Math\.round\(distanceMeters\)/)
  assert.match(finishBlock, /duration_seconds:\s*durationSeconds/)
  assert.match(finishBlock, /elevation_gain_meters:\s*Math\.round\(ascentMeters\)/)
  assert.match(finishBlock, /elevation_loss_meters:\s*Math\.round\(descentMeters\)/)
  assert.match(finishBlock, /min_elevation_meters:\s*trackSummary\.minAltitudeM/)
  assert.match(finishBlock, /track_name:\s*'未完成 Trek 记录'/)
})

test('downstream measured-field session fallbacks remain in place for legacy rows', () => {
  assert.match(activityDetail, /toNumber\(checkin\.distance_meters\)[\s\S]*session\?\.distance_m/)
  assert.match(activityDetail, /toNumber\(checkin\.duration_seconds\)[\s\S]*durationFromRange\(session\?\.started_at, session\?\.ended_at\)/)
  assert.match(activityDetail, /toNumber\(checkin\.max_elevation_meters\)[\s\S]*session\?\.max_altitude_m/)
  assert.match(activityDetail, /parseTrackPoints\(checkin\.track_points\)/)

  assert.match(sharePage, /row\.distance_meters \?\? session\?\.distance_m/)
  assert.match(sharePage, /row\.duration_seconds \?\?[\s\S]*session\.ended_at[\s\S]*session\.started_at/)
  assert.match(sharePage, /buildShareTrackPreview\(row\.track_points\) \?\? buildShareTrackPreview\(session\?\.track_points\)/)

  assert.match(shareRender, /row\.distance_meters \?\? session\?\.distance_m/)
  assert.match(shareRender, /row\.duration_seconds \?\?[\s\S]*session\.ended_at[\s\S]*session\.started_at/)
  assert.match(shareRender, /buildShareTrackPreview\(row\.track_points\) \?\? buildShareTrackPreview\(session\?\.track_points\)/)

  assert.match(posterRoute, /positiveNumber\(checkin\.distance_meters\) \?\? positiveNumber\(session\?\.distance_m\)/)
  assert.match(posterRoute, /positiveNumber\(checkin\.duration_seconds\) \?\?[\s\S]*secondsBetween\(session\?\.started_at, session\?\.ended_at\)/)
  assert.match(posterRoute, /resolveMeasuredShareAltitude\(checkin\.max_elevation_meters, session\?\.max_altitude_m\)/)

  assert.match(archivePage, /toNumber\(checkin\.distance_meters\)[\s\S]*session\?\.distance_m/)
  assert.match(archivePage, /toNumber\(checkin\.duration_seconds\)[\s\S]*durationFromRange\(session\?\.started_at, session\?\.ended_at\)/)
  assert.match(profileRecords, /max_elevation_meters/)
  assert.doesNotMatch(analyticsKpis, /from\('checkins'\)/)
})
