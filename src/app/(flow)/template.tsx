'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export default function FlowRouteTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/import' || pathname === '/screenshot') {
    return <>{children}</>
  }

  return (
    <div
      className="pt-route-motion pt-route-motion-flow"
      data-route-motion-wrapper="flow"
      data-testid="route-motion-flow"
    >
      <style>{`
        @keyframes pt-route-motion-flow-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .pt-route-motion-flow {
          animation: pt-route-motion-flow-enter var(--motion-base) var(--ease-out);
        }
      `}</style>
      {children}
    </div>
  )
}
