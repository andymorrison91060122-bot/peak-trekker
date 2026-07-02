import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function readSource(path: string) {
  return readFileSync(path, 'utf8')
}

const tabBar = readSource('src/components/layout/TabBar.tsx')
const imprintClient = readSource('src/app/(flow)/imprint/ImprintClient.tsx')
const imprintPage = readSource('src/app/(flow)/imprint/page.tsx')
const registry = readSource('src/lib/share-templates/registry.tsx')
const renderRoute = readSource('src/app/api/share/render/route.ts')
const sharePage = readSource('src/app/(flow)/share/page.tsx')
const shareClient = readSource('src/app/(flow)/share/ShareClient.tsx')
const importPage = readSource('src/app/(flow)/import/page.tsx')
const importClient = readSource('src/app/(flow)/import/ImportClient.tsx')
const screenshotPage = readSource('src/app/(flow)/screenshot/page.tsx')
const screenshotClient = readSource('src/app/(flow)/screenshot/ScreenshotClient.tsx')
const explorePage = readSource('src/app/(main)/explore/page.tsx')
const exploreClient = readSource('src/app/(main)/explore/ExploreClient.tsx')
const mountainDetailClient = readSource('src/app/(flow)/mountain/[id]/MountainDetailClient.tsx')
const checkinButton = readSource('src/components/ui/CheckinButton.tsx')
const trekClient = readSource('src/app/(flow)/trek/TrekClient.tsx')

