import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// This config lives in config/; resolve all project paths from the repo root.
const root = path.resolve(__dirname, '..')

export default defineConfig({
  main: {
    build: {
      outDir: path.resolve(root, 'dist/main'),
      lib: {
        entry: path.resolve(root, 'src/main/index.ts'),
        formats: ['cjs'],
        fileName: 'index',
      },
      rollupOptions: {
        external: ['electron', 'electron-log'],
      },
    },
  },
  preload: {
    build: {
      outDir: path.resolve(root, 'dist/preload'),
      lib: {
        entry: path.resolve(root, 'src/preload/index.ts'),
        formats: ['cjs'],
        fileName: 'index',
      },
    },
  },
  renderer: {
    root: path.resolve(root, 'src/renderer'),
    build: {
      outDir: path.resolve(root, 'dist/renderer'),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src/renderer'),
        '@shared': path.resolve(root, 'src/shared'),
      },
    },
    server: {
      port: 5173,
    },
  },
})