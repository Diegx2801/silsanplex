import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Unit tests must not depend on a developer's project or credentials.
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:1',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'unit-placeholder',
    },
    environment: 'jsdom',
    exclude: ['tests/e2e/**', 'tests/accessory-e2e/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15_000,
  },
})
