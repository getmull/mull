import { defineConfig, devices } from '@playwright/test'

const url = process.env.MULL_TEST_SUPABASE_URL
const anonKey = process.env.MULL_TEST_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Set MULL_TEST_SUPABASE_URL and MULL_TEST_SUPABASE_ANON_KEY for the isolated local database.')
const endpoint = new URL(url)
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
  throw new Error('Database verification is restricted to a local Supabase instance.')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'supabase.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3117',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [{ name: 'supabase', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --port 3117',
    url: 'http://localhost:3117/login',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3117',
      AI_PROVIDER: '',
      PORT: '3117',
    },
  },
})
