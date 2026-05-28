'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { storeShareAttribution } from '@/lib/analytics/attribution'
import { getOrCreateAnalyticsSessionId } from '@/lib/analytics/session'
import { trackEvent } from '@/lib/analytics/client'

export default function AnalyticsPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()

  useEffect(() => {
    const pagePath = queryString ? `${pathname}?${queryString}` : pathname
    trackEvent({
      event_type: 'page_view',
      event_name: 'page_view',
      page_path: pagePath,
    })

    const shareLinkId = searchParams.get('ref')
    if (!shareLinkId) return
    const templateId = searchParams.get('template') ?? undefined
    const sourceUserId = searchParams.get('source') ?? undefined
    storeShareAttribution({
      share_link_id: shareLinkId,
      template_id: templateId,
      source_user_id: sourceUserId,
    })
    trackEvent({
      event_type: 'business',
      event_name: 'business.share_link_open',
      properties: {
        share_link_id: shareLinkId,
        template_id: templateId ?? null,
        source_user_id: sourceUserId ?? null,
        visitor_session_id: getOrCreateAnalyticsSessionId(),
      },
      page_path: pagePath,
    })
  }, [pathname, queryString, searchParams])

  return null
}
