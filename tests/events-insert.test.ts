import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

test('events migration defines single JSONB analytics table with insert and admin-select RLS', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20260528093000_create_events_table.sql'), 'utf8')

  assert.match(sql, /create table if not exists public\.events/i)
  assert.match(sql, /properties jsonb not null default '\{\}'::jsonb/i)
  assert.match(sql, /event_name, server_ts desc/i)
  assert.match(sql, /user_id, server_ts desc/i)
  assert.match(sql, /alter table public\.events enable row level security/i)
  assert.match(sql, /events_insert_anon_authenticated/i)
  assert.match(sql, /events_select_admin/i)
  assert.match(sql, /profiles/i)
  assert.match(sql, /is_admin/i)
})

test('analytics event route validates payload and keeps insert failures non-blocking', () => {
  const source = readFileSync(join(root, 'src/app/api/analytics/event/route.ts'), 'utf8')

  assert.match(source, /ANALYTICS_EVENT_TYPES/)
  assert.match(source, /status: 400/)
  assert.match(source, /supabase\.from\('events'\)\.insert/)
  assert.match(source, /console\.warn\('\[analytics\] insert skipped'/)
  assert.match(source, /return noContentWithSession\(sessionId\)/)
})
