'use client'

import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'
import {
  LICENSE_PROGRESS_ORDER,
  type LicenseLevel,
  type LicenseProgressSummary,
  type DifficultyLevel,
} from '@/lib/license-progress'
import { getLicenseLevelLabel } from '@/lib/license-ui'

const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  beginner: '入门线',
  intermediate: '进阶线',
  advanced: '高阶线',
  expert: '专家线',
}

export function LicenseTierGlyph({
  level,
  size = 14,
}: {
  level: LicenseLevel | string | null | undefined
  size?: number
}) {
  const safeLevel = LICENSE_PROGRESS_ORDER.includes(level as LicenseLevel) ? (level as LicenseLevel) : 'none'
  const activeSegments = {
    none: 0,
    basic: 2,
    intermediate: 3,
    advanced: 4,
  } satisfies Record<LicenseLevel, number>
  const heights = [4, 7, 10, 13]

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: Math.max(1, Math.round(size / 7)),
        flex: `0 0 ${size}px`,
      }}
    >
      {heights.map((height, index) => (
        <span
          key={height}
          style={{
            width: Math.max(2, Math.round(size / 7)),
            height: Math.max(2, Math.round((height / 14) * size)),
            borderRadius: 2,
            background: index < activeSegments[safeLevel]
              ? 'var(--color-success)'
              : 'color-mix(in srgb, var(--color-success) 10%, transparent)',
            border: index < activeSegments[safeLevel]
              ? '0'
              : '1px solid color-mix(in srgb, var(--color-success) 38%, var(--color-outline))',
            boxSizing: 'border-box',
          }}
        />
      ))}
    </span>
  )
}

function getNextCopy(progress: LicenseProgressSummary) {
  if (!progress.nextLevel || !progress.targetDifficulty) {
    return '已经到达当前执照体系最高等级，继续保持真实 GPS 记录。'
  }

  const difficultyLabel = DIFFICULTY_LABEL[progress.targetDifficulty]
  return `再完成 ${progress.remainingCount} 座 ${difficultyLabel} 及以上 GPS 有效记录 · 升入 ${getLicenseLevelLabel(progress.nextLevel)}`
}

function Rung({
  level,
  progress,
}: {
  level: LicenseLevel
  progress: LicenseProgressSummary
}) {
  const rung = progress.rungs.find((item) => item.level === level)
  const state = rung?.state ?? 'future'
  const isCurrent = state === 'current'
  const isDone = state === 'done'

  return (
    <div
      data-testid="license-progress-rung"
      data-license-level={level}
      data-license-state={state}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: isCurrent
          ? '1px solid color-mix(in srgb, var(--color-success) 32%, transparent)'
          : '1px solid var(--color-outline)',
        background: isCurrent
          ? 'color-mix(in srgb, var(--color-success) 8%, transparent)'
          : 'color-mix(in srgb, var(--color-on-surface) 2%, transparent)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          borderRadius: 'var(--radius-pill)',
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 24px',
          color: isDone ? 'var(--color-surface)' : 'var(--color-success)',
          background: isDone ? 'var(--color-success)' : 'transparent',
          border: isDone ? '0' : '1.5px solid color-mix(in srgb, var(--color-success) 42%, var(--color-outline))',
        }}
      >
        {isDone ? '✓' : <span style={{ width: 8, height: 8, borderRadius: 999, background: 'currentColor' }} />}
      </div>
      <div style={{ minWidth: 0, flex: '1 1 auto', display: 'grid', gap: 'var(--space-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'baseline' }}>
          <div style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.35, fontWeight: isCurrent ? 600 : 500 }}>
            {getLicenseLevelLabel(level)}
          </div>
          {isCurrent && progress.nextLevel ? (
            <div className="font-mono" style={{ color: 'var(--color-success)', fontSize: 11, lineHeight: 1.3, letterSpacing: 0 }}>
              {progress.qualifiedCount} / 3
            </div>
          ) : (
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, lineHeight: 1.3 }}>
              {isDone ? '已达成' : '后续'}
            </div>
          )}
        </div>
        <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, lineHeight: 1.55 }}>
          {rung?.requirement}
        </div>
        {isCurrent && progress.nextLevel ? (
          <div
            aria-hidden="true"
            style={{
              height: 4,
              borderRadius: 'var(--radius-pill)',
              overflow: 'hidden',
              background: 'var(--color-outline)',
              marginTop: 2,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.round((progress.qualifiedCount / 3) * 100))}%`,
                borderRadius: 'inherit',
                background: 'var(--color-success)',
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function LicenseProgressSheet({
  open,
  progress,
  onClose,
}: {
  open: boolean
  progress: LicenseProgressSummary
  onClose: () => void
}) {
  if (!open) return null

  const currentLabel = getLicenseLevelLabel(progress.effectiveLevel)

  return (
    <ModalShell
      title="执照进度"
      onClose={onClose}
      mode="sheet"
      closeControl="icon"
      maxWidth={480}
      bodyStyle={{ display: 'grid', gap: 'var(--space-4)', paddingTop: 'var(--space-1)' }}
      headerContent={(
        <div
          className="font-mono"
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 14,
            lineHeight: 1.2,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          执照 · LICENSE
        </div>
      )}
    >
      <div data-testid="license-progress-sheet" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div style={{ minWidth: 0 }}>
          <div
            data-testid="license-progress-current"
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 22,
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: '-0.015em',
            }}
          >
            {currentLabel}
          </div>
          <div
            data-testid="license-progress-next"
            style={{ color: 'var(--color-on-surface-variant)', fontSize: 13, lineHeight: 1.6, marginTop: 4 }}
          >
            {getNextCopy(progress)}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {LICENSE_PROGRESS_ORDER.map((level) => (
            <Rung key={level} level={level} progress={progress} />
          ))}
        </div>

        <Link
          href="/faq?anchor=license.license-upgrade"
          data-testid="license-progress-learn-more"
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 13,
            lineHeight: 1.4,
            textDecoration: 'none',
            display: 'inline-flex',
            justifyContent: 'center',
            minHeight: 32,
            alignItems: 'center',
          }}
          onClick={onClose}
        >
          了解更多 →
        </Link>
      </div>
    </ModalShell>
  )
}
