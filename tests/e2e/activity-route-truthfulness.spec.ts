import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const OUTPUT_DIR = join(process.cwd(), 'output/p0-route-truthfulness/visual')
const FAKE_SUPABASE_PORT = 54321
const TEST_USER_ID = '11111111-1111-4111-8111-111111111111'
const SUPABASE_STORAGE_COOKIE = 'sb-127-auth-token'

type FixtureName = 'stationary' | 'partial' | 'summit'

type SectionBox = {
  x: number
  y: number
  width: number
  height: number
}

type FixtureEvidence = {
  fixture: FixtureName
  mutationCount: number
  overflowPx: number
  trackPathCount: number
  summitCard: {
    text: string
    bbox: SectionBox
  }
  keyData: {
    cellCount: number
    bbox: SectionBox
  }
  routeSection: {
    text: string
    bbox: SectionBox
    cardChildCount: number
    statStripCellCount: number
    gridTemplateColumns: string
  }
  routeMemory: {
    text: string
    bbox: SectionBox
  }
}

type FakeTrackPoint = {
  id: string
  lat: number
  lng: number
  altitude: number
  accuracy: number
  ts: number
  captureSeq: number
}

type FakeFixture = {
  checkinId: string
  sessionId: string
  createdAt: string
  startedAt: string
  endedAt: string | null
  verifiedAt: string | null
  note: string
  mountain: {
    id: string
    name: string
    altitude: number
    province: string
    difficulty: string
    latitude: number
    longitude: number
  }
  trackPoints: FakeTrackPoint[]
}

const baseTs = Date.parse('2026-07-30T00:00:00.000Z')

function fakePoint(index: number, overrides: Partial<FakeTrackPoint>): FakeTrackPoint {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    lat: 34.47,
    lng: 110.07,
    altitude: 1600,
    accuracy: 8,
    ts: baseTs + index * 60_000,
    captureSeq: index,
    ...overrides,
  }
}

const FIXTURES: Record<FixtureName, FakeFixture> = {
  stationary: {
    checkinId: 'activity-stationary',
    sessionId: 'session-stationary',
    createdAt: '2026-07-30T06:00:00+09:00',
    startedAt: '2026-07-30T06:00:00+09:00',
    endedAt: '2026-07-30T06:01:00+09:00',
    verifiedAt: null,
    note: '1 分钟静止漂移 fixture',
    mountain: {
      id: 'qa-huashan',
      name: '华山',
      altitude: 2154,
      province: '陕西',
      difficulty: 'intermediate',
      latitude: 34.483,
      longitude: 110.084,
    },
    trackPoints: [
      fakePoint(0, { lat: 34.483, lng: 110.084, altitude: 640, ts: baseTs }),
      fakePoint(1, { lat: 34.48302, lng: 110.08401, altitude: 641, ts: baseTs + 15_000 }),
      fakePoint(2, { lat: 34.48298, lng: 110.08399, altitude: 642, ts: baseTs + 30_000 }),
      fakePoint(3, { lat: 34.48301, lng: 110.08402, altitude: 641, ts: baseTs + 60_000 }),
    ],
  },
  partial: {
    checkinId: 'activity-partial',
    sessionId: 'session-partial',
    createdAt: '2026-07-30T07:00:00+09:00',
    startedAt: '2026-07-30T07:00:00+09:00',
    endedAt: '2026-07-30T07:30:00+09:00',
    verifiedAt: null,
    note: '真实未登顶半程 fixture',
    mountain: {
      id: 'qa-huashan-partial',
      name: '华山',
      altitude: 2154,
      province: '陕西',
      difficulty: 'intermediate',
      latitude: 34.483,
      longitude: 110.084,
    },
    trackPoints: [
      fakePoint(10, { lat: 34.4708, lng: 110.0698, altitude: 1620, ts: baseTs + 0 }),
      fakePoint(11, { lat: 34.4721, lng: 110.0712, altitude: 1644, ts: baseTs + 6 * 60_000 }),
      fakePoint(12, { lat: 34.4736, lng: 110.0724, altitude: 1665, ts: baseTs + 11 * 60_000 }),
      fakePoint(13, { lat: 34.4754, lng: 110.0741, altitude: 1698, ts: baseTs + 16 * 60_000 }),
      fakePoint(14, { lat: 34.4768, lng: 110.0754, altitude: 1710, ts: baseTs + 20 * 60_000 }),
      fakePoint(15, { lat: 34.478, lng: 110.0767, altitude: 1734, ts: baseTs + 24 * 60_000 }),
      fakePoint(16, { lat: 34.4792, lng: 110.0781, altitude: 1752, ts: baseTs + 27 * 60_000 }),
      fakePoint(17, { lat: 34.4803, lng: 110.0795, altitude: 1768, ts: baseTs + 30 * 60_000 }),
    ],
  },
  summit: {
    checkinId: 'activity-summit',
    sessionId: 'session-summit',
    createdAt: '2026-07-30T05:00:00+09:00',
    startedAt: '2026-07-30T05:00:00+09:00',
    endedAt: '2026-07-30T08:10:00+09:00',
    verifiedAt: '2026-07-30T07:45:00+09:00',
    note: '已核验登顶 fixture',
    mountain: {
      id: 'qa-huashan-summit',
      name: '华山',
      altitude: 2154,
      province: '陕西',
      difficulty: 'intermediate',
      latitude: 34.483,
      longitude: 110.084,
    },
    trackPoints: [
      fakePoint(20, { lat: 34.4681, lng: 110.0674, altitude: 1560, ts: baseTs + 0 }),
      fakePoint(21, { lat: 34.4702, lng: 110.0695, altitude: 1622, ts: baseTs + 28 * 60_000 }),
      fakePoint(22, { lat: 34.4728, lng: 110.0717, altitude: 1704, ts: baseTs + 58 * 60_000 }),
      fakePoint(23, { lat: 34.4756, lng: 110.0743, altitude: 1810, ts: baseTs + 84 * 60_000 }),
      fakePoint(24, { lat: 34.4783, lng: 110.0774, altitude: 1942, ts: baseTs + 113 * 60_000 }),
      fakePoint(25, { lat: 34.4807, lng: 110.0801, altitude: 2056, ts: baseTs + 136 * 60_000 }),
      fakePoint(26, { lat: 34.4821, lng: 110.0827, altitude: 2130, ts: baseTs + 154 * 60_000 }),
      fakePoint(27, { lat: 34.4831, lng: 110.0846, altitude: 2154, ts: baseTs + 165 * 60_000 }),
    ],
  },
}

