'use client'

import type { Mountain, User } from '@/types'
import {
  compareLicenseLevels,
  getRecommendedLicenseForDifficulty,
} from '@/lib/license-progress'
import { getLicenseLevelLabel } from '@/lib/license-ui'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { WarnIcon } from '@/components/ui/Icons'

const DIFFICULTY_LABEL: Record<Mountain['difficulty'], string> = {
  beginner: '入门线',
  intermediate: '进阶线',
  advanced: '高阶线',
  expert: '专家线',
}

function normalizeDifficulty(value: Mountain['difficulty'] | string | null | undefined): Mountain['difficulty'] {
  if (value === 'intermediate' || value === 'advanced' || value === 'expert') return value
  return 'beginner'
}

export default function DifficultyAdvisory({
  difficulty,
  userLicense,
  mountainName,
  onContinue,
  compact = false,
}: {
  difficulty: Mountain['difficulty'] | string | null | undefined
  userLicense: User['license_level'] | string | null | undefined
  mountainName?: string
  onContinue?: () => void
  compact?: boolean
}) {
  const normalizedDifficulty = normalizeDifficulty(difficulty)
  const recommendedLicense = getRecommendedLicenseForDifficulty(normalizedDifficulty)
  const currentLicense = (userLicense === 'basic' || userLicense === 'intermediate' || userLicense === 'advanced')
    ? userLicense
    : 'none'
  const gap = compareLicenseLevels(recommendedLicense, currentLicense)

  if (gap <= 0) return null

  const recommendedLabel = getLicenseLevelLabel(recommendedLicense)
  const currentLabel = getLicenseLevelLabel(currentLicense)
  const difficultyLabel = DIFFICULTY_LABEL[normalizedDifficulty]
  const namePrefix = mountainName ? `${mountainName} · ` : ''

  if (gap === 1 || compact) {
    return (
      <div
        data-testid="difficulty-advisory"
        data-advisory-level="inline"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          alignItems: 'flex-start',
          borderRadius: 'var(--radius-md)',
          border: '1px solid color-mix(in srgb, var(--color-warning) 32%, transparent)',
          background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
          padding: 'var(--space-3)',
          color: 'var(--color-on-surface)',
        }}
      >
        <WarnIcon size={16} />
        <div className="pt-label-s" style={{ lineHeight: 1.55 }}>
          {namePrefix}{difficultyLabel}建议 {recommendedLabel} 及以上；你当前为 {currentLabel}。这是出发提醒，不影响继续操作。
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="difficulty-advisory"
      data-advisory-level="banner"
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid color-mix(in srgb, var(--color-warning) 38%, transparent)',
        background: 'color-mix(in srgb, var(--color-warning) 9%, transparent)',
        padding: 'var(--space-4)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-pill)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--color-warning)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 45%, transparent)',
            background: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
            flex: '0 0 28px',
          }}
        >
          <WarnIcon size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="pt-label-l" style={{ color: 'var(--color-on-surface)', fontWeight: 700 }}>
            这座山高于你的当前等级
          </div>
          <div className="pt-label-s" style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginTop: 2 }}>
            {namePrefix}{difficultyLabel}建议 {recommendedLabel} 及以上；你当前为 {currentLabel}。建议做好装备、天气和撤退判断。
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--space-2)' }}>
        <PrimaryButton type="button" onClick={onContinue}>
          我了解 · 继续
        </PrimaryButton>
        <SecondaryButton as="a" href="/profile?licenseSheet=1">
          看我的等级
        </SecondaryButton>
      </div>
    </div>
  )
}
