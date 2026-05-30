import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const trekActions = readFileSync('src/app/api/trek/actions/route.ts', 'utf8')
const trekVerifyHelpers = readFileSync('src/lib/trek-verify-helpers.ts', 'utf8')

test('summit verification resolves closest whole-track evidence point instead of final descent point', () => {
  assert.match(trekVerifyHelpers, /export function resolveSummitEvidencePoint/)
  assert.match(trekVerifyHelpers, /for \(const point of points\)/)
  assert.match(trekVerifyHelpers, /haversineMeters\(point\.lat, point\.lng, mountain\.latitude, mountain\.longitude\)/)
  assert.match(trekVerifyHelpers, /insideVerifyRadius:\s*bestDistanceM <= maxVerifyDistanceM/)

  const verifyAction = trekActions.match(/if \(action === 'verify_summit_checkin'\) \{[\s\S]*?if \(action === 'submit_historical_checkin'\)/)?.[0] ?? ''
  assert.match(verifyAction, /resolveSummitEvidencePoint\(\{[\s\S]*points,[\s\S]*mountain,[\s\S]*maxVerifyDistanceM: maxVerifyDistance/)
  assert.match(verifyAction, /evidence\.point\.lat/)
  assert.match(verifyAction, /evidence\.point\.lng/)
  assert.match(verifyAction, /verificationDistanceM:\s*Math\.round\(evidence\.distanceM\)/)
  assert.doesNotMatch(verifyAction, /verifyDistance = haversineMeters\(lastPoint\.lat, lastPoint\.lng/)
})

test('finish incomplete trek can auto-create verified checkin from closest summit evidence', () => {
  const finishAction = trekActions.match(/if \(action === 'finish_incomplete_trek'\) \{[\s\S]*?if \(action === 'verify_summit_checkin'\)/)?.[0] ?? ''

  assert.match(finishAction, /resolveSummitEvidencePoint\(\{[\s\S]*effectivePoints,[\s\S]*maxVerifyDistanceM/)
  assert.match(finishAction, /effectivePoints\.length >= verificationRules\.minTrackPoints/)
  assert.match(finishAction, /durationSeconds >= verificationRules\.minSessionSeconds/)
  assert.match(finishAction, /autoVerified:\s*true/)
  assert.match(finishAction, /completionStatus:\s*'complete'/)
  assert.match(finishAction, /completion_status:\s*'complete'/)
  assert.match(finishAction, /verification_distance_m:\s*Math\.round\(evidence\.distanceM\)/)
})
