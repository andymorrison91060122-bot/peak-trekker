'use client'

import { useCallback, useMemo, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { ActivityDetailViewModel, ActivityTrackPointViewModel } from '@/app/(flow)/activity/[id]/ActivityDetailClient'
import PmtilesSnapshotMap from '@/components/map/PmtilesSnapshotMap'
import {
  getMountainPmtilesAsset,
  type MapTileAsset,
} from '@/lib/map/map-assets'
import {
  buildShareTrackPreviewFromScreenshotRouteShape,
  buildShareTrackRender,
  SHARE_TRACK_CONTENT_FIT,
  SHARE_TRACK_RENDER_PROFILES,
} from '@/lib/share-track-preview'
import { createGeoTraceProjector, evaluateTrackBboxEnvelope } from '@/lib/geo-trace-projector'
import { isScreenshotRecognitionSource } from '@/lib/trek-utils'

type ProjectedPoint = {
  x: number
  y: number
  altitude: number | null
  time: string | null
}

type ProjectedTrace = {
  d: string | null
  points: ProjectedPoint[]
  start: ProjectedPoint
  end: ProjectedPoint
  summit: ProjectedPoint
}

const routeNumberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const TRACE_FRAME = { width: 343, height: 343, padding: 38 }
const ACTIVITY_LAYER_PREFIX = 'fu47b-activity-route'
const SCREENSHOT_ROUTE_COLOR = '#76e8a8'

function formatRouteTime(value: string | null) {
  if (!value) return '--:--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDistance(value: number) {
  if (value <= 0) return '--'
  return `${value.toFixed(value >= 10 ? 0 : 1)} km`
}

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '--'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}

function formatAltitude(value: number) {
  if (value <= 0) return '--'
  return `${routeNumberFormatter.format(Math.round(value))} m`
}

function isValidTrackPoint(point: ActivityTrackPointViewModel) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180 &&
    !(point.lat === 0 && point.lng === 0)
  )
}

function sampleTrackPoints(points: ActivityTrackPointViewModel[], maxPoints = 96) {
  if (points.length <= maxPoints) return points
  const step = Math.max(1, Math.ceil(points.length / maxPoints))
  const sampled = points.filter((_, index) => index % step === 0)
  const lastPoint = points.at(-1)!
  return sampled.at(-1) === lastPoint ? sampled : [...sampled, lastPoint]
}

function getGeoTracePoints(points: ActivityTrackPointViewModel[]) {
  return sampleTrackPoints(points.filter(isValidTrackPoint))
}

function getSummitTrackPoint(points: ActivityTrackPointViewModel[]) {
  return points.reduce<ActivityTrackPointViewModel | null>((best, point) => {
    if (point.altitude === null) return best
    if (!best || best.altitude === null || point.altitude > best.altitude) return point
    return best
  }, null) ?? points[Math.floor(points.length * 0.58)] ?? points.at(-1) ?? null
}

function addOrReplaceGeoJsonSource(map: MapLibreMap, id: string, data: GeoJSON.GeoJSON) {
  if (map.getSource(id)) {
    const source = map.getSource(id) as { setData?: (nextData: GeoJSON.GeoJSON) => void }
    source.setData?.(data)
    return
  }
  map.addSource(id, {
    type: 'geojson',
    data,
  })
}

function removeLayerIfPresent(map: MapLibreMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id)
}

function addLayerIfMissing(map: MapLibreMap, layer: Parameters<MapLibreMap['addLayer']>[0]) {
  if (!map.getLayer(layer.id)) map.addLayer(layer)
}

