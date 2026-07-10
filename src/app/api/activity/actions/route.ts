import { NextResponse } from 'next/server'
import {
  ActivityFieldPolicyError,
  assertActivityUpdatePolicy,
} from '@/lib/activity-field-policy'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
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

function logActivityActionFailure(context: string, error: unknown) {
  console.error(`[activity-actions] ${context}`, error)
}

function activityPolicyDisplayMessage(error: ActivityFieldPolicyError) {
  if (error.reason === 'locked_numeric') return '这项记录由系统生成，不能手动改动。'
  if (error.reason === 'immutable') return '这项记录不能手动改动。'
  return '这次修改里有暂不支持的内容，请刷新后重试。'
}

function normalizeNote(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, 2000)
}

function policyErrorResponse(error: unknown) {
  if (!(error instanceof ActivityFieldPolicyError)) return null

  return NextResponse.json(
    {
      error: activityPolicyDisplayMessage(error),
      field: error.field,
      reason: error.reason,
    },
    { status: error.status }
  )
}

function formDataToUpdateObject(formData: FormData | null) {
  const updates: Record<string, unknown> = {}
  formData?.forEach((value, key) => {
    updates[key] = value
  })
  return updates
}

async function bestEffortRemoveCheckinPhotoObjects(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  paths: string[]
) {
  if (!paths.length) return
  await supabase.storage.from(CHECKIN_PHOTOS_BUCKET).remove(paths).catch(() => undefined)
}

function getCheckinPhotoObjectPath(url: string, userId: string) {
  try {
    const parsedUrl = new URL(url)
    const marker = `/storage/v1/object/public/${CHECKIN_PHOTOS_BUCKET}/`
    const markerIndex = parsedUrl.pathname.indexOf(marker)
    if (markerIndex === -1) return null

    const objectPath = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length))
    return objectPath.startsWith(`checkins/${userId}/`) ? objectPath : null
  } catch {
    return null
  }
}

