import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationM1 = readFileSync('supabase/migrations/20260614090000_drop_profiles_username_unique.sql', 'utf8')
const migrationM2 = readFileSync('supabase/migrations/20260614090100_handle_new_user_profile_metadata.sql', 'utf8')

test('M1 drops profiles username unique constraint and index defensively', () => {
  assert.match(migrationM1, /ALTER TABLE public\.profiles\s+DROP CONSTRAINT IF EXISTS profiles_username_key;/)
  assert.match(migrationM1, /DROP INDEX IF EXISTS public\.profiles_username_key;/)
})

test('M2 reads auth metadata and validates nickname with the agreed SQL rules', () => {
  assert.match(migrationM2, /CREATE OR REPLACE FUNCTION public\.validate_nickname\(value TEXT\)/)
  assert.match(migrationM2, /NEW\.raw_user_meta_data ->> 'nickname'/)
  assert.match(migrationM2, /NEW\.raw_user_meta_data ->> 'province'/)
  assert.match(migrationM2, /NEW\.raw_user_meta_data ->> 'province_code'/)
  assert.match(migrationM2, /char_length\(normalized\) < 2 OR char_length\(normalized\) > 12/)
  assert.match(migrationM2, /\^\[A-Za-z0-9 _一-鿿㐀-䶿豈-﫿-\]\+\$/)
  assert.doesNotMatch(migrationM2, /display_name/)
})

test('M2 uses province_stats as the DB-side province code source', () => {
  assert.match(migrationM2, /FROM public\.province_stats/)
  assert.match(migrationM2, /WHERE province_code = metadata_province_code/)
  assert.match(migrationM2, /province_code = 'ZJ'/)
  assert.match(migrationM2, /province_code = 'BAD'/)
})

test('M2 preserves trigger security hardening and empty search path checks', () => {
  assert.match(migrationM2, /SECURITY DEFINER/)
  assert.match(migrationM2, /SET search_path = ''/)
  assert.match(migrationM2, /ON CONFLICT \(id\) DO NOTHING/)
  assert.match(migrationM2, /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC;/)
  assert.match(migrationM2, /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM anon;/)
  assert.match(migrationM2, /REVOKE EXECUTE ON FUNCTION public\.handle_new_user\(\) FROM authenticated;/)
  assert.match(migrationM2, /GRANT EXECUTE ON FUNCTION public\.handle_new_user\(\) TO service_role;/)
  assert.match(migrationM2, /replace\(setting, '"', ''\) = 'search_path='/)
})

test('M2 contains fail-fast DO assertions for nickname boundaries', () => {
  for (const fixture of [
    '山友',
    '一二三四五六七八九十甲乙',
    '㐀㐁',
    '豈﫿',
    '山友😀',
    "E'山\\n友'",
    "E'山\\t友'",
    '山友!',
    '一二三四五六七八九十甲乙丙',
  ]) {
    assert.match(migrationM2, new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
