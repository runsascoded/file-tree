import { defineConfig, devices } from '@playwright/test'

const PORT = 8731
const baseURL = `http://localhost:${PORT}`

// `http-demo` drives `site/worker`, whose R2 bindings are `remote = true`
// — `wrangler dev` needs CF credentials and live buckets. `mock-demo` is
// hermetic. `E2E_MOCK_ONLY` drops the worker server so CI can run the
// hermetic half with no secrets and no network.
const mockOnly = !!process.env.E2E_MOCK_ONLY

// Which Chromium to drive. Default is Playwright's own build, which it
// downloads into `~/Library/Caches/ms-playwright` — that's what CI does.
// `E2E_CHANNEL=chrome` runs against an already-installed Chrome instead:
// same engine, nothing to fetch, and a working local `e2e` on a machine
// where that download won't complete.
const channel = process.env.E2E_CHANNEL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
  ],
  webServer: [
    {
      command: 'pnpm build && pnpm --dir site dev',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    ...(mockOnly ? [] : [{
      command: 'pnpm --dir site/worker dev',
      url: 'http://localhost:8732/v1/files/list?prefix=',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe' as const,
      stderr: 'pipe' as const,
      timeout: 120_000,
    }]),
  ],
})
