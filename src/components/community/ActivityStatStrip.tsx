import type { CommunityPostMetrics } from '@/types'

function formatNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--'
  return Math.round(value).toLocaleString('zh-CN')
}

function formatDistance(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--'
  return value.toFixed(1)
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '--'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}`
  }

  return `${Math.max(1, minutes)}m`
}

export default function ActivityStatStrip({
  metrics,
}: {
  metrics: CommunityPostMetrics
}) {
  const cells = [
    { label: '海拔 m', value: formatNumber(metrics.altitudeM), accent: true },
    { label: '距离 km', value: formatDistance(metrics.distanceKm), accent: false },
    { label: '爬升 m', value: formatNumber(metrics.ascentM), accent: false },
    { label: '用时', value: formatDuration(metrics.durationSec), accent: false },
  ]

  return (
    <div className="community-v2-stat-strip" data-testid="community-activity-stat-strip">
      {cells.map((cell) => (
        <div key={cell.label} className="community-v2-stat-strip__cell" data-accent={cell.accent ? 'true' : 'false'}>
          <div className="community-v2-stat-strip__label">{cell.label}</div>
          <div className="community-v2-stat-strip__value">{cell.value}</div>
        </div>
      ))}
    </div>
  )
}
