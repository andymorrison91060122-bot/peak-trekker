import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { COMMUNITY_MAX_IMAGE_COUNT } from '@/lib/community'
import { describeStorageError, normalizeStorageUploadError } from '@/lib/storage-errors'
import {
  buildCheckinPhotoObjectPath,
  CHECKIN_PHOTOS_BUCKET,
  CHECKIN_PHOTOS_MAX_BYTES,
  STORAGE_CACHE_CONTROL,
  storageUploadStatus,
  validateStorageImageFile,
} from '@/lib/storage-utils'
import type { CheckinAsset } from '@/types'

type CheckinRow = {
  id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  photo_url: string | null
}

type CheckinAssetRow = {
  id: string
  checkin_id: string
  type: 'image' | 'video' | 'poster'
  url: string
  thumbnail_url: string | null
  created_at: string
  sort_order: number | null
}

function normalizeNote(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 2000)
}

async function bestEffortRemoveCheckinPhotoObjects(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  paths: string[]
) {
  if (!paths.length) return
  await supabase.storage.from(CHECKIN_PHOTOS_BUCKET).remove(paths).catch(() => undefined)
}

async function loadCheckinById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  checkinId: string
) {
  const { data, error } = await supabase
    .from('checkins')
    .select('id, user_id, status, note, photo_url')
    .eq('id', checkinId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || '记录读取失败，请稍后重试。')
  }

  return (data ?? null) as CheckinRow | null
}

async function loadExistingImageAssets(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  checkinId: string
) {
  const { data, error } = await supabase
    .from('checkin_assets')
    .select('id, checkin_id, type, url, thumbnail_url, created_at, sort_order')
    .eq('checkin_id', checkinId)
    .eq('type', 'image')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message || '记录素材读取失败，请稍后重试。')
  }

  return (data ?? []) as CheckinAssetRow[]
}

