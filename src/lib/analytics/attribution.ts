import {
  ATTRIBUTION_LINK_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  ATTRIBUTION_SOURCE_COOKIE,
  ATTRIBUTION_TEMPLATE_COOKIE,
} from './constants'
import type { AnalyticsProperties } from './types'
import { clearClientCookie, readClientCookie, writeClientCookie } from './session'

export type ShareAttributionState = {
  share_link_id: string
  template_id?: string
  source_user_id?: string
}

export function storeShareAttribution(state: ShareAttributionState) {
  writeClientCookie(ATTRIBUTION_LINK_COOKIE, state.share_link_id, ATTRIBUTION_MAX_AGE_SECONDS)
  if (state.template_id) writeClientCookie(ATTRIBUTION_TEMPLATE_COOKIE, state.template_id, ATTRIBUTION_MAX_AGE_SECONDS)
  if (state.source_user_id) writeClientCookie(ATTRIBUTION_SOURCE_COOKIE, state.source_user_id, ATTRIBUTION_MAX_AGE_SECONDS)
}

export function readShareAttribution(): ShareAttributionState | null {
  const shareLinkId = readClientCookie(ATTRIBUTION_LINK_COOKIE)
  if (!shareLinkId) return null
  return {
    share_link_id: shareLinkId,
    template_id: readClientCookie(ATTRIBUTION_TEMPLATE_COOKIE) ?? undefined,
    source_user_id: readClientCookie(ATTRIBUTION_SOURCE_COOKIE) ?? undefined,
  }
}

export function clearShareAttribution() {
  clearClientCookie(ATTRIBUTION_LINK_COOKIE)
  clearClientCookie(ATTRIBUTION_TEMPLATE_COOKIE)
  clearClientCookie(ATTRIBUTION_SOURCE_COOKIE)
}

export function attributionProperties(newUserId: string): AnalyticsProperties | null {
  const state = readShareAttribution()
  if (!state) return null
  return {
    share_link_id: state.share_link_id,
    source_user_id: state.source_user_id ?? null,
    template_id: state.template_id ?? null,
    new_user_id: newUserId,
  }
}
