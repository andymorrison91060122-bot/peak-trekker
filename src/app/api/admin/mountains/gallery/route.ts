import { NextRequest, NextResponse } from 'next/server'

import { canAccessAdminTools } from '@/lib/admin-access'
import {
  MOUNTAIN_MEDIA_BUCKET,
  dedupeExactUrlsPreserveOrder,
  normalizeMountainGalleryImages,
  parseMountainMediaObjectPathFromPublicUrl,
} from '@/lib/mountain-storage'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type GalleryUpdateBody = {
  mountainId?: string
  galleryImages?: unknown
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as GalleryUpdateBody | null
  if (!body?.mountainId || !isStringArray(body.galleryImages)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const { errorResponse } = await requireAdminAccess()
  if (errorResponse) return errorResponse

  try {
    const supabase = createSupabaseAdminClient()
    const { data: mountain, error: mountainError } = await supabase
      .from('mountains')
      .select('id, gallery_images, cover_image')
      .eq('id', body.mountainId)
      .maybeSingle()

    if (mountainError) {
      return NextResponse.json({ error: mountainError.message }, { status: 500 })
    }

    if (!mountain) {
      return NextResponse.json({ error: 'mountain not found' }, { status: 404 })
    }

    const currentGalleryImages = dedupeExactUrlsPreserveOrder(
      normalizeMountainGalleryImages(mountain.gallery_images)
    )
    const nextGalleryImages = dedupeExactUrlsPreserveOrder(body.galleryImages)
    const currentGallerySet = new Set(currentGalleryImages)
    const invalidNewUrls = nextGalleryImages.filter((url) => !currentGallerySet.has(url))

    if (invalidNewUrls.length > 0) {
      return NextResponse.json(
        {
          error: 'galleryImages can only reorder or remove existing gallery URLs',
          invalidNewUrls,
        },
        { status: 400 }
      )
    }

    const removedUrls = currentGalleryImages.filter((url) => !nextGalleryImages.includes(url))
    const { data: updatedMountain, error: updateError } = await supabase
      .from('mountains')
      .update({ gallery_images: nextGalleryImages })
      .eq('id', body.mountainId)
      .select('id, gallery_images, cover_image')
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (!updatedMountain) {
      return NextResponse.json({ error: 'mountain not found' }, { status: 404 })
    }

    const deleteWarnings: string[] = []
    const objectPathsToDelete: string[] = []
    const currentCoverImage = typeof mountain.cover_image === 'string' ? mountain.cover_image : null

    for (const removedUrl of removedUrls) {
      if (removedUrl === currentCoverImage) {
        deleteWarnings.push(`skip delete because still used by cover_image: ${removedUrl}`)
        continue
      }

      const resolved = parseMountainMediaObjectPathFromPublicUrl(removedUrl)
      if (!resolved || resolved.bucket !== MOUNTAIN_MEDIA_BUCKET) {
        deleteWarnings.push(`skip delete because URL is not a ${MOUNTAIN_MEDIA_BUCKET} public object: ${removedUrl}`)
        continue
      }

      objectPathsToDelete.push(resolved.objectPath)
    }

    if (objectPathsToDelete.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from(MOUNTAIN_MEDIA_BUCKET)
        .remove(objectPathsToDelete)

      if (deleteError) {
        deleteWarnings.push(`bucket delete failed: ${deleteError.message}`)
      }
    }

    return NextResponse.json({
      mountainId: body.mountainId,
      galleryImages: normalizeMountainGalleryImages(updatedMountain.gallery_images),
      removedUrls,
      ...(deleteWarnings.length > 0 ? { deleteWarnings } : {}),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'internal error' },
      { status: 500 }
    )
  }
}
