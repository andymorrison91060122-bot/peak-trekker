import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  buildShareTrackPreview,
  buildShareTrackPreviewFromScreenshotRouteShape,
  buildShareTrackRender,
  SHARE_TRACK_CONTENT_FIT,
  SHARE_TRACK_RENDER_PROFILES,
  type ShareTrackPreview,
  type ShareTrackPreviewPoint,
} from '../../src/lib/share-track-preview.ts'

const OUTPUT_DIR = '/Users/liuhongyuan/Desktop/peak-trekker/output/fu100-route-display-normalization'
const GPS_ACTIVITY_TRACE_PROFILE = {
  lineWidth: 3,
  glowWidth: 0,
  glowOpacity: 0,
  startRadius: 6,
  startStrokeWidth: 2,
  endRadius: 6,
}

type ScreenshotRouteShapeFixture = {
  schemaVersion: 1
  kind: 'screenshot_route_shape'
  coordinateSpace: 'normalized_screenshot'
  source: 'user_seeded_livewire'
  image: { width: number; height: number }
  controlPoints: Array<{ id: string; x: number; y: number }>
  segments: Array<{
    id: string
    fromId: string
    toId: string
    resolution: 'snapped' | 'user_confirmed_shape' | 'accepted_gap'
    points: Array<{ x: number; y: number }>
  }>
  createdAt: string
}

function makeShape(
  image: { width: number; height: number },
  points: Array<{ x: number; y: number }>,
): ScreenshotRouteShapeFixture {
  return {
    schemaVersion: 1,
    kind: 'screenshot_route_shape',
    coordinateSpace: 'normalized_screenshot',
    source: 'user_seeded_livewire',
    image,
    controlPoints: points.map((point, index) => ({ id: `p-${index}`, ...point })),
    segments: [{
      id: 'seg-main',
      fromId: 'p-0',
      toId: `p-${points.length - 1}`,
      resolution: 'snapped',
      points,
    }],
    createdAt: '2026-06-15T00:00:00.000Z',
  }
}

function samplePreviewPoints(points: ShareTrackPreviewPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points
  if (maxPoints <= 2) return [points[0]!, points.at(-1)!]
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round((index * (points.length - 1)) / (maxPoints - 1))
    return points[sourceIndex]!
  })
}

function legacyScreenshotPreview(shape: ScreenshotRouteShapeFixture, maxPointsPerSegment = 96): ShareTrackPreview | null {
  const safeWidth = Math.max(1, shape.image.width)
  const safeHeight = Math.max(1, shape.image.height)
  const maxDimension = Math.max(safeWidth, safeHeight)
  const xOffset = (maxDimension - safeWidth) / 2
  const yOffset = (maxDimension - safeHeight) / 2
  const segments = shape.segments.flatMap((segment) => {
    if (segment.resolution === 'accepted_gap' || segment.points.length < 2) return []
    const projected = segment.points.map((point) => ({
      x: (xOffset + Math.max(0, Math.min(1, point.x)) * safeWidth) / maxDimension,
      y: (yOffset + Math.max(0, Math.min(1, point.y)) * safeHeight) / maxDimension,
    }))
    const sampled = samplePreviewPoints(projected, Math.max(2, Math.floor(maxPointsPerSegment)))
    return sampled.length >= 2 ? [sampled] : []
  })
  if (!segments.length) return null
  return {
    points: segments.flat(),
    segments,
    pointCount: segments.reduce((sum, segment) => sum + segment.length, 0),
    hasAltitude: false,
  }
}

