'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

type CommunityQAMountainOption = {
  id: string
  name: string
  province: string | null
  altitude: number
  latitude: number | null
  longitude: number | null
}

type SeedResult = {
  checkinId: string
  mountainName: string
  sourceType: 'realtime_gps' | 'historical_photo'
}

const QA_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wm0WZ0AAAAASUVORK5CYII='

function buildQaTrackPoints(mountain: CommunityQAMountainOption) {
  if (typeof mountain.latitude !== 'number' || typeof mountain.longitude !== 'number') {
    return []
  }

  const latitude = mountain.latitude
  const longitude = mountain.longitude
  const startedAt = Date.now() - 120_000
  return Array.from({ length: 8 }, (_, index) => {
    const factor = (7 - index) / 7
    return {
      lat: latitude - 0.001 * factor,
      lng: longitude - 0.001 * factor,
      accuracy: 5,
      altitude: Math.max(0, mountain.altitude - Math.round(56 * factor)),
      ts: startedAt + index * 15_000,
    }
  })
}

async function postTrekAction(payload: Record<string, unknown>) {
  const response = await fetch('/api/trek/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail =
      typeof body?.detail === 'string'
        ? body.detail
        : typeof body?.error === 'string'
          ? body.error
          : '生成测试登山记录失败，请稍后重试。'
    throw new Error(detail)
  }

  return body as Record<string, unknown>
}

