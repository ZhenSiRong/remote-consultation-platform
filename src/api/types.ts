/**
 * 契约类型出口（A-07 / K-03）。
 * ApiResponse / PageQuery / PageResult / ErrorCode 的唯一来源是仓库根的 `@rcp/shared` 契约包，
 * 前端不重复定义，只做转出（vite.config.ts 与 tsconfig.json 的 paths 已指向 shared/src/index.ts）。
 */
export * from '@rcp/shared'
