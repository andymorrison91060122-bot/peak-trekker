'use client'

import { formatCommunityDuration } from '@/lib/community'
import CommunityMetricsRow from '@/components/community/CommunityMetricsRow'
import type { CommunityPostMetrics, CommunityTrackPreview } from '@/types'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatMetricDistance(distanceKm: number) {
  return `${distanceKm.toFixed(1)} km`
}

function formatMetricAscent(ascentM: number) {
  return `${Math.round(ascentM).toLocaleString()} m`
}

function formatCoordinateValue(value: number, positive: string, negative: string) {
  const direction = value >= 0 ? positive : negative
  return `${Math.abs(value).toFixed(4)}°${direction}`
}

function formatCoordinatePair(point: CommunityTrackPreview['points'][number]) {
  return `${formatCoordinateValue(point.lat, 'N', 'S')}, ${formatCoordinateValue(point.lng, 'E', 'W')}`
}

function buildRoutePath(points: CommunityTrackPreview['points']) {
  if (points.length < 2) return ''
  const width = 320
  const height = 220
  const padding = 20
  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = Math.max(0.000001, maxLat - minLat)
  const lngRange = Math.max(0.000001, maxLng - minLng)

  return points
    .map((point, index) => {
      const x = padding + ((point.lng - minLng) / lngRange) * (width - padding * 2)
      const y = height - padding - ((point.lat - minLat) / latRange) * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function buildRouteMarkers(points: CommunityTrackPreview['points']) {
  if (points.length < 2) return null
  const width = 320
  const height = 220
  const padding = 20
  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = Math.max(0.000001, maxLat - minLat)
  const lngRange = Math.max(0.000001, maxLng - minLng)

  const normalize = (point: CommunityTrackPreview['points'][number]) => ({
    x: padding + ((point.lng - minLng) / lngRange) * (width - padding * 2),
    y: height - padding - ((point.lat - minLat) / latRange) * (height - padding * 2),
  })

  return {
    start: normalize(points[0]),
    end: normalize(points.at(-1)!),
  }
}

function buildAltitudePath(points: CommunityTrackPreview['points']) {
  const altitudePoints = points.filter((point) => typeof point.altitude === 'number')
  if (altitudePoints.length < 2) return ''

  const width = 320
  const height = 220
  const padding = 20
  const altitudes = altitudePoints.map((point) => Number(point.altitude))
  const minAltitude = Math.min(...altitudes)
  const maxAltitude = Math.max(...altitudes)
  const altitudeRange = Math.max(1, maxAltitude - minAltitude)

  return altitudePoints
    .map((point, index) => {
      const x = padding + (index / Math.max(1, altitudePoints.length - 1)) * (width - padding * 2)
      const altitude = Number(point.altitude)
      const y = height - padding - ((altitude - minAltitude) / altitudeRange) * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function formatAltitudeRange(points: CommunityTrackPreview['points']) {
  const altitudePoints = points.filter((point) => typeof point.altitude === 'number').map((point) => Number(point.altitude))
  if (!altitudePoints.length) return null
  return {
    min: Math.round(Math.min(...altitudePoints)),
    max: Math.round(Math.max(...altitudePoints)),
  }
}

function buildMarkerBadgePosition(marker: { x: number; y: number }) {
  const width = 320
  const height = 220

  return {
    left: `${clamp((marker.x / width) * 100, 14, 86)}%`,
    top: `${clamp((marker.y / height) * 100 - 9, 10, 84)}%`,
  }
}

export default function CommunityRouteVisualization({
  trackPreview,
  metrics,
  mountainName,
}: {
  trackPreview: CommunityTrackPreview
  metrics: CommunityPostMetrics
  mountainName?: string | null
}) {
  const routePath = buildRoutePath(trackPreview.points)
  const routeMarkers = buildRouteMarkers(trackPreview.points)
  const altitudePath = buildAltitudePath(trackPreview.points)
  const altitudeRange = formatAltitudeRange(trackPreview.points)
  const startPoint = trackPreview.points[0]
  const endPoint = trackPreview.points.at(-1) ?? trackPreview.points[0]
  const startBadgePosition = routeMarkers ? buildMarkerBadgePosition(routeMarkers.start) : null
  const endBadgePosition = routeMarkers ? buildMarkerBadgePosition(routeMarkers.end) : null
  const metricCards = [
    { label: '路线距离', value: formatMetricDistance(metrics.distanceKm) },
    { label: '累计爬升', value: formatMetricAscent(metrics.ascentM) },
    { label: '运动时长', value: formatCommunityDuration(metrics.durationSec) },
    { label: '轨迹点数', value: `${trackPreview.pointCount} 个` },
  ]

  return (
    <div>
      <CommunityMetricsRow
        items={metricCards}
        variant="panel"
        marginBottom={14}
        title="路线面板"
        description={`${mountainName ? `${mountainName} · ` : ''}把路线距离、累计爬升、时长和轨迹抽样收成一套统一的活动概览。`}
        badges={[
          { label: '真实轨迹', active: true },
          { label: trackPreview.hasAltitude ? '含海拔剖面' : '仅路线概览' },
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="metric-tile" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>真实路线概览</div>
              <div className="section-subtitle">像 Strava 活动面板一样，先看起终点、路线走向和本次强度摘要。</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="muted-chip active">{formatMetricAscent(metrics.ascentM)} 累计爬升</span>
              <span className="muted-chip">起终点已标注</span>
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              borderRadius: 18,
              overflow: 'hidden',
              minHeight: 220,
              border: '1px solid rgba(255,255,255,0.08)',
              background:
                'radial-gradient(circle at top right, rgba(34,197,94,0.12), transparent 28%), linear-gradient(180deg, rgba(22,26,29,0.98), rgba(12,14,17,0.98))',
            }}
          >
            <svg viewBox="0 0 320 220" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {Array.from({ length: 5 }).map((_, index) => {
                const y = 28 + index * 40
                return <line key={`h-${index}`} x1="18" y1={y} x2="302" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              })}
              {Array.from({ length: 5 }).map((_, index) => {
                const x = 24 + index * 68
                return <line key={`v-${index}`} x1={x} y1="18" x2={x} y2="202" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              })}
              <path d={routePath} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <path d={routePath} fill="none" stroke="#6ee7a1" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {routeMarkers && (
                <>
                  <circle cx={routeMarkers.start.x} cy={routeMarkers.start.y} r="6" fill="#f5f7f8" />
                  <circle cx={routeMarkers.end.x} cy={routeMarkers.end.y} r="7" fill="#22c55e" />
                </>
              )}
            </svg>

            {routeMarkers && startBadgePosition && endBadgePosition && (
              <>
                <div
                  className="muted-chip"
                  style={{
                    position: 'absolute',
                    left: startBadgePosition.left,
                    top: startBadgePosition.top,
                    transform: 'translate(-50%, -100%)',
                    background: 'rgba(245,247,248,0.12)',
                    borderColor: 'rgba(255,255,255,0.18)',
                    color: 'var(--text-primary)',
                  }}
                >
                  起点
                </div>
                <div
                  className="muted-chip active"
                  style={{
                    position: 'absolute',
                    left: endBadgePosition.left,
                    top: endBadgePosition.top,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  终点
                </div>
              </>
            )}

            <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span className="muted-chip">起点 {formatCoordinatePair(startPoint)}</span>
                <span className="muted-chip active">终点 {formatCoordinatePair(endPoint)}</span>
              </div>
              <div className="section-subtitle" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>GPS 真实轨迹</span>
                <span>{trackPreview.pointCount} 个轨迹点</span>
              </div>
            </div>
          </div>
        </div>

        <div className="metric-tile" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>海拔剖面</div>
              <div className="section-subtitle">
                {altitudeRange
                  ? `最低 ${altitudeRange.min} m · 最高 ${altitudeRange.max} m`
                  : '当前轨迹缺少稳定海拔点，先保留路线概览。'}
              </div>
            </div>
            <span className={`muted-chip ${trackPreview.hasAltitude ? 'active' : ''}`}>
              {trackPreview.hasAltitude ? 'Altitude Ready' : 'No Altitude'}
            </span>
          </div>

          <div
            style={{
              position: 'relative',
              borderRadius: 18,
              overflow: 'hidden',
              minHeight: 220,
              border: '1px solid rgba(255,255,255,0.08)',
              background:
                'radial-gradient(circle at top left, rgba(255,255,255,0.06), transparent 24%), linear-gradient(180deg, rgba(22,26,29,0.98), rgba(12,14,17,0.98))',
            }}
          >
            {altitudePath ? (
              <svg viewBox="0 0 320 220" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                {Array.from({ length: 4 }).map((_, index) => {
                  const y = 30 + index * 44
                  return <line key={`alt-h-${index}`} x1="18" y1={y} x2="302" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                })}
                <path d={`${altitudePath} L 300 200 L 20 200 Z`} fill="rgba(34,197,94,0.14)" />
                <path d={altitudePath} fill="none" stroke="#6ee7a1" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center' }}>
                <div className="section-subtitle">
                  这条记录暂时缺少可用的海拔剖面数据，但路线概览仍然来自本次真实登山轨迹。
                </div>
              </div>
            )}
            {altitudeRange && (
              <>
                <div style={{ position: 'absolute', left: 16, top: 14 }} className="section-subtitle">
                  {clamp(altitudeRange.max, 0, altitudeRange.max).toLocaleString()} m
                </div>
                <div style={{ position: 'absolute', left: 16, bottom: 46 }} className="section-subtitle">
                  {clamp(altitudeRange.min, 0, altitudeRange.max).toLocaleString()} m
                </div>
              </>
            )}
            <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span className="muted-chip">{formatMetricDistance(metrics.distanceKm)}</span>
              <span className="muted-chip active">{formatCommunityDuration(metrics.durationSec)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
