'use client'

import { useState } from 'react'
import LockModal from '@/components/ui/LockModal'

export default function CheckinButton({
  isLocked,
  minLicense,
  mountainName,
  altitude,
}: {
  isLocked: boolean
  minLicense: string
  mountainName: string
  altitude: number
}) {
  const [showModal, setShowModal] = useState(false)

  if (!isLocked) {
    return (
      <button
        style={{
          width: '100%', padding: '14px',
          fontFamily: 'Press Start 2P', fontSize: 10,
          background: 'var(--green-primary)',
          color: 'var(--text-primary)',
          border: '2px solid var(--green-primary)',
          cursor: 'pointer', letterSpacing: 1,
        }}
      >
        ⛰ 开始登顶打卡
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          width: '100%', padding: '14px',
          fontFamily: 'Press Start 2P', fontSize: 10,
          background: 'rgba(139,0,0,0.12)',
          color: '#E63946',
          border: '2px solid rgba(139,0,0,0.4)',
          cursor: 'pointer', letterSpacing: 1,
        }}
      >
        🔒 查看解锁条件
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
