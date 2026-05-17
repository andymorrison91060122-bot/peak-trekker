import { expect, test } from '@playwright/test'
import {
  createSolidColorPngBuffer,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'
import { captureOptionalE2EScreenshot } from './trek-regression.helpers'

function quotaPayload({
  remaining,
  freeUsed,
  freeLimit = 2,
}: {
  remaining: number
  freeUsed: number
  freeLimit?: number
}) {
  return {
    ok: true,
    quota: {
      monthKey: '2026-05',
      isFirstMonth: false,
      subscriptionTier: 'free',
      freeLimit,
      freeUsed,
      paidLimit: 0,
      paidUsed: 0,
      freeRemaining: remaining,
      paidRemaining: 0,
      remaining,
      totalLimit: freeLimit,
    },
  }
}

async function openScreenshotPage(page: Parameters<typeof registerFreshUser>[0], root: string) {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, root, { returnTo: '/screenshot' })
  await dismissActivationChecklistIfPresent(page)
  await expect(page).toHaveURL(/\/screenshot/)
}

test('quota exhausted opens upgrade sheet before upload', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.route('**/api/screenshot/recognize', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(quotaPayload({ remaining: 0, freeUsed: 2 })),
      })
      return
    }

    await route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: JSON.stringify({
        error: '本月截图识别次数已用完。',
        code: 'screenshot_quota_exhausted',
        ...quotaPayload({ remaining: 0, freeUsed: 2 }),
      }),
    })
  })

  await openScreenshotPage(page, root)
  await expect(page.getByText('剩余 0 / 2 次')).toBeVisible({ timeout: 20_000 })

  const screenshot = await createSolidColorPngBuffer({
    width: 390,
    height: 780,
    red: 20,
    green: 25,
    blue: 31,
  })

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'quota-exhausted.png',
    mimeType: 'image/png',
    buffer: screenshot,
  })

  await expect(page.getByRole('dialog', { name: '本月识别次数已用完' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('付费方案会提供每月 30 次截图识别额度')).toBeVisible()
  await captureOptionalE2EScreenshot(page, 'screenshot-quota-exhausted.png')
})

test('recognition response exposes accurate fallback source and updated quota', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.route('**/api/screenshot/recognize', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(quotaPayload({ remaining: 2, freeUsed: 0 })),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ocrSource: 'accurate',
        quota: quotaPayload({ remaining: 1, freeUsed: 1 }).quota,
        ocrResult: {
          rawText: ['泰山', '路线距离', '5.9 km', '运动时长', '2h 00m'].join('\n'),
          textBlocks: [],
        },
        parsedFields: {
          location: { value: '泰山', raw: '泰山' },
          distance: { value: 5.9, unit: 'km', raw: '路线距离 5.9 km' },
          duration: { value: 7200, raw: '2h 00m' },
        },
      }),
    })
  })

  await openScreenshotPage(page, root)
  await expect(page.getByText('剩余 2 / 2 次')).toBeVisible({ timeout: 20_000 })

  const screenshot = await createSolidColorPngBuffer({
    width: 390,
    height: 780,
    red: 24,
    green: 28,
    blue: 34,
  })

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'quota-accurate.png',
    mimeType: 'image/png',
    buffer: screenshot,
  })

  await expect(page.getByText('确认识别结果')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-screenshot-ocr-source="accurate"]')).toHaveCount(1)
  await expect(page.getByText('剩余 1 / 2 次')).toBeVisible()
  await captureOptionalE2EScreenshot(page, 'screenshot-quota-accurate.png')
})