test('tab bar routes the third tab to the imprint facade', () => {
  assert.match(tabBar, /\{ href: '\/imprint', label: '印迹', icon: TabIcons\.imprint \}/)
  assert.doesNotMatch(tabBar, /\{ href: '\/trek', label: '出发'/)
})

test('imprint page keeps paywall runtime decision on the server page', () => {
  assert.match(imprintPage, /import \{ isPremiumPaywallEnabled \} from '@\/lib\/premium'/)
  assert.match(imprintPage, /paywallEnabled=\{isPremiumPaywallEnabled\(\)\}/)
  assert.match(imprintPage, /isAuthenticated=\{await getIsAuthenticated\(\)\}/)
  assert.match(imprintPage, /initialTemplate=\{resolveShareTemplateParam\(resolvedSearchParams\.template\) \?\? undefined\}/)
  assert.match(imprintPage, /initialStep=\{sourceStep \? 'source' : undefined\}/)
  assert.match(imprintPage, /supabase\.auth\.getUser\(\)/)
})

test('share template registry is pure metadata plus id-to-component selector', () => {
  assert.match(registry, /SHARE_TEMPLATE_REGISTRY/)
  assert.match(registry, /id: 'base-classic'[\s\S]*Component: BaseClassicTemplate/)
  assert.match(registry, /id: 'premium-photo-composite'[\s\S]*Component: PremiumPhotoCompositeTemplate/)
  assert.match(registry, /id: 'premium-bold-number'[\s\S]*Component: PremiumBoldNumberTemplate/)
  assert.match(registry, /id: 'premium-altitude-profile'[\s\S]*Component: PremiumAltitudeProfileTemplate/)
  assert.match(registry, /id: 'premium-photo-overlay'[\s\S]*Component: PremiumPhotoOverlayTemplate/)

  for (const forbidden of [
    'sharp',
    'createSupabaseServerClient',
    'loadShareFonts',
    'NextRequest',
    'Response.json',
    'isPremiumPaywallEnabled',
    'checkTemplateAccess',
    'headers',
    'fs',
  ]) {
    assert.doesNotMatch(registry, new RegExp(forbidden))
  }
})

test('share render route uses the shared registry selector without importing template components directly', () => {
  assert.match(renderRoute, /import \{ getShareTemplateComponent \} from '@\/lib\/share-templates\/registry'/)
  assert.match(renderRoute, /const Template = getShareTemplateComponent\(template\)/)
  assert.doesNotMatch(renderRoute, /import \{ BaseClassicTemplate \}/)
  assert.doesNotMatch(renderRoute, /import \{ PremiumPhotoCompositeTemplate \}/)
})

test('imprint facade renders real template components instead of share editor previews', () => {
  assert.match(imprintClient, /getShareTemplateComponent\(template\)/)
  assert.match(imprintClient, /source: 'uploaded'/)
  assert.match(imprintClient, /buildShareTrackPreview\(MOCK_TRACK_POINTS\)/)
  assert.match(imprintClient, /PHOTO_ALPINE = '\/fu85-share-facade\/cover-alpine\.png'/)
  assert.match(imprintClient, /PHOTO_RIDGE = '\/fu85-share-facade\/cover-ridge\.png'/)
  assert.match(imprintClient, /minimal[\s\S]*template: 'base-classic'/)
  assert.match(imprintClient, /route[\s\S]*template: 'premium-photo-composite'/)
  assert.match(imprintClient, /alt[\s\S]*template: 'premium-bold-number'/)
  assert.match(imprintClient, /profile[\s\S]*template: 'premium-altitude-profile'/)
  assert.match(imprintClient, /photo[\s\S]*template: 'premium-photo-overlay'/)
  assert.doesNotMatch(imprintClient, /HeroPreview|BaseHeroPreview|PremiumHeroPreview/)
})

test('imprint facade uses imperative deck motion without full entrance replay on active changes', () => {
  assert.match(imprintClient, /activeIndexRef/)
  assert.match(imprintClient, /function layoutDeck\(animated: boolean\)/)
  assert.match(imprintClient, /gsap\.to\(card, \{[\s\S]*duration: 0\.55[\s\S]*ease: 'power3\.out'/)
  assert.doesNotMatch(imprintClient, /revertOnUpdate/)
  assert.doesNotMatch(imprintClient, /dependencies: \[activeIndex/)
})

test('imprint facade has login gate before every method-screen advance', () => {
  assert.match(imprintClient, /function ensureCanAdvance\(\)/)
  assert.match(imprintClient, /router\.push\(`\/auth\/login\?from=\$\{encodeURIComponent\(buildImprintUrl\(template\)\)\}`\)/)
  assert.match(imprintClient, /if \(name === 'method' && !ensureCanAdvance\(\)\) return/)
  assert.match(imprintClient, /if \(!ensureCanAdvance\(\)\) return/)
  assert.match(imprintClient, /const initialScreen: ImprintScreen = initialStep === 'source' \? 'method' : 'facade'/)
})

test('/share template query initializes ShareClient selected template', () => {
  assert.match(sharePage, /resolveShareTemplateParam\(resolvedSearchParams\.template\) \?\? undefined/)
  assert.match(sharePage, /initialTemplate=\{initialTemplate\}/)
  assert.match(shareClient, /initialTemplate = 'base-classic'/)
  assert.match(shareClient, /useState<TemplateId>\(initialTemplate\)/)
  assert.match(shareClient, /data-testid="share-main-poster-preview"/)
  assert.match(shareClient, /data-current-template=\{selectedTemplate\}/)
})

test('imprint template intent enters import and screenshot through server-validated URL params', () => {
  assert.match(importPage, /resolveShareTemplateParam\(resolvedSearchParams\.template\)/)
  assert.match(importPage, /returnToImprint=\{fromImprint\}/)
  assert.match(importPage, /const fromImprint = Array\.isArray\(resolvedSearchParams\.from\)/)
  assert.match(importPage, /<ImportClient[\s\S]*initialTemplate=\{resolveShareTemplateParam\(resolvedSearchParams\.template\)\}[\s\S]*returnToImprint=\{fromImprint\}/)
  assert.match(screenshotPage, /resolveShareTemplateParam\(resolvedSearchParams\.template\)/)
  assert.match(screenshotPage, /returnToImprint=\{fromImprint\}/)
  assert.match(screenshotPage, /<ScreenshotClient[\s\S]*initialTemplate=\{resolveShareTemplateParam\(resolvedSearchParams\.template\)\}[\s\S]*returnToImprint=\{fromImprint\}/)
  assert.match(imprintClient, /router\.push\(buildImprintImportUrl\(selectedItem\.template\)\)/)
  assert.match(imprintClient, /router\.push\(buildImprintScreenshotUrl\(selectedItem\.template\)\)/)
})

test('imprint preview shell resets inherited button text alignment without changing templates', () => {
  assert.match(imprintClient, /\.imprint-poster-preview \{[\s\S]*text-align: left;/)
  assert.doesNotMatch(imprintClient, /\[data-role="text"\]\s*\{[\s\S]*display:\s*inline-block/)
  assert.match(imprintClient, /const rounded = String\(Math\.round\(value\)\)/)
  assert.doesNotMatch(imprintClient, /Math\.round\(value\)\.toLocaleString/)
})

test('import and screenshot entry back returns to imprint source screen only for imprint-origin flows', () => {
  assert.match(importClient, /returnToImprint = false/)
  assert.match(importClient, /if \(returnToImprint\) \{[\s\S]*router\.replace\(buildImprintSourceUrl\(initialTemplate\)\)[\s\S]*return[\s\S]*\}/)
  assert.match(importClient, /router\.replace\('\/explore'\)/)

  assert.match(screenshotClient, /returnToImprint = false/)
  assert.match(screenshotClient, /if \(returnToImprint\) \{[\s\S]*router\.replace\(buildImprintSourceUrl\(initialTemplate\)\)[\s\S]*return[\s\S]*\}/)
  assert.match(screenshotClient, /router\.replace\('\/explore'\)/)
})

test('import and screenshot completion share actions use the template helper and require checkinId', () => {
  assert.match(importClient, /import \{ buildImprintSourceUrl, buildShareUrlForCheckin \} from '@\/lib\/share-template-intent'/)
  assert.match(importClient, /buildShareUrlForCheckin\(\{[\s\S]*checkinId: confirmResult\?\.checkinId,[\s\S]*template: initialTemplate,[\s\S]*\}\)/)
  assert.match(importClient, /key: 'action_blocked'[\s\S]{0,120}活动还没有生成，暂时无法进入分享。/)
  assert.match(importClient, /router\.replace\(shareUrl\)/)
  assert.match(importClient, /router\.replace\(`\/activity\/\$\{confirmResult\.checkinId\}`\)/)

  assert.match(screenshotClient, /import \{ buildImprintSourceUrl, buildShareUrlForCheckin \} from '@\/lib\/share-template-intent'/)
  assert.match(screenshotClient, /buildShareUrlForCheckin\(\{[\s\S]*checkinId: submitResult\?\.checkinId,[\s\S]*template: initialTemplate,[\s\S]*\}\)/)
  assert.match(screenshotClient, /router\.replace\(shareUrl\)/)
})

test('explore stores valid imprint template intent once and clears the entry URL', () => {
  assert.match(explorePage, /searchParams: Promise<\{ shareTemplate\?: string \| string\[\] \}>/)
  assert.match(explorePage, /shareTemplateIntent=\{resolveShareTemplateParam\(resolvedSearchParams\.shareTemplate\)\}/)
  assert.match(exploreClient, /storePendingShareTemplate\(shareTemplateIntent\)/)
  assert.match(exploreClient, /router\.replace\('\/explore'\)/)
})

test('mountain CTAs consume pending intent only when the user starts trek recording', () => {
  assert.match(checkinButton, /import \{ consumePendingShareTemplateForTrekUrl \} from '@\/lib\/share-template-intent'/)
  assert.match(checkinButton, /normalizeAuthReturnPath\(consumePendingShareTemplateForTrekUrl\(\{ mountainId \}\), '\/trek'\)/)
  assert.match(checkinButton, /router\.push\(consumePendingShareTemplateForTrekUrl\(\{ mountainId \}\)\)/)
  assert.doesNotMatch(checkinButton, /peekPendingShareTemplate\(\)/)

  assert.match(mountainDetailClient, /import \{ buildTrekUrl, consumePendingShareTemplateForTrekUrl \} from '@\/lib\/share-template-intent'/)
  assert.match(mountainDetailClient, /const primaryHref = requiresLogin[\s\S]*buildTrekUrl\(\{ mountainId: mountain\.id \}\)/)
  assert.match(mountainDetailClient, /function handlePrimaryClick\(event: MouseEvent<HTMLAnchorElement>\)/)
  assert.match(mountainDetailClient, /window\.location\.href = consumePendingShareTemplateForTrekUrl\(\{ mountainId: mountain\.id \}\)/)
  assert.doesNotMatch(mountainDetailClient, /peekPendingShareTemplate\(\)/)
})

test('trek share completion keeps FU-102 replace closure and uses only explicit URL template', () => {
  assert.match(trekClient, /resolveShareTemplateParam\(searchParams\.get\('shareTemplate'\)\)/)
  assert.match(trekClient, /if \(!incomingShareTemplate\) return[\s\S]{0,80}clearPendingShareTemplate\(\)/)
  assert.match(trekClient, /buildShareUrlForCheckin\(\{[\s\S]*checkinId: createdCheckinId,[\s\S]*template: incomingShareTemplate,[\s\S]*\}\)/)
  assert.match(trekClient, /replaceAfterTrekCompletion\(shareUrl\)/)
  assert.doesNotMatch(trekClient, /consumePendingShareTemplate\(/)
})
