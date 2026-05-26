import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { describeStorageError, normalizeStorageUploadError } from '@/lib/storage-errors'
import {
  AVATAR_MAX_BYTES,
  AVATARS_BUCKET,
  buildAvatarObjectPath,
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
    return NextResponse.json({ error: '缺少头像文件。' }, { status: 400 })
  }

  const validation = validateStorageImageFile(file, {
    maxBytes: AVATAR_MAX_BYTES,
    invalidTypeMessage: '请上传 JPG、PNG 或 WebP 格式的头像。',
    tooLargeMessage: '头像文件不能超过 2MB。',
  })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const objectPath = buildAvatarObjectPath(user.id, file)
  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: STORAGE_CACHE_CONTROL,
  })

  if (uploadError) {
    const message = normalizeStorageUploadError(
      describeStorageError(uploadError),
      '头像上传失败，请稍后重试。'
    )
    return NextResponse.json({ error: message }, { status: storageUploadStatus(message) })
  }

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(objectPath)
  const avatarUrl = data.publicUrl
  const adminSupabase = createSupabaseAdminClient()
  const { error: updateError } = await adminSupabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id)

  if (updateError) {
    await supabase.storage.from(AVATARS_BUCKET).remove([objectPath]).catch(() => undefined)
    return NextResponse.json({ error: updateError.message || '头像保存失败，请稍后重试。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, avatarUrl })
}
