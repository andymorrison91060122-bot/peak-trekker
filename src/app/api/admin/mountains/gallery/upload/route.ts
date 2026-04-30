import { NextRequest, NextResponse } from 'next/server'

import { canAccessAdminTools } from '@/lib/admin-access'
import {
  ALLOWED_MOUNTAIN_GALLERY_TYPES,
  MAX_MOUNTAIN_GALLERY_SIZE_BYTES,
  MOUNTAIN_MEDIA_BUCKET,
  MOUNTAIN_MEDIA_CACHE_CONTROL,
  buildMountainGalleryObjectPath,
  dedupeExactUrlsPreserveOrder,
  normalizeMountainGalleryImages,
} from '@/lib/mountain-storage'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function isAllowedGalleryType(type: string): type is (typeof ALLOWED_MOUNTAIN_GALLERY_TYPES)[number] {
  return ALLOWED_MOUNTAIN_GALLERY_TYPES.includes(type as (typeof ALLOWED_MOUNTAIN_GALLERY_TYPES)[number])
}

async function requireAdminAccess() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!canAccessAdminTools({
    email: user.email,
    isAdmin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
  })) {
    return {
      errorResponse: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  return { errorResponse: null }
}

async function bestEffortDeleteUploadedObject(objectPath: string) {
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.storage.from(MOUNTAIN_MEDIA_BUCKET).remove([objectPath])
    return error
      ? { ok: false as const, message: error.message }
      : { ok: true as const }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : 'cleanup failed',
    }
  }
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdminAccess()
  if (errorResponse) return errorResponse

  const formData = await request.formData().catch(() => null)
  const mountainId = typeof formData?.get('mountainId') === 'string' ? String(formData.get('mountainId')) : ''
  const file = formData?.get('file')

  if (!mountainId) {
    return NextResponse.json({ error: 'mountainId required' }, { status: 400 })
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少画廊图片文件。' }, { status: 400 })
  }

  if (!isAllowedGalleryType(file.type)) {
    return NextResponse.json({ error: '仅支持 JPG、PNG、WEBP 格式的画廊图片。' }, { status: 400 })
  }

  if (file.size > MAX_MOUNTAIN_GALLERY_SIZE_BYTES) {
    return NextResponse.json({ error: '画廊图片不能超过 8MB。' }, { status: 400 })
  }

  try {
    const supabase = createSupabaseAdminClient()

    const { data: mountain, error: mountainError } = await supabase
      .from('mountains')
      .select('id, gallery_images')
      .eq('id', mountainId)
      .maybeSingle()

    if (mountainError) {
      return NextResponse.json({ error: mountainError.message }, { status: 500 })
    }

    if (!mountain) {
      return NextResponse.json({ error: 'mountain not found' }, { status: 404 })
    }

    const objectPath = buildMountainGalleryObjectPath(mountainId, file)
    const { error: uploadError } = await supabase.storage
      .from(MOUNTAIN_MEDIA_BUCKET)
      .upload(objectPath, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: MOUNTAIN_MEDIA_CACHE_CONTROL,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `画廊图片上传失败：${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: publicUrlData } = supabase.storage
      .from(MOUNTAIN_MEDIA_BUCKET)
      .getPublicUrl(objectPath)

    const nextUrl = publicUrlData.publicUrl
    if (!nextUrl) {
      const cleanup = await bestEffortDeleteUploadedObject(objectPath)
      const cleanupSuffix = cleanup.ok ? '' : ` 清理失败：${cleanup.message}`
      return NextResponse.json(
        { error: `画廊图片 public URL 生成失败。${cleanupSuffix}`.trim() },
        { status: 500 }
      )
    }

    const galleryImages = dedupeExactUrlsPreserveOrder([
      ...normalizeMountainGalleryImages(mountain.gallery_images),
      nextUrl,
    ])

    const { data: updatedMountain, error: updateError } = await supabase
      .from('mountains')
      .update({ gallery_images: galleryImages })
      .eq('id', mountainId)
      .select('id, gallery_images')
      .maybeSingle()

    if (updateError) {
      const cleanup = await bestEffortDeleteUploadedObject(objectPath)
      const cleanupSuffix = cleanup.ok ? '' : `；清理失败：${cleanup.message}`
      return NextResponse.json(
        { error: `画廊图片写入数据库失败：${updateError.message}${cleanupSuffix}` },
        { status: 500 }
      )
    }

    if (!updatedMountain) {
      const cleanup = await bestEffortDeleteUploadedObject(objectPath)
      const cleanupSuffix = cleanup.ok ? '' : `；清理失败：${cleanup.message}`
      return NextResponse.json(
        { error: `mountain not found after upload${cleanupSuffix}` },
        { status: 404 }
      )
    }

    return NextResponse.json({
      mountainId,
      objectPath,
      galleryImages: normalizeMountainGalleryImages(updatedMountain.gallery_images),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status: 500 }
    )
  }
}
