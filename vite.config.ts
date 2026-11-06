import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 仓库根（`src/` 的上一级）。ESM 配置下无 `__dirname`，用 import.meta.url 反推。
const repoRoot = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // 与 tsconfig.json 的 paths 保持一致
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 契约包在仓库根 shared/，不是 src/shared（见 架构决策.md 3.1 仓库布局）
      '@rcp/shared': path.resolve(repoRoot, 'shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
})
