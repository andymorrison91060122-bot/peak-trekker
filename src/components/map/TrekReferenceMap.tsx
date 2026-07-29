'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Mountain } from '@/types'
import type { TrackPoint } from '@/lib/trek-utils'
import { getMountainPmtilesAsset } from '@/lib/map/map-assets'
import PmtilesSnapshotMap from '@/components/map/PmtilesSnapshotMap'
import { createGeoTraceProjector } from '@/lib/geo-trace-projector'

type TrekGpsState = { lat: number; lng: number; accuracy: number; altitude?: number | null } | null
type TrekGpsStatus = 'idle' | 'checking' | 'ready' | 'weak' | 'denied' | 'unsupported' | 'error'
type TrekReferenceMapVariant = 'default' | 'gpsWeak' | 'offlineCache'

type ProjectedPoint = {
  x: number
  y: number
  label?: string
}

type ProjectedTrace = {
  d: string | null
  points: ProjectedPoint[]
  start: ProjectedPoint | null
  current: ProjectedPoint | null
  summit: ProjectedPoint
}

type TrekReferenceMapProps = {
  mode?: 'prep' | 'live'
  mountain: Mountain | null
  progress: number
  variant?: TrekReferenceMapVariant
  showCurrentMarker?: boolean
  gps?: TrekGpsState
  gpsStatus?: TrekGpsStatus
  trackPoints?: TrackPoint[]
  forceMapError?: boolean
}

const TREK_LAYER_PREFIX = 'fu47c-trek-reference'
const TRACE_FRAME = { width: 343, height: 343, padding: 38 }

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))
}

function formatSummitLabel(altitude: number | null) {
  return typeof altitude === 'number' && Number.isFinite(altitude)
    ? `顶峰 ${formatInteger(altitude)}m`
    : '顶峰'
}

function isValidCoordinate(point: { lat: number; lng: number }) {
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

function sampleTrackPoints(points: TrackPoint[], maxPoints = 120) {
  const valid = points.filter(isValidCoordinate)
  if (valid.length <= maxPoints) return valid
  const step = Math.max(1, Math.ceil(valid.length / maxPoints))
  const sampled = valid.filter((_, index) => index % step === 0)
  const lastPoint = valid.at(-1)!
  return sampled.at(-1) === lastPoint ? sampled : [...sampled, lastPoint]
}

function buildProjectedTrace({
  mountain,
  gps,
  trackPoints,
}: {
  mountain: Mountain | null
  gps: TrekGpsState
  trackPoints: TrackPoint[]
}): ProjectedTrace | null {
  if (!mountain) return null
  const summit = { lat: mountain.latitude, lng: mountain.longitude, label: '顶峰' }
  const sampledTrack = sampleTrackPoints(trackPoints)
  const current = gps && isValidCoordinate(gps) ? { lat: gps.lat, lng: gps.lng, label: '当前位置' } : null
  const rawPoints = [
    ...sampledTrack.map((point) => ({ lat: point.lat, lng: point.lng })),
    current,
    summit,
  ].filter((point): point is { lat: number; lng: number; label?: string } => Boolean(point))
  if (!rawPoints.length) return null

  const projector = createGeoTraceProjector(rawPoints, TRACE_FRAME)
  const projectedTrack = projector.projectPoints(sampledTrack)
  const projectedCurrent = current ? projector.projectPoint(current) : projectedTrack.at(-1) ?? null
  const projectedSummit = projector.projectPoint(summit)

  return {
    d: projectedTrack.length >= 2
      ? projectedTrack.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
      : null,
    points: projectedTrack,
    start: projectedTrack[0] ?? null,
    current: projectedCurrent,
    summit: projectedSummit,
  }
}

function addOrReplaceGeoJsonSource(map: MapLibreMap, id: string, data: GeoJSON.GeoJSON) {
  if (map.getSource(id)) {
    const source = map.getSource(id) as { setData?: (nextData: GeoJSON.GeoJSON) => void }
    source.setData?.(data)
    return
  }
  map.addSource(id, { type: 'geojson', data })
}

function addLayerIfMissing(map: MapLibreMap, layer: Parameters<MapLibreMap['addLayer']>[0]) {
  if (!map.getLayer(layer.id)) map.addLayer(layer)
}

function metersToPixelsAtZoom(meters: number, latitude: number, zoom: number) {
  const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return 18
  return Math.min(52, Math.max(8, meters / metersPerPixel))
}

function buildCurrentFeature(gps: TrekGpsState, gpsStatus?: TrekGpsStatus) {
  if (!gps || !isValidCoordinate(gps)) return null
  const accuracy = Math.max(5, Math.min(250, Number(gps.accuracy) || 25))
  const latitude = gps.lat
  const markerColor = gpsStatus === 'weak' ? '#f7c948' : '#7ef0b4'
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [gps.lng, gps.lat] },
    properties: {
      label: `当前位置 · ±${Math.round(accuracy)}m`,
      markerLabel: '当前位置',
      markerColor,
      accuracyPxZ9: metersToPixelsAtZoom(accuracy, latitude, 9),
      accuracyPxZ10: metersToPixelsAtZoom(accuracy, latitude, 10),
      accuracyPxZ11: metersToPixelsAtZoom(accuracy, latitude, 11),
      accuracyPxZ12: metersToPixelsAtZoom(accuracy, latitude, 12),
    },
  }
}

