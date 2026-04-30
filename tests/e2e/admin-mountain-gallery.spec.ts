import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

import { MOUNTAIN_MEDIA_BUCKET } from '../../src/lib/mountain-storage'

function readEnvValue(key: string) {
  const envText = (() => {
    try {
      return readFileSync('.env.local', 'utf8')
    } catch {
      return ''
    }
  })()

  return envText.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? null
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvValue('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin mountain gallery tests.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function createAdminSession(page: Page, baseURL: string) {
  const email = 'qa-admin-1774068792@example.com'
  const password = 'PeakTrekker123!'
  await page.goto(`${baseURL}/auth/login?from=${encodeURIComponent('/admin/mountains')}`)
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await page.waitForURL((url) => !/\/auth\/login/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
  if (!/\/admin\/mountains/.test(page.url())) {
    await page.goto(`${baseURL}/admin/mountains`)
  }
  await expect(page).toHaveURL(`${baseURL}/admin/mountains`)
}

async function openFirstMountainEditor(page: Page) {
  const firstEditLink = page.getByRole('link', { name: '编辑' }).first()
  await expect(firstEditLink).toBeVisible()
  const href = await firstEditLink.getAttribute('href')
  if (!href) throw new Error('Expected the first mountain edit link to contain an href.')
  await page.goto(href)
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  const mountainId = href.split('/').pop()
  if (!mountainId) throw new Error(`Could not parse mountain id from href: ${href}`)
  return { href, mountainId }
}

async function readMountainGalleryDirect(mountainId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('mountains')
    .select('gallery_images')
    .eq('id', mountainId)
    .single()

  if (error || !data) {
    throw new Error(`Failed to read mountain gallery: ${error?.message ?? 'no data'}`)
  }

  return Array.isArray(data.gallery_images)
    ? data.gallery_images.filter((item): item is string => typeof item === 'string')
    : []
}

async function writeMountainGalleryDirect(mountainId: string, galleryImages: string[]) {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('mountains')
    .update({ gallery_images: galleryImages })
    .eq('id', mountainId)

  if (error) {
    throw new Error(`Failed to write mountain gallery: ${error.message}`)
  }
}

function parseObjectPathFromPublicUrl(url: string) {
  try {
    const resolved = new URL(url)
    const prefix = `/storage/v1/object/public/${MOUNTAIN_MEDIA_BUCKET}/`
    if (!resolved.pathname.startsWith(prefix)) return null
    return decodeURIComponent(resolved.pathname.slice(prefix.length))
  } catch {
    return null
  }
}

async function removeMountainMediaUrls(urls: string[]) {
  const objectPaths = urls
    .map(parseObjectPathFromPublicUrl)
    .filter((item): item is string => Boolean(item))

  if (!objectPaths.length) return

  const supabase = getSupabaseAdminClient()
  await supabase.storage.from(MOUNTAIN_MEDIA_BUCKET).remove(objectPaths)
}

test.describe('admin mountain gallery management', () => {
  test('admin can upload reorder and delete gallery images without dirtying the basic info form', async ({ page, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)
    const originalGalleryImages = await readMountainGalleryDirect(mountainId)
    const sampleOne = resolve('public/images/default-mountain-cover.png')
    const sampleTwo = resolve('public/images/default-activity-cover.png')
    const touchedUrls = new Set<string>()

    try {
      await writeMountainGalleryDirect(mountainId, [])
      await page.goto(`${root}/admin/mountains/${mountainId}`)

      await expect(page.getByTestId('admin-mountain-gallery-section')).toBeVisible()
      await expect(page.getByTestId('admin-mountain-gallery-empty')).toBeVisible()
      await expect(page.getByTestId('admin-mountain-save-button')).toBeDisabled()

      const originalName = await page.getByTestId('admin-mountain-name-input').inputValue()

      const firstUploadResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/admin/mountains/gallery/upload') &&
          response.request().method() === 'POST',
        { timeout: 45_000 }
      )
      await page.setInputFiles('[data-testid="admin-mountain-gallery-upload-input"]', sampleOne)
      expect((await firstUploadResponse).ok()).toBe(true)
      await expect
        .poll(async () => (await readMountainGalleryDirect(mountainId)).length, { timeout: 10_000 })
        .toBe(1)
      await expect(page.getByTestId('admin-mountain-gallery-item-0')).toBeVisible()
      await expect(page.getByTestId('admin-mountain-gallery-upload-trigger')).not.toContainText('上传中...')
      await expect(page.getByTestId('admin-mountain-save-button')).toBeDisabled()
      await expect(page.getByTestId('admin-mountain-name-input')).toHaveValue(originalName)

      const afterFirstUpload = await readMountainGalleryDirect(mountainId)
      expect(afterFirstUpload).toHaveLength(1)
      afterFirstUpload.forEach((url) => touchedUrls.add(url))

      const secondUploadResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/admin/mountains/gallery/upload') &&
          response.request().method() === 'POST',
        { timeout: 45_000 }
      )
      await page.setInputFiles('[data-testid="admin-mountain-gallery-upload-input"]', sampleTwo)
      expect((await secondUploadResponse).ok()).toBe(true)
      await expect
        .poll(async () => (await readMountainGalleryDirect(mountainId)).length, { timeout: 10_000 })
        .toBe(2)
      await expect(page.getByTestId('admin-mountain-gallery-item-1')).toBeVisible()
      const afterSecondUpload = await readMountainGalleryDirect(mountainId)
      expect(afterSecondUpload).toHaveLength(2)
      afterSecondUpload.forEach((url) => touchedUrls.add(url))

      const reorderResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/admin/mountains/gallery') &&
          !response.url().includes('/upload') &&
          response.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await page.getByTestId('admin-mountain-gallery-move-up-1').click()
      expect((await reorderResponse).ok()).toBe(true)
      await expect
        .poll(async () => readMountainGalleryDirect(mountainId), { timeout: 10_000 })
        .toEqual([afterSecondUpload[1], afterSecondUpload[0]])
      const afterReorder = await readMountainGalleryDirect(mountainId)
      expect(afterReorder).toEqual([afterSecondUpload[1], afterSecondUpload[0]])
      afterReorder.forEach((url) => touchedUrls.add(url))

      const deleteResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/admin/mountains/gallery') &&
          !response.url().includes('/upload') &&
          response.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await page.getByTestId('admin-mountain-gallery-delete-1').click()
      expect((await deleteResponse).ok()).toBe(true)
      await expect
        .poll(async () => readMountainGalleryDirect(mountainId), { timeout: 10_000 })
        .toEqual([afterReorder[0]])
      await expect(page.getByTestId('admin-mountain-gallery-item-1')).toHaveCount(0)
      const afterDelete = await readMountainGalleryDirect(mountainId)
      expect(afterDelete).toEqual([afterReorder[0]])
      afterDelete.forEach((url) => touchedUrls.add(url))
      await expect(page.getByTestId('admin-mountain-save-button')).toBeDisabled()
      await expect(page.getByTestId('admin-mountain-name-input')).toHaveValue(originalName)
    } finally {
      await writeMountainGalleryDirect(mountainId, originalGalleryImages).catch(() => {})
      await removeMountainMediaUrls(
        [...touchedUrls].filter((url) => !originalGalleryImages.includes(url))
      ).catch(() => {})
    }
  })
})
