import { expect, test, type Page } from '@playwright/test'
import {
  backdateTrekSessionForTest,
  buildTrekTestTrackPoints,
  countApprovedCheckinsForSession,
  createGpsCheckinViaApi,
  deleteTestMountainById,
  dismissActivationChecklistIfPresent,
  fetchMostPopularMountain,
  registerFreshUser,
  seedTestMountain,
} from './community.helpers'

type TestMountain = {
  id: string
  name: string
  latitude: number
  longitude: number
  altitude: number
}

type TrekActionResult = {
  ok: boolean
  status: number
  body: Record<string, unknown>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function loadOrSeedMountain() {
  try {
    const mountain = await fetchMostPopularMountain()
    return { mountain, cleanupMountainId: null }
  } catch {
    const mountain = await seedTestMountain()
    return { mountain, cleanupMountainId: mountain.id }
  }
}

async function prepareAuthenticatedUser(page: Page, baseURL: string) {
  await registerFreshUser(page, baseURL, { returnTo: '/trek' })
  await dismissActivationChecklistIfPresent(page)
}

async function postTrekAction(page: Page, data: Record<string, unknown>): Promise<TrekActionResult> {
  const response = await page.request.post('/api/trek/actions', { data })
  return {
    ok: response.ok(),
    status: response.status(),
    body: await response.json().catch(() => ({})),
  }
}

function expectServerSessionId(sessionId: unknown): asserts sessionId is string {
  expect(typeof sessionId).toBe('string')
  expect(String(sessionId)).toMatch(UUID_PATTERN)
  expect(String(sessionId).startsWith('local-')).toBe(false)
}

async function startSession(page: Page, mountainId?: string) {
  const result = await postTrekAction(page, {
    action: 'start_trek_session',
    ...(mountainId ? { mountainId } : {}),
  })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  expectServerSessionId(result.body.sessionId)
  return result.body.sessionId
}

async function appendPoints(page: Page, sessionId: string, points: ReturnType<typeof buildTrekTestTrackPoints>) {
  for (const point of points) {
    const result = await postTrekAction(page, {
      action: 'append_trek_point',
      sessionId,
      point,
    })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.ok).toBe(true)
  }
}

async function verifySummit(
  page: Page,
  {
    sessionId,
    mountainId,
    points,
    startedAt = Date.now() - 120_000,
    testMode = false,
  }: {
    sessionId: string
    mountainId?: string
    points: ReturnType<typeof buildTrekTestTrackPoints>
    startedAt?: number
    testMode?: boolean
  }
) {
  return postTrekAction(page, {
    action: 'verify_summit_checkin',
    sessionId,
    ...(mountainId ? { mountainId } : {}),
    ...(testMode ? { testMode } : {}),
    note: `server-session-${Date.now()}`,
    startedAt,
    trackPoints: points,
  })
}

async function finishSession(page: Page, sessionId: string) {
  await postTrekAction(page, {
    action: 'finish_trek_session',
    sessionId,
  }).catch(() => undefined)
}

async function pauseSession(page: Page, sessionId: string, elapsedSeconds: number) {
  return postTrekAction(page, {
    action: 'pause_trek_session',
    sessionId,
    elapsedSeconds,
  })
}

async function resumeSession(page: Page, sessionId: string) {
  return postTrekAction(page, {
    action: 'resume_trek_session',
    sessionId,
  })
}

async function getInProgressSession(page: Page) {
  return postTrekAction(page, {
    action: 'get_in_progress_trek_session',
  })
}

