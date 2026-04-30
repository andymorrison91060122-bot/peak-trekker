'use client'

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function normalizeDifficulty(level: string | null | undefined) {
  if (level === 'intermediate' || level === 'advanced' || level === 'expert') {
    return level
  }

  if (level === 'beginner') {
    return level
  }

  return null
}

function getThresholdLabel(level: string | null | undefined) {
  const normalized = normalizeDifficulty(level)

  switch (normalized) {
    case 'beginner':
      return '入门'
    case 'intermediate':
      return '中级'
    case 'advanced':
      return '高级'
    case 'expert':
      return '专家'
    default:
      return null
  }
}

export default function CommunityThresholdTag({
  difficulty,
  className,
}: {
  difficulty: string | null | undefined
  className?: string
}) {
  const normalized = normalizeDifficulty(difficulty)
  const label = getThresholdLabel(difficulty)

  if (!normalized || !label) {
    return null
  }

  return (
    <span
      data-testid="community-post-threshold"
      data-level={normalized}
      className={joinClassNames('community-threshold-tag', className)}
    >
      {label}
    </span>
  )
}
