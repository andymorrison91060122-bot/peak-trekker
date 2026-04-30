'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ONBOARDING_EVENT,
  getOnboardingProgress,
  getProvinceDraft,
  resetActivationProgress,
  restartIntroFlow,
} from '@/lib/onboarding'
import {
  ONBOARDING_QA_SCENARIOS,
  QA_CHECKLIST_EVENT,
  clearChecklist,
  readChecklist,
  writeChecklist,
} from '@/lib/qa-scenarios'
import type { OnboardingProgress } from '@/types'

const DEFAULT_PROGRESS: OnboardingProgress = {
  introSeen: false,
  provinceChosen: false,
  activationCompleted: false,
  version: 'unknown',
  tasks: {
    find_peak: false,
    open_start: false,
    learn_share: false,
  },
}

export default function OnboardingRegressionChecklist() {
  const router = useRouter()
  const [progress, setProgress] = useState<OnboardingProgress>(DEFAULT_PROGRESS)
  const [provinceDraft, setProvinceDraft] = useState<string | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const refresh = () => {
      setProgress(getOnboardingProgress())
      setProvinceDraft(getProvinceDraft())
      setChecked(readChecklist('onboarding'))
    }

    const frame = window.requestAnimationFrame(() => {
      refresh()
    })

    window.addEventListener(ONBOARDING_EVENT, refresh)
    window.addEventListener(QA_CHECKLIST_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener(ONBOARDING_EVENT, refresh)
      window.removeEventListener(QA_CHECKLIST_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const finishedCount = useMemo(
    () => ONBOARDING_QA_SCENARIOS.filter((scenario) => checked[scenario.id]).length,
    [checked]
  )

  function updateChecked(id: string, value: boolean) {
    const next = { ...checked, [id]: value }
    setChecked(next)
    writeChecklist('onboarding', next)
  }

  function clearChecked() {
    setChecked({})
    clearChecklist('onboarding')
    setMessage('已清空本地回归勾选状态。')
  }

  function resetToFirstVisit() {
    restartIntroFlow()
    setMessage('已重置到首次访问状态。')
    startTransition(() => router.push('/explore'))
  }

  function resetPhaseBOnly() {
    resetActivationProgress()
    setMessage('已重置 Phase B checklist，保留 intro 与省份草稿。')
    startTransition(() => router.push('/explore'))
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="surface-card" style={{ padding: 18 }}>
        <div className="font-pixel" style={{ fontSize: 22, marginBottom: 8 }}>
          Onboarding 回归清单
        </div>
        <div className="section-subtitle" style={{ marginBottom: 14 }}>
          这页用于演示和验收真实用户链路，覆盖首次访问、省份锚定、注册回流与 activation 完成。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
          <Metric title="回归完成度" value={`${finishedCount}/${ONBOARDING_QA_SCENARIOS.length}`} />
          <Metric title="省份草稿" value={provinceDraft ?? '未选择'} />
          <Metric title="Phase A" value={progress.introSeen ? '已完成' : '未完成'} />
          <Metric title="Phase B" value={progress.activationCompleted ? '已完成' : '未完成'} />
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" className="secondary-btn" disabled={isPending} onClick={resetToFirstVisit}>
            重置到首次访问（重播三幕）
          </button>
          <button type="button" className="secondary-btn" disabled={isPending} onClick={resetPhaseBOnly}>
            仅重置 Phase B checklist
          </button>
          <button type="button" className="secondary-btn" onClick={clearChecked}>
            清空回归勾选
          </button>
        </div>

        {message && (
          <div className="section-subtitle" style={{ marginTop: 10, color: 'var(--green-bright)' }}>
            {message}
          </div>
        )}
      </div>

      {ONBOARDING_QA_SCENARIOS.map((scenario) => (
        <div key={scenario.id} className="surface-card" style={{ padding: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(checked[scenario.id])}
              onChange={(event) => updateChecked(scenario.id, event.target.checked)}
            />
            <span className="font-pixel" style={{ fontSize: 16 }}>{scenario.title}</span>
          </label>

          <div className="metric-tile" style={{ marginBottom: 10 }}>
            <div className="metric-label">入口页面</div>
            <div className="font-mono" style={{ fontSize: 13 }}>{scenario.startAt}</div>
          </div>
          <div className="metric-tile" style={{ marginBottom: 10 }}>
            <div className="metric-label">操作路径</div>
            <div className="section-subtitle">{scenario.action}</div>
          </div>
          <div className="metric-tile" style={{ marginBottom: 10 }}>
            <div className="metric-label">预期结果</div>
            <div className="section-subtitle">{scenario.expect}</div>
          </div>

          <button
            type="button"
            className="secondary-btn"
            style={{ minHeight: 40, padding: '0 14px' }}
            onClick={() => router.push(scenario.startAt)}
          >
            前往该场景
          </button>
        </div>
      ))}
    </div>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="metric-tile">
      <div className="font-pixel" style={{ fontSize: 16, marginBottom: 4 }}>{value}</div>
      <div className="metric-label">{title}</div>
    </div>
  )
}