function addActivityGeoJsonLayers(map: MapLibreMap, rawPoints: ActivityTrackPointViewModel[]) {
  const points = getGeoTracePoints(rawPoints)
  if (!points.length) return
  const summit = getSummitTrackPoint(points)
  const start = points[0] ?? null
  const end = points.at(-1) ?? null
  const markerFeatures = [
    start ? { point: start, label: '起', tone: 'start' } : null,
    summit ? { point: summit, label: `山顶 · ${formatRouteTime(summit.time)}`, tone: 'summit' } : null,
    end ? { point: end, label: '回营', tone: 'end' } : null,
  ].filter((feature): feature is { point: ActivityTrackPointViewModel; label: string; tone: string } => Boolean(feature))

  ;[
    `${ACTIVITY_LAYER_PREFIX}-marker-labels`,
    `${ACTIVITY_LAYER_PREFIX}-markers`,
    `${ACTIVITY_LAYER_PREFIX}-line`,
  ].forEach((layerId) => removeLayerIfPresent(map, layerId))

  if (points.length >= 2) {
    addOrReplaceGeoJsonSource(map, `${ACTIVITY_LAYER_PREFIX}-line-source`, {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points.map((point) => [point.lng, point.lat]),
      },
      properties: {},
    })
  }
  addOrReplaceGeoJsonSource(map, `${ACTIVITY_LAYER_PREFIX}-markers-source`, {
    type: 'FeatureCollection',
    features: markerFeatures.map((feature) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [feature.point.lng, feature.point.lat],
      },
      properties: {
        label: feature.label,
        tone: feature.tone,
      },
    })),
  })

  if (points.length >= 2) {
    addLayerIfMissing(map, {
      id: `${ACTIVITY_LAYER_PREFIX}-line`,
      type: 'line',
      source: `${ACTIVITY_LAYER_PREFIX}-line-source`,
      paint: {
        'line-color': '#7ef0b4',
        'line-width': 3.2,
        'line-opacity': 0.94,
      },
    })
  }
  addLayerIfMissing(map, {
    id: `${ACTIVITY_LAYER_PREFIX}-markers`,
    type: 'circle',
    source: `${ACTIVITY_LAYER_PREFIX}-markers-source`,
    paint: {
      'circle-radius': ['case', ['==', ['get', 'tone'], 'summit'], 7, 5.5],
      'circle-color': ['case', ['==', ['get', 'tone'], 'summit'], '#7ef0b4', ['==', ['get', 'tone'], 'start'], '#d7dde2', '#59c48c'],
      'circle-stroke-color': '#07130f',
      'circle-stroke-width': 1.7,
    },
  })
  addLayerIfMissing(map, {
    id: `${ACTIVITY_LAYER_PREFIX}-marker-labels`,
    type: 'symbol',
    source: `${ACTIVITY_LAYER_PREFIX}-markers-source`,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.15],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#eef7f1',
      'text-halo-color': '#07130f',
      'text-halo-width': 1.4,
    },
  })
}

function buildProjectedTrace(rawPoints: ActivityTrackPointViewModel[]): ProjectedTrace | null {
  const points = sampleTrackPoints(rawPoints.filter(isValidTrackPoint))
  if (!points.length) return null

  const projector = createGeoTraceProjector(points, TRACE_FRAME)
  const projected = projector.projectPoints(points)
  const start = projected[0]!
  const end = projected.at(-1)!
  const summit =
    projected.reduce<ProjectedPoint | null>((best, point) => {
      if (point.altitude === null) return best
      if (!best || best.altitude === null || point.altitude > best.altitude) return point
      return best
    }, null) ?? projected[Math.floor(projected.length * 0.58)] ?? end

  return {
    points: projected,
    start,
    end,
    summit,
    d: projected.length > 1
      ? projected.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
      : null,
  }
}

function TraceOverlay({
  trace,
  summitTime,
  noMap = false,
}: {
  trace: ProjectedTrace | null
  summitTime: string | null
  noMap?: boolean
}) {
  const fallbackTrace = trace ?? {
    d: 'M 38 300 Q 88 278 126 252 T 196 186 T 212 150 L 220 158 Q 238 206 282 300',
    start: { x: 38, y: 300, altitude: null, time: null },
    end: { x: 282, y: 300, altitude: null, time: null },
    summit: { x: 212, y: 150, altitude: null, time: summitTime },
    points: [],
  }

  return (
    <svg
      className="act-route__svg"
      viewBox="0 0 343 343"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="act-route-trace" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-success)" />
        </linearGradient>
        <radialGradient id="act-route-no-map-bg" cx="58%" cy="38%" r="60%">
          <stop offset="0%" stopColor="var(--color-surface-elevated)" />
          <stop offset="100%" stopColor="var(--color-surface)" />
        </radialGradient>
      </defs>
      {noMap ? (
        <>
          <rect width="343" height="343" fill="url(#act-route-no-map-bg)" />
          {Array.from({ length: 7 }, (_, index) => (
            <ellipse
              key={index}
              cx="200"
              cy="140"
              rx={28 + index * 22}
              ry={16 + index * 12}
              stroke={`rgba(141,149,155,${0.28 - index * 0.025})`}
              strokeWidth="1"
              fill="none"
            />
          ))}
        </>
      ) : null}
      {fallbackTrace.d ? (
        <path
          className="act-route__trace"
          d={fallbackTrace.d}
          stroke="url(#act-route-trace)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <circle cx={fallbackTrace.start.x} cy={fallbackTrace.start.y} r="6" className="act-route__marker-start" />
      <text x={fallbackTrace.start.x + 10} y={fallbackTrace.start.y + 4} className="act-route__marker-label">
        起
      </text>
      <circle cx={fallbackTrace.end.x} cy={fallbackTrace.end.y} r="6" className="act-route__marker-end" />
      <text x={fallbackTrace.end.x - 28} y={fallbackTrace.end.y + 4} className="act-route__marker-label">
        回营
      </text>
      <path
        d={`M ${fallbackTrace.summit.x - 8} ${fallbackTrace.summit.y + 4} L ${fallbackTrace.summit.x} ${fallbackTrace.summit.y - 14} L ${fallbackTrace.summit.x + 8} ${fallbackTrace.summit.y + 4} Z`}
        className="act-route__summit-triangle"
      />
      <circle cx={fallbackTrace.summit.x} cy={fallbackTrace.summit.y} r="11" className="act-route__summit-ring" />
      <text
        x={Math.min(250, Math.max(16, fallbackTrace.summit.x - 28))}
        y={Math.max(18, fallbackTrace.summit.y - 28)}
        className="act-route__summit-label"
      >
        山顶 · {formatRouteTime(fallbackTrace.summit.time ?? summitTime)}
      </text>
    </svg>
  )
}

function MapChrome({ noMap = false }: { noMap?: boolean }) {
  return (
    <>
      <div className="act-route__status-chip">完成轨迹</div>
      {noMap ? (
        <div
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 2,
            padding: '8px 10px',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-surface) 78%, transparent)',
            border: '1px solid var(--color-outline)',
            color: 'var(--color-on-surface-variant)',
            backdropFilter: 'blur(10px)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          仅可预览轨迹
        </div>
      ) : null}
    </>
  )
}

