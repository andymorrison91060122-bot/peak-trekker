import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
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

describe('FU-76 motion nodes Phase 2-I import and screenshot ceremonies', () => {
  const importClient = readSource('../src/app/(flow)/import/ImportClient.tsx')
  const screenshotClient = readSource('../src/app/(flow)/screenshot/ScreenshotClient.tsx')
  const shareClient = readSource('../src/app/(flow)/share/ShareClient.tsx')
  const mountainDetailClient = readSource('../src/app/(flow)/mountain/[id]/MountainDetailClient.tsx')
  const exploreClient = readSource('../src/app/(main)/explore/ExploreClient.tsx')
  const archiveClient = readSource('../src/app/(flow)/archive/ArchiveClient.tsx')
  const profileClient = readSource('../src/components/profile/ProfileV2Client.tsx')
  const faqClient = readSource('../src/app/(flow)/faq/FAQClient.tsx')
  const activityClient = readSource('../src/app/(flow)/activity/[id]/ActivityDetailClient.tsx')
  const motionCountHelper = readSource('../src/lib/motion-count-format.ts')

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
    assert.match(importClient, /className="pt-import-l3-cta"/)
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
    assert.match(screenshotClient, /className="pt-screenshot-recognition-cta"/)
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
    assert.match(mountainDetailClient, /className="pt-mountain-press-target"/)
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
    assert.match(exploreClient, /data-explore-motion="header"/)
    assert.match(exploreClient, /data-explore-motion="search"/)
    assert.match(exploreClient, /data-explore-motion="pathways"/)
    assert.match(exploreClient, /data-explore-motion="list-heading"/)
    assert.match(exploreClient, /data-explore-motion="list-subheading"/)
    assert.match(exploreClient, /data-explore-list-empty/)
    assert.match(exploreClient, /data-explore-pathway-card=\{title\}/)
    assert.match(exploreClient, /getScopedTargets\('\[data-testid="explore-mountain-card"\]'\)\.slice\(0, 4\)/)
    assert.match(exploreClient, /card\.dataset\.exploreMotionParticipation = 'first-screen'/)
    assert.match(exploreClient, /const schedule = \{[\s\S]*shell: 0,[\s\S]*header: 0\.04,[\s\S]*search: 0\.12,[\s\S]*pathways: 0\.22,[\s\S]*pathwayCards: 0\.26,[\s\S]*listHeading: 0\.3,[\s\S]*quickTags: 0\.34,[\s\S]*listSubheading: 0\.4,[\s\S]*firstCards: 0\.45/)
    assert.match(exploreClient, /addMotion\('header', 'header', schedule\.header/)
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
    assert.match(exploreClient, /filtered\.map\(\(\{ mountain \}\) => \(\s*<ExploreMountainCard key=\{mountain\.id\} mountain=\{mountain\} \/>/m)
    assert.match(exploreClient, /pt-explore-press-target:active/)
    assert.match(exploreClient, /\[data-testid="explore-mountain-card"\]:active/)
  })

  test('FU-110 explore source-change replay is pre-paint, live-query, and interrupt-safe', () => {
    assert.match(exploreClient, /import \{ useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState/)
    assert.match(exploreClient, /const replayExploreListRef = useRef<\(\(reasons: ExploreReplayReason\[\]\) => void\) \| null>\(null\)/)
    assert.match(exploreClient, /const terminalizeExploreListRef = useRef<\(\(\) => void\) \| null>\(null\)/)
    assert.match(exploreClient, /const pendingExploreReplayRef = useRef\(false\)/)
    assert.match(exploreClient, /type ExploreReplayReason = 'geo' \| 'tag' \| 'province' \| 'advancedFilter'/)
    assert.match(exploreClient, /const pendingExploreReplayReasonsRef = useRef<Set<ExploreReplayReason>>\(new Set\(\)\)/)
    assert.match(exploreClient, /const mountSettledRef = useRef\(false\)/)
    assert.match(exploreClient, /const draftProvinceInitialSyncDoneRef = useRef\(false\)/)
    assert.match(exploreClient, /const draftProvinceRef = useRef<string \| null>\(hometownProvince\)/)
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
    assert.match(exploreClient, /const previousProvince = draftProvinceRef\.current[\s\S]*const isInitialSync = !draftProvinceInitialSyncDoneRef\.current[\s\S]*if \(previousProvince === nextProvince\) return[\s\S]*if \(!isInitialSync && hometownProvince === null\) queueExploreListReplay\('province'\)/)
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
    assert.match(exploreClient, /useLayoutEffect\(\(\) => \{[\s\S]*flushPendingExploreListReplay\(\)[\s\S]*\}, \[tag, effectiveProvince, difficulty, altitudeBand, lengthBand, position, filteredMountainSignature\]\)/)
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
      assert.match(source, /gsap\.registerPlugin\(useGSAP\)/, `${name} should register useGSAP`)
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
    assert.match(archiveClient, /data-archive-stat-value=\{motionKind\}/)
    assert.match(archiveClient, /data-archive-motion="filters"/)
    assert.match(archiveClient, /data-archive-trip-card=\{trip\.id\}/)
    assert.match(archiveClient, /data-archive-motion="year-divider"[\s\S]*data-archive-motion-mode="fade"/)
    assert.match(archiveClient, /const schedule = \{[\s\S]*header: 0,[\s\S]*identity: 0\.08,[\s\S]*stats: 0\.18,[\s\S]*filters: 0\.3,[\s\S]*trips: 0\.38/)
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
    assert.match(archiveClient, /gridTemplateColumns: '44px minmax\(0, 1fr\) 44px'/)
    assert.match(archiveClient, /<div aria-hidden="true" \/>/)

    assert.match(archiveClient, /className="pt-archive-filter-tab"/)
    assert.match(archiveClient, /\.pt-archive-filter-tab:active/)
    assert.match(archiveClient, /data-archive-press-active="true"/)
    assert.match(archiveClient, /onPointerCancel=\{\(event\) => \{[\s\S]*delete event\.currentTarget\.dataset\.archivePressActive/)
    assert.match(archiveClient, /onPointerLeave=\{\(event\) => \{[\s\S]*delete event\.currentTarget\.dataset\.archivePressActive/)
    assert.match(archiveClient, /onMouseLeave=\{\(event\) => \{[\s\S]*delete event\.currentTarget\.dataset\.archivePressActive/)
    assert.match(archiveClient, /onBlur=\{\(event\) => \{[\s\S]*delete event\.currentTarget\.dataset\.archivePressActive/)
    assert.match(archiveClient, /background var\(--motion-press\) var\(--ease-out\)/)
    assert.match(archiveClient, /border-color var\(--motion-press\) var\(--ease-out\)/)
    assert.match(archiveClient, /box-shadow var\(--motion-press\) var\(--ease-out\)/)
    assert.doesNotMatch(archiveClient, /pressedTab|setPressedTab/)

    assert.match(archiveClient, /import \{ useLayoutEffect, useMemo, useRef, useState/)
    assert.match(archiveClient, /function handleFilterChange\(nextFilter: FilterId\)/)
    assert.match(archiveClient, /if \(nextFilter === activeFilter\) return/)
    assert.match(archiveClient, /terminalizeArchiveListRef\.current\?\.\(\)/)
    assert.match(archiveClient, /pendingFilterReplayRef\.current = true/)
    assert.match(archiveClient, /useLayoutEffect\(\(\) => \{[\s\S]*pendingFilterReplayRef\.current[\s\S]*replayArchiveListRef\.current\?\.\(\)[\s\S]*\}, \[activeFilter, filteredTripSignature\]\)/)

    assert.match(archiveClient, /const getLiveArchiveListTargets = \(\) => \{/)
    assert.match(archiveClient, /const yearDividers = getScopedTargets\('\[data-archive-motion="year-divider"\]'\)/)
    assert.match(archiveClient, /const tripCards = getScopedTargets\('\[data-archive-trip-card\]'\)/)
    assert.match(archiveClient, /firstScreenTripCards: tripCards\.slice\(0, 4\)/)
    assert.match(archiveClient, /archiveListReplayTimeline\?\.kill\(\)/)
    assert.match(archiveClient, /archiveListReplayTimeline = null/)
    assert.match(archiveClient, /terminalizeArchiveListMotion\(\)/)
    assert.match(archiveClient, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/)
    assert.match(archiveClient, /archiveListReplayTimeline\.fromTo\(yearDividers, \{ autoAlpha: 0 \}/)
    assert.match(archiveClient, /archiveListReplayTimeline\.fromTo\(firstScreenTripCards, \{ autoAlpha: 0, y: 16, scale: 0\.96 \}/)
    assert.match(archiveClient, /stagger: \{ each: 0\.03, from: 'start' \}/)
    assert.match(archiveClient, /parseMotionTokenSeconds\(root, '--motion-enter', 320\)/)
    assert.match(archiveClient, /clearProps: 'willChange,transform'/)
  })

  test('Phase 2-III transform-unsafe elements are excluded or fade-only and list keys remain stable', () => {
    assert.match(archiveClient, /group\.trips\.map\(\(trip\) => \(\s*<TripCard key=\{trip\.id\}/m)
    assert.match(archiveClient, /yearGroups\.map\(\(group\) => \(\s*<section key=\{group\.year\}>/m)
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
    assert.match(archiveClient, /import \{ formatMotionCountValue, parseMotionTokenSeconds, type MotionCountFormat \} from '@\/lib\/motion-count-format'/)
    assert.match(profileClient, /import \{ formatMotionCountValue, parseMotionTokenSeconds, type MotionCountFormat \} from '@\/lib\/motion-count-format'/)
    assert.match(activityClient, /import \{ formatMotionCountValue, parseMotionTokenSeconds, type MotionCountFormat \} from '@\/lib\/motion-count-format'/)
    assert.doesNotMatch(archiveClient, /function formatMotionCountValue/)
    assert.doesNotMatch(profileClient, /function formatMotionCountValue/)
    assert.doesNotMatch(activityClient, /function formatMotionCountValue/)
  })

  test('Phase 2-III 4-page subset does not add a motion island or expand to cut pages', () => {
    const changed = execSync('git diff --name-only && git ls-files --others --exclude-standard', {
      encoding: 'utf8',
    }).trim().split(/\n/u).filter(Boolean)
    assert.equal(changed.includes('src/app/(flow)/template.tsx'), false)
    assert.equal(changed.includes('src/app/(main)/template.tsx'), false)
    assert.equal(changed.some((file) => /PageSweepEntrance/.test(file)), false)
    assert.equal(changed.some((file) => file.includes('/prep/')), false)
    assert.equal(changed.some((file) => file.includes('/rankings/')), false)
    assert.equal(changed.some((file) => file.includes('/community/')), false)
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

  test('motion nodes patch stays out of excluded product areas', () => {
    const changed = execSync('git diff --name-only && git ls-files --others --exclude-standard', {
      encoding: 'utf8',
    }).trim().split(/\n/u).filter(Boolean)
    const forbidden = [
      /^src\/app\/\(flow\)\/community\//,
      /^src\/app\/admin\//,
      /^src\/app\/auth\//,
      /^src\/app\/debug\//,
      /^src\/app\/\(flow\)\/imprint\//,
      /^src\/app\/\(flow\)\/trek\/TrekClient\.tsx$/,
    ]
    const allowedShareFiles = new Set(['src/app/(flow)/share/ShareClient.tsx'])
    for (const file of changed) {
      if (file.startsWith('src/app/(flow)/share/') && !allowedShareFiles.has(file)) {
        assert.fail(`${file} should stay out of excluded share areas`)
      }
      assert.equal(forbidden.some((pattern) => pattern.test(file)), false, `${file} should stay out of excluded areas`)
    }
  })
})
