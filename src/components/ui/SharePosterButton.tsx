'use client'

import { useState } from 'react'

export default function SharePosterButton({
  checkinId,
  mountainName,
}: {
  checkinId: string
  mountainName: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'preview' | 'error'>('idle')
  const [posterUrl, setPosterUrl] = useState<string | null>(null)

  async function generatePoster() {
    setState('loading')
    try {
      const url = `/api/poster?checkinId=${checkinId}`
      // 预加载图片验证
      const res = await fetch(url)
      if (!res.ok) throw new Error('生成失败')
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      setPosterUrl(objectUrl)
      setState('preview')
    } catch {
      setState('error')
    }
  }

  async function downloadPoster() {
    if (!posterUrl) return
    const a = document.createElement('a')
    a.href = posterUrl
    a.download = `peak-trekker-${mountainName}.png`
    a.click()
  }

  async function sharePoster() {
    if (!posterUrl) return
    try {
      const res = await fetch(posterUrl)
      const blob = await res.blob()
      const file = new File([blob], `peak-trekker-${mountainName}.png`, { type: blob.type })
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `我登顶了 ${mountainName}！`,
          text: `#PeakTrekker #登山打卡`,
        })
      } else {
        downloadPoster()
      }
    } catch {
      downloadPoster()
    }
  }

  if (state === 'preview' && posterUrl) {
    return (
      <>
        {/* 预览遮罩 */}
        <div
          onClick={() => { setState('idle'); setPosterUrl(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 20, gap: 16,
          }}
        >
          {/* 海报预览 */}
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', maxWidth: 340, width: '100%' }}
          >
            {/* 顶部刻度装饰 */}
            <div style={{
              height: 3,
              background: 'repeating-linear-gradient(90deg, #2D6A4F 0, #2D6A4F 4px, transparent 4px, transparent 8px)',
              marginBottom: 0,
            }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterUrl}
              alt="登顶海报"
              style={{ width: '100%', display: 'block', imageRendering: 'auto' }}
            />
            {/* 底部刻度 */}
            <div style={{
              height: 3,
              background: 'repeating-linear-gradient(90deg, #2D6A4F 0, #2D6A4F 4px, transparent 4px, transparent 8px)',
            }} />
          </div>

          {/* 操作按钮 */}
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 340 }}>
            <button
              onClick={() => { setState('idle'); setPosterUrl(null) }}
              style={{
                flex: 1, padding: '12px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                fontFamily: 'Press Start 2P', fontSize: 7,
                cursor: 'pointer',
              }}
            >
              关闭
            </button>
            <button
              onClick={downloadPoster}
              style={{
                flex: 1, padding: '12px',
                background: 'rgba(45,106,79,0.2)',
                border: '1px solid var(--green-primary)',
                color: 'var(--green-bright)',
                fontFamily: 'Press Start 2P', fontSize: 7,
                cursor: 'pointer',
              }}
            >
              ↓ 保存
            </button>
            <button
              onClick={sharePoster}
              className="pixel-btn"
              style={{ flex: 2, padding: '12px', fontSize: 7 }}
            >
              ↗ 分享
            </button>
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
            点击背景关闭
          </div>
        </div>
      </>
    )
  }

  return (
    <button
      onClick={state === 'error' ? generatePoster : state === 'idle' ? generatePoster : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'transparent', border: 'none', cursor: state === 'loading' ? 'default' : 'pointer',
        padding: 0,
      }}
    >
      <span style={{ fontSize: 12 }}>
        {state === 'loading' ? '⏳' : state === 'error' ? '⚠' : '↗'}
      </span>
      <span style={{
        fontFamily: 'Share Tech Mono', fontSize: 10,
        color: state === 'error' ? '#E63946' : 'var(--text-muted)',
      }}>
        {state === 'loading' ? '生成中...' : state === 'error' ? '重试' : '分享海报'}
      </span>
    </button>
  )
}
