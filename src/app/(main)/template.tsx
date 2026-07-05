import type { ReactNode } from 'react'

export default function MainRouteTemplate({ children }: { children: ReactNode }) {
  return (
    <div
      className="pt-route-motion pt-route-motion-main"
      data-route-motion-wrapper="main"
      data-testid="route-motion-main"
    >
      <style>{`
        @keyframes pt-route-motion-main-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .pt-route-motion-main {
          animation: pt-route-motion-main-enter var(--motion-fast) var(--ease-out);
        }
      `}</style>
      {children}
    </div>
  )
}