async function loadCheckinById(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  checkinId: string
) {
  const { data, error } = await supabase
    .from('checkins')
    .select('id, user_id, note, photo_url')
    .eq('id', checkinId)
    .maybeSingle()

  if (error) {
    logActivityActionFailure('checkin read failed', error)
    throw new Error('记录读取失败，请稍后重试。')
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
    logActivityActionFailure('image assets read failed', error)
    throw new Error('记录素材读取失败，请稍后重试。')
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
    if (authError) logActivityActionFailure('auth failed', authError)
    return NextResponse.json({ error: '登录后即可修改活动。' }, { status: 401 })
  }

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData().catch(() => null)
    const action = typeof formData?.get('action') === 'string' ? String(formData?.get('action')) : ''

    if (action !== 'add_activity_images') {
      return NextResponse.json({ error: '暂不支持这项操作，请刷新后重试。' }, { status: 400 })
    }

    try {
      assertActivityUpdatePolicy(formDataToUpdateObject(formData), {
        ignoredFields: ['action', 'checkinId', 'files'],
        allowedFields: [],
      })
    } catch (error) {
      return policyErrorResponse(error) ?? NextResponse.json({ error: '这次修改里有暂不支持的内容，请刷新后重试。' }, { status: 400 })
    }

    const checkinId = typeof formData?.get('checkinId') === 'string' ? String(formData?.get('checkinId')) : ''
    const files = (formData?.getAll('files') ?? []).filter((entry): entry is File => entry instanceof File)

    if (!checkinId) {
      return NextResponse.json({ error: '这条活动暂时无法识别，请刷新后重试。' }, { status: 400 })
    }

    if (!files.length) {
      return NextResponse.json({ error: '请至少选择一张现场照片。' }, { status: 400 })
    }

    const checkin = await loadCheckinById(supabase, checkinId)
    if (!checkin) {
      return NextResponse.json({ error: '这条活动暂时找不到，请刷新后重试。' }, { status: 404 })
    }
    if (checkin.user_id !== user.id) {
      return NextResponse.json({ error: '你不能修改这条活动。' }, { status: 403 })
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
          logActivityActionFailure('photo upload failed', uploadError)
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
        logActivityActionFailure('photo asset insert failed', insertError)
        await bestEffortRemoveCheckinPhotoObjects(supabase, uploadedObjectPaths)
        return NextResponse.json({ error: '现场照片保存失败，请稍后重试。' }, { status: 500 })
      }

      const nextCoverUrl = !checkin.photo_url && uploadedRows[0] ? uploadedRows[0].url : checkin.photo_url
      if (!checkin.photo_url && uploadedRows[0]) {
        const coverUpdate = { photo_url: uploadedRows[0].url }
        assertActivityUpdatePolicy(coverUpdate, { allowedFields: ['photo_url'] })
        const adminSupabase = createSupabaseAdminClient()

        const { error: updatePhotoError } = await adminSupabase
          .from('checkins')
          .update(coverUpdate)
          .eq('id', checkinId)
          .eq('user_id', user.id)

        if (updatePhotoError) {
          logActivityActionFailure('photo cover update failed', updatePhotoError)
          return NextResponse.json({ error: '现场照片封面更新失败，请稍后重试。' }, { status: 500 })
        }
      }

      return NextResponse.json({
        ok: true,
        assets: ((insertedAssets ?? []) as CheckinAssetRow[]).map(toClientAsset),
        photoUrl: nextCoverUrl,
      })
    } catch (error) {
      logActivityActionFailure('photo upload action failed', error)
      return NextResponse.json(
        {
          error: '现场照片上传失败，请稍后重试。',
        },
        { status: 500 }
      )
    }
  }

  const body = await request.json().catch(() => ({}))
  const action = body?.action as string | undefined

  if (action === 'delete_activity_image') {
    try {
      assertActivityUpdatePolicy(body as Record<string, unknown>, {
        ignoredFields: ['action', 'checkinId', 'photoId', 'photoUrl'],
        allowedFields: [],
      })
    } catch (error) {
      return policyErrorResponse(error) ?? NextResponse.json({ error: '这次修改里有暂不支持的内容，请刷新后重试。' }, { status: 400 })
    }

    const checkinId = typeof body?.checkinId === 'string' ? body.checkinId : ''
    const photoId = typeof body?.photoId === 'string' ? body.photoId : ''
    const photoUrl = typeof body?.photoUrl === 'string' ? body.photoUrl : ''

    if (!checkinId) {
      return NextResponse.json({ error: '这条活动暂时无法识别，请刷新后重试。' }, { status: 400 })
    }

    if (!photoId && !photoUrl) {
      return NextResponse.json({ error: '这张照片暂时无法识别，请刷新后重试。' }, { status: 400 })
    }

    const checkin = await loadCheckinById(supabase, checkinId)
    if (!checkin) {
      return NextResponse.json({ error: '这条活动暂时找不到，请刷新后重试。' }, { status: 404 })
    }
    if (checkin.user_id !== user.id) {
      return NextResponse.json({ error: '你不能修改这条活动。' }, { status: 403 })
    }

    try {
      const existingAssets = await loadExistingImageAssets(supabase, checkinId)
      const matchedById =
        photoId && photoId !== 'legacy-photo'
          ? existingAssets.find((asset) => asset.id === photoId) ?? null
          : null
      const targetUrl = matchedById?.url ?? (photoUrl || (photoId === 'legacy-photo' ? checkin.photo_url ?? '' : ''))
      const matchedByCoverUrl =
        targetUrl && checkin.photo_url === targetUrl
          ? existingAssets.find((asset) => asset.url === targetUrl) ?? null
          : null
      const targetAsset = matchedById ?? matchedByCoverUrl
      const deletesLegacyCover = Boolean(targetUrl && checkin.photo_url === targetUrl)

      if (!targetUrl || (!targetAsset && !deletesLegacyCover)) {
        return NextResponse.json({ error: '这张照片暂时找不到，请刷新后重试。' }, { status: 404 })
      }

      const remainingAssets = targetAsset
        ? existingAssets.filter((asset) => asset.id !== targetAsset.id)
        : existingAssets
      const nextCoverUrl = deletesLegacyCover ? remainingAssets[0]?.url ?? null : checkin.photo_url

      if (deletesLegacyCover) {
        const coverUpdate = { photo_url: nextCoverUrl }
        assertActivityUpdatePolicy(coverUpdate, { allowedFields: ['photo_url'] })
        const adminSupabase = createSupabaseAdminClient()
        const { error: updatePhotoError } = await adminSupabase
          .from('checkins')
          .update(coverUpdate)
          .eq('id', checkinId)
          .eq('user_id', user.id)

        if (updatePhotoError) {
          logActivityActionFailure('photo cover delete update failed', updatePhotoError)
          return NextResponse.json({ error: '现场照片封面更新失败，请稍后重试。' }, { status: 500 })
        }
      }

      if (targetAsset) {
        const { data: deletedAsset, error: deleteError } = await supabase
          .from('checkin_assets')
          .delete()
          .eq('id', targetAsset.id)
          .eq('checkin_id', checkinId)
          .select('id')
          .maybeSingle()

        if (deleteError) {
          logActivityActionFailure('photo asset delete failed', deleteError)
          return NextResponse.json({ error: '现场照片删除失败，请稍后重试。' }, { status: 500 })
        }

        if (!deletedAsset) {
          return NextResponse.json({ error: '这张照片暂时找不到，请刷新后重试。' }, { status: 404 })
        }
      }

      const objectPath = getCheckinPhotoObjectPath(targetUrl, user.id)
      if (objectPath) {
        await bestEffortRemoveCheckinPhotoObjects(supabase, [objectPath])
      }

      return NextResponse.json({
        ok: true,
        deletedPhotoId: targetAsset?.id ?? photoId,
        deletedPhotoUrl: targetUrl,
        photoUrl: nextCoverUrl,
        assets: remainingAssets.map(toClientAsset),
      })
    } catch (error) {
      logActivityActionFailure('photo delete action failed', error)
      return NextResponse.json(
        {
          error: '现场照片删除失败，请稍后重试。',
        },
        { status: 500 }
      )
    }
  }

  if (action !== 'update_activity_note') {
    return NextResponse.json({ error: '暂不支持这项操作，请刷新后重试。' }, { status: 400 })
  }

  try {
    assertActivityUpdatePolicy(body as Record<string, unknown>, {
      ignoredFields: ['action', 'checkinId'],
      allowedFields: ['note'],
    })
  } catch (error) {
    return policyErrorResponse(error) ?? NextResponse.json({ error: '这次修改里有暂不支持的内容，请刷新后重试。' }, { status: 400 })
  }

  const checkinId = typeof body?.checkinId === 'string' ? body.checkinId : ''
  if (!checkinId) {
    return NextResponse.json({ error: '这条活动暂时无法识别，请刷新后重试。' }, { status: 400 })
  }

  const checkin = await loadCheckinById(supabase, checkinId)
  if (!checkin) {
    return NextResponse.json({ error: '这条活动暂时找不到，请刷新后重试。' }, { status: 404 })
  }
  if (checkin.user_id !== user.id) {
    return NextResponse.json({ error: '你不能修改这条活动。' }, { status: 403 })
  }

  const note = normalizeNote(body?.note)
  const noteUpdate = { note }
  assertActivityUpdatePolicy(noteUpdate, { allowedFields: ['note'] })
  const adminSupabase = createSupabaseAdminClient()

  const { error: updateError } = await adminSupabase
    .from('checkins')
    .update(noteUpdate)
    .eq('id', checkinId)
    .eq('user_id', user.id)

  if (updateError) {
    logActivityActionFailure('note update failed', updateError)
    return NextResponse.json({ error: '攀登日记保存失败，请稍后重试。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, note })
}
