import { expect, test } from '@playwright/test'
import * as mountainMedia from '../../src/lib/mountain-media'

test('mountain hero image prefers cover_image before gallery_images on explore surfaces', async () => {
  expect(
    mountainMedia.getMountainHeroImage({
      cover_image: 'cover-a',
      gallery_images: ['gallery-a', 'gallery-b'],
    })
  ).toBe('cover-a')

  expect(
    mountainMedia.getMountainHeroImage({
      gallery_images: ['gallery-a', 'gallery-b'],
    })
  ).toBe('gallery-a')
})

test('mountain gallery images stay scoped to gallery items and do not inject cover_image', async () => {
  expect(
    mountainMedia.getMountainGalleryImages({
      cover_image: 'cover-a',
      gallery_images: ['gallery-a', 'gallery-b'],
    })
  ).toEqual(['gallery-a', 'gallery-b'])

  expect(
    mountainMedia.getMountainGalleryImages({
      cover_image: 'cover-a',
      gallery_images: [],
    })
  ).toEqual([])
})

test('mountain detail hero keeps cover first and fills from gallery with exact URL dedupe', async () => {
  expect(
    mountainMedia.getMountainDetailHeroImages({
      cover_image: 'cover-a',
      gallery_images: ['cover-a', 'gallery-a', 'gallery-b', 'gallery-c'],
    })
  ).toEqual(['cover-a', 'gallery-a', 'gallery-b'])
})

test('mountain media exports a poster background resolver that prefers upgraded assets', async () => {
  expect(typeof mountainMedia.getMountainPosterBackgroundImage).toBe('function')

  const resolvePosterBackground = mountainMedia.getMountainPosterBackgroundImage!

  expect(
    resolvePosterBackground({
      gallery_images: ['gallery-a', 'gallery-b'],
      route_preview_image: 'route-a',
      cover_image: 'cover-a',
    })
  ).toBe('gallery-a')

  expect(
    resolvePosterBackground({
      gallery_images: [],
      route_preview_image: 'route-a',
      cover_image: 'cover-a',
    })
  ).toBe('route-a')

  expect(
    resolvePosterBackground({
      cover_image: 'cover-a',
    })
  ).toBe('cover-a')
})
