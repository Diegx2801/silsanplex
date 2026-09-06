import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

const localE2eEnvironment = resolve(import.meta.dirname, '.env.e2e.local')
const localFrontendEnvironment = resolve(import.meta.dirname, '.env.local')

if (existsSync(localFrontendEnvironment)) {
  loadEnvFile(localFrontendEnvironment)
}

if (existsSync(localE2eEnvironment)) {
  loadEnvFile(localE2eEnvironment)
}

const requiredE2eVariables = [
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
  'E2E_MEMBER_EMAIL',
  'E2E_MEMBER_PASSWORD',
  'E2E_RECOVERY_EMAIL',
  'E2E_RECOVERY_PASSWORD',
  'E2E_REPAIRS_EMAIL',
  'E2E_REPAIRS_PASSWORD',
  'E2E_INVENTORY_FIXTURES_BASE64',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
] as const

const missingE2eVariables = requiredE2eVariables.filter(
  (name) => !process.env[name]?.trim(),
)

if (missingE2eVariables.length > 0) {
  throw new Error(
    `Faltan variables E2E: ${missingE2eVariables.join(', ')}. ` +
      'Ejecuta npm run test:e2e:local para preparar usuarios locales o configura las variables en CI.',
  )
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
})
