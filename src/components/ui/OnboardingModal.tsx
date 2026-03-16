'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'peak_trekker_onboarded'

const STEPS = [
  {
    icon: '⛰',
    title: '选山出发',
    content: '在探索页浏览所有山峰，选择适合你等级的山，开启出发记录，追踪你的登山轨迹。',
  },
  {
    icon: '🪪',
    title: '解锁执照',
    content: '每完成一座山积累经验值，升级登山执照后解锁更高难度的山峰挑战。',
  },
  {
    icon: '📷',
    title: '水印相机',
    content: '登顶后生成专属海拔剖面海报，带有海拔、时间、坐标水印，一键分享朋友圈。',
  },
  {
    icon: '🏆',
    title: '为省争光',
    content: '每次登顶打卡为你的家乡省份加分，登上全国省份热度排行榜，为家乡争荣耀！',
  },
]

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) setVisible(true)
  }, [])

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      finish()
    }
  }

  if (!visible) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'var(--bg-card)',
        border: '2px solid var(--green-primary)',
        borderRadius: 12,
        padding: '32px 24px',
        textAlign: 'center',
      }}>
        {/* 步骤点 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === step ? 'var(--green-primary)' : 'var(--border-color)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* 图标 */}
        <div style={{ fontSize: 56, marginBottom: 20, lineHeight: 1 }}>{current.icon}</div>

        {/* 标题 */}
        <div className="font-pixel" style={{
          fontSize: 13,
          color: 'var(--green-primary)',
          marginBottom: 16,
          lineHeight: 1.6,
        }}>
          {current.title}
        </div>

        {/* 内容 */}
        <div style={{
          fontFamily: 'Share Tech Mono',
          fontSize: 15,
          color: 'var(--text-secondary)',
          lineHeight: 1.8,
          marginBottom: 32,
        }}>
          {current.content}
        </div>

        {/* 按钮 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={finish}
            style={{
              flex: 1,
              padding: '14px',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              fontFamily: 'Share Tech Mono',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            跳过
          </button>
          <button
            onClick={next}
            className="pixel-btn"
            style={{ flex: 2, padding: '14px', fontSize: 11 }}
          >
            {isLast ? '开始探索 →' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
