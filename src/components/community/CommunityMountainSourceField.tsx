'use client'

import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent } from 'react'
import IconButton from '@/components/ui/IconButton'

export default function CommunityMountainSourceField({
  label,
  value,
  href,
}: {
  label: string
  value: string
  href: string
}) {
  const router = useRouter()

  function navigate() {
    router.push(href)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    navigate()
  }

  function handleIconClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    navigate()
  }

  return (
    <div
      className="community-detail__source-item community-detail__source-item--interactive"
      data-testid="community-mountain-source-item"
      role="link"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={handleKeyDown}
    >
      <div className="community-detail__source-label">{label}</div>
      <div className="community-detail__source-value-row">
        <div className="community-detail__source-value">{value}</div>
        <IconButton
          icon="chevron-right"
          ariaLabel="查看山峰详情"
          variant="filled"
          onClick={handleIconClick}
        />
      </div>
    </div>
  )
}