function routeSvg(route: ReturnType<typeof buildShareTrackRender>, width: number, height: number, color = '#22c55e') {
  if (!route) return ''
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <rect width="${width}" height="${height}" fill="rgba(255,255,255,.02)" />
      ${route.d ? `<path data-real-track="true" d="${route.d}" stroke="${color}" stroke-width="${route.glowWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${route.glowOpacity}" />` : ''}
      ${route.d ? `<path data-real-track="true" d="${route.d}" stroke="${color}" stroke-width="${route.lineWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".96" />` : ''}
      <circle cx="${route.start.x}" cy="${route.start.y}" r="${route.startRadius}" fill="#121416" stroke="${color}" stroke-width="${route.startStrokeWidth}" />
      ${route.d ? `<circle cx="${route.end.x}" cy="${route.end.y}" r="${route.endRadius}" fill="${color}" />` : ''}
    </svg>
  `
}

function fillMetrics(route: ReturnType<typeof buildShareTrackRender>, frame: { width: number; height: number; padding: number }) {
  const innerWidth = frame.width - frame.padding * 2
  const innerHeight = frame.height - frame.padding * 2
  return {
    projectedWidth: route?.bounds.width ?? 0,
    projectedHeight: route?.bounds.height ?? 0,
    widthFill: route ? Number((route.bounds.width / innerWidth).toFixed(4)) : 0,
    heightFill: route ? Number((route.bounds.height / innerHeight).toFixed(4)) : 0,
    bounds: route?.bounds ?? null,
  }
}

function renderWeightMetrics(route: ReturnType<typeof buildShareTrackRender>) {
  return route
    ? {
      lineWidth: route.lineWidth,
      glowWidth: route.glowWidth,
      glowOpacity: route.glowOpacity,
      startRadius: route.startRadius,
      startStrokeWidth: route.startStrokeWidth,
      endRadius: route.endRadius,
    }
    : null
}

test('FU-100 fixture surfaces render screenshot routes with route-only bbox fit', async ({ page }) => {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await page.setViewportSize({ width: 375, height: 812 })

  const longShape = makeShape(
    { width: 640, height: 4096 },
    [
      { x: 0.28, y: 0.045 },
      { x: 0.34, y: 0.052 },
      { x: 0.43, y: 0.064 },
      { x: 0.55, y: 0.072 },
      { x: 0.64, y: 0.085 },
    ],
  )
  const tinyShape = makeShape(
    { width: 640, height: 4096 },
    [
      { x: 0.5, y: 0.5 },
      { x: 0.5000001, y: 0.50000008 },
    ],
  )
  const activityFrame = { width: 343, height: 343, padding: 42, ...SHARE_TRACK_CONTENT_FIT }
  const shareFrame = { x: 32, y: 44, width: 216, height: 290, padding: 24, ...SHARE_TRACK_CONTENT_FIT }
  const medallionFrame = { x: 35, y: 35, width: 118, height: 118, padding: 14, ...SHARE_TRACK_CONTENT_FIT }
  const posterFrame = { x: 240, y: 120, width: 720, height: 800, padding: 96, ...SHARE_TRACK_CONTENT_FIT }
  const gpsFrame = { width: 343, height: 343, padding: 42 }

  const longPreview = buildShareTrackPreviewFromScreenshotRouteShape(longShape, 240)
  const oldLongPreview = legacyScreenshotPreview(longShape, 240)
  const tinyPreview = buildShareTrackPreviewFromScreenshotRouteShape(tinyShape, 240)
  const gpsPreview = buildShareTrackPreview([
    { lat: 34.483, lng: 110.083, altitude: 460 },
    { lat: 34.491, lng: 110.095, altitude: 820 },
    { lat: 34.503, lng: 110.112, altitude: 1410 },
    { lat: 34.512, lng: 110.124, altitude: 1990 },
  ])

  const oldActivity = buildShareTrackRender(oldLongPreview, activityFrame, SHARE_TRACK_RENDER_PROFILES.activityCard)
  const newActivity = buildShareTrackRender(longPreview, activityFrame, SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard)
  const tinyActivity = buildShareTrackRender(tinyPreview, activityFrame, SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard)
  const shareRoute = buildShareTrackRender(longPreview, shareFrame, SHARE_TRACK_RENDER_PROFILES.shareEditorHero)
  const medallionRoute = buildShareTrackRender(longPreview, medallionFrame, SHARE_TRACK_RENDER_PROFILES.archiveMedallion)
  const posterRoute = buildShareTrackRender(longPreview, posterFrame, SHARE_TRACK_RENDER_PROFILES.posterTrail({ lineWidth: 8, glow: 10 }))
  const gpsRoute = buildShareTrackRender(gpsPreview, gpsFrame, GPS_ACTIVITY_TRACE_PROFILE)

  const metrics = {
    fixture: {
      image: longShape.image,
      note: '640x4096 route occupies the top of the source image but should fill fixed display frames by route bbox.',
    },
    oldActivity: fillMetrics(oldActivity, activityFrame),
    newActivity: fillMetrics(newActivity, activityFrame),
    tinyActivity: fillMetrics(tinyActivity, activityFrame),
    shareEditor: fillMetrics(shareRoute, { width: shareFrame.width, height: shareFrame.height, padding: shareFrame.padding }),
    archiveMedallion: fillMetrics(medallionRoute, { width: medallionFrame.width, height: medallionFrame.height, padding: medallionFrame.padding }),
    posterTrail: fillMetrics(posterRoute, { width: posterFrame.width, height: posterFrame.height, padding: posterFrame.padding }),
    renderWeights: {
      oldActivity: renderWeightMetrics(oldActivity),
      newActivity: renderWeightMetrics(newActivity),
      tinyActivity: renderWeightMetrics(tinyActivity),
      gpsControl: renderWeightMetrics(gpsRoute),
      shareEditor: renderWeightMetrics(shareRoute),
      archiveMedallion: renderWeightMetrics(medallionRoute),
      posterTrail: renderWeightMetrics(posterRoute),
    },
  }
  await writeFile(join(OUTPUT_DIR, 'route-fit-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`)

  expect(metrics.oldActivity.widthFill).toBeLessThan(0.35)
  expect(metrics.newActivity.widthFill).toBeGreaterThan(0.9)
  expect(metrics.newActivity.heightFill).toBeGreaterThan(0.6)
  expect(metrics.tinyActivity.widthFill).toBeLessThan(0.03)
  expect(metrics.tinyActivity.heightFill).toBeLessThan(0.03)
  expect(metrics.renderWeights.oldActivity?.lineWidth).toBe(8)
  expect(metrics.renderWeights.newActivity?.lineWidth).toBeLessThanOrEqual(4)
  expect(metrics.renderWeights.newActivity?.startRadius).toBeLessThanOrEqual(8)
  expect(metrics.renderWeights.newActivity?.endRadius).toBeLessThanOrEqual(8)
  expect(metrics.renderWeights.gpsControl?.lineWidth).toBe(3)
  expect(metrics.renderWeights.gpsControl?.startRadius).toBe(6)
  expect(metrics.renderWeights.gpsControl?.endRadius).toBe(6)

  await page.setContent(`
    <html>
      <head>
        <style>
          body { margin: 0; padding: 16px; width: 375px; box-sizing: border-box; background: #08090a; color: #f5f7f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .surface { margin: 0 0 18px; border: 1px solid #2f353b; border-radius: 14px; overflow: hidden; background: #121416; }
          .label { padding: 9px 12px; font-size: 12px; color: #9ca3af; border-bottom: 1px solid #2f353b; }
          .activity-card { width: 343px; height: 343px; background: radial-gradient(circle at 34% 26%, rgba(34,197,94,.12), transparent 34%), #121416; }
          .activity-card svg { width: 343px; height: 343px; display: block; }
          .compare-stack { display: grid; gap: 12px; padding: 0; }
          .compare-caption { padding: 8px 12px 0; font-size: 11px; color: #c7ced4; }
          .medallion { width: 188px; height: 188px; margin: 0 auto; position: relative; }
          .medallion svg { width: 188px; height: 188px; display: block; }
          .share { width: 280px; height: 498px; margin: 0 auto; background: linear-gradient(180deg, #23272c, #121416); }
          .share svg { width: 280px; height: 498px; display: block; }
          .poster { width: 343px; height: 610px; background: linear-gradient(180deg, #1a1f24, #0f1113); transform-origin: top left; }
          .poster svg { width: 343px; height: 610px; display: block; }
          .calibration { width: 140px; height: 720px; margin: 0 auto; background: #111417; }
        </style>
      </head>
      <body>
        <section class="surface" data-surface="activity-compare">
          <div class="label">Activity screenshot before / after / GPS weight comparison</div>
          <div class="compare-stack">
            <div><div class="compare-caption">Before baseline: old activityCard weight</div><div class="activity-card">${routeSvg(oldActivity, 343, 343)}</div></div>
            <div><div class="compare-caption">After R1: activityScreenshotCard weight</div><div class="activity-card">${routeSvg(newActivity, 343, 343)}</div></div>
            <div><div class="compare-caption">GPS TraceOverlay target: line 3 / marker r6</div><div class="activity-card">${routeSvg(gpsRoute, 343, 343, '#22c55e')}</div></div>
          </div>
        </section>
        <section class="surface" data-surface="activity-long"><div class="label">Activity 1:1 route-only bbox fit</div><div class="activity-card">${routeSvg(newActivity, 343, 343)}</div></section>
        <section class="surface" data-surface="archive-medallion"><div class="label">Success medallion fixed route symbol</div><div class="medallion">${routeSvg(medallionRoute, 188, 188)}</div></section>
        <section class="surface" data-surface="share-editor"><div class="label">Share editor TrailPath</div><div class="share">${routeSvg(shareRoute, 280, 498)}</div></section>
        <section class="surface" data-surface="poster"><div class="label">Share render / poster TrailSvg</div><div class="poster">${routeSvg(posterRoute, 1080, 1920)}</div></section>
        <section class="surface" data-surface="tiny-negative"><div class="label">Near-degenerate negative fixture</div><div class="activity-card">${routeSvg(tinyActivity, 343, 343, '#6ee7a1')}</div></section>
        <section class="surface" data-surface="gps-control"><div class="label">GPS preview control path</div><div class="activity-card">${routeSvg(gpsRoute, 343, 343, '#22c55e')}</div></section>
        <section class="surface" data-surface="calibration-original-ratio"><div class="label">Calibration editor keeps original screenshot ratio</div><svg class="calibration" viewBox="0 0 640 4096"><rect width="640" height="4096" fill="#111417"/><rect x="0" y="0" width="640" height="430" fill="#1d2224"/><polyline points="${longShape.segments[0]!.points.map((point) => `${point.x * longShape.image.width},${point.y * longShape.image.height}`).join(' ')}" stroke="#22c55e" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></section>
      </body>
    </html>
  `)

  for (const [surface, file] of [
    ['activity-compare', 'activity-card-before-after-gps-375.png'],
    ['activity-long', 'activity-card-long-route-375.png'],
    ['archive-medallion', 'success-medallion-route-375.png'],
    ['share-editor', 'share-editor-route-375.png'],
    ['poster', 'share-render-poster-route-375.png'],
    ['tiny-negative', 'tiny-degenerate-negative-375.png'],
    ['gps-control', 'gps-activity-control-375.png'],
    ['calibration-original-ratio', 'calibration-original-ratio-375.png'],
  ] as const) {
    await page.locator(`[data-surface="${surface}"]`).screenshot({ path: join(OUTPUT_DIR, file) })
  }
  await page.screenshot({ path: join(OUTPUT_DIR, 'fu100-all-surfaces-375.png'), fullPage: true })
})
