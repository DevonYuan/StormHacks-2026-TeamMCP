import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// This config lives in config/; resolve all project paths from the repo root.
const root = path.resolve(__dirname, '..')

export default defineConfig({
  main: {
    build: {
      outDir: path.resolve(root, 'dist/backend/main'),
      lib: {
        entry: path.resolve(root, 'src/backend/main/index.ts'),
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
      outDir: path.resolve(root, 'dist/frontend/preload'),
      lib: {
        entry: path.resolve(root, 'src/frontend/preload/index.ts'),
        formats: ['cjs'],
        fileName: 'index',
      },
    },
  },
  renderer: {
    root: path.resolve(root, 'src/frontend/renderer'),
    build: {
      outDir: path.resolve(root, 'dist/frontend/renderer'),
      // electron-vite's default entry lookup assumes <root>/src/renderer/index.html,
      // so point it at the relocated renderer explicitly.
      rollupOptions: {
        input: path.resolve(root, 'src/frontend/renderer/index.html'),
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src/frontend/renderer'),
        '@shared': path.resolve(root, 'src/backend/shared'),
      },
    },
    server: {
      port: 5173,
    },
  },
})