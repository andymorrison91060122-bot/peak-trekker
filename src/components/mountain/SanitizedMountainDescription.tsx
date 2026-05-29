'use client'

import { useEffect, useState } from 'react'

import {
  getMountainDescriptionSanitizeConfig,
  MOUNTAIN_DESCRIPTION_ALLOWED_ATTR,
  MOUNTAIN_DESCRIPTION_ALLOWED_TAGS,
  MOUNTAIN_DESCRIPTION_FORBID_TAGS,
  stripTagsForFallback,
} from './mountain-description-sanitize'

export {
  MOUNTAIN_DESCRIPTION_ALLOWED_ATTR,
  MOUNTAIN_DESCRIPTION_ALLOWED_TAGS,
  MOUNTAIN_DESCRIPTION_FORBID_TAGS,
  stripTagsForFallback,
}

export default function SanitizedMountainDescription({
  html,
}: {
  html: string
}) {
  const fallbackHtml = stripTagsForFallback(html)
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
        setSanitizedHtml(DOMPurify.sanitize(html, getMountainDescriptionSanitizeConfig()))
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
