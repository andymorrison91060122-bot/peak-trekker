import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createTinyPngBuffer,
  dismissActivationChecklistIfPresent,
  registerFreshUser,
} from './community.helpers'

export const HUASHAN = {
  id: '216508c9-ffca-4164-8010-534d8650ee64',
  name: '华山',
  latitude: 34.4869,
  longitude: 110.0877,
  altitude: 2154,
} as const

export const WUDANG = {
  id: '4d1a818b-8038-49d1-a173-a58e8c76801c',
  name: '武当山',
  latitude: 32.4003,
  longitude: 111.0044,
  altitude: 1612,
} as const

export type MockGpsPoint = {
  latitude: number
  longitude: number
  accuracy?: number
  altitude?: number | null
}

declare global {
  interface Window {
    __setPeakTrekkerMockPosition?: (point: MockGpsPoint) => void
  }
}

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
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for Trek E2E tests.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function fetchCheckinForE2E(checkinId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('checkins')
    .select('id, completion_status, session_id, mountain_id, photo_url, verified_at')
    .eq('id', checkinId)
    .single()

  if (error || !data) {
    throw new Error(`Failed to fetch E2E checkin ${checkinId}: ${error?.message ?? 'not found'}`)
  }

  return data as {
    id: string
    completion_status: string | null
    session_id: string | null
    mountain_id: string | null
    photo_url: string | null
    verified_at: string | null
  }
}

export async function completeSummitPhotoFlow(page: Page) {
  const confirmButton = page.getByRole('button', { name: '确认这座山，开始记录准备' })
  if (!(await confirmButton.isEnabled({ timeout: 20_000 }).catch(() => false))) {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  await expect(confirmButton).toBeEnabled({ timeout: 20_000 })
  await confirmButton.click()
  await expect(page.getByTestId('trek-dev-threshold-chip')).toContainText('1 点 / 10s')
  await expect(page.getByRole('button', { name: '从这里开始' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '从这里开始' }).click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 20_000 })

  await setMockGps(page, {
    latitude: HUASHAN.latitude,
    longitude: HUASHAN.longitude,
    altitude: HUASHAN.altitude,
    accuracy: 5,
  })
  await expect(page.getByTestId('trek-near-summit-view')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('就绪')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('trek-near-summit-cta').click()

  await expect(page.getByTestId('trek-summit-photo-view')).toBeVisible({ timeout: 10_000 })
  const photo = tinySummitPhoto()
  await page.locator('input[type="file"]').setInputFiles(photo)
  await expect(page.getByText(photo.name)).toBeVisible()

  const verifyResponsePromise = page.waitForResponse((response) => {
    if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
    return response.request().postData()?.includes('"action":"verify_summit_checkin"') ?? false
  })

  await page.getByRole('button', { name: '提交留证' }).click()
  const verifyResponse = await verifyResponsePromise
  const verifyBody = await verifyResponse.json().catch(() => ({}))
  expect(verifyResponse.status(), JSON.stringify(verifyBody)).toBe(200)
  const checkinId = String(verifyBody?.checkinId ?? '')
  expect(checkinId).toMatch(/[0-9a-f-]{36}/i)

  await expect(page.getByTestId('trek-summit-confirmed-view')).toBeVisible({ timeout: 20_000 })
  return { checkinId, photoName: photo.name }
}

export async function installMutableGeolocation(page: Page, initial: MockGpsPoint) {
  await page.addInitScript((startPoint) => {
    type StoredPoint = {
      latitude: number
      longitude: number
      accuracy: number
      altitude: number | null
    }

    let current: StoredPoint = {
      latitude: startPoint.latitude,
      longitude: startPoint.longitude,
      accuracy: startPoint.accuracy ?? 5,
      altitude: startPoint.altitude ?? null,
    }
    let nextWatchId = 1
    const watchers = new Map<number, PositionCallback>()

    const buildPosition = (point: StoredPoint) =>
      ({
        coords: {
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
          altitude: point.altitude,
          altitudeAccuracy: point.altitude === null ? null : 1,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      }) as GeolocationPosition

    window.__setPeakTrekkerMockPosition = (nextPoint) => {
      current = {
        latitude: nextPoint.latitude,
        longitude: nextPoint.longitude,
        accuracy: nextPoint.accuracy ?? 5,
        altitude: nextPoint.altitude ?? null,
      }
      const position = buildPosition(current)
      for (const success of watchers.values()) {
        window.setTimeout(() => success(position), 0)
      }
    }

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          window.setTimeout(() => success(buildPosition(current)), 0)
        },
        watchPosition(success: PositionCallback) {
          const id = nextWatchId++
          watchers.set(id, success)
          window.setTimeout(() => {
            if (watchers.has(id)) success(buildPosition(current))
          }, 100)
          return id
        },
        clearWatch(id: number) {
          watchers.delete(id)
        },
      },
    })
  }, initial)
}

export async function setMockGps(page: Page, point: MockGpsPoint) {
  await page.evaluate((nextPoint) => {
    window.__setPeakTrekkerMockPosition?.(nextPoint)
  }, point)
}

export async function openAuthenticatedTrek({
  page,
  root,
  mountainId = HUASHAN.id,
  initialGps,
}: {
  page: Page
  root: string
  mountainId?: string
  initialGps: MockGpsPoint
}) {
  await page.context().grantPermissions(['geolocation'], { origin: root })
  await installMutableGeolocation(page, initialGps)
  await registerFreshUser(page, root, {
    returnTo: `/trek?mountainId=${mountainId}&testMode=1`,
  })
  await dismissActivationChecklistIfPresent(page)
}

export function tinySummitPhoto() {
  return {
    name: `trek-summit-${Date.now()}.png`,
    mimeType: 'image/png',
    buffer: createTinyPngBuffer(),
  }
}

export async function expectNoRuntimeIssueBadge(page: Page) {
  await expect(page.getByText('1 Issue')).toHaveCount(0)
}

export async function captureOptionalE2EScreenshot(page: Page, fileName: string) {
  const screenshotDir = process.env.E2E_SCREENSHOT_DIR
  if (!screenshotDir) return

  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({
    path: `${screenshotDir.replace(/\/$/, '')}/${fileName}`,
    fullPage: true,
  })
}
