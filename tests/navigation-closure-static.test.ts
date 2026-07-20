import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const trekClient = readFileSync('src/app/(flow)/trek/TrekClient.tsx', 'utf8')
const archiveClient = readFileSync('src/app/(main)/archive/ArchiveClient.tsx', 'utf8')
const communityDetailClient = readFileSync('src/app/(flow)/community/[postId]/CommunityDetailClient.tsx', 'utf8')
const activityDetailClient = readFileSync('src/app/(flow)/activity/[id]/ActivityDetailClient.tsx', 'utf8')
const shareClient = readFileSync('src/app/(flow)/share/ShareClient.tsx', 'utf8')
const loginPage = readFileSync('src/app/auth/login/page.tsx', 'utf8')
const registerPage = readFileSync('src/app/auth/register/page.tsx', 'utf8')
const screenshotClient = readFileSync('src/app/(flow)/screenshot/ScreenshotClient.tsx', 'utf8')
const importClient = readFileSync('src/app/(flow)/import/ImportClient.tsx', 'utf8')
const communityHelpers = readFileSync('tests/e2e/community.helpers.ts', 'utf8')
const screenshotRecognitionFlowSpec = readFileSync('tests/e2e/screenshot-recognition-flow.spec.ts', 'utf8')

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
  assert.match(trekClient, /buildShareUrlForCheckin\(\{[\s\S]*checkinId: createdCheckinId,[\s\S]*template: incomingShareTemplate,[\s\S]*\}\)/)
  assert.match(trekClient, /void replaceAfterTrekCompletion\(shareUrl\)/)
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

test('archive is a tier-1 tab page without page-level back chrome', () => {
  assert.doesNotMatch(archiveClient, /function ArchiveHeader/)
  assert.doesNotMatch(archiveClient, /ariaLabel="返回"/)
  assert.doesNotMatch(archiveClient, /function handleBack\(\)/)
  assert.doesNotMatch(archiveClient, /router\.replace\('\/explore'\)/)
  assert.match(archiveClient, /function ArchiveContentHeading\(\)/)
  assert.match(archiveClient, /data-archive-motion="header"/)
})

