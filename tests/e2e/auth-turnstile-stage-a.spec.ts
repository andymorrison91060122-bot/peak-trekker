import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'

const EVIDENCE_DIR = 'output/p1-screenshot-quota-abuse'
const ALWAYS_VISIBLE_EVIDENCE_DIR = 'output/turnstile-always-visible'
const TURNSTILE_ALWAYS_PASS_SITE_KEY = '1x00000000000000000000AA'
const TURNSTILE_SCRIPT_PREFIX = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

type AuthHarness = {
  authRequests: Array<{ url: string; body: string }>
  unexpectedMutations: string[]
}

type WidgetEvidence = {
  page: 'register' | 'login'
  wrapperBox: { x: number; y: number; width: number; height: number } | null
  iframeCountAfterVerification: number
  iframeObservedDuringLifecycle: boolean
  maximumObservedWrapperHeight: number
  responseInputPresent: boolean
  responseTokenPresent: boolean
  state: string | null
  resetKey: string | null
  horizontalOverflow: boolean
  authRequestCount: number
}

function ensureEvidenceDir() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })
}

async function installReadOnlyAuthHarness(page: Page): Promise<AuthHarness> {
  const authRequests: AuthHarness['authRequests'] = []
  const unexpectedMutations: string[] = []

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    const method = request.method()

    if (/\/api\/analytics\/event(?:\?|$)/.test(url)) {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    if (/\/api\/weather\//.test(url)) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weather unavailable in local auth harness' }),
      })
      return
    }

    if (method === 'POST' && /\/auth\/v1\/signup(?:\?|$)/.test(url)) {
      authRequests.push({ url, body: request.postData() ?? '' })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-4000-8000-000000000001',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'stage-a@example.com',
          phone: '',
          confirmation_sent_at: '2026-07-30T00:00:00.000Z',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: '2026-07-30T00:00:00.000Z',
          updated_at: '2026-07-30T00:00:00.000Z',
        }),
      })
      return
    }

    if (method === 'POST' && /\/auth\/v1\/token\?grant_type=password/.test(url)) {
      authRequests.push({ url, body: request.postData() ?? '' })
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 400,
          msg: 'Invalid login credentials',
        }),
      })
      return
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      unexpectedMutations.push(`${method} ${url}`)
      await route.abort()
      return
    }

    await route.continue()
  })

  return { authRequests, unexpectedMutations }
}

async function waitForOfficialTestWidget(page: Page) {
  const wrapper = page.getByTestId('auth-turnstile-widget')
  await expect(wrapper).toBeVisible()
  await expect(wrapper).toHaveAttribute('data-turnstile-site-key-kind', 'official-always-pass-test')
  await expect(wrapper).toHaveAttribute('data-turnstile-state', 'verified', { timeout: 30_000 })

  const responseInput = wrapper.locator('input[name="cf-turnstile-response"]')
  await expect(responseInput).toHaveCount(1)
  await expect.poll(async () => (await responseInput.inputValue()).trim().length).toBeGreaterThan(0)
}

async function widgetEvidence(page: Page, pageName: WidgetEvidence['page']): Promise<WidgetEvidence> {
  const wrapper = page.getByTestId('auth-turnstile-widget')
  const responseInput = wrapper.locator('input[name="cf-turnstile-response"]')
  const box = await wrapper.boundingBox()

  return {
    page: pageName,
    wrapperBox: box,
    iframeCountAfterVerification: await wrapper.locator('iframe').count(),
    iframeObservedDuringLifecycle: await page.evaluate(() => (
      (window as Window & {
        __ptTurnstileObservation?: { iframeSeen: boolean }
      }).__ptTurnstileObservation?.iframeSeen ?? false
    )),
    maximumObservedWrapperHeight: await page.evaluate(() => (
      (window as Window & {
        __ptTurnstileObservation?: { maximumWrapperHeight: number }
      }).__ptTurnstileObservation?.maximumWrapperHeight ?? 0
    )),
    responseInputPresent: await responseInput.count() === 1,
    responseTokenPresent: await responseInput.count() === 1 && (await responseInput.inputValue()).trim().length > 0,
    state: await wrapper.getAttribute('data-turnstile-state'),
    resetKey: await wrapper.getAttribute('data-turnstile-reset-key'),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    authRequestCount: 0,
  }
}

async function captureScriptFailure(browser: Browser, root: string) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const harness = await installReadOnlyAuthHarness(page)
  await page.route(`${TURNSTILE_SCRIPT_PREFIX}*`, (route) => route.abort('failed'))

  await page.goto(`${root}/auth/login`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('人机验证暂时无法加载，请刷新重试。')).toBeVisible()
  await expect(page.getByTestId('auth-turnstile-widget')).toHaveAttribute('data-turnstile-state', 'error')
  await page.screenshot({ path: `${EVIDENCE_DIR}/turnstile-load-error-375.png` })

  const result = {
    state: await page.getByTestId('auth-turnstile-widget').getAttribute('data-turnstile-state'),
    messageVisible: await page.getByText('人机验证暂时无法加载，请刷新重试。').isVisible(),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    unexpectedMutations: harness.unexpectedMutations,
  }
  await context.close()
  return result
}

