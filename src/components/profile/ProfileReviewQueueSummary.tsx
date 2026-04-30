'use client'

import { useState } from 'react'
import MyRecordsModal from '@/components/profile/MyRecordsModal'
import type { ReviewQueueRecord } from '@/types'

export default function ProfileReviewQueueSummary({
  pendingCount,
  highestAltitude,
  streakDays,
  approvedRealtimeCount,
  records,
}: {
  pendingCount: number
  highestAltitude: number
  streakDays: number
  approvedRealtimeCount: number
  records: ReviewQueueRecord[]
}) {
  const [isReviewQueueOpen, setIsReviewQueueOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <button
          type="button"
          className="metric-tile profile-review-queue-trigger"
          style={{ padding: '12px 10px' }}
          data-testid="profile-review-queue-trigger"
          onClick={() => setIsReviewQueueOpen(true)}
        >
          <div className="font-pixel" style={{ fontSize: 16 }}>{pendingCount}</div>
          <div className="metric-label">待审核</div>
        </button>

        {[
          { label: '最高海拔', value: `${highestAltitude}m` },
          { label: '连续打卡', value: `${streakDays}天` },
          { label: 'GPS 记录', value: approvedRealtimeCount },
        ].map((item) => (
          <div key={item.label} className="metric-tile" style={{ padding: '12px 10px' }}>
            <div className="font-pixel" style={{ fontSize: 16 }}>{item.value}</div>
            <div className="metric-label">{item.label}</div>
          </div>
        ))}
      </div>

      <MyRecordsModal
        open={isReviewQueueOpen}
        onClose={() => setIsReviewQueueOpen(false)}
        records={records}
      />
    </>
  )
}
