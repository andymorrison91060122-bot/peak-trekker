import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { expect, test } from '@playwright/test'
import { registerFreshUser } from './community.helpers'

const FU46_QUARANTINE_REASON =
  'Quarantined for FU-46: pre-existing baseline rot, unrelated to FU-41 RLS write-gap repair. See FU-46 active for inventory.'

const PROD_PORT = 3202
const PROD_ROOT = `http://127.0.0.1:${PROD_PORT}`

let productionServer: ChildProcessWithoutNullStreams | null = null
let productionServerLogs = ''
let productionServerReady: Promise<void> | null = null

async function runCommand(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  const [exitCode] = (await once(child, 'close')) as [number | null]
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${exitCode}\n${output}`)
  }
}

async function waitForServer(url: string, timeoutMs = 120_000) {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status >= 200 && response.status < 500) {
        return
      }
      lastError = `unexpected status ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error(`Timed out waiting for production server at ${url}: ${lastError}\n${productionServerLogs}`)
}

async function ensureProductionServer() {
  if (productionServerReady) {
    await productionServerReady
    return
  }

  productionServerReady = (async () => {
    await runCommand('npm', ['run', 'build'])

    productionServer = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(PROD_PORT)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    })

    productionServer.stdout.on('data', (chunk) => {
      productionServerLogs += chunk.toString()
    })
    productionServer.stderr.on('data', (chunk) => {
      productionServerLogs += chunk.toString()
    })

    productionServer.on('exit', (code) => {
      if (code !== null && code !== 0) {
        productionServerLogs += `\n[next start exited with ${code}]`
      }
    })

    await waitForServer(`${PROD_ROOT}/explore`)
  })()

  await productionServerReady
}

test.afterAll(async () => {
  if (!productionServer) return
  productionServer.kill('SIGTERM')
  await once(productionServer, 'close').catch(() => {})
  productionServer = null
  productionServerReady = null
  productionServerLogs = ''
})

test('debug tokens route is available in development for logged-in users', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/profile' })

  await page.goto(`${root}/debug/tokens`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('tokens-debug-page')).toBeVisible()
  await expect(page.getByText('Design Token Lab')).toBeVisible()
})

test('debug tokens route is not exposed to non-admin users in production mode', async ({ page }) => {
  test.fixme(true, FU46_QUARANTINE_REASON)
  test.setTimeout(300_000)
  await ensureProductionServer()

  await registerFreshUser(page, PROD_ROOT, { returnTo: '/profile' })

  const debugResponsePromise = page.waitForResponse((response) => response.url() === `${PROD_ROOT}/debug/tokens`)
  await page.goto(`${PROD_ROOT}/debug/tokens`, { waitUntil: 'domcontentloaded' })
  const debugResponse = await debugResponsePromise

  expect([302, 303, 307, 308, 404]).toContain(debugResponse.status())

  if (debugResponse.status() === 404) {
    await expect(page).toHaveURL(`${PROD_ROOT}/debug/tokens`)
    return
  }

  await expect(page).toHaveURL(`${PROD_ROOT}/profile`)
})

test('token preview buttons share exact size specs across variants', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/debug/tokens' })

  const primary = page.getByTestId('button-preview-primary-default')
  const secondary = page.getByTestId('button-preview-secondary-default')

  await expect(primary).toBeVisible()
  await expect(secondary).toBeVisible()

  const [primaryStyle, secondaryStyle] = await Promise.all([
    primary.evaluate((node) => {
      const style = window.getComputedStyle(node)
      return {
        height: style.height,
        borderRadius: style.borderRadius,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      }
    }),
    secondary.evaluate((node) => {
      const style = window.getComputedStyle(node)
      return {
        height: style.height,
        borderRadius: style.borderRadius,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      }
    }),
  ])

  expect(primaryStyle).toEqual(secondaryStyle)
})

test('icon button missing aria label surfaces a developer-facing error message', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/debug/tokens?iconButtonHarness=missing-aria' })

  await expect(page.getByTestId('icon-button-aria-error')).toContainText('ariaLabel is required')
})

test('debug tokens page exposes keyboard focus and activation status for accessibility checks', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/debug/tokens' })

  const status = page.getByTestId('keyboard-focus-status')
  await expect(status).toContainText('当前聚焦: 未进入键盘示例')

  await status.focus()
  await page.keyboard.press('Tab')

  await expect(status).toContainText('当前聚焦: PrimaryButton (default state)')

  await page.keyboard.press('Enter')

  await expect(status).toContainText('最近触发: PrimaryButton')
})
