'use client'

import { useEffect } from 'react'

const LICENSE_REQUIREMENTS: Record<string, {
  label: string
  needs: string
  current_max: number
  next_max: number
  steps: string[]
}> = {
  basic: {
    label: '初级登山证',
    needs: '此山峰海拔超过 1000m，需要持有初级登山证',
    current_max: 1000,
    next_max: 2000,
    steps: [
      '完成任意 3 座 1000m 以下山峰打卡',
      '系统自动颁发「初级登山证」',
      '解锁 2000m 级别山峰访问权限',
    ],
  },
  intermediate: {
    label: '中级登山证',
    needs: '此山峰海拔超过 2000m，需要持有中级登山证',
    current_max: 2000,
    next_max: 4000,
    steps: [
      '持有初级登山证',
      '完成任意 3 座 2000m 以下山峰打卡',
      '系统自动颁发「中级登山证」',
      '解锁 4000m 级别山峰访问权限',
    ],
  },
  advanced: {
    label: '高级登山证',
    needs: '此山峰海拔超过 4000m，需要持有高级登山证',
    current_max: 4000,
    next_max: 99999,
    steps: [
      '持有中级登山证',
      '完成任意 3 座 4000m 以下山峰打卡',
      '系统自动颁发「高级登山证」',
      '解锁雪山级别山峰访问权限',
    ],
  },
}

export default function LockModal({
  mountainName,
  altitude,
  minLicense,
  onClose,
}: {
  mountainName: string
  altitude: number
  minLicense: string
  onClose: () => void
}) {
  const info = LICENSE_REQUIREMENTS[minLicense]
  if (!info) return null

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--bg-secondary)',
          borderTop: '2px solid #8B0000',
          padding: '24px 20px 36px',
          position: 'relative',
        }}
      >
        {/* 顶部刻度线（红色） */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '2px',
          background: 'repeating-linear-gradient(90deg, #8B0000 0, #8B0000 4px, transparent 4px, transparent 8px)',
        }} />

        {/* 关闭按钮 */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 16,
          background: 'transparent', border: 'none',
          color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer',
          fontFamily: 'Share Tech Mono',
        }}>✕</button>

        {/* 标题区 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, flexShrink: 0,
            background: 'rgba(139,0,0,0.15)',
            border: '1px solid rgba(139,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>🔒</div>
          <div>
            <div className="font-pixel" style={{ fontSize: 9, color: '#E63946', marginBottom: 6, lineHeight: 1.8 }}>
              山峰已锁定
            </div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {mountainName} · <span style={{ color: 'var(--green-bright)' }}>▲ {altitude.toLocaleString()}m</span>
            </div>
          </div>
        </div>

        {/* 原因说明 */}
        <div style={{
          background: 'rgba(139,0,0,0.08)',
          border: '1px solid rgba(139,0,0,0.25)',
          borderLeft: '3px solid #8B0000',
          padding: '12px 14px',
          marginBottom: 20,
          fontFamily: 'Share Tech Mono', fontSize: 11,
          color: 'var(--text-muted)', lineHeight: 1.8,
        }}>
          <div style={{ color: '#E63946', fontFamily: 'Press Start 2P', fontSize: 7, marginBottom: 8 }}>
            ⚠ 无法访问的原因
          </div>
          {info.needs}，你当前仅可打卡&nbsp;
          <span style={{ color: 'var(--green-bright)' }}>{info.current_max.toLocaleString()}m</span>
          &nbsp;以下的山峰。
        </div>

        {/* 解锁步骤 */}
        <div style={{ marginBottom: 24 }}>
          <div className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)', marginBottom: 12, letterSpacing: 1 }}>
            // 解锁路径 → {info.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {info.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* 步骤编号 */}
                <div style={{
                  width: 20, height: 20, flexShrink: 0,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--green-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Press Start 2P', fontSize: 7,
                  color: 'var(--green-bright)',
                }}>{i + 1}</div>
                <div style={{
                  fontFamily: 'Share Tech Mono', fontSize: 11,
                  color: 'var(--text-muted)', lineHeight: 1.7,
                  paddingTop: 2,
                }}>
                  {step}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px',
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontFamily: 'Press Start 2P', fontSize: 8,
              cursor: 'pointer',
            }}
          >
            知道了
          </button>
          <button
            onClick={onClose}
            className="pixel-btn"
            style={{ flex: 2, padding: '12px', fontSize: 8 }}
          >
            ▶ 去找入门山峰
          </button>
        </div>
      </div>
    </div>
  )
}
