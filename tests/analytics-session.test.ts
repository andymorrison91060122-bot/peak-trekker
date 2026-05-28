import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  ANALYTICS_SESSION_COOKIE,
  ANALYTICS_SESSION_MAX_AGE_SECONDS,
  ATTRIBUTION_LINK_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
} from '../src/lib/analytics/constants.ts'

const root = process.cwd()

test('analytics uses stable first-party anonymous and attribution cookie names', () => {
  assert.equal(ANALYTICS_SESSION_COOKIE, 'pt_anon_sid')
  assert.equal(ATTRIBUTION_LINK_COOKIE, 'pt_attribution_link_id')
  assert.equal(ANALYTICS_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 30)
  assert.equal(ATTRIBUTION_MAX_AGE_SECONDS, 60 * 60 * 24 * 7)
})

test('client tracker is fire-and-forget with sendBeacon and keepalive fallback', () => {
  const source = readFileSync(join(root, 'src/lib/analytics/client.ts'), 'utf8')

  assert.match(source, /navigator\.sendBeacon/)
  assert.match(source, /keepalive: true/)
  assert.match(source, /catch/)
  assert.match(source, /export function trackEvent\(input: TrackEventInput\)/)
})

test('share attribution can be stored and cleared without server writes', () => {
  const source = readFileSync(join(root, 'src/lib/analytics/attribution.ts'), 'utf8')

  assert.match(source, /storeShareAttribution/)
  assert.match(source, /readShareAttribution/)
  assert.match(source, /clearShareAttribution/)
  assert.match(source, /ATTRIBUTION_LINK_COOKIE/)
})
