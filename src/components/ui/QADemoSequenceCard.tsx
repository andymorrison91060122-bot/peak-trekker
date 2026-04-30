'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ONBOARDING_QA_SCENARIOS,
  TREK_QA_SCENARIOS,
  QA_CHECKLIST_EVENT,
  markChecklistItem,
  readChecklist,
} from '@/lib/qa-scenarios'

const DEMO_STATE_KEY = 'peak_trekker_qa_demo_sequence_state_v1'

type DemoStep = {
  group: 'onboarding' | 'trek'
  id: string
  title: string
  startAt: string
}

const ORDERED_STEPS: Array<{ group: DemoStep['group']; id: string }> = [
  { group: 'onboarding', id: 'first-visit-intro' },
  { group: 'onboarding', id: 'skip-to-province' },
  { group: 'onboarding', id: 'province-personalization' },
  { group: 'onboarding', id: 'register-prefill' },
  { group: 'onboarding', id: 'activation-find-peak' },
  { group: 'onboarding', id: 'activation-open-start' },
  { group: 'onboarding', id: 'activation-learn-share' },
  { group: 'onboarding', id: 'repeat-suppression' },
  { group: 'trek', id: 'trek-happy-path' },
  { group: 'trek', id: 'community-priority' },
  { group: 'trek', id: 'profile-consistency' },
  { group: 'trek', id: 'gps-permission-denied' },
  { group: 'trek', id: 'insufficient-track-points' },
  { group: 'trek', id: 'duplicate-summit-submit' },
  { group: 'trek', id: 'photo-upload-failed' },
  { group: 'trek', id: 'share-card-fallback' },
]

type DemoState = {
  active: boolean
  index: number
}

function getScenario(group: DemoStep['group'], id: string) {
  if (group === 'onboarding') {
    return ONBOARDING_QA_SCENARIOS.find((item) => item.id === id)
  }
  return TREK_QA_SCENARIOS.find((item) => item.id === id)
}

const DEMO_STEPS: DemoStep[] = ORDERED_STEPS.flatMap((item) => {
  const scenario = getScenario(item.group, item.id)
  if (!scenario) return []
  return [{
    group: item.group,
    id: scenario.id,
    title: scenario.title,
    startAt: scenario.startAt,
  }]
})

function clampIndex(index: number) {
  if (DEMO_STEPS.length === 0) return 0
  return Math.max(0, Math.min(index, DEMO_STEPS.length - 1))
}

function loadDemoState() {
  if (typeof window === 'undefined') {
    return { active: false, index: 0 } as DemoState
  }
  const raw = window.localStorage.getItem(DEMO_STATE_KEY)
  if (!raw) return { active: false, index: 0 } as DemoState
  try {
    const parsed = JSON.parse(raw) as Partial<DemoState>
    return {
      active: Boolean(parsed.active),
      index: clampIndex(Number(parsed.index ?? 0)),
    }
  } catch {
    return { active: false, index: 0 } as DemoState
  }
}

function persistDemoState(state: DemoState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state))
}

function formatReportTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

