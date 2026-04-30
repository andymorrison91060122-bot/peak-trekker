import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  createPublishedCommunityPostViaApi,
  dismissActivationChecklistIfPresent,
  listActiveMountainsViaApi,
  registerFreshUser,
} from './community.helpers'

type WaypointApiResponse = {
  waypoints?: Array<{
    id: string
    mountain_id: string
    type: string
    name: string
    description: string
    elevation: number | null
    sort_order: number
    created_at: string
  }>
  waypoint?: {
    id: string
    mountain_id: string
    type: string
    name: string
    description: string
    elevation: number | null
    sort_order: number
    created_at: string
  }
  ok?: boolean
  error?: string
}

async function openAdminContext(browser: Browser, baseURL: string, from = '/admin/mountains') {
  const adminEmail = 'qa-admin-1774068792@example.com'
  const adminPassword = 'PeakTrekker123!'
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${baseURL}/auth/login?from=${encodeURIComponent(from)}`)
  await page.getByPlaceholder('your@email.com').fill(adminEmail)
  await page.getByPlaceholder('••••••••').fill(adminPassword)
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await page.waitForURL((url) => !/\/auth\/login/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
  if (!new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(page.url())) {
    await page.goto(`${baseURL}${from}`)
  }
  return { context, page }
}

async function adminWaypointApi(page: Page, body: Record<string, unknown>) {
  const result = await page.evaluate(async (payload) => {
    const response = await fetch('/api/admin/waypoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({})),
    }
  }, body)

  if (!result.ok) {
    throw new Error(`admin waypoint api failed (${result.status}): ${JSON.stringify(result.body)}`)
  }

  return result.body as WaypointApiResponse
}

async function adminCommunityApi(page: Page, body: Record<string, unknown>) {
  const result = await page.evaluate(async (payload) => {
    const response = await fetch('/api/admin/community-moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({})),
    }
  }, body)

  if (!result.ok) {
    throw new Error(`admin community api failed (${result.status}): ${JSON.stringify(result.body)}`)
  }

  return result.body as WaypointApiResponse
}

async function findMountainByWaypointState(page: Page, adminPage: Page, root: string, wantEmpty: boolean) {
  const mountains = await listActiveMountainsViaApi(page)

  for (const mountain of mountains) {
    const payload = await adminWaypointApi(adminPage, {
      action: 'list',
      mountainId: mountain.id,
    })
    const count = payload.waypoints?.length ?? 0
    if ((wantEmpty && count === 0) || (!wantEmpty && count > 0)) {
      return mountain
    }
  }

  throw new Error(
    wantEmpty
      ? 'Expected at least one mountain without waypoints for the empty-state test.'
      : 'Expected at least one mountain with waypoints.'
  )
}

async function addWaypoint(
  adminPage: Page,
  mountainId: string,
  waypoint: {
    type: 'viewpoint' | 'supply' | 'danger' | 'turnaround' | 'campsite' | 'transport'
    name: string
    description?: string
    elevation?: number | null
  }
) {
  const payload = await adminWaypointApi(adminPage, {
    action: 'add',
    mountainId,
    waypoint,
  })

  if (!payload.waypoint?.id) {
    throw new Error(`Expected created waypoint id for ${waypoint.name}.`)
  }

  return payload.waypoint.id
}

test.describe('mountain detail waypoints display', () => {
  test('hides the section when the mountain has no waypoints', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const admin = await openAdminContext(browser, root)

    try {
      const mountain = await findMountainByWaypointState(page, admin.page, root, true)
      await page.goto(`${root}/explore/${mountain.id}`)
      await dismissActivationChecklistIfPresent(page)

      await expect(page.getByTestId('mountain-waypoints-section')).toHaveCount(0)
      await expect(page.getByText('关键点位', { exact: true })).toHaveCount(0)
    } finally {
      await admin.context.close()
    }
  })

  test('shows only populated waypoint groups and correct counts', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const admin = await openAdminContext(browser, root)
    const createdIds: string[] = []

    try {
      const targetMountain = await findMountainByWaypointState(page, admin.page, root, true)
      createdIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'viewpoint',
        name: `东线观景台-${Date.now()}`,
        description: '适合查看主峰云海和日出。',
        elevation: 3200,
      }))
      createdIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'viewpoint',
        name: `北坡观景岩-${Date.now()}`,
        description: '',
        elevation: null,
      }))
      createdIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'supply',
        name: `山腰补给点-${Date.now()}`,
        description: '可补水，建议在这里整理背包。',
        elevation: 2800,
      }))
      createdIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'danger',
        name: `碎石滑坠区-${Date.now()}`,
        description: '风大时请贴近内侧通过。',
        elevation: 3410,
      }))

      await page.goto(`${root}/explore/${targetMountain.id}`)
      await dismissActivationChecklistIfPresent(page)

      await expect(page.getByTestId('mountain-waypoints-section')).toBeVisible()
      await expect(page.getByTestId('waypoint-display-group-viewpoint')).toBeVisible()
      await expect(page.getByTestId('waypoint-display-group-supply')).toBeVisible()
      await expect(page.getByTestId('waypoint-display-group-danger')).toBeVisible()
      await expect(page.getByTestId('waypoint-display-count-viewpoint')).toHaveText('2 个')
      await expect(page.getByTestId('waypoint-display-group-turnaround')).toHaveCount(0)
      await expect(page.getByTestId('waypoint-display-group-campsite')).toHaveCount(0)
      await expect(page.getByTestId('waypoint-display-group-transport')).toHaveCount(0)
    } finally {
      for (const waypointId of createdIds) {
        await adminWaypointApi(admin.page, {
          action: 'delete',
          waypointId,
        }).catch(() => {})
      }
      await admin.context.close()
    }
  })

  test('toggles waypoint group content when the header is clicked', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const admin = await openAdminContext(browser, root)
    const createdIds: string[] = []

    try {
      const targetMountain = await findMountainByWaypointState(page, admin.page, root, true)
      createdIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'viewpoint',
        name: `折叠测试观景点-${Date.now()}`,
        description: '用于验证折叠与展开。',
        elevation: 2000,
      }))

      await page.goto(`${root}/explore/${targetMountain.id}`)
      await dismissActivationChecklistIfPresent(page)

      const toggle = page.getByTestId('waypoint-display-toggle-viewpoint')
      const list = page.getByTestId('waypoint-display-list-viewpoint')

      await expect(list).toBeVisible()
      await toggle.click()
      await expect(list).toHaveCount(0)
      await toggle.click()
      await expect(list).toBeVisible()
    } finally {
      for (const waypointId of createdIds) {
        await adminWaypointApi(admin.page, {
          action: 'delete',
          waypointId,
        }).catch(() => {})
      }
      await admin.context.close()
    }
  })

  test('renders waypoint content with optional description and elevation lines', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const admin = await openAdminContext(browser, root)
    const now = Date.now()
    const primaryName = `内容展示观景点-${now}`
    const secondaryName = `内容展示观景点空字段-${now}`
    const createdIds: string[] = []

    try {
      const targetMountain = await findMountainByWaypointState(page, admin.page, root, true)
      createdIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'viewpoint',
        name: primaryName,
        description: '这里能俯瞰整个山脊线。',
        elevation: 3666,
      }))
      createdIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'viewpoint',
        name: secondaryName,
        description: '',
        elevation: null,
      }))

      await page.goto(`${root}/explore/${targetMountain.id}`)
      await dismissActivationChecklistIfPresent(page)

      const firstCard = page.getByTestId('waypoint-display-card-viewpoint-0')
      const secondCard = page.getByTestId('waypoint-display-card-viewpoint-1')

      await expect(firstCard).toContainText('观景点')
      await expect(firstCard).toContainText(`1. ${primaryName}`)
      await expect(firstCard).toContainText('这里能俯瞰整个山脊线。')
      await expect(firstCard).toContainText('海拔 3,666 米')

      await expect(secondCard).toContainText(`2. ${secondaryName}`)
      await expect(page.getByTestId('waypoint-display-description-viewpoint-1')).toHaveCount(0)
      await expect(page.getByTestId('waypoint-display-elevation-viewpoint-1')).toHaveCount(0)
    } finally {
      for (const waypointId of createdIds) {
        await adminWaypointApi(admin.page, {
          action: 'delete',
          waypointId,
        }).catch(() => {})
      }
      await admin.context.close()
    }
  })

  test('inserts the waypoint section between weather guidance and featured posts', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000)
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await registerFreshUser(page, root, { returnTo: '/explore' })
    const admin = await openAdminContext(browser, root, '/admin/community')
    const createdWaypointIds: string[] = []
    let postId: string | null = null

    try {
      const targetMountain = await findMountainByWaypointState(page, admin.page, root, true)
      createdWaypointIds.push(await addWaypoint(admin.page, targetMountain.id, {
        type: 'viewpoint',
        name: `顺序校验观景点-${Date.now()}`,
        description: '确保关键点位插在天气和精选之间。',
        elevation: 1888,
      }))

      const post = await createPublishedCommunityPostViaApi(page, {
        mountainId: targetMountain.id,
        title: `关键点位顺序校验 ${Date.now()}`,
        body: '这条精选内容只用于校验关键点位区块的插入顺序。',
      })
      postId = post.postId
      await adminCommunityApi(admin.page, { postId, action: 'feature' })

      await page.goto(`${root}/explore/${targetMountain.id}`)
      await dismissActivationChecklistIfPresent(page)

      const order = await page.evaluate(() => {
        const weather = document.querySelector('#weather-guidance')
        const waypoints = document.querySelector('[data-testid="mountain-waypoints-section"]')
        const featured = document.querySelector('[data-testid="mountain-featured-posts-section"]')

        return {
          hasWeather: Boolean(weather),
          hasWaypoints: Boolean(waypoints),
          hasFeatured: Boolean(featured),
          weatherBeforeWaypoints: Boolean(
            weather && waypoints && (weather.compareDocumentPosition(waypoints) & Node.DOCUMENT_POSITION_FOLLOWING)
          ),
          waypointsBeforeFeatured: Boolean(
            waypoints && featured && (waypoints.compareDocumentPosition(featured) & Node.DOCUMENT_POSITION_FOLLOWING)
          ),
        }
      })

      expect(order).toEqual({
        hasWeather: true,
        hasWaypoints: true,
        hasFeatured: true,
        weatherBeforeWaypoints: true,
        waypointsBeforeFeatured: true,
      })
    } finally {
      if (postId) {
        await adminCommunityApi(admin.page, { postId, action: 'delete' }).catch(() => {})
      }
      for (const waypointId of createdWaypointIds) {
        await adminWaypointApi(admin.page, {
          action: 'delete',
          waypointId,
        }).catch(() => {})
      }
      await admin.context.close()
    }
  })
})