export default function CommunityTestRecordSeeder({
  mountains,
}: {
  mountains: CommunityQAMountainOption[]
}) {
  const [selectedMountainId, setSelectedMountainId] = useState(mountains[0]?.id ?? '')
  const [note, setNote] = useState('QA 手动验收测试记录')
  const [errorMessage, setErrorMessage] = useState('')
  const [message, setMessage] = useState('')
  const [historicalResult, setHistoricalResult] = useState<SeedResult | null>(null)
  const [realtimeResult, setRealtimeResult] = useState<SeedResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedMountain = useMemo(
    () => mountains.find((mountain) => mountain.id === selectedMountainId) ?? mountains[0] ?? null,
    [mountains, selectedMountainId]
  )

  function flash(text: string) {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2400)
  }

  function createHistoricalRecord() {
    if (!selectedMountain) {
      setErrorMessage('当前没有可用山峰，无法生成测试记录。')
      return
    }

    startTransition(async () => {
      setErrorMessage('')
      try {
        const result = await postTrekAction({
          action: 'submit_historical_checkin',
          mountainId: selectedMountain.id,
          photoUrl: QA_PNG_DATA_URL,
          note: note.trim() || 'QA 手动验收测试记录',
        })

        const checkinId = typeof result.checkinId === 'string' ? result.checkinId : ''
        if (!checkinId) {
          throw new Error('接口未返回有效的测试记录 ID。')
        }

        setHistoricalResult({
          checkinId,
          mountainName: selectedMountain.name,
          sourceType: 'historical_photo',
        })
        flash('已为当前账号生成一条照片补签记录。')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '生成补签记录失败，请稍后重试。')
      }
    })
  }

  function createRealtimeRecord() {
    if (!selectedMountain) {
      setErrorMessage('当前没有可用山峰，无法生成测试记录。')
      return
    }

    if (typeof selectedMountain.latitude !== 'number' || typeof selectedMountain.longitude !== 'number') {
      setErrorMessage('该山峰缺少 GPS 坐标，无法生成实时登顶记录。请换一座山再试。')
      return
    }

    startTransition(async () => {
      setErrorMessage('')
      try {
        const result = await postTrekAction({
          action: 'verify_summit_checkin',
          sessionId: `local-trek-session:community-qa:${Date.now()}`,
          mountainId: selectedMountain.id,
          startedAt: Date.now() - 120_000,
          note: note.trim() || 'QA 即时发布测试记录',
          trackPoints: buildQaTrackPoints(selectedMountain),
        })

        const checkinId = typeof result.checkinId === 'string' ? result.checkinId : ''
        if (!checkinId) {
          throw new Error('接口未返回有效的测试记录 ID。')
        }

        setRealtimeResult({
          checkinId,
          mountainName: selectedMountain.name,
          sourceType: 'realtime_gps',
        })
        flash('已为当前账号生成一条实时登顶记录，可直接验证即时分享。')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '生成实时登顶记录失败，请稍后重试。')
      }
    })
  }

  return (
    <div className="surface-card" style={{ padding: 18, marginBottom: 16 }}>
      <div className="font-pixel" style={{ fontSize: 22, marginBottom: 8 }}>
        测试登山记录生成
      </div>
      <div className="section-subtitle" style={{ marginBottom: 14 }}>
        如果当前账号还没有登山记录，可以先在这里一键生成测试数据。补签记录适合验证延迟分享；实时记录适合直接验证即时分享链路。
      </div>

      <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="metric-label">选择测试山峰</span>
          <select
            value={selectedMountainId}
            onChange={(event) => setSelectedMountainId(event.target.value)}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 12,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            {mountains.map((mountain) => (
              <option key={mountain.id} value={mountain.id}>
                {mountain.name}
                {mountain.province ? ` · ${mountain.province}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span className="metric-label">测试备注</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="用于区分这条 QA 测试记录"
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 12,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              resize: 'vertical',
            }}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div className="metric-tile" style={{ padding: 14 }}>
          <div className="font-pixel" style={{ fontSize: 17, marginBottom: 6 }}>
            延迟分享种子记录
          </div>
          <div className="section-subtitle" style={{ marginBottom: 12 }}>
            生成一条已通过的历史补签记录，然后从“我的登山记录”进入山友圈编辑页，验证延迟发布。
          </div>
          <button type="button" className="secondary-btn" style={{ width: '100%' }} onClick={createHistoricalRecord} disabled={isPending || !selectedMountain}>
            {isPending ? '生成中...' : '生成已通过的补签记录'}
          </button>
          {historicalResult && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div className="section-subtitle" style={{ color: 'var(--green-bright)' }}>
                已生成：{historicalResult.mountainName}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href="/profile" className="primary-btn" style={{ textDecoration: 'none' }}>
                  去个人页验证延迟分享
                </Link>
                <Link href={`/community/publish/${historicalResult.checkinId}`} className="secondary-btn" style={{ textDecoration: 'none' }}>
                  直接打开分享编辑页
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="metric-tile" style={{ padding: 14 }}>
          <div className="font-pixel" style={{ fontSize: 17, marginBottom: 6 }}>
            即时分享种子记录
          </div>
          <div className="section-subtitle" style={{ marginBottom: 12 }}>
            生成一条 `realtime_gps` 登顶记录，直接进入山友圈编辑页，用来验证即时分享的发布链路。
          </div>
          <button type="button" className="primary-btn" style={{ width: '100%' }} onClick={createRealtimeRecord} disabled={isPending || !selectedMountain}>
            {isPending ? '生成中...' : '生成实时登顶记录'}
          </button>
          {realtimeResult && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div className="section-subtitle" style={{ color: 'var(--green-bright)' }}>
                已生成：{realtimeResult.mountainName}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href={`/community/publish/${realtimeResult.checkinId}`} className="primary-btn" style={{ textDecoration: 'none' }}>
                  直接进入即时分享编辑页
                </Link>
                <Link href="/profile" className="secondary-btn" style={{ textDecoration: 'none' }}>
                  去个人页查看记录
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div className="section-subtitle" style={{ color: 'var(--green-bright)', marginBottom: 8 }}>
          {message}
        </div>
      )}
      {errorMessage && (
        <div className="section-subtitle" style={{ color: 'var(--danger-color, #ff6b6b)' }}>
          {errorMessage}
        </div>
      )}
    </div>
  )
}
