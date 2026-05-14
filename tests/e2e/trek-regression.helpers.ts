import { readFileSync } from 'node:fs'
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
    .select('id, status, completion_status, session_id, mountain_id')
    .eq('id', checkinId)
    .single()

  if (error || !data) {
    throw new Error(`Failed to fetch E2E checkin ${checkinId}: ${error?.message ?? 'not found'}`)
  }

  return data as {
    id: string
    status: string
    completion_status: string | null
    session_id: string | null
    mountain_id: string | null
  }
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
