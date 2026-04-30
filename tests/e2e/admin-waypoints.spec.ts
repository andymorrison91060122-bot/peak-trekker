import { expect, test, type Locator, type Page } from '@playwright/test'

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
  success?: boolean
  error?: string
}

async function createAdminSession(page: Page, baseURL: string) {
  const email = 'qa-admin-1774068792@example.com'
  const password = 'PeakTrekker123!'
  await page.goto(`${baseURL}/auth/login?from=${encodeURIComponent('/admin/mountains')}`)
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await page.waitForURL((url) => !/\/auth\/login/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
  if (!/\/admin\/mountains/.test(page.url())) {
    await page.goto(`${baseURL}/admin/mountains`)
  }
  await expect(page).toHaveURL(`${baseURL}/admin/mountains`)
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

async function openFirstMountainEditor(page: Page) {
  const firstEditLink = page.getByRole('link', { name: '编辑' }).first()
  await expect(firstEditLink).toBeVisible()
  const href = await firstEditLink.getAttribute('href')
  if (!href) throw new Error('Expected the first mountain edit link to contain an href.')
  await firstEditLink.click()
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  const mountainId = href.split('/').pop()
  if (!mountainId) throw new Error(`Could not parse mountain id from href: ${href}`)
  return { href, mountainId }
}

async function ensureGroupExpanded(page: Page, type: string) {
  const group = page.getByTestId(`waypoint-group-${type}`)
  const addButton = group.getByTestId(`waypoint-add-${type}`)
  if (await addButton.count() === 0 || !(await addButton.isVisible().catch(() => false))) {
    await group.getByTestId(`waypoint-toggle-${type}`).click()
  }
  await expect(addButton).toBeVisible()
  return group
}

async function findWaypointRowByName(group: Locator, name: string) {
  const rows = group.locator('[data-testid^="waypoint-row-"]')
  const rowCount = await rows.count()

  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index)
    const value = await row.getByPlaceholder('点位名称').inputValue()
    if (value === name) return row
  }

  return null
}

async function waitForWaypointRowByName(group: Locator, name: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const row = await findWaypointRowByName(group, name)
    if (row) return row
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Could not find waypoint row with name: ${name}`)
}

async function createWaypointForTest(page: Page, mountainId: string, name: string, type = 'viewpoint') {
  const payload = await adminWaypointApi(page, {
    action: 'add',
    mountainId,
    waypoint: {
      type,
      name,
      description: `${name} 描述`,
      elevation: 1888,
    },
  })

  if (!payload.waypoint) {
    throw new Error(`Expected waypoint payload after creating ${name}.`)
  }

  return payload.waypoint
}

test.describe('admin mountain waypoints', () => {
  test('mountains list exposes edit entry and opens detail page', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)

    const href = await openFirstMountainEditor(page)
    expect(href.href).toMatch(/^\/admin\/mountains\/.+/)
    await expect(page.getByTestId('admin-mountain-detail-page')).toBeVisible()
  })

  test('mountain detail page shows read-only basic info', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    await openFirstMountainEditor(page)

    const basicInfo = page.getByTestId('admin-mountain-basic-info')
    await expect(basicInfo).toBeVisible()
    await expect(basicInfo).toContainText('海拔')
    await expect(basicInfo).toContainText('最低执照')
    await expect(basicInfo).toContainText('基本信息编辑将在后续版本支持')
  })

  test('admin can add a waypoint inline', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    await openFirstMountainEditor(page)

    const uniqueName = `观景点新增-${Date.now()}`
    const group = await ensureGroupExpanded(page, 'viewpoint')
    await group.getByTestId('waypoint-add-viewpoint').click()

    const newRow = group.getByTestId('waypoint-new-viewpoint')
    await newRow.getByPlaceholder('点位名称').fill(uniqueName)
    await newRow.getByPlaceholder('点位描述').fill('用于验证 inline 新增流程')
    await newRow.getByPlaceholder('海拔(m)').fill('2333')
    await newRow.getByRole('button', { name: '保存' }).click()

    const row = await waitForWaypointRowByName(group, uniqueName)
    await expect(row).toBeVisible()
  })

  test('admin can edit an existing waypoint inline', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)

    const originalName = `观景点编辑前-${Date.now()}`
    await createWaypointForTest(page, mountainId, originalName)
    await page.reload()

    const group = await ensureGroupExpanded(page, 'viewpoint')
    const row = await waitForWaypointRowByName(group, originalName)
    await expect(row).toBeVisible()

    const updatedName = `${originalName}-已改`
    await row.getByPlaceholder('点位名称').fill(updatedName)
    await row.getByRole('button', { name: '保存' }).click()

    const updatedRow = await waitForWaypointRowByName(group, updatedName)
    await expect(updatedRow).toBeVisible()
  })

  test('admin can delete a waypoint inline', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)

    const waypointName = `观景点删除-${Date.now()}`
    await createWaypointForTest(page, mountainId, waypointName)
    await page.reload()

    const group = await ensureGroupExpanded(page, 'viewpoint')
    const row = await waitForWaypointRowByName(group, waypointName)
    await expect(row).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await row.getByRole('button', { name: `删除${waypointName}` }).click()
    await expect.poll(async () => (await findWaypointRowByName(group, waypointName)) === null).toBe(true)
  })

  test('viewpoint add button is disabled when the type reaches the limit', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)

    const prefix = `观景点上限-${Date.now()}`
    const existing = await adminWaypointApi(page, {
      action: 'list',
      mountainId,
    })
    const existingViewpoints = (existing.waypoints ?? []).filter((waypoint) => waypoint.type === 'viewpoint')
    const createdIds: string[] = []

    try {
      const missingCount = Math.max(0, 10 - existingViewpoints.length)
      for (let index = 0; index < missingCount; index += 1) {
        const payload = await adminWaypointApi(page, {
          action: 'add',
          mountainId,
          waypoint: {
            type: 'viewpoint',
            name: `${prefix}-${index}`,
            description: '上限校验',
            elevation: 1200 + index,
          },
        })
        if (payload.waypoint?.id) createdIds.push(payload.waypoint.id)
      }

      await page.reload()
      const group = await ensureGroupExpanded(page, 'viewpoint')
      const addButton = group.getByTestId('waypoint-add-viewpoint')
      await expect(addButton).toBeDisabled()
      await expect(group).toContainText('已达上限')
    } finally {
      for (const waypointId of createdIds) {
        await adminWaypointApi(page, {
          action: 'delete',
          waypointId,
        }).catch(() => {})
      }
    }
  })
})
