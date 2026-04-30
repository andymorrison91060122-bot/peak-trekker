'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  COMMUNITY_QA_SCENARIOS,
  QA_CHECKLIST_EVENT,
  clearChecklist,
  readChecklist,
  writeChecklist,
} from '@/lib/qa-scenarios'

type CommunityQAScenario = (typeof COMMUNITY_QA_SCENARIOS)[number]

export default function CommunityManualAcceptanceChecklist() {
  const router = useRouter()
  const [checked, setChecked] = useState<Record<string, boolean>>(() => readChecklist('community'))
  const [message, setMessage] = useState('')

  useEffect(() => {
    const refresh = () => setChecked(readChecklist('community'))
    window.addEventListener(QA_CHECKLIST_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(QA_CHECKLIST_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const done = useMemo(
    () => COMMUNITY_QA_SCENARIOS.filter((item) => checked[item.id]).length,
    [checked]
  )
  const pending = COMMUNITY_QA_SCENARIOS.length - done
  const grouped = useMemo(() => {
    return COMMUNITY_QA_SCENARIOS.reduce<Record<string, CommunityQAScenario[]>>((acc, item) => {
      const key = item.area
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})
  }, [])

  function updateChecked(id: string, value: boolean) {
    const next = { ...checked, [id]: value }
    setChecked(next)
    writeChecklist('community', next)
  }

  function clearChecked() {
    setChecked({})
    clearChecklist('community')
    setMessage('已清空山友圈人工验收勾选状态。')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="surface-card" style={{ padding: 18 }}>
        <div className="font-pixel" style={{ fontSize: 22, marginBottom: 8 }}>
          山友圈人工体验验收
        </div>
        <div className="section-subtitle" style={{ marginBottom: 14 }}>
          这页把当前 7 条社区自动回归对应成可手点的人工路径。建议按顺序从“即时发布”走到“完整旅程”，中途直接勾选通过项。
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
          <Metric title="总完成度" value={`${done}/${COMMUNITY_QA_SCENARIOS.length}`} />
          <Metric title="待验收" value={String(pending)} />
          <Metric title="自动回归映射" value="7 条" />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="secondary-btn" onClick={clearChecked}>
            清空山友圈勾选
          </button>
          <button type="button" className="secondary-btn" onClick={() => router.push('/profile')}>
            从个人页开始
          </button>
          <button type="button" className="secondary-btn" onClick={() => router.push('/community')}>
            进入山友圈
          </button>
        </div>

        {message && (
          <div className="section-subtitle" style={{ marginTop: 10, color: 'var(--green-bright)' }}>
            {message}
          </div>
        )}
      </div>

      <div className="surface-card" style={{ padding: 16 }}>
        <div className="font-pixel" style={{ fontSize: 18, marginBottom: 8 }}>
          验收前准备
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="metric-tile">
            <div className="metric-label">建议账号</div>
            <div className="section-subtitle">1 个普通用户用于发布；1 个普通用户用于浏览/举报；1 个管理员用于后台查看举报。</div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">建议记录</div>
            <div className="section-subtitle">至少准备 1 条实时登顶记录和 1 条审核通过的历史补签记录，方便分别验证即时发布与延迟发布。</div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">建议入口</div>
            <div className="section-subtitle">`/trek` 验证即时发布，`/profile` 验证延迟发布，`/community` 验证公开流和详情，`/admin/community` 验证后台。</div>
          </div>
        </div>
      </div>

      {Object.entries(grouped).map(([groupTitle, scenarios]) => (
        <div key={groupTitle} style={{ display: 'grid', gap: 14 }}>
          <div className="surface-card" style={{ padding: 14 }}>
            <div className="font-pixel" style={{ fontSize: 18 }}>{groupTitle}</div>
          </div>

          {scenarios.map((scenario) => (
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
                <div className="metric-label">可点击起点</div>
                <div className="font-mono" style={{ fontSize: 13 }}>{scenario.startAt}</div>
              </div>

              <div className="metric-tile" style={{ marginBottom: 10 }}>
                <div className="metric-label">人工操作路径</div>
                <div className="section-subtitle">{scenario.action}</div>
              </div>

              <div className="metric-tile" style={{ marginBottom: 10 }}>
                <div className="metric-label">验收通过标准</div>
                <div className="section-subtitle">{scenario.expect}</div>
              </div>

              <div className="metric-tile" style={{ marginBottom: 12 }}>
                <div className="metric-label">对应自动回归</div>
                <div className="font-mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{scenario.autoTest}</div>
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
