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
    assert.match(exploreClient, /data-explore-pathway-card=\{title\}/)
    assert.match(exploreClient, /getScopedTargets\('\[data-testid="explore-mountain-card"\]'\)\.slice\(0, 4\)/)
    assert.match(exploreClient, /card\.dataset\.exploreMotionParticipation = 'first-screen'/)
    assert.match(exploreClient, /const schedule = \{[\s\S]*shell: 0,[\s\S]*header: 0\.04,[\s\S]*search: 0\.12,[\s\S]*pathways: 0\.22,[\s\S]*pathwayCards: 0\.26,[\s\S]*listHeading: 0\.34,[\s\S]*firstCards: 0\.38/)
    assert.match(exploreClient, /addMotion\('header', 'header', schedule\.header/)
    assert.match(exploreClient, /addMotion\('search', 'search', schedule\.search/)
    assert.match(exploreClient, /addMotion\('pathways', 'pathways', schedule\.pathways/)
    assert.match(exploreClient, /addMotion\('list-heading', 'listHeading', schedule\.listHeading/)
    assert.match(exploreClient, /timeline\.addLabel\('firstCards', schedule\.firstCards\)/)
    assert.match(exploreClient, /timeline\.fromTo\(firstScreenCards, \{ autoAlpha: 0, y: 18, scale: 0\.96 \}/)
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
