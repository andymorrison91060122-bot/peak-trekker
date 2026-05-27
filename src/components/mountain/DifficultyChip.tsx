import type { Mountain } from '@/types'

const DIFFICULTY_META: Record<Mountain['difficulty'], {
  label: string
  suggestion?: string
  level: number
}> = {
  beginner: {
    label: '入门线',
    level: 1,
  },
  intermediate: {
    label: '进阶线',
    suggestion: '建议初级及以上',
    level: 2,
  },
  advanced: {
    label: '高阶线',
    suggestion: '建议中级及以上',
    level: 3,
  },
  expert: {
    label: '专家线',
    suggestion: '建议高级',
    level: 4,
  },
}

function normalizeDifficulty(value: string | null | undefined): Mountain['difficulty'] {
  if (value === 'intermediate' || value === 'advanced' || value === 'expert') return value
  return 'beginner'
}

function DifficultyGlyph({ level }: { level: number }) {
  const heights = [4, 7, 10, 13]

  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 14,
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 2,
        flex: '0 0 18px',
      }}
    >
      {heights.map((height, index) => (
        <span
          key={height}
          style={{
            width: 3,
            height,
            borderRadius: 2,
            background: index < level ? 'var(--color-success)' : 'transparent',
            border: index < level ? '0' : '1px solid var(--color-outline)',
            opacity: index < level ? 1 : 0.72,
            boxSizing: 'border-box',
          }}
        />
      ))}
    </span>
  )
}

export default function DifficultyChip({
  difficulty,
  withSuggestion = false,
}: {
  difficulty: Mountain['difficulty'] | string | null | undefined
  withSuggestion?: boolean
}) {
  const normalized = normalizeDifficulty(difficulty)
  const meta = DIFFICULTY_META[normalized]
  const compactBeginner = normalized === 'beginner'

  return (
    <span
      data-testid="difficulty-chip"
      data-difficulty={normalized}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        minHeight: 24,
        borderRadius: 'var(--radius-pill)',
        padding: '0 var(--space-2)',
        border: '1px solid var(--color-outline)',
        background: 'color-mix(in srgb, var(--color-on-surface) 5%, transparent)',
        color: 'var(--color-on-surface)',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}
    >
      {!compactBeginner ? <DifficultyGlyph level={meta.level} /> : null}
      <span className="pt-label-s">{meta.label}</span>
      {withSuggestion && !compactBeginner && meta.suggestion ? (
        <>
          <span className="pt-label-s" aria-hidden="true" style={{ color: 'var(--color-on-surface-variant)' }}>·</span>
          <span className="pt-label-s" style={{ color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {meta.suggestion}
          </span>
        </>
      ) : null}
    </span>
  )
}
