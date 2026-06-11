import { resolveCheckinDisplayTitle } from './checkin-display-title.ts'

export const SHARE_UNKNOWN_MOUNTAIN_TITLE = '未知山峰'

export function resolveMeasuredShareAltitude(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return undefined
}

export function resolveShareMountainName({
  mountainName,
  trackName,
}: {
  mountainName?: string | null
  trackName?: string | null
}) {
  return resolveCheckinDisplayTitle({
    mountainName,
    trackName,
    fallbackTitle: SHARE_UNKNOWN_MOUNTAIN_TITLE,
  }).title
}
