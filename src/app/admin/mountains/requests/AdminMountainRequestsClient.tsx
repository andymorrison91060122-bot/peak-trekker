'use client'

import { useState, useTransition } from 'react'

export type AdminMountainRequestListItem = {
  id: string
  user_id: string
  location_name: string | null
  latitude: number | null
  longitude: number | null
  altitude_m: number | null
  province: string | null
  request_source: string
  status: string
  track_name: string | null
  file_name: string | null
  import_format: string | null
  candidate_mountain_name: string | null
  candidate_distance_m: number | null
  created_at: string
  submitterName: string | null
}

function formatCoordinate(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toFixed(5)
}

function formatDistance(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`
  return `${Math.round(value)} m`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function requestSourceLabel(value: string) {
  if (value === 'import_distance_blocked') return '距离阻断'
  if (value === 'import_no_match') return '无匹配'
  return value
}

function actorLabel(request: AdminMountainRequestListItem) {
  return request.submitterName ?? `${request.user_id.slice(0, 8)}...`
}

export default function AdminMountainRequestsClient({
  requests,
  currentPage,
  totalPages,
  searchQ,
}: {
  requests: AdminMountainRequestListItem[]
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
    startTransition(() => { window.location.assign(url.toString()) })
  }

  function goPage(p: number) {
    const url = new URL(window.location.href)
    url.searchParams.set('page', String(p))
    window.location.assign(url.toString())
  }

  return (
    <div data-testid="admin-mountain-requests-list">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          padding: '8px 12px',
          minWidth: 0,
        }}>
          <span style={{ color: 'var(--green-primary)', fontFamily: 'Share Tech Mono', fontSize: 12 }}>⌕</span>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && applySearch(search)}
            placeholder="搜索地点 / 省份 / 文件..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'Share Tech Mono',
              flex: 1,
              minWidth: 0,
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => applySearch(search)}
          style={{
            padding: '8px 16px',
            background: 'var(--green-primary)',
            border: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'Press Start 2P',
            fontSize: 8,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          搜索
        </button>
      </div>

      {requests.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          padding: '48px 16px',
          textAlign: 'center',
        }}>
          <div className="font-pixel" style={{ fontSize: 8, color: 'var(--text-muted)' }}>暂无收录申请</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {requests.map((request) => (
            <article
              key={request.id}
              className="surface-card"
              data-testid="admin-mountain-request-card"
              style={{
                padding: 16,
                display: 'grid',
                gap: 12,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {request.location_name ?? request.candidate_mountain_name ?? request.file_name ?? '未命名地点'}
                  </div>
                  <div className="section-subtitle">
                    {requestSourceLabel(request.request_source)} · {request.import_format?.toUpperCase() ?? 'IMPORT'} · {formatDate(request.created_at)}
                  </div>
                </div>
                <span className="muted-chip active">{request.status === 'pending' ? '待观察' : request.status}</span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
                gap: 10,
              }}>
                {[
                  { label: '纬度', value: formatCoordinate(request.latitude) },
                  { label: '经度', value: formatCoordinate(request.longitude) },
                  { label: '海拔', value: request.altitude_m ? `${request.altitude_m.toLocaleString()} m` : '—' },
                  { label: '省份', value: request.province ?? '—' },
                  { label: '提交人', value: actorLabel(request) },
                  { label: '候选距离', value: formatDistance(request.candidate_distance_m) },
                ].map((item) => (
                  <div key={item.label} className="metric-tile" style={{ padding: '12px 10px', minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 800,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.value}
                    </div>
                    <div className="metric-label">{item.label}</div>
                  </div>
                ))}
              </div>

              <div className="section-subtitle" style={{ overflowWrap: 'anywhere' }}>
                轨迹 {request.track_name ?? '—'} · 文件 {request.file_name ?? '—'}
                {request.candidate_mountain_name ? ` · 候选 ${request.candidate_mountain_name}` : ''}
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(page => (
            <button
              key={page}
              type="button"
              onClick={() => goPage(page)}
              style={{
                width: 32,
                height: 32,
                background: page === currentPage ? 'var(--green-primary)' : 'var(--bg-card)',
                border: `1px solid ${page === currentPage ? 'var(--green-primary)' : 'var(--border-color)'}`,
                color: page === currentPage ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'Share Tech Mono',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {page}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
