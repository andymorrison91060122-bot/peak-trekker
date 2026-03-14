'use client'

import { useState, useTransition } from 'react'

const DIFF_LABEL: Record<string, string> = {
  beginner: '入门', intermediate: '中级', advanced: '高级', expert: '专家',
}
const DIFF_COLOR: Record<string, string> = {
  beginner: '#52B788', intermediate: '#F4A261', advanced: '#E76F51', expert: '#E63946',
}
const LICENSE_LABEL: Record<string, string> = {
  none: '无需', basic: '初级证', intermediate: '中级证', advanced: '高级证',
}

export default function AdminMountainsClient({
  mountains,
  currentPage,
  totalPages,
  searchQ,
}: {
  mountains: any[]
  currentPage: number
  totalPages: number
  searchQ: string
}) {
  const [search, setSearch] = useState(searchQ)
  const [, startTransition] = useTransition()

  function applySearch(q: string) {
    setSearch(q)
    const url = new URL(window.location.href)
    url.searchParams.set('q', q)
    url.searchParams.set('page', '1')
    startTransition(() => { window.location.href = url.toString() })
  }

  function goPage(p: number) {
    const url = new URL(window.location.href)
    url.searchParams.set('page', String(p))
    window.location.href = url.toString()
  }

  return (
    <div>
      {/* 搜索栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          padding: '8px 12px',
        }}>
          <span style={{ color: 'var(--green-primary)', fontFamily: 'Share Tech Mono', fontSize: 12 }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch(search)}
            placeholder="搜索山峰名称 / 省份..."
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 12,
              fontFamily: 'Share Tech Mono', flex: 1,
            }}
          />
        </div>
        <button
          onClick={() => applySearch(search)}
          style={{
            padding: '8px 16px', background: 'var(--green-primary)', border: 'none',
            color: 'var(--text-primary)', fontFamily: 'Press Start 2P', fontSize: 8, cursor: 'pointer',
          }}
        >
          搜索
        </button>
      </div>

      {/* 山峰表格 */}
      {mountains.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          padding: '48px 16px', textAlign: 'center',
        }}>
          <div className="font-pixel" style={{ fontSize: 8, color: 'var(--text-muted)' }}>暂无山峰数据</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-color)' }}>
          {/* 表头 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px',
            padding: '8px 12px', background: '#0a0a0a',
            borderBottom: '1px solid var(--border-color)',
          }}>
            {['山峰', '省份', '海拔', '难度', '执照要求', '登顶数'].map(h => (
              <div key={h} style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1 }}>
                {h}
              </div>
            ))}
          </div>

          {mountains.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px',
                padding: '12px', alignItems: 'center',
                borderBottom: i < mountains.length - 1 ? '1px solid var(--border-color)' : 'none',
                background: i % 2 === 0 ? 'var(--bg-card)' : 'rgba(0,0,0,0.2)',
                borderLeft: `3px solid ${DIFF_COLOR[m.difficulty] ?? '#2D6A4F'}`,
              }}
            >
              <div>
                <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-primary)' }}>
                  {m.name}
                </div>
                {m.description && (
                  <div style={{
                    fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
                  }}>
                    {m.description}
                  </div>
                )}
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                {m.province}
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--green-bright)', fontWeight: 'bold' }}>
                {m.altitude.toLocaleString()}m
              </div>

              <div>
                <span style={{
                  fontFamily: 'Share Tech Mono', fontSize: 9,
                  color: DIFF_COLOR[m.difficulty],
                  padding: '2px 6px',
                  border: `1px solid ${DIFF_COLOR[m.difficulty]}44`,
                }}>
                  {DIFF_LABEL[m.difficulty] ?? m.difficulty}
                </span>
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                {LICENSE_LABEL[m.min_license] ?? m.min_license}
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                {m.checkin_count ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => goPage(p)}
              style={{
                width: 32, height: 32,
                background: p === currentPage ? 'var(--green-primary)' : 'var(--bg-card)',
                border: `1px solid ${p === currentPage ? 'var(--green-primary)' : 'var(--border-color)'}`,
                color: p === currentPage ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'Share Tech Mono', fontSize: 10, cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
