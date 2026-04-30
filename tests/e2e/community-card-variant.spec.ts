import { expect, test } from '@playwright/test'
import { resolveCommunityCardVariant } from '../../src/lib/community'
import type { CheckinAsset } from '../../src/types'

function asset(partial: Partial<CheckinAsset>): CheckinAsset {
  return {
    id: partial.id ?? 'asset-1',
    checkin_id: partial.checkin_id ?? 'checkin-1',
    type: partial.type ?? 'poster',
    url: partial.url ?? 'https://example.com/asset.png',
    thumbnail_url: partial.thumbnail_url ?? partial.url ?? 'https://example.com/asset.png',
    created_at: partial.created_at ?? '2026-04-02T00:00:00.000Z',
    sort_order: partial.sort_order ?? 0,
    source: partial.source ?? 'generated',
  }
}

test('community card variant treats poster-only historical posts as no-image cards', () => {
  expect(
    resolveCommunityCardVariant({
      sourceType: 'historical_photo',
      assets: [asset({ type: 'poster' })],
    })
  ).toBe('no_image')

  expect(
    resolveCommunityCardVariant({
      sourceType: 'realtime_gps',
      assets: [asset({ type: 'poster' })],
    })
  ).toBe('route_map')

  expect(
    resolveCommunityCardVariant({
      sourceType: 'historical_photo',
      assets: [asset({ type: 'image', source: 'upload' })],
    })
  ).toBe('media')
})
