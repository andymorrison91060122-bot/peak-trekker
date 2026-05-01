import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { describeStorageError, normalizeStorageUploadError } from '@/lib/storage-errors'
import {
  buildCheckinPhotoObjectPath,
  CHECKIN_PHOTOS_BUCKET,
  CHECKIN_PHOTOS_MAX_BYTES,
  STORAGE_CACHE_CONTROL,
  storageUploadStatus,
  validateStorageImageFile,
} from '@/lib/storage-utils'

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
    return NextResponse.json({ error: '缺少照片文件。' }, { status: 400 })
  }

  const validation = validateStorageImageFile(file, {
    maxBytes: CHECKIN_PHOTOS_MAX_BYTES,
    invalidTypeMessage: '只能上传 JPG、PNG 或 WebP 格式的照片。',
    tooLargeMessage: '照片文件不能超过 8MB。',
  })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const objectPath = buildCheckinPhotoObjectPath({ userId: user.id, file })
  const { error: uploadError } = await supabase.storage.from(CHECKIN_PHOTOS_BUCKET).upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: STORAGE_CACHE_CONTROL,
  })

  if (uploadError) {
    const message = normalizeStorageUploadError(
      describeStorageError(uploadError),
      '照片上传失败，请稍后重试。'
    )
    return NextResponse.json({ error: message }, { status: storageUploadStatus(message) })
  }

  const { data } = supabase.storage.from(CHECKIN_PHOTOS_BUCKET).getPublicUrl(objectPath)

  return NextResponse.json({
    ok: true,
    photoUrl: data.publicUrl,
  })
}
