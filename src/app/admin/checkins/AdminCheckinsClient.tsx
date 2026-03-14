'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核', approved: '已通过', rejected: '已拒绝',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#F4A261', approved: '#39FF14', rejected: '#E63946',
}
const DIFF_LABEL: Record<string, string> = {
  beginner: '入门', intermediate: '中级', advanced: '高级', expert: '专家',
}
const DIFF_COLOR: Record<string, string> = {
  beginner: '#52B788', intermediate: '#F4A261', advanced: '#E76F51', expert: '#E63946',
}

type Checkin = {
  id: string
  type: string
  status: string
  created_at: string
  note: string | null
  photo_url: string | null
  latitude: number | null
  longitude: number | null
  mountains: { id: string; name: string; altitude: number; province: string; difficulty: string } | null
  profiles: { id: string; username: string; province: string; license_level: string } | null
}

export default function AdminCheckinsClient({
  checkins,
  currentStatus,
  currentPage,
  totalPages,
}: {
  checkins: Checkin[]
  currentStatus: string
  currentPage: number
  totalPages: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({})

  const tabs = ['pending', 'approved', 'rejected', 'all']

  function switchTab(s: string) {
    router.push(`/admin/checkins?status=${s}&page=1`)
  }

  function switchPage(p: number) {
    router.push(`/admin/checkins?status=${currentStatus}&page=${p}`)
  }

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActioningId(id)
    const body: Record<string, string> = { id, action }
    if (action === 'reject' && rejectNote[id]) body.note = rejectNote[id]

    const res = await fetch('/api/admin/checkin-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setActioningId(null)
    if (res.ok) {
      startTransition(() => router.refresh())
    } else {
      alert('操作失败，请重试')
    }
  }

  return (
    <div>
      {/* Tab 筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            style={{
              padding: '6px 14px',
              fontFamily: 'Press Start 2P', fontSize: 8,
              background: currentStatus === t ? 'var(--green-primary)' : 'transparent',
              color: currentStatus === t ? 'var(--text-primary)' : 'var(--text-muted)',
              border: `1px solid ${currentStatus === t ? 'var(--green-primary)' : 'var(--border-color)'}`,
              cursor: 'pointer',
            }}
          >
            {STATUS_LABEL[t] ?? '全部'}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {checkins.length === 0 ? (
        <div style={{
          padding: '48px 16px', textAlign: 'center',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
        }}>
          <div className="font-pixel" style={{ fontSize: 8, color: 'var(--green-neon)', marginBottom: 10 }}>[ CLEAR ]</div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: 'var(--text-muted)' }}>暂无记录</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {checkins.map((c) => {
            const m = c.mountains
            const p = c.profiles
            const isActioning = actioningId === c.id
            return (
              <div
                key={c.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderLeft: `3px solid ${STATUS_COLOR[c.status] ?? 'var(--border-color)'}`,
                  padding: '16px',
                  position: 'relative',
                  opacity: isActioning ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* 顶部行：状态徽章 + 时间 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{
                    fontFamily: 'Share Tech Mono', fontSize: 10,
                    color: STATUS_COLOR[c.status],
                    border: `1px solid ${STATUS_COLOR[c.status]}`,
                    padding: '2px 8px',
                  }}>
                    {c.type === 'gps' ? '📍 GPS' : '📷 照片'} · {STATUS_LABEL[c.status]}
                  </span>
                  <span style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                    {new Date(c.created_at).toLocaleString('zh-CN', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* 主信息区：左用户 右山峰 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                  {/* 用户信息 */}
                  <div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: 1 }}>USER</div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {p?.username ?? '—'}
                    </div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                      {p?.province ?? ''} · {p?.license_level ?? 'none'}
                    </div>
                  </div>

                  {/* 山峰信息 */}
                  <div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: 1 }}>MOUNTAIN</div>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {m?.name ?? '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                        ▲ {m?.altitude?.toLocaleString()}m · {m?.province}
                      </span>
                      {m?.difficulty && (
                        <span style={{
                          fontFamily: 'Share Tech Mono', fontSize: 9,
                          color: DIFF_COLOR[m.difficulty],
                          border: `1px solid ${DIFF_COLOR[m.difficulty]}`,
                          padding: '1px 5px',
                        }}>
                          {DIFF_LABEL[m.difficulty]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 感言 */}
                {c.note && (
                  <div style={{
                    fontFamily: 'Share Tech Mono', fontSize: 11,
                    color: 'var(--text-muted)',
                    padding: '8px 10px',
                    background: 'rgba(45,106,79,0.05)',
                    borderLeft: '2px solid rgba(45,106,79,0.3)',
                    marginBottom: 12,
                    lineHeight: 1.7,
                  }}>
                    "{c.note}"
                  </div>
                )}

                {/* 照片（照片打卡） */}
                {c.photo_url && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: 1 }}>
                      PHOTO EVIDENCE
                    </div>
                    <img
                      src={c.photo_url}
                      alt="打卡照片"
                      onClick={() => setPreviewImg(c.photo_url)}
                      style={{
                        width: '100%', maxWidth: 320, height: 180,
                        objectFit: 'cover',
                        border: '1px solid var(--green-primary)',
                        cursor: 'pointer',
                        display: 'block',
                      }}
                    />
                    <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--green-primary)', marginTop: 4 }}>
                      ↗ 点击放大查看
                    </div>
                  </div>
                )}

                {/* GPS 坐标（GPS打卡） */}
                {c.type === 'gps' && c.latitude && c.longitude && (
                  <div style={{
                    fontFamily: 'Share Tech Mono', fontSize: 10,
                    color: 'var(--text-muted)',
                    marginBottom: 12,
                    padding: '6px 10px',
                    background: 'rgba(57,255,20,0.04)',
                    border: '1px solid rgba(57,255,20,0.1)',
                    display: 'flex', gap: 16,
                  }}>
                    <span>N {c.latitude.toFixed(5)}°</span>
                    <span>E {c.longitude.toFixed(5)}°</span>
                  </div>
                )}

                {/* 审核操作按钮（仅 pending 显示） */}
                {c.status === 'pending' && (
                  <div>
                    {/* 拒绝备注输入 */}
                    <input
                      placeholder="拒绝原因（选填）"
                      value={rejectNote[c.id] ?? ''}
                      onChange={e => setRejectNote(prev => ({ ...prev, [c.id]: e.target.value }))}
                      style={{
                        width: '100%', marginBottom: 10,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontFamily: 'Share Tech Mono', fontSize: 11,
                        padding: '8px 10px', outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        disabled={isActioning}
                        onClick={() => handleAction(c.id, 'approve')}
                        style={{
                          flex: 1, padding: '10px',
                          fontFamily: 'Press Start 2P', fontSize: 9,
                          background: 'var(--green-primary)',
                          color: 'var(--text-primary)',
                          border: 'none', cursor: isActioning ? 'wait' : 'pointer',
                        }}
                      >
                        ✓ 通过
                      </button>
                      <button
                        disabled={isActioning}
                        onClick={() => handleAction(c.id, 'reject')}
                        style={{
                          flex: 1, padding: '10px',
                          fontFamily: 'Press Start 2P', fontSize: 9,
                          background: 'rgba(230,57,70,0.15)',
                          color: '#E63946',
                          border: '1px solid #E63946',
                          cursor: isActioning ? 'wait' : 'pointer',
                        }}
                      >
                        ✗ 拒绝
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => switchPage(p)}
              style={{
                width: 36, height: 36,
                fontFamily: 'Press Start 2P', fontSize: 9,
                background: currentPage === p ? 'var(--green-primary)' : 'transparent',
                color: currentPage === p ? 'var(--text-primary)' : 'var(--text-muted)',
                border: `1px solid ${currentPage === p ? 'var(--green-primary)' : 'var(--border-color)'}`,
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* 照片全屏预览 */}
      {previewImg && (
        <div
          onClick={() => setPreviewImg(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={previewImg}
            alt="预览"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', border: '1px solid var(--green-primary)' }}
          />
          <div style={{
            position: 'absolute', top: 20, right: 20,
            fontFamily: 'Press Start 2P', fontSize: 10,
            color: 'var(--text-muted)', cursor: 'pointer',
          }}>
            [X] 关闭
          </div>
        </div>
      )}
    </div>
  )
}
