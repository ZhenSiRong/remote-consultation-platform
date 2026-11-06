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
    proxy: {
      /*
       * 信令必须打到真后端（3000）。
       * 不能用 axios 走 mock：src/api/request.ts 里挂的是 axios adapter，
       * 拦不到原生 fetch / EventSource，而信令正是这两者。
       * rewrite 去掉 /api：后端控制器路径是 rtc/signal（server 没加全局前缀），
       * 若后端改成带 /api 的前缀，这里删掉 rewrite 即可，两端只需对上一边。
       */
      '/api/rtc': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
