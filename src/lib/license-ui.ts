import type { Mountain, User } from '@/types'

export type LicenseLevelValue = User['license_level'] | Mountain['min_license']
export type DifficultyLevelValue = Mountain['difficulty']

export const LICENSE_UI_ORDER = ['none', 'basic', 'intermediate', 'advanced'] as const

const LICENSE_META: Record<(typeof LICENSE_UI_ORDER)[number], {
  label: string
  shortLabel: string
  requirementLabel: string
  audienceLabel: string
  icon: string
  color: string
}> = {
  none: {
    label: '无执照',
    shortLabel: '无执照',
    requirementLabel: '无需执照',
    audienceLabel: '无执照阶段',
    icon: '○',
    color: '#8d959b',
  },
  basic: {
    label: '初级',
    shortLabel: '初级',
    requirementLabel: '需要初级执照',
    audienceLabel: '初级阶段',
    icon: '◉',
    color: '#6ee7a1',
  },
  intermediate: {
    label: '中级',
    shortLabel: '中级',
    requirementLabel: '需要中级执照',
    audienceLabel: '中级阶段',
    icon: '◈',
    color: '#fcd34d',
  },
  advanced: {
    label: '高级',
    shortLabel: '高级',
    requirementLabel: '需要高级执照',
    audienceLabel: '高级阶段',
    icon: '★',
    color: '#fb923c',
  },
}

const DIFFICULTY_META: Record<DifficultyLevelValue, {
  label: string
  suggestionLabel: string
}> = {
  beginner: {
    label: '入门线',
    suggestionLabel: '建议无执照阶段可尝试',
  },
  intermediate: {
    label: '进阶线',
    suggestionLabel: '建议初级及以上',
  },
  advanced: {
    label: '高阶线',
    suggestionLabel: '建议中级及以上',
  },
  expert: {
    label: '专家线',
    suggestionLabel: '建议高级',
  },
}

function normalizeLicenseLevel(level: string | null | undefined): LicenseLevelValue {
  if (level === 'basic' || level === 'intermediate' || level === 'advanced') return level
  return 'none'
}

function normalizeDifficultyLevel(level: string | null | undefined): DifficultyLevelValue {
  if (level === 'intermediate' || level === 'advanced' || level === 'expert') return level
  return 'beginner'
}

export function getLicenseLevelMeta(level: string | null | undefined) {
  return LICENSE_META[normalizeLicenseLevel(level)]
}

export function getLicenseLevelLabel(level: string | null | undefined) {
  return getLicenseLevelMeta(level).label
}

export function getLicenseShortLabel(level: string | null | undefined) {
  return getLicenseLevelMeta(level).shortLabel
}

export function getLicenseRequirementLabel(level: string | null | undefined) {
  return getLicenseLevelMeta(level).requirementLabel
}

export function getLicenseAudienceLabel(level: string | null | undefined) {
  return getLicenseLevelMeta(level).audienceLabel
}

export function getLicenseIcon(level: string | null | undefined) {
  return getLicenseLevelMeta(level).icon
}

export function getLicenseColor(level: string | null | undefined) {
  return getLicenseLevelMeta(level).color
}

export function getDifficultyLevelLabel(level: string | null | undefined) {
  const difficulty = normalizeDifficultyLevel(level)
  return DIFFICULTY_META[difficulty].label
}

export function getDifficultyLevelRequirement(level: string | null | undefined) {
  const difficulty = normalizeDifficultyLevel(level)
  return DIFFICULTY_META[difficulty].suggestionLabel
}

export function getDifficultySuitabilityCopy(level: string | null | undefined) {
  const difficulty = normalizeDifficultyLevel(level)

  switch (difficulty) {
    case 'beginner':
      return '适合无执照阶段或第一次系统徒步的人。'
    case 'intermediate':
      return '适合初级阶段，最好已有基础徒步经验。'
    case 'advanced':
      return '适合中级阶段，能稳定完成长线和大爬升。'
    case 'expert':
      return '适合高级阶段，建议已经适应高海拔和复杂天气。'
    default:
      return '建议先确认自己的经验、装备和天气准备。'
  }
}

export function getLockPromptCopy(level: string | null | undefined) {
  const normalizedLevel = normalizeLicenseLevel(level)
  if (normalizedLevel === 'none') {
    return '当前路线无需执照，可以直接开始记录。'
  }
  return `当前路线建议${getLicenseLevelLabel(normalizedLevel)}及以上经验；这是提醒，不会阻止你继续记录。`
}
