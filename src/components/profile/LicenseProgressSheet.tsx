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
  const activeIndex = LICENSE_PROGRESS_ORDER.indexOf(safeLevel)

  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      {LICENSE_PROGRESS_ORDER.map((_, index) => (
        <rect
          key={index}
          x={1 + index * 3}
          y={11 - index * 2.5}
          width="2"
          height={1 + index * 2.5}
          rx="0.4"
          fill={index <= activeIndex ? 'var(--color-success)' : 'var(--color-outline)'}
        />
      ))}
    </svg>
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
          <div className="pt-label-l" style={{ color: 'var(--color-on-surface)', fontWeight: isCurrent ? 700 : 600 }}>
            {getLicenseLevelLabel(level)}
          </div>
          {isCurrent && progress.nextLevel ? (
            <div className="pt-label-s font-mono" style={{ color: 'var(--color-success)' }}>
              {progress.qualifiedCount} / 3
            </div>
          ) : (
            <div className="pt-label-s" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isDone ? '已达成' : '后续'}
            </div>
          )}
        </div>
        <div className="pt-label-s" style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
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
  const topTier = progress.effectiveLevel === 'advanced'

  return (
    <ModalShell
      title="执照进度"
      description={topTier ? '当前已是最高等级' : getNextCopy(progress)}
      onClose={onClose}
      mode="sheet"
      closeControl="icon"
      maxWidth={480}
      bodyStyle={{ display: 'grid', gap: 'var(--space-4)' }}
    >
      <div data-testid="license-progress-sheet" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 'var(--radius-md)',
              border: '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)',
              display: 'grid',
              placeItems: 'center',
              background: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
              flex: '0 0 42px',
            }}
          >
            <LicenseTierGlyph level={progress.effectiveLevel} size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="pt-title-l" data-testid="license-progress-current" style={{ color: 'var(--color-on-surface)' }}>
              {currentLabel}
            </div>
            <div className="pt-body-s" data-testid="license-progress-next" style={{ color: 'var(--color-on-surface-variant)' }}>
              {getNextCopy(progress)}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {LICENSE_PROGRESS_ORDER.map((level) => (
            <Rung key={level} level={level} progress={progress} />
          ))}
        </div>

        <div
          className="pt-label-s"
          data-testid="license-progress-algorithm"
          style={{
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            color: 'var(--color-on-surface-variant)',
            background: 'var(--color-surface-variant)',
            lineHeight: 1.6,
          }}
        >
          每一级都按对应难度或更高难度的有效 GPS 记录计算：beginner → basic，intermediate → intermediate，advanced / expert → advanced。
        </div>

        <Link
          href="/faq#license.license-upgrade"
          data-testid="license-progress-learn-more"
          className="secondary-btn"
          style={{ textDecoration: 'none', justifyContent: 'center' }}
          onClick={onClose}
        >
          了解更多
        </Link>
      </div>
    </ModalShell>
  )
}