function toClientAsset(asset: CheckinAssetRow): CheckinAsset {
  return {
    id: asset.id,
    checkin_id: asset.checkin_id,
    type: asset.type,
    url: asset.url,
    thumbnail_url: asset.thumbnail_url,
    created_at: asset.created_at,
    sort_order: asset.sort_order ?? 0,
    source: 'upload',
  }
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

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData().catch(() => null)
    const action = typeof formData?.get('action') === 'string' ? String(formData?.get('action')) : ''

    if (action !== 'add_activity_images') {
      return NextResponse.json({ error: 'unsupported action' }, { status: 400 })
    }

    const checkinId = typeof formData?.get('checkinId') === 'string' ? String(formData?.get('checkinId')) : ''
    const files = (formData?.getAll('files') ?? []).filter((entry): entry is File => entry instanceof File)

    if (!checkinId) {
      return NextResponse.json({ error: 'checkinId required' }, { status: 400 })
    }

    if (!files.length) {
      return NextResponse.json({ error: '请至少选择一张现场照片。' }, { status: 400 })
    }

    const checkin = await loadCheckinById(supabase, checkinId)
    if (!checkin) {
      return NextResponse.json({ error: 'record not found' }, { status: 404 })
    }
    if (checkin.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (checkin.status !== 'approved') {
      return NextResponse.json({ error: '只有已通过的攀登记录才能补充现场照片。' }, { status: 422 })
    }

    for (const file of files) {
      const validation = validateStorageImageFile(file, {
        maxBytes: CHECKIN_PHOTOS_MAX_BYTES,
        invalidTypeMessage: '只能上传 JPG、PNG 或 WebP 格式的现场照片。',
        tooLargeMessage: '单张现场照片不能超过 8MB。',
      })
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status })
      }
    }

    try {
      const existingAssets = await loadExistingImageAssets(supabase, checkinId)
      const existingUrls = new Set(existingAssets.map((asset) => asset.url))
      const currentImageCount = existingAssets.length + (checkin.photo_url && !existingUrls.has(checkin.photo_url) ? 1 : 0)

      if (currentImageCount + files.length > COMMUNITY_MAX_IMAGE_COUNT) {
        return NextResponse.json(
          { error: `最多只能保留 ${COMMUNITY_MAX_IMAGE_COUNT} 张现场照片。` },
          { status: 422 }
        )
      }

      const uploadedRows: Array<{
        checkin_id: string
        type: 'image'
        url: string
        thumbnail_url: string
        sort_order: number
      }> = []

      const uploadedObjectPaths: string[] = []

      for (const [index, file] of files.entries()) {
        const path = buildCheckinPhotoObjectPath({
          userId: user.id,
          file,
          fallbackBase: 'activity-photo',
          scopeId: checkinId,
          index,
        })
        const { error: uploadError } = await supabase.storage.from(CHECKIN_PHOTOS_BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: STORAGE_CACHE_CONTROL,
        })
        if (uploadError) {
          const message = normalizeStorageUploadError(
            describeStorageError(uploadError),
            '现场照片上传失败，请稍后重试。'
          )
          await bestEffortRemoveCheckinPhotoObjects(supabase, uploadedObjectPaths)
          return NextResponse.json({ error: message }, { status: storageUploadStatus(message) })
        }

        uploadedObjectPaths.push(path)
        const { data: publicUrlData } = supabase.storage.from(CHECKIN_PHOTOS_BUCKET).getPublicUrl(path)
        uploadedRows.push({
          checkin_id: checkinId,
          type: 'image',
          url: publicUrlData.publicUrl,
          thumbnail_url: publicUrlData.publicUrl,
          sort_order: existingAssets.length + index,
        })
      }

      const { data: insertedAssets, error: insertError } = await supabase
        .from('checkin_assets')
        .insert(uploadedRows)
        .select('id, checkin_id, type, url, thumbnail_url, created_at, sort_order')

      if (insertError) {
        await bestEffortRemoveCheckinPhotoObjects(supabase, uploadedObjectPaths)
        return NextResponse.json({ error: insertError.message || '现场照片保存失败，请稍后重试。' }, { status: 500 })
      }

      const nextCoverUrl = !checkin.photo_url && uploadedRows[0] ? uploadedRows[0].url : checkin.photo_url
      if (!checkin.photo_url && uploadedRows[0]) {
        const { error: updatePhotoError } = await supabase
          .from('checkins')
          .update({ photo_url: uploadedRows[0].url })
          .eq('id', checkinId)
          .eq('user_id', user.id)

        if (updatePhotoError) {
          return NextResponse.json({ error: updatePhotoError.message || '现场照片封面更新失败，请稍后重试。' }, { status: 500 })
        }
      }

      return NextResponse.json({
        ok: true,
        assets: ((insertedAssets ?? []) as CheckinAssetRow[]).map(toClientAsset),
        photoUrl: nextCoverUrl,
      })
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error && error.message.trim()
              ? error.message
              : '现场照片上传失败，请稍后重试。',
        },
        { status: 500 }
      )
    }
  }

  const body = await request.json().catch(() => ({}))
  const action = body?.action as string | undefined

  if (action !== 'update_activity_note') {
    return NextResponse.json({ error: 'unsupported action' }, { status: 400 })
  }

  const checkinId = typeof body?.checkinId === 'string' ? body.checkinId : ''
  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId required' }, { status: 400 })
  }

  const checkin = await loadCheckinById(supabase, checkinId)
  if (!checkin) {
    return NextResponse.json({ error: 'record not found' }, { status: 404 })
  }
  if (checkin.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (checkin.status !== 'approved') {
    return NextResponse.json({ error: '只有已通过的攀登记录才能编辑攀登日记。' }, { status: 422 })
  }

  const note = normalizeNote(body?.note)
  const { error: updateError } = await supabase
    .from('checkins')
    .update({ note })
    .eq('id', checkinId)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message || '攀登日记保存失败，请稍后重试。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, note })
}
