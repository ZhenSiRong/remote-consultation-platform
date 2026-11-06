/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端接口前缀，默认走 Vite 代理的 /api */
  readonly VITE_API_BASE_URL?: string
  /** Mock 开关（K-06）：'true' 时走契约级 Mock */
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
