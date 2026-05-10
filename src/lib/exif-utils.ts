import exifr from 'exifr'
import { haversineMeters } from '@/lib/trek-utils'

const LATE_PROOF_GPS_RANGE_M = 5_000

type RawExif = {
  DateTimeOriginal?: unknown
  CreateDate?: unknown
  GPSLatitude?: unknown
  GPSLongitude?: unknown
  latitude?: unknown
  longitude?: unknown
  Make?: unknown
  Model?: unknown
}

export type LateProofExifData = {
  dateTime?: string
  gpsLat?: number
  gpsLng?: number
  make?: string
  model?: string
  hasFullMetadata: boolean
}

export type LateProofExifRow = {
  key: 'dateTime' | 'gps' | 'device' | 'metadata'
  status: 'ok' | 'warn'
  label: string
  value: string
}

export async function parseLateProofExif(file: File): Promise<LateProofExifData> {
  const raw = (await exifr.parse(file, [
    'DateTimeOriginal',
    'CreateDate',
    'GPSLatitude',
    'GPSLongitude',
    'latitude',
    'longitude',
    'Make',
    'Model',
  ])) as RawExif | undefined

  if (!raw) {
    return { hasFullMetadata: false }
  }

  const dateTime = formatExifDateTime(raw.DateTimeOriginal ?? raw.CreateDate)
  const gpsLat = numberOrUndefined(raw.latitude ?? raw.GPSLatitude)
  const gpsLng = numberOrUndefined(raw.longitude ?? raw.GPSLongitude)
  const make = stringOrUndefined(raw.Make)
  const model = stringOrUndefined(raw.Model)

  return {
    dateTime,
    gpsLat,
    gpsLng,
    make,
    model,
    hasFullMetadata: Boolean(dateTime && Number.isFinite(gpsLat) && Number.isFinite(gpsLng) && (make || model)),
  }
}

export function buildLateProofExifRows({
  exifData,
  mountainName,
  altitude,
  mountainLat,
  mountainLng,
}: {
  exifData: LateProofExifData | null
  mountainName: string
  altitude: string | null
  mountainLat: number | null
  mountainLng: number | null
}): LateProofExifRow[] {
  if (!exifData || !hasAnyExifData(exifData)) {
    return [
      {
        key: 'metadata',
        status: 'warn',
        label: '照片信息',
        value: '未读取到拍摄信息',
      },
    ]
  }

  const rows: LateProofExifRow[] = [
    {
      key: 'dateTime',
      status: exifData.dateTime ? 'ok' : 'warn',
      label: '拍摄时间',
      value: exifData.dateTime ?? '未包含拍摄时间',
    },
    {
      key: 'gps',
      status: gpsRowStatus(exifData, mountainLat, mountainLng),
      label: 'GPS 位置',
      value: gpsRowValue({ exifData, mountainName, altitude, mountainLat, mountainLng }),
    },
    {
      key: 'device',
      status: 'warn',
      label: '设备型号',
      value: deviceRowValue(exifData),
    },
  ]

  return rows
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export function formatExifDateTime(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return formatDateParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
    )
  }

  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?/)
  if (!match) return undefined

  const [, year, month, day, hour = '00', minute = '00'] = match
  return `${year}-${month}-${day} · ${hour}:${minute}`
}

function hasAnyExifData(exifData: LateProofExifData) {
  return Boolean(exifData.dateTime || Number.isFinite(exifData.gpsLat) || Number.isFinite(exifData.gpsLng) || exifData.make || exifData.model)
}

function gpsRowStatus(
  exifData: LateProofExifData,
  mountainLat: number | null,
  mountainLng: number | null,
): LateProofExifRow['status'] {
  if (!Number.isFinite(exifData.gpsLat) || !Number.isFinite(exifData.gpsLng)) return 'warn'
  if (!Number.isFinite(mountainLat) || !Number.isFinite(mountainLng)) return 'warn'

  const distanceM = haversineMeters(exifData.gpsLat!, exifData.gpsLng!, mountainLat!, mountainLng!)
  return distanceM <= LATE_PROOF_GPS_RANGE_M ? 'ok' : 'warn'
}

function gpsRowValue({
  exifData,
  mountainName,
  altitude,
  mountainLat,
  mountainLng,
}: {
  exifData: LateProofExifData
  mountainName: string
  altitude: string | null
  mountainLat: number | null
  mountainLng: number | null
}) {
  if (!Number.isFinite(exifData.gpsLat) || !Number.isFinite(exifData.gpsLng)) {
    return '未包含位置信息'
  }

  if (!Number.isFinite(mountainLat) || !Number.isFinite(mountainLng)) {
    return '缺少山峰坐标，暂不能比对范围'
  }

  const distanceM = haversineMeters(exifData.gpsLat!, exifData.gpsLng!, mountainLat!, mountainLng!)
  if (distanceM <= LATE_PROOF_GPS_RANGE_M) {
    const altitudeLabel = altitude ? ` ${altitude}m` : ''
    return `${mountainName}${altitudeLabel} 范围内`
  }

  return '距离山峰较远'
}

function deviceRowValue(exifData: LateProofExifData) {
  const device =
    exifData.model &&
    exifData.make &&
    (exifData.model.toLowerCase().includes(exifData.make.toLowerCase()) ||
      (exifData.make.toLowerCase() === 'apple' && exifData.model.toLowerCase().includes('iphone')))
      ? exifData.model
      : [exifData.make, exifData.model].filter(Boolean).join(' · ')
  if (!device) return '未包含设备信息'
  return `${device} · ${exifData.hasFullMetadata ? '元数据完整' : '元数据部分完整'}`
}

function formatDateParts(year: number, month: number, day: number, hour: number, minute: number) {
  return `${year}-${pad2(month)}-${pad2(day)} · ${pad2(hour)}:${pad2(minute)}`
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringOrUndefined(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}
