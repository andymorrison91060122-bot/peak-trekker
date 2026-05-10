'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import ModalShell from '@/components/ui/ModalShell'
import { getLicenseLevelLabel, getLicenseRequirementLabel } from '@/lib/license-ui'

const LICENSE_REQUIREMENTS: Record<string, {
  currentMaxHint: string
  current_max: number
  steps: string[]
}> = {
  basic: {
    currentMaxHint: '你可以先从无执照阶段可进入的路线开始。',
    current_max: 1000,
    steps: [
      '完成 3 座 1000m 以下山峰的真实打卡。',
      '系统自动升级为初级执照。',
      '解锁 2000m 级别山峰。',
    ],
  },
  intermediate: {
    currentMaxHint: '先把初级阶段的路线稳定完成，会更快接近中级。',
    current_max: 2000,
    steps: [
      '先持有初级执照。',
      '完成 3 座 2000m 以下山峰的真实打卡。',
      '系统自动升级为中级执照。',
    ],
  },
  advanced: {
    currentMaxHint: '先把中级阶段路线走稳，再准备更高海拔的挑战。',
    current_max: 4000,
    steps: [
      '先持有中级执照。',
      '完成 3 座 4000m 以下山峰的真实打卡。',
      '系统自动升级为高级执照。',
    ],
  },
}

export default function LockModal({
  mountainName,
  altitude,
  minLicense,
  onClose,
}: {
  mountainName: string
  altitude: number
  minLicense: string
  onClose: () => void
}) {
  const info = LICENSE_REQUIREMENTS[minLicense]

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!info) return null

  return (
    <ModalShell
      title="需要更高等级执照"
      description={`${mountainName} · ▲ ${altitude.toLocaleString()} m`}
      onClose={onClose}
      mode="sheet"
      maxWidth={480}
      footer={
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <button onClick={onClose} className="secondary-btn" style={{ width: '100%' }}>
            知道了
          </button>
          <Link href="/profile" className="primary-btn" style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}>
            看执照进度
          </Link>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="danger-card" style={{ padding: 16 }}>
          <div className="card-title" style={{ fontSize: 16, color: 'color-mix(in oklch, var(--color-error) 32%, var(--color-on-surface))', marginBottom: 8 }}>
            {getLicenseLevelLabel(minLicense)}
          </div>
          <div className="section-subtitle" style={{ color: 'color-mix(in oklch, var(--color-error) 58%, var(--color-on-surface))' }}>
            当前路线{getLicenseRequirementLabel(minLicense)}。{info.currentMaxHint} 你当前优先完成 {info.current_max.toLocaleString()} m 以下的山峰，会更快解锁下一阶段路线。
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
          {info.steps.map((step, index) => (
            <div key={step} className="surface-card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--accent-outline)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--green-bright)',
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </div>
              <div className="section-subtitle" style={{ color: 'var(--text-secondary)' }}>
                {step}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  )
}
