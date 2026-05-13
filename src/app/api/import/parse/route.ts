import { NextResponse } from 'next/server'
import { IMPORT_MOUNTAIN_DISTANCE_THRESHOLD_METERS } from '@/lib/import/mountain-distance-check'
import { AUTO_MATCH_THRESHOLD_METERS, matchNearestMountainCandidatesForTrack } from '@/lib/import/mountain-matcher'
import { parseTrackFile } from '@/lib/import'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const IMPORT_MAX_BYTES = 20 * 1024 * 1024
const SUPPORTED_IMPORT_EXTENSIONS = ['gpx', 'kml', 'fit'] as const

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function isSupportedImportFile(fileName: string) {
  return SUPPORTED_IMPORT_EXTENSIONS.includes(getFileExtension(fileName) as (typeof SUPPORTED_IMPORT_EXTENSIONS)[number])
}

function importParseStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/unsupported import format/i.test(message)) return 415
  if (/没有可用轨迹点|no usable track/i.test(message)) return 422
  return 500
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少轨迹文件。' }, { status: 400 })
  }

  if (file.size > IMPORT_MAX_BYTES) {
    return NextResponse.json({ error: '轨迹文件不能超过 20MB。' }, { status: 413 })
  }

  if (!isSupportedImportFile(file.name)) {
    return NextResponse.json({ error: '仅支持 GPX、KML 或 FIT 轨迹文件。' }, { status: 415 })
  }

  try {
    const parsedData = await parseTrackFile(file.name, Buffer.from(await file.arrayBuffer()))
    const suggestedCandidates = await matchNearestMountainCandidatesForTrack(parsedData.trackPoints, {
      thresholdMeters: IMPORT_MOUNTAIN_DISTANCE_THRESHOLD_METERS,
    })
    const suggestedMountain = suggestedCandidates.find((candidate) => candidate.distanceMeters <= AUTO_MATCH_THRESHOLD_METERS) ?? null

    return NextResponse.json({
      ok: true,
      parsedData: {
        ...parsedData,
        suggestedMountain,
        suggestedCandidates,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '轨迹文件解析失败，请换一个文件重试。' },
      { status: importParseStatus(error) }
    )
  }
}
