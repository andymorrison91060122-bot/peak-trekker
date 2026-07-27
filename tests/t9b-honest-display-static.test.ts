import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const mountainDetail = readSource('../src/app/(flow)/mountain/[id]/MountainDetailClient.tsx')
const exploreClient = readSource('../src/app/(main)/explore/ExploreClient.tsx')
const exploreCard = readSource('../src/components/ui/ExploreMountainCard.tsx')
const mountainTypes = readSource('../src/types/index.ts')

test('mountain detail uses the shared honest route display contract', () => {
  assert.match(mountainDetail, /from '@\/lib\/mountain-route-display'/)
  assert.match(mountainDetail, /getMountainDistanceKm/)
  assert.match(mountainDetail, /getEstimatedAscentMeters/)
  assert.match(mountainDetail, /getEstimatedDurationRange/)
  assert.doesNotMatch(mountainDetail, /altitude\s*\/\s*260/)
  assert.doesNotMatch(mountainDetail, /estimated_duration\s*\?\?/)
  assert.match(mountainDetail, /value=\{routeFacts\.length === null \? '--'/)
  assert.match(mountainDetail, /countValue=\{routeFacts\.length \?\? undefined\}/)
  assert.match(mountainDetail, /label=\{routeFacts\.gain === null \? '爬升 m' : '估算爬升 m'\}/)
})

test('non-open access state uses the existing decision rows and disables trek entry', () => {
  assert.match(mountainDetail, /getMountainAccessDisplay\(mountain\.access_status\)/)
  assert.match(mountainDetail, /mountain\.access_note\?\.trim\(\)/)
  assert.match(mountainDetail, /accessDisplay\.canStartTrek \? \(/)
  assert.match(mountainDetail, /<PrimaryButton[\s\S]*disabled[\s\S]*\{accessDisplay\.ctaLabel\}/)
  assert.match(mountainDetail, /buildMountainRiskCopy\(mountain\.difficulty, mountain\.risk_note\)/)
  assert.match(mountainDetail, /whiteSpace: 'pre-line'/)
})

test('explore filtering and cards use real non-expert route data only', () => {
  assert.match(exploreClient, /getMountainDistanceKm/)
  assert.match(exploreClient, /matchesMountainLengthBand\(length, lengthBand\)/)
  assert.doesNotMatch(exploreClient, /altitude\s*\/\s*260/)
  assert.match(exploreCard, /getMountainDistanceKm/)
  assert.match(exploreCard, /getEstimatedDurationRange/)
  assert.doesNotMatch(exploreCard, /mountain\.estimated_duration\?\.trim\(\)/)
  assert.match(exploreCard, /filterLengthKm: number \| null/)
  assert.match(exploreCard, /data-length-km=\{filterLengthKm \?\? undefined\}/)
})

test('Mountain keeps legacy fields and adds the imported display fields', () => {
  assert.match(mountainTypes, /estimated_duration\?: string \| null/)
  assert.match(mountainTypes, /estimated_duration_min\?: number \| null/)
  assert.match(mountainTypes, /estimated_duration_minutes\?: number \| null/)
  assert.match(mountainTypes, /access_status\?: 'open' \| 'closed' \| 'unknown' \| 'pilgrimage_only' \| null/)
  assert.match(mountainTypes, /access_note\?: string \| null/)
  assert.match(mountainTypes, /risk_note\?: string \| null/)
})
