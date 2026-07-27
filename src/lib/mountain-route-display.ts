export type MountainDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert'
export type MountainAccessStatus = 'open' | 'closed' | 'unknown' | 'pilgrimage_only'
export type MountainLengthBand = 'all' | 'short' | 'mid' | 'long'

const REQUIRED_RISK_WARNINGS = [
  '自然保护区核心区及未开发未开放区域禁止擅自进入',
  '开放范围以当地最新公告为准',
] as const

export function getMountainDistanceKm({
  difficulty,
  length_km,
}: {
  difficulty: MountainDifficulty
  length_km?: number | null
}) {
  if (difficulty === 'expert') return null
  if (typeof length_km !== 'number' || !Number.isFinite(length_km) || length_km <= 0) return null
  return length_km
}

export function matchesMountainLengthBand(
  lengthKm: number | null,
  band: MountainLengthBand,
) {
  if (band === 'all') return true
  if (lengthKm === null) return false
  if (band === 'short') return lengthKm < 8
  if (band === 'mid') return lengthKm >= 8 && lengthKm < 16
  return lengthKm >= 16
}

export function getEstimatedAscentMeters({
  difficulty,
  altitude,
}: {
  difficulty: MountainDifficulty
  altitude: number
}) {
  if (difficulty === 'advanced' || difficulty === 'expert') return null
  if (!Number.isFinite(altitude) || altitude <= 0) return null
  return Math.max(320, Math.round(altitude * 0.68))
}

export function getEstimatedDurationRange({
  difficulty,
  estimated_duration_minutes,
}: {
  difficulty: MountainDifficulty
  estimated_duration_minutes?: number | null
}) {
  if (difficulty === 'advanced' || difficulty === 'expert') return null
  if (
    typeof estimated_duration_minutes !== 'number'
    || !Number.isFinite(estimated_duration_minutes)
    || estimated_duration_minutes <= 0
  ) {
    return null
  }

  const lowerHours = Math.max(1, Math.floor(estimated_duration_minutes / 60))
  return `${lowerHours}~${lowerHours + 1}h`
}

export function getMountainAccessDisplay(value: string | null | undefined) {
  const status: MountainAccessStatus =
    value === 'open' || value === 'closed' || value === 'pilgrimage_only'
      ? value
      : 'unknown'

  if (status === 'open') {
    return {
      status,
      suitabilityLabel: null,
      ctaLabel: null,
      canStartTrek: true,
    }
  }

  if (status === 'closed') {
    return {
      status,
      suitabilityLabel: '当前不开放',
      ctaLabel: '暂不开放攀登',
      canStartTrek: false,
    }
  }

  if (status === 'pilgrimage_only') {
    return {
      status,
      suitabilityLabel: '仅开放转山路线',
      ctaLabel: '仅支持转山路线',
      canStartTrek: false,
    }
  }

  return {
    status,
    suitabilityLabel: '开放状态待确认',
    ctaLabel: '开放状态待确认',
    canStartTrek: false,
  }
}

export function buildMountainRiskCopy(
  difficulty: MountainDifficulty,
  riskNote: string | null | undefined,
) {
  if (difficulty !== 'advanced' && difficulty !== 'expert') return null

  const parts = riskNote?.trim() ? [riskNote.trim()] : ['高阶山峰风险较高，请充分评估能力并准备撤退方案。']
  for (const warning of REQUIRED_RISK_WARNINGS) {
    if (!parts.some((part) => part.includes(warning))) parts.push(`${warning}。`)
  }
  return parts.join('\n')
}
