import { expect, test } from '@playwright/test'
import { TOAST_REGISTRY } from '../../src/lib/toast-registry'

test('toast registry covers acceptance-critical states', () => {
  expect(Object.keys(TOAST_REGISTRY)).toEqual(
    expect.arrayContaining([
      'onboarding_complete',
      'trek_start_success',
      'trek_record_too_short',
      'summit_verify_success',
      'summit_verify_failure',
      'image_upload_success',
      'image_upload_failure',
      'storage_missing',
      'poster_generate_success',
      'dynamic_link_copied',
      'share_invoked',
      'delete_success',
      'delete_failure',
      'like_added',
      'like_removed',
      'action_blocked',
    ])
  )

  for (const entry of Object.values(TOAST_REGISTRY)) {
    expect(entry.message.trim().length).toBeGreaterThan(0)
    expect(['success', 'error', 'info']).toContain(entry.tone)
  }
})
