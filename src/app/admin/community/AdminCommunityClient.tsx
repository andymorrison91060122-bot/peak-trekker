'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CommunityPostViewModel } from '@/types'
import { formatCommunityDate, formatCommunityDuration } from '@/lib/community'
import TertiaryButton from '@/components/ui/TertiaryButton'

type ReportRow = {
  id: string
  postId: string
  reporter: string
  reason: string
  status: string
  createdAt: string
  fallback: boolean
}

export default function AdminCommunityClient({
  posts,
  reports,
}: {
  posts: CommunityPostViewModel[]
  reports: ReportRow[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'posts' | 'reports'>('posts')
  const [isPending, startTransition] = useTransition()
  const [notice, setNotice] = useState('')

  async function runAction(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/community-moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(String(json?.error ?? '操作失败，请稍后重试。'))
    }
  }

  function handleAction(body: Record<string, unknown>, successText: string) {
    startTransition(async () => {
      try {
        await runAction(body)
        setNotice(successText)
        router.refresh()
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '操作失败，请稍后重试。')
      }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'posts', label: `内容 (${posts.length})` },
          { key: 'reports', label: `举报 (${reports.length})` },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'primary-btn' : 'secondary-btn'}
            onClick={() => setTab(item.key as typeof tab)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="surface-card" style={{ padding: 12, marginBottom: 16 }}>
          <div className="section-subtitle" style={{ color: 'var(--green-bright)' }}>{notice}</div>
        </div>
      )}

      {tab === 'posts' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {posts.map((post) => (
            <div key={post.id} className="surface-card" style={{ padding: 16, opacity: isPending ? 0.9 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{post.title}</div>
                  <div className="section-subtitle">
                    {post.author.username} · {post.behaviorText} · {post.visibility === 'private' ? '仅自己可见' : '公开可见'}
                  </div>
                </div>
                <span className={`muted-chip ${post.status === 'published' ? 'active' : ''}`}>
                  {post.status === 'hidden' ? '已隐藏' : post.status === 'removed' ? '已移除' : '已发布'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                {[
                  { label: '海拔', value: `${post.metrics.altitudeM.toLocaleString()} m` },
                  { label: '时长', value: formatCommunityDuration(post.metrics.durationSec) },
                  { label: '发布时间', value: formatCommunityDate(post.publishedAt) },
                  { label: '点赞', value: String(post.likeCount) },
                ].map((item) => (
                  <div key={item.label} className="metric-tile" style={{ padding: '12px 10px' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{item.value}</div>
                    <div className="metric-label">{item.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link href={`/community/${post.id}`} className="secondary-btn" style={{ textDecoration: 'none' }}>
                  查看详情
                </Link>
                <TertiaryButton
                  onClick={() => handleAction(
                    { postId: post.id, action: post.isFeatured ? 'unfeature' : 'feature' },
                    post.isFeatured ? '已取消精选。' : '已标记为精选。'
                  )}
                >
                  {post.isFeatured ? '取消精选' : '标记精选'}
                </TertiaryButton>
                <button type="button" className="secondary-btn" onClick={() => handleAction({ postId: post.id, action: post.status === 'hidden' ? 'restore' : 'hide' }, post.status === 'hidden' ? '内容已恢复公开。' : '内容已隐藏。')}>
                  {post.status === 'hidden' ? '恢复公开' : '隐藏内容'}
                </button>
                <button type="button" className="secondary-btn" onClick={() => handleAction({ postId: post.id, action: 'delete' }, '内容已删除。')}>
                  删除内容
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {reports.length === 0 ? (
            <div className="surface-card" style={{ padding: 18 }}>
              <div className="section-subtitle">当前没有待处理举报。</div>
            </div>
          ) : (
            reports.map((report) => (
              <div key={report.id} className="surface-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{report.reason}</div>
                    <div className="section-subtitle">
                      举报人 {report.reporter} · {formatCommunityDate(report.createdAt)} {report.fallback ? '· 兼容队列' : ''}
                    </div>
                  </div>
                  <span className="muted-chip active">{report.status === 'resolved' ? '已处理' : '待处理'}</span>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link href={`/community/${report.postId}`} className="secondary-btn" style={{ textDecoration: 'none' }}>
                    查看动态
                  </Link>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleAction({ postId: report.postId, action: 'resolve_report', reportId: report.id, fallbackReport: report.fallback }, '举报已标记为已处理。')}
                  >
                    标记已处理
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleAction({ postId: report.postId, action: 'hide' }, '动态已隐藏。')}
                  >
                    直接隐藏动态
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
