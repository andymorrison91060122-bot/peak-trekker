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
  '地区暂未记录',
  '已留证山行',
  '未知地点',
  '未留证',
])

const FILE_NAME_RE = /^[^\\/]+\.(png|jpe?g|webp|gpx|fit|kml|tcx)$/i
const FULL_CDATA_RE = /^<!\[CDATA\[([\s\S]*)\]\]>$/
const DEVICE_DEFAULT_SUFFIX = '(?:其它|其他|未命名)'
const UNIX_TIMESTAMP_RE = /^\d{10}(?:\d{3})?$/
const COMPACT_DATE_TIME_RE = new RegExp(`^\\d{8}[_ -]?\\d{6}(?:\\s*${DEVICE_DEFAULT_SUFFIX})?$`)
const DATE_TIME_RE = new RegExp(
  `^\\d{4}(?:[-/.]\\d{1,2}[-/.]\\d{1,2}|年\\d{1,2}月\\d{1,2}日)(?:[T\\s]\\d{1,2}:\\d{2}(?::\\d{2})?)?(?:\\s*${DEVICE_DEFAULT_SUFFIX})?$`,
)

function cleanLabel(value: string | null | undefined) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  const cdataMatch = trimmed.match(FULL_CDATA_RE)
  return (cdataMatch?.[1] ?? trimmed).trim()
}

function isDeviceDefaultTrackName(value: string) {
  return UNIX_TIMESTAMP_RE.test(value) || COMPACT_DATE_TIME_RE.test(value) || DATE_TIME_RE.test(value)
}

export function isDisplayableTrackName(value: string | null | undefined) {
  const cleaned = cleanLabel(value)
  if (!cleaned) return false
  if (GENERIC_TRACK_NAMES.has(cleaned)) return false
  if (FILE_NAME_RE.test(cleaned)) return false
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(cleaned)) return false
  if (isDeviceDefaultTrackName(cleaned)) return false
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
