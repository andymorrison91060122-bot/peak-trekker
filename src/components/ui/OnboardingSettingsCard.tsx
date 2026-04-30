'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ONBOARDING_EVENT,
  getOnboardingProgress,
  getProvinceDraft,
  resetActivationProgress,
  restartIntroFlow,
} from '@/lib/onboarding'
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

export default function OnboardingSettingsCard() {
  const router = useRouter()
  const [progress, setProgress] = useState<OnboardingProgress>(DEFAULT_PROGRESS)
  const [provinceDraft, setProvinceDraft] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const refresh = () => {
      setProgress(getOnboardingProgress())
      setProvinceDraft(getProvinceDraft())
    }

    const frame = window.requestAnimationFrame(refresh)
    window.addEventListener(ONBOARDING_EVENT, refresh)
    window.addEventListener('storage', refresh)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener(ONBOARDING_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const finishedCount = Number(progress.tasks.find_peak) + Number(progress.tasks.open_start) + Number(progress.tasks.learn_share)

  function replayIntro() {
    restartIntroFlow()
    setMessage('已重置为首次访问状态，返回探索页会重新播放三幕引导。')
    startTransition(() => {
      router.push('/explore')
    })
  }

  function resetChecklist() {
    resetActivationProgress()
    setMessage('已重置新手任务清单，保留当前省份归属。')
    startTransition(() => {
      router.push('/explore')
    })
  }

  return (
    <div className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
      <div className="font-pixel" style={{ fontSize: 18, marginBottom: 6 }}>
        新手引导设置
      </div>
      <div className="section-subtitle" style={{ marginBottom: 14 }}>
        这里用于验证和复盘 onboarding 流程，不影响你的登顶记录。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        <div className="metric-tile">
          <div className="font-pixel" style={{ fontSize: 16 }}>{progress.introSeen ? '已完成' : '未完成'}</div>
          <div className="metric-label">Phase A 预告片</div>
        </div>
        <div className="metric-tile">
          <div className="font-pixel" style={{ fontSize: 16 }}>{provinceDraft ?? '未选择'}</div>
          <div className="metric-label">省份锚定</div>
        </div>
        <div className="metric-tile">
          <div className="font-pixel" style={{ fontSize: 16 }}>{finishedCount}/3</div>
          <div className="metric-label">Checklist 进度</div>
        </div>
        <div className="metric-tile">
          <div className="font-pixel" style={{ fontSize: 16 }}>{progress.activationCompleted ? '已激活' : '待激活'}</div>
          <div className="metric-label">Phase B 状态</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <button type="button" className="secondary-btn" onClick={replayIntro} disabled={isPending}>
          重新播放三幕引导
        </button>
        <button type="button" className="secondary-btn" onClick={resetChecklist} disabled={isPending}>
          重置新手任务清单
        </button>
      </div>

      {message && (
        <div className="section-subtitle" style={{ marginTop: 12, color: 'var(--green-bright)' }}>
          {message}
        </div>
      )}
    </div>
  )
}
