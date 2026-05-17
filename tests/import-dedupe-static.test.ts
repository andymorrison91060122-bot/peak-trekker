import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const parseRoute = readFileSync('src/app/api/import/parse/route.ts', 'utf8')
const confirmRoute = readFileSync('src/app/api/import/confirm/route.ts', 'utf8')
const importClient = readFileSync('src/app/(flow)/import/ImportClient.tsx', 'utf8')

test('import parse route computes track hash and returns duplicate payload without error flow', () => {
  assert.match(parseRoute, /computeTrackContentHash\(parsedData\.trackPoints\)/)
  assert.match(parseRoute, /\.eq\('user_id', user\.id\)[\s\S]*\.eq\('track_content_hash', trackContentHash\)/)
  assert.match(parseRoute, /duplicateTrack:\s*{[\s\S]*existingCheckinId:\s*duplicateRow\.id[\s\S]*existingCreatedAt:\s*duplicateRow\.created_at/)
  assert.match(parseRoute, /trackContentHash,\s*[\s\S]*suggestedMountain/)
})

test('import confirm route recomputes hash server-side and catches unique violations', () => {
  assert.match(confirmRoute, /computeTrackContentHash\(parsedData\.trackPoints\)/)
  assert.match(confirmRoute, /track_content_hash:\s*trackContentHash/)
  assert.match(confirmRoute, /code\s*===\s*'23505'/)
  assert.match(confirmRoute, /return trackDuplicateResponse\(duplicateTrack\)/)
  assert.doesNotMatch(confirmRoute, /trackContentHash\s*=\s*\(rawParsedData/)
})

test('import client renders duplicate state with activity link and no duplicate confirm path', () => {
  assert.match(importClient, /这份轨迹已经上传过/)
  assert.match(importClient, /查看已存在活动/)
  assert.match(importClient, /选择其他文件/)
  assert.match(importClient, /response\.status === 409 && payload\?\.code === 'track_duplicate'/)
  assert.match(importClient, /router\.push\(`\/activity\/\$\{checkinId\}`\)/)
})
