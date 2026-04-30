'use client'

import { useEffect, useRef, useState } from 'react'
import CheckinButton from '@/components/ui/CheckinButton'

export default function MountainDetailRecordCTA({
  isLocked,
  requiresLogin,
  minLicense,
  mountainName,
  altitude,
  mountainId,
}: {
  isLocked: boolean
  requiresLogin: boolean
  minLicense: string
  mountainName: string
  altitude: number
  mountainId: string
}) {
  const mainButtonRef = useRef<HTMLDivElement | null>(null)
  const [showFloatingButton, setShowFloatingButton] = useState(false)

  useEffect(() => {
    if (!mainButtonRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingButton(!entry.isIntersecting)
      },
      {
        threshold: 0.92,
      }
    )

    observer.observe(mainButtonRef.current)
    return () => observer.disconnect()
  }, [])

  const inlineLabel = requiresLogin ? '登录后开始记录' : '开始记录'
  const floatingLabel = requiresLogin ? '登录后开始记录' : '开始记录'

  return (
    <>
      <div ref={mainButtonRef} data-testid="mountain-detail-primary-cta">
        <CheckinButton
          isLocked={isLocked}
          requiresLogin={requiresLogin}
          minLicense={minLicense}
          mountainName={mountainName}
          altitude={altitude}
          mountainId={mountainId}
          label={inlineLabel}
        />
      </div>

      {showFloatingButton && (
        <div className="bottom-action-bar-shell">
          <div className="surface-card bottom-action-bar">
            <CheckinButton
              isLocked={isLocked}
              requiresLogin={requiresLogin}
              minLicense={minLicense}
              mountainName={mountainName}
              altitude={altitude}
              mountainId={mountainId}
              label={floatingLabel}
            />
          </div>
        </div>
      )}
    </>
  )
}
