import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function readOptionalSource(path: string) {
  const url = new URL(path, import.meta.url)
  return existsSync(url) ? readFileSync(url, 'utf8') : ''
}

function assertRouteTemplate({
  source,
  routeGroup,
  durationToken,
}: {
  source: string
  routeGroup: 'main' | 'flow'
  durationToken: string
}) {
  assert.match(source, new RegExp(`data-route-motion-wrapper="${routeGroup}"`))
  assert.match(source, new RegExp(`animation: pt-route-motion-${routeGroup}-enter var\\(${durationToken}\\) var\\(--ease-out\\)`))
  assert.match(source, /from \{ opacity: 0; \}/)
  assert.match(source, /to \{ opacity: 1; \}/)
  assert.doesNotMatch(source, /transform\s*:/)
  assert.doesNotMatch(source, /translate|scale|rotate/)
  assert.doesNotMatch(source, /will-change/i)
  assert.doesNotMatch(source, /animation-fill-mode|forwards|both/)
}

function extractKeyframeBlock(source: string, name: string) {
  const marker = `@keyframes ${name}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${name} keyframe should exist`)
  const open = source.indexOf('{', start)
  assert.notEqual(open, -1, `${name} keyframe should have a body`)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }
  assert.fail(`${name} keyframe should close`)
}

function assertTransformOpacityOnly(source: string, names: string[]) {
  for (const name of names) {
    const block = extractKeyframeBlock(source, name)
    for (const property of ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding']) {
      assert.doesNotMatch(block, new RegExp(`${property}\\s*:`), `${name} should not animate ${property}`)
    }
    assert.doesNotMatch(block, /box-shadow|filter|background|border|color\s*:/, `${name} should only animate transform/opacity`)
    assert.match(block, /opacity|transform/, `${name} should animate opacity or transform`)
  }
}

describe('FU-76 motion nodes Phase 1 route transitions', () => {
	  test('main and flow route templates exist and use opacity-only tokenized motion', () => {
    const mainTemplate = readSource('../src/app/(main)/template.tsx')
    const flowTemplate = readSource('../src/app/(flow)/template.tsx')

    assertRouteTemplate({
      source: mainTemplate,
      routeGroup: 'main',
      durationToken: '--motion-fast',
    })
	    assertRouteTemplate({
	      source: flowTemplate,
	      routeGroup: 'flow',
	      durationToken: '--motion-base',
	    })
	    assert.match(flowTemplate, /'use client'/)
	    assert.match(flowTemplate, /usePathname\(\)/)
	    assert.match(flowTemplate, /pathname === '\/import' \|\| pathname === '\/screenshot'/)
	    assert.match(flowTemplate, /return <>\{children\}<\/>/)
	  })

  test('route templates do not move fixed or sticky descendants through layout-affecting animation', () => {
    const combined = [
      readSource('../src/app/(main)/template.tsx'),
      readSource('../src/app/(flow)/template.tsx'),
    ].join('\n')

    for (const property of ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding']) {
      assert.doesNotMatch(combined, new RegExp(`${property}\\s*:`), `route template should not animate or set ${property}`)
    }
  })
})

