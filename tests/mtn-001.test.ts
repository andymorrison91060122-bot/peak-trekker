import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validateImportMountainSelectionDistance } from '../src/lib/import/mountain-distance-check.ts'

const explorePage = readFileSync('src/app/(main)/explore/page.tsx', 'utf8')
const exploreClient = readFileSync('src/app/(main)/explore/ExploreClient.tsx', 'utf8')
const exploreCard = readFileSync('src/components/ui/ExploreMountainCard.tsx', 'utf8')
const componentStyles = readFileSync('src/app/components.css', 'utf8')
const mountainPage = readFileSync('src/app/(flow)/mountain/[id]/page.tsx', 'utf8')
const mountainClient = readFileSync('src/app/(flow)/mountain/[id]/MountainDetailClient.tsx', 'utf8')
const importRecordSheet = readFileSync('src/components/mountain/ImportRecordSheet.tsx', 'utf8')
const importPage = readFileSync('src/app/(flow)/import/page.tsx', 'utf8')
const importClient = readFileSync('src/app/(flow)/import/ImportClient.tsx', 'utf8')
const screenshotPage = readFileSync('src/app/(flow)/screenshot/page.tsx', 'utf8')
const screenshotClient = readFileSync('src/app/(flow)/screenshot/ScreenshotClient.tsx', 'utf8')
const confirmRoute = readFileSync('src/app/api/import/confirm/route.ts', 'utf8')

test('MTN-001 derives checked mountains from own checkins and keeps card feedback separate from its detail link', () => {
  assert.match(explorePage, /from\('checkins'\)[\s\S]*select\('mountain_id'\)[\s\S]*eq\('user_id', user\.id\)/)
  assert.match(exploreClient, /checkedMountainIds/)
  assert.match(exploreClient, /你已打卡这座山/)
  assert.match(exploreCard, /isCheckedIn/)
  assert.match(exploreCard, /aria-label="已打卡"/)
  assert.match(exploreCard, /preventDefault\(\)/)
  assert.match(exploreCard, /stopPropagation\(\)/)
})

test('MTN-001 gives checked cards a transparent left touch target with a separate visible capsule', () => {
  assert.match(exploreCard, /data-testid="explore-mountain-card-checkin"/)
  assert.match(exploreCard, /className="explore-card__checkin-button"/)
  assert.match(exploreCard, /data-testid="explore-mountain-card-checkin-capsule"/)
  assert.match(exploreCard, /className="explore-card__checkin-capsule"/)
  assert.match(exploreCard, /data-testid="explore-mountain-card-altitude"/)
  assert.doesNotMatch(exploreCard, /right: 'var\(--space-2\)'/)
  assert.match(componentStyles, /\.explore-card__checkin-button\s*\{[\s\S]*left: 0;[\s\S]*min-width: 44px;[\s\S]*background: transparent;/)
  const checkinCapsuleRule = componentStyles.match(/\.explore-card__checkin-capsule\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(checkinCapsuleRule, /padding: 6px 9px;/)
  assert.match(checkinCapsuleRule, /border-radius: var\(--radius-sm\);/)
  assert.match(checkinCapsuleRule, /color: var\(--color-success\);/)
  assert.match(checkinCapsuleRule, /background: rgba\(7, 13, 12, 0\.78\);/)
  assert.match(componentStyles, /\.explore-card__altitude\s*\{[\s\S]*top: 10px;[\s\S]*right: 10px;/)
})

test('MTN-001 shows the compact detail status and routes the secondary CTA into the shared import sheet', () => {
  assert.match(mountainPage, /profileTrips\.some\(\(trip\) => trip\.mountainId === mountain\.id\)/)
  assert.match(mountainClient, /hasCheckedIn/)
  assert.match(mountainClient, /已打卡/)
  assert.match(mountainClient, /ImportRecordSheet/)
  assert.match(importRecordSheet, /导入记录/)
  assert.match(importRecordSheet, /\$\{path\}\?mountainId=\$\{encodeURIComponent\(mountain\.id\)\}/)
  assert.match(importRecordSheet, /prefers-reduced-motion: reduce/)
})

test('MTN-001 passes an active mountain context through both acquisition flows', () => {
  assert.match(importPage, /initialMountainContext/)
  assert.match(importClient, /initialMountainContext/)
  assert.match(importClient, /contextMountainId/)
  assert.match(screenshotPage, /initialMountainContext/)
  assert.match(screenshotClient, /initialMountainContext/)
  assert.match(screenshotClient, /contextMountainId/)
})

test('MTN-001 keeps detail track binding locked and makes confirm the authority before insert', () => {
  assert.match(importClient, /isMountainContextLocked/)
  assert.match(importClient, /这条轨迹似乎不在当前山峰附近，请检查后重新导入。/)
  assert.match(importClient, /const confirmedMountainId = initialMountainContext\?\.id \?\? mountainId \?\? null/)
  assert.match(importClient, /mountainId:\s*confirmedMountainId/)
  assert.match(importClient, /contextMountainId,/)
  assert.match(confirmRoute, /contextMountainId/)
  assert.match(confirmRoute, /contextMountainId !== mountainId/)
  assert.match(confirmRoute, /validateImportMountainSelectionDistance\(parsedData\.trackPoints, mountain\)/)
  assert.match(confirmRoute, /from\('checkins'\)\s*\.insert/)
})

test('MTN-001 accepts only the current mountain inside the existing 20km import boundary', () => {
  const trackPoints = [
    { latitude: 30, longitude: 100 },
    { latitude: 30.01, longitude: 100.01 },
    { latitude: 30.02, longitude: 100.02 },
  ]

  const matched = validateImportMountainSelectionDistance(trackPoints, { latitude: 30.03, longitude: 100.03 })
  const mismatched = validateImportMountainSelectionDistance(trackPoints, { latitude: 31, longitude: 101 })

  assert.equal(matched.ok, true)
  assert.equal(mismatched.ok, false)
  if (!mismatched.ok) assert.equal(mismatched.code, 'mountain_out_of_range')
})

test('MTN-001 locks screenshot confirmation to the detail mountain without invoking its generic mountain matcher', () => {
  assert.match(screenshotClient, /const isMountainContextLocked = Boolean\(initialMountainContext\)/)
  assert.match(screenshotClient, /mountainId:\s*initialMountainContext\?\.id \?\? selectedMountainId/)
  assert.match(screenshotClient, /contextMountainId:\s*initialMountainContext\?\.id \?\? null/)
  assert.match(screenshotClient, /if \(!isMountainContextLocked\) void searchMountains\(nextEditableFields\.location\)/)
  assert.match(confirmRoute, /mountain_id:\s*mountain\?\.id \?\? null/)
})