function fixtureByCheckinId(id: string) {
  return Object.values(FIXTURES).find((fixture) => fixture.checkinId === id) ?? null
}

function fixtureBySessionId(id: string) {
  return Object.values(FIXTURES).find((fixture) => fixture.sessionId === id) ?? null
}

function durationSecondsForFixture(fixture: FakeFixture) {
  const startedAt = Date.parse(fixture.startedAt)
  const endedAt = fixture.endedAt ? Date.parse(fixture.endedAt) : Number.NaN
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return null
  return Math.round((endedAt - startedAt) / 1000)
}

function formatDurationForExpectation(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds <= 0) return '--'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m`
}

function eqValue(search: URLSearchParams, key: string) {
  const raw = search.get(key)
  if (!raw?.startsWith('eq.')) return null
  return decodeURIComponent(raw.slice(3))
}

function json(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  res.writeHead(status, {
    'content-type': 'application/json',
    ...extraHeaders,
  })
  res.end(JSON.stringify(body))
}

function handleRestRequest(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname
  const prefer = req.headers.prefer ?? ''
  const wantsObject = req.headers.accept?.includes('application/vnd.pgrst.object+json')

  if (req.method === 'HEAD' && path === '/rest/v1/checkins') {
    res.writeHead(200, {
      'content-range': '0-0/3',
    })
    res.end()
    return
  }

  if (path === '/rest/v1/checkins') {
    const id = eqValue(url.searchParams, 'id')
    const fixture = id ? fixtureByCheckinId(id) : null
    if (!fixture) {
      json(res, wantsObject ? 406 : 200, wantsObject ? { message: 'Not found' } : [])
      return
    }
    const record = {
      id: fixture.checkinId,
      user_id: TEST_USER_ID,
      mountain_id: fixture.mountain.id,
      type: 'gps',
      source: 'realtime_gps',
      photo_url: null,
      note: fixture.note,
      session_id: fixture.sessionId,
      verified_at: fixture.verifiedAt,
      created_at: fixture.createdAt,
      distance_meters: null,
      duration_seconds: durationSecondsForFixture(fixture),
      elevation_gain_meters: null,
      max_elevation_meters: null,
      min_elevation_meters: null,
      start_time: fixture.startedAt,
      end_time: fixture.endedAt,
      track_name: null,
      track_points: null,
      screenshot_route_shape: null,
      mountains: {
        id: fixture.mountain.id,
        name: fixture.mountain.name,
        altitude: fixture.mountain.altitude,
        province: fixture.mountain.province,
        difficulty: fixture.mountain.difficulty,
        latitude: fixture.mountain.latitude,
        longitude: fixture.mountain.longitude,
        cover_image: null,
        gallery_images: [],
      },
    }
    json(res, 200, wantsObject ? record : [record], prefer.includes('count=exact') ? { 'content-range': '0-0/1' } : undefined)
    return
  }

  if (path === '/rest/v1/checkin_assets') {
    json(res, 200, [])
    return
  }

  if (path === '/rest/v1/trek_sessions') {
    const id = eqValue(url.searchParams, 'id')
    const fixture = id ? fixtureBySessionId(id) : null
    if (!fixture) {
      json(res, wantsObject ? 406 : 200, wantsObject ? { message: 'Not found' } : [])
      return
    }
    const record = {
      id: fixture.sessionId,
      started_at: fixture.startedAt,
      ended_at: fixture.endedAt,
      distance_m: null,
      ascent_m: null,
      max_altitude_m: null,
      track_points: fixture.trackPoints,
    }
    json(res, 200, wantsObject ? record : [record])
    return
  }

  json(res, 404, { error: `Unhandled fake supabase path: ${path}` })
}

let fakeSupabaseServer: Awaited<ReturnType<typeof startFakeSupabaseServer>> | null = null

async function startFakeSupabaseServer() {
  const requests: string[] = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${FAKE_SUPABASE_PORT}`)
    requests.push(`${req.method ?? 'GET'} ${url.pathname}${url.search}`)

    if (url.pathname === '/auth/v1/user') {
      json(res, 200, {
        id: TEST_USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'qa@example.com',
      })
      return
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      handleRestRequest(req, res, url)
      return
    }

    json(res, 404, { error: `Unhandled fake supabase endpoint: ${url.pathname}` })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(FAKE_SUPABASE_PORT, '127.0.0.1', () => resolve())
  })

  return {
    requests,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

test.beforeAll(async () => {
  fakeSupabaseServer = await startFakeSupabaseServer()
})

test.afterAll(async () => {
  await fakeSupabaseServer?.close()
})

async function installReadOnlyNetworkGuard(page: Page) {
  const blockedMutations: string[] = []

  await page.route('**/api/analytics/event', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api/weather/**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'weather stubbed for activity truthfulness fixture' }),
    })
  })

  page.on('request', (request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) return
    if (request.url().includes('/api/analytics/event')) return
    blockedMutations.push(`${request.method()} ${request.url()}`)
  })

  return blockedMutations
}

async function installSupabaseSession(page: Page) {
  const session = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'qa@example.com',
    },
  }
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`

  await page.context().addCookies([
    {
      name: SUPABASE_STORAGE_COOKIE,
      value,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

function requireBox(box: { x: number; y: number; width: number; height: number } | null) {
  expect(box).toBeTruthy()
  return box as SectionBox
}

async function waitForAnimatedValuesToSettle(page: Page) {
  await page.waitForFunction(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-final-text]')).filter((node) => {
      const style = window.getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0
    })
    if (nodes.length === 0) return false
    return nodes.every((node) => node.innerText.trim() === (node.dataset.finalText ?? '').trim())
  })
}

async function captureFixture(page: Page, fixture: FixtureName): Promise<FixtureEvidence> {
  await page.goto(`/activity/${FIXTURES[fixture].checkinId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-testid="activity-route-map"]')).toBeVisible()

  const summitCard = page.locator('[data-activity-motion="summit-card"]')
  const keyData = page.locator('[data-activity-motion="key-data"]')
  const routeSection = page.getByTestId('activity-route-map')
  const routeMemory = page.locator('[data-activity-motion="route-snapshot"]')

  await summitCard.scrollIntoViewIfNeeded()
  await routeSection.scrollIntoViewIfNeeded()
  await waitForAnimatedValuesToSettle(page)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const trackPathCount = await page.locator('.act-route__trace').count()
  const routeCardMeta = await routeSection.locator('.act-route__card').evaluate((node) => {
    const statStrip = node.lastElementChild as HTMLElement | null
    return {
      cardChildCount: node.children.length,
      statStripCellCount: statStrip?.children.length ?? 0,
      gridTemplateColumns: statStrip ? getComputedStyle(statStrip).gridTemplateColumns : '',
    }
  })

  await page.screenshot({
    path: join(OUTPUT_DIR, `${fixture}-375.png`),
    fullPage: true,
  })

  return {
    fixture,
    mutationCount: 0,
    overflowPx: overflow,
    trackPathCount,
    summitCard: {
      text: (await summitCard.innerText()).trim(),
      bbox: requireBox(await summitCard.boundingBox()),
    },
    keyData: {
      cellCount: await page.locator('[data-activity-key-data-cell]').count(),
      bbox: requireBox(await keyData.boundingBox()),
    },
    routeSection: {
      text: (await routeSection.innerText()).trim(),
      bbox: requireBox(await routeSection.boundingBox()),
      cardChildCount: routeCardMeta.cardChildCount,
      statStripCellCount: routeCardMeta.statStripCellCount,
      gridTemplateColumns: routeCardMeta.gridTemplateColumns,
    },
    routeMemory: {
      text: (await routeMemory.innerText()).trim(),
      bbox: requireBox(await routeMemory.boundingBox()),
    },
  }
}

function expectBboxStable(label: string, left: SectionBox, right: SectionBox) {
  expect(Math.abs(left.width - right.width), `${label} width drift`).toBeLessThanOrEqual(1)
  expect(Math.abs(left.height - right.height), `${label} height drift`).toBeLessThanOrEqual(1)
}

test('activity detail renders truthful route states without layout drift on 375', async ({ page }) => {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await page.setViewportSize({ width: 375, height: 812 })
  const blockedMutations = await installReadOnlyNetworkGuard(page)
  await installSupabaseSession(page)

  const stationary = await captureFixture(page, 'stationary')
  const stationaryDuration = formatDurationForExpectation(durationSecondsForFixture(FIXTURES.stationary))
  expect(stationary.overflowPx).toBeLessThanOrEqual(0)
  expect(stationary.trackPathCount).toBe(0)
  expect(stationary.summitCard.text).toContain('最高记录海拔')
  expect(stationary.summitCard.text).toContain('记录结束时间')
  expect(stationary.summitCard.text).toContain('06:01')
  expect(stationary.routeMemory.text).toContain('640m → 642m')
  expect(stationary.routeSection.text).toContain('本次轨迹')
  expect(stationary.routeSection.text).toContain('未登顶记录')
  expect(stationary.routeSection.text).toContain('本次轨迹暂不可用')
  expect(stationary.routeSection.text).toContain(stationaryDuration)
  expect(stationary.routeSection.text).not.toContain('\n--\n用时')

  const partial = await captureFixture(page, 'partial')
  const partialDuration = formatDurationForExpectation(durationSecondsForFixture(FIXTURES.partial))
  expect(partial.overflowPx).toBeLessThanOrEqual(0)
  expect(partial.trackPathCount).toBe(1)
  expect(partial.summitCard.text).toContain('最高记录海拔')
  expect(partial.summitCard.text).toContain('记录结束时间')
  expect(partial.summitCard.text).toContain('07:30')
  expect(partial.routeMemory.text).toContain('起点')
  expect(partial.routeMemory.text).toContain('最高记录点')
  expect(partial.routeMemory.text).toContain('结束')
  expect(partial.routeSection.text).toContain('本次轨迹')
  expect(partial.routeSection.text).toContain('未登顶记录')
  expect(partial.routeSection.text).toContain(partialDuration)
  expect(partialDuration).toBe('30m')
  expect(partial.routeSection.text).not.toContain('\n--\n用时')

  const summit = await captureFixture(page, 'summit')
  const summitDuration = formatDurationForExpectation(durationSecondsForFixture(FIXTURES.summit))
  expect(summit.overflowPx).toBeLessThanOrEqual(0)
  expect(summit.trackPathCount).toBe(1)
  expect(summit.summitCard.text).toContain('登顶海拔')
  expect(summit.summitCard.text).toContain('登顶时间')
  expect(summit.summitCard.text).toContain('07:45')
  expect(summit.summitCard.text).not.toContain('08:10')
  expect(summit.routeSection.text).toContain('本次轨迹')
  expect(summit.routeSection.text).toContain('登顶记录')
  expect(summit.routeSection.text).toContain(summitDuration)
  expect(summit.routeSection.text).not.toContain('\n--\n用时')

  for (const evidence of [stationary, partial, summit]) {
    expect(evidence.keyData.cellCount).toBe(4)
    expect(evidence.routeSection.cardChildCount).toBe(2)
    expect(evidence.routeSection.statStripCellCount).toBe(3)
    expect(
      evidence.routeSection.gridTemplateColumns
        .split(' ')
        .map((value) => value.trim())
        .filter(Boolean)
    ).toHaveLength(3)
  }

  expectBboxStable('summit-card stationary/partial', stationary.summitCard.bbox, partial.summitCard.bbox)
  expectBboxStable('key-data stationary/partial', stationary.keyData.bbox, partial.keyData.bbox)
  expectBboxStable('key-data partial/summit', partial.keyData.bbox, summit.keyData.bbox)
  expectBboxStable('route-section stationary/partial', stationary.routeSection.bbox, partial.routeSection.bbox)
  expectBboxStable('route-section partial/summit', partial.routeSection.bbox, summit.routeSection.bbox)
  expect(blockedMutations).toEqual([])

  await writeFile(
    join(OUTPUT_DIR, 'activity-route-truthfulness-375.json'),
    `${JSON.stringify({ blockedMutations, fakeSupabaseRequests: fakeSupabaseServer?.requests ?? [], fixtures: [stationary, partial, summit] }, null, 2)}\n`,
    'utf8'
  )
})
