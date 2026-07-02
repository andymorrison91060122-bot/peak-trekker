'use client'

import { useRouter } from 'next/navigation'
import { normalizeAuthReturnPath } from '@/lib/auth-redirect'
import { consumePendingShareTemplateForTrekUrl } from '@/lib/share-template-intent'

export default function CheckinButton({
  requiresLogin,
  minLicense,
  mountainName,
  altitude,
  mountainId,
  label,
}: {
  requiresLogin: boolean
  minLicense: string
  mountainName: string
  altitude: number
  mountainId?: string
  label?: string
}) {
  const router = useRouter()
  void minLicense
  void mountainName
  void altitude

  if (requiresLogin) {
    return (
      <button
        onClick={() => {
          const returnTo = normalizeAuthReturnPath(consumePendingShareTemplateForTrekUrl({ mountainId }), '/trek')
          router.push(`/auth/login?from=${encodeURIComponent(returnTo)}`)
        }}
        className="primary-btn"
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {label || '登录后开始记录'}
      </button>
    )
  }

  return (
    <button
      onClick={() => router.push(consumePendingShareTemplateForTrekUrl({ mountainId }))}
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
