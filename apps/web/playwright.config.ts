import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['reading.spec.ts', 'reflow.spec.ts'],
  // Isolated HTTP fixture: covers the app flow, not real Supabase/RLS.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3107', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'breakpoint', use: { ...devices['Desktop Chrome'], viewport: { width: 640, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: 'node e2e/fixtures/reading-server.mjs',
    url: 'http://localhost:3107/login',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
