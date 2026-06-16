import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const trekClient = readFileSync('src/app/(flow)/trek/TrekClient.tsx', 'utf8')
const archiveClient = readFileSync('src/app/(flow)/archive/ArchiveClient.tsx', 'utf8')
const communityDetailClient = readFileSync('src/app/(flow)/community/[postId]/CommunityDetailClient.tsx', 'utf8')
const activityDetailClient = readFileSync('src/app/(flow)/activity/[id]/ActivityDetailClient.tsx', 'utf8')
const shareClient = readFileSync('src/app/(flow)/share/ShareClient.tsx', 'utf8')

test('trek completion paths replace consumed recording history', () => {
  const pendingFinishBranch = trekClient.match(/if \(intent\.kind === 'finish_incomplete'\) \{[\s\S]*?return true\n        \}/)?.[0] ?? ''
  const existingCheckinBranch = trekClient.match(/if \(createdCheckinId\) \{[\s\S]*?return\n      \}/)?.[0] ?? ''
  const delayedFinishBranch = trekClient.match(/window\.setTimeout\(\(\) => \{[\s\S]*?\}, 650\)/)?.[0] ?? ''

  assert.match(trekClient, /if \(checkinId\) void replaceAfterTrekCompletion\(`\/activity\/\$\{checkinId\}`\)/)
  assert.match(pendingFinishBranch, /replaceAfterTrekCompletion\(`\/activity\/\$\{checkinId\}`\)/)
  assert.match(existingCheckinBranch, /replaceAfterTrekCompletion\(`\/activity\/\$\{createdCheckinId\}`\)/)
  assert.match(delayedFinishBranch, /replaceAfterTrekCompletion\(`\/activity\/\$\{checkinId\}`\)/)
  assert.match(trekClient, /navigateAwayFromTrek[\s\S]{0,260}router\.replace\('\/explore'\)/)
  assert.match(trekClient, /function handleBack\(\)[\s\S]{0,120}replaceAfterTrekCompletion\('\/explore'\)/)
  assert.doesNotMatch(pendingFinishBranch, /router\.push\(/)
  assert.doesNotMatch(existingCheckinBranch, /router\.push\(/)
  assert.doesNotMatch(delayedFinishBranch, /router\.push\(/)
})

test('trek summit result forward actions replace the consumed trek result entry', () => {
  assert.match(trekClient, /void replaceAfterTrekCompletion\(`\/share\?checkinId=\$\{encodeURIComponent\(createdCheckinId\)\}`\)/)
  assert.match(trekClient, /void replaceAfterTrekCompletion\(`\/activity\/\$\{createdCheckinId\}`\)/)
  assert.match(trekClient, /data-testid="trek-summit-explore-exit"/)
  assert.match(trekClient, /onExploreExit=\{\(\) => void replaceAfterTrekCompletion\('\/explore'\)\}/)
  assert.doesNotMatch(trekClient, /router\.push\(`\/share\?checkinId=/)
  assert.doesNotMatch(trekClient, /router\.push\(`\/activity\//)
  assert.doesNotMatch(trekClient, /summitCheckinId|TrekSummitHubSnapshot|buildTrekSummitHubHref|readTrekSummitHubSnapshot|writeTrekSummitHubSnapshot/)
})

test('trek completion uses local loop-pop guard neutralization only after completion', () => {
  const neutralizeBlock =
    trekClient.match(/const neutralizeTrekPauseGuardEntries = useCallback\([\s\S]*?return popCount\n  \}, \[popTrekHistoryEntry\]\)/)?.[0] ?? ''
  const popEntryBlock = trekClient.match(/const popTrekHistoryEntry = useCallback\([\s\S]*?return 1\n  \}, \[\]\)/)?.[0] ?? ''
  const entryNeutralizeBlock =
    trekClient.match(/const runTrekCompletionNeutralize = useCallback\([\s\S]*?\n  \}, \[neutralizeTrekPauseGuardEntries\]\)/)?.[0] ?? ''
  const replaceBlock = trekClient.match(/const replaceAfterTrekCompletion = useCallback\([\s\S]*?\n  \)/)?.[0] ?? ''
  const guardEffect =
    trekClient.match(/useEffect\(\(\) => \{[\s\S]*?window\.history\.pushState\(\{ peakTrekkerPauseGuard: true \}[\s\S]*?\}, \[pauseAndNavigateAway, shouldPauseBeforeLeaving\]\)/)?.[0] ?? ''

  assert.match(trekClient, /const trekCompletionTransitionRef = useRef<\{ state: 'neutralizing' \| 'navigating'; promise: Promise<unknown> \} \| null>\(null\)/)
  assert.match(neutralizeBlock, /options: \{ maxPops\?: number \}/)
  assert.match(neutralizeBlock, /maxPops = options\.maxPops \?\? 8/)
  assert.match(neutralizeBlock, /pauseGuardDepthRef\.current > 0 \|\| isTrekPauseGuardHistoryState\(window\.history\.state\)/)
  assert.match(popEntryBlock, /popstatePauseGuardRef\.current = false[\s\S]*window\.history\.back\(\)/)
  assert.match(popEntryBlock, /window\.addEventListener\('popstate', handlePopState, \{ once: true \}\)/)
  assert.match(neutralizeBlock, /pauseGuardDepthRef\.current = Math\.max\(0, pauseGuardDepthRef\.current - 1\)/)
  assert.match(entryNeutralizeBlock, /if \(current\?\.state === 'navigating'\) return/)
  assert.match(entryNeutralizeBlock, /if \(current\?\.state === 'neutralizing'\)[\s\S]*await current\.promise\.catch\(\(\) => undefined\)/)
  assert.match(entryNeutralizeBlock, /finally[\s\S]*trekCompletionTransitionRef\.current = null/)
  assert.match(replaceBlock, /if \(current\?\.state === 'navigating'\) return/)
  assert.match(replaceBlock, /if \(current\?\.state === 'neutralizing'\)[\s\S]*await current\.promise\.catch\(\(\) => undefined\)/)
  assert.match(replaceBlock, /if \(latest\?\.state === 'navigating'\) return/)
  assert.match(replaceBlock, /await neutralizeTrekPauseGuardEntries\(\)[\s\S]*router\.replace\(href\)/)
  assert.match(replaceBlock, /finally[\s\S]*trekCompletionTransitionRef\.current = null/)
  assert.doesNotMatch(trekClient, /TREK_COMPLETION_EXIT_REDIRECT_KEY/)
  assert.doesNotMatch(trekClient, /completion_exit_redirect_until/)
  assert.doesNotMatch(trekClient, /consumeTrekCompletionExitRedirectFlag/)
  assert.match(guardEffect, /window\.history\.pushState\(\{ peakTrekkerPauseGuard: true \}, '', window\.location\.href\)/)
  assert.match(guardEffect, /pauseGuardDepthRef\.current \+= 1/)
  assert.match(guardEffect, /pauseGuardDepthRef\.current = Math\.max\(0, pauseGuardDepthRef\.current - 1\)/)
  assert.match(guardEffect, /void pauseAndNavigateAway\(true\)/)
})

test('archive top back is a stable app-level exit to explore', () => {
  const handleBack = archiveClient.match(/function handleBack\(\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(handleBack, /router\.replace\('\/explore'\)/)
  assert.doesNotMatch(handleBack, /router\.back\(\)/)
  assert.doesNotMatch(handleBack, /router\.push\('\/profile'\)/)
})

test('community delete replaces deleted detail with activity result', () => {
  const deletePost = communityDetailClient.match(/function deletePost\(\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(deletePost, /router\.replace\(`\/activity\/\$\{post\.checkinId\}\?postDeleted=1`\)/)
  assert.doesNotMatch(deletePost, /router\.push\(`\/activity\/\$\{post\.checkinId\}\?postDeleted=1`\)/)
})

test('share and activity detail retain normal back behavior instead of masking upstream history leaks', () => {
  assert.match(shareClient, /<NavBar onBack=\{\(\) => router\.back\(\)\} \/>/)
  assert.match(activityDetailClient, /function handleBack\(\) \{[\s\S]{0,120}router\.back\(\)/)
})
