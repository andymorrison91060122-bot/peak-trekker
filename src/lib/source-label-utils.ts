import type { SourceLabelProps } from '@/components/ui/SourceLabel'
import { SCREENSHOT_RECOGNITION_SOURCE } from './trek-utils'

export function getSourceLabelType(source: string | null): SourceLabelProps['type'] {
  switch (source) {
    case 'realtime_gps':
    case 'historical_photo':
      return 'gps_verified'
    case 'track_import':
    case SCREENSHOT_RECOGNITION_SOURCE:
      return 'uploaded'
    default:
      return 'uploaded'
  }
}
