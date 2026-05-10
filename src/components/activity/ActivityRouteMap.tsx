import type { ActivityDetailViewModel } from '@/app/(flow)/activity/[id]/ActivityDetailClient'

const routeNumberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function formatRouteDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}

function formatRouteTime(value: string | null) {
  if (!value) return '--:--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatAltitude(value: number) {
  if (value <= 0) return '--'
  return `${routeNumberFormatter.format(Math.round(value))} m`
}

function formatDistance(value: number) {
  if (value <= 0) return '--'
  return `${value.toFixed(1)} km`
}

export default function ActivityRouteMap({ activity }: { activity: ActivityDetailViewModel }) {
  // Until track max is guaranteed on every imported record, fall back to mountain altitude for the stat strip.
  const maxAltitudeM = activity.metrics.maxAltitudeM > 0 ? activity.metrics.maxAltitudeM : activity.mountain.altitude
  const summitTime = formatRouteTime(activity.summitAt)
  const stats = [
    { label: '总距离', value: formatDistance(activity.metrics.distanceKm) },
    { label: '用时', value: activity.metrics.durationSeconds > 0 ? formatRouteDuration(activity.metrics.durationSeconds) : '--' },
    { label: '最高点', value: formatAltitude(maxAltitudeM), accent: true },
  ]
  const contourOpacities = [0.28, 0.255, 0.23, 0.205, 0.18, 0.155, 0.13]

  return (
    <section className="act-route" data-testid="activity-route-map">
      <div className="act-route__section-head">
        <div className="act-route__section-title">走过的路线</div>
        <div className="act-route__section-right">完整轨迹</div>
      </div>

      <div className="act-route__card">
        <div className="act-route__map-placeholder" role="img" aria-label="这次活动走过的路线静态快照">
          <svg className="act-route__svg" viewBox="0 0 343 200" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <radialGradient id="act-route-map-bg" cx="58%" cy="38%" r="60%">
                <stop offset="0%" stopColor="var(--color-surface-elevated)" />
                <stop offset="100%" stopColor="var(--color-surface)" />
              </radialGradient>
              <linearGradient id="act-route-trace" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="var(--color-success)" />
              </linearGradient>
            </defs>

            <rect width="343" height="200" fill="url(#act-route-map-bg)" />
            {contourOpacities.map((opacity, index) => (
              <ellipse
                key={opacity}
                className="act-route__contour"
                cx="200"
                cy="86"
                rx={28 + index * 22}
                ry={16 + index * 12}
                stroke={`rgba(141,149,155,${opacity})`}
                strokeWidth="1"
                fill="none"
              />
            ))}

            <path
              className="act-route__trace"
              d="M30 168 Q70 152 100 144 T160 122 T196 90 L200 86 L208 90 Q220 110 240 132 T300 168"
              stroke="url(#act-route-trace)"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <circle cx="30" cy="168" r="6" className="act-route__marker-start" />
            <text x="40" y="172" className="act-route__marker-label">
              起
            </text>

            <circle cx="300" cy="168" r="6" className="act-route__marker-end" />
            <text x="278" y="172" className="act-route__marker-label">
              回营
            </text>

            <path d="M192 78 L200 60 L208 78 Z" className="act-route__summit-triangle" />
            <circle cx="200" cy="74" r="11" className="act-route__summit-ring" />
            <text x="172" y="46" className="act-route__summit-label">
              山顶 · {summitTime}
            </text>
          </svg>

          <div className="act-route__status-chip">完成轨迹</div>
          <button className="act-route__expand-btn" type="button" aria-label="放大路线地图（暂未开放）">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            放大
          </button>
        </div>

        <div className="act-route__stats" data-testid="activity-route-map-stats">
          {stats.map((stat, index) => (
            <div className="act-route__stat" key={stat.label}>
              <div className={stat.accent ? 'act-route__stat-value act-route__stat-value--accent' : 'act-route__stat-value'}>
                {stat.value}
              </div>
              <div className="act-route__stat-label">{stat.label}</div>
              {index < stats.length - 1 ? <span className="act-route__stat-divider" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
