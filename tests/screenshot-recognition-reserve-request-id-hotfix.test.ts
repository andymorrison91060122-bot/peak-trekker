import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const formerRepositoryPath = 'supabase/migrations/20260803163000_fix_screenshot_reserve_request_id_pattern.sql'
const initialHistoryPath = 'supabase/migrations/20260803182510_fix_screenshot_reserve_request_id_pattern.sql'
const correctiveHistoryPath = 'supabase/migrations/20260803182723_fix_screenshot_reserve_paid_return_values.sql'
const baselineCorrectMigrationSha256 = '8a69bbee6cf5ef83322d2628965d2b3889a3bd3877b25747c2287fef6d696db9'
const fullUuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
const truncatedUuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
const correctPaidBranch = `  ELSIF locked_row.paid_used < p_paid_limit THEN
    UPDATE public.screenshot_quota AS q
    SET paid_used = q.paid_used + 1, updated_at = now()
    WHERE q.id = locked_row.id
    RETURNING q.free_used, q.paid_used
    INTO free_used, paid_used;
    chosen_bucket := 'paid';`
const initialPaidBranch = `  ELSIF locked_row.paid_used < p_paid_limit THEN
    UPDATE public.screenshot_quota AS q
    SET paid_used = q.paid_used + 1, updated_at = now()
    WHERE q.id = locked_row.id
    RETURNING q.paid_used
    INTO paid_used;
    chosen_bucket := 'paid';`

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

test('repository migration history exactly matches the applied reserve-function order', () => {
  assert.equal(existsSync(formerRepositoryPath), false, 'The obsolete 163000 repository path must be absent.')
  assert.equal(existsSync(initialHistoryPath), true, 'Expected the first applied 182510 history migration.')
  assert.equal(existsSync(correctiveHistoryPath), true, 'Expected the corrective 182723 history migration.')

  const initialHistory = readFileSync(initialHistoryPath, 'utf8')
  const correctiveHistory = readFileSync(correctiveHistoryPath, 'utf8')

  assert.equal(sha256(correctiveHistory), baselineCorrectMigrationSha256)
  assert.equal(initialHistory.replace(initialPaidBranch, correctPaidBranch), correctiveHistory)
  assert.ok(initialHistory.includes(initialPaidBranch))
  assert.ok(correctiveHistory.includes(correctPaidBranch))

  for (const migration of [initialHistory, correctiveHistory]) {
    assert.ok(migration.includes(`p_request_id !~ '${fullUuidPattern}'`))
    assert.ok(!migration.includes(truncatedUuidPattern))
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reserve_screenshot_quota_attempt\(/)
    assert.match(migration, /SECURITY INVOKER/)
    assert.match(migration, /SET search_path = public/)
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_screenshot_quota_attempt\(UUID, TEXT, INTEGER, INTEGER, TEXT\)\s+FROM PUBLIC, authenticated, anon;/)
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_screenshot_quota_attempt\(UUID, TEXT, INTEGER, INTEGER, TEXT\)\s+TO service_role;/)
    assert.doesNotMatch(migration, /complete_screenshot_quota_attempt|get_screenshot_recognition_replay|refund_screenshot_quota_attempt/)
  }
})