export default function QADemoSequenceCard() {
  const router = useRouter()
  const [state, setState] = useState<DemoState>(loadDemoState)
  const [message, setMessage] = useState('')
  const [reportTime, setReportTime] = useState(() => formatReportTime())
  const [onboardingChecked, setOnboardingChecked] = useState<Record<string, boolean>>(() => readChecklist('onboarding'))
  const [trekChecked, setTrekChecked] = useState<Record<string, boolean>>(() => readChecklist('trek'))

  useEffect(() => {
    const refresh = () => {
      setOnboardingChecked(readChecklist('onboarding'))
      setTrekChecked(readChecklist('trek'))
    }
    window.addEventListener(QA_CHECKLIST_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(QA_CHECKLIST_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const currentStep = DEMO_STEPS[state.index]
  const doneCount = useMemo(() => {
    return DEMO_STEPS.filter((step) => {
      return step.group === 'onboarding'
        ? onboardingChecked[step.id]
        : trekChecked[step.id]
    }).length
  }, [onboardingChecked, trekChecked])
  const pendingCount = DEMO_STEPS.length - doneCount
  const onboardingDoneCount = useMemo(
    () => ONBOARDING_QA_SCENARIOS.filter((item) => onboardingChecked[item.id]).length,
    [onboardingChecked]
  )
  const trekDoneCount = useMemo(
    () => TREK_QA_SCENARIOS.filter((item) => trekChecked[item.id]).length,
    [trekChecked]
  )
  const blockingFailures = useMemo(
    () => TREK_QA_SCENARIOS.filter((item) => item.type === 'failure' && !trekChecked[item.id]),
    [trekChecked]
  )
  const pendingHappyTrek = useMemo(
    () => TREK_QA_SCENARIOS.filter((item) => item.type === 'happy' && !trekChecked[item.id]),
    [trekChecked]
  )
  const pendingOnboarding = useMemo(
    () => ONBOARDING_QA_SCENARIOS.filter((item) => !onboardingChecked[item.id]),
    [onboardingChecked]
  )
  const hasBlocking = blockingFailures.length > 0
  const releaseDecision = hasBlocking
    ? '需修复后再发布'
    : pendingCount === 0
      ? '可发布（验收完成）'
      : '可灰度验证（无阻塞）'
  const releaseReason = hasBlocking
    ? `存在 ${blockingFailures.length} 个阻塞异常场景未通过。`
    : pendingCount === 0
      ? '全部回归场景已通过。'
      : `仍有 ${pendingCount} 个待验证场景，但无阻塞异常项。`
  const recommendedActions = useMemo(() => {
    if (blockingFailures.length > 0) {
      return blockingFailures.map((item) => `优先修复：${item.title}`)
    }
    const pending = [...pendingHappyTrek.map((item) => item.title), ...pendingOnboarding.map((item) => item.title)]
    if (pending.length > 0) {
      return pending.map((title) => `继续验证：${title}`)
    }
    return ['进入预发布验收并观察真实用户数据。']
  }, [blockingFailures, pendingHappyTrek, pendingOnboarding])

  function setAndPersist(next: DemoState) {
    const normalized = { ...next, index: clampIndex(next.index) }
    setState(normalized)
    persistDemoState(normalized)
  }

  function getStepDone(step: DemoStep) {
    return step.group === 'onboarding'
      ? Boolean(onboardingChecked[step.id])
      : Boolean(trekChecked[step.id])
  }

  function markCurrentStep(value: boolean) {
    if (!currentStep) return
    markChecklistItem(currentStep.group, currentStep.id, value)
  }

  function startSequence() {
    if (!currentStep) return
    const next = { active: true, index: 0 }
    setAndPersist(next)
    router.push(DEMO_STEPS[0].startAt)
    setMessage('演示顺序已启动，可按“标记通过并下一步”连续推进。')
  }

  function jumpToIndex(index: number) {
    const nextIndex = clampIndex(index)
    const next = { active: true, index: nextIndex }
    setAndPersist(next)
    router.push(DEMO_STEPS[nextIndex].startAt)
    setMessage('')
  }

  function nextStep(markCurrent: boolean) {
    if (!currentStep) return
    if (markCurrent) {
      markChecklistItem(currentStep.group, currentStep.id, true)
    }

    if (state.index >= DEMO_STEPS.length - 1) {
      setAndPersist({ active: false, index: DEMO_STEPS.length - 1 })
      setMessage('演示顺序已完成。你可以重置后重新开始。')
      return
    }

    const nextIndex = state.index + 1
    setAndPersist({ active: true, index: nextIndex })
    router.push(DEMO_STEPS[nextIndex].startAt)
    setMessage('')
  }

  function previousStep() {
    if (!currentStep) return
    const nextIndex = clampIndex(state.index - 1)
    setAndPersist({ active: true, index: nextIndex })
    router.push(DEMO_STEPS[nextIndex].startAt)
    setMessage('')
  }

  function resetSequence() {
    setAndPersist({ active: false, index: 0 })
    setMessage('演示顺序已重置。')
  }

  const reportMarkdown = useMemo(() => {
    const lines: string[] = [
      '# Peak Trekker QA Demo Report',
      '',
      `- Generated At: ${reportTime}`,
      `- Sequence Status: ${state.active ? '进行中' : '未启动'}`,
      `- Current Step: ${state.index + 1}/${DEMO_STEPS.length} (${currentStep?.title ?? 'N/A'})`,
      `- Completion: ${doneCount}/${DEMO_STEPS.length} (Pending: ${pendingCount})`,
      `- Onboarding: ${onboardingDoneCount}/${ONBOARDING_QA_SCENARIOS.length}`,
      `- Trek: ${trekDoneCount}/${TREK_QA_SCENARIOS.length}`,
      '',
      '## Auto Conclusion',
      `- Release Decision: ${releaseDecision}`,
      `- Reason: ${releaseReason}`,
      `- Blocking Items: ${blockingFailures.length}`,
      '',
      '## Onboarding Regression',
    ]

    if (blockingFailures.length > 0) {
      for (const item of blockingFailures) {
        lines.push(`- [BLOCKING] ${item.title} (${item.startAt})`)
      }
      lines.push('')
    }

    for (const scenario of ONBOARDING_QA_SCENARIOS) {
      const passed = Boolean(onboardingChecked[scenario.id])
      lines.push(`- [${passed ? 'x' : ' '}] ${scenario.title} (${scenario.startAt})`)
    }

    lines.push('', '## Trek Verification Regression')
    for (const scenario of TREK_QA_SCENARIOS) {
      const passed = Boolean(trekChecked[scenario.id])
      lines.push(`- [${passed ? 'x' : ' '}] ${scenario.title} (${scenario.startAt})`)
    }

    lines.push('', '## Recommended Next Actions')
    for (let i = 0; i < recommendedActions.length; i += 1) {
      lines.push(`${i + 1}. ${recommendedActions[i]}`)
    }

    return lines.join('\n')
  }, [
    blockingFailures,
    currentStep?.title,
    doneCount,
    onboardingChecked,
    onboardingDoneCount,
    pendingCount,
    recommendedActions,
    releaseDecision,
    releaseReason,
    reportTime,
    state.active,
    state.index,
    trekChecked,
    trekDoneCount,
  ])

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportMarkdown)
      setReportTime(formatReportTime())
      setMessage('已复制 QA 报告摘要到剪贴板。')
    } catch {
      const input = document.createElement('textarea')
      input.value = reportMarkdown
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setReportTime(formatReportTime())
      setMessage('已复制 QA 报告摘要到剪贴板。')
    }
  }

  function downloadReport() {
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `peak-trekker-qa-report-${new Date().toISOString().slice(0, 10)}.md`
    anchor.click()
    URL.revokeObjectURL(url)
    setReportTime(formatReportTime())
    setMessage('已下载 QA 报告（Markdown）。')
  }

  if (!currentStep) return null

  return (
    <div className="surface-card" style={{ padding: 18 }}>
      <div className="font-pixel" style={{ fontSize: 22, marginBottom: 8 }}>
        演示顺序模式
      </div>
      <div className="section-subtitle" style={{ marginBottom: 14 }}>
        一键按步骤跳转页面，减少手动切页。建议配合下方两组回归清单使用。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
        <Metric title="当前步骤" value={`${state.index + 1}/${DEMO_STEPS.length}`} />
        <Metric title="已完成" value={`${doneCount}/${DEMO_STEPS.length}`} />
        <Metric title="待完成" value={`${pendingCount}`} />
        <Metric title="状态" value={state.active ? '进行中' : '未启动'} />
      </div>

      <div className="metric-tile" style={{ marginBottom: 12 }}>
        <div className="metric-label" style={{ marginBottom: 4 }}>当前场景</div>
        <div className="font-pixel" style={{ fontSize: 16 }}>{currentStep.title}</div>
        <div className="section-subtitle" style={{ marginTop: 6 }}>
          {currentStep.group === 'onboarding' ? 'Onboarding' : '登顶核验'} · {currentStep.startAt}
        </div>
      </div>

      <div
        className="metric-tile"
        style={{
          marginBottom: 12,
          borderColor: hasBlocking ? 'rgba(248,113,113,0.35)' : 'rgba(34,197,94,0.32)',
          background: hasBlocking ? 'rgba(248,113,113,0.08)' : 'rgba(34,197,94,0.08)',
        }}
      >
        <div className="metric-label" style={{ marginBottom: 4 }}>自动结论</div>
        <div className="font-pixel" style={{ fontSize: 16, marginBottom: 6 }}>{releaseDecision}</div>
        <div className="section-subtitle" style={{ marginBottom: 6 }}>{releaseReason}</div>
        {recommendedActions.slice(0, 3).map((item) => (
          <div key={item} className="section-subtitle">{item}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <button type="button" className="secondary-btn" onClick={startSequence}>
          一键开始
        </button>
        <button type="button" className="secondary-btn" onClick={() => router.push(currentStep.startAt)}>
          打开当前场景
        </button>
        <button type="button" className="secondary-btn" onClick={previousStep} disabled={state.index === 0}>
          上一步并跳转
        </button>
        <button type="button" className="secondary-btn" onClick={() => nextStep(false)}>
          下一步并跳转
        </button>
        <button type="button" className="primary-btn" onClick={() => nextStep(true)}>
          标记通过并下一步
        </button>
        <button type="button" className="secondary-btn" onClick={resetSequence}>
          重置顺序
        </button>
      </div>

      <button
        type="button"
        className="secondary-btn"
        style={{ width: '100%', marginBottom: 12 }}
        onClick={() => markCurrentStep(!getStepDone(currentStep))}
      >
        {getStepDone(currentStep) ? '取消当前步骤通过' : '仅标记当前步骤通过'}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        <button type="button" className="secondary-btn" onClick={copyReport}>
          复制报告摘要
        </button>
        <button type="button" className="secondary-btn" onClick={downloadReport}>
          下载 Markdown
        </button>
      </div>

      <div className="metric-tile" style={{ marginBottom: 12 }}>
        <div className="metric-label">最近报告时间</div>
        <div className="font-mono" style={{ fontSize: 13 }}>{reportTime}</div>
      </div>

      {message && (
        <div className="section-subtitle" style={{ marginBottom: 12, color: 'var(--green-bright)' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
        {DEMO_STEPS.map((step, index) => {
          const done = getStepDone(step)
          const current = index === state.index
          return (
            <button
              key={`${step.group}:${step.id}`}
              type="button"
              className="secondary-btn"
              style={{
                justifyContent: 'space-between',
                minHeight: 42,
                padding: '0 12px',
                borderColor: current ? 'rgba(34,197,94,0.35)' : undefined,
                background: current ? 'rgba(34,197,94,0.08)' : undefined,
              }}
              onClick={() => jumpToIndex(index)}
            >
              <span>{index + 1}. {step.title}</span>
              <span style={{ color: done ? 'var(--green-bright)' : 'var(--text-muted)' }}>
                {done ? '已通过' : '待验证'}
              </span>
            </button>
          )
        })}
      </div>
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
