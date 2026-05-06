import type { SourceLabelProps } from '@/components/ui/SourceLabel'

export function getSourceLabelType(source: string | null): SourceLabelProps['type'] {
  switch (source) {
    case 'realtime_gps':
    case 'historical_photo':
      return 'gps_verified'
    case 'track_import':
    case 'screenshot_recognition':
      return 'uploaded'
    default:
      return 'uploaded'
  }
}
