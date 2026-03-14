'use client'

import { useState, useMemo } from 'react'
import { MountainCard, MountainFeatureCard } from '@/components/ui/MountainUI'
import type { Mountain } from '@/types'

const FILTERS = ['全部', '入门', '中级', '高级', '雪山'] as const
const DIFFICULTY_MAP: Record<string, string> = {
  '入门': 'beginner',
  '中级': 'intermediate',
  '高级': 'advanced',
  '雪山': 'expert',
}

export default function ExploreClient({
  featured,
  list,
}: {
  featured: Mountain[]
  list: Mountain[]
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('全部')

  const filtered = useMemo(() => {
    return list.filter(m => {
      const matchSearch =
        !search ||
        m.name.includes(search) ||
        m.province.includes(search)
      const matchFilter =
        filter === '全部' || m.difficulty === DIFFICULTY_MAP[filter]
      return matchSearch && matchFilter
    })
  }, [list, search, filter])

  return (
    <>
      {/* 搜索栏 */}
      <div style={{ margin: '16px 0', position: 'relative' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--green-primary)',
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        }}>
          <span style={{ color: 'var(--green-primary)', fontFamily: 'Share Tech Mono', fontSize: 14 }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索山峰名称 / 省份..."
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 12,
              fontFamily: 'Share Tech Mono', flex: 1,
            }}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>
            {filtered.length + featured.length}座
          </span>
        </div>
        <div style={{
          height: '2px',
          background: 'repeating-linear-gradient(90deg, var(--green-primary) 0, var(--green-primary) 2px, transparent 2px, transparent 6px)'
        }} />
      </div>

      {/* 筛选标签 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              flexShrink: 0, padding: '4px 10px',
              fontFamily: 'Press Start 2P', fontSize: 7,
              background: filter === f ? 'var(--green-primary)' : 'transparent',
              color: filter === f ? 'var(--text-primary)' : 'var(--text-muted)',
              border: `1px solid ${filter === f ? 'var(--green-primary)' : 'var(--border-color)'}`,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 省份热度横条 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderLeft: '3px solid var(--green-neon)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div className="font-pixel" style={{ fontSize: 7, color: 'var(--green-neon)' }}>🔥 本月最活跃</div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 4, fontFamily: 'Share Tech Mono' }}>
              四川省 · <span style={{ color: 'var(--green-bright)' }}>+1,240 pts</span>
            </div>
          </div>
          <div style={{ fontSize: 28 }}>🏔</div>
        </div>
      </div>

      {/* 精选大卡（仅全部+无搜索时显示） */}
      {filter === '全部' && !search && featured.length > 0 && (
        <>
          <div className="mountain-divider">
            <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>★ 精选挑战</span>
          </div>
          {featured.map(m => <MountainFeatureCard key={m.id} mountain={m} />)}
        </>
      )}

      {/* 山峰列表 */}
      <div className="mountain-divider">
        <span className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', whiteSpace: 'nowrap' }}>▲ 全部山峰</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', fontSize: 12 }}>
          未找到匹配的山峰
        </div>
      ) : (
        filtered.map(m => <MountainCard key={m.id} mountain={m} />)
      )}
    </>
  )
}
