import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

const exploreClient = read('src/app/(main)/explore/ExploreClient.tsx')
const sourceLabel = read('src/components/ui/SourceLabel.tsx')
const shareTemplate = read('src/lib/share-templates/shared.tsx')
const posterRoute = read('src/app/api/poster/route.ts')
const importClient = read('src/app/(flow)/import/ImportClient.tsx')
const importDistanceCheck = read('src/lib/import/mountain-distance-check.ts')
const activityPage = read('src/app/(flow)/activity/[id]/page.tsx')
const checkinDisplayTitle = read('src/lib/checkin-display-title.ts')
const screenshotFieldValidation = read('src/lib/screenshot-field-validation.ts')
const loginPage = read('src/app/auth/login/page.tsx')
const registerPage = read('src/app/auth/register/page.tsx')
const onboardingModal = read('src/components/ui/OnboardingModal.tsx')
const trekClient = read('src/app/(flow)/trek/TrekClient.tsx')
const importParseRoute = read('src/app/api/import/parse/route.ts')
const importConfirmRoute = read('src/app/api/import/confirm/route.ts')
const screenshotClient = read('src/app/(flow)/screenshot/ScreenshotClient.tsx')
const activityActionsRoute = read('src/app/api/activity/actions/route.ts')
const profileAvatarUploader = read('src/components/profile/ProfileAvatarUploader.tsx')
const weatherRoute = read('src/app/api/weather/[mountainId]/route.ts')
const faqContent = read('src/lib/faq-content.ts')
const uiSpec = read('docs/ui-interaction-spec.md')
const releaseMatrix = read('docs/release-priority-matrix.md')

test('license quick tag is presentation copy only and logic follows the new literal', () => {
  assert.match(exploreClient, /'入门线'/)
  assert.doesNotMatch(exploreClient, /无执照可进/)
  assert.match(exploreClient, /tag === '入门线'/)
})

test('SourceLabel uses Chinese on pages while poster and share assets keep English labels', () => {
  assert.match(sourceLabel, /text: 'GPS 实测'/)
  assert.match(sourceLabel, /text: '上传记录'/)
  assert.doesNotMatch(sourceLabel, /text: 'GPS VERIFIED'|text: 'UPLOADED'/)
  assert.match(shareTemplate, /GPS VERIFIED/)
  assert.match(shareTemplate, /UPLOADED/)
  assert.match(posterRoute, /GPS VERIFIED/)
  assert.match(posterRoute, /UPLOADED/)
  assert.match(faqContent, /页面|GPS 实测|上传记录/)
  assert.match(faqContent, /GPS VERIFIED \/ UPLOADED/)
  assert.match(uiSpec, /页面 UI 标签文案必须使用「GPS 实测」\/「上传记录」/)
  assert.match(releaseMatrix, /页面「GPS 实测」\/「上传记录」与分享资产 `GPS VERIFIED` \/ `UPLOADED` 两层标签/)
})

test('locked unmatched and field wording stays consistent', () => {
  assert.match(importClient, /暂未匹配到山峰/)
  assert.match(importClient, /保存为未关联山行/)
  assert.doesNotMatch(importClient, /作为未收录山行保存/)
  assert.match(importDistanceCheck, /你选的这座山离轨迹超过 20 公里，可能不是这一座。可以换一座，或先保存为未关联山行。/)
  assert.match(activityPage, /地区暂未记录/)
  assert.match(activityPage, /未关联山峰/)
  assert.match(checkinDisplayTitle, /'未关联地区'/)
  assert.match(checkinDisplayTitle, /'地区暂未记录'/)
  assert.doesNotMatch(screenshotFieldValidation, /该字段/)
  assert.match(screenshotFieldValidation, /这一项/)
  assert.match(importClient, /时长会保持空白/)
  assert.doesNotMatch(importClient, /时长字段会保持空白/)
})

test('register and onboarding demilitarized copy is present without province-ranking promise leakage', () => {
  assert.match(registerPage, /placeholder="给自己起个名字"/)
  assert.doesNotMatch(registerPage, /登山代号/)
  assert.match(registerPage, /provinceRankingEnabled \?/)
  assert.match(registerPage, /籍贯省份/)
  assert.match(onboardingModal, /登山执照已准备好/)
  assert.match(onboardingModal, /归属地/)
  assert.match(onboardingModal, /接下来/)
  assert.match(onboardingModal, /选择归属地/)
  assert.match(onboardingModal, /先选一个与你有连接的地方。/)
  assert.doesNotMatch(onboardingModal, /Blank License Issued|Identity Anchor|战区归属|当前任务|哪片土地而战/)
})

test('user-visible raw errors are normalized at presentation sinks', () => {
  assert.match(loginPage, /normalizeLoginError/)
  assert.match(loginPage, /console\.warn\('\[auth-login\] login failed'/)
  assert.doesNotMatch(loginPage, /setError\(error\.message\)/)

  assert.match(importParseRoute, /\[import-parse\]/)
  assert.match(importConfirmRoute, /\[import-confirm\]/)
  assert.match(importClient, /readImportPayloadError/)
  assert.doesNotMatch(importClient, /payload\?\.error|payload\.error/)

  assert.match(screenshotClient, /readPayloadError/)
  assert.match(screenshotClient, /screenshotDisplayError/)
  assert.doesNotMatch(screenshotClient, /set(?:Submit|Search|Confirm|Preview|Route)?Error\([^)]*payload\?\.error/)

  assert.match(activityActionsRoute, /console\.error\(`\[activity-actions\]/)
  assert.match(profileAvatarUploader, /profileRouteDisplayError/)
  assert.match(weatherRoute, /\[weather\]/)
  assert.match(trekClient, /console\.warn\('\[trek\] action failed with unknown message'/)
  assert.match(trekClient, /return '操作暂时没有完成，请稍后重试。'/)
  assert.doesNotMatch(trekClient, /return message\s*\n/)
})

test('import parse display error uses HTTP 422 for no-track hints instead of raw-message coupling', () => {
  const parseDisplaySource = importClient.match(/function formatImportParseDisplayError[\s\S]*?function formatImportConfirmDisplayError/)?.[0] ?? ''

  assert.match(parseDisplaySource, /if \(rawMessage\) console\.warn\('\[import\] parse failed', rawMessage\)/)
  assert.doesNotMatch(parseDisplaySource, /KML 文件中没有可用轨迹点|没有可用轨迹点/)
  assert.match(parseDisplaySource, /status === 422/)
  assert.match(parseDisplaySource, /getFileExtension\(fileName\) === 'kml'/)
  assert.match(parseDisplaySource, /建议从原平台导出 GPX 格式重试。/)
  assert.match(parseDisplaySource, /这个文件中没有找到可用轨迹点，请换一个文件重试。/)
})
