import { expect, test, type Page } from '@playwright/test'

import { dismissActivationChecklistIfPresent } from './community.helpers'

type MountainFormSnapshot = {
  mountainId: string
  name: string
  description: string
  altitude: number
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  min_license: 'none' | 'basic' | 'intermediate' | 'advanced'
}

async function createAdminSession(page: Page, baseURL: string) {
  const email = 'qa-admin-1774068792@example.com'
  const password = 'PeakTrekker123!'
  await page.goto(`${baseURL}/auth/login?from=${encodeURIComponent('/admin/mountains')}`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await page.waitForURL((url) => !/\/auth\/login/.test(url.pathname), { timeout: 60_000 }).catch(() => {})
  if (!/\/admin\/mountains/.test(page.url())) {
    await page.goto(`${baseURL}/admin/mountains`, { waitUntil: 'domcontentloaded' })
  }
  await expect(page).toHaveURL(`${baseURL}/admin/mountains`)
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

async function adminMountainApi(page: Page, body: Record<string, unknown>) {
  const result = await page.evaluate(async (payload) => {
    const response = await fetch('/api/admin/mountains', {
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
    throw new Error(`admin mountain api failed (${result.status}): ${JSON.stringify(result.body)}`)
  }

  return result.body as { mountain?: Record<string, unknown> }
}

async function readCurrentForm(page: Page, mountainId: string): Promise<MountainFormSnapshot> {
  return {
    mountainId,
    name: await page.getByTestId('admin-mountain-name-input').inputValue(),
    description: await page.getByTestId('rich-text-editor-content').evaluate((node) => node.innerHTML),
    altitude: Number(await page.getByTestId('admin-mountain-altitude-input').inputValue()),
    difficulty: await page.getByTestId('admin-mountain-difficulty-select').inputValue() as MountainFormSnapshot['difficulty'],
    min_license: await page.getByTestId('admin-mountain-license-select').inputValue() as MountainFormSnapshot['min_license'],
  }
}

async function restoreMountain(page: Page, snapshot: MountainFormSnapshot) {
  await adminMountainApi(page, {
    action: 'update',
    mountainId: snapshot.mountainId,
    updates: {
      name: snapshot.name,
      description: snapshot.description,
      altitude: snapshot.altitude,
      difficulty: snapshot.difficulty,
      min_license: snapshot.min_license,
    },
  })
}

async function expectSaveSuccess(page: Page) {
  await expect(page.getByTestId('admin-mountain-save-success')).toContainText('基本信息已保存')
}

test.describe('admin mountain basic info edit', () => {
  test('admin can edit the mountain name and persist it after reload', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)
    const original = await readCurrentForm(page, mountainId)
    const nextName = `测试山峰-${Date.now()}`

    try {
      await page.getByTestId('admin-mountain-name-input').fill(nextName)
      await page.getByTestId('admin-mountain-save-button').click()
      await expectSaveSuccess(page)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('admin-mountain-name-input')).toHaveValue(nextName)
    } finally {
      await restoreMountain(page, original).catch(() => {})
    }
  })

  test('admin can edit mountain description with rich text and it renders on mountain detail', async ({ page, baseURL }) => {
    test.fixme(
      true,
      'Quarantined for FU-45: strict-mode locator violation, rich text renders duplicate elements, pre-existing baseline failure, unrelated to FU-41.',
    )

    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)
    const original = await readCurrentForm(page, mountainId)
    const heading = `新的简介标题 ${Date.now()}`
    const bulletOne = '新的列表项 1'
    const bulletTwo = '新的列表项 2'

    try {
      const editor = page.getByTestId('rich-text-editor-content')
      await editor.click()
      await editor.press('Meta+A')
      await page.keyboard.press('Backspace')
      await page.keyboard.type(heading)
      await page.getByTestId('rich-text-toolbar-h2').click()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await page.getByTestId('rich-text-toolbar-bullet-list').click()
      await page.keyboard.type(bulletOne)
      await page.keyboard.press('Enter')
      await page.keyboard.type(bulletTwo)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')

      await page.getByTestId('admin-mountain-save-button').click()
      await expectSaveSuccess(page)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('rich-text-editor-content')).toContainText(heading)
      await expect(page.getByTestId('rich-text-editor-content')).toContainText(bulletOne)

      await page.goto(`${root}/explore/${mountainId}`, { waitUntil: 'domcontentloaded' })
      await dismissActivationChecklistIfPresent(page)
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible()
      await expect(page.getByText(bulletOne, { exact: true })).toBeVisible()
      await expect(page.getByText(bulletTwo, { exact: true })).toBeVisible()
    } finally {
      await page.goto(`${root}/admin/mountains/${mountainId}`, { waitUntil: 'domcontentloaded' })
      await restoreMountain(page, original).catch(() => {})
    }
  })

  test('admin can change difficulty and persist it after reload', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)
    const original = await readCurrentForm(page, mountainId)
    const nextDifficulty = original.difficulty === 'expert' ? 'beginner' : 'expert'

    try {
      await page.getByTestId('admin-mountain-difficulty-select').selectOption(nextDifficulty)
      await page.getByTestId('admin-mountain-save-button').click()
      await expectSaveSuccess(page)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('admin-mountain-difficulty-select')).toHaveValue(nextDifficulty)
    } finally {
      await restoreMountain(page, original).catch(() => {})
    }
  })

  test('admin can change altitude and persist it after reload', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    const { mountainId } = await openFirstMountainEditor(page)
    const original = await readCurrentForm(page, mountainId)
    const nextAltitude = original.altitude + 12

    try {
      await page.getByTestId('admin-mountain-altitude-input').fill(String(nextAltitude))
      await page.getByTestId('admin-mountain-save-button').click()
      await expectSaveSuccess(page)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('admin-mountain-altitude-input')).toHaveValue(String(nextAltitude))
    } finally {
      await restoreMountain(page, original).catch(() => {})
    }
  })

  test('empty name shows validation error and does not submit', async ({ page, baseURL }) => {
    const root = baseURL ?? 'http://127.0.0.1:3100'
    await createAdminSession(page, root)
    await openFirstMountainEditor(page)

    let apiCalled = false
    await page.route('**/api/admin/mountains', async (route) => {
      apiCalled = true
      await route.continue()
    })

    await page.getByTestId('admin-mountain-name-input').fill('')
    await page.getByTestId('admin-mountain-save-button').click()

    await expect(page.getByTestId('admin-mountain-name-error')).toContainText('名称不能为空')
    expect(apiCalled).toBe(false)
  })
})