test('official Cloudflare test widget preserves one-time auth tokens and 375px layout', async ({ browser, page, baseURL }) => {
  test.setTimeout(180_000)
  ensureEvidenceDir()
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const harness = await installReadOnlyAuthHarness(page)
  const cloudflareResponses: Array<{ url: string; status: number }> = []
  const cloudflareFailures: string[] = []
  const pageErrors: string[] = []

  page.on('response', (response) => {
    if (response.url().startsWith('https://challenges.cloudflare.com/')) {
      cloudflareResponses.push({ url: response.url(), status: response.status() })
    }
  })
  page.on('requestfailed', (request) => {
    if (request.url().startsWith('https://challenges.cloudflare.com/')) {
      cloudflareFailures.push(`${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`)
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => {
    const observation = {
      iframeSeen: false,
      maximumWrapperHeight: 0,
    }
    ;(window as Window & {
      __ptTurnstileObservation?: typeof observation
    }).__ptTurnstileObservation = observation

    const observer = new MutationObserver(() => {
      const wrapper = document.querySelector('[data-testid="auth-turnstile-widget"]')
      if (!(wrapper instanceof HTMLElement)) return
      observation.maximumWrapperHeight = Math.max(
        observation.maximumWrapperHeight,
        wrapper.getBoundingClientRect().height,
      )
      if (wrapper.querySelector('iframe')) observation.iframeSeen = true
    })
    observer.observe(document, { childList: true, subtree: true })
  })
  await page.setViewportSize({ width: 375, height: 812 })

  await page.goto(`${root}/auth/register`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', 'stage-a@example.com')
  await page.fill('input[type="password"]', 'password123')
  await page.getByRole('button', { name: '下一步 →' }).click()
  await page.fill('input[placeholder="给自己起个名字"]', '测试山友')
  await page.selectOption('select', '山东')
  await waitForOfficialTestWidget(page)

  const registerEvidence = await widgetEvidence(page, 'register')
  expect(registerEvidence.horizontalOverflow).toBe(false)
  await page.screenshot({ path: `${EVIDENCE_DIR}/register-375.png` })

  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()
  await expect(page).toHaveURL(/\/auth\/login\?registered=1$/)
  expect(harness.authRequests).toHaveLength(1)
  expect(harness.authRequests[0]?.url).toMatch(/\/auth\/v1\/signup/)
  expect(harness.authRequests[0]?.body).toContain('captcha_token')

  harness.authRequests.length = 0
  await page.goto(`${root}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', 'stage-a@example.com')
  await page.fill('input[type="password"]', 'password123')
  await waitForOfficialTestWidget(page)

  const loginEvidence = await widgetEvidence(page, 'login')
  expect(loginEvidence.horizontalOverflow).toBe(false)
  await page.screenshot({ path: `${EVIDENCE_DIR}/login-375.png` })

  const resetKeyBefore = await page.getByTestId('auth-turnstile-widget').getAttribute('data-turnstile-reset-key')
  await page.getByRole('button', { name: '▶ 开始登山' }).click()
  await expect(page.getByText('邮箱或密码错误')).toBeVisible()
  await expect(page.getByTestId('auth-turnstile-widget')).not.toHaveAttribute('data-turnstile-reset-key', resetKeyBefore ?? '')
  await expect(page.getByTestId('auth-turnstile-widget')).toHaveAttribute('data-turnstile-state', 'verified', { timeout: 30_000 })
  expect(harness.authRequests).toHaveLength(1)
  expect(harness.authRequests[0]?.url).toMatch(/\/auth\/v1\/token\?grant_type=password/)
  expect(harness.authRequests[0]?.body).toContain('captcha_token')

  const scriptFailure = await captureScriptFailure(browser, root)
  expect(scriptFailure.messageVisible).toBe(true)
  expect(scriptFailure.horizontalOverflow).toBe(false)
  expect(scriptFailure.unexpectedMutations).toEqual([])
  expect(harness.unexpectedMutations).toEqual([])
  expect(cloudflareResponses.some((entry) => (
    entry.url.startsWith(TURNSTILE_SCRIPT_PREFIX) && entry.status >= 200 && entry.status < 400
  ))).toBe(true)
  expect(cloudflareResponses.some((entry) => (
    /\/turnstile\/v0\/b\/[^/]+\/api\.js$/.test(entry.url) && entry.status === 200
  ))).toBe(true)
  expect(cloudflareFailures).toEqual([])
  expect(pageErrors.filter((message) => /content security policy|turnstile/i.test(message))).toEqual([])

  writeFileSync(
    `${EVIDENCE_DIR}/turnstile-stage-a.json`,
    `${JSON.stringify({
      mode: 'stage-a-official-cloudflare-test-widget',
      siteKey: TURNSTILE_ALWAYS_PASS_SITE_KEY,
      note: 'Official Cloudflare always-pass test widget and local Auth interception only. This is not a real Supabase CAPTCHA pass and creates no user.',
      register: { ...registerEvidence, authRequestCount: 1 },
      login: { ...loginEvidence, authRequestCount: 1 },
      scriptFailure,
      cloudflareResponses,
      cloudflareFailures,
      cspRelatedPageErrors: pageErrors.filter((message) => /content security policy|turnstile/i.test(message)),
      unexpectedMutations: harness.unexpectedMutations,
    }, null, 2)}\n`,
  )
})

test('Turnstile remains visibly rendered on login and register without submitting auth', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  mkdirSync(ALWAYS_VISIBLE_EVIDENCE_DIR, { recursive: true })
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const harness = await installReadOnlyAuthHarness(page)
  await page.setViewportSize({ width: 375, height: 812 })

  async function captureVisibleWidget(pageName: 'login' | 'register') {
    const wrapper = page.getByTestId('auth-turnstile-widget')
    const card = page.locator('.mountain-card')
    await expect(wrapper).toBeVisible()
    await expect(wrapper).toHaveAttribute('data-turnstile-site-key-kind', 'official-always-pass-test')
    await expect.poll(async () => (await wrapper.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(65)
    await expect.poll(async () => wrapper.evaluate((widget) => (
      Array.from(widget.children).some((child) => child.getBoundingClientRect().height >= 65)
    ))).toBe(true)

    const frameSamples = await page.evaluate(async () => {
      const widget = document.querySelector('[data-testid="auth-turnstile-widget"]')
      if (!(widget instanceof HTMLElement)) return []
      const samples: Array<{ height: number; contentVisible: boolean }> = []
      for (let index = 0; index < 12; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const widgetBox = widget.getBoundingClientRect()
        const contentVisible = Array.from(widget.children).some((child) => {
          const childBox = child.getBoundingClientRect()
          return childBox.width > 0 && childBox.height >= 65
        })
        samples.push({
          height: widgetBox.height,
          contentVisible,
        })
      }
      return samples
    })

    expect(frameSamples).toHaveLength(12)
    expect(frameSamples.every((sample) => sample.height >= 65 && sample.contentVisible)).toBe(true)

    await expect.poll(() => (
      page.frames().some((frame) => frame.url().includes('challenges.cloudflare.com'))
    )).toBe(true)
    const turnstileFrame = page.frames().find((frame) => frame.url().includes('challenges.cloudflare.com'))
    if (!turnstileFrame) throw new Error('Cloudflare Turnstile frame is not available.')
    const iframeBox = await turnstileFrame.frameElement().then((element) => element.boundingBox())
    const cardBox = await card.boundingBox()
    expect(iframeBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    if (!iframeBox || !cardBox) throw new Error('Turnstile iframe or auth card is not measurable.')

    const centerDelta = Math.abs(
      (iframeBox.x + iframeBox.width / 2) - (cardBox.x + cardBox.width / 2),
    )
    expect(centerDelta).toBeLessThanOrEqual(1)
    expect(iframeBox.x).toBeGreaterThanOrEqual(cardBox.x)
    expect(iframeBox.x + iframeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)

    return {
      page: pageName,
      wrapperBox: await wrapper.boundingBox(),
      iframeBox,
      cardBox,
      centerDelta,
      frameSamples,
      documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      viewportWidth: await page.evaluate(() => window.innerWidth),
      horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      formCount: await page.locator('form').count(),
      cardCount: await page.locator('.mountain-card').count(),
    }
  }

  await page.goto(`${root}/auth/login`, { waitUntil: 'domcontentloaded' })
  const login = await captureVisibleWidget('login')
  expect(login.horizontalOverflow).toBe(false)
  expect(login.formCount).toBe(1)
  expect(login.cardCount).toBe(1)
  await page.screenshot({ path: `${ALWAYS_VISIBLE_EVIDENCE_DIR}/login-375.png` })

  await page.goto(`${root}/auth/register`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', 'visibility-only@example.com')
  await page.fill('input[type="password"]', 'not-submitted')
  await page.getByRole('button', { name: '下一步 →' }).click()
  await expect(page.getByText('// REGISTER')).toBeVisible()
  const register = await captureVisibleWidget('register')
  expect(register.horizontalOverflow).toBe(false)
  expect(register.formCount).toBe(1)
  expect(register.cardCount).toBe(1)
  await page.screenshot({ path: `${ALWAYS_VISIBLE_EVIDENCE_DIR}/register-step-2-375.png` })

  expect(harness.authRequests).toEqual([])
  expect(harness.unexpectedMutations).toEqual([])
  writeFileSync(
    `${ALWAYS_VISIBLE_EVIDENCE_DIR}/evidence.json`,
    `${JSON.stringify({
      mode: 'official-cloudflare-always-pass-test-widget',
      note: 'Visual-only localhost evidence. No auth form was submitted and no user was created.',
      login,
      register,
      authRequests: harness.authRequests,
      unexpectedMutations: harness.unexpectedMutations,
    }, null, 2)}\n`,
  )
})
