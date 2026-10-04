import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'
import path from 'node:path'

// This config lives in config/; resolve all project paths from the repo root.
const root = path.resolve(__dirname, '..')

const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'electron',
]

export default defineConfig({
  build: {
    outDir: path.resolve(root, 'dist/backend/gateway'),
    lib: {
      entry: path.resolve(root, 'src/backend/gateway/index.ts'),
      formats: ['cjs'],
      fileName: 'index',
    },
    rollupOptions: {
      external: nodeExternals,
      output: {
        format: 'cjs',
        entryFileNames: 'index.js',
      },
    },
    target: 'node22',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@shared': path.resolve(root, 'src/backend/shared'),
      '@gateway': path.resolve(root, 'src/backend/gateway'),
    },
  },
})