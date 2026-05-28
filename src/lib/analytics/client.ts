'use client'

import { getOrCreateAnalyticsSessionId } from './session'
import type { TrackEventInput } from './types'

function currentPagePath() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}`
}

function normalizeInput(input: TrackEventInput): TrackEventInput {
  return {
    ...input,
    page_path: input.page_path ?? currentPagePath(),
    referrer: input.referrer ?? (typeof document === 'undefined' ? undefined : document.referrer || undefined),
    client_ts: input.client_ts ?? new Date().toISOString(),
  }
}

export function trackEvent(input: TrackEventInput) {
  if (typeof window === 'undefined') return
  try {
    getOrCreateAnalyticsSessionId()
    const payload = JSON.stringify(normalizeInput(input))
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon('/api/analytics/event', blob)) return
    }
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch((error) => {
      console.warn('[analytics] event dropped', error)
    })
  } catch (error) {
    console.warn('[analytics] event dropped', error)
  }
}

export async function trackEventNow(input: TrackEventInput) {
  if (typeof window === 'undefined') return false
  try {
    getOrCreateAnalyticsSessionId()
    const response = await fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(normalizeInput(input)),
      keepalive: true,
    })
    return response.ok
  } catch (error) {
    console.warn('[analytics] event dropped', error)
    return false
  }
}
