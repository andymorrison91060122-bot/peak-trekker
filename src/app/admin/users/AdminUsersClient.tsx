'use client'

import { useState, useTransition } from 'react'

const LICENSE_LABEL: Record<string, string> = {
  none: '无执照', basic: '初级', intermediate: '中级', advanced: '高级',
}
const LICENSE_COLOR: Record<string, string> = {
  none: '#6B7280', basic: '#52B788', intermediate: '#F4A261', advanced: '#E63946',
}

export default function AdminUsersClient({
  users,
  currentPage,
  totalPages,
  searchQ,
}: {
  users: any[]
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
            placeholder="搜索用户名 / 省份..."
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

      {/* 用户表格 */}
      {users.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          padding: '48px 16px', textAlign: 'center',
        }}>
          <div className="font-pixel" style={{ fontSize: 8, color: 'var(--text-muted)' }}>暂无用户数据</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-color)' }}>
          {/* 表头 */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 80px 100px',
            padding: '8px 12px', background: '#0a0a0a',
            borderBottom: '1px solid var(--border-color)',
          }}>
            {['用户名', '省份', '执照', '登顶数', '最高海拔', '注册时间'].map(h => (
              <div key={h} style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1 }}>
                {h}
              </div>
            ))}
          </div>

          {users.map((u, i) => (
            <div
              key={u.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 80px 100px',
                padding: '12px', alignItems: 'center',
                borderBottom: i < users.length - 1 ? '1px solid var(--border-color)' : 'none',
                background: i % 2 === 0 ? 'var(--bg-card)' : 'rgba(0,0,0,0.2)',
              }}
            >
              {/* 用户名 + 头像 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--green-primary), #0a1a0a)',
                  border: '1px solid var(--green-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, color: 'var(--text-primary)',
                }}>
                  {u.username?.slice(0, 1) ?? '?'}
                </div>
                <div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-primary)' }}>
                    {u.username ?? '—'}
                  </div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                    {u.email ?? ''}
                  </div>
                </div>
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                {u.province ?? '—'}
              </div>

              <div>
                <span style={{
                  fontFamily: 'Share Tech Mono', fontSize: 9,
                  color: LICENSE_COLOR[u.license_level ?? 'none'],
                  padding: '2px 6px',
                  border: `1px solid ${LICENSE_COLOR[u.license_level ?? 'none']}22`,
                }}>
                  {LICENSE_LABEL[u.license_level ?? 'none']}
                </span>
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--green-bright)' }}>
                {u.mountain_count ?? 0} 座
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                {u.total_altitude ? `${(u.total_altitude / 1000).toFixed(1)}k m` : '—'}
              </div>

              <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: 'var(--text-muted)' }}>
                {new Date(u.created_at).toLocaleDateString('zh-CN', { year: '2-digit', month: 'numeric', day: 'numeric' })}
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