function updateTrekGeoJsonLayers({
  map,
  mountain,
  gps,
  gpsStatus,
  trackPoints,
  mode,
  showCurrentMarker,
}: {
  map: MapLibreMap
  mountain: Mountain
  gps: TrekGpsState
  gpsStatus?: TrekGpsStatus
  trackPoints: TrackPoint[]
  mode: 'prep' | 'live'
  showCurrentMarker: boolean
}) {
  const summitFeature = {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [mountain.longitude, mountain.latitude] },
    properties: { label: formatSummitLabel(mountain.altitude) },
  }
  const sampledTrack = sampleTrackPoints(trackPoints)
  const trackFeatures = sampledTrack.length >= 2
    ? [
        {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: sampledTrack.map((point) => [point.lng, point.lat]) },
          properties: {},
        },
      ]
    : []
  const startFeature = sampledTrack[0]
    ? {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [sampledTrack[0].lng, sampledTrack[0].lat] },
        properties: { label: '起点' },
      }
    : null
  const shouldShowCurrent =
    mode === 'prep'
      ? Boolean(gps && (gpsStatus === 'ready' || gpsStatus === 'weak'))
      : Boolean(gps && showCurrentMarker)
  const currentFeature = shouldShowCurrent ? buildCurrentFeature(gps, gpsStatus) : null

  addOrReplaceGeoJsonSource(map, `${TREK_LAYER_PREFIX}-summit-source`, {
    type: 'FeatureCollection',
    features: [summitFeature],
  })
  addOrReplaceGeoJsonSource(map, `${TREK_LAYER_PREFIX}-track-source`, {
    type: 'FeatureCollection',
    features: trackFeatures,
  })
  addOrReplaceGeoJsonSource(map, `${TREK_LAYER_PREFIX}-start-source`, {
    type: 'FeatureCollection',
    features: startFeature ? [startFeature] : [],
  })
  addOrReplaceGeoJsonSource(map, `${TREK_LAYER_PREFIX}-current-source`, {
    type: 'FeatureCollection',
    features: currentFeature ? [currentFeature] : [],
  })

  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-track-line`,
    type: 'line',
    source: `${TREK_LAYER_PREFIX}-track-source`,
    paint: {
      'line-color': '#7ef0b4',
      'line-width': 3.2,
      'line-opacity': 0.94,
    },
  })
  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-summit-point`,
    type: 'circle',
    source: `${TREK_LAYER_PREFIX}-summit-source`,
    paint: {
      'circle-radius': 7,
      'circle-color': '#7ef0b4',
      'circle-stroke-color': '#10231b',
      'circle-stroke-width': 2,
    },
  })
  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-summit-label`,
    type: 'symbol',
    source: `${TREK_LAYER_PREFIX}-summit-source`,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-offset': [0, -1.55],
      'text-anchor': 'bottom',
    },
    paint: {
      'text-color': '#7ef0b4',
      'text-halo-color': '#07130f',
      'text-halo-width': 1.6,
    },
  })
  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-start-point`,
    type: 'circle',
    source: `${TREK_LAYER_PREFIX}-start-source`,
    paint: {
      'circle-radius': 5.5,
      'circle-color': '#d7dde2',
      'circle-stroke-color': '#07130f',
      'circle-stroke-width': 1.7,
    },
  })
  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-start-label`,
    type: 'symbol',
    source: `${TREK_LAYER_PREFIX}-start-source`,
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
  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-accuracy-ring`,
    type: 'circle',
    source: `${TREK_LAYER_PREFIX}-current-source`,
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        9,
        ['get', 'accuracyPxZ9'],
        10,
        ['get', 'accuracyPxZ10'],
        11,
        ['get', 'accuracyPxZ11'],
        12,
        ['get', 'accuracyPxZ12'],
      ],
      'circle-color': gpsStatus === 'weak' ? '#f7c948' : '#7ef0b4',
      'circle-opacity': gpsStatus === 'weak' ? 0.14 : 0.11,
      'circle-stroke-color': gpsStatus === 'weak' ? '#f7c948' : '#7ef0b4',
      'circle-stroke-width': 1,
      'circle-stroke-opacity': gpsStatus === 'weak' ? 0.36 : 0.3,
    },
  })
  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-current-point`,
    type: 'circle',
    source: `${TREK_LAYER_PREFIX}-current-source`,
    paint: {
      'circle-radius': 6,
      'circle-color': gpsStatus === 'weak' ? '#f7c948' : '#7ef0b4',
      'circle-stroke-color': '#07130f',
      'circle-stroke-width': 1.8,
    },
  })
  addLayerIfMissing(map, {
    id: `${TREK_LAYER_PREFIX}-current-label`,
    type: 'symbol',
    source: `${TREK_LAYER_PREFIX}-current-source`,
    layout: {
      'text-field': ['get', 'markerLabel'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-offset': [0, 1.35],
      'text-anchor': 'top',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': ['get', 'markerColor'],
      'text-halo-color': '#07130f',
      'text-halo-width': 1.6,
    },
  })
}

function TraceOnlyCard({
  mountain,
  gps,
  mode,
  progressPercent,
  variant,
  gpsStatus,
  trackPoints,
}: {
  mountain: Mountain | null
  gps: TrekGpsState
  mode: 'prep' | 'live'
  progressPercent: number
  variant: TrekReferenceMapVariant
  gpsStatus?: TrekGpsStatus
  trackPoints: TrackPoint[]
}) {
  const trace = useMemo(() => buildProjectedTrace({ mountain, gps, trackPoints }), [gps, mountain, trackPoints])
  const hasTrace = Boolean(trace?.d)
  const isPrep = mode === 'prep'
  const isWeak = gpsStatus === 'weak'
  const currentLabel = trace?.current
    ? {
        x: Math.max(48, Math.min(TRACE_FRAME.width - 48, trace.current.x)),
        y: trace.current.y > TRACE_FRAME.height - 62 ? trace.current.y - 16 : trace.current.y + 25,
      }
    : null

  return (
    <div
      role="img"
      aria-label={hasTrace ? '仅可预览轨迹的 Trek 参考卡片' : '尚未获得轨迹的 Trek 参考卡片'}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-outline)',
        background:
          'radial-gradient(circle at 58% 38%, color-mix(in srgb, var(--color-surface-elevated) 78%, transparent), var(--color-surface) 76%)',
        opacity: variant === 'offlineCache' ? 0.78 : 1,
      }}
    >
      <svg
        data-testid="trek-reference-map-svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${TRACE_FRAME.width} ${TRACE_FRAME.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <radialGradient id="trek-trace-only-bg" cx="58%" cy="38%" r="60%">
            <stop offset="0%" stopColor="rgba(126, 240, 180, 0.12)" />
            <stop offset="52%" stopColor="rgba(35, 48, 44, 0.26)" />
            <stop offset="100%" stopColor="rgba(12, 16, 18, 0.06)" />
          </radialGradient>
        </defs>
        <rect width={TRACE_FRAME.width} height={TRACE_FRAME.height} fill="url(#trek-trace-only-bg)" />
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <ellipse
            key={item}
            cx="224"
            cy="136"
            rx={34 + item * 24}
            ry={20 + item * 16}
            stroke="rgba(141,149,155,0.18)"
            strokeWidth="1"
            fill="none"
          />
        ))}
        {trace?.d ? (
          <path
            data-testid="trek-reference-map-trail"
            d={trace.d}
            stroke="var(--color-trail)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {trace?.start ? <circle cx={trace.start.x} cy={trace.start.y} r="5" fill="#d7dde2" /> : null}
        {trace?.current ? (
          <g data-testid="trek-reference-map-current-marker" opacity={isWeak ? 0.76 : 1}>
            <circle cx={trace.current.x} cy={trace.current.y} r="13" fill={isWeak ? 'rgba(247,201,72,0.16)' : 'rgba(126,240,180,0.16)'} />
            <circle cx={trace.current.x} cy={trace.current.y} r="6" fill={isWeak ? '#f7c948' : '#7ef0b4'} />
            {currentLabel ? (
              <text
                data-testid="trek-reference-map-current-label"
                x={currentLabel.x}
                y={currentLabel.y}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill={isWeak ? '#f7c948' : '#7ef0b4'}
                stroke="#07130f"
                strokeWidth="3"
                paintOrder="stroke"
              >
                当前位置
              </text>
            ) : null}
          </g>
        ) : null}
        {trace?.summit ? (
          <g data-testid="trek-reference-map-summit-marker">
            <path d={`M${trace.summit.x - 8} ${trace.summit.y + 8} L${trace.summit.x} ${trace.summit.y - 10} L${trace.summit.x + 8} ${trace.summit.y + 8} Z`} fill="#eef7f1" opacity="0.78" />
          </g>
        ) : null}
      </svg>
      <MapChrome
        mode={mode}
        progressPercent={progressPercent}
        variant={variant}
        gps={gps}
        gpsStatus={gpsStatus}
        mapMode="trace-only"
        fallbackText={hasTrace ? '仅可预览轨迹' : isPrep ? '尚未获得轨迹' : '仅可预览轨迹'}
      />
    </div>
  )
}

function MapChrome({
  mode,
  progressPercent,
  variant,
  gps,
  gpsStatus,
  mapMode,
  fallbackText,
}: {
  mode: 'prep' | 'live'
  progressPercent: number
  variant: TrekReferenceMapVariant
  gps?: TrekGpsState
  gpsStatus?: TrekGpsStatus
  mapMode: 'mountain-pmtiles' | 'trace-only'
  fallbackText?: string
}) {
  const isPrep = mode === 'prep'
  const weak = gpsStatus === 'weak' || variant === 'gpsWeak'
  const accuracyLabel = weak
    ? 'GPS 弱 · 位置可能延迟'
    : gps?.accuracy
      ? `当前位置 · ±${Math.round(gps.accuracy)}m`
      : null
  return (
    <>
      <span
        data-testid="trek-reference-map-chip"
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          padding: '4px 10px',
          borderRadius: 'var(--radius-pill)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 500,
          background: 'color-mix(in oklch, var(--color-surface) 80%, transparent)',
          backdropFilter: 'blur(8px)',
          color: 'var(--color-on-surface-variant)',
          zIndex: 2,
        }}
      >
        地图仅作参考
      </span>
      <span
        data-testid="trek-reference-map-progress"
        style={{
          position: 'absolute',
          right: mapMode === 'mountain-pmtiles' ? 52 : 12,
          top: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          background: 'color-mix(in oklch, var(--color-surface) 80%, transparent)',
          backdropFilter: 'blur(8px)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 700,
          color: 'var(--color-success)',
          fontVariantNumeric: 'tabular-nums',
          zIndex: 2,
        }}
      >
        {progressPercent}% / 顶峰
      </span>
      {variant === 'offlineCache' ? (
        <span
          data-testid="trek-reference-map-offline-hint"
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            padding: '5px 10px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-outline)',
            background: 'color-mix(in oklch, var(--color-surface) 78%, transparent)',
            backdropFilter: 'blur(8px)',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            zIndex: 2,
          }}
        >
          本地缓存模式 · 数据未与云端同步
        </span>
      ) : isPrep ? (
        <span
          data-testid="trek-reference-map-north-chip"
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            padding: '5px 10px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-outline)',
            background: 'color-mix(in oklch, var(--color-surface) 78%, transparent)',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 700,
            backdropFilter: 'blur(8px)',
            zIndex: 2,
          }}
        >
          北 ↑ 固定
        </span>
      ) : null}
      {fallbackText ? (
        <span
          data-testid="trek-reference-map-fallback-copy"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 46,
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            padding: '5px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'color-mix(in oklch, var(--color-surface) 78%, transparent)',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            backdropFilter: 'blur(8px)',
            zIndex: 2,
          }}
        >
          {fallbackText}
        </span>
      ) : null}
      {accuracyLabel && isPrep ? (
        <span
          data-testid="trek-reference-map-accuracy-chip"
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-pill)',
            border: `1px solid color-mix(in oklch, ${weak ? 'var(--color-warning)' : 'var(--color-success)'} 40%, transparent)`,
            background: `color-mix(in oklch, ${weak ? 'var(--color-warning)' : 'var(--color-success)'} 14%, var(--color-surface))`,
            color: weak ? 'var(--color-warning)' : 'var(--color-success)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            zIndex: 2,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: 'var(--radius-pill)',
              background: weak ? 'var(--color-warning)' : 'var(--color-success)',
            }}
          />
          {accuracyLabel}
        </span>
      ) : !isPrep && weak ? (
        <span
          data-testid="trek-reference-map-gps-weak-chip"
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid color-mix(in oklch, var(--color-warning) 40%, transparent)',
            background: 'color-mix(in oklch, var(--color-warning) 16%, var(--color-surface))',
            color: 'var(--color-warning)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            zIndex: 2,
          }}
        >
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--radius-pill)', background: 'var(--color-warning)' }} />
          GPS 弱 · 位置可能延迟
        </span>
      ) : null}
    </>
  )
}

function PmtilesTrekMap({
  asset,
  mountain,
  mode,
  progressPercent,
  variant,
  gps,
  gpsStatus,
  trackPoints,
  showCurrentMarker,
  forceMapError,
  onError,
}: {
  asset: NonNullable<ReturnType<typeof getMountainPmtilesAsset>>
  mountain: Mountain
  mode: 'prep' | 'live'
  progressPercent: number
  variant: TrekReferenceMapVariant
  gps: TrekGpsState
  gpsStatus?: TrekGpsStatus
  trackPoints: TrackPoint[]
  showCurrentMarker: boolean
  forceMapError: boolean
  onError: (error: Error) => void
}) {
  const mapRef = useRef<MapLibreMap | null>(null)
  const updateLayers = useCallback((map: MapLibreMap) => {
    updateTrekGeoJsonLayers({
      map,
      mountain,
      gps,
      gpsStatus,
      trackPoints,
      mode,
      showCurrentMarker,
    })
  }, [gps, gpsStatus, mode, mountain, showCurrentMarker, trackPoints])

  useEffect(() => {
    if (mapRef.current) updateLayers(mapRef.current)
  }, [updateLayers])

  const handleMapReady = useCallback((map: MapLibreMap) => {
    mapRef.current = map
    updateLayers(map)
  }, [updateLayers])

  return (
    <PmtilesSnapshotMap
      asset={asset}
      ariaLabel="Trek 轻量位置参考地图"
      forceError={forceMapError}
      onMapReady={handleMapReady}
      onError={onError}
      style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-outline)' }}
    >
      <MapChrome
        mode={mode}
        progressPercent={progressPercent}
        variant={variant}
        gps={gps}
        gpsStatus={gpsStatus}
        mapMode="mountain-pmtiles"
      />
    </PmtilesSnapshotMap>
  )
}

export default function TrekReferenceMap({
  mode = 'live',
  mountain,
  progress,
  variant = 'default',
  showCurrentMarker = true,
  gps = null,
  gpsStatus,
  trackPoints = [],
  forceMapError = false,
}: TrekReferenceMapProps) {
  const p = clamp01(progress)
  const progressPercent = Math.round(p * 100)
  const asset = getMountainPmtilesAsset(mountain?.id)
  const mapFailureKey = `${asset?.id ?? 'no-asset'}:${mountain?.id ?? 'no-mountain'}:${forceMapError ? 'forced' : 'normal'}`
  const [failedMapKey, setFailedMapKey] = useState<string | null>(null)
  const usePmtiles = Boolean(asset && mountain && failedMapKey !== mapFailureKey)
  const hasTrackLine = mode === 'live' && sampleTrackPoints(trackPoints).length >= 2
  const hasCurrentMarker = Boolean(
    gps && (
      mode === 'prep'
        ? gpsStatus === 'ready' || gpsStatus === 'weak'
        : showCurrentMarker
    ),
  )

  return (
    <div data-testid="trek-reference-map-module" style={{ margin: 'var(--space-4) var(--space-4) 0' }}>
      <div
        data-testid="trek-reference-map-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 0,
          marginBottom: 8,
          gap: 'var(--space-3)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 500,
            color: 'var(--color-on-surface-variant)',
          }}
        >
          位置参考
        </span>
        <span
          style={{
            minWidth: 0,
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 400,
            color: 'var(--color-on-surface-variant)',
            textAlign: 'right',
          }}
        >
          {mode === 'prep' ? '北向固定 · 非专业导航' : '海拔与进度仍是主要信息'}
        </span>
      </div>
      <div
        data-testid="trek-reference-map-canvas"
        data-map-mode={usePmtiles ? 'mountain-pmtiles' : 'trace-only'}
        data-current-dot-visible={hasCurrentMarker ? 'true' : 'false'}
        data-current-dot-label-visible={hasCurrentMarker ? 'true' : 'false'}
        data-accuracy-ring-visible={hasCurrentMarker ? 'true' : 'false'}
        data-trace-layer-present={hasTrackLine ? 'true' : 'false'}
        style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', position: 'relative' }}
      >
        {usePmtiles && asset && mountain ? (
          <PmtilesTrekMap
            asset={asset}
            mountain={mountain}
            mode={mode}
            progressPercent={progressPercent}
            variant={variant}
            gps={gps}
            gpsStatus={gpsStatus}
            trackPoints={trackPoints}
            showCurrentMarker={showCurrentMarker}
            forceMapError={forceMapError}
            onError={() => setFailedMapKey(mapFailureKey)}
          />
        ) : (
          <TraceOnlyCard
            mountain={mountain}
            gps={gps}
            mode={mode}
            progressPercent={progressPercent}
            variant={variant}
            gpsStatus={gpsStatus}
            trackPoints={trackPoints}
          />
        )}
      </div>
    </div>
  )
}
