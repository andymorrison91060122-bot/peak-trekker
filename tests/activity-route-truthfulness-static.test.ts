import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const BASELINE_SHA = '4450c5aaac8d484fa7664fb1d825409b47fb94dc'

const activityPage = readFileSync('src/app/(flow)/activity/[id]/page.tsx', 'utf8')
const activityClient = readFileSync('src/app/(flow)/activity/[id]/ActivityDetailClient.tsx', 'utf8')
const activityServer = readFileSync('src/lib/activity-server.ts', 'utf8')
const activityMap = readFileSync('src/components/activity/ActivityRouteMap.tsx', 'utf8')
const middleware = readFileSync('src/middleware.ts', 'utf8')
const metricMigration = readFileSync('supabase/migrations/20260730085807_p0_trek_metric_deadband.sql', 'utf8')
const baselineMiddleware = execFileSync('git', ['show', `${BASELINE_SHA}:src/middleware.ts`], { encoding: 'utf8' })

test('activity summit semantics never fall back from end time and route copy stays truthful', () => {
  assert.doesNotMatch(activityPage, /verified_at\s*\?\?\s*checkin\.end_time/)
  assert.doesNotMatch(activityPage, /verified_at\s*\?\?\s*session\?\.ended_at/)
  assert.doesNotMatch(activityServer, /verifiedAt\s*\?\?\s*session\?\.ended_at/)
  assert.doesNotMatch(activityPage, /activityTruthFixture/)
  assert.doesNotMatch(activityClient, /activityTruthFixture/)
  assert.doesNotMatch(middleware, /activityTruthFixture/)
  assert.equal(middleware, baselineMiddleware)
  assert.doesNotMatch(activityMap, />完整轨迹</)
  assert.doesNotMatch(activityMap, />完成轨迹</)
  assert.doesNotMatch(activityMap, /山顶 ·/)
  assert.doesNotMatch(activityMap, />回营</)
  assert.doesNotMatch(activityMap, /d:\s*'M 38 300 Q/)
  assert.match(activityPage, /const summitAt = isSummit \? checkin\.verified_at \?\? null : null/)
  assert.match(activityPage, /const endedAt = checkin\.end_time \?\? session\?\.ended_at \?\? null/)
})

test('activity copy replaces basecamp with start and does not carry this round layout overrides', () => {
  assert.match(activityClient, />起点</)
  assert.doesNotMatch(activityClient, />大本营</)
  const altitudeLabelIndex = activityClient.indexOf('{semantics.altitudeLabel}')
  assert.notEqual(altitudeLabelIndex, -1)
  const altitudeWindow = activityClient.slice(Math.max(0, altitudeLabelIndex - 260), altitudeLabelIndex + 40)
  assert.doesNotMatch(altitudeWindow, /whiteSpace:\s*['"]nowrap['"]/)

  const timeLabelIndex = activityClient.indexOf('{semantics.timeLabel}')
  assert.notEqual(timeLabelIndex, -1)
  const timeLabelWindow = activityClient.slice(Math.max(0, timeLabelIndex - 220), timeLabelIndex + 40)
  assert.doesNotMatch(timeLabelWindow, /whiteSpace:\s*['"]nowrap['"]/)
})

test('max altitude card keeps baseline right-column styles while only swapping truthful labels', () => {
  assert.match(
    activityClient,
    /<div style=\{\{ textAlign: 'right' \}\}>\s*<div style=\{\{ color: 'var\(--color-on-surface-variant\)', fontSize: 10, lineHeight: '14px', letterSpacing: '0\.08em' \}\}>\s*\{semantics\.timeLabel\}\s*<\/div>/
  )
  assert.match(
    activityClient,
    /<div[\s\S]*?\.\.\.monoStyle,[\s\S]*?marginTop: 4,[\s\S]*?color: 'var\(--color-warning\)',[\s\S]*?fontSize: 12,[\s\S]*?lineHeight: '16px',[\s\S]*?fontWeight: 600,[\s\S]*?>\s*\{formatTime\(activity\.endedAt\)\}\s*<\/div>/
  )
})

test('screenshot recognition route card keeps baseline highest-point wording', () => {
  assert.match(
    activityMap,
    /<StatStrip activity=\{activity\} semantics=\{semantics\} highestPointLabel="最高点" \/>/
  )
})

test('metric deadband migration keeps raw points, skips leading low-quality anchors, and pins shared thresholds', () => {
  assert.match(metricMigration, /CREATE OR REPLACE FUNCTION public\.append_trek_points\(/)
  assert.match(metricMigration, /metric_accuracy > 50/)
  assert.match(metricMigration, /greatest\(8, metric_accuracy\)/)
  assert.match(metricMigration, /delta_altitude >= 3/)
  assert.match(metricMigration, /delta_altitude <= -3/)
  assert.match(metricMigration, /metric_anchor := NULL;/)
  assert.match(metricMigration, /IF metric_anchor IS NULL THEN/)
  assert.match(metricMigration, /IF point_accuracy <= 50 THEN/)
  assert.match(metricMigration, /track_points = COALESCE\(\(SELECT jsonb_agg\(point\) FROM unnest\(stored_points\) AS point\), '\[\]'::JSONB\)/)
  assert.doesNotMatch(metricMigration, /\bDELETE FROM public\.checkins\b/)
  assert.doesNotMatch(metricMigration, /\bUPDATE public\.checkins\b/)
})
