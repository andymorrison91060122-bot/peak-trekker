import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command:
      'ENABLE_QA_TEST_HELPERS=true NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS=true ADMIN_EMAILS=qa-admin-1774068792@example.com ALLOW_TREK_DEV_BYPASS=1 npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/explore',
    timeout: 120_000,
    reuseExistingServer: true,
  },
})
