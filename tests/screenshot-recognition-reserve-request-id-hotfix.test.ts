import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const ledgeredMigrationPath = 'supabase/migrations/20260803150802_screenshot_recognition_idempotency.sql'
const forwardMigrationPath = 'supabase/migrations/20260803163000_fix_screenshot_reserve_request_id_pattern.sql'
const fullUuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
const truncatedUuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

function extractReserveFunction(sql: string) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.reserve_screenshot_quota_attempt(')
  const end = sql.indexOf('\n$$;', start)
  assert.notEqual(start, -1, 'Expected reserve_screenshot_quota_attempt function.')
  assert.notEqual(end, -1, 'Expected reserve_screenshot_quota_attempt function terminator.')
  return sql.slice(start, end + '\n$$;'.length)
}

test('forward reserve migration repairs only the deployed UUID contract without altering the ledgered migration', () => {
  const ledgered = readFileSync(ledgeredMigrationPath, 'utf8')
  assert.ok(ledgered.includes(`p_request_id !~ '${fullUuidPattern}'`))
  assert.ok(!ledgered.includes(truncatedUuidPattern))

  assert.equal(
    existsSync(forwardMigrationPath),
    true,
    'Expected a forward-only migration for the deployed reserve UUID mismatch.',
  )
  const forward = readFileSync(forwardMigrationPath, 'utf8')

  assert.equal(extractReserveFunction(forward), extractReserveFunction(ledgered))
  assert.ok(forward.includes(`p_request_id !~ '${fullUuidPattern}'`))
  assert.ok(!forward.includes(truncatedUuidPattern))
  assert.match(forward, /SECURITY INVOKER/)
  assert.match(forward, /SET search_path = public/)
  assert.match(forward, /REVOKE ALL ON FUNCTION public\.reserve_screenshot_quota_attempt\(UUID, TEXT, INTEGER, INTEGER, TEXT\)\s+FROM PUBLIC, authenticated, anon;/)
  assert.match(forward, /GRANT EXECUTE ON FUNCTION public\.reserve_screenshot_quota_attempt\(UUID, TEXT, INTEGER, INTEGER, TEXT\)\s+TO service_role;/)
  assert.doesNotMatch(forward, /complete_screenshot_quota_attempt|get_screenshot_recognition_replay|refund_screenshot_quota_attempt/)
})
