import { defineConfig } from '@playwright/test'
import databaseConfig from './playwright.supabase.config'

const app = databaseConfig.webServer
if (!app || Array.isArray(app)) throw new Error('Expected a single database-backed app server')

export default defineConfig({
  ...databaseConfig,
  testMatch: 'ask-ai.spec.ts',
  webServer: [
    { command: 'node e2e/fixtures/ai-server.mjs', url: 'http://127.0.0.1:4123', reuseExistingServer: false },
    {
      ...app,
      env: { ...app.env, AI_PROVIDER: 'custom', AI_BASE_URL: 'http://127.0.0.1:4123/v1', AI_API_KEY: 'local-fixture', AI_MODEL: 'local-fixture' },
    },
  ],
})
