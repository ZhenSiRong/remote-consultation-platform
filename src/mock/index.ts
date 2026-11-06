import { createMockAdapter } from './adapter'
import { consultRoutes } from './consult'
import { dictRoutes } from './dict'
import { roomRoutes } from './room'

/**
 * 契约级 Mock 入口（A1 / K-06）。
 *
 * 开关由 `import.meta.env.VITE_USE_MOCK` 决定，**默认 true**（未配置即启用）；
 * 接真后端时把该环境变量置为 'false' 即可，业务代码零改动——
 * 页面调的始终是 src/api/*，mock 只是 axios adapter 的一个实现。
 *
 * 挂载点说明：src/api/request.ts 属于地基（A0），mock 层不改它。
 * 主线程会在 request.ts 里按 mockEnabled 把 `request.defaults.adapter` 换成 `mockAdapter`。
 * 本文件只负责把装配好的 adapter 导出，保证「谁挂载」与「mock 内容」解耦。
 */

/** 是否启用 mock：默认开，`VITE_USE_MOCK=false` 可关 */
export const mockEnabled = import.meta.env.VITE_USE_MOCK !== 'false'

/** 装配好的 adapter，供 src/api/request.ts 之外的地方复用 */
export const mockAdapter = createMockAdapter([...dictRoutes, ...consultRoutes, ...roomRoutes])
