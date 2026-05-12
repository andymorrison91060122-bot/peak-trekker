import { LICENSE_UI_ORDER, getLicenseColor, getLicenseIcon, getLicenseLevelLabel } from '@/lib/license-ui'
import { SectionHeader } from '@/components/ui/MountainUI'

const LICENSE_PROGRESS_CONFIG = {
  none: { next: 'basic', needCount: 3, needAlt: 1000 },
  basic: { next: 'intermediate', needCount: 3, needAlt: 2000 },
  intermediate: { next: 'advanced', needCount: 3, needAlt: 4000 },
  advanced: { next: null, needCount: 0, needAlt: 0 },
} as const

function getLicenseStageGoal(level: typeof LICENSE_UI_ORDER[number]) {
  switch (level) {
    case 'none':
      return '3 座 1000m 以下的 GPS 有效记录'
    case 'basic':
      return '3 座 2000m 以下的 GPS 有效记录'
    case 'intermediate':
      return '3 座 4000m 以下的 GPS 有效记录'
    case 'advanced':
      return '继续保持真实记录'
    default:
      return ''
  }
}

function getLicenseStageCopy(level: typeof LICENSE_UI_ORDER[number], state: 'current' | 'complete' | 'next' | 'locked') {
  const goal = getLicenseStageGoal(level)

  if (level === 'advanced') {
    return state === 'current' ? '当前最高阶段 · 继续保持真实记录' : `最高阶段 · ${goal}`
  }

  switch (state) {
    case 'current':
      return `当前阶段 · ${goal}`
    case 'complete':
      return `已达成 · ${goal}`
    case 'next':
      return `下一步 · ${goal}`
    case 'locked':
      return `后续目标 · ${goal}`
    default:
      return goal
  }
}

export default function ProfileLicenseProgressSection({
  currentLicense,
  approvedRealtimeCount,
  qualifiedForNext,
}: {
  currentLicense: string
  approvedRealtimeCount: number
  qualifiedForNext: number
}) {
  const safeCurrentLicense = LICENSE_UI_ORDER.includes(currentLicense as typeof LICENSE_UI_ORDER[number])
    ? (currentLicense as typeof LICENSE_UI_ORDER[number])
    : 'none'
  const currentConfig = LICENSE_PROGRESS_CONFIG[safeCurrentLicense]
  const nextConfig = currentConfig.next ? LICENSE_PROGRESS_CONFIG[currentConfig.next as keyof typeof LICENSE_PROGRESS_CONFIG] : null
  const currentLicenseIndex = LICENSE_UI_ORDER.indexOf(safeCurrentLicense)
  const progressMax = currentConfig.needCount || 1
  const progressValue = nextConfig ? Math.min(qualifiedForNext, progressMax) : progressMax
  const progressPercent = Math.min(100, Math.round((progressValue / progressMax) * 100))

  return (
    <div className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
      <SectionHeader title="执照进度" description="先看当前在哪，再看下一步往哪里走。" />

      <div className="profile-license-summary" data-testid="profile-license-summary">
        <div
          data-license-summary-card="current"
          className="surface-card profile-license-summary__card"
          style={{
            background: 'linear-gradient(180deg, rgba(34,197,94,0.08), rgba(17,20,22,0.94))',
            borderColor: 'rgba(34,197,94,0.18)',
          }}
        >
          <div className="eyebrow-label">
            当前执照
          </div>
          <div className="profile-license-summary__value">
            {getLicenseIcon(safeCurrentLicense)} {getLicenseLevelLabel(safeCurrentLicense)}
          </div>
          <div className="profile-license-summary__meta">
            GPS 有效记录 {approvedRealtimeCount} 条
          </div>
        </div>

        <div
          data-license-summary-card="next"
          className="surface-card profile-license-summary__card"
          style={{
            background: 'linear-gradient(180deg, rgba(252,211,77,0.07), rgba(17,20,22,0.94))',
            borderColor: 'rgba(252,211,77,0.14)',
          }}
        >
          <div className="eyebrow-label">
            下一阶段
          </div>
          <div className="profile-license-summary__value" style={{ fontSize: 'var(--font-title-l-size)' }}>
            {nextConfig ? `${getLicenseIcon(currentConfig.next)} ${getLicenseLevelLabel(currentConfig.next)}` : '★ 最高等级'}
          </div>
          <div className="profile-license-summary__meta">
            {nextConfig
              ? `还差 ${Math.max(0, currentConfig.needCount - qualifiedForNext)} 座符合条件的山峰`
              : '你已经到达当前体系最高等级'}
          </div>
          <div className="profile-license-progress" aria-hidden="true">
            <div className="profile-license-progress__bar" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="support-copy support-copy--compact">
            {nextConfig
              ? `当前 ${Math.min(qualifiedForNext, currentConfig.needCount)} / ${currentConfig.needCount} · 目标 ${currentConfig.needAlt.toLocaleString()}m 以下的 GPS 有效记录`
              : '后续只要继续保持真实记录即可。'}
          </div>
        </div>
      </div>

      <div
        data-testid="profile-license-grid"
        className="profile-license-grid"
      >
        {LICENSE_UI_ORDER.map((level, index) => {
          const isCurrent = safeCurrentLicense === level
          const isUnlocked = currentLicenseIndex >= index
          const isNext = !isUnlocked && currentLicenseIndex + 1 === index
          const state = isCurrent ? 'current' : isUnlocked ? 'complete' : isNext ? 'next' : 'locked'
          return (
            <div
              key={level}
              data-license-card={level}
              data-license-state={state}
              className="surface-card profile-license-grid__card"
              style={{
                background: isCurrent
                  ? 'linear-gradient(180deg, rgba(34,197,94,0.10), rgba(17,20,22,0.94))'
                  : isNext
                    ? 'linear-gradient(180deg, rgba(252,211,77,0.08), rgba(17,20,22,0.92))'
                    : isUnlocked
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(17,20,22,0.94))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(17,20,22,0.88))',
                borderColor: isCurrent
                  ? 'rgba(34,197,94,0.2)'
                  : isNext
                    ? 'rgba(252,211,77,0.16)'
                    : 'var(--border-color)',
              }}
            >
              <div className="profile-license-grid__header">
                <div className="profile-license-grid__title" style={{ color: getLicenseColor(level) }}>
                  {getLicenseIcon(level)} {getLicenseLevelLabel(level)}
                </div>
                <div className="profile-license-grid__status">
                  {isCurrent ? '当前' : isUnlocked ? '已达成' : isNext ? '下一步' : '后续'}
                </div>
              </div>
              <div className="profile-license-grid__copy">
                {getLicenseStageCopy(level, state)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
