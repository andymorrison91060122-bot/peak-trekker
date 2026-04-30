'use client'

import { useEffect, useState } from 'react'

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, '')
}

export default function SanitizedMountainDescription({
  html,
}: {
  html: string
}) {
  const fallbackHtml = stripTags(html)
  const [sanitizedHtml, setSanitizedHtml] = useState(fallbackHtml)

  useEffect(() => {
    let active = true

    if (typeof window === 'undefined') {
      setSanitizedHtml(fallbackHtml)
      return () => {
        active = false
      }
    }

    import('dompurify')
      .then(({ default: DOMPurify }) => {
        if (!active) return
        setSanitizedHtml(DOMPurify.sanitize(html))
      })
      .catch(() => {
        if (!active) return
        setSanitizedHtml(fallbackHtml)
      })

    return () => {
      active = false
    }
  }, [fallbackHtml, html])

  return (
    <div
      className="detail-copy mountain-description-richtext"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
