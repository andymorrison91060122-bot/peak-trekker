export type CheckinDisplayTitleSource = 'mountain' | 'track_name' | 'fallback'

export type CheckinDisplayTitle = {
  title: string
  titleSource: CheckinDisplayTitleSource
  unmatchedTag: '未关联' | null
  secondaryLocation: string
}

const FALLBACK_TITLE = '未关联山行'
const UNMATCHED_SECONDARY = '未关联山峰'
const UNKNOWN_LOCATION = '未知地点'

const GENERIC_TRACK_NAMES = new Set([
  '截图识别活动',
  '未命名山行',
  '未关联山行',
  '未关联山峰',
  '未关联地区',
  '已留证山行',
  '未知地点',
  '未留证',
])

const FILE_NAME_RE = /^[^\\/]+\.(png|jpe?g|webp|gpx|fit|kml|tcx)$/i

function cleanLabel(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isDisplayableTrackName(value: string | null | undefined) {
  const cleaned = cleanLabel(value)
  if (!cleaned) return false
  if (GENERIC_TRACK_NAMES.has(cleaned)) return false
  if (FILE_NAME_RE.test(cleaned)) return false
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(cleaned)) return false
  return true
}

export function resolveCheckinDisplayTitle({
  mountainName,
  trackName,
  fallbackTitle = FALLBACK_TITLE,
}: {
  mountainName?: string | null
  trackName?: string | null
  fallbackTitle?: string
}): CheckinDisplayTitle {
  const cleanedMountain = cleanLabel(mountainName)
  if (cleanedMountain) {
    return {
      title: cleanedMountain,
      titleSource: 'mountain',
      unmatchedTag: null,
      secondaryLocation: '',
    }
  }

  const cleanedTrackName = cleanLabel(trackName)
  if (isDisplayableTrackName(cleanedTrackName)) {
    return {
      title: cleanedTrackName,
      titleSource: 'track_name',
      unmatchedTag: '未关联',
      secondaryLocation: UNMATCHED_SECONDARY,
    }
  }

  return {
    title: cleanLabel(fallbackTitle) || FALLBACK_TITLE,
    titleSource: 'fallback',
    unmatchedTag: '未关联',
    secondaryLocation: UNKNOWN_LOCATION,
  }
}