test('community delete replaces deleted detail with activity result', () => {
  const deletePost = communityDetailClient.match(/function deletePost\(\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(deletePost, /router\.replace\(`\/activity\/\$\{post\.checkinId\}\?postDeleted=1`\)/)
  assert.doesNotMatch(deletePost, /router\.push\(`\/activity\/\$\{post\.checkinId\}\?postDeleted=1`\)/)
})

test('share and activity detail retain normal back behavior instead of masking upstream history leaks', () => {
  const handleShareBack = shareClient.match(/function handleShareBack\(\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(shareClient, /<NavBar onBack=\{handleShareBack\} \/>/)
  assert.match(handleShareBack, /router\.back\(\)/)
  assert.match(handleShareBack, /router\.replace\('\/explore'\)/)
  assert.match(activityDetailClient, /function handleBack\(\) \{[\s\S]{0,120}router\.back\(\)/)
})

test('auth handoff replaces process pages while preserving full-page navigation', () => {
  const loginRegisterLink = loginPage.match(/<Link[\s\S]*?注册 →[\s\S]*?<\/Link>/)?.[0] ?? ''
  const registerLoginLink = registerPage.match(/<Link[\s\S]*?登录 →[\s\S]*?<\/Link>/)?.[0] ?? ''

  assert.match(loginPage, /window\.location\.replace\(returnTo\)/)
  assert.doesNotMatch(loginPage, /window\.location\.assign\(returnTo\)/)
  assert.match(registerPage, /window\.location\.replace\(returnTo\)/)
  assert.match(registerPage, /window\.location\.replace\(loginHref\)/)
  assert.doesNotMatch(registerPage, /window\.location\.assign\(/)
  assert.match(loginRegisterLink, /\breplace\b/)
  assert.match(registerLoginLink, /\breplace\b/)
})

test('screenshot and import auth gates replace consumed process entries', () => {
  const screenshotOpenLogin = screenshotClient.match(/function openLogin\(\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
  const importLoginReplaces = importClient.match(/onLogin=\{\(\) => router\.replace\(buildLoginHref\(\)\)\}/g) ?? []

  assert.match(screenshotOpenLogin, /router\.replace\(buildLoginHref\(\)\)/)
  assert.doesNotMatch(screenshotOpenLogin, /router\.push\(/)
  assert.equal(importLoginReplaces.length, 4)
  assert.doesNotMatch(importClient, /onLogin=\{\(\) => router\.push\(buildLoginHref\(\)\)\}/)
})

test('FU-115 fixture cleanup stays spec-local and preserves failure-path evidence', () => {
  const registerFreshUserSource = communityHelpers.match(/export async function registerFreshUser\([\s\S]*?\n\}/)?.[0] ?? ''
  const finallyIndex = screenshotRecognitionFlowSpec.indexOf('} finally {')
  const contextCloseIndex = screenshotRecognitionFlowSpec.indexOf("await captureEvidence('context close'", finallyIndex)
  const videoSaveIndex = screenshotRecognitionFlowSpec.indexOf("await captureEvidence('video save'", finallyIndex)
  const trackedUserPushes = screenshotRecognitionFlowSpec.match(/SEEDED_USER_IDS\.push\(account\.userId\)/g) ?? []
  const trackedCheckinPushes = screenshotRecognitionFlowSpec.match(/SEEDED_CHECKIN_IDS\.push\(checkinId\)/g) ?? []
  const userCreatedIncrements = screenshotRecognitionFlowSpec.match(/FIXTURE_LEDGER\.usersCreated \+= 1/g) ?? []
  const checkinCreatedIncrements = screenshotRecognitionFlowSpec.match(/FIXTURE_LEDGER\.checkinsCreated \+= 1/g) ?? []
  const userCreationTrackingPairs = screenshotRecognitionFlowSpec.match(/SEEDED_USER_IDS\.push\(account\.userId\)\n\s*FIXTURE_LEDGER\.usersCreated \+= 1/g) ?? []
  const checkinCreationTrackingPairs = screenshotRecognitionFlowSpec.match(/SEEDED_CHECKIN_IDS\.push\(checkinId\)\n\s*FIXTURE_LEDGER\.checkinsCreated \+= 1/g) ?? []
  const checkinCleanupSource = screenshotRecognitionFlowSpec.match(/async function cleanupSeededCheckins\(\): Promise<CleanupAttempt> \{[\s\S]*?\n\}/)?.[0] ?? ''
  const userCleanupSource = screenshotRecognitionFlowSpec.match(/async function cleanupSeededUsers\(\): Promise<CleanupAttempt> \{[\s\S]*?\n\}/)?.[0] ?? ''

  assert.doesNotMatch(communityHelpers, /SEEDED_E2E_USER_IDS|consumeSeededE2EUserIdsForCleanup/)
  assert.doesNotMatch(registerFreshUserSource, /SEEDED_USER_IDS|seedFreshUserAccountForLogin/)
  assert.match(registerFreshUserSource, /return \{ email, password, username, userId \}/)
  assert.match(communityHelpers, /export async function seedFreshUserAccountForLogin[\s\S]*?return \{ userId, email, password \}/)
  assert.match(screenshotRecognitionFlowSpec, /const SEEDED_USER_IDS: string\[\] = \[\]/)
  assert.equal(trackedUserPushes.length, 4)
  assert.equal(trackedCheckinPushes.length, 4)
  assert.equal(userCreatedIncrements.length, 4)
  assert.equal(checkinCreatedIncrements.length, 4)
  assert.equal(userCreationTrackingPairs.length, 4)
  assert.equal(checkinCreationTrackingPairs.length, 4)
  assert.doesNotMatch(checkinCleanupSource, /FIXTURE_LEDGER\.checkinsCreated/)
  assert.doesNotMatch(userCleanupSource, /FIXTURE_LEDGER\.usersCreated/)
  assert.match(screenshotRecognitionFlowSpec, /function writeFixtureRecoveryManifest\(\)/)
  assert.match(screenshotRecognitionFlowSpec, /const FIXTURE_RUN_ID = process\.env\.FU115_FIXTURE_RUN_ID/)
  assert.match(screenshotRecognitionFlowSpec, /const FIXTURE_RUN_DIR = `\$\{EVIDENCE_DIR\}\/e2e-runs\/\$\{FIXTURE_RUN_ID\}`/)
  assert.match(screenshotRecognitionFlowSpec, /runId: FIXTURE_RUN_ID/)
  assert.match(screenshotRecognitionFlowSpec, /\$\{FIXTURE_RUN_DIR\}\/fixture-ledger\.json/)
  assert.match(screenshotRecognitionFlowSpec, /pendingCheckinIds: SEEDED_CHECKIN_IDS/)
  assert.match(screenshotRecognitionFlowSpec, /pendingUserIds: SEEDED_USER_IDS/)
  assert.match(screenshotRecognitionFlowSpec, /const pendingIds = \[\.\.\.SEEDED_CHECKIN_IDS\]/)
  assert.match(screenshotRecognitionFlowSpec, /removePendingIds\(SEEDED_CHECKIN_IDS, deletedIds\)/)
  assert.match(screenshotRecognitionFlowSpec, /const pendingIds = \[\.\.\.SEEDED_USER_IDS\]/)
  assert.match(screenshotRecognitionFlowSpec, /removePendingIds\(SEEDED_USER_IDS, \[userId\]\)/)
  assert.match(screenshotRecognitionFlowSpec, /auth\.admin\.getUserById\(userId\)/)
  assert.match(screenshotRecognitionFlowSpec, /remainingProfiles/)
  assert.doesNotMatch(screenshotRecognitionFlowSpec, /SEEDED_CHECKIN_IDS\.splice\(0, SEEDED_CHECKIN_IDS\.length\)/)
  assert.doesNotMatch(screenshotRecognitionFlowSpec, /SEEDED_USER_IDS\.splice\(0, SEEDED_USER_IDS\.length\)/)
  assert.match(screenshotRecognitionFlowSpec, /const checkinAttempt = await cleanupSeededCheckins\(\)/)
  assert.match(screenshotRecognitionFlowSpec, /const userAttempt = await cleanupSeededUsers\(\)/)
  assert.match(screenshotRecognitionFlowSpec, /writeFixtureLedger\(\)/)
  assert.match(screenshotRecognitionFlowSpec, /writeFixtureRecoveryManifest\(\)/)
  assert.match(screenshotRecognitionFlowSpec, /checkins: \$\{error\}/)
  assert.match(screenshotRecognitionFlowSpec, /users: \$\{error\}/)
  assert.ok(finallyIndex >= 0)
  assert.match(screenshotRecognitionFlowSpec.slice(finallyIndex), /await captureEvidence\('final screenshot'/)
  assert.match(screenshotRecognitionFlowSpec.slice(finallyIndex), /await captureEvidence\('history evidence'/)
  assert.ok(contextCloseIndex > finallyIndex)
  assert.ok(videoSaveIndex > contextCloseIndex)
})
