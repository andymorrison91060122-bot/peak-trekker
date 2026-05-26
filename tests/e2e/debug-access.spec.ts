import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { expect, test } from '@playwright/test'
import { registerFreshUser } from './community.helpers'

const PROD_PORT = 3201
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

test('profile page shows license progress while keeping debug tools out of the formal profile', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/profile' })
  const badge = page.getByTestId('profile-license-badge')
  await expect(badge).toBeVisible()
  await badge.click()
  await expect(page.getByTestId('license-progress-sheet')).toBeVisible()
  await expect(page.getByTestId('license-progress-rung')).toHaveCount(4)
  await expect(page.getByText('开发/管理员工具')).toHaveCount(0)
  await expect(page.getByText('打开 onboarding 回归清单页')).toHaveCount(0)
})

test('debug route stays focused on QA tools and no longer renders license progress', async ({ page, baseURL }) => {
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await registerFreshUser(page, root, { returnTo: '/profile' })

  await page.goto(`${root}/debug`)
  await expect(page.getByText('执照进度', { exact: true })).toHaveCount(0)
  await expect(page.getByText('开发/管理员工具')).toBeVisible()
  await expect(page.getByRole('link', { name: '打开 onboarding 回归清单页' }).first()).toBeVisible()
})

test('debug route is not exposed to non-admin users in production mode', async ({ page }) => {
  test.setTimeout(300_000)
  await ensureProductionServer()

  await registerFreshUser(page, PROD_ROOT, { returnTo: '/profile' })

  const debugResponsePromise = page.waitForResponse((response) => response.url() === `${PROD_ROOT}/debug`)
  await page.goto(`${PROD_ROOT}/debug`, { waitUntil: 'domcontentloaded' })
  const debugResponse = await debugResponsePromise

  expect([302, 303, 307, 308, 404]).toContain(debugResponse.status())

  if (debugResponse.status() === 404) {
    await expect(page).toHaveURL(`${PROD_ROOT}/debug`)
    return
  }

  await expect(page).toHaveURL(`${PROD_ROOT}/profile`)
})