describe('FU-76 universal motion gaps: auth entrance and route loading', () => {
  const loginPage = readSource('../src/app/auth/login/page.tsx')
  const registerPage = readSource('../src/app/auth/register/page.tsx')
  const globalsCss = readSource('../src/app/globals.css')
  const mainLoading = readOptionalSource('../src/app/(main)/loading.tsx')
  const flowLoading = readOptionalSource('../src/app/(flow)/loading.tsx')

  test('shared page entrance is CSS-only, terminal-safe, and scoped to auth pages', () => {
    assert.match(globalsCss, /@keyframes pt-page-enter\s*\{[\s\S]*from\s*\{[\s\S]*opacity:\s*0;[\s\S]*transform:\s*translateY\(12px\);?[\s\S]*to\s*\{[\s\S]*opacity:\s*1;[\s\S]*transform:\s*translateY\(0\)/)
    assert.match(globalsCss, /\.pt-page-enter\s*\{[\s\S]*animation:\s*pt-page-enter var\(--motion-enter\) var\(--ease-out\) both/)
    assert.match(globalsCss, /\.pt-enter-d1\s*\{[\s\S]*animation-delay:\s*60ms/)
    assert.match(globalsCss, /\.pt-enter-d2\s*\{[\s\S]*animation-delay:\s*120ms/)
    assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.pt-page-enter\s*\{[\s\S]*animation:\s*none[\s\S]*opacity:\s*1[\s\S]*transform:\s*translateY\(0\)/)

    for (const [name, source] of [['login', loginPage], ['register', registerPage]] as const) {
      assert.match(source, /className="pt-page-enter"/, `${name} page root should use the shared entrance`)
      assert.match(source, /className="[^"]*\bpt-page-enter pt-enter-d1\b[^"]*"/, `${name} should include the first stagger block`)
      assert.match(source, /className="[^"]*\bpt-page-enter pt-enter-d2\b[^"]*"/, `${name} should include the second stagger block`)
      assert.doesNotMatch(source, /\bgsap\b|@gsap\/react/, `${name} auth entrance must stay CSS-only`)
    }

    const protectedSources = [
      '../src/app/(main)/explore/ExploreClient.tsx',
      '../src/app/(main)/archive/ArchiveClient.tsx',
      '../src/components/profile/ProfileV2Client.tsx',
      '../src/app/(main)/imprint/ImprintClient.tsx',
      '../src/app/(flow)/import/ImportClient.tsx',
      '../src/app/(flow)/screenshot/ScreenshotClient.tsx',
      '../src/app/(flow)/mountain/[id]/MountainDetailClient.tsx',
      '../src/app/(flow)/activity/[id]/ActivityDetailClient.tsx',
      '../src/app/(flow)/faq/FAQClient.tsx',
      '../src/app/(flow)/share/ShareClient.tsx',
      '../src/app/(flow)/trek/TrekClient.tsx',
      '../src/components/onboarding/IntroCarousel.tsx',
    ].map(readSource).join('\n')
    assert.doesNotMatch(protectedSources, /\bpt-page-enter\b/, 'protected motion-complete surfaces must not gain a second entrance')
  })

  test('route-group loading files reuse the canonical Skeleton primitive', () => {
    assert.notEqual(mainLoading, '', '(main)/loading.tsx should exist')
    assert.notEqual(flowLoading, '', '(flow)/loading.tsx should exist')

    assert.match(mainLoading, /import Skeleton from '@\/components\/ui\/Skeleton'/)
    assert.match(mainLoading, /aria-busy="true"/)
    assert.match(mainLoading, /data-route-loading="main"/)
    assert.match(mainLoading, /data-route-loading-region="hero"/)
    assert.match(mainLoading, /data-route-loading-region="chips"/)
    assert.match(mainLoading, /data-route-loading-region="list"/)
    assert.ok((mainLoading.match(/<Skeleton\b/g) ?? []).length >= 10, '(main) loading should contain the approved page silhouette')

    assert.match(flowLoading, /import Skeleton from '@\/components\/ui\/Skeleton'/)
    assert.match(flowLoading, /aria-busy="true"/)
    assert.match(flowLoading, /data-route-loading="flow"/)
    assert.match(flowLoading, /data-route-loading-region="topbar"/)
    assert.match(flowLoading, /data-route-loading-region="hero"/)
    assert.match(flowLoading, /data-route-loading-region="body"/)
    assert.match(flowLoading, /data-route-loading-region="cta"/)
    assert.match(flowLoading, /\[0, 1, 2\]\.map\(\(row\) =>/)
    assert.ok((flowLoading.match(/<Skeleton\b/g) ?? []).length >= 7, '(flow) loading should contain the approved full-viewport silhouette')
  })

  test('main route loading uses a fixed anti-flash delay that survives reduced motion', () => {
    assert.match(mainLoading, /className="pt-route-loading-delayed"/)
    assert.match(globalsCss, /\.pt-route-loading-delayed\s*\{[\s\S]*opacity:\s*0;[\s\S]*animation:\s*pt-route-loading-reveal var\(--motion-fast\) var\(--ease-out\) 180ms both/)
    assert.match(globalsCss, /@keyframes pt-route-loading-reveal\s*\{[\s\S]*from\s*\{[\s\S]*opacity:\s*0[\s\S]*to\s*\{[\s\S]*opacity:\s*1/)
    assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.pt-route-loading-delayed\s*\{[\s\S]*animation:\s*pt-route-loading-reveal 0\.01ms linear 180ms both/)
    assert.doesNotMatch(globalsCss, /\.pt-route-loading-delayed[\s\S]{0,240}animation-delay:\s*var\(--motion-fast\)/)
    assert.doesNotMatch(flowLoading, /pt-route-loading-delayed/)
  })
})

describe('FU-76 motion nodes Phase 2-I import and screenshot ceremonies', () => {
  const importClient = readSource('../src/app/(flow)/import/ImportClient.tsx')
  const screenshotClient = readSource('../src/app/(flow)/screenshot/ScreenshotClient.tsx')
  const shareClient = readSource('../src/app/(flow)/share/ShareClient.tsx')
  const mountainDetailClient = readSource('../src/app/(flow)/mountain/[id]/MountainDetailClient.tsx')
  const exploreClient = readSource('../src/app/(main)/explore/ExploreClient.tsx')
  const explorePage = readSource('../src/app/(main)/explore/page.tsx')
  const archiveClient = readSource('../src/app/(main)/archive/ArchiveClient.tsx')
  const profileClient = readSource('../src/components/profile/ProfileV2Client.tsx')
  const faqClient = readSource('../src/app/(flow)/faq/FAQClient.tsx')
  const activityClient = readSource('../src/app/(flow)/activity/[id]/ActivityDetailClient.tsx')
  const globalsCss = readSource('../src/app/globals.css')
  const componentsCss = readSource('../src/app/components.css')
  const tabBar = readSource('../src/components/layout/TabBar.tsx')
  const trekClient = readSource('../src/app/(flow)/trek/TrekClient.tsx')
  const imprintClient = readSource('../src/app/(main)/imprint/ImprintClient.tsx')
  const exploreMountainCard = readSource('../src/components/ui/ExploreMountainCard.tsx')
  const checkinButton = readSource('../src/components/ui/CheckinButton.tsx')
  const motionCountHelper = readSource('../src/lib/motion-count-format.ts')
  const featureFlags = readSource('../src/lib/feature-flags.ts')
  const profilePage = readSource('../src/app/(main)/profile/page.tsx')
  const faqContent = readSource('../src/lib/faq-content.ts')
  const mountainPage = readSource('../src/app/(flow)/mountain/[id]/page.tsx')
  const onboardingCarousel = readSource('../src/components/onboarding/IntroCarousel.tsx')
  const toastRegistry = readSource('../src/lib/toast-registry.ts')
  const profileAvatarUploader = readSource('../src/components/profile/ProfileAvatarUploader.tsx')
  const emptyState = readSource('../src/components/ui/EmptyState.tsx')
  const spinner = readSource('../src/components/ui/Spinner.tsx')
  const skeleton = readSource('../src/components/ui/Skeleton.tsx')
  const helpTrigger = readSource('../src/components/help/HelpTrigger.tsx')
  const helpSheet = readSource('../src/components/help/HelpSheet.tsx')
  const weatherSection = readSource('../src/components/mountain/WeatherSection.tsx')
  const profileNicknameSheet = readSource('../src/components/profile/ProfileNicknameSheet.tsx')
  const screenshotCalibration = readSource('../src/app/(flow)/screenshot/ScreenshotRouteCalibrationSection.tsx')
  const mountainHeroCarousel = readSource('../src/components/ui/MountainDetailHeroCarousel.tsx')

	  test('import ceremony uses scoped GSAP timeline with reduced-motion terminal state', () => {
    assert.match(importClient, /import gsap from 'gsap'/)
    assert.match(importClient, /import \{ useGSAP \} from '@gsap\/react'/)
    assert.match(importClient, /useGSAP\(\(_context, contextSafe\) =>/)
    assert.match(importClient, /scope: motionScopeRef/)
    assert.match(importClient, /gsap\.matchMedia\(\)/)
    assert.match(importClient, /allowMotion: '\(prefers-reduced-motion: no-preference\)'/)
    assert.match(importClient, /reduceMotion: '\(prefers-reduced-motion: reduce\)'/)
    assert.match(importClient, /mm\.revert\(\)/)
    assert.match(importClient, /clearProps: 'willChange/)
    assert.match(importClient, /addLabel\('symbol'/)
    assert.match(importClient, /addLabel\('card'/)
    assert.match(importClient, /addLabel\('altitude'/)
    assert.match(importClient, /addLabel\('metrics'/)
    assert.match(importClient, /addLabel\('next'/)
	    assert.match(importClient, /className=\{isEntryStep \? undefined : 'pt-import-step-enter'\}/)
	    assert.match(importClient, /data-import-l3-item="summary"/)
	    assert.match(importClient, /className="pt-import-l3-cta pt-pressable-hero"/)
    assert.match(importClient, /pt-import-step-enter var\(--motion-enter\) var\(--ease-out\)/)
    assert.doesNotMatch(importClient, /pt-import-l3-item var\(--motion-enter\)/)
    assert.doesNotMatch(importClient, /pt-import-l3-cta calc\(var\(--motion-press\)/)
    assert.match(importClient, /opacity: 1 !important;[\s\S]*transform: none !important;/)
  })

	  test('screenshot recognition ceremony uses scoped GSAP timeline with reduced-motion terminal state', () => {
    assert.match(screenshotClient, /import gsap from 'gsap'/)
    assert.match(screenshotClient, /import \{ useGSAP \} from '@gsap\/react'/)
    assert.match(screenshotClient, /useGSAP\(\(_context, contextSafe\) =>/)
    assert.match(screenshotClient, /scope: motionScopeRef/)
    assert.match(screenshotClient, /gsap\.matchMedia\(\)/)
    assert.match(screenshotClient, /allowMotion: '\(prefers-reduced-motion: no-preference\)'/)
    assert.match(screenshotClient, /reduceMotion: '\(prefers-reduced-motion: reduce\)'/)
    assert.match(screenshotClient, /mm\.revert\(\)/)
    assert.match(screenshotClient, /clearProps: 'willChange/)
    assert.match(screenshotClient, /addLabel\('fields'/)
    assert.match(screenshotClient, /addLabel\('match'/)
    assert.match(screenshotClient, /addLabel\('cta'/)
	    assert.match(screenshotClient, /className=\{isUploadStep \? undefined : 'pt-screenshot-step-enter'\}/)
    assert.match(screenshotClient, /data-screenshot-recognition-item=\{typeof motionIndex === 'number' \? 'field' : undefined\}/)
    assert.match(screenshotClient, /data-screenshot-recognition-item=\{typeof motionIndex === 'number' \? 'match' : undefined\}/)
    assert.match(screenshotClient, /className="pt-screenshot-recognition-cta pt-pressable-hero"/)
    assert.match(screenshotClient, /pt-screenshot-step-enter var\(--motion-enter\) var\(--ease-out\)/)
    assert.doesNotMatch(screenshotClient, /pt-screenshot-recognition-item var\(--motion-enter\)/)
    assert.doesNotMatch(screenshotClient, /pt-screenshot-recognition-cta calc\(var\(--motion-press\)/)
  })

	  test('new Phase 2-I CSS keyframes only animate transform and opacity', () => {
    assertTransformOpacityOnly(importClient, [
      'pt-import-step-enter',
    ])
    assertTransformOpacityOnly(screenshotClient, [
      'pt-screenshot-step-enter',
    ])
	  })

	  test('import entry facade uses scoped timeline hooks and does not overlap with whole-step enter', () => {
	    assert.match(importClient, /data-import-entry-motion=\{entryMotion \? 'header' : undefined\}/)
	    assert.match(importClient, /data-import-entry-motion=\{entryMotion \? 'title' : undefined\}/)
	    assert.match(importClient, /data-import-entry-motion="format-card"/)
	    assert.match(importClient, /data-import-entry-motion="format-row"/)
	    assert.match(importClient, /data-import-entry-motion="format-badge"/)
	    assert.match(importClient, /data-import-entry-motion="process-row"/)
	    assert.match(importClient, /data-import-entry-motion="footer-primary"/)
	    assert.match(importClient, /if \(step === 'entry'\)/)
	    assert.match(importClient, /addLabel\('header'/)
	    assert.match(importClient, /addLabel\('title'/)
	    assert.match(importClient, /addLabel\('formatCard'/)
	    assert.match(importClient, /addLabel\('process'/)
	    assert.match(importClient, /addLabel\('footer'/)
	    assert.match(importClient, /querySelectorAll\('\[data-import-entry-motion="format-row"\]'\)/)
	    assert.match(importClient, /querySelectorAll\('\[data-import-entry-motion="footer-primary"\], \[data-import-entry-motion="footer-secondary"\]'\)/)
	    assert.match(importClient, /terminalizeImportEntryIfActive/)
	    assert.match(importClient, /importStepRef\.current !== 'entry'/)
	    assert.match(importClient, /onInterrupt: terminalizeImportEntryIfActive/)
	    assert.match(importClient, /setImportEntryTerminal\(\)[\s\S]*gsap\.set\(timelineTargets, \{ clearProps: 'willChange' \}\)/)
	    assert.match(importClient, /dependencies: \[step\]/)
	    assert.doesNotMatch(importClient, /dependencies: \[step, parseResult, confirmResult\]/)
	    assert.match(importClient, /onUpload=\{openFilePicker\}/)
	    assert.doesNotMatch(importClient, /onUpload=\{\(\) => setStep\('upload_empty'\)\}/)
	    assert.match(importClient, /timeline\.fromTo\(footerButtons, \{ autoAlpha: 0, y: 16 \}, \{ autoAlpha: 1, y: 0/)
	    assert.doesNotMatch(importClient, /timeline\.from\(footerButtons/)
	    assert.doesNotMatch(importClient, /\.to\(footerPrimary, \{[^}]*autoAlpha/)
	    assert.doesNotMatch(importClient, /delay:/)
	  })

	  test('screenshot upload facade uses scoped timeline hooks, quota scaleX, and scan draw whitelist', () => {
	    assert.match(screenshotClient, /data-screenshot-upload-motion="nav"/)
	    assert.match(screenshotClient, /data-screenshot-upload-motion="quota-card"/)
	    assert.match(screenshotClient, /data-screenshot-upload-motion="quota-fill"/)
	    assert.match(screenshotClient, /data-quota-ratio=\{progressRatio\.toFixed\(4\)\}/)
	    assert.match(screenshotClient, /transform: `scaleX\(\$\{progressRatio\}\)`/)
	    assert.match(screenshotClient, /data-screenshot-upload-motion="upload-card"/)
	    assert.match(screenshotClient, /data-screenshot-upload-motion="footer-primary"/)
	    assert.match(screenshotClient, /data-scan-draw="corner"/)
	    assert.match(screenshotClient, /data-scan-draw="scan-line"/)
	    assert.match(screenshotClient, /if \(step === 'upload'\)/)
	    assert.match(screenshotClient, /addLabel\('nav'/)
	    assert.match(screenshotClient, /addLabel\('quota'/)
	    assert.match(screenshotClient, /addLabel\('upload'/)
	    assert.match(screenshotClient, /addLabel\('footer'/)
	    assert.match(screenshotClient, /querySelectorAll\('\[data-scan-draw\]'\)/)
	    assert.match(screenshotClient, /strokeDasharray = String\(length\)/)
	    assert.match(screenshotClient, /timeline\.to\(scanPaths, \{ strokeDashoffset: 0/)
	    assert.match(screenshotClient, /terminalizeScreenshotUploadIfActive/)
	    assert.match(screenshotClient, /screenshotStepRef\.current !== 'upload'/)
	    assert.match(screenshotClient, /onInterrupt: terminalizeScreenshotUploadIfActive/)
	    assert.match(screenshotClient, /setScreenshotUploadTerminal\(\)[\s\S]*gsap\.set\(timelineTargets, \{ clearProps: 'willChange' \}\)/)
	    assert.match(screenshotClient, /dependencies: \[step\]/)
	    assert.doesNotMatch(screenshotClient, /dependencies: \[step, recognizeResult, mountainOptions\.length, mountainSearchStatus\]/)
	    assert.match(screenshotClient, /timeline\.fromTo\(footerTargets, \{ autoAlpha: 0, y: 14 \}, \{ autoAlpha: 1, y: 0/)
	    assert.doesNotMatch(screenshotClient, /timeline\.from\(footerTargets/)
	    assert.doesNotMatch(screenshotClient, /\.to\(footerPrimary, \{[^}]*autoAlpha/)
	    assert.doesNotMatch(screenshotClient, /DrawSVGPlugin/)
	    assert.doesNotMatch(screenshotClient, /delay:/)
	  })

	  test('GSAP expansion stays in the approved files and does not use paid DrawSVGPlugin', () => {
	    assert.doesNotMatch(importClient, /DrawSVGPlugin/)
    assert.doesNotMatch(screenshotClient, /DrawSVGPlugin/)
    assert.doesNotMatch(shareClient, /DrawSVGPlugin/)
    assert.doesNotMatch(mountainDetailClient, /DrawSVGPlugin/)
    assert.doesNotMatch(exploreClient, /DrawSVGPlugin/)
    assert.match(importClient, /formatElevationCompact\(countState\.value\)/)
    assert.match(importClient, /altitude\.textContent = terminalAltitude/)
    assert.doesNotMatch(importClient, /console\.log/)
    assert.doesNotMatch(importClient, /DrawSVGPlugin/)
    assert.doesNotMatch(importClient, /\.to\(root\.querySelector\(/)
    assert.match(screenshotClient, /if \(matchCard\) \{[\s\S]*timeline\.to\(matchCard,/)
    assert.match(screenshotClient, /if \(cta\) \{[\s\S]*timeline[\s\S]*\.to\(cta,/)
	  })

  test('mountain detail motion uses enhanced scoped timeline with stats coverage and map-safe route fade', () => {
    assert.match(mountainDetailClient, /import gsap from 'gsap'/)
    assert.match(mountainDetailClient, /import \{ useGSAP \} from '@gsap\/react'/)
    assert.match(mountainDetailClient, /gsap\.registerPlugin\(useGSAP\)/)
    assert.match(mountainDetailClient, /useGSAP\(\(_context, contextSafe\) =>/)
    assert.match(mountainDetailClient, /scope: motionScopeRef/)
    assert.match(mountainDetailClient, /gsap\.matchMedia\(\)/)
    assert.match(mountainDetailClient, /allowMotion: '\(prefers-reduced-motion: no-preference\)'/)
    assert.match(mountainDetailClient, /reduceMotion: '\(prefers-reduced-motion: reduce\)'/)
    assert.match(mountainDetailClient, /terminalizeMountainMotion/)
    assert.match(mountainDetailClient, /if \(!root\.isConnected\) return/)
    assert.match(mountainDetailClient, /data-mountain-motion="hero"/)
    assert.match(mountainDetailClient, /data-mountain-hero-visual/)
    assert.match(mountainDetailClient, /data-mountain-hero-item="chip"/)
    assert.match(mountainDetailClient, /data-mountain-hero-item="title"/)
    assert.match(mountainDetailClient, /data-mountain-hero-item="location"/)
    assert.match(mountainDetailClient, /data-mountain-motion="stats"/)
    assert.match(mountainDetailClient, /data-mountain-stat-tile=\{motionKind\}/)
    assert.match(mountainDetailClient, /data-mountain-stat-value=\{motionKind\}/)
    assert.match(mountainDetailClient, /motionKind="altitude"[\s\S]*countFormat="integer"/)
    assert.match(mountainDetailClient, /motionKind="distance"[\s\S]*countFormat="decimal"/)
    assert.match(mountainDetailClient, /motionKind="gain"[\s\S]*countFormat="integer"/)
    assert.match(mountainDetailClient, /motionKind="duration"/)
    assert.match(mountainDetailClient, /data-mountain-motion="description"/)
    assert.match(mountainDetailClient, /data-mountain-motion="decision"/)
    assert.match(mountainDetailClient, /data-mountain-motion="weather"/)
    assert.match(mountainDetailClient, /data-mountain-motion="route" data-mountain-motion-mode="fade"/)
    assert.match(mountainDetailClient, /data-mountain-motion="waypoints"/)
    assert.match(mountainDetailClient, /data-mountain-motion="featured"/)
    assert.match(mountainDetailClient, /const addHero = \(position: number\) =>/)
    assert.match(mountainDetailClient, /const addStats = \(position: number\) =>/)
    assert.match(mountainDetailClient, /const schedule = \{[\s\S]*hero: 0,[\s\S]*stats: 0\.12,[\s\S]*description: 0\.32,[\s\S]*decision: 0\.48,[\s\S]*weather: 0\.64,[\s\S]*route: 0\.74,[\s\S]*waypoints: 0\.82,[\s\S]*featured: 0\.9/)
    assert.match(mountainDetailClient, /addHero\(schedule\.hero\)/)
    assert.match(mountainDetailClient, /addStats\(schedule\.stats\)/)
    assert.match(mountainDetailClient, /addGroup\('description', 'description', schedule\.description/)
    assert.match(mountainDetailClient, /addGroup\('decision', 'decision', schedule\.decision/)
    assert.match(mountainDetailClient, /addGroup\('weather', 'weather', schedule\.weather/)
    assert.match(mountainDetailClient, /addGroup\('route', 'route', schedule\.route, \{ routeCard: true \}\)/)
    assert.match(mountainDetailClient, /addGroup\('waypoints', 'waypoints', schedule\.waypoints/)
    assert.match(mountainDetailClient, /addGroup\('featured', 'featured', schedule\.featured/)
    assert.match(mountainDetailClient, /if \(fadeOnly\) \{[\s\S]*timeline\.fromTo\(target, \{ autoAlpha: 0 \}, \{ autoAlpha: 1, duration: baseDuration \}, label\)/)
    assert.match(mountainDetailClient, /timeline\.fromTo\(statTiles, \{ autoAlpha: 0, y: 16, scale: 0\.94 \}/)
    assert.match(mountainDetailClient, /stagger: \{ each: 0\.035, from: 'start' \}/)
    assert.match(mountainDetailClient, /timeline\.to\(countState, \{/)
    assert.match(mountainDetailClient, /duration: Math\.min\(0\.46, enterDuration \* 1\.9\)/)
    assert.match(mountainDetailClient, /formatMotionCountValue\(countState\.value, valueNode\.dataset\.countFormat, finalText\)/)
    assert.match(mountainDetailClient, /valueNode\.textContent = finalText/)
    assert.match(mountainDetailClient, /timeline\.fromTo\(heroVisuals, \{ scale: 1\.06 \}/)
    assert.match(mountainDetailClient, /addChildCascade\(target, position \+ 0\.08, '\[data-mountain-motion-child="section-title"\]'\)/)
    assert.doesNotMatch(mountainDetailClient, /addChildCascade\(target, position, '\[data-mountain-route-card\]/)
    assert.match(mountainDetailClient, /dependencies: \[\]/)
    assert.doesNotMatch(mountainDetailClient, /dependencies: \[[^\]]*(weather|map|featured|licenseSheetOpen|displayWaypoints)/)
    assert.doesNotMatch(mountainDetailClient, /\.from\(/)
    assert.doesNotMatch(mountainDetailClient, /<0\.\d+/)
    assert.doesNotMatch(mountainDetailClient, /\$\{label\}</)
    assert.doesNotMatch(mountainDetailClient, /querySelector(?:All)?\([^)]*(PmtilesSnapshotMap|canvas|mountain-bottom-cta)/)
	    assert.doesNotMatch(mountainDetailClient, /pt-mountain-press-target/)
  })

  test('explore motion is layered, limits first-screen card stagger, and does not alter list key structure', () => {
    assert.match(exploreClient, /import gsap from 'gsap'/)
    assert.match(exploreClient, /import \{ useGSAP \} from '@gsap\/react'/)
    assert.match(exploreClient, /gsap\.registerPlugin\(useGSAP\)/)
    assert.match(exploreClient, /useGSAP\(\(_context, contextSafe\) =>/)
    assert.match(exploreClient, /scope: motionScopeRef/)
    assert.match(exploreClient, /gsap\.matchMedia\(\)/)
    assert.match(exploreClient, /allowMotion: '\(prefers-reduced-motion: no-preference\)'/)
    assert.match(exploreClient, /reduceMotion: '\(prefers-reduced-motion: reduce\)'/)
    assert.match(exploreClient, /terminalizeExploreMotion/)
    assert.match(exploreClient, /if \(!root\.isConnected\) return/)
    assert.match(exploreClient, /data-explore-motion="shell"/)
    assert.doesNotMatch(exploreClient, /data-explore-motion="header"/)
    assert.match(exploreClient, /data-explore-motion="search"/)
    assert.match(exploreClient, /data-explore-motion="pathways"/)
    assert.match(exploreClient, /data-explore-motion="list-heading"/)
    assert.match(exploreClient, /data-explore-motion="list-subheading"/)
    assert.match(exploreClient, /data-explore-list-empty/)
    assert.match(exploreClient, /data-explore-pathway-card=\{title\}/)
    assert.match(exploreClient, /getScopedTargets\('\[data-testid="explore-mountain-card"\]'\)\.slice\(0, 4\)/)
    assert.match(exploreClient, /card\.dataset\.exploreMotionParticipation = 'first-screen'/)
    assert.match(exploreClient, /const schedule = \{[\s\S]*shell: 0,[\s\S]*search: 0\.12,[\s\S]*pathways: 0\.22,[\s\S]*pathwayCards: 0\.26,[\s\S]*listHeading: 0\.3,[\s\S]*quickTags: 0\.34,[\s\S]*listSubheading: 0\.4,[\s\S]*firstCards: 0\.45/)
    assert.doesNotMatch(exploreClient, /header: 0\.04|addMotion\('header'/)
    assert.match(exploreClient, /addMotion\('search', 'search', schedule\.search/)
    assert.match(exploreClient, /addMotion\('pathways', 'pathways', schedule\.pathways/)
    assert.match(exploreClient, /addMotion\('list-heading', 'listHeading', schedule\.listHeading/)
    assert.match(exploreClient, /const quickTagChips = getScopedTargets\('\.explore-filter-chip'\)/)
    assert.match(exploreClient, /timeline\.addLabel\('quickTags', schedule\.quickTags\)/)
    assert.match(exploreClient, /timeline\.fromTo\(quickTagChips, \{ autoAlpha: 0, y: 10 \}, \{[\s\S]*autoAlpha: 1,[\s\S]*y: 0,[\s\S]*stagger: \{ each: 0\.03, from: 'start' \}/)
    assert.doesNotMatch(exploreClient, /timeline\.fromTo\(quickTagChips,[\s\S]{0,220}scale/)
    assert.match(exploreClient, /addMotion\('list-subheading', 'listSubheading', schedule\.listSubheading, 12, 1\)/)
    assert.match(exploreClient, /timeline\.addLabel\('firstCards', schedule\.firstCards\)/)
    assert.match(exploreClient, /timeline\.fromTo\(firstScreenCards, \{ autoAlpha: 0, y: 18, scale: 0\.96 \}/)
    assert.match(exploreClient, /const cardDuration = Math\.min\(parseMotionTokenSeconds\(root, '--motion-enter', 320\), 0\.16\)/)
    assert.match(exploreClient, /duration: cardDuration/)
    assert.match(exploreClient, /stagger: \{ each: 0\.03, from: 'start' \}/)
    assert.match(exploreClient, /timeline[\s\S]*\.addLabel\('shell', schedule\.shell\)[\s\S]*\.fromTo\(root, \{ y: 12 \}/)
    assert.doesNotMatch(exploreClient, /fromTo\(root, \{ autoAlpha: 0/)
    assert.match(exploreClient, /dependencies: \[\]/)
    assert.doesNotMatch(exploreClient, /dependencies: \[[^\]]*(filtered|search|tag|position|provinceBanner|showAdvanced)/)
    assert.doesNotMatch(exploreClient, /\.from\(/)
    assert.doesNotMatch(exploreClient, /<0\.\d+/)
    assert.doesNotMatch(exploreClient, /\$\{label\}</)
    assert.match(exploreClient, /filtered\.map\(\(\{ mountain, length \}, index\) => \([\s\S]*<ExploreMountainCard[\s\S]*mountPending=\{index < 4 && !mountSettledRef\.current\}/m)
    assert.doesNotMatch(exploreClient, /pt-explore-press-target/)
    assert.doesNotMatch(exploreClient, /\[data-testid="explore-mountain-card"\]:active/)
    assert.match(exploreClient, /<button[\s\S]{0,220}data-explore-pathway-card=\{title\}[\s\S]{0,160}data-explore-pathway-button=\{title\}[\s\S]{0,120}className="pt-pathway-press explore-scene-panel__action"/)
    assert.match(exploreClient, /aria-label=\{title\}/)
    assert.doesNotMatch(exploreClient, /className="pt-pressable-hero"/)
    assert.match(exploreMountainCard, /data-testid="explore-mountain-card"/)
    assert.match(exploreMountainCard, /className="surface-card explore-card pt-pressable-card"/)
  })

  test('FU-86 explore uses the approved scene panel, fixed filters, and real-only card meta', () => {
    assert.doesNotMatch(exploreClient, /<h1[\s\S]*探索[\s\S]*<\/h1>/)
    assert.match(exploreClient, /const QUICK_TAGS = \['附近', '入门线', '进阶线', '5000m\+'\] as const/)
    assert.doesNotMatch(exploreClient, /const QUICK_TAGS = [^\n]*(本省热门|无需执照|高海拔|长线)/)
    assert.match(exploreClient, /tag === '入门线'[\s\S]*mountain\.difficulty === 'beginner'/)
    assert.match(exploreClient, /tag === '进阶线'[\s\S]*mountain\.difficulty !== 'beginner'/)
    assert.match(exploreClient, /mountain\.altitude >= 5000/)

    assert.match(exploreClient, /<section[\s\S]{0,260}className="explore-scene-panel"[\s\S]{0,260}data-explore-motion="pathways"/)
    assert.match(exploreClient, /data-explore-mount-state="pending"/)
    assert.match(exploreClient, /scenePanel\.dataset\.exploreMountState = 'running'/)
    assert.match(exploreClient, /target\.dataset\.exploreMountState = 'settled'/)
    assert.match(exploreClient, /<video[\s\S]{0,420}ref=\{sceneVideoRef\}[\s\S]{0,420}src="\/explore\/explore-hero\.mp4"[\s\S]{0,420}poster="\/explore\/explore-hero-poster\.jpg"/)
    assert.match(exploreClient, /muted[\s\S]{0,100}loop[\s\S]{0,100}playsInline[\s\S]{0,100}preload="metadata"/)
    assert.doesNotMatch(exploreClient, /<video[^>]*\bautoPlay\b/)
    assert.match(exploreClient, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
    assert.match(exploreClient, /video\.play\(\)[\s\S]*\.catch|await video\.play\(\)[\s\S]*catch/)
    assert.match(exploreClient, /addEventListener\('pointerdown',[\s\S]*\{ once: true \}\)/)
    assert.match(exploreClient, /addEventListener\('keydown',[\s\S]*\{ once: true \}\)/)
    assert.match(exploreClient, /removeEventListener\('pointerdown'/)
    assert.match(exploreClient, /removeEventListener\('keydown'/)

    assert.match(exploreClient, /已经走过？把结果带回来/)
    assert.match(exploreClient, /走过的路，值得留下来/)
    assert.match(componentsCss, /\.explore-scene-panel__eyebrow \{[\s\S]*font-size: var\(--font-title-m-size\);[\s\S]*line-height: var\(--font-title-m-line\);[\s\S]*font-weight: 600;/)
    assert.match(componentsCss, /\.explore-scene-panel__subtitle \{[\s\S]*color: var\(--color-on-surface-variant\);[\s\S]*font-size: var\(--font-body-m-size\);[\s\S]*line-height: var\(--font-body-m-line\);[\s\S]*font-weight: var\(--font-body-m-weight\);/)
    assert.match(exploreClient, /title="导入记录"[\s\S]*prompt="选择记录文件 →"/)
    assert.match(exploreClient, /title="识别截图"[\s\S]*prompt="挑一张截图 →"/)
    assert.match(exploreClient, /aria-label=\{title\}/)
    assert.match(exploreClient, /className="explore-scene-panel__prompt" aria-hidden="true"/)
    assert.match(exploreClient, /<video[\s\S]{0,520}aria-hidden="true"/)
    assert.match(exploreClient, /className="explore-scene-panel__scrim" aria-hidden="true"/)
    assert.match(exploreClient, /onKeyDown=\{markKeyboardPressFallback\}/)
    assert.match(exploreClient, /onKeyUp=\{clearPressFallback\}/)

    assert.match(exploreClient, /data-explore-pathway-icon-path/)
    assert.match(exploreClient, /const getPathwayIconPaths = \(\) => getScopedTargets\('\[data-explore-pathway-icon-path\]'\)/)
    assert.match(exploreClient, /timeline\.fromTo\(pathwayIconPaths, \{ strokeDasharray: 24, strokeDashoffset: 24 \}, \{[\s\S]*strokeDasharray: 24,[\s\S]*strokeDashoffset: 0/)
    assert.match(exploreClient, /terminalizePathwayIcons/)

    assert.match(componentsCss, /\.explore-scene-panel \{[\s\S]*height: 172px;[\s\S]*border-radius: var\(--radius-lg\);[\s\S]*overflow: hidden;/)
    assert.match(componentsCss, /\.explore-scene-panel\[data-explore-mount-state='pending'\] \{[\s\S]*opacity: 0;[\s\S]*translateY\(18px\) scale\(\.96\)/)
    assert.match(componentsCss, /prefers-reduced-motion: reduce[\s\S]*\.explore-scene-panel\[data-explore-mount-state='pending'\] \{[\s\S]*opacity: 1;[\s\S]*transform: none/)
    assert.match(componentsCss, /\.explore-scene-panel__scrim \{[\s\S]*linear-gradient\(180deg, rgba\(6, 10, 8, 0\.72\) 0%, rgba\(6, 10, 8, 0\.30\) 26%, rgba\(6, 10, 8, 0\.06\) 50%, rgba\(6, 10, 8, 0\.46\) 100%\)/)
    assert.match(componentsCss, /\.explore-scene-panel__actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*gap: 10px;/)
    assert.match(componentsCss, /\.explore-scene-panel__action \{[\s\S]*height: 48px;[\s\S]*backdrop-filter: blur\(9px\)/)
    assert.match(globalsCss, /\.pt-pathway-press:active[\s\S]*transform: scale\(\.975\);[\s\S]*filter: brightness\(1\.06\)/)

    assert.doesNotMatch(exploreMountainCard, /function estimateLength|function estimateDuration|DifficultyChip/)
    assert.match(exploreMountainCard, /filterLengthKm: number/)
    assert.match(exploreMountainCard, /data-length-km=\{filterLengthKm\}/)
    assert.match(exploreMountainCard, /mountain\.length_km != null && mountain\.length_km > 0/)
    assert.match(exploreMountainCard, /mountain\.estimated_duration\?\.trim\(\)/)
    assert.match(exploreMountainCard, /const coverBackgroundImage = heroImage[\s\S]*JSON\.stringify\(heroImage\)[\s\S]*JSON\.stringify\(DEFAULT_MOUNTAIN_COVER_URL\)/)
    assert.match(exploreMountainCard, /data-testid="explore-mountain-card-cover"[\s\S]{0,120}style=\{\{ backgroundImage: coverBackgroundImage \}\}/)
    assert.doesNotMatch(exploreMountainCard, /<img/)
    assert.match(exploreMountainCard, /normalizedDifficulty === 'beginner' \? '入门线' : '进阶线'/)
    assert.match(exploreClient, /<ExploreMountainCard[\s\S]*filterLengthKm=\{length\}[\s\S]*mountPending=\{index < 4 && !mountSettledRef\.current\}/)
    assert.match(exploreMountainCard, /data-explore-mount-state=\{mountPending \? 'pending' : undefined\}/)
    assert.match(componentsCss, /\[data-testid='explore-mountain-card'\]\[data-explore-mount-state='pending'\] \{[\s\S]*opacity: 0;[\s\S]*translateY\(18px\) scale\(\.96\)/)
    assert.match(componentsCss, /\.explore-card \{[\s\S]*height: 186px;/)
    assert.match(componentsCss, /\.explore-card__cover \{[\s\S]*background-image: url\('\/images\/default-mountain-cover\.png'\)/)
    assert.match(componentsCss, /\.explore-card__altitude \{[\s\S]*font-variant-numeric: tabular-nums;/)

    assert.match(exploreClient, /import \{ useAppToast \} from '@\/components\/ui\/AppToastProvider'/)
    assert.match(exploreClient, /const hasSearchQuery = search\.trim\(\) !== ''/)
    assert.match(exploreClient, /function normalizeExploreSearchText\(value: string\)/)
    assert.match(exploreClient, /const rawSearchMatches = useMemo\(/)
    assert.match(exploreClient, /const altitude = String\(mountain\.altitude\)/)
    assert.match(exploreClient, /mountain\.name/)
    assert.match(exploreClient, /mountain\.province/)
    assert.match(exploreClient, /const searchHasNoRawMatches = hasSearchQuery && rawSearchMatches\.length === 0/)
    assert.match(exploreClient, /const exploreResultKind: ExploreResultKind = searchHasNoRawMatches[\s\S]*\? 'rich-empty'[\s\S]*: filtered\.length === 0[\s\S]*\? 'filter-empty'[\s\S]*: 'results'/)
    assert.match(exploreClient, /className="explore-scene-panel"[\s\S]{0,180}hidden=\{exploreResultKind === 'rich-empty'\}/)
    assert.match(exploreClient, /exploreResultKind === 'rich-empty' \? \([\s\S]*<ExploreSearchEmptyState/)
    assert.match(exploreClient, /<EmptyState[\s\S]*title="没有找到匹配的山峰"[\s\S]*copy="试试切换标签或清空高级筛选条件。"/)
    assert.match(exploreClient, /data-explore-list-empty[\s\S]*data-explore-empty-kind="search"/)
    assert.match(exploreClient, /title="导入轨迹记录"[\s\S]*onClick=\{goImport\}/)
    assert.match(exploreClient, /title="识别成绩截图"[\s\S]*onClick=\{goScreenshot\}/)
    assert.doesNotMatch(exploreClient, /title="继续搜索"|onContinueSearch|start\.mountain-not-listed/)
    assert.match(exploreClient, /function showExploreMountainRequestPlaceholder\(\)[\s\S]*showToast\(\{[\s\S]*tone: 'success'/)
    assert.doesNotMatch(exploreClient, /fetch\('\/api\/mountain-requests'|requestSource: 'explore_search_empty'|isSubmittingMountainRequest/)
    assert.match(exploreClient, /已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放/)
    assert.match(exploreClient, /山峰暂未收录？[\s\S]*提交一座山的资料/)
    assert.doesNotMatch(exploreClient, /href=["']#["']/)
    assert.match(componentsCss, /\.explore-search-empty \{[\s\S]*padding:[^;]+;[\s\S]*text-align: center;/)
    assert.match(exploreClient, /src="\/explore\/explore-empty-import\.mp4"[\s\S]*poster="\/explore\/explore-empty-import-poster\.jpg"/)
    assert.match(exploreClient, /src="\/explore\/explore-empty-shot\.mp4"[\s\S]*poster="\/explore\/explore-empty-shot-poster\.jpg"/)
    assert.match(exploreClient, /if \(exploreResultKind === 'rich-empty'\) \{[\s\S]*pauseHiddenVideo\(\)[\s\S]*return/)
    assert.match(exploreClient, /\}, \[exploreResultKind\]\)/)
    assert.doesNotMatch(exploreClient, /explore-search-empty__trace/)
    assert.match(componentsCss, /\.explore-search-empty__action-video \{[\s\S]*position: absolute;[\s\S]*object-fit: cover;/)
    assert.match(componentsCss, /\.explore-search-empty__action-scrim \{[\s\S]*linear-gradient/)
    assert.doesNotMatch(explorePage, /paddingBottom:\s*104/, 'Explore must rely on the main layout TabBar reservation instead of stacking another 104px')
  })

  test('FU-110 explore source-change replay is pre-paint, live-query, and interrupt-safe', () => {
    assert.match(exploreClient, /import \{[\s\S]*useCallback,[\s\S]*useEffect,[\s\S]*useLayoutEffect,[\s\S]*useMemo,[\s\S]*useRef,[\s\S]*useState,[\s\S]*\} from 'react'/)
    assert.match(exploreClient, /const replayExploreListRef = useRef<\(\(reasons: ExploreReplayReason\[\]\) => void\) \| null>\(null\)/)
    assert.match(exploreClient, /const terminalizeExploreListRef = useRef<\(\(\) => void\) \| null>\(null\)/)
    assert.match(exploreClient, /const pendingExploreReplayRef = useRef\(false\)/)
    assert.match(exploreClient, /type ExploreReplayReason = 'geo' \| 'tag' \| 'advancedFilter' \| 'search'/)
    assert.match(exploreClient, /const pendingExploreReplayReasonsRef = useRef<Set<ExploreReplayReason>>\(new Set\(\)\)/)
    assert.match(exploreClient, /const mountSettledRef = useRef\(false\)/)
    assert.doesNotMatch(exploreClient, /draftProvinceInitialSyncDoneRef|draftProvinceRef|syncDraftProvince/)
    assert.match(exploreClient, /type ExplorePosition = \{ lat: number; lng: number \}/)
    assert.match(exploreClient, /let cachedExplorePosition: ExplorePosition \| null = null/)
    assert.match(exploreClient, /function sameExplorePosition\(left: ExplorePosition \| null, right: ExplorePosition\)/)
    assert.match(exploreClient, /const positionRef = useRef<ExplorePosition \| null>\(cachedExplorePosition\)/)
    assert.match(exploreClient, /const \[position, setPosition\] = useState<ExplorePosition \| null>\(\(\) => cachedExplorePosition\)/)
    assert.match(exploreClient, /const lastVisibleFirst4IdsRef = useRef<string\[\]>\(\[\]\)/)
    assert.match(exploreClient, /const mountTimelineRef = useRef<gsap\.core\.Timeline \| null>\(null\)/)
    assert.doesNotMatch(exploreClient, /hasMountedSourceStateRef/)
    assert.doesNotMatch(exploreClient, /useLayoutEffect\(\(\) => \{[\s\S]*mountSettledRef\.current = true[\s\S]*\}, \[\]\)/)

    assert.match(exploreClient, /function recordExploreReplayReasons\(layer: ExploreReplayReasonLayer, reasons: ExploreReplayReason\[\]\)/)
    assert.match(exploreClient, /__fu110ExploreReplayReasons \?\?= \{ queuedReasons: \[\], firedReplayReasons: \[\] \}/)
    assert.match(exploreClient, /window\.dispatchEvent\(new CustomEvent\('fu110:explore-replay-fired'/)
    assert.doesNotMatch(exploreClient, /queueExploreListReplay\('province'\)|pendingExploreReplayReasonsRef\.current\.add\('province'\)/)
    assert.match(exploreClient, /const previousPosition = positionRef\.current[\s\S]*if \(sameExplorePosition\(previousPosition, nextPosition\)\) return[\s\S]*cachedExplorePosition = nextPosition[\s\S]*queueExploreListReplay\('geo'\)[\s\S]*setPosition\(nextPosition\)/)
    assert.match(exploreClient, /const queueExploreListReplay = useCallback\(\(reason: ExploreReplayReason\) =>/)
    assert.match(exploreClient, /if \(reason === 'geo'\) \{[\s\S]*const first4Ids = readLiveFirst4Ids\(\)[\s\S]*lastVisibleFirst4IdsRef\.current = first4Ids[\s\S]*\}/)
    assert.match(exploreClient, /pendingExploreReplayReasonsRef\.current\.add\(reason\)/)
    assert.match(exploreClient, /recordExploreReplayReasons\('queuedReasons', \[reason\]\)/)
    assert.match(exploreClient, /if \(mountSettledRef\.current\) terminalizeExploreListRef\.current\?\.\(\)/)
    assert.match(exploreClient, /function flushPendingExploreListReplay\(replay = replayExploreListRef\.current\)/)
    assert.match(exploreClient, /if \(!mountSettledRef\.current \|\| !pendingExploreReplayRef\.current\) return/)
    assert.match(exploreClient, /const reasons = \[\.\.\.pendingExploreReplayReasonsRef\.current\][\s\S]*pendingExploreReplayReasonsRef\.current\.clear\(\)[\s\S]*replay\?\.\(reasons\)/)
    assert.match(exploreClient, /function handleTagChange\(nextTag: \(typeof QUICK_TAGS\)\[number\]\)/)
    assert.match(exploreClient, /function handleDifficultyChange\(nextDifficulty: typeof difficulty\)/)
    assert.match(exploreClient, /function handleAltitudeBandChange\(nextAltitudeBand: typeof altitudeBand\)/)
    assert.match(exploreClient, /function handleLengthBandChange\(nextLengthBand: typeof lengthBand\)/)
    assert.match(exploreClient, /queueExploreListReplay\('tag'\)/)
    assert.match(exploreClient, /queueExploreListReplay\('advancedFilter'\)/)
    assert.match(exploreClient, /onChange=\{\(event\) => setSearch\(event\.target\.value\)\}/)
    assert.match(exploreClient, /const previousExploreResultKindRef = useRef<ExploreResultKind>\(exploreResultKind\)/)
    assert.match(exploreClient, /const searchChanged = previousSearchRef\.current !== search/)
    assert.match(exploreClient, /searchChanged[\s\S]*previousResultKind !== 'results'[\s\S]*exploreResultKind === 'results'[\s\S]*queueExploreListReplay\('search'\)/)
    assert.match(exploreClient, /searchChanged[\s\S]*previousResultKind === 'results'[\s\S]*exploreResultKind === 'results'[\s\S]*terminalizeExploreListRef\.current\?\.\(\)/)
    assert.doesNotMatch(exploreClient, /searchChanged[\s\S]{0,300}previousResultKind === 'results'[\s\S]{0,300}queueExploreListReplay\('search'\)/)

    assert.match(exploreClient, /const getLiveExploreListTargets = \(\) => \{/)
    assert.match(exploreClient, /const listSubheading = getScopedTargets\('\[data-explore-motion="list-subheading"\]'\)/)
    assert.match(exploreClient, /const firstScreenCards = getFirstScreenMountainCards\(\)/)
    assert.match(exploreClient, /const emptyState = getScopedTargets\('\[data-explore-list-empty\]'\)/)
    assert.match(exploreClient, /const updateLastVisibleFirst4Ids = \(\) => \{[\s\S]*lastVisibleFirst4IdsRef\.current = getFirstScreenMountainCards\(\)\.map\(getMountainCardId\)\.filter\(Boolean\)/)
    assert.match(exploreClient, /const setOutsideContext = \(targets: gsap\.TweenTarget, vars: gsap\.TweenVars\) => \{[\s\S]*_context\.ignore\(\(\) => \{[\s\S]*gsap\.set\(targets, vars\)/)
    assert.match(exploreClient, /exploreListReplayTimeline\?\.eventCallback\('onInterrupt', null\)[\s\S]*exploreListReplayTimeline\?\.kill\(\)/)
    assert.match(exploreClient, /exploreListReplayTimeline = null/)
    assert.match(exploreClient, /const stopMountMotionAndTerminalize = \(updateLastVisible = true\) => \{[\s\S]*mountTimelineRef\.current\?\.eventCallback\('onInterrupt', null\)[\s\S]*mountTimelineRef\.current\?\.kill\(\)[\s\S]*terminalizeExploreMotion\(updateLastVisible\)/)
    assert.match(exploreClient, /if \(mountTimelineRef\.current\) stopMountMotionAndTerminalize\(!isGeoOnlyReplay\)/)
    assert.match(exploreClient, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/)
    assert.match(exploreClient, /const isGeoOnlyReplay = reasons\.length > 0 && reasons\.every\(\(reason\) => reason === 'geo'\)/)
    assert.match(exploreClient, /if \(isGeoOnlyReplay\) \{[\s\S]*const previousFirst4Ids = lastVisibleFirst4IdsRef\.current[\s\S]*const newFirstScreenCards = currentCards\.filter[\s\S]*const reorderedFirstScreenCards = currentCards\.filter[\s\S]*const geoMotionTargets = \[\.\.\.newFirstScreenCards, \.\.\.reorderedFirstScreenCards\]/)
    assert.match(exploreClient, /setOutsideContext\(geoMotionTargets, \{ autoAlpha: 1, y: 10, scale: 0\.985/)
    assert.doesNotMatch(exploreClient, /gsap\.set\(geoMotionTargets, \{ autoAlpha: 0/)
    assert.doesNotMatch(exploreClient, /fromTo\(newFirstScreenCards, \{ autoAlpha: 0/)
    assert.match(exploreClient, /exploreListReplayTimeline\.fromTo\(replayTargets, \{ autoAlpha: 0, y: 18, scale: 0\.96 \}/)
    assert.match(exploreClient, /recordExploreReplayReasons\('firedReplayReasons', reasons\)/)
    assert.match(exploreClient, /const preserveQueuedFirst4 = pendingExploreReplayReasonsRef\.current\.has\('geo'\)[\s\S]*terminalizeExploreMotion\(!preserveQueuedFirst4\)[\s\S]*mountSettledRef\.current = true[\s\S]*flushPendingExploreListReplay\(runExploreListReplay\)/)
    assert.match(exploreClient, /stagger: \{ each: 0\.03, from: 'start' \}/)
    assert.match(exploreClient, /useLayoutEffect\(\(\) => \{[\s\S]*previousExploreResultKindRef[\s\S]*flushPendingExploreListReplay\(\)[\s\S]*\}, \[tag, difficulty, altitudeBand, lengthBand, position, filteredMountainSignature, search, exploreResultKind, queueExploreListReplay\]\)/)
    assert.doesNotMatch(exploreClient, /ONBOARDING_EVENT|getProvinceDraft|effectiveProvince/)
    assert.doesNotMatch(exploreClient, /replayTargets: \[[\s\S]{0,160}explore-filter-chip/)
    assert.doesNotMatch(exploreClient, /data-explore-motion="list-subheading"[\s\S]{0,240}className="explore-filter-scroll"/)
  })

  test('Phase 2-III 4-page client subset uses scoped Sprint A GSAP root template', () => {
    const clients = [
      ['archive', archiveClient, 'data-archive-motion-root'],
      ['profile', profileClient, 'data-profile-motion-root'],
      ['faq', faqClient, 'data-faq-motion-root'],
      ['activity', activityClient, 'data-activity-motion-root'],
    ] as const

    for (const [name, source, rootMarker] of clients) {
      assert.match(source, /import gsap from 'gsap'/, `${name} should import gsap`)
      assert.match(source, /import \{ useGSAP \} from '@gsap\/react'/, `${name} should import useGSAP`)
      assert.match(source, /gsap\.registerPlugin\(useGSAP(?:,[^)]*)?\)/, `${name} should register useGSAP`)
      assert.match(source, /useGSAP\(\(_context, contextSafe\) =>/, `${name} should use callback-first useGSAP`)
      assert.match(source, /scope: motionScopeRef/, `${name} should scope GSAP to page root`)
      assert.match(source, /dependencies: \[\]/, `${name} should keep mount-only dependencies`)
      assert.match(source, /gsap\.matchMedia\(\)/, `${name} should use matchMedia`)
      assert.match(source, /allowMotion: '\(prefers-reduced-motion: no-preference\)'/, `${name} should define allowMotion`)
      assert.match(source, /reduceMotion: '\(prefers-reduced-motion: reduce\)'/, `${name} should define reduceMotion`)
      assert.match(source, /mm\.revert\(\)/, `${name} should revert matchMedia`)
      assert.match(source, /clearProps: 'willChange,transform'/, `${name} should clear willChange and transform`)
      assert.match(source, new RegExp(rootMarker), `${name} should expose a motion evidence root`)
      assert.doesNotMatch(source, /\.from\(/, `${name} should not use bare gsap.from`)
      assert.doesNotMatch(source, /delay:/, `${name} should not use delay chains`)
      assert.doesNotMatch(source, /<0\.\d+/, `${name} should not use relative timeline offsets`)
    }
  })

  test('Phase 2-III archive/profile/faq/activity schedule labels and motion markers match the approved 4-page scope', () => {
    assert.match(archiveClient, /data-archive-motion="header"/)
    assert.match(archiveClient, /data-archive-motion="identity"/)
    assert.match(archiveClient, /data-archive-stat-value=\{kind\}/)
    assert.match(archiveClient, /data-archive-motion="filters"/)
    assert.match(archiveClient, /data-archive-trip-card=\{trip\.id\}/)
    assert.match(archiveClient, /data-archive-motion="year-divider"[\s\S]*data-archive-motion-mode="fade"/)
    assert.match(archiveClient, /const schedule = \{[\s\S]*header: 0,[\s\S]*identity: 0\.06,[\s\S]*filters: 0\.28,[\s\S]*timeline: 0\.34,[\s\S]*trips: 0\.38/)
    assert.match(archiveClient, /stagger: \{ each: 0\.03, from: 'start' \}/)

    assert.match(profileClient, /data-profile-motion="identity" data-profile-motion-mode="fade"/)
    assert.match(profileClient, /data-profile-motion="summary"/)
    assert.match(profileClient, /data-profile-summary-value=\{item\.label\}/)
    assert.match(profileClient, /data-profile-archive-card=\{trip\.checkinId\}/)
    assert.match(profileClient, /data-profile-share-row=\{share\.id\}/)
    assert.match(profileClient, /data-profile-motion="province"/)
    assert.match(profileClient, /data-profile-motion="support"/)
    assert.match(profileClient, /data-profile-motion="logout"/)
    assert.match(profileClient, /if \(queryRequestsLicenseSheet \|\| mediaContext\.conditions\?\.reduceMotion\)/)
    assert.match(profileClient, /const schedule = \{[\s\S]*identity: 0,[\s\S]*summary: 0\.1,[\s\S]*archive: 0\.26,[\s\S]*share: 0\.42,[\s\S]*province: 0\.58,[\s\S]*support: 0\.66,[\s\S]*logout: 0\.72/)
    assert.match(profileClient, /function SharePreviewSection/)
    assert.match(profileClient, /communityEnabled \? <SharePreviewSection shares=\{visibleShares\} currentUserId=\{identity\.userId\} \/> : null/)

    assert.match(faqClient, /data-faq-motion="header"/)
    assert.match(faqClient, /data-faq-motion="search"/)
    assert.match(faqClient, /data-faq-group-card=\{group\.id\}/)
    assert.match(faqClient, /data-faq-motion="footer"/)
    assert.match(faqClient, /if \(initialAnchor \|\| mediaContext\.conditions\?\.reduceMotion\)/)
    assert.match(faqClient, /const schedule = \{[\s\S]*header: 0,[\s\S]*search: 0\.1,[\s\S]*groups: 0\.22,[\s\S]*footer: 0\.58/)
    assert.match(faqClient, /stagger: \{ each: 0\.045, from: 'start' \}/)

    assert.match(activityClient, /data-activity-motion="hero-background" data-activity-motion-mode="fade"/)
    assert.match(activityClient, /data-activity-hero-text="copy"/)
    assert.match(activityClient, /data-activity-motion="memo-card"/)
    assert.match(activityClient, /data-activity-motion="summit-card"/)
    assert.match(activityClient, /data-activity-motion="key-data"/)
    assert.match(activityClient, /data-activity-motion="route-map" data-activity-motion-mode="fade"/)
    assert.match(activityClient, /data-activity-motion="route-snapshot" data-activity-motion-mode="fade"/)
    assert.match(activityClient, /data-activity-motion="photo-strip" data-activity-motion-mode="fade"/)
    assert.match(activityClient, /const schedule = \{[\s\S]*heroBackground: 0,[\s\S]*heroText: 0\.05,[\s\S]*memo: 0\.18,[\s\S]*summit: 0\.32,[\s\S]*keyData: 0\.42,[\s\S]*map: 0\.56,[\s\S]*routeSnapshot: 0\.64,[\s\S]*photoStrip: 0\.72/)
  })

  test('Phase 2-III archive filter replay is pre-paint, interrupt-safe, and removes the dead more button', () => {
    assert.doesNotMatch(archiveClient, /MoreIcon/)
    assert.doesNotMatch(archiveClient, /ariaLabel="更多"/)
    assert.doesNotMatch(archiveClient, /function ArchiveHeader/)
    assert.doesNotMatch(archiveClient, /ariaLabel="返回"/)
    assert.match(archiveClient, /function ArchiveContentHeading\(\)[\s\S]*data-archive-motion="header"[\s\S]*山行档案/)

    assert.match(archiveClient, /className="archive-filter-tab pt-pressable"/)
    assert.match(componentsCss, /\.archive-filter-tab:active/)
    assert.match(componentsCss, /\.archive-filter-tab\[data-pt-press-active='true'\]/)
    assert.match(archiveClient, /onPointerCancel=\{clearPressFallback\}/)
    assert.match(archiveClient, /onPointerLeave=\{clearPressFallback\}/)
    assert.match(archiveClient, /onBlur=\{clearPressFallback\}/)
    assert.match(componentsCss, /background-color var\(--motion-press\) var\(--ease-out\)/)
    assert.doesNotMatch(archiveClient, /pressedTab|setPressedTab/)

    assert.match(archiveClient, /import \{[\s\S]*useLayoutEffect,[\s\S]*useMemo,[\s\S]*useRef,[\s\S]*useState,[\s\S]*\} from 'react'/)
    assert.match(archiveClient, /function handleFilterChange\(nextFilter: FilterId\)/)
    assert.match(archiveClient, /if \(nextFilter === activeFilter\) return/)
    assert.match(archiveClient, /terminalizeArchiveListRef\.current\?\.\(\)/)
    assert.match(archiveClient, /pendingFilterReplayRef\.current = true/)
    assert.match(archiveClient, /useLayoutEffect\(\(\) => \{[\s\S]*pendingFilterReplayRef\.current[\s\S]*replayArchiveListRef\.current\?\.\(\)[\s\S]*rebuildArchiveScrollMotionRef\.current\?\.\(\)[\s\S]*\}, \[activeFilter, filteredTripSignature, expandedSignature\]\)/)

    assert.match(archiveClient, /const getLiveArchiveListTargets = \(\) => \{/)
    assert.match(archiveClient, /const yearDividers = getScopedTargets\('\[data-archive-motion="year-divider"\]'\)/)
    assert.match(archiveClient, /const tripCards = getScopedTargets\('\[data-archive-trip-card\]'\)/)
    assert.match(archiveClient, /firstScreenTripCards: tripCards\.slice\(0, 4\)/)
    assert.match(archiveClient, /archiveListReplayTimeline\?\.kill\(\)/)
    assert.match(archiveClient, /archiveListReplayTimeline = null/)
    assert.match(archiveClient, /terminalizeArchiveListMotion\(\)/)
    assert.match(archiveClient, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/)
    assert.match(archiveClient, /archiveListReplayTimeline\.fromTo\(yearDividers, \{ autoAlpha: 0 \}/)
    assert.match(archiveClient, /archiveListReplayTimeline\.fromTo\(firstScreenTripCards, \{ autoAlpha: 0, x: -14 \}/)
    assert.match(archiveClient, /stagger: \{ each: 0\.03, from: 'start' \}/)
    assert.match(archiveClient, /parseMotionTokenSeconds\(root, '--motion-enter', 320\)/)
    assert.match(archiveClient, /clearProps: 'willChange,transform'/)
  })

  test('FU-87 archive uses truthful activity time and rebuilds scroll motion after list commits', () => {
    assert.match(archiveClient, /activityAt: string/)
    assert.match(archiveClient, /groupTripsByYear[\s\S]*getYear\(trip\.activityAt\)/)
    assert.match(archiveClient, /aria-expanded=\{isExpanded\}/)
    assert.match(archiveClient, /aria-controls=\{contentId\}/)
    assert.match(archiveClient, /data-archive-motion="filter-empty"/)
    assert.match(archiveClient, /当前筛选下没有山行/)
    assert.match(archiveClient, /查看全部/)
    assert.match(archiveClient, /ScrollTrigger\.batch/)
    assert.match(archiveClient, /archiveBatchTriggersRef/)
    assert.match(archiveClient, /archiveProgressTriggerRef/)
    assert.match(archiveClient, /ScrollTrigger\.refresh\(\)/)
    assert.match(archiveClient, /Flip\.getState/)
    assert.match(archiveClient, /Flip\.from/)
    assert.match(archiveClient, /function getExpandedYearKey\(filterId: FilterId, year: string\)/)
    assert.match(archiveClient, /getExpandedYearKey\(activeFilter, group\.year\)/)
    assert.doesNotMatch(archiveClient, /setExpandedYears\(\{\}\)/)
    assert.match(archiveClient, /data-archive-trip-card=\{trip\.id\}[\s\S]*className="archive-trip-motion-shell"[\s\S]*data-archive-trip-surface=\{trip\.id\}/)
    assert.match(archiveClient, /data-archive-rim-owner=\{trip\.id\}/)
    assert.match(archiveClient, /data-archive-rim aria-hidden="true"/)
    assert.match(archiveClient, /data-archive-node-halo/)
    assert.match(archiveClient, /archiveNodePositionMapRef\.current\.entries\(\)/)
    assert.match(archiveClient, /classList\.toggle\('archive-timeline__node--lit'/)
    assert.match(archiveClient, /scrollHaloPlayedRef/)
    assert.match(archiveClient, /mountHaloPlayedRef/)
    assert.match(archiveClient, /archiveListReplayTimeline\.fromTo\(geometry\.basePath/)
    assert.match(archiveClient, /archiveListReplayTimeline\.fromTo\(firstScreenNodes/)
    assert.match(archiveClient, /data-archive-empty-cta=\{id\}/)
    assert.match(archiveClient, /<ArchiveEmptyAction key="find-mountain" id="find-mountain"/)
    assert.match(archiveClient, /<ArchiveEmptyAction key="bring-back" id="bring-back"/)
    assert.match(archiveClient, /getSilenceCopy[\s\S]*`· \$\{months\} 个月 ·`/)
    assert.match(archiveClient, /<strong>档案至此<\/strong>/)
    assert.match(archiveClient, /data-testid="archive-trip-media"[\s\S]*archive-trip__media-frame/)
    assert.match(archiveClient, /trip\.photoUrl \? <TripMedia/)
    assert.match(archiveClient, /archive-trip__content-altitude[\s\S]*data-testid="archive-trip-max-altitude-value"/)
    assert.match(componentsCss, /\.archive-rim \{[\s\S]*border: 1\.5px solid #6ee7a1;[\s\S]*0 0 26px 3px rgba\(110, 231, 161, 0\.5\)[\s\S]*pointer-events: none/)
    assert.match(componentsCss, /\.archive-trip-motion-shell/)
    assert.match(componentsCss, /\.archive-timeline__node--lit/)
    assert.match(componentsCss, /\.archive-node-halo/)
    assert.match(componentsCss, /body:has\(\.archive-reinvention\)\s*\{[\s\S]*?overflow-x:\s*clip/)
    assert.match(archiveClient, /className="archive-reinvention"[\s\S]*?--archive-app-header-height/)
    assert.doesNotMatch(componentsCss, /\.archive-trip__media--placeholder/)
    assert.doesNotMatch(archiveClient, /\.from\(/)
    assert.doesNotMatch(archiveClient, /delay:/)
    assert.doesNotMatch(archiveClient, /<0\.\d+/)
  })

  test('Phase 2-III transform-unsafe elements are excluded or fade-only and list keys remain stable', () => {
    assert.match(archiveClient, /visibleTrips\.map\(\(trip, index\) => \(\s*<TimelineTrip[\s\S]*key=\{trip\.id\}/m)
    assert.match(archiveClient, /yearGroups\.map\(\(group, groupIndex\) => \(\s*<ArchiveYearSection[\s\S]*key=\{group\.year\}/m)
    assert.doesNotMatch(archiveClient, /data-testid="archive-trip-media"[\s\S]{0,160}data-archive-(motion|trip-card)/)
    assert.doesNotMatch(archiveClient, /data-archive-motion="filters"[\s\S]{0,900}scale: 0\.(9|8)/)

    assert.match(profileClient, /trips\.slice\(0, 3\)/)
    assert.match(profileClient, /shares\.slice\(0, 3\)/)
    assert.match(profileClient, /key=\{trip\.checkinId\}/)
    assert.match(profileClient, /key=\{share\.id\}/)
    assert.match(profileClient, /key=\{row\.label\}/)
    assert.doesNotMatch(profileClient, /profile-avatar-shell[\s\S]{0,120}data-profile-motion/)
    assert.doesNotMatch(profileClient, /profile-nickname-success-toast[\s\S]{0,160}data-profile-motion/)

    assert.match(faqClient, /FAQ_GROUPS\.map\(\(group\) => \(\s*<FAQGroupCard\s+key=\{group\.id\}/m)
    assert.match(faqClient, /key=\{question\.anchor\}/)
    assert.match(faqClient, /key=\{result\.anchor\}/)
    assert.doesNotMatch(faqClient, /data-testid="faq-search-input"[\s\S]{0,180}data-faq-motion/)
    assert.doesNotMatch(faqClient, /contactEmail[\s\S]{0,500}data-faq-(motion|group-card)/)

    assert.match(activityClient, /key=\{cell\.label\}/)
    assert.match(activityClient, /key=\{photo\.id\}/)
    assert.match(activityClient, /key=\{`\$\{photo\.id\}-thumb`\}/)
    assert.doesNotMatch(activityClient, /className="act-actions"[\s\S]{0,160}data-activity-motion/)
    assert.doesNotMatch(activityClient, /ActivityTopBar[\s\S]{0,180}data-activity-motion/)
    assert.doesNotMatch(activityClient, /querySelector(?:All)?\([^)]*(canvas|MapLibre|PmtilesSnapshotMap|act-actions|act-lightbox)/)
  })

  test('Phase 2-III count-up reuses the Mountain formatter without changing Mountain terminal formatting', () => {
    assert.match(mountainDetailClient, /import \{ formatMotionCountValue, formatMotionInteger as formatInteger, parseMotionTokenSeconds \} from '@\/lib\/motion-count-format'/)
    assert.match(mountainDetailClient, /formatMotionCountValue\(countState\.value, valueNode\.dataset\.countFormat, finalText\)/)
    assert.match(mountainDetailClient, /valueNode\.textContent = finalText/)
    assert.match(motionCountHelper, /export function formatMotionInteger\(value: number \| null \| undefined\)/)
    assert.match(motionCountHelper, /return String\(Math\.round\(value\)\)/)
    assert.match(motionCountHelper, /format === 'duration'/)
    assert.match(archiveClient, /import \{ formatMotionCountValue, parseMotionTokenSeconds \} from '@\/lib\/motion-count-format'/)
    assert.match(profileClient, /import \{ formatMotionCountValue, parseMotionTokenSeconds, type MotionCountFormat \} from '@\/lib\/motion-count-format'/)
    assert.match(activityClient, /import \{ formatMotionCountValue, parseMotionTokenSeconds, type MotionCountFormat \} from '@\/lib\/motion-count-format'/)
    assert.doesNotMatch(archiveClient, /function formatMotionCountValue/)
    assert.doesNotMatch(profileClient, /function formatMotionCountValue/)
    assert.doesNotMatch(activityClient, /function formatMotionCountValue/)
  })

  test('FU-111 global press system is tokenized, consolidated, and avoids transform target conflicts', () => {
    const fu111Sources = [
      exploreClient,
      exploreMountainCard,
      mountainDetailClient,
      shareClient,
      imprintClient,
      archiveClient,
      profileClient,
      tabBar,
      trekClient,
      importClient,
      screenshotClient,
      activityClient,
      faqClient,
      checkinButton,
    ].join('\n')

    assert.match(globalsCss, /\.pt-pressable,[\s\S]*\.pt-pressable-card,[\s\S]*\.pt-pressable-hero/)
    assert.match(globalsCss, /\.pt-pressable-hero__icon/)
    assert.match(globalsCss, /\[data-pt-press-active='true'\]/)
    assert.match(globalsCss, /transform var\(--motion-press\) var\(--ease-standard\)/)
    assert.match(globalsCss, /\.pt-pressable:active[\s\S]*transform: scale\(0\.97\)/)
    assert.match(globalsCss, /\.pt-pressable-card:active[\s\S]*transform: scale\(0\.985\)/)
    assert.match(globalsCss, /\.pt-pressable-hero:active[\s\S]*transform: scale\(0\.98\)/)
    assert.match(globalsCss, /\.pt-pathway-press \{[\s\S]*transition:[\s\S]*transform var\(--motion-fast\) var\(--ease-emphasis\)[\s\S]*filter var\(--motion-fast\) var\(--ease-out\)[\s\S]*border-color var\(--motion-fast\) var\(--ease-out\)/)
    assert.match(globalsCss, /\.pt-pathway-press::after \{[\s\S]*border-radius: inherit;[\s\S]*opacity: 0;[\s\S]*box-shadow:[\s\S]*transition: opacity var\(--motion-fast\) var\(--ease-out\)/)
    assert.match(globalsCss, /\.pt-pathway-press:active[\s\S]*transform: scale\(\.975\)/)
    assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.pt-pathway-press,[\s\S]*\.pt-pathway-press::after,[\s\S]*transition: none !important/)
    assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.pt-pathway-press:active[\s\S]*transform: none/)
    assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.pt-pathway-press:active[\s\S]*::after[\s\S]*opacity: 0 !important/)
    assert.match(globalsCss, /\.ui-chip:active[\s\S]*transform: scale\(0\.97\)/)
    assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.pt-pressable:active[\s\S]*transform: none/)
    assert.doesNotMatch(globalsCss, /transition:\s*all/)

    assert.match(globalsCss, /\.pixel-btn:active,[\s\S]*\.primary-btn:active[\s\S]*transform: scale\(0\.97\)/)
    assert.match(globalsCss, /\.secondary-btn:active[\s\S]*transform: scale\(0\.97\)/)
    assert.match(globalsCss, /\.ui-btn-root:active:not[\s\S]*transform: scale\(0\.97\)/)
    assert.match(globalsCss, /\.ui-icon-btn-root:active:not[\s\S]*transform: scale\(0\.97\)/)

    assert.doesNotMatch(fu111Sources, /pt-explore-press-target|pt-mountain-press-target|share-editor-pressable|pt-archive-filter-tab|data-archive-press-active/)
    assert.doesNotMatch(imprintClient, /\.imprint-cta:active|\.imprint-source-option:active/)
    assert.match(shareClient, /data-testid="share-share-button"[\s\S]{0,140}className="pt-pressable-hero"/)
    assert.match(shareClient, /className="pt-pressable-card"[\s\S]{0,240}data-template-thumb=\{template\}/)
    assert.match(exploreClient, /<button[\s\S]{0,220}data-explore-pathway-card=\{title\}[\s\S]{0,160}data-explore-pathway-button=\{title\}[\s\S]{0,120}className="pt-pathway-press explore-scene-panel__action"/)
    assert.doesNotMatch(exploreClient, /className="pt-pressable-hero"/)

    assert.match(exploreMountainCard, /<Link[\s\S]*data-testid="explore-mountain-card"[\s\S]*style=\{\{ textDecoration: 'none', display: 'block' \}\}/)
    assert.doesNotMatch(exploreMountainCard, /<Link[\s\S]{0,260}pt-pressable/)
    assert.match(exploreMountainCard, /<article[\s\S]{0,160}className="surface-card explore-card pt-pressable-card"/)

    assert.match(tabBar, /className="flex flex-col items-center gap-1\.5 pt-tab-link pt-pressable"/)
    assert.match(globalsCss, /\.pt-tab-link\.pt-pressable:active[\s\S]*transform: none/)
    assert.match(globalsCss, /\.pt-tab-link:active \.pt-tab-icon[\s\S]*transform: scale\(0\.94\)/)

    assert.match(fu111Sources, /function markPressFallback\(event: PointerEvent<HTMLElement>\)/)
    assert.match(fu111Sources, /function clearPressFallback\(event: PressFallbackEvent\)/)
    assert.match(fu111Sources, /onPointerCancel=\{clearPressFallback\}/)
    assert.match(fu111Sources, /onPointerLeave=\{clearPressFallback\}/)
    assert.match(fu111Sources, /onBlur=\{clearPressFallback\}/)

    assert.doesNotMatch(tabBar, /<nav[\s\S]{0,260}pt-pressable/)
    assert.doesNotMatch(activityClient, /<section className="act-actions"[\s\S]{0,180}pt-pressable/)
    assert.doesNotMatch(trekClient, /function BottomActionBar[\s\S]{0,520}pt-pressable/)
  })

	  test('FU-112 community entries are withdrawn through a reversible feature flag', () => {
    assert.match(featureFlags, /COMMUNITY_ENABLED: false/)
    assert.match(featureFlags, /仅隐藏用户可见入口，保留 routes \/ code \/ data/)
    assert.match(tabBar, /\{ href: '\/community', label: '山友圈', icon: TabIcons\.community \}/)
    assert.match(tabBar, /tab\.href !== '\/community' \|\| isFeatureEnabled\('COMMUNITY_ENABLED'\)/)
    assert.match(profilePage, /communityEnabled\s*\n\s*\? listUserCommunityPosts/)
    assert.match(profilePage, /communityEnabled\s*\n\s*\? myPosts\.map/)
    assert.match(profileClient, /const communityEnabled = isFeatureEnabled\('COMMUNITY_ENABLED'\)/)
    assert.match(activityClient, /isFeatureEnabled\('COMMUNITY_ENABLED'\) && activity\.mountain\.id !== null && activity\.hasMeaningfulActivityData/)
    assert.match(mountainPage, /isFeatureEnabled\('COMMUNITY_ENABLED'\)[\s\S]*\? await loadFeaturedPosts\(supabase, mountain\.id\)[\s\S]*: \[\]/)
    assert.match(mountainDetailClient, /communityEnabled && featuredPosts\.length > 0 \? <FeaturedSection posts=\{featuredPosts\} \/> : null/)
    assert.match(faqContent, /export const BASE_FAQ_GROUPS: FaqGroup\[\]/)
    assert.match(faqContent, /export const COMMUNITY_FAQ_ANCHORS = new Set/)
    assert.match(faqContent, /'review\.community-eligibility'/)
    assert.match(faqContent, /FAQ_GROUPS: FaqGroup\[\] = BASE_FAQ_GROUPS\.map/)
    assert.match(faqContent, /TRACK_PRIVACY_NON_COMMUNITY_ANSWER/)
    assert.match(onboardingCarousel, /communityEnabled \? '山友圈' : '分享图'/)
    assert.match(archiveClient, /isFeatureEnabled\('COMMUNITY_ENABLED'\)[\s\S]*\? '想发到山友圈时再发 · Peak Trekker 不会替你声张。'[\s\S]*: '想分享时再分享 · Peak Trekker 不会替你声张。'/)
    assert.match(toastRegistry, /communityEnabled \? '头像已更新，个人主页和山友圈会同步展示。' : '头像已更新，个人主页会同步展示。'/)
    assert.match(profileAvatarUploader, /isFeatureEnabled\('COMMUNITY_ENABLED'\)[\s\S]*\? '头像更新成功，个人主页和山友圈会同步刷新。'[\s\S]*: '头像更新成功，个人主页会同步刷新。'/)
	  })

  test('FU-76 Phase 3 consolidates reachable EmptyState structures without dropping hooks or copy', () => {
    assert.match(emptyState, /export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & \{/)
    assert.match(emptyState, /icon\?: ReactNode/)
    assert.match(emptyState, /eyebrow\?: ReactNode/)
    assert.match(emptyState, /actions\?: ReactNode \| ReactNode\[\]/)
    assert.match(emptyState, /footnote\?: ReactNode/)
    assert.match(emptyState, /<div\s*\{\.\.\.rest\}/)
    assert.match(emptyState, /className=\{joinClassNames\('pt-empty-state', `pt-empty-state--\$\{size\}`, className\)\}/)
    assert.match(globalsCss, /\.pt-empty-state \{[\s\S]*display: grid;[\s\S]*justify-items: center;[\s\S]*text-align: center/)
    assert.match(globalsCss, /\.pt-empty-state__icon \{[\s\S]*width: var\(--pt-empty-state-icon-size\);[\s\S]*border-radius: var\(--pt-empty-state-icon-radius\)/)
    assert.match(globalsCss, /\.pt-empty-state--surface \{[\s\S]*border: 1px solid var\(--color-outline\);[\s\S]*background: var\(--color-surface-variant\)/)

    assert.match(mountainDetailClient, /import EmptyState from '@\/components\/ui\/EmptyState'/)
    assert.doesNotMatch(mountainDetailClient, /function EmptyModuleCard/)
    assert.match(mountainDetailClient, /<EmptyState[\s\S]*data-mountain-route-card[\s\S]*title="路线参考图暂时不可用"[\s\S]*copy="地图服务没有响应，你仍可以查看关键点位与海拔信息。"/)

    assert.match(faqClient, /import EmptyState from '@\/components\/ui\/EmptyState'/)
    assert.match(faqClient, /<EmptyState[\s\S]{0,120}data-testid="faq-search-empty"[\s\S]{0,120}icon=\{<SearchIcon size=\{22\} \/>\}[\s\S]*title="没有找到"[\s\S]*提交反馈/)
    assert.match(faqClient, /试试别的说法。[\s\S]*或者直接告诉我们,这个问题应该写进来。/)

    assert.match(exploreClient, /import EmptyState from '@\/components\/ui\/EmptyState'/)
    assert.doesNotMatch(exploreClient, /import Card from '@\/components\/ui\/Card'/)
    assert.match(exploreClient, /<EmptyState[\s\S]{0,160}data-explore-list-empty[\s\S]*title="没有找到匹配的山峰"[\s\S]*copy="试试切换标签或清空高级筛选条件。"/)

    assert.match(profileClient, /import EmptyState from '@\/components\/ui\/EmptyState'/)
    assert.match(profileClient, /<EmptyState[\s\S]{0,180}title="还没有一次山行"[\s\S]*copy=\{null\}[\s\S]*href="\/explore"[\s\S]*从找一座山开始 →/)

    assert.match(archiveClient, /import EmptyState from '@\/components\/ui\/EmptyState'/)
    assert.match(archiveClient, /<EmptyState[\s\S]{0,120}data-archive-motion="empty-state"[\s\S]{0,140}eyebrow="0 \/ 0"[\s\S]*title="档案还没有一次山行"/)
    assert.match(archiveClient, /去一次真实的山，[\s\S]*回来把它放进这里。/)
    assert.match(archiveClient, /<ArchiveEmptyAction key="find-mountain" id="find-mountain"[\s\S]*<PrimaryButton[\s\S]*去找一座山[\s\S]*<ArchiveEmptyAction key="bring-back" id="bring-back"[\s\S]*<SecondaryButton[\s\S]*把以前的山行带回来/)
    assert.match(archiveClient, /data-archive-motion="empty-copy"[\s\S]*档案只保存[\s\S]*privacyCopy/)
    assert.match(archiveClient, /isFeatureEnabled\('COMMUNITY_ENABLED'\)[\s\S]*\? '想发到山友圈时再发 · Peak Trekker 不会替你声张。'[\s\S]*: '想分享时再分享 · Peak Trekker 不会替你声张。'/)
  })

  test('FU-118 gives the true Archive empty state one pre-hidden Profile-style entrance without timeline geometry', () => {
    const emptyMotionBranch = archiveClient.match(
      /const isTrueEmpty = Boolean\(motionMap\.get\('empty-state'\)\)([\s\S]*?)\n\s*const baseDuration/,
    )?.[1] ?? ''

    assert.match(emptyMotionBranch, /if \(isTrueEmpty\) \{/)
    assert.match(emptyMotionBranch, /const emptyMotionTargets = \[header, identity, emptyState, \.\.\.emptyActions, emptyCopy, footer\]\.filter/)
    assert.match(emptyMotionBranch, /gsap\.set\(emptyMotionTargets, \{ autoAlpha: 0 \}\)/)
    assert.match(emptyMotionBranch, /gsap\.set\(emptyMotionTargets, \{ autoAlpha: 0 \}\)\s*root\.removeAttribute\('data-archive-empty-motion-pending'\)/)
    assert.match(emptyMotionBranch, /rebuildArchiveScrollMotionRef\.current = \(\) => \{\}/)
    assert.match(emptyMotionBranch, /Math\.min\(parseMotionTokenSeconds\(root, '--motion-base', 240\), 0\.2\)/)
    assert.match(emptyMotionBranch, /Math\.min\(parseMotionTokenSeconds\(root, '--motion-enter', 320\), 0\.24\)/)
    assert.match(emptyMotionBranch, /gsap\.timeline\(\{[\s\S]*onComplete: terminalizeArchiveMotion,[\s\S]*onInterrupt: terminalizeArchiveMotion/)
    assert.match(emptyMotionBranch, /fromTo\(emptyState, \{ autoAlpha: 0, y: 16, scale: 0\.96 \}, \{[\s\S]*ease: 'back\.out\(1\.3\)'/)
    assert.match(emptyMotionBranch, /fromTo\(emptyActions, \{ autoAlpha: 0, y: 8 \}, \{[\s\S]*stagger: \{ each: 0\.035, from: 'start' \}/)
    assert.match(emptyMotionBranch, /return \(\) => \{ emptyTimeline\.kill\(\); terminalizeArchiveMotion\(\) \}/)
    assert.doesNotMatch(emptyMotionBranch, /syncTimelineGeometry|ScrollTrigger/)
    assert.match(archiveClient, /data-archive-empty-motion-pending=\{hasTrips \? undefined : ''\}/)
    assert.match(archiveClient, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*\[data-archive-empty-motion-pending\][\s\S]*opacity: 0;[\s\S]*visibility: hidden;/)
    assert.match(archiveClient, /if \(mediaContext\.conditions\?\.reduceMotion\) \{\s*root\.removeAttribute\('data-archive-empty-motion-pending'\)\s*terminalizeArchiveMotion\(\)/)
  })

  test('FU-76 Phase 3 consolidates spinners and skeletons with reduced-motion static states', () => {
    assert.match(spinner, /export type SpinnerProps = \{[\s\S]*size: number \| string[\s\S]*color\?: string/)
    assert.match(spinner, /className="pt-spinner"/)
    assert.match(skeleton, /export type SkeletonProps = \{[\s\S]*width\?: number \| string[\s\S]*height: number \| string[\s\S]*radius\?: number \| string/)
    assert.match(skeleton, /className=\{joinClassNames\('pt-skeleton', className\)\}/)
    assert.match(globalsCss, /\.pt-spinner \{[\s\S]*animation: pt-spin 900ms linear infinite/)
    assert.match(globalsCss, /@keyframes pt-spin/)
    assert.match(globalsCss, /\.pt-skeleton \{[\s\S]*animation: pt-shimmer 1\.4s ease-in-out infinite/)
    assert.match(globalsCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.pt-spinner \{[\s\S]*animation: none !important;[\s\S]*\.pt-skeleton \{[\s\S]*animation: none !important;[\s\S]*background: color-mix/)

    assert.match(importClient, /import Spinner from '@\/components\/ui\/Spinner'/)
    assert.match(importClient, /<Spinner size=\{44\} \/>/)
    assert.doesNotMatch(importClient, /import-spin|className="import-spinner"|@keyframes import-spin/)

    assert.match(screenshotClient, /import Spinner from '@\/components\/ui\/Spinner'/)
    assert.match(screenshotClient, /<Spinner size=\{34\} \/>/)
    assert.doesNotMatch(screenshotClient, /function Spinner\(\)|data-sr-submit-spinner|@keyframes sr-spin/)
    assert.match(screenshotClient, /sr-pulse 1\.4s ease-in-out infinite/)

    assert.match(trekClient, /import Skeleton from '@\/components\/ui\/Skeleton'/)
    assert.match(trekClient, /<Skeleton height=\{60\} radius=\{10\} \/>/)
    assert.match(trekClient, /<Skeleton height=\{160\} radius=\{14\} \/>/)
    assert.doesNotMatch(trekClient, /function SkeletonRow|className="pt-shimmer"|@keyframes pt-shimmer/)

    assert.match(weatherSection, /import Skeleton from '@\/components\/ui\/Skeleton'/)
    assert.match(weatherSection, /<Skeleton width=\{44\} height=\{44\} radius="var\(--radius-md\)" \/>/)
    assert.doesNotMatch(weatherSection, /mountain-weather__skeleton/)
    assert.doesNotMatch(componentsCss, /mountain-weather-pulse|mountain-weather__skeleton/)

    assert.match(profileNicknameSheet, /import PrimaryButton from '@\/components\/ui\/PrimaryButton'/)
    assert.match(profileNicknameSheet, /<PrimaryButton[\s\S]*data-testid="profile-nickname-save"[\s\S]*loading=\{saving\}[\s\S]*\{saving \? '保存中' : serverError \? '重试' : '保存'\}/)
    assert.doesNotMatch(profileNicknameSheet, /function Spinner\(\)|pt-nickname-spinner|pt-nickname-spin/)
  })

  test('FU-76 Phase 3 token cleanup keeps allowed exceptions explicit', () => {
    assert.match(helpTrigger, /filter var\(--motion-press\) var\(--ease-standard\), background var\(--motion-press\) var\(--ease-standard\)/)
    assert.match(helpSheet, /transition: 'opacity var\(--motion-fast\) var\(--ease-standard\)'/)
    assert.match(shareClient, /transition: 'opacity var\(--motion-fast\) var\(--ease-standard\)'/)
    assert.match(importClient, /transition: 'width var\(--motion-fast\) var\(--ease-standard\)'/)
    assert.match(mountainDetailClient, /transition: 'width var\(--motion-fast\) var\(--ease-standard\), background var\(--motion-fast\) var\(--ease-standard\)'/)
    assert.match(faqClient, /transition: 'transform var\(--motion-fast\) var\(--ease-standard\)'/)
    assert.match(faqClient, /Deliberate exception: deep-link highlight needs a slow fade/)
    assert.match(faqClient, /transition: 'background-color 1500ms ease-out'/)
    assert.match(screenshotClient, /transition: 'background var\(--motion-fast\) var\(--ease-standard\)'/)
    assert.match(screenshotCalibration, /transition: 'opacity var\(--motion-status\) var\(--ease-standard\)'/)
    assert.match(screenshotCalibration, /transition: 'opacity var\(--motion-status\) var\(--ease-standard\), filter var\(--motion-status\) var\(--ease-standard\)'/)
    assert.match(screenshotCalibration, /transition: 'r var\(--motion-press\) var\(--ease-standard\), opacity var\(--motion-press\) var\(--ease-standard\), filter var\(--motion-fast\) var\(--ease-standard\)'/)
    assert.match(onboardingCarousel, /transition: reducedMotion \? 'none' : 'transform var\(--motion-enter\) var\(--ease-out\)'/)
    assert.match(onboardingCarousel, /width var\(--motion-enter\) var\(--ease-standard\), background-color var\(--motion-enter\) var\(--ease-standard\)/)
    assert.doesNotMatch([
      helpTrigger,
      helpSheet,
      importClient,
      mountainDetailClient,
      faqClient,
      screenshotClient,
      screenshotCalibration,
      onboardingCarousel,
      profileNicknameSheet,
      globalsCss,
    ].join('\n'), /transition:\s*['"`]?all/)
    assert.match(mountainHeroCarousel, /transition: 'width 0\.18s ease, background-color 0\.18s ease'/)
  })

  test('Phase 2-II motion helpers do not animate layout properties', () => {
    const motionOnly = [
      mountainDetailClient,
      exploreClient,
    ].map((source) => source
      .split('\n')
      .filter((line) => /gsap\.|timeline\.|fromTo|\.to\(|\.set\(|willChange|data-(mountain|explore)-motion|pt-(mountain|explore)-press/.test(line))
      .join('\n')).join('\n')

    for (const property of ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding']) {
      assert.doesNotMatch(motionOnly, new RegExp(`${property}\\s*:`), `Phase 2-II motion helper should not animate ${property}`)
    }
  })

	  test('stroke dash animation is limited to the ScanGlyph whitelist', () => {
	    assert.doesNotMatch(importClient, /strokeDash(offset|array)/)
	    assert.doesNotMatch(shareClient, /data-scan-draw/)
	    assert.match(screenshotClient, /data-scan-draw/)
	    const strokeAnimationLines = screenshotClient
	      .split('\n')
	      .filter((line) => /strokeDash(offset|array)/.test(line) || /data-scan-draw/.test(line))
	      .join('\n')
	    assert.match(strokeAnimationLines, /data-scan-draw/)
	    assert.match(strokeAnimationLines, /strokeDashoffset/)
	  })

  test('import success next actions do not expose fake or internal roadmap UI', () => {
    assert.doesNotMatch(importClient, /补照片/)
    assert.doesNotMatch(importClient, /写一句话/)
    assert.doesNotMatch(importClient, /后续批次|batch|接入/)
    assert.doesNotMatch(importClient, /data-import-success-next="info"/)
    assert.match(importClient, /label="生成分享"/)
    assert.match(importClient, /label="查看活动"/)
  })

  test('share back uses deterministic targets before history fallback', () => {
    assert.match(shareClient, /function handleShareBack\(\)/)
    assert.match(shareClient, /params\.get\('from'\) === 'imprint'[\s\S]*router\.replace\(buildImprintSourceUrl\(selectedTemplate\)\)/)
    assert.match(shareClient, /if \(checkinId\) \{[\s\S]*router\.replace\(`\/activity\/\$\{checkinId\}`\)/)
    assert.match(shareClient, /window\.history\.length > 1[\s\S]*router\.back\(\)/)
    assert.match(shareClient, /router\.replace\('\/explore'\)/)
  })

})
