'use client'

import ModalShell from '@/components/ui/ModalShell'
import type { ReviewQueueRecord } from '@/types'

function formatReviewQueueTimestamp(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sortRecords(records: ReviewQueueRecord[]) {
  return [...records].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

export default function MyRecordsModal({
  open,
  onClose,
  records,
}: {
  open: boolean
  onClose: () => void
  records: ReviewQueueRecord[]
}) {
  if (!open) return null

  const orderedRecords = sortRecords(records)

  return (
    <ModalShell
      title="我的记录"
      onClose={onClose}
      mode="sheet"
      layout="default"
      closeControl="icon"
      maxWidth={480}
    >
      <div className="review-queue-modal">
        {orderedRecords.length === 0 ? (
          <div className="review-queue-empty" data-testid="review-queue-empty">
            还没有待处理的记录
          </div>
        ) : (
          <div className="review-queue-list">
            {orderedRecords.map((record) => (
              <article
                key={record.checkinId}
                className="review-queue-card"
                data-testid="review-queue-card"
              >
                <div className="review-queue-card__row">
                  <div className="review-queue-card__thumb-shell">
                    {record.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={record.photoUrl}
                        alt={`${record.mountainName} 的打卡照片`}
                        className="review-queue-card__thumb"
                      />
                    ) : (
                      <div className="review-queue-card__thumb review-queue-card__thumb--fallback" aria-hidden="true">
                        山
                      </div>
                    )}
                  </div>

                  <div className="review-queue-card__copy">
                    <div className="review-queue-card__title">{record.mountainName}</div>
                    <div className="review-queue-card__meta">{formatReviewQueueTimestamp(record.createdAt)}</div>
                  </div>

                  <span
                    className="review-queue-card__badge"
                    data-status={record.status}
                  >
                    {record.status === 'pending' ? '审核中' : '未通过'}
                  </span>
                </div>

                {record.status === 'rejected' ? (
                  <div className="review-queue-card__note">
                    {record.reviewNote?.trim() || '未提供原因'}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
