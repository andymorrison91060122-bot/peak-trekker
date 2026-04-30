'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import OnboardingSettingsCard from '@/components/ui/OnboardingSettingsCard'

const TOOLS_VISIBLE_KEY = 'peak_trekker_show_onboarding_tools'

export default function OnboardingToolsGate({
  canAccess,
  defaultOpen,
}: {
  canAccess: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(TOOLS_VISIBLE_KEY)
      if (saved === null) {
        window.localStorage.setItem(TOOLS_VISIBLE_KEY, defaultOpen ? '1' : '0')
        return
      }
      setOpen(saved === '1')
    })

    return () => window.cancelAnimationFrame(frame)
  }, [defaultOpen])

  if (!canAccess) return null

  function toggleVisibility() {
    const next = !open
    setOpen(next)
    window.localStorage.setItem(TOOLS_VISIBLE_KEY, next ? '1' : '0')
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="surface-card" style={{ padding: 14, marginBottom: open ? 10 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="font-pixel" style={{ fontSize: 15, marginBottom: 4 }}>
              开发/管理员工具
            </div>
            <div className="section-subtitle">
              引导调试卡和回归清单页仅对开发环境、管理员或白名单账号显示。
            </div>
          </div>
          <button type="button" className={open ? 'primary-btn' : 'secondary-btn'} style={{ minHeight: 42, padding: '0 14px' }} onClick={toggleVisibility}>
            {open ? '隐藏' : '显示'}
          </button>
        </div>
      </div>

      {open && (
        <>
          <OnboardingSettingsCard />
          <Link href="/onboarding-qa" className="secondary-btn" style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', justifyContent: 'center' }}>
            打开 onboarding 回归清单页
          </Link>
        </>
      )}
    </div>
  )
}
