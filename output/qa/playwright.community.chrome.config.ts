import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../../tests/e2e',
  timeout: 180_000,
  expect: {
    timeout: 12_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100',
    headless: true,
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
})