test.describe('trek server session', () => {
  let mountain: TestMountain
  let cleanupMountainId: string | null

  test.beforeAll(async () => {
    const loaded = await loadOrSeedMountain()
    mountain = loaded.mountain
    cleanupMountainId = loaded.cleanupMountainId
  })

  test.afterAll(async () => {
    if (cleanupMountainId) {
      await deleteTestMountainById(cleanupMountainId).catch(() => undefined)
    }
  })

  test('happy path creates an approved GPS checkin through a server session', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)

    const checkinId = await createGpsCheckinViaApi(page, mountain, `server-session-happy-${Date.now()}`)

    expect(checkinId).toMatch(UUID_PATTERN)
  })

  test('duplicate submit returns the same approved checkin for the same server session', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page, mountain.id)
    const points = buildTrekTestTrackPoints(mountain)

    try {
      await appendPoints(page, sessionId, points)
      await backdateTrekSessionForTest(sessionId, 120_000)

      const first = await verifySummit(page, { sessionId, mountainId: mountain.id, points })
      expect(first.status, JSON.stringify(first.body)).toBe(200)
      expect(String(first.body.checkinId ?? '')).toMatch(UUID_PATTERN)

      const second = await verifySummit(page, { sessionId, mountainId: mountain.id, points })
      expect(second.status, JSON.stringify(second.body)).toBe(200)
      expect(second.body.duplicated).toBe(true)
      expect(second.body.checkinId).toBe(first.body.checkinId)
      await expect.poll(() => countApprovedCheckinsForSession(sessionId)).toBe(1)
    } finally {
      await finishSession(page, sessionId)
    }
  })

  test('concurrent submit creates only one approved checkin for the same server session', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page, mountain.id)
    const points = buildTrekTestTrackPoints(mountain)

    try {
      await appendPoints(page, sessionId, points)
      await backdateTrekSessionForTest(sessionId, 120_000)

      const [first, second] = await Promise.all([
        verifySummit(page, { sessionId, mountainId: mountain.id, points }),
        verifySummit(page, { sessionId, mountainId: mountain.id, points }),
      ])

      expect(first.status, JSON.stringify(first.body)).toBe(200)
      expect(second.status, JSON.stringify(second.body)).toBe(200)

      const checkinIds = [first.body.checkinId, second.body.checkinId].map(String)
      expect(checkinIds[0]).toMatch(UUID_PATTERN)
      expect(checkinIds[1]).toBe(checkinIds[0])
      expect([first.body.duplicated, second.body.duplicated].filter(Boolean)).toHaveLength(1)
      await expect.poll(() => countApprovedCheckinsForSession(sessionId)).toBe(1)
    } finally {
      await finishSession(page, sessionId)
    }
  })

  test('insufficient track points fails before summit verification', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page, mountain.id)
    const points = buildTrekTestTrackPoints(mountain, { count: 3 })

    try {
      await appendPoints(page, sessionId, points)
      await backdateTrekSessionForTest(sessionId, 120_000)

      const result = await verifySummit(page, { sessionId, mountainId: mountain.id, points })
      expect(result.status).toBe(422)
      expect(result.body.error).toBe('insufficient_track_points')
    } finally {
      await finishSession(page, sessionId)
    }
  })

  test('short server session fails duration validation', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page, mountain.id)
    const points = buildTrekTestTrackPoints(mountain)

    try {
      await appendPoints(page, sessionId, points)

      const result = await verifySummit(page, {
        sessionId,
        mountainId: mountain.id,
        points,
        startedAt: Date.now() - 10_000,
      })
      expect(result.status).toBe(422)
      expect(result.body.error).toBe('session_too_short')
    } finally {
      await finishSession(page, sessionId)
    }
  })

  test('missing mountainId uses nearest fallback in dev and QA env', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page)
    const points = buildTrekTestTrackPoints(mountain)

    try {
      await appendPoints(page, sessionId, points)
      await backdateTrekSessionForTest(sessionId, 120_000)

      const result = await verifySummit(page, { sessionId, points, testMode: true })
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      expect(String(result.body.checkinId ?? '')).toMatch(UUID_PATTERN)
      expect((result.body.mountain as { id?: string } | undefined)?.id).toBe(mountain.id)
    } finally {
      await finishSession(page, sessionId)
    }
  })

  test('outside summit radius rejects a server session checkin', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page, mountain.id)
    const points = buildTrekTestTrackPoints(mountain, { offsetMeters: 650 })

    try {
      await appendPoints(page, sessionId, points)
      await backdateTrekSessionForTest(sessionId, 120_000)

      const result = await verifySummit(page, { sessionId, mountainId: mountain.id, points })
      expect(result.status).toBe(422)
      expect(result.body.error).toBe('outside_summit_radius')
      expect(result.body.maxMeters).toBe(300)
      expect(Number(result.body.distanceMeters)).toBeGreaterThan(300)
    } finally {
      await finishSession(page, sessionId)
    }
  })

  test('pause_trek_session persists clamped elapsed and restore returns paused session', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page, mountain.id)
    const points = buildTrekTestTrackPoints(mountain, { count: 1 })

    try {
      await appendPoints(page, sessionId, points)

      const pause = await pauseSession(page, sessionId, 999_999_999)
      expect(pause.status, JSON.stringify(pause.body)).toBe(200)
      expect(pause.body.status).toBe('paused')
      expect(pause.body.pausedElapsedSeconds).toBe(86_400)

      const pausedAppend = await postTrekAction(page, {
        action: 'append_trek_point',
        sessionId,
        point: buildTrekTestTrackPoints(mountain, { count: 1 })[0],
      })
      expect(pausedAppend.status).toBe(409)
      expect(pausedAppend.body.error).toBe('session is not tracking')

      const restore = await getInProgressSession(page)
      expect(restore.status, JSON.stringify(restore.body)).toBe(200)
      const restoredSession = restore.body.session as Record<string, unknown>
      expect(restoredSession.status).toBe('paused')
      expect(restoredSession.sessionId).toBe(sessionId)
      expect(restoredSession.pausedElapsedSeconds).toBe(86_400)
      expect(typeof restoredSession.pausedAt).toBe('string')
    } finally {
      await finishSession(page, sessionId)
    }
  })

  test('resume_trek_session resumes paused sessions and supports multiple pause cycles', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await prepareAuthenticatedUser(page, root)
    const sessionId = await startSession(page, mountain.id)

    try {
      const firstPause = await pauseSession(page, sessionId, 120)
      expect(firstPause.status, JSON.stringify(firstPause.body)).toBe(200)
      expect(firstPause.body.status).toBe('paused')
      expect(firstPause.body.pausedElapsedSeconds).toBe(120)

      const firstResume = await resumeSession(page, sessionId)
      expect(firstResume.status, JSON.stringify(firstResume.body)).toBe(200)
      expect(firstResume.body.status).toBe('tracking')
      expect(typeof firstResume.body.startedAt).toBe('string')

      const trackingRestore = await getInProgressSession(page)
      expect(trackingRestore.status, JSON.stringify(trackingRestore.body)).toBe(200)
      expect((trackingRestore.body.session as Record<string, unknown>).status).toBe('tracking')

      const secondPause = await pauseSession(page, sessionId, 145)
      expect(secondPause.status, JSON.stringify(secondPause.body)).toBe(200)
      expect(secondPause.body.status).toBe('paused')
      expect(secondPause.body.pausedElapsedSeconds).toBe(145)

      const pausedRestore = await getInProgressSession(page)
      expect(pausedRestore.status, JSON.stringify(pausedRestore.body)).toBe(200)
      expect((pausedRestore.body.session as Record<string, unknown>).status).toBe('paused')
      expect((pausedRestore.body.session as Record<string, unknown>).pausedElapsedSeconds).toBe(145)

      const secondResume = await resumeSession(page, sessionId)
      expect(secondResume.status, JSON.stringify(secondResume.body)).toBe(200)
      expect(secondResume.body.status).toBe('tracking')
    } finally {
      await finishSession(page, sessionId)
    }
  })
})
