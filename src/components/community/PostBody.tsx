'use client'

import { useState } from 'react'

export default function PostBody({
  text,
}: {
  text: string
}) {
  const trimmed = text.trim()
  const [expanded, setExpanded] = useState(false)
  const shouldClamp = trimmed.length > 116 || trimmed.split('\n').length > 2

  if (!trimmed) return null

  return (
    <div className="community-v2-post-body" data-testid="community-post-body">
      <div
        className={`community-v2-post-body__text ${shouldClamp && !expanded ? 'community-v2-post-body__text--clamped' : ''}`}
      >
        {trimmed}
      </div>
      {shouldClamp && !expanded ? (
        <button type="button" className="community-v2-post-body__expand" onClick={() => setExpanded(true)}>
          ...展开
        </button>
      ) : null}
    </div>
  )
}
