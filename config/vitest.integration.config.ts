import { defineConfig } from 'vitest/config'
import path from 'node:path'

// This config lives in config/; resolve all project paths from the repo root.
const root = path.resolve(__dirname, '..')

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(root, 'src/backend/shared'),
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globals: true,
    setupFiles: ['./test/integration/setup.ts'],
    testTimeout: 30000,
  },
})