import assert from 'node:assert/strict'
import test from 'node:test'

import { getExploreMountainThumbnailUrl } from '../src/lib/mountain-storage.ts'

const BASE_URL = 'https://mngofocdsmqrqimsdyzf.supabase.co'

test('Explore thumbnail URL derives a strict versioned path from a catalog cover', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE_URL
  assert.equal(
    getExploreMountainThumbnailUrl(
      `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/01-huashan-0.jpg`,
    ),
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/thumb-v1-01-huashan-0.webp`,
  )
})

test('Explore thumbnail URL rejects external, non-catalog and already-derived sources', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE_URL
  for (const invalid of [
    'https://example.com/storage/v1/object/public/mountain-media/catalog/huashan/01-cover.jpg',
    `${BASE_URL}/storage/v1/object/public/mountain-media/mountains/huashan/01-cover.jpg`,
    `${BASE_URL}/storage/v1/object/public/mountain-media/catalog/huashan/thumb-v1-cover.webp`,
  ]) {
    assert.equal(getExploreMountainThumbnailUrl(invalid), null)
  }
})
