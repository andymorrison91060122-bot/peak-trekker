'use client'

import { useRouter } from 'next/navigation'
import { normalizeAuthReturnPath } from '@/lib/auth-redirect'

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
  const returnTo = normalizeAuthReturnPath(mountainId ? `/trek?mountainId=${mountainId}` : '/trek', '/trek')
  void minLicense
  void mountainName
  void altitude

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
