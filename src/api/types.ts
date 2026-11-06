/**
 * 契约类型出口（A-07 / K-03）。
 * ApiResponse / PageQuery / PageResult / ErrorCode 的唯一来源是仓库根的 `@rcp/shared` 契约包，
 * 前端不重复定义，只做转出（vite.config.ts 与 tsconfig.json 的 paths 已指向 shared/src/index.ts）。
 *
 * 分页返回体沿用契约包的 `PageResult<T>`，字段是 `list` 不是 `items`——
 * mock 层要模拟真后端就必须吐契约形状，本地另造一套 items 会让第二段接真后端时所有列表页改字段名。
 */
export * from '@rcp/shared'
