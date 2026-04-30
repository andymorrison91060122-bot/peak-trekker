'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LockModal from '@/components/ui/LockModal'
import { normalizeAuthReturnPath } from '@/lib/auth-redirect'

export default function CheckinButton({
  isLocked,
  requiresLogin,
  minLicense,
  mountainName,
  altitude,
  mountainId,
  label,
}: {
  isLocked: boolean
  requiresLogin: boolean
  minLicense: string
  mountainName: string
  altitude: number
  mountainId?: string
  label?: string
}) {
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()
  const returnTo = normalizeAuthReturnPath(mountainId ? `/trek?mountainId=${mountainId}` : '/trek', '/trek')

  if (requiresLogin) {
    return (
      <button
        onClick={() => router.push(`/auth/login?from=${encodeURIComponent(returnTo)}`)}
        className="primary-btn"
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {label || '登录后开始记录'}
      </button>
    )
  }

  if (!isLocked) {
    return (
      <button
        onClick={() => router.push(mountainId ? `/trek?mountainId=${mountainId}` : '/trek')}
        className="primary-btn"
        style={{
          width: '100%',
          justifyContent: 'center',
        }}
      >
        {label || '开始记录'}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="secondary-btn"
        style={{
          width: '100%',
          justifyContent: 'center',
          borderColor: 'rgba(239,68,68,0.24)',
          background: 'rgba(239,68,68,0.1)',
          color: '#fca5a5',
        }}
      >
        查看执照要求
      </button>

      {showModal && (
        <LockModal
          mountainName={mountainName}
          altitude={altitude}
          minLicense={minLicense}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