function StatStrip({ activity }: { activity: ActivityDetailViewModel }) {
  const stats = [
    { label: '总距离', value: formatDistance(activity.metrics.distanceKm) },
    { label: '用时', value: formatDuration(activity.metrics.durationSeconds) },
    { label: '最高点', value: formatAltitude(activity.metrics.maxAltitudeM), accent: true },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: '1px solid var(--color-outline)' }}>
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          style={{
            padding: '12px 10px',
            textAlign: 'center',
            borderRight: index === stats.length - 1 ? 'none' : '1px solid var(--color-outline)',
            minWidth: 0,
          }}
        >
          <div
            style={{
              color: stat.accent ? 'var(--color-success)' : 'var(--color-on-surface)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {stat.value}
          </div>
          <div style={{ marginTop: 3, color: 'var(--color-on-surface-variant)', fontSize: 10, lineHeight: 1.25 }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScreenshotRouteShapeCard({ activity }: { activity: ActivityDetailViewModel }) {
  const shape = activity.screenshotRouteShape
  const frameSize = 343
  const preview = useMemo(() => buildShareTrackPreviewFromScreenshotRouteShape(shape, 240), [shape])
  const route = useMemo(() => buildShareTrackRender(preview, {
    x: 0,
    y: 0,
    width: frameSize,
    height: frameSize,
    padding: 42,
    ...SHARE_TRACK_CONTENT_FIT,
  }, SHARE_TRACK_RENDER_PROFILES.activityScreenshotCard), [preview])

  if (!shape) return null

  return (
    <div
      data-route-source="screenshot-shape"
      role="img"
      aria-label="截图校准路线"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        minHeight: 260,
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 34% 26%, color-mix(in srgb, var(--color-success) 12%, transparent), transparent 34%), var(--color-surface)',
      }}
    >
      <svg
        viewBox={`0 0 ${frameSize} ${frameSize}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <rect width={frameSize} height={frameSize} fill="rgba(255,255,255,.018)" />
        {route?.d ? (
          <>
            <path
              data-real-track="true"
              d={route.d}
              fill="none"
              stroke={SCREENSHOT_ROUTE_COLOR}
              strokeWidth={route.glowWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={route.glowOpacity}
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-real-track="true"
              d={route.d}
              fill="none"
              stroke={SCREENSHOT_ROUTE_COLOR}
              strokeWidth={route.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.96"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        {route ? (
          <circle
            data-real-track={route.d ? undefined : 'single-point'}
            cx={route.start.x}
            cy={route.start.y}
            r={route.startRadius}
            fill="var(--color-surface)"
            stroke={SCREENSHOT_ROUTE_COLOR}
            strokeWidth={route.startStrokeWidth}
          />
        ) : null}
        {route?.d ? <circle cx={route.end.x} cy={route.end.y} r={route.endRadius} fill={SCREENSHOT_ROUTE_COLOR} /> : null}
      </svg>
    </div>
  )
}

function ScreenshotTextOnlyRouteCard() {
  return (
    <div
      data-route-source="screenshot-text-only"
      role="img"
      aria-label="未校准路线"
      style={{
        minHeight: 260,
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-5)',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface-variant)',
        textAlign: 'center',
      }}
    >
      <div>
        <div style={{ color: 'var(--color-on-surface)', fontWeight: 700, fontSize: 'var(--font-title-s-size)' }}>
          仅保存了文字数据
        </div>
        <div style={{ marginTop: 6, fontSize: 'var(--font-label-m-size)', lineHeight: 1.5 }}>
          这次截图没有校准路线，活动不显示猜测路线。
        </div>
      </div>
    </div>
  )
}

function NoMapTraceCard({ trace, summitTime }: { trace: ProjectedTrace | null; summitTime: string | null }) {
  return (
    <div
      className="act-route__map-placeholder"
      role="img"
      aria-label="轨迹预览卡片"
      style={{ height: 'auto', aspectRatio: '1 / 1', background: 'var(--color-surface)' }}
    >
      <TraceOverlay trace={trace} summitTime={summitTime} noMap />
      <MapChrome noMap />
    </div>
  )
}

function MapTraceCard({
  asset,
  rawPoints,
  forceError,
  onError,
}: {
  asset: MapTileAsset
  rawPoints: ActivityTrackPointViewModel[]
  forceError: boolean
  onError: (error: Error) => void
}) {
  const handleMapReady = useCallback((map: MapLibreMap) => {
    addActivityGeoJsonLayers(map, rawPoints)
  }, [rawPoints])

  return (
    <PmtilesSnapshotMap
      asset={asset}
      ariaLabel="这次活动走过的路线静态快照"
      forceError={forceError}
      onMapReady={handleMapReady}
      onError={onError}
    >
      <MapChrome />
    </PmtilesSnapshotMap>
  )
}

export default function ActivityRouteMap({
  activity,
  forceMapError = null,
}: {
  activity: ActivityDetailViewModel
  forceMapError?: 'mountain' | null
}) {
  const mountainAsset = getMountainPmtilesAsset(activity.mountain.id)
  const [mountainMapFailed, setMountainMapFailed] = useState(false)
  const forceMountainError = forceMapError === 'mountain'
  const summitTime = activity.summitAt
  const isScreenshotRoute = isScreenshotRecognitionSource(activity.sourceType)
  const validTrackPoints = useMemo(() => activity.trackPoints.filter(isValidTrackPoint), [activity.trackPoints])
  const envelope = useMemo(
    () => mountainAsset ? evaluateTrackBboxEnvelope(validTrackPoints, mountainAsset.bbox) : null,
    [mountainAsset, validTrackPoints],
  )
  const outOfMountainEnvelope = Boolean(mountainAsset && validTrackPoints.length >= 2 && envelope && !envelope.inside)
  const useMountainAsset = Boolean(mountainAsset && !mountainMapFailed && !outOfMountainEnvelope)
  const mapMode = !mountainAsset
    ? 'trace-only-no-asset'
    : outOfMountainEnvelope
      ? 'trace-only-out-of-envelope'
      : mountainMapFailed
        ? 'trace-only-map-error'
        : 'mountain-pmtiles'
  const trace = useMemo(() => buildProjectedTrace(activity.trackPoints), [activity.trackPoints])

  if (isScreenshotRoute) {
    return (
      <section className="act-route" data-testid="activity-route-map" data-map-mode="screenshot-shape">
        <div className="act-route__section-head">
          <div className="act-route__section-title">走过的路线</div>
          <div className="act-route__section-right">截图路线</div>
        </div>

        <div className="act-route__card">
          {activity.screenshotRouteShape ? <ScreenshotRouteShapeCard activity={activity} /> : <ScreenshotTextOnlyRouteCard />}
          <StatStrip activity={activity} />
        </div>
      </section>
    )
  }

  return (
    <section className="act-route" data-testid="activity-route-map" data-map-mode={mapMode}>
      <div className="act-route__section-head">
        <div className="act-route__section-title">走过的路线</div>
        <div className="act-route__section-right">完整轨迹</div>
      </div>

      <div className="act-route__card">
        {!useMountainAsset || !mountainAsset ? (
          <NoMapTraceCard trace={trace} summitTime={summitTime} />
        ) : (
          <MapTraceCard
            asset={mountainAsset}
            rawPoints={activity.trackPoints}
            forceError={forceMountainError}
            onError={() => {
              setMountainMapFailed(true)
            }}
          />
        )}
        <StatStrip activity={activity} />
      </div>
    </section>
  )
}
