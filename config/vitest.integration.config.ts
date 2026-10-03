import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globals: true,
    setupFiles: ['./test/integration/setup.ts'],
    testTimeout: 30000,
  },
})