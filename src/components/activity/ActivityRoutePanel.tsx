'use client'

import type { CommunityTrackPreview } from '@/types'

const ROUTE_VIEWBOX_WIDTH = 320
const ROUTE_VIEWBOX_HEIGHT = 180
const ROUTE_PADDING = 18

function buildRoutePath(points: CommunityTrackPreview['points']) {
  if (points.length < 2) return ''

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
      const x = ROUTE_PADDING + ((point.lng - minLng) / lngRange) * (ROUTE_VIEWBOX_WIDTH - ROUTE_PADDING * 2)
      const y =
        ROUTE_VIEWBOX_HEIGHT -
        ROUTE_PADDING -
        ((point.lat - minLat) / latRange) * (ROUTE_VIEWBOX_HEIGHT - ROUTE_PADDING * 2)

      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function buildRouteMarkers(points: CommunityTrackPreview['points']) {
  if (points.length < 2) return null

  const lats = points.map((point) => point.lat)
  const lngs = points.map((point) => point.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = Math.max(0.000001, maxLat - minLat)
  const lngRange = Math.max(0.000001, maxLng - minLng)

  const normalize = (point: CommunityTrackPreview['points'][number]) => ({
    x: ROUTE_PADDING + ((point.lng - minLng) / lngRange) * (ROUTE_VIEWBOX_WIDTH - ROUTE_PADDING * 2),
    y:
      ROUTE_VIEWBOX_HEIGHT -
      ROUTE_PADDING -
      ((point.lat - minLat) / latRange) * (ROUTE_VIEWBOX_HEIGHT - ROUTE_PADDING * 2),
  })

  return {
    start: normalize(points[0]),
    end: normalize(points.at(-1)!),
  }
}

export default function ActivityRoutePanel({
  trackPreview,
}: {
  trackPreview: CommunityTrackPreview | null
}) {
  const routePath = trackPreview ? buildRoutePath(trackPreview.points) : ''
  const routeMarkers = trackPreview ? buildRouteMarkers(trackPreview.points) : null

  return (
    <section className="surface-card activity-route-section" data-testid="activity-route-section">
      <div className="activity-route-panel__header">
        <div className="activity-route-panel__section-title">活动路线</div>
      </div>

      {trackPreview ? (
        <div className="activity-route-panel">
          <div className="activity-route-panel__title">路线轨迹</div>
          <div className="activity-route-panel__canvas" role="img" aria-label="路线轨迹">
            <svg
              className="activity-route-panel__svg"
              viewBox={`0 0 ${ROUTE_VIEWBOX_WIDTH} ${ROUTE_VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none"
            >
              {Array.from({ length: 4 }).map((_, index) => {
                const y = ROUTE_PADDING + index * 48
                return (
                  <line
                    key={`grid-y-${index}`}
                    x1={ROUTE_PADDING}
                    y1={y}
                    x2={ROUTE_VIEWBOX_WIDTH - ROUTE_PADDING}
                    y2={y}
                    className="activity-route-panel__grid-line"
                  />
                )
              })}
              {Array.from({ length: 4 }).map((_, index) => {
                const x = ROUTE_PADDING + index * 94
                return (
                  <line
                    key={`grid-x-${index}`}
                    x1={x}
                    y1={ROUTE_PADDING}
                    x2={x}
                    y2={ROUTE_VIEWBOX_HEIGHT - ROUTE_PADDING}
                    className="activity-route-panel__grid-line"
                  />
                )
              })}
              <path d={routePath} className="activity-route-panel__path-shadow" />
              <path d={routePath} className="activity-route-panel__path" />
              {routeMarkers ? (
                <>
                  <circle cx={routeMarkers.start.x} cy={routeMarkers.start.y} r="5.5" className="activity-route-panel__marker-start" />
                  <circle cx={routeMarkers.end.x} cy={routeMarkers.end.y} r="6.5" className="activity-route-panel__marker-end" />
                </>
              ) : null}
            </svg>
          </div>
        </div>
      ) : (
        <div className="activity-route-panel__empty">暂无轨迹数据</div>
      )}
    </section>
  )
}
