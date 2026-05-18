import { expect, test, type Page } from '@playwright/test'
import {
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'

async function getFirstMountainIdFromApi(page: Page) {
  const payload = await page.evaluate(async () => {
    const response = await fetch('/api/trek/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_active_mountains' }),
    })
    return {
      ok: response.ok,
      body: await response.json().catch(() => ({})),
    }
  })

  const mountains = Array.isArray(payload.body?.mountains) ? payload.body.mountains : []
  const mountainId = mountains[0]?.id
  if (!payload.ok || typeof mountainId !== 'string') {
    throw new Error(`Failed to load mountain for activity note e2e: ${JSON.stringify(payload.body)}`)
  }
  return mountainId
}

test('activity detail lets the owner edit and persist an approved activity note', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/profile' })
  const mountainId = await getFirstMountainIdFromApi(page)
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, `activity-note-original-${Date.now()}`)
  const nextNote = `山顶风停了，云开了一小会儿。${Date.now()}`

  await page.goto(`${root}/activity/${checkinId}`, { waitUntil: 'domcontentloaded' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page.locator(`[data-activity-checkin-id="${checkinId}"]`)).toBeVisible()

  await page.getByRole('button', { name: '编辑' }).click()
  const editor = page.getByTestId('activity-note-editor')
  await expect(editor).toBeVisible()
  await editor.fill(nextNote)
  await expect(page.getByText(`${nextNote.length}/2000`)).toBeVisible()
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.getByRole('status')).toContainText('攀登日记已保存。')
  await expect(page.getByText(`「${nextNote}」`)).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText(`「${nextNote}」`)).toBeVisible()
})
