import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index:         resolve(__dirname, 'src/main/index.js'),
          backupWorker:    resolve(__dirname, 'src/main/vorn/backupWorker.js'),
          restoreWorker:   resolve(__dirname, 'src/main/vorn/restoreWorker.js'),
          integrityWorker: resolve(__dirname, 'src/main/vorn/integrityWorker.js'),
          clearWorker:     resolve(__dirname, 'src/main/vorn/clearWorker.js'),
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [
      vue(),
      tailwindcss()
    ]
  }
})
