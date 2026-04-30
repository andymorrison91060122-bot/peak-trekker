'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  QA_CHECKLIST_EVENT,
  TREK_QA_SCENARIOS,
  clearChecklist,
  readChecklist,
  writeChecklist,
} from '@/lib/qa-scenarios'

export default function TrekVerificationChecklist() {
  const router = useRouter()
  const [checked, setChecked] = useState<Record<string, boolean>>(() => readChecklist('trek'))
  const [message, setMessage] = useState('')

  useEffect(() => {
    const refresh = () => setChecked(readChecklist('trek'))
    window.addEventListener(QA_CHECKLIST_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(QA_CHECKLIST_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const done = useMemo(
    () => TREK_QA_SCENARIOS.filter((item) => checked[item.id]).length,
    [checked]
  )
  const happyDone = useMemo(
    () => TREK_QA_SCENARIOS.filter((item) => item.type === 'happy' && checked[item.id]).length,
    [checked]
  )
  const failureDone = useMemo(
    () => TREK_QA_SCENARIOS.filter((item) => item.type === 'failure' && checked[item.id]).length,
    [checked]
  )

  function updateChecked(id: string, value: boolean) {
    const next = { ...checked, [id]: value }
    setChecked(next)
    writeChecklist('trek', next)
  }

  function clearChecked() {
    setChecked({})
    clearChecklist('trek')
    setMessage('已清空登顶核验回归勾选状态。')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="surface-card" style={{ padding: 18 }}>
        <div className="font-pixel" style={{ fontSize: 22, marginBottom: 8 }}>
          登顶核验回归清单
        </div>
        <div className="section-subtitle" style={{ marginBottom: 14 }}>
          覆盖真实闭环与关键异常分支，方便演示“可信记录”是否可恢复、可持续。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
          <Metric title="总完成度" value={`${done}/${TREK_QA_SCENARIOS.length}`} />
          <Metric title="闭环场景" value={`${happyDone}/3`} />
          <Metric title="异常场景" value={`${failureDone}/5`} />
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" className="secondary-btn" onClick={clearChecked}>
            清空登顶核验勾选
          </button>
        </div>

        {message && (
          <div className="section-subtitle" style={{ marginTop: 10, color: 'var(--green-bright)' }}>
            {message}
          </div>
        )}
      </div>

      {TREK_QA_SCENARIOS.map((scenario) => (
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
