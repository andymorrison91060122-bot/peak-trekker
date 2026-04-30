import {
  dedupeExactUrlsPreserveOrder,
  normalizeMountainGalleryImages,
} from '@/lib/mountain-storage'

type MountainMediaLike = {
  cover_image?: string | null
  gallery_images?: string[] | string | null
  galleryImages?: string[] | string | null
  route_thumbnail?: string | null
  route_preview_image?: string | null
  routePreviewImage?: string | null
  route_preview_image_url?: string | null
}

export function getMountainGalleryImages(mountain: MountainMediaLike, limit = 3) {
  return dedupeExactUrlsPreserveOrder([
    ...normalizeMountainGalleryImages(mountain.galleryImages),
    ...normalizeMountainGalleryImages(mountain.gallery_images),
  ]).slice(0, limit)
}

export function getMountainDetailHeroImages(mountain: MountainMediaLike, limit = 3) {
  return dedupeExactUrlsPreserveOrder([
    mountain.cover_image,
    ...normalizeMountainGalleryImages(mountain.galleryImages),
    ...normalizeMountainGalleryImages(mountain.gallery_images),
  ]).slice(0, limit)
}

export function getMountainHeroImage(mountain: MountainMediaLike) {
  return (
    dedupeExactUrlsPreserveOrder([
      mountain.cover_image,
      ...normalizeMountainGalleryImages(mountain.galleryImages),
      ...normalizeMountainGalleryImages(mountain.gallery_images),
    ])[0] ?? null
  )
}

export function getMountainPosterBackgroundImage(mountain: MountainMediaLike) {
  const galleryImage =
    dedupeExactUrlsPreserveOrder([
      ...normalizeMountainGalleryImages(mountain.galleryImages),
      ...normalizeMountainGalleryImages(mountain.gallery_images),
    ])[0] ?? null

  return galleryImage ?? getMountainRoutePreviewImage(mountain) ?? mountain.cover_image ?? null
}

export function getMountainRoutePreviewImage(mountain: MountainMediaLike) {
  return dedupeExactUrlsPreserveOrder([
    mountain.routePreviewImage,
    mountain.route_preview_image,
    mountain.route_preview_image_url,
    mountain.route_thumbnail,
  ])[0] ?? null
}

export function getMountainMediaStatus(mountain: MountainMediaLike) {
  const galleryImages = getMountainGalleryImages(mountain, 3)
  const routePreviewImage = getMountainRoutePreviewImage(mountain)

  return {
    galleryImages,
    routePreviewImage,
    missingGalleryCount: Math.max(0, 3 - galleryImages.length),
    missingRoutePreview: !routePreviewImage,
  }
}
