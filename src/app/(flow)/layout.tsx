import type { ReactNode } from 'react'

// (flow) route group: 多步骤流程页面，无全局 Header / TabBar
// 当前已迁移: /import
// 后续需迁移: /screenshot (截图识别), /share (分享编辑器)
// 注意: /explore/[id] (Mountain Detail) 有独立的布局需求，需另行评估

export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--color-surface)',
        paddingTop: 'max(env(safe-area-inset-top), var(--space-2))',
      }}
    >
      {children}
    </div>
  )
}
